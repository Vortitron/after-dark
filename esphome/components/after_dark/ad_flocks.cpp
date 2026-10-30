/*
 * ad_flocks.cpp - Flocks, on FLOCKS.AD's own artwork. A port of
 * all/modules/flocks.js, which was checked against the real module under
 * Wine; see that file for what was measured (30 birds, ~315 px/s, all flying
 * much the same way and wrapping round the edges) and what was chosen by eye
 * (the Reynolds weights).
 *
 * Defaults are the module's: Birds, a medium flock. Only the birds are
 * compiled in (their 48-cell loop of wheeling and flapping); the other six
 * kinds are settings this port doesn't offer, which keeps the flash cost
 * down.
 *
 * Small screens: on a 1-bit panel it flies the birds shrunk and baked to
 * black and white by tools/art2c.py --mono, at 1/2 or 1/3 size by screen
 * height. Speed, the wrap margin and the distances a bird cares about all
 * shrink with the sprite, as the JS sets the distances from the sprite's own
 * width. The flock is thinned to suit the screen (the JS puts 30 up in any
 * window): as many birds per sprite-sized cell of screen as 30 birds give on
 * a 320x240 panel, but never fewer than 6 so it is still a flock.
 *
 * The JS clears the screen every frame; this erases each bird's last box
 * instead, which comes to the same picture on a black sky.
 *
 * On a character LCD (FlocksText) the same flocking runs in the panel's dots
 * and each bird is a hand-drawn 5x8 bird beating its wings, a cell at a time.
 */
#if defined(AD_SAVER_FLOCKS) || defined(AD_ALL_SAVERS)
#include <vector>
#include "ad_art.h"
#include "ad_text.h"
#ifndef AD_MONO_ONLY  // a 1-bit build leaves the colour art out
#include "ad_art_flocks.h"
#endif
#ifndef AD_COLOUR_ONLY  // a colour build leaves the 1-bit art out
#include "ad_art_flocks_m2.h"
#include "ad_art_flocks_m3.h"
#endif

namespace adcore {

namespace {

const float PI = 3.14159265f;

/* From flocks.js. */
const float NEIGHBOUR = 6;  // sprite widths it looks for the rest of the flock
const float CROWDING = 4;   // closer than this and it pulls away
const float SPEED = 315;    // px/s at full size; everyone flies at the same rate
const float TURN = 2.6f;    // radians a second it can swing its heading
const float FLAP = 15;      // frames a second, through the whole strip
const float W_SEPARATE = 1.2f, W_ALIGN = 1.0f, W_COHERE = 0.05f;
const float PAD = 30;       // how far off an edge before it wraps, full size
const int MEDIUM = 30;      // the Flock Size default
/* The JS's screen.run caps a step at 0.05 s; longer frames are cut up so the
   steering behaves the same. */
const float MAX_STEP = 0.05f;

struct Bird {
  float x, y, angle, frame;
};

/* The three rules, as flocks.js's step(). `width` is the sprite's width,
   which the distances are set from; `speed` and `pad` are in the caller's
   units. */
void flock_step(std::vector<Bird> &flock, float dt, float w, float h, float width, float speed, float pad,
                int cells) {
  const float near = width * NEIGHBOUR, crowd = width * CROWDING;
  const int n = (int) flock.size();
  for (int i = 0; i < n; i++) {
    Bird &b = flock[i];
    float sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0;
    int seen = 0;
    for (int j = 0; j < n; j++) {
      if (j == i)
        continue;
      const Bird &o = flock[j];
      float dx = o.x - b.x, dy = o.y - b.y;
      float d = sqrtf(dx * dx + dy * dy);
      if (d > near || d == 0)
        continue;
      seen++;
      cx += o.x;
      cy += o.y;
      ax += cosf(o.angle);
      ay += sinf(o.angle);
      if (d < crowd) {
        sx -= dx / d * (crowd - d) / crowd;
        sy -= dy / d * (crowd - d) / crowd;
      }
    }
    float wx = cosf(b.angle), wy = sinf(b.angle);
    if (seen) {
      wx += sx * W_SEPARATE + (ax / seen) * W_ALIGN;
      wy += sy * W_SEPARATE + (ay / seen) * W_ALIGN;
      float hx = cx / seen - b.x, hy = cy / seen - b.y;
      float hd = sqrtf(hx * hx + hy * hy);
      if (hd == 0)
        hd = 1;
      wx += hx / hd * W_COHERE;
      wy += hy / hd * W_COHERE;
    }
    /* Turn towards the wanted heading rather than snapping to it. JS's % keeps
       the sign of the dividend; fmodf does too. */
    float want = atan2f(wy, wx);
    float diff = fmodf(want - b.angle + PI * 3, PI * 2) - PI;
    float lim = TURN * dt;
    b.angle += diff < -lim ? -lim : diff > lim ? lim : diff;

    b.x += cosf(b.angle) * speed * dt;
    b.y += sinf(b.angle) * speed * dt;
    b.frame += FLAP * dt;
    if (b.frame >= cells)
      b.frame -= cells;  // keeps the float precise on a long run

    /* Nothing bounces off the edges: what flies off one side comes back on
       the other, as in the original. */
    if (b.x < -pad)
      b.x = w + pad;
    else if (b.x > w + pad)
      b.x = -pad;
    if (b.y < -pad)
      b.y = h + pad;
    else if (b.y > h + pad)
      b.y = -pad;
  }
}

void flock_reset(std::vector<Bird> &flock, int n, float w, float h, int cells) {
  flock.resize(n);
  for (Bird &b : flock) {
    b.x = rng.range(0, w);
    b.y = rng.range(0, h);
    b.angle = rng.range(0, PI * 2);
    b.frame = rng.range(0, cells);
  }
}

/* The art sets, and the smallest screen height each mono one is for. */
struct Variant {
  const Art *art;
  float scale;
  bool mono;
  int min_height;
};
const Variant VARIANTS[] = {
#ifndef AD_MONO_ONLY
    {&art_flocks::ART, 1, false, 0},
#endif
#ifndef AD_COLOUR_ONLY
    {&art_flocks_m2::ART, 1 / 2.0f, true, 48},
    {&art_flocks_m3::ART, 1 / 3.0f, true, 0},
#endif
};

class Flocks : public Saver {
 public:
  int size = MEDIUM;

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
    const Art &art = *variant_->art;
    cells_ = art.sequence_count;
    width_ = art.sequences[0].w;
    int n = size;
    if (variant_->scale < 1) {
      /* Birds per sprite-sized cell as on a 320x240 panel; see the top. */
      float per_cell = (float) MEDIUM / (320 * 240 / (32.0f * 32.0f));
      n = (int) roundf(size / (float) MEDIUM * per_cell * w_ * h_ / (width_ * width_));
      if (n < 6)
        n = 6;
      if (n > size)
        n = size;
    }
    flock_reset(flock_, n, w_, h_, cells_);
    drawn_.assign(n, Rect{0, 0, 0, 0});
    s.clear();
  }

