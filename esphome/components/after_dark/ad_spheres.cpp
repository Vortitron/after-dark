/*
 * ad_spheres.cpp - Spheres, 3D-looking orbs filling the screen. A port of
 * all/modules/spheres.js, which was checked against SPHERES.AD's own GDI
 * calls under Wine; see that file for what was measured (the 34 rings, their
 * sizes, offsets and colours) and what was chosen (the rate).
 *
 * Defaults are the module's: Max Size 73, Offset 10, Clear Every 30, Clear
 * Screen First off.
 *
 * As in the JS: four rings a browser frame, so 240 a second here whatever
 * the frame rate; each sphere 34 filled circles from dark and wide to bright
 * and small near the highlight, sized on the module's 1024-wide numbers
 * scaled to the screen; the screen cleared to black every 30 spheres.
 *
 * Adapted:
 *  - It starts on black. With Clear Screen First off the original drew over
 *    the desktop, which the web version paints; there is no desktop here.
 *  - Canvas anti-aliases the rings' fractional edges; here each covers the
 *    pixels whose centres fall inside it.
 *  - On a 1-bit panel each ring is drawn in grey at its level rather than in
 *    its hue: through the ordered dither a blue sphere (luminance at most 29
 *    of 255) or a red one (76) would barely show, while the grey ramp gives
 *    every sphere its shading, dark rim to lit highlight.
 * No character-LCD version: shaded balls a few dots across don't survive
 * being composed into eight glyphs.
 */
#if defined(AD_SAVER_SPHERES) || defined(AD_ALL_SAVERS)
#include "ad_core.h"
#include "ad_draw.h"

#include <algorithm>
#include <cmath>

namespace adcore {

namespace {

const int RINGS = 34;
const float RINGS_PER_SECOND = 240;  // 4 a frame at 60 Hz
const int MAX_PER_FRAME = 60;        // a 0.25 s frame's worth

/* random(n) as the JS has it: floor(Math.random() * n). */
inline int random(int n) { return (int) floorf(rng.uniform() * n); }

class Spheres : public Saver {
 public:
  int max_size = 73;
  int offset = 10;
  int clear_every = 30;  // 0: never

  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    mono_ = s.mono();
    drawn_ = 0;
    ring_ = RINGS;  // no sphere under way
    due_ = 0;
    s.clear();
  }

  void frame(Surface &s, float dt) override {
    due_ += dt * RINGS_PER_SECOND;
    int n = 0;
    while (due_ >= 1 && n < MAX_PER_FRAME) {
      due_ -= 1;
      n++;
      if (ring_ >= RINGS) {
        if (clear_every > 0 && drawn_ >= clear_every) {
          s.clear();
          drawn_ = 0;
        }
        make_sphere();
      }
      paint_ring(s, ring_++);
      if (ring_ >= RINGS)
        drawn_++;
    }
    if (due_ >= 1)
      due_ = 0;
  }

 private:
  void make_sphere() {
    float scale = w_ / 1024.0f;
    r_ = (30 + random(max_size)) * scale;
    x_ = (float) random(w_);
    y_ = (float) random(h_);
    hue_ = random(6);
    push_ = r_ * offset / 20;
    ring_ = 0;
  }

  void paint_ring(Surface &s, int k) {
    float t = (float) k / (RINGS - 1);
    float cx = x_ + push_ * sqrtf(t), cy = y_ - push_ * sqrtf(t);
    float r = r_ * std::max(sqrtf(1 - t), 0.095f);
    int v = 24 + 7 * k;
    Rgb c;
    if (mono_) {
      c = rgb(v, v, v);
    } else {
      switch (hue_) {
        case 0: c = rgb(v, 0, 0); break;
        case 1: c = rgb(0, v, 0); break;
        case 2: c = rgb(0, 0, v); break;
        case 3: c = rgb(v, 0, v); break;
        case 4: c = rgb(0, v, v); break;
        default: c = rgb(0, 29 + 3 * k, v); break;  // azure
      }
    }
    /* The pixels whose centres are within r of (cx, cy), near enough. */
    fill_circle(s, (int) floorf(cx), (int) floorf(cy), std::max(0, round_half_up(r - 0.5f)), c);
  }

  int w_ = 0, h_ = 0;
  bool mono_ = false;
  int drawn_ = 0, ring_ = RINGS, hue_ = 0;
  float x_ = 0, y_ = 0, r_ = 0, push_ = 0, due_ = 0;
};

}  // namespace

Saver *make_spheres() { return new Spheres(); }

AD_REGISTER_SAVER("spheres", make_spheres, nullptr)

}  // namespace adcore
#endif
