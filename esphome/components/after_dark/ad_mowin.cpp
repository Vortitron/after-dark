/*
 * ad_mowin.cpp - Mowin' Man, the lawn that grows over your screen, on
 * MOWIN.AD's own artwork. A port of all/modules/mowin.js, which was checked
 * against the module under Wine; see that file for what was measured (he
 * mows from the top left in vertical stripes one mower wide, down the first
 * seen from in front, up the next seen from behind) and what is a guess (how
 * fast he goes, what he looks like between stripes).
 *
 * Defaults are the site's: Speed Hurried, Mow Every Day (fifteen seconds),
 * Growth Rate Medium, Clear Screen First on. With Clear Screen First off the
 * grass grows over a desktop, as the JS's does over AfterDark.desktop(): this
 * paints a plain version of that one (teal, the icons, My Computer and
 * Notepad open, the taskbar and its clock) from rectangles and the 5x8 font.
 *
 * The JS keeps the lawn in an offscreen canvas and copies it to the screen
 * each frame. A screen-sized buffer is more RAM than a 320x240 board should
 * spend, so here the screen is the lawn: blades are drawn straight onto it,
 * and the mower is erased by drawing that bit of lawn again from the blades
 * and flowers (which are all kept, as in the JS). A flower the mower clips
 * but doesn't cut is drawn whole again rather than left half-erased as the
 * canvas leaves it.
 *
 * The three grass bitmaps are one-pixel columns (bright tip, dark root); their
 * colours are copied here rather than compiled in as art.
 *
 * Small screens: on a 1-bit panel the man, his mower and the flowers are
 * shrunk and baked to black and white by tools/art2c.py --mono, at 1/3, 1/4
 * or 1/6 size by screen height, and his speed with them. Blades can't get
 * thinner than a pixel, only shorter, so there are more of them to the
 * square inch (as many more as they are shorter) to keep it a lawn. The
 * desktop, if there is one, shrinks the same way and loses its writing.
 *
 * On a character LCD (MowinText) the lawn is cells of grass at three heights,
 * a flower now and then, and he mows it a column at a time, down one and up
 * the next, at the same share of the screen a second as on the real one.
 */
#if defined(AD_SAVER_MOWIN) || defined(AD_ALL_SAVERS)
#include <vector>
#include "ad_art.h"
#include "ad_draw.h"
#include "ad_font.h"
#include "ad_font_5x8.h"
#include "ad_text.h"
#ifndef AD_MONO_ONLY  // a 1-bit build leaves the colour art out
#include "ad_art_mowin.h"
#endif
#ifndef AD_COLOUR_ONLY  // a colour build leaves the 1-bit art out
#include "ad_art_mowin_m3.h"
#include "ad_art_mowin_m4.h"
#include "ad_art_mowin_m6.h"
#endif

namespace adcore {

namespace {

/* From mowin.js. */
const float PACE[] = {45, 85, 150, 280};  // Pokey, Normal, Hurried, Menace; px/s
const float DAY = 15;                      // seconds of screen time
const float GROW[] = {0, 30, 12, 5};       // a stage, seconds; 0 = None (never)
/* Each flower's left edge and width in the strip, which is 37 high. */
const int FLOWERS[6][2] = {{4, 30}, {37, 30}, {66, 28}, {97, 31}, {132, 24}, {158, 26}};
const int FLOWER_H = 37;
/* The grass bitmaps' one column each, tip first. */
const Rgb GREEN = {0, 255, 0}, DARK = {0, 127, 0}, TEAL = {0, 127, 127}, GREY = {168, 168, 168};
const Rgb BLADE0[] = {GREEN, TEAL, DARK};
const Rgb BLADE1[] = {GREEN, DARK, DARK, TEAL};
const Rgb BLADE2[] = {GREEN, GREEN, DARK, DARK, TEAL, TEAL, GREY};
const Rgb *const BLADES[] = {BLADE0, BLADE1, BLADE2};
const int BLADE_H[] = {3, 4, 7};
const float MAX_STEP = 0.05f;  // the JS's cap on a frame

/* -------------------------------------------------------------- helpers */

/* A view of a surface that only lets through what falls inside `r`, so a
   bit of the lawn (or desktop) can be drawn again without touching the rest. */
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