  void frame(Surface &s, float dt) override {
    const float scale = variant_->scale;
    while (dt > 0) {
      float step = dt > MAX_STEP ? MAX_STEP : dt;
      flock_step(flock_, step, w_, h_, width_, SPEED * scale, PAD * scale, cells_);
      dt -= step;
    }
    for (const Rect &r : drawn_)
      s.fill(r, BLACK);
    const Art &art = *variant_->art;
    for (size_t i = 0; i < flock_.size(); i++) {
      const Bird &b = flock_[i];
      drawn_[i] = draw_frame(s, art, art.sequences[(int) floorf(b.frame) % cells_], 0, b.x, b.y);
    }
  }

 private:
  const Variant *variant_ = &VARIANTS[0];
  int w_ = 0, h_ = 0, cells_ = 1;
  float width_ = 32;
  std::vector<Bird> flock_;
  std::vector<Rect> drawn_;
};

/* ------------------------------------------------------------ text */

/* A bird seen side-on, wings up, level and down, as the strip's first
   frames are. */
const char *const BIRD[3][8] = {
    {".....", ".....", "#...#", ".#.#.", "..#..", ".....", ".....", "....."},
    {".....", ".....", ".....", "##.##", "..#..", ".....", ".....", "....."},
    {".....", ".....", ".....", "..#..", ".#.#.", "#...#", ".....", "....."},
};
const int FLAPS[4] = {0, 1, 2, 1};

class FlocksText : public TextSaver {
 public:
  void start(TextScreen &t) override {
    cols_ = t.cols();
    rows_ = t.rows();
    w_ = cols_ * 6.0f;
    h_ = rows_ * 9.0f;
    int n = cols_ * rows_ / 5;
    if (n < 4)
      n = 4;
    flock_reset(flock_, n, w_, h_, 16);
    uint8_t bits[8];
    for (int k = 0; k < 3; k++) {
      glyph_from_art(BIRD[k], 0, bits);
      t.glyph(k, bits);
    }
    t.clear();
    draw(t);
  }

  void frame(TextScreen &t, float dt) override {
    /* A bird is a cell, 6 dots; the speed is the same share of the screen's
       width a second as 315 px/s is of 1024, and the wingbeat is slowed to
       something the panel can show. The wrap margin is kept to a couple of
       dots, or on a panel 17 dots high the birds spend half their time off it. */
    while (dt > 0) {
      float step = dt > MAX_STEP ? MAX_STEP : dt;
      flock_step(flock_, step, w_, h_, 6, SPEED / 1024 * w_, 2, 16);
      dt -= step;
    }
    draw(t);
  }

 private:
  void draw(TextScreen &t) {
    t.clear();
    for (const Bird &b : flock_) {
      int c = (int) floorf(b.x / 6), r = (int) floorf(b.y / 9);
      if (c >= 0 && c < cols_ && r >= 0 && r < rows_)
        t.put(c, r, FLAPS[(int) (b.frame / 4) % 4]);  // a quarter of the flap rate
    }
  }

  int cols_ = 16, rows_ = 2;
  float w_ = 96, h_ = 18;
  std::vector<Bird> flock_;
};

}  // namespace

Saver *make_flocks() { return new Flocks(); }
TextSaver *make_flocks_text() { return new FlocksText(); }

AD_REGISTER_SAVER("flocks", make_flocks, make_flocks_text)

}  // namespace adcore
#endif
