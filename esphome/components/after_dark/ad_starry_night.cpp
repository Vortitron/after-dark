/*
 * ad_starry_night.cpp - Starry Night, the one After Dark falls back on. A
 * port of all/modules/starry-night.js, which follows STARRYNI.AD's own code
 * step by step; see that file for the disassembly and what it was checked
 * against.
 *
 * Defaults are the module's: 27 buildings, 34% high, the flasher on.
 *
 * The web version keeps the whole sky in an image and lays the shooting star
 * over it each frame. A Surface can't be read back, so this keeps the sky as
 * one byte a pixel (palette indices: black, the flasher, a yellow for each
 * building, then the stars), which is what the shooting star is erased back
 * to. Star colours are rounded to the 6x6x6 cube that leaves room for (5x5x5
 * with 100 buildings); that is the only loss. 77 KB at 320x240.
 *
 * Small screens: the module's frame does a fixed amount of work (a star,
 * eighty black pixels, fifteen window spots) however big the screen is, so
 * at the web version's 240 frames a second a 128x64 sky would churn nine
 * times faster than a 320x240 one. The sky's rate goes with the screen's
 * area instead, so stars live as long and the city fills in as fast as at
 * 320x240. The shooting star keeps the full rate (it comes as often and
 * crosses as quickly) and is the art shrunk to 1/2 or 1/4 and baked to white
 * on a 1-bit panel, its steps shrunk with it. On a 1-bit panel the flasher and
 * every building's windows are white: the dark red would dither to nothing,
 * and the dimmer yellows at the back would lose whole buildings to the dither.
 *
 * On a character LCD (StarryText) the city is redrawn in 5x8 cells: window
 * glyphs that light and go dark, ROM dots for stars, the flasher and a
 * shooting star.
 *
 * The meteor's two frames are stacked in meteor.png:
 *
 *   art2c.py all/art/starryni starry_night --cells meteor=32x32 -o ad_art_starry_night.h
 *   art2c.py all/art/starryni starry_night_mN --cells meteor=32x32 --scale 1/N \
 *       --mono --threshold 30 --edge 999 -o ad_art_starry_night_mN.h     (N = 2, 4)
 */
#if defined(AD_SAVER_STARRY_NIGHT) || defined(AD_ALL_SAVERS)
#include "ad_art.h"
#include "ad_draw.h"
#include "ad_text.h"
#include "ad_art_starry_night.h"
#ifndef AD_COLOUR_ONLY  // a colour build leaves the 1-bit art out
#include "ad_art_starry_night_m2.h"
#include "ad_art_starry_night_m4.h"
#endif

#include <vector>

namespace adcore {

namespace {

/* Eight window patterns, eight rows of eight bits each (bit n is x + n). */
const uint8_t PATTERNS[64] = {
    0x00, 0x00, 0x00, 0x66, 0x66, 0x00, 0x00, 0x00, 0x00, 0x00, 0x44, 0x44, 0x00, 0x00, 0x44, 0x44,
    0x88, 0x88, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc6, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc6,
    0x00, 0x00, 0x54, 0x54, 0x54, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x48, 0x48, 0x48, 0x48, 0x00,
    0x00, 0x00, 0x00, 0x54, 0x00, 0x00, 0x00, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x01, 0x00, 0x00};
const float RATE = 240;  // module frames a second at 320x240 (see starry-night.js)
const int MAX_BUILDINGS = 100;

/* Palette indices in the sky buffer. */
enum { P_BLACK = 0, P_FLASH = 1, P_BUILDING = 2 };

int rnd(int n) { return n > 0 ? (int) (rng.uniform() * n) : 0; }
/* The min of two rolls, which is how the module leans things to the top. */
int low(int n) {
  int a = rnd(n), b = rnd(n);
  return a < b ? a : b;
}

struct Building {
  int x, y, w, style;
};

struct MeteorArt {
  const Art *art;
  float scale;
  int min_height;  // for a 1-bit screen at least this tall
};
const MeteorArt METEORS[] = {
#ifndef AD_COLOUR_ONLY
    {&art_starry_night_m2::ART, 1 / 2.0f, 128},
    {&art_starry_night_m4::ART, 1 / 4.0f, 0},
#endif
};

class StarryNight : public Saver {
 public:
  int count = 27;
  float tall = 0.34f;
  bool flasher = true;

  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    mono_ = s.mono();
    sky_.assign((size_t) w_ * h_, P_BLACK);
    s.clear();