 private:
  Surface &t_;
  Rect r_;
};

/* Columns [sx0, sx1) of frame `f`, with column sx0 at (x0, y0). Clipped. */
Rect blit_part(Surface &s, const Art &art, const Frame &f, int x0, int y0, int sx0, int sx1) {
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
        int a = x < sx0 ? sx0 - x : 0, b = x + run > sx1 ? sx1 - x : run;
        int X = x0 + x - sx0;
        if (X + a < 0)
          a = -X;
        if (X + b > sw)
          b = sw - X;
        if (b > a)
          s.span(X + a, y, b - a, p + a, art.palette);
      }
      x += run;
      p += run;
    }
  }
  return s.clip({x0, y0, sx1 - sx0, f.h});
}

/* ------------------------------------------------------------- desktop */

/* ad.js's desktop(), plainly: k scales it down for a small screen, and the
   writing only goes on at full size. */
struct Box {
  int8_t x, y, w, h;
  uint8_t r, g, b;
};
const Box ICON_COMPUTER[] = {{4, 2, 24, 19, 192, 192, 192}, {4, 20, 24, 1, 0, 0, 0},     {27, 2, 1, 19, 0, 0, 0},
                             {7, 5, 18, 12, 0, 128, 128},   {12, 21, 8, 3, 192, 192, 192}, {2, 24, 28, 6, 192, 192, 192},
                             {2, 29, 28, 1, 0, 0, 0},       {20, 26, 7, 1, 128, 128, 128}};
const Box ICON_NETWORK[] = {{2, 14, 12, 10, 192, 192, 192}, {4, 16, 8, 6, 0, 0, 128},       {2, 25, 12, 3, 128, 128, 128},
                            {18, 14, 12, 10, 192, 192, 192}, {20, 16, 8, 6, 0, 0, 128},     {18, 25, 12, 3, 128, 128, 128},
                            {10, 2, 12, 10, 192, 192, 192},  {12, 4, 8, 6, 0, 0, 128},       {10, 13, 12, 3, 128, 128, 128},
                            {8, 30, 16, 1, 0, 0, 0},         {16, 16, 1, 14, 0, 0, 0}};
const Box ICON_INBOX[] = {{6, 6, 20, 13, 255, 255, 128}, {6, 6, 20, 1, 128, 128, 0}, {2, 18, 28, 10, 0, 0, 128},
                          {4, 20, 24, 6, 64, 64, 192}};
const Box ICON_BIN[] = {{8, 6, 16, 24, 192, 192, 192}, {6, 4, 20, 3, 128, 128, 128}, {10, 9, 1, 19, 128, 128, 128},
                        {14, 9, 1, 19, 128, 128, 128}, {18, 9, 1, 19, 128, 128, 128}, {22, 9, 1, 19, 128, 128, 128},
                        {8, 30, 16, 1, 0, 0, 0}};
const Box ICON_BRIEFCASE[] = {{3, 10, 26, 18, 128, 64, 0}, {4, 11, 24, 3, 192, 128, 64}, {11, 5, 10, 2, 64, 32, 0},
                              {11, 5, 2, 5, 64, 32, 0},    {19, 5, 2, 5, 64, 32, 0},     {14, 17, 4, 3, 255, 255, 0}};
const Box ICON_FOLDER[] = {{3, 8, 12, 4, 192, 192, 0}, {3, 11, 26, 17, 255, 255, 128}, {3, 27, 26, 1, 128, 128, 0},
                           {28, 11, 1, 17, 128, 128, 0}};
const Box ICON_DRIVE[] = {{2, 12, 28, 12, 192, 192, 192}, {2, 23, 28, 1, 128, 128, 128}, {29, 12, 1, 12, 128, 128, 128},
                          {24, 19, 3, 2, 0, 255, 0}};
const Box ICON_FLOPPY[] = {{6, 4, 20, 22, 0, 0, 0}, {11, 4, 10, 8, 192, 192, 192}, {9, 15, 14, 9, 255, 255, 255}};
const Box ICON_PRINTER[] = {{9, 3, 14, 10, 255, 255, 255}, {3, 13, 26, 10, 192, 192, 192}, {3, 22, 26, 2, 128, 128, 128},
                            {8, 24, 16, 4, 255, 255, 255}};
struct Icon {
  const Box *boxes;
  uint8_t n;
};
#define AD_ICON(a) \
  { a, (uint8_t) (sizeof(a) / sizeof(a[0])) }
