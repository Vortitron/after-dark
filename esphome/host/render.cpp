/*
 * render.cpp - runs a saver from components/after_dark on the desktop and
 * writes its frames out, so the ports can be checked without a board.
 *
 *   make -C esphome/host
 *   esphome/host/render toasters 320x240 150 out/   # saver screen frames dir
 *
 * The screen is WxH for colour, WxHm for a 1-bit OLED, or lcdCxR for a
 * character LCD (drawn as a blue 1602 would look, from font5x8.h).
 *
 * Frames go to <dir>/NNNN.ppm (with AD_EVERY=n set, only every nth and the last). For pixel screens it also reports the box of
 * changed pixels per frame, which is what the ILI9xxx driver pushes over SPI,
 * as a rough guide to the frame rate a real panel would manage.
 */
#include "../components/after_dark/ad_core.h"
#include "../components/after_dark/ad_text.h"
#include "font5x8.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <memory>
#include <vector>

using namespace adcore;

class HostSurface : public Surface {
 public:
  HostSurface(int w, int h, bool mono) : w_(w), h_(h), mono_(mono), rgb_(w * h * 3, 0) { reset_dirty(); }
  int width() const override { return w_; }
  int height() const override { return h_; }
  bool mono() const override { return mono_; }
  void pixel(int x, int y, Rgb c) override {
    if (x < 0 || y < 0 || x >= w_ || y >= h_) {
      fprintf(stderr, "pixel out of bounds: %d,%d\n", x, y);
      abort();
    }
    if (mono_)
      c = mono_on(x, y, c) ? Rgb{255, 255, 255} : BLACK;
    uint8_t *p = &rgb_[(y * w_ + x) * 3];
    if (p[0] == c.r && p[1] == c.g && p[2] == c.b)
      return;  // the ESPHome buffers skip unchanged pixels too
    p[0] = c.r;
    p[1] = c.g;
    p[2] = c.b;
    if (x < x0_) x0_ = x;
    if (y < y0_) y0_ = y;
    if (x > x1_) x1_ = x;
    if (y > y1_) y1_ = y;
  }
  /* Pixels in the box that changed since the last call. */
  long take_dirty() {
    long n = x1_ < x0_ ? 0 : (long) (x1_ - x0_ + 1) * (y1_ - y0_ + 1);
    reset_dirty();
    return n;
  }
  bool write_ppm(const char *path) const {
    FILE *f = fopen(path, "wb");
    if (!f)
      return false;
    fprintf(f, "P6\n%d %d\n255\n", w_, h_);
    fwrite(rgb_.data(), 1, rgb_.size(), f);
    fclose(f);
    return true;
  }

 private:
  void reset_dirty() {
    x0_ = y0_ = 1 << 30;
    x1_ = y1_ = -1;
  }
  int w_, h_;
  bool mono_;
  std::vector<uint8_t> rgb_;
  int x0_, y0_, x1_, y1_;
};

/* The clocks get the time the render started, moving on with the frames, so a
   run comes out the same at any hour if AD_TIME is set (seconds since 1970). */
time_t clock_start;
double clock_elapsed = 0;
bool host_time(Clock &c) {
  time_t t = clock_start + (time_t) clock_elapsed;
  struct tm tm;
  localtime_r(&t, &tm);
  c = {tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday, tm.tm_wday, tm.tm_hour, tm.tm_min, tm.tm_sec};
  return true;
}

int every = 1;
bool keep(int i, int frames) { return i % every == 0 || i == frames - 1; }

/* A character LCD as a picture: 3x3 px dots on a 4 px pitch, a dot's gap
   between cells, white on blue. Custom glyphs come from the screen, the rest
   from font5x8.h. */
bool write_lcd(const TextScreen &t, const char *path) {
  const int D = 4, CW = 6 * D, CH = 9 * D, B = 12;
  int w = t.cols() * CW - D + 2 * B, h = t.rows() * CH - D + 2 * B;
  std::vector<uint8_t> rgb(w * h * 3);
  for (int i = 0; i < w * h; i++) {
    rgb[i * 3] = 20;
    rgb[i * 3 + 1] = 50;
    rgb[i * 3 + 2] = 200;
  }
  for (int r = 0; r < t.rows(); r++)
    for (int c = 0; c < t.cols(); c++) {
      uint8_t code = t.at(c, r);
      const uint8_t *bits = code < 8 ? t.glyph_bits(code) : FONT5X8[code];
      for (int y = 0; y < 8; y++)
        for (int x = 0; x < 5; x++) {
          bool on = bits[y] & (0x10 >> x);
          for (int j = 0; j < D - 1; j++)
            for (int i = 0; i < D - 1; i++) {
              uint8_t *p = &rgb[((B + r * CH + y * D + j) * w + B + c * CW + x * D + i) * 3];
              p[0] = on ? 235 : 32;
              p[1] = on ? 240 : 72;
              p[2] = on ? 255 : 230;
            }
        }
    }
  FILE *f = fopen(path, "wb");
  if (!f)
    return false;
  fprintf(f, "P6\n%d %d\n255\n", w, h);
  fwrite(rgb.data(), 1, rgb.size(), f);
  fclose(f);
  return true;
}

