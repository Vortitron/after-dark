/*
 * ad_fishpro.cpp - Fish Pro, on FISHPRO.AD's own artwork. A port of
 * all/modules/fishpro.js, which was matched against the module under Wine;
 * see that file for what was measured (where each fish's head, tail and fins
 * sit on its body, the sea floor's one arrangement, fish at 17 to 47 px/s,
 * bubbles at about 50) and what is still a guess.
 *
 * Defaults are the module's: Fish School (14), Show Sea Floor Static, every
 * species (but see Species below). The Caps Lock scatter isn't here: there is no keyboard.
 *
 * Species: which ones swim is chosen when the firmware is built, so only
 * their colour art goes in. The YAML's `fishpro: {species: [...]}` defines
 * AD_FISHPRO_PICKED and one AD_FISHPRO_<SPECIES> each; with none of that (the
 * host renderer, or a plain AD_SAVER_FISHPRO), all nine swim. Each species'
 * colour art is its own header, the scenery another (80 KB, always in):
 *
 *   art2c.py all/art/fishpro fishpro_<species> --seq <id> -o ad_art_fishpro_<species>.h
 *     3010 yellow_tang 47 KB, 3020 red_clown 41 KB, 3030 blue_tanger 12 KB,
 *     3040 trigger_fish 14 KB, 3050 pink_squirrel 17 KB, 3070 butterfly_fish
 *     17 KB, 3080 emperor 13 KB, 3060 jellyfish 21 KB, 3110 sardines 6 KB
 *   art2c.py all/art/fishpro fishpro_sea --seq 5000,5010,5020,6020,7000 -o ad_art_fishpro_sea.h
 *
 * The 1-bit sets hold all nine (they are small), and the choice only decides
 * which of them swim. For N = 3, 4, 6:
 *
 *   art2c.py all/art/fishpro fishpro_mN --scale 1/N --mono --threshold 45 \
 *     --edge 40 --seq 3010,3020,3030,3040,3050,3060,3070,3080,3110
 *   art2c.py all/art/fishpro fishpro_sea_mN --scale 1/N --mono --threshold 60 \
 *     --edge 15 --seq 5000,5020,6020,7000
 *   art2c.py all/art/fishpro fishpro_floor_mN --scale 1/N --mono --threshold 100 \
 *     --edge 10 --seq 5010
 *
 * Small screens: on a 1-bit panel all nine species and the scenery come
 * shrunk and baked to black and white by tools/art2c.py --mono, at 1/3, 1/4 or 1/6 size
 * by screen height. The fish, the scenery and the sand are baked apart, each
 * at the threshold that reads: the fish bright (or the dark ones vanish into
 * the black), the rocks and coral dark with their highlights (or the heaps
 * outshine the fish), and the sand in between so its ripples show. Everything the JS measures in pixels - the scenery's places, the
 * pieces' offsets, speeds, drift, the bubbles - is scaled with the art, and
 * the school is thinned as toasters thins its fleet.
 *
 * The JS repaints everything each frame. This puts the water and scenery
 * back only where a fish or a bubble was, then draws them all again, back to
 * front, which comes to the same picture.
 *
 * On a character LCD (FishProText) a handful of hand-drawn fish, one 5x8 cell
 * each and their tails swishing, swim both ways at their own speeds, with
 * bubbles going up the right-hand end.
 */
#if defined(AD_SAVER_FISHPRO) || defined(AD_ALL_SAVERS)
#include <vector>
#include "ad_art.h"
#include "ad_text.h"
/* No species chosen: all nine. */
#ifndef AD_FISHPRO_PICKED
#define AD_FISHPRO_YELLOW_TANG
#define AD_FISHPRO_RED_CLOWN
#define AD_FISHPRO_BLUE_TANGER
#define AD_FISHPRO_TRIGGER_FISH
#define AD_FISHPRO_PINK_SQUIRREL
#define AD_FISHPRO_BUTTERFLY_FISH
#define AD_FISHPRO_EMPEROR
#define AD_FISHPRO_JELLYFISH
#define AD_FISHPRO_SARDINES
#endif

