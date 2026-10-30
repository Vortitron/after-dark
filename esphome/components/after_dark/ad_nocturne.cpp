/*
 * ad_nocturne.cpp - Nocturnes, eyes in the dark. A port of
 * all/modules/nocturne.js; see that file for what is known of NOCTURNE.AD
 * (it never drew under Wine, so the web version is the reference).
 *
 * Defaults are the web page's: Density Lots (22 pairs), Color on.
 *
 * The art is BITMAP 1 of the module, all/art/nocturne/eyes.png: five kinds of
 * eyes down, three blink stages across, cut at 32x16 as nocturne.js cuts it.
 * It is one bit deep (white, tinted per kind), so it is kept here as bit rows
 * rather than through art2c.py.
 *
 * Small screens: the pairs stay full size (the JS keeps them at 1x below
 * 400 px too), but a 128x64 panel can't hold 22 of them, so the count goes
 * with the screen's area against 320x240, doubled so a small screen isn't
 * empty (5 at 128x64, 2 at 72x40). On a 1-bit panel the eyes are plain
 * white: the tints would only dither them away.
 * On a character LCD (NocturneText) each pair is redrawn by hand in one or
 * two 5x8 cells, with the same timing.
 */
#if defined(AD_SAVER_NOCTURNE) || defined(AD_ALL_SAVERS)
#include "ad_draw.h"
#include "ad_text.h"

#include <vector>

