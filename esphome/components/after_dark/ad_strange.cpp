/*
 * ad_strange.cpp - Strange Attractors, chaos plotted a point at a time. A port
 * of all/modules/strange.js, which was checked against STRANGE.AD under Wine;
 * see that file for what was measured and what was inferred.
 *
 * Each picture is Barry Martin's hopalong map, x' = y - sign(x) sqrt|b x - c|,
 * y' = a - x, from the origin, one-pixel dots at a fixed scale, so it grows
 * out from the middle and past the corners. Defaults are the module's: a new
 * picture every 20 seconds, Normal colour speed.
 *
 * The web version plots 1500 dots a browser frame; here that is 1500 every
 * 1/60 s on a fixed-step clock, so the picture spreads at the same rate
 * whatever the frame rate. The Caps Lock hold is left out (no keyboard).
 * On a 1-bit panel the dots are plain white: the pale drifting colour would
 * only dither away a quarter of them. Floats rather than doubles (the ESP32
 * has no double FPU); the map is chaotic either way.
 *
 * No character LCD version: on a DotMatrix the figure fills the 95x17 grid
 * within a second or two and is just noise from then on.
 */
#if defined(AD_SAVER_STRANGE) || defined(AD_ALL_SAVERS)
#include "ad_core.h"
#include "ad_draw.h"

#include <algorithm>
#include <vector>

namespace adcore {

namespace {

const float DURATION = 20;  // seconds a picture
const float HUE_RATE = 20;  // degrees a second (Normal)
/* Dots a step, and steps a second (the browser's frame rate). */
const int PER_STEP = 1500;
const float STEPS = 60;
/* Dots whose spread sets the scale: about what is down after a few seconds. */
const int SPREAD = 180000;
const int SAMPLES = SPREAD / 50;

/* hsl(h, 60%, 70%), as the canvas fillStyle has it. */
Rgb hsl_pale(float h) {
  const float s = 0.6f, l = 0.7f;
  float c = (1 - fabsf(2 * l - 1)) * s;
  float hp = h / 60;
  float x = c * (1 - fabsf(fmodf(hp, 2) - 1));
  float r = 0, g = 0, b = 0;
  switch ((int) hp % 6) {
    case 0: r = c; g = x; break;
    case 1: r = x; g = c; break;
    case 2: g = c; b = x; break;
    case 3: g = x; b = c; break;
    case 4: r = x; b = c; break;
    default: r = c; b = x; break;
  }
  float m = l - c / 2;
  return rgb(round_half_up((r + m) * 255), round_half_up((g + m) * 255), round_half_up((b + m) * 255));
}

class Strange : public Saver {
 public:
  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    radii_.assign(SAMPLES, 0);
    clock_ = 0;
    fresh(s);
  }

  void frame(Surface &s, float dt) override {
    age_ += dt;
    if (age_ > DURATION)
      fresh(s);
    hue_ = fmodf(hue_ + HUE_RATE * dt, 360);
    Rgb c = s.mono() ? Rgb{255, 255, 255} : hsl_pale(hue_);
    clock_ += dt;
    int n = 0;
    while (clock_ >= 1 / STEPS && n < 15) {
      clock_ -= 1 / STEPS;
      n++;
    }
    if (n == 15)
      clock_ = 0;
    float ox = w_ / 2.0f, oy = h_ / 2.0f;
    for (int i = 0; i < n * PER_STEP; i++) {
      float nx = y_ - (x_ < 0 ? -1 : 1) * sqrtf(fabsf(b_ * x_ - c_));
      y_ = a_ - x_;
      x_ = nx;
      /* y runs down the screen, as it did in the original. */
      float px = floorf(ox + x_ * scale_), py = floorf(oy + y_ * scale_);
      if (px >= 0 && py >= 0 && px < w_ && py < h_)
        s.pixel((int) px, (int) py, c);
    }
  }

 private:
  void fresh(Surface &s) {
    s.clear();
    float reach = find();
    /* By the time the spread is down it reaches past the screen's corners. */
    scale_ = hypotf((float) w_, (float) h_) / 2 * 0.75f / reach;
    x_ = y_ = 0;
    age_ = 0;
    hue_ = rng.range(0, 360);
  }

  /* Parameters for one picture; returns how far its first few seconds
     reach (the 90th-percentile radius). */
  float find() {
    for (int tries = 0; tries < 50; tries++) {
      a_ = rng.range(-15, 15);
      b_ = rng.range(0.02f, 1.5f);
      b_ *= rng.uniform() < 0.5f ? -1 : 1;
      c_ = rng.range(-2, 2);
      float x = 0, y = 0, min_x = 0, max_x = 0, min_y = 0, max_y = 0;
      int k = 0;
      for (int i = 0; i < SPREAD; i++) {
        float nx = y - (x < 0 ? -1 : 1) * sqrtf(fabsf(b_ * x - c_));
        y = a_ - x;
        x = nx;
        min_x = std::min(min_x, x);
        max_x = std::max(max_x, x);
        min_y = std::min(min_y, y);
        max_y = std::max(max_y, y);
        if (i % 50 == 0)
          radii_[k++] = sqrtf(x * x + y * y);
      }
      auto nth = radii_.begin() + SAMPLES * 9 / 10;
      std::nth_element(radii_.begin(), nth, radii_.end());
      float reach = *nth;
      if (std::isfinite(reach) && reach > 0 && max_x > min_x && max_y > min_y)
        return reach;
    }
    a_ = 0.4f;
    b_ = 1;
    c_ = 0;
    return 2.2f;
  }

  int w_ = 0, h_ = 0;
  float a_ = 0, b_ = 0, c_ = 0, scale_ = 1;
  float x_ = 0, y_ = 0, age_ = 0, hue_ = 0, clock_ = 0;
  std::vector<float> radii_;
};

}  // namespace

Saver *make_strange() { return new Strange(); }

AD_REGISTER_SAVER("strange", make_strange, nullptr)

}  // namespace adcore
#endif
