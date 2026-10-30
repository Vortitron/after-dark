/*
 * ad_clocks.cpp - Clocks 3.0, the time, drifting about. A port of
 * all/modules/clocks.js, which was checked against CLOCKS3.AD under Wine; see
 * that file for what was measured (hand lengths, the drift, GenX's nine
 * backgrounds a second) and what was read off the art (the pivots).
 *
 * All five types are here: Melting Digital, Classic, Modern, Art Deco and
 * Mutating. There is no runtime option for the type, so it is chosen when
 * the firmware is built, with -DAD_CLOCKS_TYPE=0..4 in the order above, and
 * only that type's colour art is compiled in. Left alone, a colour screen
 * gets the module's default, Mutating, with its defaults: drift Slow
 * (19 px/s) and Mutation Rate GenX (a new background every 0.11 s, in order).
 * The Mutating art is ~185 KB, over the usual budget, because it is ten
 * photographs; it is the default, so it stays.
 *
 * Small screens (adapted):
 *  - 1-bit panels use the art shrunk and baked by art2c.py --mono, 1/3 for a
 *    64-high panel and 1/5 below that, and drift at the speed scaled by the
 *    same amount (the web version draws at its own size on any window, which
 *    on 128x64 would be a 170 px clock pinned in a corner). Left alone (no
 *    AD_CLOCKS_TYPE), a 1-bit panel shows Melting Digital: a third-size
 *    photograph flashing nine times a second under white hands does not
 *    read as a clock on an OLED, and the melting digits do. Hands there are
 *    lines with a one-pixel halo in the other colour, as triangles a pixel
 *    wide vanish.
 *  - Character LCD (ClocksText): HH:MM in big digits built from the eight
 *    user glyphs (the usual HD44780 3x2 font), drifting about as the clock
 *    does. No seconds, as six big digits leave a 16x2 no room to drift, and
 *    no melt, since eight shared glyphs cannot melt one digit alone.
 *
 * Without a clock (no ESPHome time source) it counts from 10:10:00 at start.
 * Sounds are left out, as all sound is in these ports.
 */
#if defined(AD_SAVER_CLOCKS) || defined(AD_ALL_SAVERS)
#include "ad_art.h"
#include "ad_draw.h"
#include "ad_text.h"

#include <cstring>
#include <vector>

/* 0 melting digital, 1 classic, 2 modern, 3 art deco, 4 mutating. */
#ifndef AD_CLOCKS_TYPE
#define AD_CLOCKS_TYPE_DEFAULTED 1
#define AD_CLOCKS_TYPE 4
#endif

#ifndef AD_MONO_ONLY
#if AD_CLOCKS_TYPE == 0
#include "ad_art_clocks_digits.h"
#elif AD_CLOCKS_TYPE == 1
#include "ad_art_clocks_classic.h"
#elif AD_CLOCKS_TYPE == 2
#include "ad_art_clocks_modern.h"
#elif AD_CLOCKS_TYPE == 3
#include "ad_art_clocks_deco.h"
#else
#include "ad_art_clocks.h"
#endif
#endif
#ifndef AD_COLOUR_ONLY  // a colour build leaves the 1-bit art out
#include "ad_art_clocks_m3.h"
#include "ad_art_clocks_m5.h"
#endif

