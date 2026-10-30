/*
 * ad_toilets.cpp - Flying Toilets, on TOILETS.AD's own artwork, put together
 * by the module's own film (OFMM/OFST/OFTB 9000). A port of
 * all/modules/toilets.js, which was checked against the real module under
 * Wine; see that file for the measurements and what each cel is.
 *
 * Defaults are the module's: Crowd More (8 up), Paper White, Occupant Nobody.
 * The rude sounds are not reproduced, as on the web.
 *
 * On a 1-bit panel it flies the art shrunk and baked to black and white by
 * art2c.py --mono (threshold 80: the white toilet keeps its shading lines and
 * the red plunger still shows), at 1/2, 1/3 or 1/4 size to suit the screen
 * as ad_toasters.cpp does, with the film's offsets, the speeds and the 126 px
 * cel box shrunk to match and fewer fliers.
 *
 * On a character LCD (ToiletsText) the toilet, its wing, a roll and a plunger
 * are redrawn by hand in 5x8 cells, as ToastersText does: nothing of the
 * sprites survives being shrunk that far.
 */
#if defined(AD_SAVER_TOILETS) || defined(AD_ALL_SAVERS)
#include "ad_art.h"
#include "ad_text.h"
#ifndef AD_MONO_ONLY  // a 1-bit build leaves the colour art out
#include "ad_art_toilets.h"
#endif
#ifndef AD_COLOUR_ONLY  // a colour build leaves the 1-bit art out
#include "ad_art_toilets_m2.h"
#include "ad_art_toilets_m3.h"
#include "ad_art_toilets_m4.h"
#endif