#ifndef AD_MONO_ONLY  // a 1-bit build leaves the colour art out
#include "ad_art_fishpro_sea.h"
#ifdef AD_FISHPRO_YELLOW_TANG
#include "ad_art_fishpro_yellow_tang.h"
#endif
#ifdef AD_FISHPRO_RED_CLOWN
#include "ad_art_fishpro_red_clown.h"
#endif
#ifdef AD_FISHPRO_BLUE_TANGER
#include "ad_art_fishpro_blue_tanger.h"
#endif
#ifdef AD_FISHPRO_TRIGGER_FISH
#include "ad_art_fishpro_trigger_fish.h"
#endif
#ifdef AD_FISHPRO_PINK_SQUIRREL
#include "ad_art_fishpro_pink_squirrel.h"
#endif
#ifdef AD_FISHPRO_BUTTERFLY_FISH
#include "ad_art_fishpro_butterfly_fish.h"
#endif
#ifdef AD_FISHPRO_EMPEROR
#include "ad_art_fishpro_emperor.h"
#endif
#ifdef AD_FISHPRO_JELLYFISH
#include "ad_art_fishpro_jellyfish.h"
#endif
#ifdef AD_FISHPRO_SARDINES
#include "ad_art_fishpro_sardines.h"
#endif
#endif
#ifndef AD_COLOUR_ONLY  // a colour build leaves the 1-bit art out
#include "ad_art_fishpro_m3.h"
#include "ad_art_fishpro_sea_m3.h"
#include "ad_art_fishpro_m4.h"
#include "ad_art_fishpro_sea_m4.h"
#include "ad_art_fishpro_m6.h"
#include "ad_art_fishpro_sea_m6.h"
#include "ad_art_fishpro_floor_m3.h"
#include "ad_art_fishpro_floor_m4.h"
#include "ad_art_fishpro_floor_m6.h"
#endif

