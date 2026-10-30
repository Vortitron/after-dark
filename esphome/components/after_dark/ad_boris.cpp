/*
 * ad_boris.cpp - Boris, a kitten loose on the screen, on BORIS.AD's own
 * artwork. A port of all/modules/boris.js, which was checked against the
 * real module under Wine; see that file for what was measured (three cats at
 * their own size, walking ~33 px/s, running ~140, the butterfly ~150, sitting
 * two to ten seconds, leaving by the edges and coming back) and what is still
 * a guess (how often each thing happens).
 *
 * Defaults are the site's: three cats, Butterfly Frequently, Color on (Color
 * off, which the JS draws in grey, isn't offered here). The
 * JS paints him on black every frame; this does too, erasing only the boxes
 * it drew last frame.
 *
 * Small screens: on a 1-bit panel the art is shrunk and baked to black and
 * white by tools/art2c.py --mono, at 1/2, 1/3 or 1/4 size by screen height,
 * and every distance and speed in the JS that goes with the cat's size (all
 * of its "* s") shrinks with it. So do the few the JS leaves at 1024x768
 * pixels (the butterfly's edge margins, the cap on a chase's climb), or on a
 * 128x64 panel they would be a third of the screen.
 *
 * On a character LCD (BorisText) one cat, drawn by hand in two 5x8 cells,
 * walks, runs, sits and washes, goes off the sides and comes back, and
 * chases the butterfly when it comes by.
 */
#if defined(AD_SAVER_BORIS) || defined(AD_ALL_SAVERS)
#include <initializer_list>
#include "ad_art.h"
#include "ad_text.h"
#ifndef AD_TEXT_ONLY  // BorisText runs only the simulation, which needs no art
#ifndef AD_MONO_ONLY  // a 1-bit build leaves the colour art out
#include "ad_art_boris.h"
#endif
#ifndef AD_COLOUR_ONLY  // a colour build leaves the 1-bit art out
#include "ad_art_boris_m2.h"
#include "ad_art_boris_m3.h"
#include "ad_art_boris_m4.h"
#endif
#endif

namespace adcore {

namespace {

const float PI = 3.14159265f;

/* The bitmaps in the order they were given to art2c.py, so a sequence's
   number is its place here. */
const uint16_t IDS[] = {1000,  1001,  1002,  1003,  1004,  1005,  1006,  1007,  1050,  1100,  1150,  1200,
                        1250,  1251,  1252,  1253,  1350,  1351,  1352,  1353,  1450,  1600,  1650,  1651,
                        1700,  1701,  1750,  1751,  1752,  1753,  1800,  1801,  1802,  1803,  1850,  1900,
                        1950,  15000, 15001, 15002, 15100, 15101, 15102, 15200, 15202, 15300, 15301, 15302};
const int NIDS = sizeof(IDS) / sizeof(IDS[0]);

/* From boris.js: chance a second a butterfly turns up, for Never .. Frequently
   (Always is `always_fly`). */
const float FLUTTER[] = {0, 0.01f, 0.025f, 0.05f, 0.12f};
const float WALK_SPEED = 33, RUN_SPEED = 140, FLY_SPEED = 150;
const float MAX_STEP = 0.05f;  // the JS's cap on a frame

/*
 * Draw frame `f` of `art` with its top left at (x0, y0), mirrored if `flip`.
 * draw_frame centres and never mirrors; Boris needs both anchors and the
 * mirror (the art faces one way). Clipped to the surface.
 */
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

struct Variant {
  const Art *art;
  float scale;
  bool mono;
  int min_height;
};
const Variant VARIANTS[] = {
#ifdef AD_TEXT_ONLY
    {nullptr, 1 / 6.0f, true, 0},  // never drawn: a character LCD build has only BorisText
#else
#ifndef AD_MONO_ONLY
    {&art_boris::ART, 1, false, 0},
#endif
#ifndef AD_COLOUR_ONLY
    {&art_boris_m2::ART, 1 / 2.0f, true, 96},
    {&art_boris_m3::ART, 1 / 3.0f, true, 48},
    {&art_boris_m4::ART, 1 / 4.0f, true, 0},
#endif
#endif
};

/* One step of a cat's plan, as the JS's {frames, fps, time, vx, vy, arc, ...}. */
struct Step {
  uint16_t frames[8];
  uint8_t nframes;
  float fps, time, vx, vy, arc, stop_at, at;
  bool has_stop, leaving, away, turn, turned;
};

const int MAX_PLAN = 12;

struct Cat {
  float x, y, lift;
  int dir;
  uint16_t frame;
  bool gone;
  Step plan[MAX_PLAN];
  int n;  // steps in the plan
};

struct Fly {
  bool on;
  float x, y, a, t, life, startle;
  bool leaving;
};

const std::initializer_list<uint16_t> WALK = {1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007};
const std::initializer_list<uint16_t> RUN = {1350, 1351, 1352, 1353};
const std::initializer_list<uint16_t> PREEN = {1250, 1251, 1252, 1253};

bool faces_left(uint16_t id) { return id >= 1750 && id <= 1753; }

class Boris : public Saver {
 public:
  int count = 3;
  int flutter = 4;  // Frequently
  bool always_fly = false;