namespace adcore {

namespace {

enum Type { MELTING = 0, CLASSIC = 1, MODERN = 2, DECO = 3, MUTATING = 4 };

/* Drift Slow, px/s at the art's own size. */
const float DRIFT = 19;
/* Mutation Rate GenX: a new background this often, in seconds. */
const float EVERY = 0.11f;
const int OBJECTS = 10;
/* The digit strip: 47x70 a cell, 75 cells; a melt takes this long. */
const int DIGIT_W = 47, DIGIT_H = 70, DIGIT_CELLS = 75;
const float MELT = 0.45f;

/* Where each face's hands turn, how long they are (hour, minute, second) and
   how wide the hour and minute hands, at the art's own size; as clocks.js. */
struct Face {
  float cx, cy, hour, minute, second, hw, mw;
  bool white;
};
const Face FACES[5] = {
    {0, 0, 0, 0, 0, 0, 0, false},                    // melting digital: no hands
    {100, 101, 37, 60, 52, 2.2f, 1.3f, false},       // classic
    {91.5f, 91.5f, 40, 57, 71, 2.2f, 1.3f, true},    // modern
    {95, 90, 23, 33, 33, 1.6f, 1.1f, false},         // art deco
    {71.5f, 72, 32, 60, 52, 1.6f, 1.2f, true},       // mutating (pivot: the middle)
};

/* One art set: which sequence is which (-1 where it lacks one). */
struct Variant {
  const Art *art;
  float scale;
  bool mono;
  int min_height;
  int digits, face[4], numerals, objects[OBJECTS];  // face[] indexed by Type
};

#define AD_OBJ(ns) \
  { \
    ns::BM_OBJECT5000, ns::BM_OBJECT5010, ns::BM_OBJECT5020, ns::BM_OBJECT5030, ns::BM_OBJECT5040, \
        ns::BM_OBJECT5050, ns::BM_OBJECT5060, ns::BM_OBJECT5070, ns::BM_OBJECT5080, ns::BM_OBJECT5090 \
  }
#define AD_NO_OBJ \
  { -1, -1, -1, -1, -1, -1, -1, -1, -1, -1 }

const Variant VARIANTS[] = {
#ifndef AD_MONO_ONLY
#if AD_CLOCKS_TYPE == 0
    {&art_clocks_digits::ART, 1, false, 0, art_clocks_digits::BM_DIGITS, {-1, -1, -1, -1}, -1, AD_NO_OBJ},
#elif AD_CLOCKS_TYPE == 1
    {&art_clocks_classic::ART, 1, false, 0, -1, {-1, art_clocks_classic::BM_CLASSIC, -1, -1}, -1, AD_NO_OBJ},
#elif AD_CLOCKS_TYPE == 2
    {&art_clocks_modern::ART, 1, false, 0, -1, {-1, -1, art_clocks_modern::BM_MODERN, -1}, -1, AD_NO_OBJ},
#elif AD_CLOCKS_TYPE == 3
    {&art_clocks_deco::ART, 1, false, 0, -1, {-1, -1, -1, art_clocks_deco::BM_DECO}, -1, AD_NO_OBJ},
#else
    {&art_clocks::ART, 1, false, 0, -1, {-1, -1, -1, -1}, art_clocks::BM_NUMERALS, AD_OBJ(art_clocks)},
#endif
#endif
#ifndef AD_COLOUR_ONLY
    {&art_clocks_m3::ART, 1 / 3.0f, true, 48, art_clocks_m3::BM_DIGITS,
     {-1, art_clocks_m3::BM_CLASSIC, art_clocks_m3::BM_MODERN, art_clocks_m3::BM_DECO},
     art_clocks_m3::BM_NUMERALS, AD_OBJ(art_clocks_m3)},
    {&art_clocks_m5::ART, 1 / 5.0f, true, 0, art_clocks_m5::BM_DIGITS,
     {-1, art_clocks_m5::BM_CLASSIC, art_clocks_m5::BM_MODERN, art_clocks_m5::BM_DECO},
     art_clocks_m5::BM_NUMERALS, AD_OBJ(art_clocks_m5)},
#endif
};

/* The frames of the digit strip that take a digit from a to b (' ' is
   blank), as clocks.js's melt(): the first of five, or -1 for none. */
int melt(char a, char b) {
  int col = -1;
  if (a == ' ' && b == '1')
    col = 12;
  else if (a == '1' && b == ' ')
    col = 13;
  else if (a == '5' && b == '0')
    col = 14;
  else if (a != ' ' && b != ' ' && (a - '0' + 1) % 10 == b - '0')
    col = a == '9' ? 2 : a - '0' + 3;
  return col < 0 ? -1 : col * 5;
}

/* The time, seconds with a fraction. With no clock, from 10:10:00 at start. */
class TimeKeeper {
 public:
  void start() {
    last_sec_ = -1;
    frac_ = 0;
    elapsed_ = 0;
  }
  void tick(float dt, int &h, int &m, float &s) {
    elapsed_ += (double) dt;  // double, so the no-clock count stays exact for days
    Clock c;
    if (local_time(c)) {
      if (c.second != last_sec_) {
        last_sec_ = c.second;
        frac_ = 0;
      } else {
        frac_ += dt;
        if (frac_ > 0.999f)
          frac_ = 0.999f;
      }
      h = c.hour;
      m = c.minute;
      s = c.second + frac_;
      return;
    }
    double t = 10 * 3600 + 10 * 60 + elapsed_;
    long whole = (long) t;
    h = (int) (whole / 3600 % 24);
    m = (int) (whole / 60 % 60);
    s = (float) (whole % 60) + (float) (t - whole);
  }