namespace adcore {

namespace {

const int CELL_W = 32, CELL_H = 16, KINDS = 5;
const int PAIRS = 22;  // Lots
/* Cat, tiger, owl, something small, something smaller. */
const Rgb TINTS[KINDS] = {{255, 255, 85}, {255, 170, 0}, {255, 255, 170}, {85, 255, 85}, {255, 85, 85}};
const Rgb WHITE = {255, 255, 255};

/* EYES[kind * 3 + stage][row], bit 31 the left column. */
const uint32_t EYES[KINDS * 3][CELL_H] = {
    {0x00000000, 0x00000000, 0x7e0001f8, 0x3f787bf0, 0x1f787be0, 0x0f787bc0, 0x07787b80, 0x01f03e00, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000},
    {0x00000000, 0x00000000, 0x00000000, 0x30000030, 0x1f0003e0, 0x0f787bc0, 0x07787b80, 0x01f03e00, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000},
    {0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x10000020, 0x0e0001c0, 0x07787b80, 0x01f03e00, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000},
    {0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x7e0001f8, 0xfec00dfc, 0xfef87dfc, 0xfefcfdfc, 0x7efcfdf8, 0x7ef87df8, 0x3ff03ff0, 0x1fe01fe0, 0x07800780, 0x00000000, 0x00000000, 0x00000000},
    {0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x3ee01df0, 0x7efcfdf8, 0x7efcfdf8, 0x7ef87df8, 0x3ff03ff0, 0x0fc00fc0, 0x00000000, 0x00000000, 0x00000000, 0x00000000},
    {0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x70787838, 0x1fe01fe0, 0x0fc00fc0, 0x00000000, 0x00000000, 0x00000000, 0x00000000},
    {0x0781e000, 0x0fc3f000, 0x1fc3f800, 0x1fe7f800, 0x3fe7fc00, 0x3fe7fc00, 0x3fe7fc00, 0x3fe7fc00, 0x3fe7fc00, 0x3e667c00, 0x3e667c00, 0x1fe7f800, 0x0fc3f000, 0x0300c000, 0x00000000, 0x00000000},
    {0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x3c003c00, 0x3fe7fc00, 0x3fe7fc00, 0x3fe7fc00, 0x3fe7fc00, 0x3e667c00, 0x3e667c00, 0x1fe7f800, 0x0fc3f000, 0x0300c000, 0x00000000, 0x00000000},
    {0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x3e007c00, 0x3e667c00, 0x1fe7f800, 0x0fc3f000, 0x0300c000, 0x00000000, 0x00000000},
    {0x00000000, 0x00000000, 0x00000000, 0x01e07800, 0x03f0fc00, 0x07f9fe00, 0x0739ce00, 0x07204e00, 0x07801e00, 0x03000c00, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000},
    {0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00f0f000, 0x01f9f800, 0x0339cc00, 0x03204c00, 0x03801c00, 0x03000c00, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000},
    {0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x0039c000, 0x01204800, 0x01801800, 0x01000800, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000},
    {0x00000000, 0x00000000, 0x00000000, 0x00c18000, 0x01e3c000, 0x01e3c000, 0x00c18000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000},
    {0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x01e3c000, 0x01e3c000, 0x00c18000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000},
    {0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00c18000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000},
};

/* One pair, as nocturne.js keeps it. Times in seconds. */
struct Eye {
  float x, y;
  int kind;
  float life, wait, age, blink, blink_at;  // blink_at < 0: never blinked
};

float rand(float a, float b) { return rng.range(a, b); }

/* Which of the three blink stages to show, or -1 for nothing. */
int stage(const Eye &e) {
  if (e.wait > 0)
    return -1;
  const float open = 0.25f;
  if (e.age < open)
    return 2 - (int) floorf(e.age / open * 3);
  if (e.age > e.life - open) {
    int st = (int) floorf((e.age - (e.life - open)) / open * 3);
    return st < 2 ? st : 2;
  }
  /* A blink: shut and open again in a fifth of a second. */
  if (e.blink_at >= 0 && e.age - e.blink_at < 0.2f) {
    static const int SHUT[4] = {1, 2, 2, 1};
    int i = (int) floorf((e.age - e.blink_at) / 0.05f);
    return i >= 0 && i < 4 ? SHUT[i] : 0;
  }
  return 0;
}

/* Ages a pair by dt as nocturne.js's step does; true if it has gone and
   wants respawning. */
bool age(Eye &e, float dt) {
  if (e.wait > 0) {
    e.wait -= dt;
    return false;
  }
  e.age += dt;
  e.blink -= dt;
  if (e.blink <= 0) {
    e.blink_at = e.age;
    e.blink = rand(1.5f, 5);
  }
  return e.age >= e.life;
}

void spawn(Eye &e, float w, float h, float delay) {
  e.x = rand(0, w);
  e.y = rand(0, h);
  e.kind = rng.below(KINDS);
  e.life = rand(4, 14);
  e.wait = delay > 0 ? delay : rand(0.5f, 4);
  e.age = 0;
  e.blink = rand(1, 4);
  e.blink_at = -1;
}

bool overlap(const Rect &a, const Rect &b) {
  return !a.empty() && !b.empty() && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

class Nocturnes : public Saver {
 public:
  int count = PAIRS;
  bool color = true;

  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    mono_ = s.mono();
    n_ = count;
    if (w_ * h_ < 320 * 240) {
      n_ = round_half_up(count * (float) (w_ * h_) / (320 * 240) * 2);
      n_ = n_ < 2 ? 2 : n_ > count ? count : n_;
    }
    eyes_.assign(n_, Eye());
    shown_.assign(n_, Shown{-1, 0, 0});
    for (Eye &e : eyes_)
      spawn(e, w_ - CELL_W, h_ - CELL_H, rand(0, 6));
    s.clear();
  }

  void frame(Surface &s, float dt) override {
    /* Move everything on, then work out which pairs look different. */
    int changed = 0;
    for (int i = 0; i < n_; i++) {
      Eye &e = eyes_[i];
      if (age(e, dt))
        spawn(e, w_ - CELL_W, h_ - CELL_H, 0);
      Shown now{stage(e) < 0 ? -1 : e.kind * 3 + stage(e), round_half_up(e.x), round_half_up(e.y)};
      Shown &was = shown_[i];
      if (now.image == was.image && (now.image < 0 || (now.x == was.x && now.y == was.y)))
        continue;
      if (changed < MAX_DIRTY)
        dirty_[changed++] = rect(was);
      if (changed < MAX_DIRTY)
        dirty_[changed++] = rect(now);
      was = now;
    }
    if (!changed)
      return;
    /* Erase what went (the old boxes), then redraw, in order, every pair that
       touches any box that changed, so the later ones stay on top. */
    for (int i = 0; i < changed; i += 2)
      s.fill(dirty_[i], BLACK);
    for (int i = 0; i < n_; i++) {
      const Shown &sh = shown_[i];
      if (sh.image < 0)
        continue;
      Rect r = rect(sh);
      for (int j = 0; j < changed; j++)
        if (overlap(r, dirty_[j])) {
          draw(s, sh);
          break;
        }
    }
  }

 private:
  static const int MAX_DIRTY = 64;
  struct Shown {
    int image;  // kind * 3 + stage, or -1
    int x, y;
  };

  static Rect rect(const Shown &sh) {
    if (sh.image < 0)
      return {0, 0, 0, 0};
    return {sh.x, sh.y, CELL_W, CELL_H};
  }

  void draw(Surface &s, const Shown &sh) {
    Rgb c = (color && !mono_) ? TINTS[sh.image / 3] : WHITE;
    const uint32_t *rows = EYES[sh.image];
    for (int y = 0; y < CELL_H; y++) {
      uint32_t bits = rows[y];
      int py = sh.y + y;
      if (!bits || py < 0 || py >= h_)
        continue;
      for (int x = 0; x < CELL_W; x++)
        if (bits & (0x80000000u >> x))
          plot(s, sh.x + x, py, c);
    }
  }

  int w_ = 0, h_ = 0, n_ = 0;
  bool mono_ = false;
  std::vector<Eye> eyes_;
  std::vector<Shown> shown_;
  Rect dirty_[MAX_DIRTY];
};

/* ------------------------------------------------------------ text */

/* A pair across two cells (cat, tiger, owl) or in one (the small ones);
   then the half-shut lids for each. All but shut is the ROM's '-'. */
const char *const ART_CAT[8] = {"..........", "#........#", "###....###", "##########",
                                ".########.", "..##..##..", "..........", ".........."};
const char *const ART_ROUND[8] = {".....", ".....", "#####", "#####", "#####", ".###.", ".....", "....."};
const char *const ART_OWL[8] = {".###.", "#####", "#####", "##.##", "##.##", "#####", ".###.", "....."};
const char *const ART_SMALL[8] = {".....", ".....", ".....", "##.##", "##.##", ".....", ".....", "....."};
const char *const ART_TINY[8] = {".....", ".....", ".....", "#...#", ".....", ".....", ".....", "....."};
const char *const ART_HALF[8] = {".....", ".....", ".....", "#####", "#####", ".###.", ".....", "....."};
const char *const ART_HALF_SMALL[8] = {".....", ".....", ".....", ".....", "##.##", ".....", ".....", "....."};

enum { G_CAT_L, G_CAT_R, G_ROUND, G_OWL, G_SMALL, G_TINY, G_HALF, G_HALF_SMALL };
/* By kind: the open glyph of the left cell (the right is the same, bar the
   cat's), and how many cells wide. */
const uint8_t TEXT_OPEN[KINDS] = {G_CAT_L, G_ROUND, G_OWL, G_SMALL, G_TINY};
const uint8_t TEXT_CELLS[KINDS] = {2, 2, 2, 1, 1};

class NocturneText : public TextSaver {
 public:
  void start(TextScreen &t) override {
    cols_ = t.cols();
    rows_ = t.rows();
    n_ = cols_ * rows_ / 6;
    if (n_ < 1)
      n_ = 1;
    if (n_ > MAX)
      n_ = MAX;
    uint8_t bits[8];
    glyph_from_art(ART_CAT, 0, bits);
    t.glyph(G_CAT_L, bits);
    glyph_from_art(ART_CAT, 5, bits);
    t.glyph(G_CAT_R, bits);
    glyph_from_art(ART_ROUND, 0, bits);
    t.glyph(G_ROUND, bits);
    glyph_from_art(ART_OWL, 0, bits);
    t.glyph(G_OWL, bits);
    glyph_from_art(ART_SMALL, 0, bits);
    t.glyph(G_SMALL, bits);
    glyph_from_art(ART_TINY, 0, bits);
    t.glyph(G_TINY, bits);
    glyph_from_art(ART_HALF, 0, bits);
    t.glyph(G_HALF, bits);
    glyph_from_art(ART_HALF_SMALL, 0, bits);
    t.glyph(G_HALF_SMALL, bits);
    for (int i = 0; i < n_; i++)
      eyes_[i] = Eye{0, -1, 0, 0, 0, 0, 0, -1};  // not placed yet, so it blocks no one
    for (int i = 0; i < n_; i++)
      place(i, rand(0, 6));
    draw(t);
  }

