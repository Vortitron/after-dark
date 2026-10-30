/*
 * ad_rebound.cpp - Rebound, on REBOUND.AD's own balls. A port of
 * all/modules/rebound.js, which was checked against the real module under
 * Wine; see that file for what was measured (the ball counts and sizes) and
 * what was not (the speed).
 *
 * Defaults are the module's: Both, Lots More (12 balls), Wobbly, Clear Screen
 * First. Colour screens follow the web port exactly, including its rule that
 * a screen less than 240 px in either direction gets the 4 px pair.
 *
 * On a 1-bit panel the 16 and 32 px balls are used instead, shrunk and baked
 * by art2c.py --mono to 1/2, 1/3 or 1/4 size to suit the screen as
 * ad_toasters.cpp chooses, with speeds shrunk to match: a 4 px ball baked to
 * one bit is a square, and a third-size pair still looks like balls. They are
 * baked at threshold 20 with no edges, so the blue and the dark metal ones
 * stay solid discs rather than vanishing.
 *
 * The web port moves everything by the frame's dt; here a long frame is cut
 * into steps of at most 1/30 s so balls don't pass through each other when
 * the panel is slow.
 *
 * No character LCD version: a ball jumping a whole 5x8 cell at a time is not
 * this saver.
 */
#if defined(AD_SAVER_REBOUND) || defined(AD_ALL_SAVERS)
#include "ad_art.h"
#ifndef AD_MONO_ONLY  // a 1-bit build leaves the colour art out
#include "ad_art_rebound.h"
#endif
#ifndef AD_COLOUR_ONLY  // a colour build leaves the 1-bit art out
#include "ad_art_rebound_m2.h"
#include "ad_art_rebound_m3.h"
#include "ad_art_rebound_m4.h"
#endif

namespace adcore {

namespace {

enum BallType { PLASTIC, METAL, BOTH };

const float BIG_SHARE = 0.25f;  // one ball in four is a 32 pixel one
const float MIN_SPEED = 45;
const float MAX_SPEED = 135;
const float WOBBLE = 0.22f;
const int MAX_BALLS = 20;  // Oodles
const float MAX_STEP = 1 / 30.0f;

/* An art set: its scale, and the bitmap for [material][size], size 0 tiny,
   1 small, 2 big (-1 where the set has none). */
struct Variant {
  const Art *art;
  float scale;
  bool mono;
  int min_height;
  int ids[2][3];
};
const Variant VARIANTS[] = {
#ifndef AD_MONO_ONLY
    {&art_rebound::ART,
     1,
     false,
     0,
     {{art_rebound::BM_QICT_1000, art_rebound::BM_QICT_1002, art_rebound::BM_QICT_1004},
      {art_rebound::BM_QICT_1001, art_rebound::BM_QICT_1003, art_rebound::BM_QICT_1005}}},
#endif
#ifndef AD_COLOUR_ONLY
    {&art_rebound_m2::ART,
     1 / 2.0f,
     true,
     96,
     {{-1, art_rebound_m2::BM_QICT_1002, art_rebound_m2::BM_QICT_1004},
      {-1, art_rebound_m2::BM_QICT_1003, art_rebound_m2::BM_QICT_1005}}},
    {&art_rebound_m3::ART,
     1 / 3.0f,
     true,
     48,
     {{-1, art_rebound_m3::BM_QICT_1002, art_rebound_m3::BM_QICT_1004},
      {-1, art_rebound_m3::BM_QICT_1003, art_rebound_m3::BM_QICT_1005}}},
    {&art_rebound_m4::ART,
     1 / 4.0f,
     true,
     0,
     {{-1, art_rebound_m4::BM_QICT_1002, art_rebound_m4::BM_QICT_1004},
      {-1, art_rebound_m4::BM_QICT_1003, art_rebound_m4::BM_QICT_1005}}},
#endif
};
/* The full-size widths, which the speed rule goes by. */
const float FULL_WIDTH[3] = {4, 16, 32};

struct Ball {
  const Sequence *seq;
  float radius, x, y, vx, vy, mass;
};

class Rebound : public Saver {
 public:
  BallType type = BOTH;
  int count = 12;  // Lots More
  bool wobbly = true;

  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    variant_ = &VARIANTS[0];
    if (s.mono()) {
      for (const Variant &v : VARIANTS)
        if (v.mono && h_ >= v.min_height) {
          variant_ = &v;
          break;
        }
    }
    int n = count < 1 ? 1 : count > MAX_BALLS ? MAX_BALLS : count;
    n_ = 0;
    for (int i = 0; i < n; i++)
      if (spawn(balls_[n_]))
        n_++;
    for (int i = 0; i < n_; i++)
      drawn_[i] = {0, 0, 0, 0};
    s.clear();
  }