  void start(Surface &s) override {
    variant_ = &VARIANTS[0];
    if (s.mono()) {
      for (const Variant &v : VARIANTS)
        if (v.mono && s.height() >= v.min_height) {
          variant_ = &v;
          break;
        }
    }
    begin(s.width(), s.height(), variant_->scale);
    s.clear();
  }

  /* The cats and the butterfly on a w x h screen, with the art at `scale`. */
  void begin(float w, float h, float scale) {
    w_ = w;
    h_ = h;
    s_ = scale;
    if (count > MAX_CATS)
      count = MAX_CATS;
    for (int i = 0; i < count; i++) {
      Cat &c = cats_[i];
      c.x = rng.range(w_ * 0.1f, w_ * 0.9f);
      c.y = rng.range(h_ * 0.15f, h_ * 0.95f);
      c.dir = rng.uniform() < 0.5f ? 1 : -1;
      c.n = 0;
      c.frame = 1000;
      c.lift = 0;
      c.gone = false;
      next(c);
      drawn_[i] = {0, 0, 0, 0};
    }
    fly_.on = false;
    fly_drawn_ = {0, 0, 0, 0};
  }

  void simulate(float dt) {
    while (dt > 0) {
      float step = dt > MAX_STEP ? MAX_STEP : dt;
      for (int i = 0; i < count; i++)
        move(cats_[i], step);
      flutter_by(step);
      dt -= step;
    }
  }

  const Cat &cat(int i) const { return cats_[i]; }
  const Fly &fly() const { return fly_; }

  void frame(Surface &s, float dt) override {
    simulate(dt);

    for (int i = 0; i < count; i++)
      s.fill(drawn_[i], BLACK);
    s.fill(fly_drawn_, BLACK);

    /* Nearer - lower on the screen - in front. */
    int order[MAX_CATS];
    for (int i = 0; i < count; i++) {
      int j = i;
      while (j > 0 && cats_[order[j - 1]].y > cats_[i].y) {
        order[j] = order[j - 1];
        j--;
      }
      order[j] = i;
    }
    for (int k = 0; k < count; k++) {
      int i = order[k];
      const Cat &c = cats_[i];
      drawn_[i] = {0, 0, 0, 0};
      if (c.gone)
        continue;
      bool flip = faces_left(c.frame) ? c.dir > 0 : c.dir < 0;
      drawn_[i] = draw(s, c.frame, c.x, c.y - c.lift, flip, false);
    }
    fly_drawn_ = {0, 0, 0, 0};
    if (fly_.on) {
      float vx = cosf(fly_.a), vy = sinf(fly_.a);
      int group = fabsf(vy) > 0.8f ? 152 : fabsf(vy) > 0.4f ? 151 : fabsf(vx) > 0.9f ? 153 : 150;
      int flap = (int) floorf(fly_.t * 12) % (group == 152 ? 2 : 3);
      int id = group * 100 + (group == 152 && flap == 1 ? 2 : flap);
      fly_drawn_ = draw(s, id, fly_.x, fly_.y, vx < 0, true);
    }
  }

  static const int MAX_CATS = 4;

 private:

  /* ------------------------------------------------------------ doing -- */

  Step &push(Cat &c, std::initializer_list<uint16_t> frames, float fps, float time) {
    Step &st = c.plan[c.n < MAX_PLAN ? c.n++ : MAX_PLAN - 1];
    st = Step{};
    for (uint16_t f : frames)
      if (st.nframes < 8)
        st.frames[st.nframes++] = f;
    st.fps = fps;
    st.time = time;
    return st;
  }