const Icon COMPUTER = AD_ICON(ICON_COMPUTER), NETWORK = AD_ICON(ICON_NETWORK), INBOX = AD_ICON(ICON_INBOX),
           BIN = AD_ICON(ICON_BIN), BRIEFCASE = AD_ICON(ICON_BRIEFCASE), FOLDER = AD_ICON(ICON_FOLDER),
           DRIVE = AD_ICON(ICON_DRIVE), FLOPPY = AD_ICON(ICON_FLOPPY), PRINTER = AD_ICON(ICON_PRINTER);
#undef AD_ICON

const Rgb DESK = {0, 128, 128}, FACE = {192, 192, 192}, SHADE = {128, 128, 128}, WHITE = {255, 255, 255};

class Desktop {
 public:
  void begin(int w, int h, float k) {
    w_ = w;
    h_ = h;
    k_ = k;
    /* The clock on the taskbar is the time it was painted, as in the JS. */
    Clock c;
    int hour = 10, minute = 10;
    if (local_time(c)) {
      hour = c.hour;
      minute = c.minute;
    }
    int h12 = hour % 12 ? hour % 12 : 12;
    int i = 0;
    if (h12 >= 10)
      clock_[i++] = '1';
    clock_[i++] = '0' + h12 % 10;
    clock_[i++] = ':';
    clock_[i++] = '0' + minute / 10;
    clock_[i++] = '0' + minute % 10;
    clock_[i++] = ' ';
    clock_[i++] = hour < 12 ? 'A' : 'P';
    clock_[i++] = 'M';
    clock_[i] = 0;
  }

  /* All of it; draw through a ClipSurface to paint a part. */
  void paint(Surface &g) const {
    g.fill_rect(0, 0, w_, h_, DESK);
    const int bar = S(28);
    static const Icon *const ICONS[] = {&COMPUTER, &NETWORK, &INBOX, &BIN, &BRIEFCASE, &FOLDER};
    static const char *const NAMES[][2] = {{"My Computer", nullptr}, {"Network", "Neighborhood"}, {"Inbox", nullptr},
                                           {"Recycle Bin", nullptr}, {"My Briefcase", nullptr},   {"Letters", nullptr}};
    for (int i = 0; i < 6; i++) {
      int y = S(10 + i * 70);
      if (y + S(50) > h_ - bar)
        break;
      icon(g, *ICONS[i], S(22), y);
      label(g, NAMES[i][0], S(38), y + S(36), WHITE);
      if (NAMES[i][1])
        label(g, NAMES[i][1], S(38), y + S(49), WHITE);
    }

    /* My Computer, behind. */
    int mx = round_half_up(w_ * 0.46f), my = round_half_up(h_ * 0.08f);
    int mw = min(S(360), round_half_up(w_ * 0.48f)), mh = min(S(230), round_half_up(h_ * 0.42f));
    if (mw > S(160) && mh > S(120)) {
      window(g, mx, my, mw, mh, "My Computer", false);
      menu(g, "File  Edit  View  Help", mx + S(9), my + S(26));
      g.fill_rect(mx + S(4), my + S(42), mw - S(8), mh - S(66), WHITE);
      static const Icon *const ITEMS[] = {&FLOPPY, &DRIVE, &DRIVE, &FOLDER, &PRINTER, &FOLDER};
      static const char *const LABELS[] = {"3\xc2\xbd Floppy (A:)", "(C:)", "Cd (D:)", "Control Panel", "Printers",
                                           "Dial-Up"};
      for (int i = 0; i < 6; i++) {
        int ix = mx + S(14 + (i % 4) * 82), iy = my + S(50 + (i / 4) * 70);
        if (ix + S(70) > mx + mw || iy + S(50) > my + mh - S(24))
          continue;
        icon(g, *ITEMS[i], ix + S(20), iy);
        label(g, LABELS[i], ix + S(36), iy + S(36), BLACK);
      }
      bevel(g, mx + S(4), my + mh - S(22), mw - S(8), S(18), false);
      menu(g, "6 object(s)", mx + S(9), my + mh - S(18));
    }

    /* Notepad, in front. */
    int nx = round_half_up(w_ * 0.2f), ny = round_half_up(h_ * 0.3f);
    int nw = min(S(400), round_half_up(w_ * 0.5f)), nh = min(S(260), round_half_up(h_ * 0.5f));
    if (nw > S(140) && nh > S(100)) {
      window(g, nx, ny, nw, nh, "LETTER.TXT - Notepad", true);
      menu(g, "File  Edit  Search  Help", nx + S(9), ny + S(26));
      g.fill_rect(nx + S(4), ny + S(42), nw - S(8), nh - S(46), WHITE);
      g.fill_rect(nx + S(4), ny + S(42), nw - S(8), 1, SHADE);
      g.fill_rect(nx + S(4), ny + S(42), 1, nh - S(46), SHADE);
      if (k_ >= 1) {
        static const char *const LETTER[] = {"Dear Mom,", "", "The new computer is great. It has a",
                                             "screen saver with flying toasters and",
                                             "I have not done any work since Tuesday.", "", "Please send cookies.",
                                             "", "Love,", "Me"};
        ClipSurface pane(g, {nx + 6, ny + 44, nw - 12, nh - 50});
        for (int i = 0; i < 10; i++)
          draw_text(pane, font_5x8, nx + 8, ny + 48 + i * 15, LETTER[i], BLACK);
      }
    }

    /* The taskbar. */
    int ty = h_ - bar;
    g.fill_rect(0, ty, w_, bar, FACE);
    g.fill_rect(0, ty + 1, w_, 1, WHITE);
    bevel(g, S(2), ty + S(4), S(54), S(22), true);
    static const Rgb FLAG[] = {{255, 0, 0}, {0, 255, 0}, {0, 0, 255}, {255, 255, 0}};
    for (int i = 0; i < 4; i++)
      g.fill_rect(S(8 + (i % 2) * 5), ty + S(9 + (i / 2) * 5), S(4) > 0 ? S(4) : 1, S(4) > 0 ? S(4) : 1, FLAG[i]);
    menu(g, "Start", S(21), ty + S(9));
    static const char *const TASKS[] = {"My Computer", "LETTER.TXT - Notepad"};
    for (int i = 0; i < 2; i++) {
      int bx = S(62 + i * 150);
      if (bx + S(144) > w_ - S(70))
        break;
      bevel(g, bx, ty + S(4), S(144), S(22), i == 0);
      menu(g, TASKS[i], bx + S(8), ty + S(9));
    }
    bevel(g, w_ - S(66), ty + S(4), S(63), S(22), false);
    menu(g, clock_, w_ - S(56), ty + S(9));
  }