    /* The skyline. */
    int n = count < MAX_BUILDINGS ? count : MAX_BUILDINGS;
    buildings_.clear();
    int most = (int) floorf(h_ * tall);
    if (most < 20)
      most = 20;
    for (int i = 0; i < n; i++) {
      int top = h_ - rnd(most);
      int bw = (top >> 4) + low(top >> 3) + 8;
      if (bw < 16)
        bw = 16;
      int x = rnd(w_) - (bw >> 1);
      buildings_.push_back({x, top, bw, rnd(8)});
    }

    /* The palette: black, the flasher, RGB(v, v, 0) a building, then a cube
       of star colours in what is left. */
    palette_.assign(256, BLACK);
    palette_[P_FLASH] = mono_ ? Rgb{255, 255, 255} : Rgb{128, 0, 0};
    int step = n ? -192 / n : 0;  // truncates, as Math.trunc
    for (int i = 0; i < n; i++) {
      int v = (step * i + 255) & 0xff;
      /* On a 1-bit panel all the windows light: dithered, the dim ones at the
         back would lose whole buildings. */
      palette_[P_BUILDING + i] = mono_ ? rgb(255, 255, 255) : rgb(v, v, 0);
    }
    star0_ = P_BUILDING + n;
    levels_ = 2;
    while ((levels_ + 1) * (levels_ + 1) * (levels_ + 1) <= 256 - star0_)
      levels_++;
    for (int r = 0; r < levels_; r++)
      for (int g = 0; g < levels_; g++)
        for (int b = 0; b < levels_; b++)
          palette_[star0_ + (r * levels_ + g) * levels_ + b] =
              rgb(r * 255 / (levels_ - 1), g * 255 / (levels_ - 1), b * 255 / (levels_ - 1));

    /* The flasher: 4 px above the tallest roof, 2 left of its middle. */
    light_ = false;
    if (flasher && n) {
      const Building *best = &buildings_[0];
      for (const Building &b : buildings_)
        if (b.y < best->y)
          best = &b;
      light_ = true;
      light_x_ = best->x + (best->w >> 1) - 2;
      light_y_ = best->y - 4;
      light_on_ = false;
      light_t_ = 0;
    }

    /* The shooting star's art for this screen. */
    meteor_ = &art_starry_night::ART;
    meteor_scale_ = 1;
    if (mono_) {
      for (const MeteorArt &m : METEORS)
        if (h_ >= m.min_height) {
          meteor_ = m.art;
          meteor_scale_ = m.scale;
          break;
        }
    }
    meteor_seq_ = meteor_->sequence(art_starry_night::BM_METEOR);
    falling_ = false;
    drawn_ = {0, 0, 0, 0};

    sky_rate_ = RATE * (float) (w_ * h_) / (320 * 240);
    if (sky_rate_ < 1)
      sky_rate_ = 1;
    sky_owed_ = star_owed_ = 0;
    frames_ = 0;
  }