  /* As push(), but at the front of the plan (the JS's unshift). */
  Step &unshift(Cat &c, std::initializer_list<uint16_t> frames, float fps, float time) {
    if (c.n >= MAX_PLAN)
      c.n = MAX_PLAN - 1;
    for (int i = c.n; i > 0; i--)
      c.plan[i] = c.plan[i - 1];
    c.n++;
    Step &st = c.plan[0];
    st = Step{};
    for (uint16_t f : frames)
      if (st.nframes < 8)
        st.frames[st.nframes++] = f;
    st.fps = fps;
    st.time = time;
    return st;
  }

  void shift(Cat &c) {
    for (int i = 1; i < c.n; i++)
      c.plan[i - 1] = c.plan[i];
    if (c.n > 0)
      c.n--;
  }

  /* When the plan runs out, what he does now. */
  void next(Cat &c) {
    const float s = s_, w = w_, h = h_;
    c.n = 0;
    Fly &f = fly_;
    /* A butterfly within reach is all that matters. */
    if (f.on && !f.leaving && fabsf(f.x - c.x) < 300 * s && fabsf(f.y - c.y) < 220 * s) {
      float dx = f.x - c.x;
      c.dir = dx > 0 ? 1 : -1;
      if (fabsf(dx) > 70 * s) {
        float t = (fabsf(dx) - 50 * s) / (RUN_SPEED * s);
        Step &st = push(c, RUN, 12, t < 1.2f ? t : 1.2f);
        st.vx = RUN_SPEED * s;
        float vy = (f.y + 40 * s - c.y) * 0.8f, cap = 60 * s;
        st.vy = vy < -cap ? -cap : vy > cap ? cap : vy;
        return;
      }
      if (c.y - f.y > 70 * s) {
        /* It is overhead: spring up after it. */
        push(c, {1800}, 0, 0.2f);
        push(c, {1801, 1802}, 6, 0.35f).arc = 90 * s;
        push(c, {1803}, 0, 0.25f);
      } else {
        push(c, {1750, 1751}, 4, rng.range(0.6f, 1.2f));
        Step &st = push(c, {1752}, 0, 0.35f);
        st.vx = 120 * s;
        st.arc = 40 * s;
        push(c, {1753}, 0, 0.4f);
      }
      f.startle = 1;
      return;
    }
    float r = rng.uniform();
    if (r < 0.1f) {
      leave(c);
    } else if (r < 0.32f) {
      /* Wander somewhere - anywhere on the screen, top to bottom. */
      float tx = rng.range(w * 0.05f, w * 0.95f), ty = rng.range(h * 0.08f, h * 0.97f);
      c.dir = tx > c.x ? 1 : -1;
      float dist = fabsf(tx - c.x), t = dist / (WALK_SPEED * s);
      if (t < 0.8f)
        t = 0.8f;
      Step &st = push(c, WALK, 10, t);
      st.vx = WALK_SPEED * s;
      st.vy = (ty - c.y) / t;
    } else if (r < 0.44f) {
      c.dir = rng.uniform() < 0.5f ? 1 : -1;
      Step &st = push(c, RUN, 12, rng.range(0.8f, 1.8f));
      st.vx = RUN_SPEED * s;
      st.vy = rng.range(-30, 30) * s;
      if (rng.uniform() < 0.5f)
        leap(c);
    } else if (r < 0.52f) {
      leap(c);
    } else if (r < 0.78f) {
      /* Turn round, sit, and see to himself. */
      push(c, {1050}, 0, 0.15f);
      push(c, {1100}, 0, 0.15f);
      static const uint16_t SITS[] = {1200, 1600, 1850, 1150};
      uint16_t sit = SITS[rng.below(4)];
      push(c, {sit}, 0, rng.range(0.8f, 2.5f));
      float then = rng.uniform();
      if (then < 0.45f) {
        push(c, PREEN, 6, rng.range(2, 5));
        push(c, {1200}, 0, rng.range(0.5f, 1.5f));
      } else if (then < 0.65f) {
        push(c, {1900, sit}, 2, rng.range(1.5f, 3));
      } else if (then < 0.8f) {
        push(c, {1950}, 0, rng.range(4, 10));
        push(c, {sit}, 0, 0.8f);
      }
      push(c, {1100}, 0, 0.15f);
      push(c, {1050}, 0, 0.15f);
    } else {
      /* Off to the nearest side, to scratch it. */
      c.dir = c.x > w / 2 ? 1 : -1;
      float edge = c.dir > 0 ? w - 24 * s : 24 * s;
      Step &st = push(c, WALK, 10, fabsf(edge - c.x) / (WALK_SPEED * s));
      st.vx = WALK_SPEED * s;
      st.stop_at = edge;
      st.has_stop = true;
      push(c, {1650}, 0, 0.3f);
      push(c, {1651}, 0, 0.3f);
      push(c, {1700, 1701}, 6, rng.range(1.5f, 3.5f));
      push(c, {1651}, 0, 0.3f);
      push(c, {1650}, 0, 0.3f);
      push(c, {1000}, 0, 0.05f).turn = true;
    }
  }