  void frame(Surface &s, float dt) override {
    int steps = (int) ceilf(dt / MAX_STEP);
    if (steps < 1)
      steps = 1;
    for (int k = 0; k < steps; k++)
      step(dt / steps);

    for (int i = 0; i < n_; i++)
      s.fill(drawn_[i], BLACK);
    for (int i = 0; i < n_; i++) {
      const Ball &b = balls_[i];
      drawn_[i] = draw_frame(s, *variant_->art, *b.seq, 0, b.x, b.y);
    }
  }

 private:
  bool spawn(Ball &b) {
    int size;
    if (variant_->mono)
      size = rng.uniform() < BIG_SHARE ? 2 : 1;
    else
      size = (w_ < h_ ? w_ : h_) < 240 ? 0 : (rng.uniform() < BIG_SHARE ? 2 : 1);
    int materials[2], m = 0;
    if (type == BOTH) {
      materials[m++] = PLASTIC;
      materials[m++] = METAL;
    } else {
      materials[m++] = type;
    }
    int id = variant_->ids[materials[rng.below(m)]][size];
    b.seq = id < 0 ? nullptr : variant_->art->sequence(id);
    if (!b.seq)
      return false;
    b.radius = b.seq->w / 2.0f;
    float angle = rng.range(0, 6.2831853f);
    float full = FULL_WIDTH[size];
    float speed = rng.range(MIN_SPEED, MAX_SPEED) * (24 / (full > 12 ? full : 12)) * variant_->scale;
    float hi_x = w_ - b.radius, hi_y = h_ - b.radius;
    b.x = rng.range(b.radius, hi_x > b.radius + 1 ? hi_x : b.radius + 1);
    b.y = rng.range(b.radius, hi_y > b.radius + 1 ? hi_y : b.radius + 1);
    b.vx = cosf(angle) * speed;
    b.vy = sinf(angle) * speed;
    b.mass = b.radius * b.radius;
    return true;
  }

  void bounce(Ball &b) {
    bool hit = false;
    if (b.x < b.radius || b.x > w_ - b.radius) {
      b.x = fmaxf(b.radius, fminf(w_ - b.radius, b.x));
      b.vx = -b.vx;
      hit = true;
    }
    if (b.y < b.radius || b.y > h_ - b.radius) {
      b.y = fmaxf(b.radius, fminf(h_ - b.radius, b.y));
      b.vy = -b.vy;
      hit = true;
    }
    if (hit && wobbly) {
      float turn = rng.range(-WOBBLE, WOBBLE);
      float c = cosf(turn), sn = sinf(turn);
      float vx = b.vx * c - b.vy * sn;
      b.vy = b.vx * sn + b.vy * c;
      b.vx = vx;
    }
  }

  /* Two balls that meet bounce apart, as billiard balls do. */
  static void collide(Ball &a, Ball &b) {
    float dx = b.x - a.x, dy = b.y - a.y;
    float reach = a.radius + b.radius;
    float d = sqrtf(dx * dx + dy * dy);
    if (d >= reach || d == 0)
      return;
    float nx = dx / d, ny = dy / d;
    float push = (reach - d) / 2;
    a.x -= nx * push;
    a.y -= ny * push;
    b.x += nx * push;
    b.y += ny * push;
    float closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (closing <= 0)
      return;
    float k = 2 * closing / (a.mass + b.mass);
    a.vx -= k * b.mass * nx;
    a.vy -= k * b.mass * ny;
    b.vx += k * a.mass * nx;
    b.vy += k * a.mass * ny;
  }

  void step(float dt) {
    for (int i = 0; i < n_; i++) {
      balls_[i].x += balls_[i].vx * dt;
      balls_[i].y += balls_[i].vy * dt;
    }
    for (int i = 0; i < n_; i++)
      for (int j = i + 1; j < n_; j++)
        collide(balls_[i], balls_[j]);
    for (int i = 0; i < n_; i++)
      bounce(balls_[i]);
  }

  const Variant *variant_ = &VARIANTS[0];
  int w_ = 0, h_ = 0, n_ = 0;
  Ball balls_[MAX_BALLS];
  Rect drawn_[MAX_BALLS];
};

}  // namespace

Saver *make_rebound() { return new Rebound(); }

AD_REGISTER_SAVER("rebound", make_rebound, nullptr)

}  // namespace adcore
#endif