 private:
  int last_sec_ = -1;
  float frac_ = 0;
  double elapsed_ = 0;
};

/* What a frame showed, so an unchanged one is not drawn again. */
struct Shown {
  int x, y, face, sec, minute, hour;
  int cells[6];
  bool operator==(const Shown &o) const { return memcmp(this, &o, sizeof *this) == 0; }
};

class Clocks : public Saver {
 public:
  int type = AD_CLOCKS_TYPE;

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
    type_ = type;
#ifdef AD_CLOCKS_TYPE_DEFAULTED
    if (v_->mono)
      type_ = MELTING;
#endif
    k_ = v_->scale;
    float a = rng.range(0, 6.2831853f);
    vx_ = cosf(a);
    vy_ = sinf(a);
    placed_ = false;
    shown_text_[0] = 0;
    for (int i = 0; i < 6; i++)
      melts_[i] = {-1, 0};
    next_mutation_ = 0;
    object_index_ = 0;
    object_ = v_->objects[0];
    time_.start();
    drawn_ = {0, 0, 0, 0};
    memset(&shown_, 0xff, sizeof shown_);

    /* Where each cell of the digit strip starts in its run-length rows. */
    cells_.clear();
    if (type_ == MELTING && v_->digits >= 0) {
      const Sequence *seq = v_->art->sequence(v_->digits);
      const Frame &f = seq->frames[0];
      const uint8_t *p = v_->art->data + f.offset;
      cells_.resize(DIGIT_CELLS);
      int cell = 0;
      for (int y = 0; y < f.h && cell < DIGIT_CELLS; y++) {
        if (cell_row(cell) == y)
          cells_[cell++] = (uint32_t) (p - v_->art->data);
        p = skip_row(p);
      }
      if (cell < DIGIT_CELLS)
        cells_.clear();  // the strip is not the one expected
    }
    s.clear();
  }

  void frame(Surface &s, float dt) override {
    if (type_ == MUTATING) {
      next_mutation_ -= dt;
      if (next_mutation_ <= 0) {
        /* The backgrounds come round in order. */
        object_ = v_->objects[object_index_];
        object_index_ = (object_index_ + 1) % OBJECTS;
        next_mutation_ += EVERY;
        if (next_mutation_ <= 0)
          next_mutation_ = EVERY;
      }
    }
    float sw, sh;
    size(sw, sh);
    if (!placed_) {
      x_ = rng.range(0, fmaxf(0, w_ - sw));
      y_ = rng.range(0, fmaxf(0, h_ - sh));
      placed_ = true;
    }
    float speed = DRIFT * k_;
    x_ += vx_ * speed * dt;
    y_ += vy_ * speed * dt;
    if (x_ < 0) {
      x_ = 0;
      vx_ = fabsf(vx_);
    }
    if (y_ < 0) {
      y_ = 0;
      vy_ = fabsf(vy_);
    }
    if (x_ + sw > w_) {
      x_ = fmaxf(0, w_ - sw);
      vx_ = -fabsf(vx_);
    }
    if (y_ + sh > h_) {
      y_ = fmaxf(0, h_ - sh);
      vy_ = -fabsf(vy_);
    }
    int hr, mn;
    float sec;
    time_.tick(dt, hr, mn, sec);
    if (type_ == MELTING)
      digital(s, hr, mn, sec, dt);
    else
      analog(s, hr, mn, sec);
  }

 private:
  /* The row of the shrunk strip that digit cell `i` starts on. */
  int cell_row(int i) const { return round_half_up(i * DIGIT_H * k_); }

  static const uint8_t *skip_row(const uint8_t *p) {
    for (;;) {
      uint8_t skip = *p++, run = *p++;
      if (run == 0) {
        if (skip == 0)
          return p;
        continue;
      }
      p += run;
    }
  }