  void leap(Cat &c) {
    const float s = s_;
    push(c, {1351}, 0, 0.12f).vx = RUN_SPEED * s;
    Step &st = push(c, {1450}, 0, 0.55f);
    st.vx = 220 * s;
    st.arc = 60 * s;
    push(c, {1353}, 0, 0.15f).vx = 100 * s;
  }

  /* Off the sides, or the top or bottom, gone a while, and back. */
  void leave(Cat &c) {
    const float s = s_, w = w_, h = h_;
    bool up = c.y < h * 0.3f, down = c.y > h * 0.8f;
    c.dir = c.x > w / 2 ? 1 : -1;
    float edge = c.dir > 0 ? w - c.x : c.x;
    if (up || down) {
      Step &a = push(c, RUN, 12, 0.3f);
      a.vx = RUN_SPEED * s;
      a.leaving = true;
      Step &b = push(c, {(uint16_t) (up ? 1450 : 1752)}, 0, 2);
      b.vx = RUN_SPEED * s;
      b.vy = (up ? -1 : 1) * 190 * s;
      b.leaving = true;
    } else {
      Step &a = push(c, RUN, 12, (edge + 80 * s) / (RUN_SPEED * s));
      a.vx = RUN_SPEED * s;
      a.leaving = true;
    }
    push(c, {1000}, 0, rng.range(1, 6)).away = true;
  }

  void enter(Cat &c) {
    const float s = s_, w = w_, h = h_;
    float r = rng.uniform();
    c.dir = rng.uniform() < 0.5f ? 1 : -1;
    c.x = c.dir > 0 ? -40 * s : w + 40 * s;
    if (r < 0.3f) {
      /* Down from the top, in the pounce, and straight into a run. */
      c.y = -10 * s;
      c.x = c.dir > 0 ? rng.range(0, w * 0.3f) : rng.range(w * 0.7f, w);
      /* Unshifted in this order, they run pounce first. */
      unshift(c, RUN, 12, rng.range(0.6f, 1.4f)).vx = RUN_SPEED * s;
      Step &st = unshift(c, {1752}, 0, rng.range(0.5f, 1));
      st.vx = RUN_SPEED * s;
      st.vy = 120 * s;
      st.leaving = true;
    } else {
      c.y = rng.range(h * 0.15f, h * 0.95f);
      unshift(c, WALK, 10, rng.range(2, 5)).vx = WALK_SPEED * s;
    }
  }

  void move(Cat &c, float dt) {
    if (c.n == 0)
      next(c);
    Step &st = c.plan[0];
    if (st.turn && !st.turned) {
      c.dir = -c.dir;
      st.turned = true;
    }
    if (st.away) {
      c.gone = true;
      st.at += dt;
      if (st.at >= st.time) {
        shift(c);
        c.gone = false;
        enter(c);
      }
      return;
    }
    st.at += dt;
    float fps = st.fps ? st.fps : 1;
    c.frame = st.frames[(int) floorf(st.at * fps) % st.nframes];
    if (st.vx) {
      float nx = c.x + c.dir * st.vx * dt;
      if (st.has_stop && (c.dir > 0 ? nx >= st.stop_at : nx <= st.stop_at)) {
        nx = st.stop_at;
        st.at = st.time;
      }
      c.x = nx;
    }
    if (st.vy)
      c.y += st.vy * dt;
    float k = st.at / st.time;
    c.lift = st.arc ? sinf((k < 1 ? k : 1) * PI) * st.arc : 0;
    /* Unless he is on his way off, stay on the screen; turn round at the sides. */
    if (!st.leaving) {
      float margin = 30 * s_;
      if (c.x < margin && c.dir < 0 && !st.has_stop) {
        c.x = margin;
        c.dir = 1;
      }
      if (c.x > w_ - margin && c.dir > 0 && !st.has_stop) {
        c.x = w_ - margin;
        c.dir = -1;
      }
      float top = 52 * s_, bottom = h_ - 2;
      c.y = c.y < top ? top : c.y > bottom ? bottom : c.y;
    }
    if (st.at >= st.time)
      shift(c);
  }