 private:
  int S(int v) const { return round_half_up(v * k_); }
  static int min(int a, int b) { return a < b ? a : b; }

  void icon(Surface &g, const Icon &ic, int x, int y) const {
    for (int i = 0; i < ic.n; i++) {
      const Box &b = ic.boxes[i];
      int bw = S(b.w), bh = S(b.h);
      g.fill_rect(x + S(b.x), y + S(b.y), bw > 0 ? bw : 1, bh > 0 ? bh : 1, {b.r, b.g, b.b});
    }
  }

  void label(Surface &g, const char *text, int cx, int y, Rgb c) const {
    if (k_ < 1)
      return;
    draw_text(g, font_5x8, cx - text_width(font_5x8, text) / 2, y + 2, text, c);
  }

  void menu(Surface &g, const char *text, int x, int y) const {
    if (k_ >= 1)
      draw_text(g, font_5x8, x, y + 1, text, BLACK);
  }

  void bevel(Surface &g, int x, int y, int w, int h, bool raised) const {
    g.fill_rect(x, y, w, h, FACE);
    Rgb hi = raised ? WHITE : SHADE, lo = raised ? BLACK : WHITE;
    g.fill_rect(x, y, w - 1, 1, hi);
    g.fill_rect(x, y, 1, h - 1, hi);
    g.fill_rect(x, y + h - 1, w, 1, lo);
    g.fill_rect(x + w - 1, y, 1, h, lo);
  }

