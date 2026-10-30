/*
 * ad_shapes.cpp - Shapes, a rapid succession of flat rectangles and
 * ellipses. A port of all/modules/shapes.js, which was checked against
 * SHAPES.AD's own GDI calls under Wine; see that file for what was measured
 * (the shape rolls, the NULL pen, PALETTERGB onto AD_PALETTE 104) and what
 * was chosen (the rate).
 *
 * Defaults are the module's: Color on, Clear Screen First off.
 *
 * As in the JS: three shapes a browser frame, so 180 a second here whatever
 * the frame rate; each a filled Rectangle (one pixel short right and bottom,
 * as GDI fills with the NULL pen) or upright Ellipse, half and half, rolled
 * on the module's 1024x768 numbers scaled to the screen, in the nearest
 * colour of the 6x6x6 cube and grey ramp.
 *
 * Adapted:
 *  - It starts on black. With Clear Screen First off the original drew over
 *    the desktop, which the web version paints; there is no desktop here.
 *  - Canvas anti-aliases the shapes' fractional edges; here they are rounded
 *    to whole pixels.
 * On a 1-bit panel the colours go through the ordered dither, so the pile of
 * shapes reads as overlapping patches of different greys. No character-LCD
 * version: a 1602 has eight definable glyphs, and the edges of a couple of
 * filled shapes cross more cells than that.
 */
#if defined(AD_SAVER_SHAPES) || defined(AD_ALL_SAVERS)
#include "ad_core.h"
#include "ad_draw.h"

#include <cmath>

namespace adcore {

namespace {

const float SHAPES_PER_SECOND = 180;  // 3 a frame at 60 Hz
const int MAX_PER_FRAME = 45;         // a 0.25 s frame's worth

/* AD_PALETTE 104: the 6x6x6 cube, and the greys between its steps. */
const uint8_t GREYS[] = {12, 25, 38, 64, 77, 90, 103, 116, 129, 142, 155, 168, 181, 194, 207, 220, 233};

inline int sq(int v) { return v * v; }

/* PALETTERGB(r, g, b): the nearest palette entry (the first of equals, cube
   before greys, as the JS searches). */
Rgb nearest(int r, int g, int b) {
  /* The nearest cube level for each channel is the nearest cube entry. */
  auto level = [](int v) {
    int k = (v + 25) / 51;  // halves (x.5 * 51 is never an integer) can't tie
    return k * 51;
  };
  Rgb best = rgb(level(r), level(g), level(b));
  int best_d = sq(best.r - r) + sq(best.g - g) + sq(best.b - b);
  for (uint8_t v : GREYS) {
    int d = sq(v - r) + sq(v - g) + sq(v - b);
    if (d < best_d) {
      best_d = d;
      best = rgb(v, v, v);
    }
  }
  return best;
}

/* random(n) as the JS has it: floor(Math.random() * n). */
inline float random(float n) { return floorf(rng.uniform() * n); }

class Shapes : public Saver {
 public:
  bool colour = true;

  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    due_ = 0;
    s.clear();
  }

  void frame(Surface &s, float dt) override {
    due_ += dt * SHAPES_PER_SECOND;
    int n = 0;
    while (due_ >= 1 && n < MAX_PER_FRAME) {
      due_ -= 1;
      paint(s);
      n++;
    }
    if (due_ >= 1)
      due_ = 0;
  }

 private:
  /* One shape, as the module rolls it, on a w x h screen (1024x768 there). */
  void paint(Surface &s) {
    float k = w_ / 1024.0f;
    bool rect = random(2) == 0;
    float x = random(w_ + 80 * k) - 100 * k;
    float y = random(h_ + 80 * k) - 100 * k;
    int sw = (int) random(w_ / 2.0f);
    int sh = (int) random(h_ / 2.0f);
    Rgb c;
    if (colour) {
      int r = (int) random(255), g = (int) random(255), b = (int) random(255);
      c = nearest(r, g, b);
    } else {
      int v = (int) random(255);
      c = nearest(v, v, v);
    }
    int x0 = round_half_up(x), y0 = round_half_up(y);
    if (rect) {
      /* With the NULL pen GDI fills one pixel short on the right and bottom. */
      s.fill_rect(x0, y0, sw - 1, sh - 1, c);
    } else if (sw > 0 && sh > 0) {
      /* The ellipse in the sw x sh box at (x, y). */
      int rx = (sw - 1) / 2, ry = (sh - 1) / 2;
      fill_ellipse(s, x0 + sw / 2, y0 + sh / 2, rx, ry, c);
    }
  }

  int w_ = 0, h_ = 0;
  float due_ = 0;
};

}  // namespace

Saver *make_shapes() { return new Shapes(); }

AD_REGISTER_SAVER("shapes", make_shapes, nullptr)

}  // namespace adcore
#endif