namespace adcore {

namespace {

const uint16_t SEQUENCE_ID = 9000;

/* The film's 32 cels: up to four frames each, at their offsets in the box. */
struct Layer {
  uint8_t frame, dx, dy;
};
struct Cel {
  uint8_t n;
  Layer layers[4];
};
const Cel CELS[] = {
    {2, {{3, 33, 34}, {4, 68, 52}}},                             // 0  empty toilet, wings
    {2, {{3, 33, 34}, {5, 69, 46}}},                             // 1
    {2, {{3, 33, 34}, {6, 94, 34}}},                             // 2
    {2, {{3, 33, 34}, {7, 81, 27}}},                             // 3
    {3, {{3, 33, 34}, {4, 68, 52}, {0, 20, 28}}},                // 4  Bessie
    {3, {{3, 33, 34}, {5, 69, 46}, {0, 20, 28}}},                // 5
    {3, {{3, 33, 34}, {6, 94, 34}, {0, 20, 28}}},                // 6
    {3, {{3, 33, 34}, {7, 81, 27}, {0, 20, 28}}},                // 7
    {3, {{3, 33, 34}, {4, 68, 52}, {2, 18, 30}}},                // 8  Dumpin' Dan
    {3, {{3, 33, 34}, {5, 69, 46}, {2, 18, 30}}},                // 9
    {3, {{3, 33, 34}, {6, 94, 34}, {2, 18, 30}}},                // 10
    {3, {{3, 33, 34}, {7, 81, 27}, {2, 18, 30}}},                // 11
    {3, {{3, 33, 34}, {4, 68, 52}, {1, 16, 29}}},                // 12 Aaron
    {3, {{3, 33, 34}, {5, 69, 46}, {1, 16, 29}}},                // 13
    {3, {{3, 33, 34}, {6, 94, 34}, {1, 16, 29}}},                // 14
    {3, {{3, 33, 34}, {7, 81, 27}, {1, 16, 29}}},                // 15
    {1, {{8, 70, 79}}},                                          // 16 cow print roll
    {1, {{9, 70, 79}}},                                          // 17
    {1, {{10, 70, 78}}},                                         // 18
    {1, {{14, 70, 79}}},                                         // 19 pastel roll
    {1, {{15, 70, 79}}},                                         // 20
    {1, {{16, 70, 78}}},                                         // 21
    {1, {{11, 70, 79}}},                                         // 22 white roll
    {1, {{12, 70, 79}}},                                         // 23
    {1, {{13, 70, 78}}},                                         // 24
    {1, {{17, 71, 68}}},                                         // 25 plunger
    {1, {{18, 70, 68}}},                                         // 26
    {1, {{19, 70, 68}}},                                         // 27
    {4, {{3, 33, 34}, {4, 68, 52}, {1, 16, 29}, {20, 47, 8}}},   // 28 Aaron and the pig
    {4, {{3, 33, 34}, {5, 69, 46}, {1, 16, 29}, {20, 47, 8}}},   // 29
    {4, {{3, 33, 34}, {6, 94, 34}, {1, 16, 29}, {20, 47, 8}}},   // 30
    {4, {{3, 33, 34}, {7, 81, 27}, {1, 16, 29}, {20, 47, 8}}},   // 31
};

enum Occupant { NOBODY, DUMPIN_DAN, BESSIE, AARON, RANDOM_OCCUPANT };
const uint8_t OCCUPANT_CEL[] = {0, 8, 4, 12};  // first cel of each toilet block
enum Paper { COW_PRINT, PASTEL, WHITE, RANDOM_PAPER };
const uint8_t PAPER_CEL[] = {16, 19, 22};
const uint8_t PIG = 28;
const float PIG_CHANCE = 0.1f;
const uint8_t FLAP[] = {0, 1, 2, 3, 2, 1};  // the film's wingbeat, ticks 1-6
const uint8_t PLUNGER_CEL = 25;
const float PLUNGER_CHANCE = 0.08f;
const float ROLL_SHARE = 0.5f;
const float SQRT5 = 2.2360680f;
const float HEADING_X = -2 / SQRT5, HEADING_Y = 1 / SQRT5;
const float MIN_SPEED = 45 * SQRT5 / 2;  // along the heading, for 45 px/s across
const float MAX_SPEED = 140 * SQRT5 / 2;
const float FPS = 10;  // film ticks a second
const float BOX = 126; // the film's cel box
const int MAX_OBJECTS = 24;  // Phew!

struct Variant {
  const Art *art;
  float scale;
  bool mono;
  int min_height;
};
const Variant VARIANTS[] = {
#ifndef AD_MONO_ONLY
    {&art_toilets::ART, 1, false, 0},
#endif
#ifndef AD_COLOUR_ONLY
    {&art_toilets_m2::ART, 1 / 2.0f, true, 96},
    {&art_toilets_m3::ART, 1 / 3.0f, true, 48},
    {&art_toilets_m4::ART, 1 / 4.0f, true, 0},
#endif
};

struct Object {
  uint8_t first, cels;  // cels: 6 for a flapping toilet, 3 for a roll or plunger
  bool flap;
  float x, y, speed, tick;
};

class Toilets : public Saver {
 public:
  int count = 8;  // More
  Paper paper = WHITE;
  Occupant occupant = NOBODY;

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
    seq_ = variant_->art->sequence(SEQUENCE_ID);
    sc_ = variant_->scale;
    box_ = BOX * sc_;
    int n = count < 1 ? 1 : count > MAX_OBJECTS ? MAX_OBJECTS : count;
    if (sc_ < 1) {
      n = (int) roundf(n * sc_ * 1.5f);
      if (n < 3)
        n = 3;
    }
    n_ = seq_ ? n : 0;
    s.clear();
    for (int i = 0; i < n_; i++) {
      objects_[i] = launch(true);
      drawn_[i] = {0, 0, 0, 0};
    }
  }

  void frame(Surface &s, float dt) override {
    for (int i = 0; i < n_; i++) {
      Object &o = objects_[i];
      o.x += HEADING_X * o.speed * dt;
      o.y += HEADING_Y * o.speed * dt;
      o.tick += FPS * dt;
      if (o.x < -box_ || o.y > h_ + box_)
        o = launch(false);
    }
    for (int i = 0; i < n_; i++)
      s.fill(drawn_[i], BLACK);
    for (int i = 0; i < n_; i++) {
      const Object &o = objects_[i];
      int k = (int) floorf(o.tick) % o.cels;
      drawn_[i] = draw_cel(s, CELS[o.first + (o.flap ? FLAP[k] : k)], o.x, o.y);
    }
  }