  void frame(TextScreen &t, float dt) override {
    for (int i = 0; i < n_; i++)
      if (age(eyes_[i], dt))
        place(i, 0);
    draw(t);
  }

 private:
  static const int MAX = 12;

  /* Somewhere no other pair is, if a few tries find it. */
  void place(int i, float delay) {
    Eye &e = eyes_[i];
    for (int tries = 0; tries < 12; tries++) {
      spawn(e, 1, rows_, delay);
      int cells = TEXT_CELLS[e.kind];
      e.x = (float) rng.below(cols_ - cells + 1);
      e.y = (float) (int) e.y;
      bool clear = true;
      for (int j = 0; j < n_ && clear; j++) {
        const Eye &o = eyes_[j];
        if (j == i || (int) o.y != (int) e.y)
          continue;
        int ox = (int) o.x, oc = TEXT_CELLS[o.kind];
        /* A cell's gap either side, so pairs don't run together. */
        if ((int) e.x < ox + oc + 1 && ox < (int) e.x + cells + 1)
          clear = false;
      }
      if (clear)
        return;
    }
  }

  void draw(TextScreen &t) {
    t.clear();
    for (int i = 0; i < n_; i++) {
      const Eye &e = eyes_[i];
      int st = stage(e);
      if (st < 0)
        continue;
      int c = (int) e.x, r = (int) e.y;
      bool two = TEXT_CELLS[e.kind] == 2;
      uint8_t left, right;
      if (st == 0) {
        left = TEXT_OPEN[e.kind];
        right = e.kind == 0 ? (uint8_t) G_CAT_R : left;
      } else if (st == 1) {
        left = right = two ? G_HALF : G_HALF_SMALL;
      } else {
        left = right = '-';
      }
      t.put(c, r, left);
      if (two)
        t.put(c + 1, r, right);
    }
  }

  int cols_ = 16, rows_ = 2, n_ = 0;
  Eye eyes_[MAX];
};

}  // namespace

Saver *make_nocturne() { return new Nocturnes(); }
TextSaver *make_nocturne_text() { return new NocturneText(); }

AD_REGISTER_SAVER("nocturne", make_nocturne, make_nocturne_text)

}  // namespace adcore
#endif
