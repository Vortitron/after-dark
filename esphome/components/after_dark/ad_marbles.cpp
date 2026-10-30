/*
 * ad_marbles.cpp - Marbles, the 1992 original, on MARBLES2.AD's own artwork.
 * A port of all/modules/marbles.js, which was checked against the real module
 * under Wine; see that file for what was measured (one marble at a time,
 * gravity, the bounces, the stacking lattice, the pin count) and what is
 * inferred.
 *
 * Defaults are the module's: Pin Size Big, # Pins Many, Speed Medium, Redraw
 * Every 5 min.
 *
 * The web port clears and repaints the lot every frame. Here the pins and the
 * pile are drawn once and only the marble in play is erased and redrawn, with
 * whatever pins and stopped marbles it was over drawn back.
 *
 * On a 1-bit panel the art is shrunk and baked by art2c.py --mono, at 1/2,
 * 1/3 or 1/4 size to suit the screen as ad_toasters.cpp chooses, and every
 * length in the simulation (gravity, the throw, the lattice, the pin spacing,
 * the screen area per pin) is shrunk by the same factor, so the screen plays
 * like a bigger one seen from further off. The marbles are baked at threshold
 * 20 with no edges, so the dark red and blue ones stay solid discs; the pin at
 * threshold 100, edge 30, which keeps its spokes and rim, so a pin doesn't
 * look like a big marble.
 *
 * No character LCD version: two rows of cells have no room for a pin course
 * and a pile that stacks in the hollows half a marble over.
 */
#if defined(AD_SAVER_MARBLES) || defined(AD_ALL_SAVERS)
#include "ad_art.h"
#ifndef AD_MONO_ONLY  // a 1-bit build leaves the colour art out
#include "ad_art_marbles.h"
#endif
#ifndef AD_COLOUR_ONLY  // a colour build leaves the 1-bit art out
#include "ad_art_marbles_m2.h"
#include "ad_art_marbles_m3.h"
#include "ad_art_marbles_m4.h"
#include "ad_art_marbles_pins_m2.h"
#include "ad_art_marbles_pins_m3.h"
#include "ad_art_marbles_pins_m4.h"
#endif

#include <vector>