  void window(Surface &g, int x, int y, int w, int h, const char *title, bool active) const {
    bevel(g, x, y, w, h, true);
    Rgb a = active ? Rgb{0, 0, 128} : SHADE, b = active ? Rgb{16, 132, 208} : FACE;
    int bw = w - S(6);
    for (int i = 0; i < bw; i++) {
      float t = bw > 1 ? (float) i / (bw - 1) : 0;
      Rgb c = {(uint8_t) (a.r + (b.r - a.r) * t), (uint8_t) (a.g + (b.g - a.g) * t), (uint8_t) (a.b + (b.b - a.b) * t)};
      g.fill_rect(x + S(3) + i, y + S(3), 1, S(18), c);
    }
    if (k_ >= 1)
      draw_text(g, font_5x8, x + 7, y + 8, title, active ? WHITE : FACE);
    for (int i = 0; i < 3; i++)
      bevel(g, x + w - S(55 - i * 16 - (i == 2 ? 2 : 0)), y + S(5), S(16), S(14), true);
  }

  int w_ = 0, h_ = 0;
  float k_ = 1;
  char clock_[10] = "10:10 AM";
};

/* ---------------------------------------------------------------- lawn */

struct Variant {
  const Art *art;
  float scale;
  bool mono;
  int min_height;
};
/* The bitmaps are numbered alike in every set; name them from one that is in
   this build. */
#ifdef AD_MONO_ONLY
namespace names = art_mowin_m3;
#else
namespace names = art_mowin;
#endif

const Variant VARIANTS[] = {
#ifndef AD_MONO_ONLY
    {&art_mowin::ART, 1, false, 0},
#endif
#ifndef AD_COLOUR_ONLY
    {&art_mowin_m3::ART, 1 / 3.0f, true, 96},
    {&art_mowin_m4::ART, 1 / 4.0f, true, 48},
    {&art_mowin_m6::ART, 1 / 6.0f, true, 0},
#endif
};

struct Blade {
  int16_t x, y;      // its root
  uint16_t next;     // centiseconds to its next stage
  int8_t stage;      // -1 cut, else 0..2
};

struct Flower {
  int16_t x, y;
  uint8_t kind;
};

class Mowin : public Saver {
 public:
  int speed = 2;        // Hurried
  int every = 1;        // Day
  int growth = 2;       // Medium
  bool clear_screen = true;

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
    const Art &art = *variant_->art;
    up_ = &art.sequence(names::BM_UP)->frames[0];
    down_ = &art.sequence(names::BM_DOWN)->frames[0];
    right_ = &art.sequence(names::BM_RIGHT)->frames[0];
    flowers_art_ = &art.sequence(names::BM_FLOWERS)->frames[0];
    for (int i = 0; i < 3; i++) {
      int bh = round_half_up(BLADE_H[i] * k_);
      blade_h_[i] = bh < 1 ? 1 : bh;
    }
    reach_ = blade_h_[2] + 1;
    flower_reach_ = flowers_art_->h + 1;

    desktop_.begin(w_, h_, k_);
    if (clear_screen)
      s.clear();
    else
      desktop_.paint(s);

