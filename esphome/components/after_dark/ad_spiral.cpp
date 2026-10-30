/*
 * ad_spiral.cpp - Spiral Gyra, a ribbon of lines mirrored four ways. A port
 * of all/modules/spiral.js, which was checked against SPIRAL.AD's own
 * MoveTo/LineTo/CreatePen calls under Wine; see that file for what was
 * measured.
 *
 * Defaults are the module's: Max Lines 204, Min Lines 28%, Color Cycling 32,
 * 300 lines a second, the last 199 left standing.
 *
 * Adapted for small screens: on a 1-bit panel every line is white, since a
 * fully saturated blue or red 1-px line dithers to almost nothing there.
 * Everything else is in pixels a step, as the module had it, so on a small
 * screen the ribbon is smaller and crosses it faster, as in a small window on
 * the web.
 * No character LCD version: mirrored four ways the ribbon always covers more
 * cells than the panel has glyphs, and what's left is ROM punctuation.
 */
#if defined(AD_SAVER_SPIRAL) || defined(AD_ALL_SAVERS)
#include "ad_core.h"
#include "ad_draw.h"

#include <cstdlib>

namespace adcore {

namespace {

const int RING = 200;
const float STEPS_PER_SECOND = 300;
const float TURN = 234;  // SPIRAL.AD's angle unit: 234 to the circle
const float PI = 3.14159265f;

/* MS C rand(), as the module uses it. */
class MsRand {
 public:
  void seed(uint32_t s) { seed_ = s; }
  int next() {
    seed_ = seed_ * 0x343fdu + 0x269ec3u;
    return (int) ((seed_ >> 16) & 0x7fff);
  }
  /* n (r + 32768) / 65536: somewhere in [n/2, n). */
  int upper(int n) { return (int) (((int64_t) n * (next() + 32768)) >> 16); }

 private:
  uint32_t seed_ = 1;
};

float sin_t(float a) { return sinf(a * 2 * PI / TURN); }

/* h 0..1, full saturation and value. */
Rgb hue(float h) {
  float s = h * 6;
  int i = ((int) floorf(s)) % 6;
  float f = s - floorf(s);
  uint8_t q = (uint8_t) round_half_up(255 * (1 - f)), t = (uint8_t) round_half_up(255 * f);
  switch (i) {
    case 0: return {255, t, 0};
    case 1: return {q, 255, 0};
    case 2: return {0, 255, t};
    case 3: return {0, q, 255};
    case 4: return {t, 0, 255};
    default: return {255, 0, q};
  }
}

/* LineTo: Bresenham, leaving out the last pixel. */
void line_to(Surface &s, int x0, int y0, int x1, int y1, Rgb c) {
  int dx = abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  int dy = -abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  int err = dx + dy;
  while (x0 != x1 || y0 != y1) {
    plot(s, x0, y0, c);
    int e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

class SpiralGyra : public Saver {
 public:
  int max_lines = 204;
  int min_pct = 28;
  int cycling = 32;

  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    mono_ = s.mono();
    s.clear();
    r_.seed(rng.next() & 0x7fffffff);
    ax_ = r_.upper(w_ >> 3);
    if (ax_ < 1)
      ax_ = 1;
    ay_ = r_.upper(h_ >> 3);
    if (ay_ < 1)
      ay_ = 1;
    cx_ = r_.upper(w_ >> 1);
    cy_ = r_.upper(h_ >> 1);
    vax_ = vay_ = vcx_ = vcy_ = 1;
    th_ = 0;
    ph_ = TURN / 2;
    dth_ = TURN / (r_.upper(500) + 1);
    for (int i = 0; i < RING * 4; i++)
      ring_[i] = 0;
    wi_ = RING - 1;
    ei_ = 0;
    hue_ = 0;
    owed_ = 0;
  }

  void frame(Surface &s, float dt) override {
    owed_ += dt * STEPS_PER_SECOND;
    if (owed_ > 30)
      owed_ = 30;
    while (owed_ >= 1) {
      owed_ -= 1;
      once(s);
    }
  }

 private:
  void four(Surface &s, int x1, int y1, int x2, int y2, Rgb c) {
    line_to(s, x1, y1, x2, y2, c);
    line_to(s, w_ - x1, h_ - y1, w_ - x2, h_ - y2, c);
    line_to(s, w_ - x1, y1, w_ - x2, y2, c);
    line_to(s, x1, h_ - y1, x2, h_ - y2, c);
  }

  void repick() {
    int min = max_lines * min_pct / 100;
    if (min < 20)
      min = 20;
    dth_ = TURN / (min + r_.upper(max_lines));
    ph_ = (TURN / 2) / ((((uint32_t) (r_.next() + 32768) << 3) >> 16) + 1);
  }

  void once(Surface &s) {
    th_ += dth_;
    if (th_ >= TURN)
      th_ -= TURN;  // the sines don't mind; the float's precision does
    cx_ += vcx_;
    if (cx_ < 0) {
      vcx_ = 1;
      repick();
    } else if (cx_ > w_ - 1) {
      vcx_ = -1;
      repick();
    }
    cy_ += vcy_;
    if (cy_ < 0) {
      vcy_ = 1;
      repick();
    } else if (cy_ > h_) {
      vcy_ = -1;
      repick();
    }
    ax_ += vax_;
    if (ax_ < 3 || ax_ > w_ >> 2)
      vax_ = -vax_;
    ay_ += vay_;
    if (ay_ < 3 || ay_ > h_ >> 2)
      vay_ = -vay_;

    float t2 = th_ + ph_;
    int x1 = (int) floorf(sin_t(th_ + TURN / 4) * ax_) + cx_;
    int y1 = (int) floorf(sin_t(th_) * ay_) + cy_;
    int x2 = (int) floorf(sin_t(t2 + TURN / 4) * ax_) + cx_;
    int y2 = (int) floorf(sin_t(t2) * ay_) + cy_;

    const int16_t *e = &ring_[ei_ * 4];
    four(s, e[0], e[1], e[2], e[3], BLACK);
    ei_ = (ei_ + 1) % RING;

    float period = 20 + (100 - cycling) * 980 / 100.0f;
    hue_ = fmodf(hue_ + 1 / period, 1);
    four(s, x1, y1, x2, y2, mono_ ? Rgb{255, 255, 255} : hue(hue_));
    int16_t *k = &ring_[wi_ * 4];
    k[0] = (int16_t) x1;
    k[1] = (int16_t) y1;
    k[2] = (int16_t) x2;
    k[3] = (int16_t) y2;
    wi_ = (wi_ + 1) % RING;
  }

  int w_ = 0, h_ = 0;
  bool mono_ = false;
  MsRand r_;
  int ax_ = 1, ay_ = 1, cx_ = 0, cy_ = 0, vax_ = 1, vay_ = 1, vcx_ = 1, vcy_ = 1;
  float th_ = 0, ph_ = 0, dth_ = 1, hue_ = 0, owed_ = 0;
  int16_t ring_[RING * 4];
  int wi_ = 0, ei_ = 0;
};

}  // namespace

Saver *make_spiral() { return new SpiralGyra(); }

AD_REGISTER_SAVER("spiral", make_spiral, nullptr)

}  // namespace adcore
#endif