  void frame(Surface &s, float dt) override {
    /* Take the shooting star off first, back to the sky under it. */
    if (!drawn_.empty()) {
      Rect r = s.clip(drawn_);
      for (int y = r.y; y < r.y + r.h; y++)
        for (int x = r.x; x < r.x + r.w; x++)
          s.pixel(x, y, palette_[sky_[y * w_ + x]]);
      drawn_ = {0, 0, 0, 0};
    }

    sky_owed_ = fminf(sky_owed_ + dt * sky_rate_, sky_rate_ / 4);
    while (sky_owed_ >= 1) {
      sky(s);
      sky_owed_ -= 1;
    }
    star_owed_ = fminf(star_owed_ + dt * RATE, RATE / 4);
    while (star_owed_ >= 1) {
      shooting_star();
      star_owed_ -= 1;
    }
    flash(s, dt);

    if (falling_ && meteor_seq_) {
      float half = 16 * meteor_scale_;
      drawn_ = draw_frame(s, *meteor_, *meteor_seq_, right_ ? 0 : 1, mx_ + half, my_ + half);
    }
  }

 private:
  /* The first building with (x, y) in it, or -1. */
  int inside(int x, int y) const {
    for (size_t i = 0; i < buildings_.size(); i++) {
      const Building &b = buildings_[i];
      if (b.y <= y && b.x <= x && b.x + b.w >= x)
        return (int) i;
    }
    return -1;
  }

  void set(Surface &s, int x, int y, uint8_t index) {
    if (x < 0 || y < 0 || x >= w_ || y >= h_)
      return;
    sky_[y * w_ + x] = index;
    s.pixel(x, y, palette_[index]);
  }

  void window(Surface &s, int x, int y, int i) {
    const Building &b = buildings_[i];
    if (x < b.x || x > b.x + b.w || y < b.y)
      return;
    int row = PATTERNS[b.style * 8 + ((y + b.y) & 7)];
    if ((row >> ((x + b.x) & 7)) & 1)
      set(s, x, y, P_BUILDING + i);
  }

  uint8_t star_colour(int r, int g, int b) const {
    int L = levels_ - 1;
    r = (r * L + 127) / 254;
    g = (g * L + 127) / 254;
    b = (b * L + 127) / 254;
    return star0_ + (r * levels_ + g) * levels_ + b;
  }

  /* One frame of the module, bar the shooting star. */
  void sky(Surface &s) {
    int x = rnd(w_), y = low(h_);
    if (inside(x, y) < 0) {
      int r = rnd(255), g = rnd(255), b = rnd(255);
      set(s, x, y, star_colour(r, g, b));
    }
    for (int i = 0; i < 50; i++) {
      x = rnd(w_);
      y = low(h_);
      set(s, x, y, P_BLACK);
    }
    for (int i = 0; i < 30; i++) {
      x = rnd(w_);
      y = rnd(h_);
      set(s, x, y, P_BLACK);
    }
    for (int i = 0; i < 15; i++) {
      x = rnd(w_);
      y = rnd(h_);
      int b = inside(x, y);
      if (b < 0)
        continue;
      for (int dy = -1; dy <= 1; dy++)
        for (int dx = -1; dx <= 1; dx++)
          window(s, x + dx, y + dy, b);
    }
  }

  void shooting_star() {
    if (falling_) {
      int step = (int) (8 * meteor_scale_);
      int nx = mx_ + (right_ ? step : -step), ny = my_ + step;
      if (inside(nx + (int) (16 * meteor_scale_), ny + (int) (8 * meteor_scale_)) < 0 && nx >= 0 && nx < w_ &&
          ny < h_) {
        mx_ = nx;
        my_ = ny;
      } else {
        falling_ = false;
      }
      return;
    }
    if (++frames_ < 60)
      return;
    frames_ = 0;
    if (meteor_seq_ && rnd(0x7fff) > 30000) {
      right_ = rnd(2) == 1;
      mx_ = rnd(w_);
      my_ = 0;
      falling_ = true;
    }
  }

  void flash(Surface &s, float dt) {
    if (!light_)
      return;
    light_t_ += dt;
    if (light_t_ < 0.5f)
      return;
    light_t_ = 0;
    light_on_ = !light_on_;
    uint8_t c = light_on_ ? P_FLASH : P_BLACK;
    for (int r = 0; r < 2; r++) {
      set(s, light_x_ + 1, light_y_ + r * 3, c);
      set(s, light_x_ + 2, light_y_ + r * 3, c);
      for (int k = 0; k < 4; k++)
        set(s, light_x_ + k, light_y_ + r + 1, c);
    }
  }

