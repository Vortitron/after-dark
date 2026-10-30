/*
 * ad_gravity.cpp - Gravity, bouncing balls that are never erased. A port of
 * all/modules/gravity.js, which was checked against GRAVITY.AD under Wine;
 * see that file for what was measured and what was inferred.
 *
 * A set of balls drops in from the top edge, each a flat VGA colour outlined
 * in black, with a steady sideways drift that bounces off the walls. Every
 * step stamps each ball again, so it leaves a dotted trail of arcs. The fall
 * grows by 27% a step (plus a pixel) and each bounce keeps 0.88 of the
 * height; when they have all died away a new set falls. 30 steps a second.
 * Defaults are the web version's: 7 balls of 30 px, Clear Screen off (so a
 * new set falls on top of the old ones).
 *
 * Small screens: a 30 px ball is half a 64 px OLED, so below 240 px tall the
 * balls are a sixth of the height (10 px on 128x64, the slider's smallest),
 * but at least 8 px (72x40), and the sideways drift shrinks with them. On a 1-bit panel
 * every ball is white inside its black outline: dithered colours on balls
 * this small, stamped over each other, came out as noise, and the outlines
 * alone draw the trail of overlapping arcs.
 *
 * No character LCD version: 8-dot balls on a 95x17 DotMatrix, never erased,
 * fill it in a few seconds.
 */
#if defined(AD_SAVER_GRAVITY) || defined(AD_ALL_SAVERS)
#include "ad_core.h"
#include "ad_draw.h"

namespace adcore {

namespace {

const int MAX_BALLS = 7;
const int BALLS = 7;
const int SIZE = 30;  // the web default (Large), diameter in px
const bool CLEAR_SCREEN = false;
/* The VGA colours the balls came in (no black; silver never turned up). */
const Rgb PALETTE[] = {{0x80, 0, 0},       {0, 0x80, 0},       {0x80, 0x80, 0}, {0, 0, 0x80}, {0x80, 0, 0x80},
                       {0, 0x80, 0x80},    {0x80, 0x80, 0x80}, {0xff, 0, 0},    {0, 0xff, 0}, {0xff, 0xff, 0},
                       {0, 0, 0xff},       {0xff, 0, 0xff},    {0, 0xff, 0xff}, {0xff, 0xff, 0xff}};
const int NPALETTE = sizeof(PALETTE) / sizeof(PALETTE[0]);
const float STEPS_PER_SEC = 30;
const float GROW = 1.27f;   // each step falls this much further than the last...
const float NUDGE = 1;      // ...plus this many pixels
const float KEEP = 0.88f;   // height kept at each bounce
const float MAX_DRIFT = 8;  // sideways pixels per step, for a 30 px ball
const float DONE = 3;       // a bounce lower than this ends the ball

struct Ball {
  float x, y, apex, fall, vx;
  bool rising, done;
  Rgb colour;
};

/* A disc of radius `r` about the pixel corner (cx, cy), as the canvas fills
   an arc: every pixel whose centre is inside. */
void disc(Surface &s, int cx, int cy, float r, Rgb c) {
  int n = (int) ceilf(r);
  for (int py = cy - n; py < cy + n; py++) {
    float dy = py + 0.5f - cy;
    float q = r * r - dy * dy;
    if (q < 0)
      continue;
    float half = sqrtf(q);
    int x0 = (int) ceilf(cx - half - 0.5f), x1 = (int) floorf(cx + half - 0.5f);
    if (x1 >= x0)
      s.fill_rect(x0, py, x1 - x0 + 1, 1, c);
  }
}

class Gravity : public Saver {
 public:
  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    mono_ = s.mono();
    size_ = h_ >= 240 ? SIZE : (h_ / 6 > 8 ? h_ / 6 : 8);
    if (size_ > SIZE)
      size_ = SIZE;
    drift_ = MAX_DRIFT * size_ / SIZE;
    started_ = false;
    clock_ = 0;
    reset();
  }

  void frame(Surface &s, float dt) override {
    if (fresh_) {
      if (CLEAR_SCREEN || !started_)
        s.clear();
      started_ = true;
      fresh_ = false;
      for (int i = 0; i < n_; i++)
        stamp(s, balls_[i]);
    }
    clock_ += dt * STEPS_PER_SEC;
    while (clock_ >= 1) {
      clock_ -= 1;
      bool live = false;
      for (int i = 0; i < n_; i++) {
        Ball &b = balls_[i];
        if (!b.done) {
          move(b);
          stamp(s, b);
          live = true;
        }
      }
      if (!live) {
        reset();
        return;
      }
    }
  }

 private:
  void reset() {
    n_ = BALLS < MAX_BALLS ? BALLS : MAX_BALLS;
    Rgb colours[NPALETTE];
    int left = NPALETTE;
    for (int i = 0; i < NPALETTE; i++)
      colours[i] = PALETTE[i];
    float r = size_ / 2.0f;
    for (int i = 0; i < n_; i++) {
      Ball &b = balls_[i];
      /* No two alike: take one out of what is left. */
      int k = rng.below(left);
      b.colour = colours[k];
      for (int j = k; j < left - 1; j++)
        colours[j] = colours[j + 1];
      left--;
      b.x = rng.range(r, w_ - r > r + 1 ? w_ - r : r + 1);
      b.y = 0;
      b.apex = 0;
      b.fall = 0;
      b.rising = false;
      b.vx = (float) round_half_up(rng.range(-drift_, drift_));
      b.done = false;
    }
    fresh_ = true;
  }

  /* One step of one ball. */
  void move(Ball &b) const {
    float r = size_ / 2.0f;
    float floor_y = h_ - r;
    b.x += b.vx;
    if (b.x < r) {
      b.x = 2 * r - b.x;
      b.vx = -b.vx;
    } else if (b.x > w_ - r) {
      b.x = 2 * (w_ - r) - b.x;
      b.vx = -b.vx;
    }
    if (b.rising) {
      b.fall = (b.fall - NUDGE) / GROW;
      if (b.fall <= NUDGE) {
        b.fall = 0;
        b.rising = false;
      }
    } else {
      b.fall = b.fall * GROW + NUDGE;
    }
    b.y = b.apex + b.fall;
    if (!b.rising && b.y >= floor_y) {
      float height = (floor_y - b.apex) * KEEP;
      if (height < DONE) {
        b.y = floor_y;
        b.done = true;
        return;
      }
      b.apex = floor_y - height;
      b.fall = height;
      b.y = floor_y;
      b.rising = true;
    }
  }

  void stamp(Surface &s, const Ball &b) const {
    float r = size_ / 2.0f;
    int cx = round_half_up(b.x), cy = round_half_up(b.y);
    Rgb c = mono_ ? Rgb{255, 255, 255} : b.colour;
    /* The fill to r - 0.5 and its 1 px black stroke: a black disc of r with
       the colour inside r - 1. */
    disc(s, cx, cy, r, BLACK);
    disc(s, cx, cy, r - 1, c);
  }

  int w_ = 0, h_ = 0, size_ = SIZE, n_ = 0;
  float drift_ = MAX_DRIFT, clock_ = 0;
  bool mono_ = false, started_ = false, fresh_ = true;
  Ball balls_[MAX_BALLS];
};

}  // namespace

Saver *make_gravity() { return new Gravity(); }

AD_REGISTER_SAVER("gravity", make_gravity, nullptr)

}  // namespace adcore
#endif