    /* Blades live in bands, so a pass of the mower only looks at its own. */
    band_ = 16;
    int nbands = h_ / band_ + 2;
    target_ = (int) roundf(w_ * h_ / (14 * k_));
    bands_.assign(nbands, std::vector<Blade>());
    for (auto &b : bands_)
      b.reserve(target_ / nbands * 6 / 5 + 16);  // a band that fills past this grows once
    count_ = 0;
    flowers_.clear();
    flowers_.reserve(32);
    mowing_ = false;
    /* The module's lawn is in within a couple of seconds and he starts
       straight away. */
    rest_ = 2.5f;
    drawn_ = {0, 0, 0, 0};
  }

  void frame(Surface &s, float dt) override {
    /* Put back the lawn where he was. */
    restore(s, drawn_);
    drawn_ = {0, 0, 0, 0};
    while (dt > 0) {
      float step = dt > MAX_STEP ? MAX_STEP : dt;
      tick(s, step);
      dt -= step;
    }
    if (mowing_) {
      const Frame *img = m_.turning ? right_ : m_.dir > 0 ? down_ : up_;
      int x = round_half_up(m_.x), y = round_half_up(m_.y);
      drawn_ = blit_part(s, *variant_->art, *img, x, y, 0, img->w);
    }
  }

 private:
  struct Mower {
    float x, y, turning, next;
    int dir;
  };

  void draw_blade(Surface &s, const Blade &b) const {
    if (b.stage < 0)
      return;
    const int n = BLADE_H[b.stage], hs = blade_h_[b.stage];
    for (int i = 0; i < hs; i++)
      plot(s, b.x, b.y - hs + i, BLADES[b.stage][i * n / hs]);
  }

  void draw_flower(Surface &s, const Flower &f) const {
    const float k = k_;
    int sx0 = round_half_up(FLOWERS[f.kind][0] * k), sx1 = round_half_up((FLOWERS[f.kind][0] + FLOWERS[f.kind][1]) * k);
    if (sx1 <= sx0)
      sx1 = sx0 + 1;
    int x = round_half_up(f.x - (sx1 - sx0) / 2.0f), y = f.y - flowers_art_->h;
    blit_part(s, *variant_->art, *flowers_art_, x, y, sx0, sx1);
  }

  /* What is under the grass: black, or the desktop. */
  void bare(Surface &s, Rect r) const {
    if (clear_screen) {
      s.fill(r, BLACK);
    } else {
      ClipSurface part(s, r);
      desktop_.paint(part);
    }
  }

  /* Draw the lawn again inside `r`: bare, the flowers, the blades. */
  void restore(Surface &s, Rect r) const {
    r = s.clip(r);
    if (r.empty())
      return;
    bare(s, r);
    ClipSurface part(s, r);
    for (const Flower &f : flowers_)
      if (f.y > r.y && f.y - flower_reach_ < r.y + r.h)
        draw_flower(part, f);
    int top = r.y / band_, bottom = (r.y + r.h + reach_) / band_;
    for (int k = top; k <= bottom && k < (int) bands_.size(); k++)
      for (const Blade &b : bands_[k])
        if (b.x >= r.x && b.x < r.x + r.w && b.y > r.y && b.y - reach_ < r.y + r.h)
          draw_blade(part, b);
  }

  uint16_t grow_time() const { return (uint16_t) (GROW[growth] * rng.range(0.5f, 1.5f) * 100); }

  void sprout(Surface &s) {
    Blade b;
    b.x = (int16_t) rng.below(w_);
    int lo = blade_h_[0] + 1;
    b.y = (int16_t) floorf(rng.range(lo, h_));
    b.stage = 0;
    b.next = grow_time();
    bands_[b.y / band_].push_back(b);
    count_++;
    draw_blade(s, b);
    /* Now and then a flower comes up with the grass. */
    if (rng.uniform() < 0.0015f && flowers_.size() < flowers_.capacity()) {
      Flower f = {b.x, b.y, (uint8_t) rng.below(6)};
      flowers_.push_back(f);
      draw_flower(s, f);
    }
  }

  /* Cut everything under the deck: blades back to nothing, flowers gone,
     and that bit of lawn drawn again. */
  void mow(Surface &s, float x, float y, float w, float h) {
    if (x < 0) {
      w += x;
      x = 0;
    }
    int x0 = (int) ceilf(x), x1 = (int) ceilf(x + w), y0 = (int) ceilf(y), y1 = (int) ceilf(y + h);
    if (x1 <= x0 || y1 <= y0)
      return;
    int top = y0 / band_, bottom = (y1 + reach_) / band_;
    if (top < 0)
      top = 0;
    for (int k = top; k <= bottom && k < (int) bands_.size(); k++)
      for (Blade &b : bands_[k])
        if (b.x >= x0 && b.x < x1 && b.y >= y0 && b.y - reach_ < y1) {
          /* Cut to nothing; it comes back through all three heights. */
          b.stage = -1;
          b.next = grow_time();
        }
    int reach = round_half_up(20 * k_);
    for (size_t i = 0; i < flowers_.size();) {
      const Flower &f = flowers_[i];
      if (f.x >= x0 && f.x < x1 && f.y >= y0 && f.y - reach < y1) {
        flowers_[i] = flowers_.back();
        flowers_.pop_back();
      } else {
        i++;
      }
    }
    restore(s, {x0, y0, x1 - x0, y1 - y0});
  }

  void tick(Surface &s, float dt) {
    /* The lawn fills in; after that the mown blades grow back. */
    int sprouts = (int) ceilf(target_ * dt / 2.5f);
    if (sprouts > target_ - count_)
      sprouts = target_ - count_;
    for (int i = 0; i < sprouts; i++)
      sprout(s);
    if (GROW[growth] > 0) {
      std::vector<Blade> &band = bands_[rng.below((int) bands_.size())];
      int dec = (int) (dt * bands_.size() * 100);
      for (Blade &b : band) {
        b.next = b.next > dec ? b.next - dec : 0;
        if (b.next == 0 && b.stage < 2) {
          b.stage++;
          b.next = grow_time();
          draw_blade(s, b);
        }
      }
    }

    if (!mowing_) {
      rest_ -= dt;
      if (rest_ <= 0) {
        /* A new mowing: from the top left, a stripe at a time across. */
        lane_ = down_->w;
        m_ = {0, (float) -down_->h, 0, 0, 1};
        mowing_ = true;
      }
      return;
    }
    Mower &m = m_;
    const float pace = PACE[speed] * k_;
    /* Down a stripe seen from in front, up the next seen from behind, and
       sideways onto the next stripe in between. */
    const Frame *img = m.turning ? right_ : m.dir > 0 ? down_ : up_;
    float mw = img->w, mh = img->h;
    if (m.turning) {
      m.x += pace * dt;
      m.turning -= pace * dt;
      mow(s, m.x, m.dir > 0 ? h_ - mh * 0.6f : 0, mw * 0.6f, mh * 0.6f);
      if (m.turning <= 0) {
        m.turning = 0;
        m.x = m.next;
        m.dir = -m.dir;
        m.y = m.dir > 0 ? -mh * 0.2f : h_ - mh * 0.8f;
      }
    } else {
      m.y += m.dir * pace * dt;
      /* The deck is under him; it cuts a stripe his own width. */
      mow(s, m.x, m.y, lane_, mh);
      bool at_end = m.dir > 0 ? m.y + mh * 0.8f >= h_ : m.y + mh * 0.2f <= 0;
      if (at_end) {
        m.next = m.x + lane_;
        if (m.next >= w_) {
          mowing_ = false;
          rest_ = every * DAY > 1.5f ? every * DAY : 1.5f;
          return;
        }
        /* Turn onto the next stripe. */
        m.turning = lane_;
        m.y = m.dir > 0 ? h_ - right_->h : 0;
      }
    }
  }

  const Variant *variant_ = &VARIANTS[0];
  float k_ = 1;
  int w_ = 0, h_ = 0;
  const Frame *up_ = nullptr, *down_ = nullptr, *right_ = nullptr, *flowers_art_ = nullptr;
  int blade_h_[3] = {3, 4, 7};
  int reach_ = 8, flower_reach_ = 38;
  Desktop desktop_;
  int band_ = 16;
  std::vector<std::vector<Blade>> bands_;
  std::vector<Flower> flowers_;
  int target_ = 0, count_ = 0;
  bool mowing_ = false;
  float rest_ = 0;
  float lane_ = 0;
  Mower m_ = {0, 0, 0, 0, 1};
  Rect drawn_ = {0, 0, 0, 0};
};


