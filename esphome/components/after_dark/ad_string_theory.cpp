/*
 * ad_string_theory.cpp - String Theory, moire strung across the screen from
 * edge to edge. A port of all/modules/string.js, which was checked against
 * STRING.AD's own pen and line calls under Wine; see that file for what was
 * measured and what was inferred (the 60 steps a second is a choice).
 *
 * Defaults are the module's: 3 groups, 140 strings, Color Speed 96.
 *
 * Adapted for small screens:
 *  - It starts on black. The original (Clear Screen First off) drew over the
 *    desktop, which the web version paints; there is no desktop here.
 *  - On a 1-bit panel every string but black is drawn white: its dark table
 *    colours (navy, maroon) would dither away to nothing on a 1-px line, and
 *    the moire, not the colour, is what reads there.
 *  - Strings is held to a fan of about a third of the screen's edge (2(W+H)/8
 *    lines): 140 at 320x240 as the module has it, 48 at 128x64, 28 at 72x40.
 * No character LCD version: every string runs edge to edge, so two of them
 * cross more cells than the panel has glyphs and the rest come out as ROM
 * punctuation.
 */
#if defined(AD_SAVER_STRING_THEORY) || defined(AD_ALL_SAVERS)
#include "ad_core.h"
#include "ad_draw.h"

#include <cstdlib>
#include <vector>

namespace adcore {

namespace {

const float STEPS_PER_SECOND = 60;  // a choice: it ran unthrottled
const int RESPEED = 701;
/* Its 22-colour table, index 0 (black) being the eraser. */
const Rgb COLORS[] = {
    {0, 0, 0},       {0, 0, 255},   {0, 0, 128},     {128, 0, 128}, {255, 0, 255}, {128, 0, 128},
    {128, 0, 0},     {255, 0, 0},   {128, 0, 0},     {128, 128, 0}, {255, 255, 0}, {128, 128, 0},
    {85, 85, 85},    {255, 255, 255}, {170, 170, 170}, {0, 128, 0},   {0, 255, 0},   {0, 128, 0},
    {0, 128, 128},   {0, 255, 255}, {0, 128, 128},   {0, 0, 128}};
const int NCOLORS = sizeof(COLORS) / sizeof(COLORS[0]);
const int16_t NONE = -32768;

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

/* One end of a string: where it is, its speed, and which axes it moves on. */
struct End {
  int p[2], v[2], on[2];
};

/* An end's move along x (axis 0) or y (axis 1); one that would leave the
   screen stays put, turns back, and goes on along the other edge. */
void move(End &e, int axis, const int size[2]) {
  int p = e.p[axis] + e.v[axis] * e.on[axis];
  if (p < 0 || p > size[axis]) {
    e.v[axis] = -e.v[axis];
    e.on[axis] = 0;
    e.on[1 - axis] = 1;
    return;
  }
  e.p[axis] = p;
}

struct Group {
  End a, b;
  int color;
};

class StringTheory : public Saver {
 public:
  int groups = 3;
  int strings = 140;  // 0 = Infinite
  int color_speed = 96;

  void start(Surface &s) override {
    size_[0] = w_ = s.width();
    size_[1] = h_ = s.height();
    mono_ = s.mono();
    s.clear();
    for (int i = 0; i < groups; i++) {
      Group &g = set_[i];
      g.a = End{};
      g.b = End{};
      if (rng.below(2) == 0) {
        g.a.p[0] = rng.below(w_ - 2) + 2;
        g.a.on[0] = 1;
        g.b.p[0] = rng.below(w_);
        g.b.p[1] = h_;
        g.b.on[0] = 1;
      } else {
        g.a.p[1] = rng.below(h_ - 2) + 2;
        g.a.on[1] = 1;
        g.b.p[0] = w_;
        g.b.p[1] = rng.below(h_);
        g.b.on[1] = 1;
      }
      g.color = rng.below(NCOLORS);
    }
    /* A fan of 140 lines 2-4 px apart is a sixth of the edge at 1024x768 and
       a third at 320x240, but more than all of it on an OLED, which then goes
       solid white: keep it to about a third of the edge. */
    ring_len_ = strings;
    int fan = (w_ + h_) * 2 / 8;
    if (ring_len_ > fan)
      ring_len_ = fan > 1 ? fan : 1;
    ring_.assign(strings > 0 ? groups * ring_len_ * 4 : 0, NONE);
    head_ = 0;
    tick_ = 0;
    color_tick_ = 0;
    owed_ = 0;
  }

  void frame(Surface &s, float dt) override {
    owed_ += dt * STEPS_PER_SECOND;
    if (owed_ > 10)
      owed_ = 10;
    while (owed_ >= 1) {
      owed_ -= 1;
      once(s);
    }
  }

 private:
  Rgb colour(int i) const {
    if (mono_)
      return i ? Rgb{255, 255, 255} : BLACK;
    return COLORS[i];
  }

  void respeed() {
    for (int i = 0; i < groups; i++) {
      Group &g = set_[i];
      g.a.v[0] = rng.below(3) + 2;
      g.a.v[1] = rng.below(3) + 2;
      g.b.v[0] = rng.below(3) + 2;
      g.b.v[1] = rng.below(3) + 2;
    }
  }

  void once(Surface &s) {
    for (int i = 0; i < groups; i++) {
      Group &g = set_[i];
      int16_t *slot = strings > 0 ? &ring_[(i * ring_len_ + head_) * 4] : nullptr;
      if (slot && slot[0] != NONE)
        line_to(s, slot[0], slot[1], slot[2], slot[3], BLACK);
      if (tick_ == 0)
        respeed();
      move(g.a, 0, size_);
      move(g.a, 1, size_);
      move(g.b, 0, size_);
      move(g.b, 1, size_);
      if (slot) {
        slot[0] = (int16_t) g.a.p[0];
        slot[1] = (int16_t) g.a.p[1];
        slot[2] = (int16_t) g.b.p[0];
        slot[3] = (int16_t) g.b.p[1];
      }
      line_to(s, g.a.p[0], g.a.p[1], g.b.p[0], g.b.p[1], colour(g.color));
    }
    if (strings > 0)
      head_ = (head_ + 1) % ring_len_;
    int every = (100 - color_speed) * 5;
    if (++color_tick_ > every) {
      for (int i = 0; i < groups; i++)
        if (++set_[i].color >= NCOLORS)
          set_[i].color = 1;
      color_tick_ = 0;
    }
    if (++tick_ > RESPEED - 1)
      tick_ = 0;
  }

  int w_ = 0, h_ = 0, size_[2] = {0, 0};
  bool mono_ = false;
  Group set_[4];
  std::vector<int16_t> ring_;
  int ring_len_ = 1, head_ = 0, tick_ = 0, color_tick_ = 0;
  float owed_ = 0;
};

}  // namespace

Saver *make_string_theory() { return new StringTheory(); }

AD_REGISTER_SAVER("string_theory", make_string_theory, nullptr)

}  // namespace adcore
#endif