  int w_ = 0, h_ = 0;
  bool mono_ = false;
  std::vector<uint8_t> sky_;
  std::vector<Rgb> palette_;
  std::vector<Building> buildings_;
  int star0_ = 0, levels_ = 2;

  bool light_ = false, light_on_ = false;
  int light_x_ = 0, light_y_ = 0;
  float light_t_ = 0;

  const Art *meteor_ = nullptr;
  const Sequence *meteor_seq_ = nullptr;
  float meteor_scale_ = 1;
  bool falling_ = false, right_ = false;
  int mx_ = 0, my_ = 0, frames_ = 0;
  Rect drawn_ = {0, 0, 0, 0};

  float sky_rate_ = RATE, sky_owed_ = 0, star_owed_ = 0;
};

/* ------------------------------------------------------------ text */

/*
 * The LCD version. The bottom row is the city and the tall buildings reach
 * into the top row; every building cell shows one of five window glyphs,
 * each a 3x4 grid of windows (or a dash pattern) that light and go dark one
 * at a time, so neighbouring cells don't blink together. Stars are ROM dots
 * in the sky cells, put up and knocked out at random. The flasher is a glyph
 * with a dot over the tallest roof, and the shooting star a streak that runs
 * down the top row until it meets a building.
 */
enum { G_WIN0 = 0, WINS = 5, G_FLASH = 5, G_STREAK = 6 };
/* Where windows can be in a cell, as (row, column mask): dots or dashes. */
const uint8_t WIN_ROWS[4] = {1, 3, 5, 7};
const uint8_t WIN_COLS[2][3] = {{0x10, 0x04, 0x01}, {0x18, 0x03, 0x00}};
const char STAR_CHARS[] = {'.', '.', '\'', '`', ','};

class StarryText : public TextSaver {
 public:
  void start(TextScreen &t) override {
    cols_ = t.cols();
    rows_ = t.rows();
    /* Each column: how many rows of building (0 = sky), and its glyph. */
    for (int c = 0; c < cols_; c++)
      height_[c] = 0;
    int n = cols_ * 3 / 4;
    for (int i = 0; i < n; i++) {
      int wide = 1 + low(3);
      int x = rnd(cols_) - wide / 2;
      int tall = rnd(rows_ * 4) < 3 ? 2 : 1;
      if (tall > rows_)
        tall = rows_;
      for (int c = x; c < x + wide; c++)
        if (c >= 0 && c < cols_ && height_[c] < tall)
          height_[c] = tall;
    }
    tallest_ = -1;
    for (int c = 0; c < cols_; c++) {
      win_[c] = rnd(WINS);
      if (height_[c] > 0 && (tallest_ < 0 || height_[c] > height_[tallest_]))
        tallest_ = c;
    }
    for (int g = 0; g < WINS; g++) {
      style_[g] = rnd(2);
      for (int k = 0; k < 12; k++)
        lit_[g][k] = false;
    }
    for (int r = 0; r < rows_; r++)
      for (int c = 0; c < cols_; c++)
        star_[r][c] = 0;
    light_ = false;
    light_t_ = 0;
    streak_ = -1;
    tick_ = 0;
    clock_ = 0;
    t.clear();
    draw(t);
  }

  void frame(TextScreen &t, float dt) override {
    clock_ += dt;
    /* Ten small steps a second: a star, a window or two, some dark. */
    while (clock_ >= 0.1f) {
      clock_ -= 0.1f;
      step();
    }
    light_t_ += dt;
    if (light_t_ >= 0.5f) {
      light_t_ = 0;
      light_ = !light_;
    }
    draw(t);
  }

