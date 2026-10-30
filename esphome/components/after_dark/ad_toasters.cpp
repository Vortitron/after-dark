/*
 * ad_toasters.cpp - Flying Toasters Pro, on TOAST3.AD's own artwork. A port
 * of all/modules/toasters.js, which was checked against the real module under
 * Wine; see that file for the measurements behind the fleet table.
 *
 * Defaults are the module's: Squadron, which put up seven objects.
 *
 * On a 1-bit panel it flies the art shrunk and baked to black and white by
 * tools/art2c.py --mono, at 1/2, 1/3 or 1/4 size to suit the screen, with
 * speeds shrunk to match and fewer objects so the sky isn't solid toaster.
 * On a character LCD (ToastersText) the art is redrawn by hand in 5x8 cells,
 * because nothing of the real sprites survives being shrunk that far.
 */
#if defined(AD_SAVER_TOASTERS) || defined(AD_ALL_SAVERS)
#include "ad_art.h"
#include "ad_text.h"
#ifndef AD_MONO_ONLY
#include "ad_art_toast3.h"
#endif
#ifndef AD_COLOUR_ONLY  // a colour build leaves the 1-bit art out
#include "ad_art_toast3_m2.h"
#include "ad_art_toast3_m3.h"
#include "ad_art_toast3_m4.h"
#endif

namespace adcore {

namespace {

/* Sequence id, how often it turns up, how fast its wings or tumble run, and
   its speed across the screen in px/s. 2000 (bacon) is left out as on the web:
   its frames are not one animation. */
struct Kind {
  uint16_t id;
  uint8_t weight;
  uint8_t fps;
  float speed_lo, speed_hi;
};

const Kind FLEET[] = {
    {6000, 1, 9, 120, 140}, {1000, 4, 12, 90, 130}, {1001, 3, 12, 170, 170},
    {3000, 5, 9, 46, 46},   {4000, 4, 14, 90, 90},  {7000, 4, 2, 90, 90},
};
const int KINDS = sizeof(FLEET) / sizeof(FLEET[0]);
const int MAX_OBJECTS = 14;  // Swarm
/* Down and to the left, in formation. */
const float HEADING_X = -1, HEADING_Y = 0.5f;

/* The art sets, and the smallest screen height each mono one is for. A build
   for a 1-bit panel (AD_MONO_ONLY) leaves the colour set out. */
struct Variant {
  const Art *art;
  float scale;
  bool mono;
  int min_height;
};
const Variant VARIANTS[] = {
#ifndef AD_MONO_ONLY
    {&art_toast3::ART, 1, false, 0},
#endif
#ifndef AD_COLOUR_ONLY
    {&art_toast3_m2::ART, 1 / 2.0f, true, 96},
    {&art_toast3_m3::ART, 1 / 3.0f, true, 48},
    {&art_toast3_m4::ART, 1 / 4.0f, true, 0},
#endif
};

struct Object {
  int kind;
  float x, y, vx, vy, frame;
};

class Toasters : public Saver {
 public:
  int count = 7;

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
    pool_size_ = 0;
    for (int k = 0; k < KINDS; k++) {
      seq_[k] = variant_->art->sequence(FLEET[k].id);
      for (int i = 0; seq_[k] && i < FLEET[k].weight; i++)
        pool_[pool_size_++] = k;
    }
    objects_n_ = count < MAX_OBJECTS ? count : MAX_OBJECTS;
    if (variant_->scale < 1) {
      int n = (int) roundf(count * variant_->scale * 1.5f);
      objects_n_ = n < 3 ? 3 : n;
    }

    s.clear();
    /* On a fresh start scatter them across the screen, or it takes a minute
       to fill up. */
    for (int i = 0; i < objects_n_; i++) {
      objects_[i] = launch(true);
      drawn_[i] = {0, 0, 0, 0};
    }
  }

  void frame(Surface &s, float dt) override {
    for (int i = 0; i < objects_n_; i++) {
      Object &o = objects_[i];
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.frame += FLEET[o.kind].fps * dt;
      float margin = seq_[o.kind]->w + 8;
      if (o.x < -margin || o.y > h_ + margin)
        o = launch(false);
    }

    /* Erase everything first, then draw, so overlaps come out right. */
    for (int i = 0; i < objects_n_; i++)
      s.fill(drawn_[i], BLACK);

    /* The near ones last, so they pass in front of the far ones. */
    int order[MAX_OBJECTS];
    for (int i = 0; i < objects_n_; i++) {
      int j = i;
      while (j > 0 && seq_[objects_[order[j - 1]].kind]->w > seq_[objects_[i].kind]->w) {
        order[j] = order[j - 1];
        j--;
      }
      order[j] = i;
    }
    for (int n = 0; n < objects_n_; n++) {
      int i = order[n];
      Object &o = objects_[i];
      drawn_[i] = draw_frame(s, *variant_->art, *seq_[o.kind], (int) floorf(o.frame), o.x, o.y);
    }
  }

 private:
  Object launch(bool scattered) {
    int k = pool_[rng.below(pool_size_)];
    const Sequence *seq = seq_[k];
    float size = seq->w;
    float speed = rng.range(FLEET[k].speed_lo, FLEET[k].speed_hi) * variant_->scale;
    Object o;
    o.kind = k;
    o.frame = rng.range(0, seq->count);
    o.vx = HEADING_X * speed;
    o.vy = HEADING_Y * speed;
    if (scattered) {
      o.x = rng.range(0, w_);
      o.y = rng.range(0, h_);
    } else if (rng.uniform() < (float) h_ / (w_ + h_)) {
      o.x = w_ + size;  // in from the right
      o.y = rng.range(-size, h_ * 0.75f);
    } else {
      o.x = rng.range(0, w_ + size);  // in from the top
      o.y = -size;
    }
    return o;
  }