  /* `n` run-length rows from `p`, the first at (x0, y0); as draw_frame. */
  void blit_rows(Surface &s, const uint8_t *p, int n, int x0, int y0) {
    const int sw = s.width(), sh = s.height();
    for (int y = y0; y < y0 + n; y++) {
      int x = x0;
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
          int a = x < 0 ? -x : 0;
          int b = x + run > sw ? sw - x : run;
          if (b > a)
            s.span(x + a, y, b - a, p + a, v_->art->palette);
        }
        x += run;
        p += run;
      }
    }
  }

  const Sequence *face_seq() const {
    int id = type_ == MUTATING ? object_ : v_->face[type_];
    return id >= 0 ? v_->art->sequence(id) : nullptr;
  }

  void size(float &w, float &h) const {
    if (type_ == MELTING) {
      w = (6 * DIGIT_W + 2 * 20) * k_;
      h = DIGIT_H * k_;
      return;
    }
    const Sequence *f = face_seq();
    w = f ? f->w : 200 * k_;
    h = f ? f->h : 200 * k_;
  }

  /* Wipe what was drawn last and note the box this frame will cover. */
  void wipe(Surface &s, Rect next) {
    s.fill(drawn_, BLACK);
    drawn_ = s.clip(next);
  }

  static Rect join(Rect a, Rect b) {
    int x0 = a.x < b.x ? a.x : b.x, y0 = a.y < b.y ? a.y : b.y;
    int x1 = a.x + a.w > b.x + b.w ? a.x + a.w : b.x + b.w;
    int y1 = a.y + a.h > b.y + b.h ? a.y + a.h : b.y + b.h;
    return {x0, y0, x1 - x0, y1 - y0};
  }

  void hand(Surface &s, float cx, float cy, float angle, float length, float width, Rgb ink) {
    float dx = sinf(angle), dy = -cosf(angle);
    if (v_->mono) {
      Rgb halo = ink.r ? BLACK : rgb(255, 255, 255);
      int x0 = round_half_up(cx), y0 = round_half_up(cy);
      int x1 = round_half_up(cx + dx * length), y1 = round_half_up(cy + dy * length);
      int t = width >= 2 ? 2 : 1;
      line(s, x0, y0, x1, y1, halo, t + 2);
      line(s, x0, y0, x1, y1, ink, t);
      return;
    }
    int xy[6] = {
        round_half_up(cx - dx * length * 0.08f - dy * width), round_half_up(cy - dy * length * 0.08f + dx * width),
        round_half_up(cx + dx * length),                      round_half_up(cy + dy * length),
        round_half_up(cx - dx * length * 0.08f + dy * width), round_half_up(cy - dy * length * 0.08f - dx * width),
    };
    fill_polygon(s, xy, 3, ink);
  }

  void analog(Surface &s, int hr, int mn, float sec) {
    const Sequence *face = face_seq();
    if (!face)
      return;
    const Face &spec = FACES[type_];
    int ix = round_half_up(x_), iy = round_half_up(y_);
    Shown now = {ix, iy, type_ == MUTATING ? object_ : 0, (int) floorf(sec), mn, hr, {0, 0, 0, 0, 0, 0}};
    memset(now.cells, 0, sizeof now.cells);
    if (now == shown_)
      return;
    shown_ = now;

    float cx = x_ + spec.cx * k_, cy = y_ + spec.cy * k_;
    const Sequence *ring = nullptr;
    if (type_ == MUTATING) {
      cx = x_ + face->w / 2.0f;
      cy = y_ + face->h / 2.0f;
      ring = v_->art->sequence(v_->numerals);
    }
    float reach = fmaxf(spec.minute, fmaxf(spec.hour, spec.second)) * k_ + 3;
    Rect box = join({ix, iy, face->w, face->h},
                    {(int) floorf(cx - reach), (int) floorf(cy - reach), (int) (2 * reach) + 2, (int) (2 * reach) + 2});
    if (ring)
      box = join(box, {round_half_up(cx - ring->w / 2.0f), round_half_up(cy - ring->h / 2.0f), ring->w, ring->h});
    wipe(s, box);

    draw_frame(s, *v_->art, *face, 0, ix + face->frames[0].w / 2.0f, iy + face->frames[0].h / 2.0f);
    if (ring) {
      /* The numerals ring goes over the middle of whatever it is today. */
      int rx = round_half_up(cx - ring->w / 2.0f), ry = round_half_up(cy - ring->h / 2.0f);
      draw_frame(s, *v_->art, *ring, 0, rx + ring->frames[0].w / 2.0f, ry + ring->frames[0].h / 2.0f);
    }
    Rgb ink = spec.white ? rgb(255, 255, 255) : BLACK;
    const float TAU = 6.2831853f;
    float m = mn + sec / 60, h = (hr % 12) + m / 60;
    hand(s, cx, cy, h / 12 * TAU, spec.hour * k_, spec.hw * k_, ink);
    hand(s, cx, cy, m / 60 * TAU, spec.minute * k_, spec.mw * k_, ink);
    /* The second hand ticks: one pixel, with a short tail. */
    float tick = floorf(sec) / 60 * TAU;
    int tx0 = round_half_up(cx - sinf(tick) * 8 * k_), ty0 = round_half_up(cy + cosf(tick) * 8 * k_);
    int tx1 = round_half_up(cx + sinf(tick) * spec.second * k_), ty1 = round_half_up(cy - cosf(tick) * spec.second * k_);
    if (v_->mono)
      line(s, tx0, ty0, tx1, ty1, spec.white ? BLACK : rgb(255, 255, 255), 3);
    line(s, tx0, ty0, tx1, ty1, ink);
  }

  void digital(Surface &s, int hr, int mn, float sec, float dt) {
    if (cells_.empty())
      return;
    int h12 = hr % 12 ? hr % 12 : 12;
    int sc = (int) floorf(sec);
    char text[7] = {h12 < 10 ? ' ' : '1', (char) ('0' + h12 % 10), (char) ('0' + mn / 10),
                    (char) ('0' + mn % 10), (char) ('0' + sc / 10), (char) ('0' + sc % 10), 0};
    if (strcmp(shown_text_, text) != 0) {
      for (int i = 0; i < 6; i++)
        if (shown_text_[0] && shown_text_[i] != text[i])
          melts_[i] = {melt(shown_text_[i], text[i]), 0};
      memcpy(shown_text_, text, 7);
    }
    int ix = round_half_up(x_), iy = round_half_up(y_);
    Shown now = {ix, iy, 0, 0, 0, 0, {0, 0, 0, 0, 0, 0}};
    for (int d = 0; d < 6; d++) {
      int cell = text[d] == ' ' ? -1 : text[d] - '0';
      Melt &mt = melts_[d];
      if (mt.first >= 0) {
        mt.t += dt;
        if (mt.t < MELT)
          cell = mt.first + (int) floorf(mt.t / MELT * 5);
        else
          mt.first = -1;
      }
      now.cells[d] = cell;
    }
    if (now == shown_)
      return;
    shown_ = now;

    float sw, sh;
    size(sw, sh);
    wipe(s, {ix, iy, (int) ceilf(sw) + 2, (int) ceilf(sh) + 2});
    const Sequence *seq = v_->art->sequence(v_->digits);
    Rgb white = rgb(255, 255, 255);
    float px = x_;
    int dot = round_half_up(7 * k_);
    if (dot < 1)
      dot = 1;
    for (int d = 0; d < 6; d++) {
      int cell = now.cells[d];
      if (cell >= 0) {
        int rows = cell_row(cell + 1) - cell_row(cell);
        if (cell_row(cell) + rows > seq->frames[0].h)
          rows = seq->frames[0].h - cell_row(cell);
        blit_rows(s, v_->art->data + cells_[cell], rows, round_half_up(px), iy);
      }
      px += DIGIT_W * k_;
      if (d == 1 || d == 3) {
        s.fill_rect(round_half_up(px + 6 * k_), round_half_up(y_ + DIGIT_H * k_ * 0.3f), dot, dot, white);
        s.fill_rect(round_half_up(px + 6 * k_), round_half_up(y_ + DIGIT_H * k_ * 0.62f), dot, dot, white);
        px += 20 * k_;
      }
    }
  }

  struct Melt {
    int first;
    float t;
  };

  const Variant *v_ = &VARIANTS[0];
  int type_ = MUTATING;
  int w_ = 0, h_ = 0;
  float k_ = 1;
  float x_ = 0, y_ = 0, vx_ = 1, vy_ = 0;
  bool placed_ = false;
  float next_mutation_ = 0;
  int object_index_ = 0, object_ = -1;
  char shown_text_[7] = {0};
  Melt melts_[6];
  TimeKeeper time_;
  Rect drawn_ = {0, 0, 0, 0};
  Shown shown_;
  std::vector<uint32_t> cells_;
};