namespace adcore {

namespace {

/* A piece is a run of frames butted onto the body: frames first..last, dx
   its left edge (or its right edge, if `right`) and cy its middle, from the
   body's top left, in the art's own pixels. */
struct Piece {
  uint8_t first, last;
  int8_t dx, cy;
  bool right;
};

struct Species {
  uint16_t id;
  uint8_t body_lo, body_hi;
  const uint8_t *pivot;
  uint8_t pivots;
  int8_t faces;  // -1 left, +1 right, 0 neither (never mirrored)
  Piece pieces[2];
  uint8_t npieces;
};

const uint8_t PIVOT_TANG[] = {5, 6, 7};
const uint8_t PIVOT_CLOWN[] = {11, 10, 9, 8, 7, 6, 5, 4};

/* From fishpro.js's SPECIES. */
const Species SPECIES[] = {
    {3010, 0, 4, PIVOT_TANG, 3, -1, {}, 0},                                         // Yellow Tang
    {3020, 12, 18, PIVOT_CLOWN, 8, -1, {}, 0},                                      // Red Clown
    {3030, 0, 0, nullptr, 0, -1, {{6, 8, -27, 27, false}, {9, 16, 62, 27, false}}, 2},  // Blue Tanger
    {3040, 0, 2, nullptr, 0, -1, {{3, 4, -12, 36, false}, {5, 6, 79, 32, false}}, 2},   // Trigger Fish
    {3050, 0, 0, nullptr, 0, -1, {{10, 13, 26, 43, false}, {15, 18, 87, 22, false}}, 2},  // Pink Squirrel
    {3070, 0, 3, nullptr, 0, 1, {{4, 10, 6, 34, true}}, 1},                           // Butterfly Fish
    {3080, 0, 0, nullptr, 0, -1, {{1, 3, -17, 28, false}, {12, 21, 64, 25, false}}, 2},  // Emperor
    {3060, 0, 4, nullptr, 0, 0, {}, 0},                                             // Jellyfish
    {3110, 0, 4, nullptr, 0, -1, {}, 0},                                            // Sardines
};

/* Each species' colour art, or null where it isn't in this build. */
const Art *const COLOUR_FISH[] = {
#if defined(AD_FISHPRO_YELLOW_TANG) && !defined(AD_MONO_ONLY)
    &art_fishpro_yellow_tang::ART,
#else
    nullptr,
#endif
#if defined(AD_FISHPRO_RED_CLOWN) && !defined(AD_MONO_ONLY)
    &art_fishpro_red_clown::ART,
#else
    nullptr,
#endif
#if defined(AD_FISHPRO_BLUE_TANGER) && !defined(AD_MONO_ONLY)
    &art_fishpro_blue_tanger::ART,
#else
    nullptr,
#endif
#if defined(AD_FISHPRO_TRIGGER_FISH) && !defined(AD_MONO_ONLY)
    &art_fishpro_trigger_fish::ART,
#else
    nullptr,
#endif
#if defined(AD_FISHPRO_PINK_SQUIRREL) && !defined(AD_MONO_ONLY)
    &art_fishpro_pink_squirrel::ART,
#else
    nullptr,
#endif
#if defined(AD_FISHPRO_BUTTERFLY_FISH) && !defined(AD_MONO_ONLY)
    &art_fishpro_butterfly_fish::ART,
#else
    nullptr,
#endif
#if defined(AD_FISHPRO_EMPEROR) && !defined(AD_MONO_ONLY)
    &art_fishpro_emperor::ART,
#else
    nullptr,
#endif
#if defined(AD_FISHPRO_JELLYFISH) && !defined(AD_MONO_ONLY)
    &art_fishpro_jellyfish::ART,
#else
    nullptr,
#endif
#if defined(AD_FISHPRO_SARDINES) && !defined(AD_MONO_ONLY)
    &art_fishpro_sardines::ART,
#else
    nullptr,
#endif
};
/* Whether each species swims. */
const bool PICKED[] = {
#ifdef AD_FISHPRO_YELLOW_TANG
    true,
#else
    false,
#endif
#ifdef AD_FISHPRO_RED_CLOWN
    true,
#else
    false,
#endif
#ifdef AD_FISHPRO_BLUE_TANGER
    true,
#else
    false,
#endif
#ifdef AD_FISHPRO_TRIGGER_FISH
    true,
#else
    false,
#endif
#ifdef AD_FISHPRO_PINK_SQUIRREL
    true,
#else
    false,
#endif
#ifdef AD_FISHPRO_BUTTERFLY_FISH
    true,
#else
    false,
#endif
#ifdef AD_FISHPRO_EMPEROR
    true,
#else
    false,
#endif
#ifdef AD_FISHPRO_JELLYFISH
    true,
#else
    false,
#endif
#ifdef AD_FISHPRO_SARDINES
    true,
#else
    false,
#endif
};
const int NSPECIES = sizeof(SPECIES) / sizeof(SPECIES[0]);

const uint16_t FLOOR = 5010, ROCKS = 5000, CORAL = 5020, BUBBLES = 7000, ANEMONE = 6020;
const int SCHOOL = 14;
const float SWIM = 3.5f;     // broadside cycle, frames a second
const float PIVOT = 14;      // how fast it goes through the turn
const float OPEN = 3;        // anemone open/close, frames a second
const float BUBBLE = 6;
const float RISE = 50;       // px a second, bubbles going up
const float MAX_STEP = 0.05f;
const int MAX_FISH = 25;     // University
const int MAX_STREAMS = 6;

/* Frame `f` with its top left at (x0, y0), mirrored if `flip`. Clipped. */
Rect blit(Surface &s, const Art &art, const Frame &f, int x0, int y0, bool flip) {
  const int sw = s.width(), sh = s.height();
  const uint8_t *p = art.data + f.offset;
  for (int y = y0; y < y0 + f.h; y++) {
    int x = 0;
    for (;;) {
      uint8_t skip = *p++, run = *p++;
      if (run == 0) {
        if (skip == 0)
          break;
        x += skip;
        continue;
      }
      x += skip;
      if (y >= 0 && y < sh) {
        if (!flip) {
          int a = x0 + x < 0 ? -(x0 + x) : 0;
          int b = x0 + x + run > sw ? sw - x0 - x : run;
          if (b > a)
            s.span(x0 + x + a, y, b - a, p + a, art.palette);
        } else {
          for (int i = 0; i < run; i++) {
            int X = x0 + f.w - 1 - (x + i);
            if (X >= 0 && X < sw) {
              const uint8_t *c = art.palette + 3 * p[i];
              s.pixel(X, y, {c[0], c[1], c[2]});
            }
          }
        }
      }
      x += run;
      p += run;
    }
  }
  return s.clip({x0, y0, f.w, f.h});
}

/* Only what falls inside `r` gets through, to put back a bit of the tank. */
class ClipSurface : public Surface {
 public:
  ClipSurface(Surface &t, Rect r) : t_(t), r_(t.clip(r)) {}
  int width() const override { return t_.width(); }
  int height() const override { return t_.height(); }
  bool mono() const override { return t_.mono(); }
  void pixel(int x, int y, Rgb c) override {
    if (x >= r_.x && y >= r_.y && x < r_.x + r_.w && y < r_.y + r_.h)
      t_.pixel(x, y, c);
  }
  void fill_rect(int x, int y, int w, int h, Rgb c) override {
    int x0 = x > r_.x ? x : r_.x, y0 = y > r_.y ? y : r_.y;
    int x1 = x + w < r_.x + r_.w ? x + w : r_.x + r_.w, y1 = y + h < r_.y + r_.h ? y + h : r_.y + r_.h;
    if (x1 > x0 && y1 > y0)
      t_.fill_rect(x0, y0, x1 - x0, y1 - y0, c);
  }
  void span(int x, int y, int n, const uint8_t *index, const uint8_t *palette) override {
    if (y < r_.y || y >= r_.y + r_.h)
      return;
    int a = x < r_.x ? r_.x - x : 0, b = x + n > r_.x + r_.w ? r_.x + r_.w - x : n;
    if (b > a)
      t_.span(x + a, y, b - a, index + a, palette);
  }
  Rect rect() const { return r_; }