  /* -------------------------------------------------------- butterfly -- */

  void flutter_by(float dt) {
    const float w = w_, h = h_, s = s_;
    Fly &f = fly_;
    if (!f.on) {
      if (always_fly || rng.uniform() < FLUTTER[flutter] * dt) {
        bool from_left = rng.uniform() < 0.5f;
        f.on = true;
        f.x = from_left ? -20 * s : w + 20 * s;
        f.y = rng.range(h * 0.2f, h * 0.7f);
        f.a = from_left ? 0 : PI;
        f.t = 0;
        f.life = rng.range(12, 30);
        f.startle = 0;
        f.leaving = false;
      }
      return;
    }
    f.t += dt;
    if (f.t > f.life)
      f.leaving = true;
    float speed = (f.startle > 0 ? 190 : FLY_SPEED) * s;
    f.startle = f.startle - dt * 0.5f > 0 ? f.startle - dt * 0.5f : 0;
    /* Flutter: the heading wanders; startled, it climbs. */
    f.a += rng.range(-3, 3) * dt;
    if (f.startle > 0)
      f.a += (-PI / 2 - f.a) * dt * 2;
    if (!f.leaving) {
      if (f.x < 40 * s)
        f.a = rng.range(-0.5f, 0.5f);
      if (f.x > w - 40 * s)
        f.a = PI + rng.range(-0.5f, 0.5f);
      if (f.y < h * 0.12f)
        f.a = rng.range(0.3f, 2.8f);
      if (f.y > h * 0.8f)
        f.a = -rng.range(0.3f, 2.8f);
    }
    f.x += cosf(f.a) * speed * dt;
    f.y += sinf(f.a) * speed * dt + sinf(f.t * 9) * 20 * s * dt;
    float m = 60 * s;
    if (f.leaving && (f.x < -m || f.x > w + m || f.y < -m || f.y > h + m))
      f.on = false;
  }

  /* ------------------------------------------------------------ drawing -- */

  /* Bottom-centred on (x, y), or centred if `middle`, as the JS's draw(). */
  Rect draw(Surface &s, int id, float x, float y, bool flip, bool middle) {
    int i = 0;
    while (i < NIDS && IDS[i] != id)
      i++;
    if (i == NIDS)
      return {0, 0, 0, 0};
    const Art &art = *variant_->art;
    const Frame &f = art.sequences[i].frames[0];
    int left = round_half_up(x - f.w / 2.0f);
    int top = round_half_up(middle ? y - f.h / 2.0f : y - f.h);
    if (flip)
      left = round_half_up(x * 2) - left - f.w;
    return blit(s, art, f, left, top, flip);
  }