/* ------------------------------------------------------------ text */

/* Grass at its three heights, a flower in it, and the man from in front,
   from behind and from the side. */
const char *const GRASS[3][8] = {
    {".....", ".....", ".....", ".....", ".....", ".....", "#..#.", "#.##."},
    {".....", ".....", ".....", ".....", "..#..", "#.#.#", "#.#.#", "#####"},
    {".....", ".#...", ".#..#", "##.##", "#.#.#", "#.###", "###.#", "#####"},
};
const char *const FLOWER[8] = {".....", ".#.#.", "..#..", ".#.#.", "..#..", "#.#.#", "#.#.#", "#####"};
const char *const MAN[3][8] = {
    {"..#..", ".###.", "..#..", "#####", "#.#.#", "#####", "#...#", "....."},  // coming down, from in front
    {"..#..", ".###.", ".###.", "#####", "#####", "#####", "##.##", "....."},  // going up, from behind
    {".#...", ".##..", ".###.", "#####", "#####", ".#.#.", ".....", "....."},  // across, from the side
};
enum { G_GRASS1, G_GRASS2, G_GRASS3, G_FLOWER, G_DOWN, G_UP, G_SIDE };

/* The lawn a cell at a time: each cell's grass grows a stage at the Growth
   Rate, and he mows it down a column and up the next, as fast for its height
   as he crosses the real screen (768 px at the Speed's px/s). */
class MowinText : public TextSaver {
 public:
  int speed = 2, every = 1, growth = 2;