 private:
  /* Rows from the top that are sky in column c. */
  int sky_rows(int c) const { return rows_ - height_[c]; }

  void step() {
    /* A star somewhere in the sky, leaning to the top. */
    int c = rnd(cols_), r = low(rows_);
    if (r < sky_rows(c))
      star_[r][c] = 1 + rnd(sizeof STAR_CHARS);
    /* Stars and windows go out. */
    for (int i = 0; i < 2; i++) {
      c = rnd(cols_);
      r = rnd(rows_);
      star_[r][c] = 0;
    }
    int g = rnd(WINS * 3);
    if (g < WINS)
      lit_[g][rnd(12)] = false;
    /* Windows come on, more often than they go out, as in the module. */
    for (int i = 0; i < 2; i++)
      lit_[rnd(WINS)][rnd(12)] = true;
    /* Now and then a shooting star, from the top left or right. */
    if (streak_ < 0) {
      if (++tick_ >= 20) {
        tick_ = 0;
        if (rnd(0x7fff) > 30000) {
          right_ = rnd(2) == 1;
          streak_ = rnd(cols_);
        }
      }
    } else {
      streak_ += right_ ? 1 : -1;
      if (streak_ < 0 || streak_ >= cols_ || height_[streak_] >= rows_)
        streak_ = -1;
    }
  }

  void window_glyph(int g, bool roof, bool dot, uint8_t out[8]) {
    for (int y = 0; y < 8; y++)
      out[y] = 0;
    for (int k = 0; k < 12; k++) {
      if (!lit_[g][k])
        continue;
      int row = WIN_ROWS[k / 3];
      if (roof && row < 3)
        continue;
      out[row] |= WIN_COLS[style_[g]][k % 3];
    }
    if (dot) {
      out[0] |= 0x04;
      out[1] |= 0x0E;
    }
  }

  void draw(TextScreen &t) {
    uint8_t bits[8];
    for (int g = 0; g < WINS; g++) {
      window_glyph(g, false, false, bits);
      t.glyph(G_WIN0 + g, bits);
    }
    /* The tallest building's top cell, with or without the light on it. */
    int tg = tallest_ >= 0 ? win_[tallest_] : 0;
    window_glyph(tg, true, light_, bits);
    t.glyph(G_FLASH, bits);
    static const char *const STREAK[2][8] = {
        {"#....", ".#...", "..##.", "...##", "....#", ".....", ".....", "....."},
        {"....#", "...#.", ".##..", "##...", "#....", ".....", ".....", "....."}};
    glyph_from_art(STREAK[right_ ? 0 : 1], 0, bits);
    t.glyph(G_STREAK, bits);

    t.clear();
    for (int c = 0; c < cols_; c++) {
      int top = sky_rows(c);
      for (int r = 0; r < rows_; r++) {
        if (r >= top)
          t.put(c, r, c == tallest_ && r == top ? (uint8_t) G_FLASH : (uint8_t) (G_WIN0 + win_[c]));
        else if (star_[r][c])
          t.put(c, r, STAR_CHARS[star_[r][c] - 1]);
      }
    }
    if (streak_ >= 0)
      t.put(streak_, 0, G_STREAK);
  }

  int cols_ = 16, rows_ = 2;
  int height_[TextScreen::MAX_COLS];
  uint8_t win_[TextScreen::MAX_COLS];
  uint8_t star_[TextScreen::MAX_ROWS][TextScreen::MAX_COLS];
  bool lit_[WINS][12];
  uint8_t style_[WINS];
  int tallest_ = -1;
  bool light_ = false, right_ = false;
  float light_t_ = 0, clock_ = 0;
  int streak_ = -1, tick_ = 0;
};

}  // namespace

Saver *make_starry_night() { return new StarryNight(); }
TextSaver *make_starry_night_text() { return new StarryText(); }

AD_REGISTER_SAVER("starry_night", make_starry_night, make_starry_night_text)

}  // namespace adcore
#endif