  const Variant *variant_ = &VARIANTS[0];
  float s_ = 1;
  float w_ = 0, h_ = 0;
  Cat cats_[MAX_CATS];
  Rect drawn_[MAX_CATS];
  Fly fly_;
  Rect fly_drawn_;
};


/* ------------------------------------------------------------ text */

/* Boris across two 5x8 cells, facing right, one picture for each kind of
   thing the art has him doing. Sitting and rearing up he is narrow, so he is
   kept in the leading cell with his tail in the other, clear of the gap
   between cells. */
enum Pose { WALK1, WALK2, RUN1, RUN2, SIT, PREEN1, LIE, REAR1, REAR2, CROUCH, POSES };
const char *const POSE_ART[POSES][8] = {
    {".......#.#", "#......###", ".#.....###", "..######..", "..######..", "..#....#..", ".#......#.", ".........."},
    {".......#.#", "#......###", ".#.....###", "..######..", "..######..", "...#..#...", "...#..#...", ".........."},
    {"..........", "........#.", "#......###", ".########.", "..######..", ".#......#.", "#........#", ".........."},
    {"..........", "........#.", "#......###", ".########.", "..######..", "...#..#...", "..#....#..", ".........."},
    {".....#...#", ".....#####", ".....#.#.#", ".....#####", "......###.", ".....#####", "....######", "...###.##."},
    {".....#...#", ".....#####", ".....#.###", ".....####.", "......####", ".....#####", "....######", "...###.##."},
    {"..........", "..........", "..........", "......#.#.", "......###.", "#.#######.", ".########.", ".........."},
    {".......#.#", ".......###", "......####", ".....####.", "....####..", "...#.###..", "...#.#.#..", ".........."},
    {".......#.#", "......####", ".......###", ".....####.", "....####..", "...#.###..", "...#.#.#..", ".........."},
    {"..........", "..........", ".......#.#", "#......###", ".#######..", ".#######..", "..#....#..", ".........."},
};
const char *const BUTTERFLY[2][8] = {
    {".....", "#...#", "##.##", ".###.", "##.##", "#...#", ".....", "....."},
    {".....", ".....", ".#.#.", ".###.", ".#.#.", ".....", ".....", "....."},
};

Pose pose_of(uint16_t id) {
  if (id >= 1000 && id <= 1007)
    return (id - 1000) / 4 ? WALK2 : WALK1;  // slowed to what the panel shows
  if (id >= 1350 && id <= 1353)
    return (id - 1350) / 2 ? RUN2 : RUN1;
  if (id == 1450)
    return RUN1;
  if (id >= 1250 && id <= 1253)
    return id % 2 ? SIT : PREEN1;
  if (id == 1900)
    return PREEN1;
  if (id == 1950)
    return LIE;
  if (id == 1650 || id == 1700 || id == 1800 || id == 1802)
    return REAR1;
  if (id == 1651 || id == 1701 || id == 1801 || id == 1803)
    return REAR2;
  if (id >= 1750 && id <= 1753)
    return CROUCH;
  return SIT;  // 1050, 1100 turning round, and the four ways of sitting
}

/* The pixel saver's cats and butterfly, run on the panel's dots with the art
   at a sixth of its size (a cat about two cells long), drawn as glyphs. */
class BorisText : public TextSaver {
 public:
  void start(TextScreen &t) override {
    cols_ = t.cols();
    rows_ = t.rows();
    sim_.count = 1;
    sim_.begin(cols_ * 6 - 1, rows_ * 9 - 1, 1 / 6.0f);
    t.clear();
    draw(t);
  }

  void frame(TextScreen &t, float dt) override {
    sim_.simulate(dt);
    draw(t);
  }

 private:
  enum { G_LEFT, G_RIGHT, G_FLY };

  void draw(TextScreen &t) {
    t.clear();
    const Cat &c = sim_.cat(0);
    if (!c.gone) {
      bool flip = faces_left(c.frame) ? c.dir > 0 : c.dir < 0;
      const char *const *art = POSE_ART[pose_of(c.frame)];
      char rows[8][11];
      const char *mirrored[8];
      for (int r = 0; r < 8; r++) {
        for (int i = 0; i < 10; i++)
          rows[r][i] = flip ? art[r][9 - i] : art[r][i];
        rows[r][10] = 0;
        mirrored[r] = rows[r];
      }
      uint8_t bits[8];
      glyph_from_art(mirrored, 0, bits);
      t.glyph(G_LEFT, bits);
      glyph_from_art(mirrored, 5, bits);
      t.glyph(G_RIGHT, bits);
      /* He stands on (x, y): two cells either side of x, the row his feet are in. */
      int col = (int) floorf(c.x / 6 - 0.5f), row = (int) floorf((c.y - c.lift - 1) / 9);
      if (row >= 0 && row < rows_) {
        t.put(col, row, G_LEFT);
        t.put(col + 1, row, G_RIGHT);
      }
    }
    const Fly &f = sim_.fly();
    if (f.on) {
      uint8_t bits[8];
      glyph_from_art(BUTTERFLY[(int) (f.t * 4) % 2], 0, bits);
      t.glyph(G_FLY, bits);
      int col = (int) floorf(f.x / 6), row = (int) floorf(f.y / 9);
      if (row >= 0 && row < rows_)
        t.put(col, row, G_FLY);
    }
  }

  int cols_ = 16, rows_ = 2;
  Boris sim_;
};

}  // namespace

Saver *make_boris() { return new Boris(); }
TextSaver *make_boris_text() { return new BorisText(); }

AD_REGISTER_SAVER("boris", make_boris, make_boris_text)

}  // namespace adcore
#endif