 private:
  Object launch(bool scattered) {
    Object o;
    o.speed = rng.range(MIN_SPEED, MAX_SPEED) * sc_;
    o.tick = rng.range(0, 6);
    o.flap = false;
    o.cels = 3;
    float r = rng.uniform();
    if (r < PLUNGER_CHANCE) {
      o.first = PLUNGER_CEL;
    } else if (r < ROLL_SHARE) {
      o.first = PAPER_CEL[paper == RANDOM_PAPER ? rng.below(3) : paper];
    } else {
      int who = occupant == RANDOM_OCCUPANT ? rng.below(4) : occupant;
      o.first = OCCUPANT_CEL[who];
      if (who == AARON && rng.uniform() < PIG_CHANCE)
        o.first = PIG;
      o.flap = true;
      o.cels = 6;
    }
    float half = box_ / 2;
    if (scattered) {
      o.x = rng.range(-half, w_ + half);
      o.y = rng.range(-half, h_ + half);
    } else if (rng.uniform() < (float) h_ / (w_ + h_ > 1 ? w_ + h_ : 1)) {
      o.x = w_ + half;  // in from the right
      o.y = rng.range(-half, h_ * 0.75f);
    } else {
      o.x = rng.range(0, w_ + half);  // in from the top
      o.y = -half;
    }
    return o;
  }

  /* One cel: its frames stacked at their offsets in the box, which is centred
     on the flier. Returns the box it covered. */
  Rect draw_cel(Surface &s, const Cel &cel, float cx, float cy) {
    float x0 = cx - box_ / 2, y0 = cy - box_ / 2;
    int l = 1 << 30, t = 1 << 30, r = -(1 << 30), b = -(1 << 30);
    for (int k = 0; k < cel.n; k++) {
      const Layer &ly = cel.layers[k];
      if (ly.frame >= seq_->count)
        continue;
      const Frame &f = seq_->frames[ly.frame];
      Rect d = draw_frame(s, *variant_->art, *seq_, ly.frame, x0 + ly.dx * sc_ + f.w / 2.0f,
                          y0 + ly.dy * sc_ + f.h / 2.0f);
      if (d.empty())
        continue;
      l = d.x < l ? d.x : l;
      t = d.y < t ? d.y : t;
      r = d.x + d.w > r ? d.x + d.w : r;
      b = d.y + d.h > b ? d.y + d.h : b;
    }
    if (r < l)
      return {0, 0, 0, 0};
    return {l, t, r - l, b - t};
  }

  const Variant *variant_ = &VARIANTS[0];
  const Sequence *seq_ = nullptr;
  float sc_ = 1, box_ = BOX;
  int w_ = 0, h_ = 0, n_ = 0;
  Object objects_[MAX_OBJECTS];
  Rect drawn_[MAX_OBJECTS];
};

/* ------------------------------------------------------------ text */

/* A toilet flying left, its wing in the next cell: up, level, down. */
const char *const WINGED[3][8] = {
    {"...##....#", "...##...##", "#####..##.", "#######...", ".###......", "..#.......", ".###......",
     ".........."},
    {"...##.....", "...##.....", "#####.....", "##########", ".###.####.", "..#.......", ".###......",
     ".........."},
    {"...##.....", "...##.....", "#####.....", "#######...", ".###..##..", "..#....##.", ".###....##",
     ".........."},
};
const int FLAP_TEXT[] = {0, 1, 2, 1};
/* A roll unwinding, its tail flapping. */
const char *const ROLL[3][8] = {
    {".....", ".###.", "#...#", "#.#.#", "#...#", ".####", ".....", "....."},
    {".....", ".###.", "#...#", "#.#.#", "#...#", ".###.", "...##", "....."},
    {".....", ".###.", "#...#", "#.#.#", "#...#", ".###.", "....#", "....#"},
};
/* A plunger, handle up and to the right. */
const char *const PLUNGER[8] = {"....#", "...#.", "..#..", ".#...", "###..", "###..", ".....", "....."};

enum { G_TOILET_L, G_TOILET_R, G_ROLL, G_PLUNGER };

class ToiletsText : public TextSaver {
 public:
  void start(TextScreen &t) override {
    cols_ = t.cols();
    rows_ = t.rows();
    n_ = cols_ * rows_ / 10;
    if (n_ < 2)
      n_ = 2;
    if (n_ > MAX)
      n_ = MAX;
    for (int i = 0; i < n_; i++)
      objects_[i] = launch(true);
    clock_ = 0;
    t.clear();
    draw(t);
  }