int run_lcd(const SaverEntry *e, int cols, int rows, int frames, const char *dir, float fps) {
  if (!e->make_text) {
    fprintf(stderr, "%s has no character LCD version\n", e->name);
    return 2;
  }
  TextScreen t;
  t.begin(cols, rows);
  std::unique_ptr<TextSaver> saver(e->make_text());
  saver->start(t);
  t.mark_sent();
  long glyphs = 0, pushes = 0;
  char path[1024];
  for (int i = 0; i < frames; i++) {
    saver->frame(t, 1 / fps);
    clock_elapsed += 1 / fps;
    if (t.changed()) {
      pushes++;
      for (int g = 0; g < TextScreen::GLYPHS; g++)
        glyphs += t.glyph_changed(g);
    }
    snprintf(path, sizeof path, "%s/%04d.ppm", dir, i);
    if (keep(i, frames) && !write_lcd(t, path)) {
      fprintf(stderr, "cannot write %s\n", path);
      return 1;
    }
    t.mark_sent();
  }
  printf("%s lcd %dx%d: pushed %ld of %d frames, %.1f glyph reloads a push\n", e->name, cols, rows, pushes,
         frames, pushes ? (double) glyphs / pushes : 0.0);
  return 0;
}

int main(int argc, char **argv) {
  if (getenv("AD_EVERY"))
    every = atoi(getenv("AD_EVERY")) > 0 ? atoi(getenv("AD_EVERY")) : 1;
  clock_start = getenv("AD_TIME") ? (time_t) atoll(getenv("AD_TIME")) : time(nullptr);
  time_source = host_time;
  if (argc < 5) {
    fprintf(stderr, "usage: %s saver WxH[m]|lcdCxR frames outdir [fps] [seed]\nsavers:", argv[0]);
    for (const SaverEntry *s = first_saver(); s; s = s->next)
      fprintf(stderr, " %s", s->name);
    fprintf(stderr, "\n");
    return 2;
  }
  const SaverEntry *e = find_saver(argv[1]);
  if (!e) {
    fprintf(stderr, "no saver called %s\n", argv[1]);
    return 2;
  }
  const char *screen = argv[2];
  int frames = atoi(argv[3]);
  const char *dir = argv[4];
  float fps = argc > 5 ? atof(argv[5]) : 30;
  rng.seed(argc > 6 ? strtoul(argv[6], nullptr, 10) : 1);

  int w = 0, h = 0;
  if (sscanf(screen, "lcd%dx%d", &w, &h) == 2)
    return run_lcd(e, w, h, frames, dir, fps);
  if (sscanf(screen, "%dx%d", &w, &h) != 2) {
    fprintf(stderr, "bad screen %s\n", screen);
    return 2;
  }
  bool mono = screen[strlen(screen) - 1] == 'm';

  HostSurface surface(w, h, mono);
  std::unique_ptr<Saver> saver(e->make());
  saver->start(surface);
  surface.take_dirty();

  long total = 0, worst = 0;
  char path[1024];
  for (int i = 0; i < frames; i++) {
    saver->frame(surface, 1 / fps);
    clock_elapsed += 1 / fps;
    long d = surface.take_dirty();
    total += d;
    if (d > worst)
      worst = d;
    snprintf(path, sizeof path, "%s/%04d.ppm", dir, i);
    if (keep(i, frames) && !surface.write_ppm(path)) {
      fprintf(stderr, "cannot write %s\n", path);
      return 1;
    }
  }
  double avg = (double) total / frames;
  /* 16 bits a pixel at 40 MHz, ignoring command overhead. */
  printf("%s %s: dirty box avg %.0f px (%.0f%% of screen), worst %ld px; "
         "~%.1f ms/frame on 40 MHz SPI\n",
         e->name, screen, avg, 100 * avg / (w * h), worst, avg * 16 / 40e3);
  return 0;
}