/* ------------------------------------------------------------ text */

/* The usual 3x2 big-digit font for HD44780s, from eight glyphs: corners
   rounded on the outside, and bars at the top, bottom, or both. */
const uint8_t BIG_GLYPHS[8][8] = {
    {0x07, 0x0F, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F},  // 0 upper left
    {0x1F, 0x1F, 0x1F, 0x00, 0x00, 0x00, 0x00, 0x00},  // 1 upper bar
    {0x1C, 0x1E, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F},  // 2 upper right
    {0x1F, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F, 0x0F, 0x07},  // 3 lower left
    {0x00, 0x00, 0x00, 0x00, 0x00, 0x1F, 0x1F, 0x1F},  // 4 lower bar
    {0x1F, 0x1F, 0x1F, 0x1F, 0x1F, 0x1F, 0x1E, 0x1C},  // 5 lower right
    {0x1F, 0x1F, 0x1F, 0x00, 0x00, 0x00, 0x1F, 0x1F},  // 6 upper and middle bars
    {0x1F, 0x00, 0x00, 0x00, 0x00, 0x1F, 0x1F, 0x1F},  // 7 middle and lower bars
};
const uint8_t SP = ' ';
/* Each digit: three cells on top, three below. */
const uint8_t BIG[10][6] = {
    {0, 1, 2, 3, 4, 5},  // 0
    {1, 2, SP, 4, 5, 4},  // 1, with a foot so it is not read as a 7
    {6, 6, 2, 3, 4, 4},  // 2
    {6, 6, 2, 7, 7, 5},  // 3
    {3, 4, 2, SP, SP, 5},  // 4
    {3, 6, 6, 7, 7, 5},  // 5
    {0, 6, 6, 3, 7, 5},  // 6
    {1, 1, 2, SP, SP, 5},  // 7
    {0, 6, 2, 3, 7, 5},  // 8
    {0, 6, 2, 7, 7, 5},  // 9
};
/* H H : M M */
const int BIG_COLS = 13, BIG_ROWS = 2;