  void frame(TextScreen &t, float dt) override {
    clock_ += dt;
    for (int i = 0; i < n_; i++) {
      Obj &o = objects_[i];
      float v = o.speed * cols_ * 6;  // dots a second across; half that down
      o.x -= v * dt / 6;
      o.y += v * 0.5f * dt / 9;
      if (o.x < -2 || o.y >= rows_)
        o = launch(false);
    }
    draw(t);
  }

 private:
  static const int MAX = 8;
  enum Kind { TOILET, ROLL_KIND, PLUNGER_KIND };
  struct Obj {
    Kind kind;
    float x, y, speed;  // cells; speed as a share of the screen's width a second
  };

  Obj launch(bool scattered) {
    Obj o;
    float r = rng.uniform();
    o.kind = r < PLUNGER_CHANCE ? PLUNGER_KIND : r < ROLL_SHARE ? ROLL_KIND : TOILET;
    o.speed = rng.range(45, 140) / 1024.0f;
    float w = cols_ * 6.0f, h = rows_ * 9.0f;
    if (scattered) {
      o.x = rng.range(0, cols_);
      o.y = rng.range(0, rows_);
    } else if (rng.uniform() < h / (w + h)) {
      o.x = cols_;  // in from the right
      o.y = rng.range(0, rows_ * 0.75f);
    } else {
      o.x = rng.range(0, cols_ + 2);  // in from the top
      o.y = -0.99f;
    }
    return o;
  }

  void draw(TextScreen &t) {
    uint8_t bits[8];
    int flap = FLAP_TEXT[(int) (clock_ * 6) % 4];
    glyph_from_art(WINGED[flap], 0, bits);
    t.glyph(G_TOILET_L, bits);
    glyph_from_art(WINGED[flap], 5, bits);
    t.glyph(G_TOILET_R, bits);
    glyph_from_art(ROLL[(int) (clock_ * FPS / 2) % 3], 0, bits);
    t.glyph(G_ROLL, bits);
    glyph_from_art(PLUNGER, 0, bits);
    t.glyph(G_PLUNGER, bits);

    t.clear();
    /* Rolls and plungers first, so the toilets fly in front. */
    for (int pass = 0; pass < 2; pass++) {
      for (int i = 0; i < n_; i++) {
        const Obj &o = objects_[i];
        if ((o.kind == TOILET) != (pass == 1))
          continue;
        int c = (int) floorf(o.x), r = (int) floorf(o.y);
        if (o.kind == TOILET) {
          t.put(c, r, G_TOILET_L);
          t.put(c + 1, r, G_TOILET_R);
        } else {
          t.put(c, r, o.kind == ROLL_KIND ? G_ROLL : G_PLUNGER);
        }
      }
    }
  }

  int cols_ = 16, rows_ = 2, n_ = 0;
  float clock_ = 0;
  Obj objects_[MAX];
};

}  // namespace

Saver *make_toilets() { return new Toilets(); }
TextSaver *make_toilets_text() { return new ToiletsText(); }

AD_REGISTER_SAVER("toilets", make_toilets, make_toilets_text)

}  // namespace adcore
#endif