  const Variant *variant_ = &VARIANTS[0];
  const Sequence *seq_[KINDS];
  int pool_[32];
  int pool_size_ = 0;
  int w_ = 0, h_ = 0;
  int objects_n_ = 0;
  Object objects_[MAX_OBJECTS];
  Rect drawn_[MAX_OBJECTS];
};

/* ------------------------------------------------------------ text */

/* The big toaster across two cells, wing up, level and down. */
const char *const BIG[3][8] = {
    {".........#", "........##", ".#.#...##.", "#####.##..", "#######...", "#####.....", "#####.....",
     ".###......"},
    {"..........", "..........", ".#.#......", "#####.....", "##########", "#####.###.", "#####.....",
     ".###......"},
    {"..........", "..........", ".#.#......", "#####.....", "#######...", "#####.##..", "#####..##.",
     ".###....##"},
};
const int BIG_FLAP[] = {0, 1, 2, 1};
/* A far-off toaster in one cell, wing up and down. */
const char *const FAR[2][8] = {
    {".....", ".....", "....#", ".#.#.", "####.", "###..", ".#...", "....."},
    {".....", ".....", ".....", ".#.#.", "#####", "###.#", ".#...", "....."},
};
/* A slice of toast tumbling, and one with butter on. */
const char *const TOAST[4][8] = {
    {".....", ".###.", "#...#", "#...#", "#...#", "#####", ".....", "....."},
    {".....", "..##.", ".#..#", "#...#", ".#..#", "..##.", ".....", "....."},
    {".....", ".....", "####.", "#...#", "#...#", "####.", ".....", "....."},
    {".....", ".##..", "#..#.", "#...#", "#..#.", ".##..", ".....", "....."},
};
const char *const BUTTER[8] = {".....", ".###.", "#...#", "#.#.#", "#...#", "#####", ".....", "....."};

enum { G_BIG_L, G_BIG_R, G_FAR, G_TOAST, G_BUTTER };

/* Big toasters (6000, 1000, 1001 together), far ones, toast, buttered toast:
   weights from FLEET, speeds as a share of the screen a second, as there. */
struct TextKind {
  uint8_t weight;
  uint8_t cells;
  float speed;  // fraction of the screen's width a second
};
const TextKind TEXT_FLEET[] = {{8, 2, 110 / 1024.0f}, {5, 1, 46 / 1024.0f}, {4, 1, 90 / 1024.0f}, {4, 1, 90 / 1024.0f}};

class ToastersText : public TextSaver {
 public:
  void start(TextScreen &t) override {
    cols_ = t.cols();
    rows_ = t.rows();
    /* A cell is 6 dots across and 9 down with its gap, so the 2:1 heading is
       a row for every three cells. */
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
      float v = TEXT_FLEET[o.kind].speed * cols_ * 6;  // dots a second
      o.x -= v * dt / 6;
      o.y += v * 0.5f * dt / 9;
      if (o.x < -2 || o.y >= rows_)
        o = launch(false);
    }
    draw(t);
  }

 private:
  static const int MAX = 8;
  struct Obj {
    int kind;
    float x, y;  // in cells
  };

  Obj launch(bool scattered) {
    int total = 0;
    for (const TextKind &k : TEXT_FLEET)
      total += k.weight;
    int pick = rng.below(total), kind = 0;
    while (pick >= TEXT_FLEET[kind].weight)
      pick -= TEXT_FLEET[kind++].weight;
    Obj o;
    o.kind = kind;
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
    int flap = BIG_FLAP[(int) (clock_ * 6) % 4];
    glyph_from_art(BIG[flap], 0, bits);
    t.glyph(G_BIG_L, bits);
    glyph_from_art(BIG[flap], 5, bits);
    t.glyph(G_BIG_R, bits);
    glyph_from_art(FAR[(int) (clock_ * 4) % 2], 0, bits);
    t.glyph(G_FAR, bits);
    glyph_from_art(TOAST[(int) (clock_ * 5) % 4], 0, bits);
    t.glyph(G_TOAST, bits);
    glyph_from_art(BUTTER, 0, bits);
    t.glyph(G_BUTTER, bits);

    t.clear();
    /* Far things first, so the big toasters cover them. */
    for (int pass = 1; pass >= 0; pass--) {
      for (int i = 0; i < n_; i++) {
        const Obj &o = objects_[i];
        bool big = TEXT_FLEET[o.kind].cells == 2;
        if (big != (pass == 0))
          continue;
        int c = (int) floorf(o.x), r = (int) floorf(o.y);
        if (big) {
          t.put(c, r, G_BIG_L);
          t.put(c + 1, r, G_BIG_R);
        } else {
          t.put(c, r, o.kind == 1 ? G_FAR : o.kind == 2 ? G_TOAST : G_BUTTER);
        }
      }
    }
  }

  int cols_ = 16, rows_ = 2, n_ = 0;
  float clock_ = 0;
  Obj objects_[MAX];
};

}  // namespace

Saver *make_toasters() { return new Toasters(); }
TextSaver *make_toasters_text() { return new ToastersText(); }

AD_REGISTER_SAVER("toasters", make_toasters, make_toasters_text)

}  // namespace adcore
#endif