class ClocksText : public TextSaver {
 public:
  void start(TextScreen &t) override {
    cols_ = t.cols();
    rows_ = t.rows();
    for (int i = 0; i < 8; i++)
      t.glyph(i, BIG_GLYPHS[i]);
    /* In dots, with a cell 6x9 and the drift as a share of a 1024x768
       screen, as the clock covers it at its own size. */
    float a = rng.range(0, 6.2831853f);
    float scale = cols_ * 6 / 1024.0f;
    vx_ = cosf(a) * DRIFT * scale;
    vy_ = sinf(a) * DRIFT * scale;
    room_x_ = (cols_ - BIG_COLS) * 6.0f;
    room_y_ = (rows_ - BIG_ROWS) * 9.0f;
    if (room_x_ < 0)
      room_x_ = 0;
    if (room_y_ < 0)
      room_y_ = 0;
    x_ = rng.range(0, room_x_);
    y_ = rng.range(0, room_y_);
    time_.start();
    t.clear();
    frame(t, 0);
  }

  void frame(TextScreen &t, float dt) override {
    x_ += vx_ * dt;
    y_ += vy_ * dt;
    if (x_ < 0) {
      x_ = 0;
      vx_ = fabsf(vx_);
    }
    if (x_ > room_x_) {
      x_ = room_x_;
      vx_ = -fabsf(vx_);
    }
    if (y_ < 0) {
      y_ = 0;
      vy_ = fabsf(vy_);
    }
    if (y_ > room_y_) {
      y_ = room_y_;
      vy_ = -fabsf(vy_);
    }
    int hr, mn;
    float sec;
    time_.tick(dt, hr, mn, sec);
    int h12 = hr % 12 ? hr % 12 : 12;
    int digits[4] = {h12 < 10 ? -1 : 1, h12 % 10, mn / 10, mn % 10};
    int c0 = (int) floorf(x_ / 6), r0 = (int) floorf(y_ / 9);
    t.clear();
    int c = c0;
    for (int d = 0; d < 4; d++) {
      for (int i = 0; i < 3; i++)
        for (int r = 0; r < 2; r++)
          t.put(c + i, r0 + r, digits[d] < 0 ? ' ' : BIG[digits[d]][r * 3 + i]);
      c += 3;
      if (d == 1) {
        t.put(c, r0, '.');
        t.put(c, r0 + 1, '\'');
        c += 1;
      }
    }
  }

 private:
  int cols_ = 16, rows_ = 2;
  float x_ = 0, y_ = 0, vx_ = 0, vy_ = 0, room_x_ = 0, room_y_ = 0;
  TimeKeeper time_;
};

}  // namespace

/* Outside the anonymous namespace, so a text-only build that leaves the
   pixel saver unreferenced does not warn. */
Saver *make_clocks() { return new Clocks(); }
TextSaver *make_clocks_text() { return new ClocksText(); }

AD_REGISTER_SAVER("clocks", make_clocks, make_clocks_text)

}  // namespace adcore
#endif