namespace adcore {

namespace {

const int SMILEY = 8, SHOCKED = 9;  // last two cells of the strip
const float OH = 0.4f;              // seconds a sensitive marble stays shocked

/* Screen area per pin at full size: the module's default put 28 on 1024x768. */
const float PIN_DENSITY_MANY = 28000;
const float PIN_GAP = 4;  // closest two pins come, edge to edge
const float PIN_TOP = 0.14f, PIN_BOTTOM = 0.9f;
const float SPEED_MEDIUM = 65;
const float REDRAW = 300;  // 5 min

const float GRAVITY = 900;  // pixels per second per second
const float DROP_SPEED = 300;
const float THROW = 450;
const float PIN_BOUNCE = 0.85f;
const float WALL_BOUNCE = 0.65f;
const float FLOOR_BOUNCE = 0.55f;
const float PILE_BOUNCE = 0.5f;
const float ROLL_DRAG = 60;
const float STOP_SPEED = 100;
const float STOP_TIME = 0.15f;
const float NEXT = 0.4f;
const float GIVE_UP = 30;
const float KNOCK = 120;
const float STEP = 1 / 240.0f;
const float FULL_CELL = 16, FULL_ROW = 14, FULL_BEST = 25, FULL_MARGIN = 10;

struct Variant {
  const Art *marbles;
  uint16_t strip;
  const Art *pins;
  uint16_t pin;
  float scale;
  bool mono;
  int min_height;
};
const Variant VARIANTS[] = {
#ifndef AD_MONO_ONLY
    {&art_marbles::ART, art_marbles::BM_MARBLES, &art_marbles::ART, art_marbles::BM_102, 1, false, 0},
#endif
#ifndef AD_COLOUR_ONLY
    {&art_marbles_m2::ART, art_marbles_m2::BM_MARBLES, &art_marbles_pins_m2::ART, art_marbles_pins_m2::BM_102,
     1 / 2.0f, true, 96},
    {&art_marbles_m3::ART, art_marbles_m3::BM_MARBLES, &art_marbles_pins_m3::ART, art_marbles_pins_m3::BM_102,
     1 / 3.0f, true, 48},
    {&art_marbles_m4::ART, art_marbles_m4::BM_MARBLES, &art_marbles_pins_m4::ART, art_marbles_pins_m4::BM_102,
     1 / 4.0f, true, 0},
#endif
};

struct Pt {
  float x, y;
};
struct Stopped {
  int type;
  float x, y;
};
struct Marble {
  int type;
  bool sensitive;
  float oh, x, y, vx, vy, slow, age;
};

inline bool overlaps(const Rect &a, const Rect &b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

class Marbles : public Saver {
 public:
  float density = PIN_DENSITY_MANY;
  float speed = SPEED_MEDIUM;
  float redraw = REDRAW;

  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    v_ = &VARIANTS[0];
    if (s.mono()) {
      for (const Variant &v : VARIANTS)
        if (v.mono && h_ >= v.min_height) {
          v_ = &v;
          break;
        }
    }
    strip_ = v_->marbles->sequence(v_->strip);
    pin_ = v_->pins->sequence(v_->pin);
    /* Lengths go with the marble actually drawn, so the lattice matches it. */
    cell_ = strip_->w;
    k_ = cell_ / FULL_CELL;
    r_ = cell_ / 2;
    row_ = FULL_ROW * k_;
    pin_r_ = pin_->w / 2.0f;

    slot_rows_ = (int) (h_ / row_) + 3;
    slot_cols_ = (int) (w_ / cell_) + 3;
    slots_.assign((size_t) slot_rows_ * slot_cols_, 0);
    pile_.clear();
    pile_.reserve((size_t) slot_rows_ * slot_cols_ + 64);
    pins_.clear();
    pins_.reserve(64);
    reset(s);
  }

  void frame(Surface &s, float dt) override {
    // The Speed slider runs the whole simulation faster.
    dt = fminf(dt * (speed / SPEED_MEDIUM), 0.1f);
    clock_ += dt;
    if (redraw > 0 && clock_ >= redraw) {
      reset(s);
      return;
    }
    if (!in_play_) {
      wait_ -= dt;
      if (wait_ <= 0)
        release();
    } else {
      for (float t = dt; t > 1e-6f; t -= STEP) {
        float sub = fminf(STEP, t);
        Marble &m = ball_;
        bool resting = move(m, sub);
        if (m.oh > 0)
          m.oh -= sub;
        m.age += sub;
        if (resting) {
          float v = hypotf(m.vx, m.vy);
          float drag = ROLL_DRAG * k_ * sub;
          if (v > drag) {
            m.vx -= m.vx / v * drag;
            m.vy -= m.vy / v * drag;
          }
        }
        if (resting && hypotf(m.vx, m.vy) < STOP_SPEED * k_)
          m.slow += sub;
        else
          m.slow = 0;
        if (m.slow >= STOP_TIME || m.age > GIVE_UP) {
          if (settle(s))
            return;  // the pile reached the top and it all started again
          break;
        }
      }
    }

    /* Erase where the marble was, put back what it was over, draw it. */
    if (!drawn_.empty()) {
      Rect old = drawn_;
      s.fill(old, BLACK);
      drawn_ = {0, 0, 0, 0};
      repair(s, old);
    }
    if (in_play_)
      drawn_ = draw_frame(s, *v_->marbles, *strip_, ball_.oh > 0 ? SHOCKED : ball_.type, ball_.x, ball_.y);
  }

 private:
  Rect box_of(const Sequence &seq, float cx, float cy) const {
    const Frame &f = seq.frames[0];
    return {round_half_up(cx - f.w / 2.0f), round_half_up(cy - f.h / 2.0f), f.w, f.h};
  }

  /* Draw back, in the web port's order, the pins and stopped marbles that
     overlap `r` (and the stopped marbles over any pin that was redrawn). */
  void repair(Surface &s, Rect r) {
    Rect grown = r;
    for (const Pt &p : pins_) {
      Rect b = box_of(*pin_, p.x, p.y);
      if (overlaps(b, r)) {
        draw_frame(s, *v_->pins, *pin_, 0, p.x, p.y);
        int l = b.x < grown.x ? b.x : grown.x, t = b.y < grown.y ? b.y : grown.y;
        int rr = b.x + b.w > grown.x + grown.w ? b.x + b.w : grown.x + grown.w;
        int bb = b.y + b.h > grown.y + grown.h ? b.y + b.h : grown.y + grown.h;
        grown = {l, t, rr - l, bb - t};
      }
    }
    for (const Stopped &p : pile_)
      if (overlaps(box_of(*strip_, p.x, p.y), grown))
        draw_frame(s, *v_->marbles, *strip_, p.type, p.x, p.y);
  }

  void reset(Surface &s) {
    pile_.clear();
    for (uint8_t &x : slots_)
      x = 0;
    in_play_ = false;
    wait_ = 0;
    clock_ = 0;
    drawn_ = {0, 0, 0, 0};
    scatter();
    s.clear();
    for (const Pt &p : pins_)
      draw_frame(s, *v_->pins, *pin_, 0, p.x, p.y);
  }

  /* The pins are scattered rather than laid out, only kept from touching. */
  void scatter() {
    pins_.clear();
    if (density <= 0)
      return;
    int wanted = round_half_up((float) w_ * h_ / (density * k_ * k_));
    if (wanted > (int) pins_.capacity())
      wanted = (int) pins_.capacity();
    float gap = pin_->w + PIN_GAP * k_;
    float margin = FULL_MARGIN * k_;
    int tries = 0;
    while ((int) pins_.size() < wanted && tries < wanted * 200) {
      tries++;
      float x = rng.range(pin_r_ + margin, w_ - pin_r_ - margin);
      float y = rng.range(h_ * PIN_TOP, h_ * PIN_BOTTOM);
      bool clear = true;
      for (const Pt &p : pins_)
        if (hypotf(p.x - x, p.y - y) < gap) {
          clear = false;
          break;
        }
      if (clear)
        pins_.push_back({x, y});
    }
  }

  void release() {
    int type = (int) floorf(rng.range(0, SMILEY + 1));  // the shocked face is a state
    ball_.type = type;
    ball_.sensitive = type == SMILEY;
    ball_.oh = 0;
    ball_.x = rng.range(r_, w_ - r_);
    ball_.y = -r_;
    ball_.vx = rng.range(-THROW, THROW) * k_;
    ball_.vy = DROP_SPEED * k_;
    ball_.slow = 0;
    ball_.age = 0;
    in_play_ = true;
  }

  /* Push the marble out of a circle it has run into and bounce it off. True
     if it is leaning on the circle from above, i.e. resting on it. */
  bool hit_circle(Marble &m, float cx, float cy, float reach, float bounce) {
    float dx = m.x - cx, dy = m.y - cy;
    float d = hypotf(dx, dy);
    if (d >= reach)
      return false;
    if (d == 0) {
      dx = rng.range(-1, 1);
      dy = -1;
      d = hypotf(dx, dy);
    }
    float nx = dx / d, ny = dy / d;
    m.x = cx + nx * reach;
    m.y = cy + ny * reach;
    float into = m.vx * nx + m.vy * ny;
    if (into < 0) {
      m.vx -= (1 + bounce) * into * nx;
      m.vy -= (1 + bounce) * into * ny;
      if (-into > KNOCK * k_ && m.sensitive)
        m.oh = OH;
    }
    return ny < -0.2f;
  }

  bool move(Marble &m, float dt) {
    bool rest = false;
    m.vy += GRAVITY * k_ * dt;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    if (m.x < r_) {
      m.x = r_;
      m.vx = fabsf(m.vx) * WALL_BOUNCE;
    }
    if (m.x > w_ - r_) {
      m.x = w_ - r_;
      m.vx = -fabsf(m.vx) * WALL_BOUNCE;
    }
    if (m.y > h_ - r_) {
      m.y = h_ - r_;
      if (m.vy > 0) {
        if (m.vy > KNOCK * k_ && m.sensitive)
          m.oh = OH;
        m.vy = -m.vy * FLOOR_BOUNCE;
      }
      rest = true;
    }
    for (const Pt &p : pins_)
      if (hit_circle(m, p.x, p.y, pin_r_ + r_, PIN_BOUNCE))
        rest = true;
    for (const Stopped &p : pile_)
      if (hit_circle(m, p.x, p.y, cell_, PILE_BOUNCE))
        rest = true;
    return rest;
  }

  /* The stacking lattice: row k, place i. */
  float slot_x(int k, int i) const { return cell_ * i + r_ + (k % 2) * r_; }
  bool slot(int k, int i) const {
    if (k < 0 || i < 0 || k >= slot_rows_ || i >= slot_cols_)
      return false;
    return slots_[(size_t) k * slot_cols_ + i] != 0;
  }
  bool supported(int k, int i) const {
    if (k == 0)
      return true;
    int a = k % 2 ? i : i - 1;
    return slot(k - 1, a) && slot(k - 1, a + 1);
  }

  /* Where it stops is where it stays, but snapped to the lattice; see
     marbles.js. Draws it there. True if the pile reached the top and it all
     started again. */
  bool settle(Surface &s) {
    const Marble &m = ball_;
    bool found = false;
    int sk = 0, si = 0;
    float sx = 0, sy = 0, best = FULL_BEST * k_;
    int k0 = round_half_up((h_ - r_ - m.y) / row_);
    for (int k = k0 - 1 > 0 ? k0 - 1 : 0; k <= k0 + 1; k++) {
      int i0 = round_half_up((m.x - r_ - (k % 2) * r_) / cell_);
      for (int i = i0 - 1; i <= i0 + 1; i++) {
        float x = slot_x(k, i), y = h_ - r_ - k * row_;
        if (x < r_ || x > w_ - r_ || k >= slot_rows_ || i < 0 || i >= slot_cols_ || slot(k, i) ||
            !supported(k, i))
          continue;
        float d = hypotf(x - m.x, y - m.y);
        if (d < best) {
          best = d;
          found = true;
          sk = k;
          si = i;
          sx = x;
          sy = y;
        }
      }
    }
    if (found)
      slots_[(size_t) sk * slot_cols_ + si] = 1;
    Stopped p{m.sensitive && m.oh > 0 ? SHOCKED : m.type, found ? sx : m.x, found ? sy : m.y};
    in_play_ = false;
    wait_ = NEXT;
    // Once the pile reaches the top there is nowhere left to put one (and a
    // full pile buffer counts as that too).
    if (m.y < cell_ * 2 || pile_.size() >= pile_.capacity()) {
      reset(s);
      return true;
    }
    pile_.push_back(p);
    /* It may have moved when it snapped: take it off the screen where it was
       and draw it in its place. */
    if (!drawn_.empty()) {
      Rect old = drawn_;
      s.fill(old, BLACK);
      drawn_ = {0, 0, 0, 0};
      repair(s, old);
    }
    draw_frame(s, *v_->marbles, *strip_, p.type, p.x, p.y);
    return false;
  }

  const Variant *v_ = &VARIANTS[0];
  const Sequence *strip_ = nullptr, *pin_ = nullptr;
  int w_ = 0, h_ = 0;
  float cell_ = 16, k_ = 1, r_ = 8, row_ = 14, pin_r_ = 24;
  int slot_rows_ = 0, slot_cols_ = 0;
  std::vector<uint8_t> slots_;
  std::vector<Pt> pins_;
  std::vector<Stopped> pile_;
  Marble ball_{};
  bool in_play_ = false;
  float wait_ = 0, clock_ = 0;
  Rect drawn_{0, 0, 0, 0};
};

}  // namespace

Saver *make_marbles() { return new Marbles(); }

AD_REGISTER_SAVER("marbles", make_marbles, nullptr)

}  // namespace adcore
#endif