  void start(TextScreen &t) override {
    cols_ = t.cols();
    rows_ = t.rows();
    uint8_t bits[8];
    for (int i = 0; i < 3; i++) {
      glyph_from_art(GRASS[i], 0, bits);
      t.glyph(G_GRASS1 + i, bits);
      glyph_from_art(MAN[i], 0, bits);
      t.glyph(G_DOWN + i, bits);
    }
    glyph_from_art(FLOWER, 0, bits);
    t.glyph(G_FLOWER, bits);
    for (int r = 0; r < rows_; r++)
      for (int c = 0; c < cols_; c++) {
        Cell &k = cells_[r][c];
        /* The lawn comes up over the first couple of seconds. */
        k.stage = 0;
        k.flower = false;
        k.next = rng.range(0, 2.5f);
      }
    mowing_ = false;
    rest_ = 2.5f;
    t.clear();
    draw(t);
  }

  void frame(TextScreen &t, float dt) override {
    for (int r = 0; r < rows_; r++)
      for (int c = 0; c < cols_; c++) {
        Cell &k = cells_[r][c];
        if (k.stage >= 3 || (k.stage > 0 && GROW[growth] == 0))
          continue;
        k.next -= dt;
        if (k.next <= 0) {
          if (k.stage == 0 && rng.uniform() < 0.04f)
            k.flower = true;
          k.stage++;
          k.next = GROW[growth] * rng.range(0.5f, 1.5f);
        }
      }
    if (!mowing_) {
      rest_ -= dt;
      if (rest_ <= 0) {
        mowing_ = true;
        col_ = 0;
        dir_ = 1;
        pos_ = -1;
        turning_ = 0;
      }
    } else {
      /* Rows a second: his speed over the height of a 768-line screen. */
      float pace = PACE[speed] / 768 * rows_;
      if (turning_ > 0) {
        turning_ -= dt * pace * 2;  // a stripe's width is about half its height on his scale
        if (turning_ <= 0) {
          col_++;
          dir_ = -dir_;
          pos_ = dir_ > 0 ? -1 : rows_;
        }
      } else {
        pos_ += dir_ * pace * dt;
        int r = (int) floorf(pos_ + 0.5f);
        if (r >= 0 && r < rows_ && col_ < cols_)
          cut(r, col_);
        if (dir_ > 0 ? pos_ >= rows_ - 0.5f : pos_ <= -0.5f) {
          if (col_ + 1 >= cols_) {
            mowing_ = false;
            rest_ = every * DAY > 1.5f ? every * DAY : 1.5f;
          } else {
            turning_ = 1;
          }
        }
      }
    }
    draw(t);
  }

 private:
  struct Cell {
    uint8_t stage;  // 0 bare, 1-3 the grass's heights
    bool flower;
    float next;
  };

  void cut(int r, int c) {
    Cell &k = cells_[r][c];
    k.stage = 0;
    k.flower = false;
    k.next = GROW[growth] > 0 ? GROW[growth] * rng.range(0.5f, 1.5f) : 1e9f;
  }

  void draw(TextScreen &t) {
    for (int r = 0; r < rows_; r++)
      for (int c = 0; c < cols_; c++) {
        const Cell &k = cells_[r][c];
        t.put(c, r, k.stage == 0 ? ' ' : k.flower && k.stage >= 2 ? G_FLOWER : G_GRASS1 + k.stage - 1);
      }
    if (mowing_) {
      if (turning_ > 0) {
        int r = dir_ > 0 ? rows_ - 1 : 0;
        int c = col_ + (turning_ < 0.5f ? 1 : 0);
        if (c < cols_) {
          cut(r, c);
          t.put(c, r, G_SIDE);
        }
      } else {
        int r = (int) floorf(pos_ + 0.5f);
        if (r >= 0 && r < rows_)
          t.put(col_, r, dir_ > 0 ? G_DOWN : G_UP);
      }
    }
  }

  int cols_ = 16, rows_ = 2;
  Cell cells_[TextScreen::MAX_ROWS][TextScreen::MAX_COLS];
  bool mowing_ = false;
  float rest_ = 0;
  int col_ = 0, dir_ = 1;
  float pos_ = 0, turning_ = 0;
};

}  // namespace

Saver *make_mowin() { return new Mowin(); }
TextSaver *make_mowin_text() { return new MowinText(); }

AD_REGISTER_SAVER("mowin", make_mowin, make_mowin_text)

}  // namespace adcore
#endif