 private:
  Surface &t_;
  Rect r_;
};

bool overlaps(const Rect &a, const Rect &b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

Rect join(const Rect &a, const Rect &b) {
  if (a.empty())
    return b;
  if (b.empty())
    return a;
  int x0 = a.x < b.x ? a.x : b.x, y0 = a.y < b.y ? a.y : b.y;
  int x1 = a.x + a.w > b.x + b.w ? a.x + a.w : b.x + b.w, y1 = a.y + a.h > b.y + b.h ? a.y + a.h : b.y + b.h;
  return {x0, y0, x1 - x0, y1 - y0};
}

struct Variant {
  const Art *art;    // the fish, or null for COLOUR_FISH
  const Art *sea;    // the rocks, coral, anemones and bubbles
  const Art *floor;  // the sand
  float scale;
  bool mono;
  int min_height;
};
const Variant VARIANTS[] = {
#ifndef AD_MONO_ONLY
    {nullptr, &art_fishpro_sea::ART, &art_fishpro_sea::ART, 1, false, 0},
#endif
#ifndef AD_COLOUR_ONLY
    {&art_fishpro_m3::ART, &art_fishpro_sea_m3::ART, &art_fishpro_floor_m3::ART, 1 / 3.0f, true, 96},
    {&art_fishpro_m4::ART, &art_fishpro_sea_m4::ART, &art_fishpro_floor_m4::ART, 1 / 4.0f, true, 56},
    {&art_fishpro_m6::ART, &art_fishpro_sea_m6::ART, &art_fishpro_floor_m6::ART, 1 / 6.0f, true, 0},
#endif
};

struct Kind {
  const Species *spec;
  const Art *art;
  const Sequence *seq;
  float width, height;
};

struct Fish {
  int kind;
  float depth, speed, x, y, drift, cycle, turn;
  int turning;
  bool right;
};

struct Prop {
  const Sequence *seq;
  float frame;
  bool still, flip;
  float x, y;
  Rect box;
};

struct Stream {
  float x, y, frame;
};

class FishPro : public Saver {
 public:
  int count = SCHOOL;
  int sea_floor = 1;  // None, Static, Animated

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
    k_ = variant_->scale;
    nkinds_ = 0;
    for (int i = 0; i < NSPECIES; i++) {
      const Art *art = variant_->art ? variant_->art : COLOUR_FISH[i];
      const Sequence *seq = PICKED[i] && art ? art->sequence(SPECIES[i].id) : nullptr;
      if (!seq)
        continue;
      Kind &kd = kinds_[nkinds_++];
      kd.spec = &SPECIES[i];
      kd.art = art;
      kd.seq = seq;
      /* How big the fish is once its pieces are on, which is what the edge
         tests want rather than the sequence's nominal size. */
      Rect box = piece_box(kd, kd.spec->body_lo, 0);
      kd.width = box.w;
      kd.height = box.h > seq->h ? box.h : seq->h;
    }
    floor_ = sea_floor ? variant_->floor->sequence(FLOOR) : nullptr;
    bubbles_ = variant_->sea->sequence(BUBBLES);

    n_ = nkinds_ ? count : 0;  // nothing to show if no species is in the build
    if (k_ < 1 && n_) {
      n_ = (int) roundf(count * k_ * 1.5f);
      if (n_ < 3)
        n_ = 3;
    }
    if (n_ > MAX_FISH)
      n_ = MAX_FISH;
    for (int i = 0; i < n_; i++) {
      fish_[i] = spawn(true);
      drawn_[i] = {0, 0, 0, 0};
    }
    sort();
    place_props();
    nstreams_ = 0;
    next_bubble_ = 1;
    for (Rect &r : stream_drawn_)
      r = {0, 0, 0, 0};

    s.clear();
    background(s);
  }

  void frame(Surface &s, float dt) override {
    while (dt > 0) {
      float step = dt > MAX_STEP ? MAX_STEP : dt;
      tick(step);
      dt -= step;
    }

    /* Put the water and scenery back where things were. */
    for (int i = 0; i < n_; i++)
      background(s, drawn_[i]);
    for (Rect &r : stream_drawn_) {
      background(s, r);
      r = {0, 0, 0, 0};
    }
    if (sea_floor == 2) {
      for (PropSlot &p : props_)
        if (!p.still) {
          int f = pingpong(p.frame, p.seq->count);
          if (f != p.shown) {
            p.shown = f;
            background(s, p.box);
          }
        }
    }

    for (int i = 0; i < n_; i++)
      drawn_[i] = draw_fish(s, fish_[i]);
    for (int i = 0; i < nstreams_; i++) {
      const Stream &st = streams_[i];
      stream_drawn_[i] = draw_centred(s, *variant_->sea, *bubbles_, (int) floorf(st.frame), st.x, st.y, false);
    }
  }

 private:
  struct PropSlot : Prop {
    int shown;
  };

  /* -------------------------------------------------------- the fish -- */

  /* Where piece frame `n` sits from the body's top left. */
  void place(const Kind &kd, const Piece &pc, int n, int &x, int &y, const Frame *&f) const {
    f = &kd.seq->frames[n];
    x = pc.right ? round_half_up(pc.dx * k_) - f->w : round_half_up(pc.dx * k_);
    y = round_half_up(pc.cy * k_ - f->h / 2.0f);
  }

  /* The whole fish's box: body frame `b` plus each piece at step `t`. */
  Rect piece_box(const Kind &kd, int b, int t) const {
    const Frame &body = kd.seq->frames[b];
    int x0 = 0, y0 = 0, x1 = body.w, y1 = body.h;
    for (int i = 0; i < kd.spec->npieces; i++) {
      const Piece &pc = kd.spec->pieces[i];
      int x, y;
      const Frame *f;
      place(kd, pc, pc.first + t % (pc.last - pc.first + 1), x, y, f);
      x0 = x < x0 ? x : x0;
      y0 = y < y0 ? y : y0;
      x1 = x + f->w > x1 ? x + f->w : x1;
      y1 = y + f->h > y1 ? y + f->h : y1;
    }
    return {x0, y0, x1 - x0, y1 - y0};
  }

  float floor_height() const { return floor_ ? floor_->h : 0; }

  /* Depth is what the art asks for and the resources don't record: back to
     front at random, every fish at its own size. */
  Fish spawn(bool anywhere) {
    Fish f;
    f.kind = rng.below(nkinds_);
    const Kind &kd = kinds_[f.kind];
    f.depth = rng.uniform();
    f.right = rng.uniform() < 0.5f;
    float deep = h_ - floor_height();
    float high = kd.height * 0.6f;
    /* The jellyfish hardly moves; the fish swim at 17 to 47 px a second. */
    float pace = kd.spec->faces == 0 ? rng.range(1, 4) : 17 + f.depth * 30;
    f.speed = pace * k_ * (f.right ? 1 : -1);
    f.x = anywhere ? rng.range(0, w_) : (f.right ? -kd.width : w_ + kd.width);
    float lo = deep - high * 0.4f;
    f.y = rng.range(high, lo > high + 1 ? lo : high + 1);
    f.drift = rng.range(-7, 7) * k_;
    f.cycle = rng.range(0, 8);
    f.turn = 0;
    f.turning = 0;
    return f;
  }

  /* Back of the tank first, so the near fish pass in front. */
  void sort() {
    for (int i = 1; i < n_; i++) {
      Fish f = fish_[i];
      Rect r = drawn_[i];
      int j = i;
      while (j > 0 && fish_[j - 1].depth > f.depth) {
        fish_[j] = fish_[j - 1];
        drawn_[j] = drawn_[j - 1];
        j--;
      }
      fish_[j] = f;
      drawn_[j] = r;
    }
  }

  void tick(float dt) {
    bool resort = false;
    for (int i = 0; i < n_; i++) {
      Fish &f = fish_[i];
      const Kind &kd = kinds_[f.kind];
      const Species &sp = *kd.spec;
      if (f.turning) {
        f.turn += PIVOT * dt * f.turning;
        if (f.turn >= sp.pivots) {
          /* Edge-on: this is where the mirror happens and the pivot runs back. */
          f.turn = sp.pivots - 0.001f;
          f.turning = -1;
          f.right = !f.right;
          f.speed = -f.speed;
        } else if (f.turn <= 0) {
          f.turn = 0;
          f.turning = 0;
        }
      } else {
        f.x += f.speed * dt;
        f.y += f.drift * dt;
        f.cycle += SWIM * dt;
      }
      float high = kd.height * 0.55f;
      float deep = h_ - floor_height() - high * 0.3f;
      if (f.y < high || f.y > deep) {
        f.drift = -f.drift;
        f.y = f.y < high ? high : f.y;
        f.y = f.y > deep ? deep : f.y;
      }
      /* Turn round before swimming off, if the species has the art for it. */
      float pad = kd.width;
      bool out = f.speed > 0 ? f.x > w_ - pad * 0.4f : f.x < pad * 0.4f;
      if (out && !f.turning) {
        if (sp.pivots) {
          f.turning = 1;
        } else {
          f.speed = -f.speed;
          f.right = !f.right;
        }
      }
      if (f.x < -pad * 2 || f.x > w_ + pad * 2) {
        fish_[i] = spawn(false);
        resort = true;
      }
    }
    /* A replacement arrives at a new depth, so the order is redone. */
    if (resort)
      sort();

    for (PropSlot &p : props_)
      if (!p.still && sea_floor == 2)
        p.frame += OPEN * dt;
    /* Bubbles go up from the right-hand heap, a cluster every few seconds,
       all the way to the top. */
    if (bubbles_ && sea_floor) {
      next_bubble_ -= dt;
      if (next_bubble_ <= 0) {
        next_bubble_ = rng.range(4, 7);
        if (nstreams_ < MAX_STREAMS)
          streams_[nstreams_++] = {w_ - rng.range(130, 170) * k_, h_ - 70 * k_, rng.range(0, 6)};
      }
    }
    for (int i = nstreams_ - 1; i >= 0; i--) {
      Stream &st = streams_[i];
      st.frame += BUBBLE * dt;
      st.y -= RISE * k_ * dt;
      if (st.y < -bubbles_->h) {
        /* Every stream's last box is put back each frame, so it can go. */
        for (int j = i; j < nstreams_ - 1; j++)
          streams_[j] = streams_[j + 1];
        nstreams_--;
      }
    }
  }

  /* The whole fish, body and pieces, centred on it and mirrored as a unit. */
  Rect draw_fish(Surface &s, const Fish &f) {
    const Kind &kd = kinds_[f.kind];
    const Species &sp = *kd.spec;
    const Art &art = *kd.art;
    int t = (int) floorf(f.cycle), b;
    bool pieces = false;
    if (f.turning) {
      int i = (int) floorf(f.turn);
      b = sp.pivot[i < sp.pivots - 1 ? i : sp.pivots - 1];
    } else {
      b = sp.body_lo + (sp.body_hi > sp.body_lo ? t % (sp.body_hi - sp.body_lo + 1) : 0);
      pieces = true;
    }
    const Frame &body = kd.seq->frames[b];
    Rect box = pieces ? piece_box(kd, b, t) : Rect{0, 0, body.w, body.h};
    float ox = -(box.x + box.x + box.w) / 2.0f, oy = -(box.y + box.y + box.h) / 2.0f;
    bool flip = sp.faces != 0 && (f.right ? sp.faces < 0 : sp.faces > 0);
    int rx = round_half_up(f.x), ry = round_half_up(f.y);
    auto part = [&](const Frame &fr, float lx, float ly) {
      int x = round_half_up(lx), y = round_half_up(ly);
      int X = flip ? rx - x - fr.w : rx + x;
      return blit(s, art, fr, X, ry + y, flip);
    };
    Rect r = part(body, ox, oy);
    if (pieces)
      for (int i = 0; i < sp.npieces; i++) {
        const Piece &pc = sp.pieces[i];
        int x, y;
        const Frame *fr;
        place(kd, pc, pc.first + t % (pc.last - pc.first + 1), x, y, fr);
        r = join(r, part(*fr, ox + x, oy + y));
      }
    return r;
  }

  /* ------------------------------------------------------- scenery -- */

  /* As ad.js's Sequence.draw with flipX: centred on (cx, cy). */
  static Rect draw_centred(Surface &s, const Art &art, const Sequence &seq, int index, float cx, float cy,
                           bool flip) {
    const Frame &f = seq.frames[((index % seq.count) + seq.count) % seq.count];
    int x0, y0;
    if (!flip) {
      x0 = round_half_up(cx - f.w / 2.0f);
      y0 = round_half_up(cy - f.h / 2.0f);
    } else {
      x0 = round_half_up(cx) - (round_half_up(-f.w / 2.0f) + f.w);
      y0 = round_half_up(cy) + round_half_up(-f.h / 2.0f);
    }
    return blit(s, art, f, x0, y0, flip);
  }

  static int pingpong(float frame, int count) {
    int span = (count - 1) * 2;
    if (span == 0)
      span = 1;
    int t = (int) floorf(frame) % span;
    return t < count ? t : span - t;
  }

  /* The module's own arrangement, measured off the capture at 1024x768:
     [sequence, frame, left edge from the screen's left (or, on the right-hand
     heap, the same from its right), its bottom's height above the screen's
     bottom, mirrored]. */
  void place_props() {
    props_.clear();
    props_.reserve(16);
    if (!sea_floor)
      return;
    struct Put {
      uint16_t id;
      uint8_t frame;
      int16_t x, up;
      bool flip, right, still;
    };
    static const Put HEAP[] = {{ROCKS, 1, 0, 0, false, false, true},
                               {ROCKS, 2, 75, 0, false, false, true},
                               {CORAL, 2, 49, 0, true, false, true},
                               {CORAL, 3, 115, 0, true, false, true},
                               {CORAL, 4, 172, 0, true, false, true}};
    static const Put MORE[] = {{CORAL, 1, 285, 34, false, false, true},
                               /* A boulder in front of the coral, and its partner on the right. */
                               {CORAL, 4, 290, 0, true, false, true},
                               {CORAL, 4, 211, 0, true, true, true},
                               /* An anemone on each heap, open. Its six frames are it opening. */
                               {ANEMONE, 5, 305, 27, true, false, false},
                               {ANEMONE, 5, 279, 23, true, true, false}};
    for (int side = 0; side < 2; side++)
      for (const Put &p : HEAP)
        put(p.id, p.frame, p.x, p.up, p.flip, side == 1, p.still);
    for (const Put &p : MORE)
      put(p.id, p.frame, p.x, p.up, p.flip, p.right, p.still);
  }

  void put(uint16_t id, int frame, int x, int up, bool flip, bool right, bool still) {
    const Sequence *seq = variant_->sea->sequence(id);
    if (!seq || props_.size() >= props_.capacity())
      return;
    const Frame &f = seq->frames[frame % seq->count];
    float left = right ? w_ - (x * k_ + f.w) : x * k_;
    PropSlot p;
    p.seq = seq;
    p.frame = frame;
    p.still = still;
    p.flip = flip;
    p.x = left + f.w / 2.0f;
    p.y = h_ - up * k_ - f.h / 2.0f;
    p.shown = frame % seq->count;
    /* The box every frame of it fits in, to put it back. */
    int bw = 0, bh = 0;
    for (int i = 0; i < seq->count; i++) {
      bw = seq->frames[i].w > bw ? seq->frames[i].w : bw;
      bh = seq->frames[i].h > bh ? seq->frames[i].h : bh;
    }
    p.box = {(int) floorf(p.x - bw / 2.0f) - 1, (int) floorf(p.y - bh / 2.0f) - 1, bw + 2, bh + 2};
    props_.push_back(p);
  }

  /* The sea floor and scenery inside `r` (all of it, by default). */
  void background(Surface &s, Rect r = {0, 0, 0x7fff, 0x7fff}) {
    r = s.clip(r);
    if (r.empty())
      return;
    ClipSurface c(s, r);
    c.fill_rect(r.x, r.y, r.w, r.h, BLACK);
    if (!sea_floor)
      return;
    if (floor_) {
      /* The sand, centred, and repeated out to the sides of a wide screen. */
      const Frame &f = floor_->frames[0];
      float fw = f.w, x0 = w_ / 2.0f - fw / 2;
      Rect band = {0, h_ - f.h - 1, w_, f.h + 2};
      if (overlaps(band, r)) {
        while (x0 > 0)
          x0 -= fw;
        for (float x = x0; x < w_; x += fw)
          draw_centred(c, *variant_->floor, *floor_, 0, x + fw / 2, h_ - f.h / 2.0f, false);
      }
    }
    for (const PropSlot &p : props_) {
      if (!overlaps(p.box, r))
        continue;
      int index = p.still || sea_floor != 2 ? (int) p.frame : pingpong(p.frame, p.seq->count);
      draw_centred(c, *variant_->sea, *p.seq, index, p.x, p.y, p.flip);
    }
  }

  const Variant *variant_ = &VARIANTS[0];
  float k_ = 1;
  int w_ = 0, h_ = 0;
  Kind kinds_[NSPECIES];
  int nkinds_ = 0;
  const Sequence *floor_ = nullptr, *bubbles_ = nullptr;
  Fish fish_[MAX_FISH];
  Rect drawn_[MAX_FISH];
  int n_ = 0;
  std::vector<PropSlot> props_;
  Stream streams_[MAX_STREAMS];
  Rect stream_drawn_[MAX_STREAMS];
  int nstreams_ = 0;
  float next_bubble_ = 1;
};


/* ------------------------------------------------------------ text */

/* A fish facing left, its tail one way and the other, and a deep-bodied one
   like the tangs; mirrored for the ones swimming right. And a bubble. */
const char *const SMALL[2][8] = {
    {".....", ".....", ".##.#", "#.###", "#####", ".##.#", ".....", "....."},
    {".....", ".....", ".##..", "#.###", "#####", ".####", ".....", "....."},
};
const char *const DEEP[8] = {"..#..", ".###.", "##.##", "#####", "#####", ".####", "..#..", "....."};
const char *const BUBBLE_ART[2][8] = {
    {".....", "...#.", "..#.#", "...#.", ".....", ".#...", "#.#..", ".#..."},
    {"..#..", ".#.#.", "..#..", ".....", "..#..", ".#.#.", "..#..", "....."},
};
enum { G_SMALL_L0, G_SMALL_L1, G_SMALL_R0, G_SMALL_R1, G_DEEP_L, G_DEEP_R, G_BUBBLE };

void glyph_mirrored(const char *const art[8], bool mirror, uint8_t out[8]) {
  glyph_from_art(art, 0, out);
  if (!mirror)
    return;
  for (int y = 0; y < 8; y++) {
    uint8_t b = 0;
    for (int x = 0; x < 5; x++)
      if (out[y] & (0x10 >> x))
        b |= 1 << x;
    out[y] = b;
  }
}

/* A few fish a cell each, back and forth at their own speeds (17 to 47 px a
   second on a 1024-wide screen, as a share of the panel's width), turning
   round at the sides as the ones without a pivot do; bubbles going up. */
class FishProText : public TextSaver {
 public:
  void start(TextScreen &t) override {
    cols_ = t.cols();
    rows_ = t.rows();
    uint8_t bits[8];
    for (int m = 0; m < 2; m++) {
      for (int k = 0; k < 2; k++) {
        glyph_mirrored(SMALL[k], m == 1, bits);
        t.glyph(G_SMALL_L0 + m * 2 + k, bits);
      }
      glyph_mirrored(DEEP, m == 1, bits);
      t.glyph(G_DEEP_L + m, bits);
    }
    n_ = cols_ * rows_ / 8;
    if (n_ < 2)
      n_ = 2;
    if (n_ > MAX)
      n_ = MAX;
    for (int i = 0; i < n_; i++) {
      Swimmer &f = fish_[i];
      f.deep = i % 3 == 1;  // a mix of the two
      f.right = rng.uniform() < 0.5f;
      f.speed = (17 + rng.uniform() * 30) / 1024 * cols_ * (f.right ? 1 : -1);
      f.x = rng.range(0, cols_);
      f.row = rng.below(rows_);
      f.cycle = rng.range(0, 2);
    }
    bubble_ = -1;
    next_bubble_ = 1;
    clock_ = 0;
    t.clear();
    draw(t);
  }

