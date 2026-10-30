/*
 * ad_rose.cpp - Rose, two wheels turning and a pen of coloured dots. A port of
 * all/modules/rose.js, which was checked against ROSE.AD's SetPixel calls and
 * a disassembly of its drawing code; see that file for the details.
 *
 * Every frame draws one closed figure of 240/step dots,
 *   x = cx + C (B sin(A u) + sin(t + u)),  y = cy + C (B cos(A u) + cos(t + u)),
 * keeping a ring of the last N and blacking out the oldest as each new one
 * goes down. A, B and C glide to new random targets over 250 frames. Defaults
 * are the module's: Quick, Medium trail (288 dots), small dots. 30 frames a
 * second, as on the web (the original ran unthrottled).
 *
 * The figure is sized from the screen (R = 4/9 of the smaller half), so it
 * needs no adapting. On a 1-bit panel the dots are white: single dithered
 * pixels of the red/blue runs would mostly vanish.
 *
 * No character LCD version: on a 95x17 DotMatrix R is 3 dots and the figure
 * is a speck in the middle of the panel.
 */
#if defined(AD_SAVER_ROSE) || defined(AD_ALL_SAVERS)
#include "ad_core.h"
#include "ad_draw.h"

#include <vector>

namespace adcore {

namespace {

const float PI = 3.14159265358979f;
const float FPS = 30;
const int STEP = 20;          // Quick
const int TRAIL_SETTING = 2;  // Medium
const bool BIG_DOTS = false;
const int A_TAB[] = {0, 1, 4, 9, 16};

/* RCDATA 1: two interleaved runs of -1.28 + 0.04 k. */
float b_tab(int i) {
  int k = i & 31;
  int base = i < 32 ? -128 : -120;
  return (base + 16 * (k >> 1) + 4 * (k & 1)) / 100.0f;
}

/* The 50-entry colour cycle: red x8, magenta x8, blue x8, cyan x8, green x9, yellow x9. */
Rgb colour(int i) {
  static const Rgb RUNS[] = {{255, 0, 0}, {255, 0, 255}, {0, 0, 255}, {0, 255, 255}, {0, 255, 0}, {255, 255, 0}};
  static const int ENDS[] = {8, 16, 24, 32, 41, 50};
  for (int r = 0; r < 6; r++)
    if (i < ENDS[r])
      return RUNS[r];
  return RUNS[5];
}

/* Trail length in dots, as ROSE.AD works it out from both controls. */
int trail_length(int step, int trail) {
  int t = 5 - trail;
  static const int LONG[] = {960, 720, 480};
  if (t <= 2)
    return LONG[t];
  if (step == 1)
    return t == 3 ? 480 : 240;
  if (step == 2) {
    static const int T[] = {360, 240, 120};
    return T[t - 3];
  }
  if (step == 4 || step == 6) {
    int T[] = {240, 120, step == 4 ? 60 : 40};
    return T[t - 3];
  }
  int T[] = {288, 96, step == 10 ? 24 : step == 15 ? 16 : 12};
  return T[t - 3];
}

class Rose : public Saver {
 public:
  void start(Surface &s) override {
    cx_ = s.width() / 2;
    cy_ = s.height() / 2;
    r_ = (cx_ < cy_ ? cx_ : cy_) * 4 / 9;
    n_ = trail_length(STEP, TRAIL_SETTING);
    xs_.assign(n_, 0);
    ys_.assign(n_, 0);
    for (int i = 0; i < 128; i++)
      sin128_[i] = sinf(i * 2 * PI / 128);
    for (int i = 0; i < 240; i++)
      sin240_[i] = sinf(i * PI / 120);
    head_ = 0;
    frame_ = 0;
    t_ = 0;
    s_ = 0;
    owed_ = 0;
    /* Starts from A, B as random picks and C = 0, gliding out. */
    a0_ = pick_a();
    b0_ = pick_b();
    c0_ = 0;
    a1_ = pick_a();
    b1_ = pick_b();
    c1_ = rand_c();
    s.clear();
  }

  void frame(Surface &s, float dt) override {
    owed_ += dt * FPS;
    if (owed_ > 4)
      owed_ = 4;
    while (owed_ >= 1) {
      owed_ -= 1;
      once(s);
    }
  }

 private:
  float pick_a() { return (float) A_TAB[rng.below(5)]; }
  float pick_b() { return b_tab(rng.below(64)); }
  float rand_c() { return r_ * sqrtf((float) rng.below(32)) * 10 / 57; }

  void once(Surface &s) {
    float A = a0_ + (a1_ - a0_) * s_;
    float B = b0_ + (b1_ - b0_) * s_;
    float C = c0_ + (c1_ - c0_) * s_;
    int size = BIG_DOTS ? 2 : 1;
    bool mono = s.mono();
    for (int k = 1; k * STEP <= 240; k++) {
      float u = k * STEP * (PI / 120);
      int ti = (t_ + k * STEP) % 240;
      s.fill_rect(xs_[head_], ys_[head_], size, size, BLACK);
      int di = (int) floorf(u * A * 128 / (2 * PI)) & 127;
      /* cos is sin a quarter turn on, in both tables. */
      int x = cx_ + (int) floorf(C * (B * sin128_[di] + sin240_[ti]));
      int y = cy_ + (int) floorf(C * (B * sin128_[(di + 32) & 127] + sin240_[(ti + 60) % 240]));
      xs_[head_] = x;
      ys_[head_] = y;
      Rgb c = mono ? Rgb{255, 255, 255} : colour(((int) floorf(u * 50 / (2 * PI)) + frame_) % 50);
      s.fill_rect(x, y, size, size, c);
      head_ = (head_ + 1) % n_;
    }
    s_ += 0.004f;
    if (s_ >= 0.999f) {
      a0_ = a1_;
      b0_ = b1_;
      c0_ = c1_;
      a1_ = pick_a();
      b1_ = pick_b();
      c1_ = rand_c();
      s_ = 0;
    }
    frame_ = (frame_ + 1) % 50;
    t_ = (t_ + 1) % 240;
  }

  int cx_ = 0, cy_ = 0, r_ = 0, n_ = 1, head_ = 0, frame_ = 0, t_ = 0;
  float s_ = 0, owed_ = 0;
  float a0_ = 0, b0_ = 0, c0_ = 0, a1_ = 0, b1_ = 0, c1_ = 0;
  std::vector<int16_t> xs_, ys_;
  float sin128_[128], sin240_[240];
};

}  // namespace

Saver *make_rose() { return new Rose(); }

AD_REGISTER_SAVER("rose", make_rose, nullptr)

}  // namespace adcore
#endif