  void frame(TextScreen &t, float dt) override {
    clock_ += dt;
    for (int i = 0; i < n_; i++) {
      Swimmer &f = fish_[i];
      f.x += f.speed * dt;
      f.cycle += SWIM * dt;
      if (f.speed > 0 ? f.x > cols_ - 1 : f.x < 0) {
        f.speed = -f.speed;
        f.right = !f.right;
      }
    }
    /* A cluster every few seconds from the right-hand end, at 50 px a second
       over a 768-line screen. */
    if (bubble_ < 0) {
      next_bubble_ -= dt;
      if (next_bubble_ <= 0) {
        next_bubble_ = rng.range(4, 7);
        bubble_ = rows_ - 0.01f;
        bubble_col_ = cols_ - 2 - rng.below(2);
      }
    } else {
      bubble_ -= RISE / 768 * rows_ * dt;
    }
    draw(t);
  }

 private:
  static const int MAX = 8;
  struct Swimmer {
    float x, speed, cycle;
    int row;
    bool deep, right;
  };

  void draw(TextScreen &t) {
    uint8_t bits[8];
    glyph_from_art(BUBBLE_ART[(int) (clock_ * 3) % 2], 0, bits);
    t.glyph(G_BUBBLE, bits);
    t.clear();
    if (bubble_ >= 0)
      t.put(bubble_col_, (int) bubble_, G_BUBBLE);
    for (int i = 0; i < n_; i++) {
      const Swimmer &f = fish_[i];
      int code = f.deep ? G_DEEP_L + f.right : G_SMALL_L0 + f.right * 2 + (int) f.cycle % 2;
      t.put((int) floorf(f.x + 0.5f), f.row, code);
    }
  }

  int cols_ = 16, rows_ = 2, n_ = 0;
  Swimmer fish_[MAX];
  float bubble_ = -1, next_bubble_ = 1, clock_ = 0;
  int bubble_col_ = 0;
};

}  // namespace

Saver *make_fishpro() { return new FishPro(); }
TextSaver *make_fishpro_text() { return new FishProText(); }

AD_REGISTER_SAVER("fishpro", make_fishpro, make_fishpro_text)

}  // namespace adcore
#endif
