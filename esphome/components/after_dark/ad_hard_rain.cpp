/*
 * ad_hard_rain.cpp - Hard Rain, raindrops rippling on the screen. A port of
 * all/modules/hardrain.js, which was checked against RAIN.AD's own GDI calls
 * under Wine; see that file for what was measured and what was inferred.
 *
 * Defaults are the module's: nine drops (Lots), Drop Size medium (largest
 * radius 43 px), Clear Screen First off - so it rains on the desktop, a
 * Windows 95 one painted here as AfterDark.desktop() paints it in ad.js
 * (icons, Notepad, the taskbar, with the fonts this component has).
 *
 * Small screens: the drops shrink with the screen (by its shorter side
 * against 240, so 320x240 is the web version's size), the pens don't. The
 * desktop's layout needs 240 px or so; below 120 px tall a small one is
 * painted instead (a Notepad window, an icon or two and a thin taskbar), as
 * the full one would be all taskbar. On a 1-bit panel the rings are white:
 * the pure blue and red would dither to a dotted few pixels.
 * On a character LCD (HardRainText) three drops fall on a DotMatrix.
 */
#if defined(AD_SAVER_HARD_RAIN) || defined(AD_ALL_SAVERS)
#include "ad_draw.h"
#include "ad_font.h"
#include "ad_font_4x6.h"
#include "ad_font_6x10.h"
#include "ad_font_8x13.h"
#include "ad_text.h"

#include <cstdio>
#include <cstring>

namespace adcore {

namespace {

const int COUNT = 9;      // # of Drops: lots
const float REACH = 43;   // Drop Size: medium, the largest radius in px
const float STEPS = 15;   // rounds a second
const int MAX_DROPS = 9;
const Rgb COLOURS[] = {{255, 0, 0}, {0, 255, 0}, {0, 0, 255}, {255, 255, 0}, {0, 255, 255}, {255, 0, 255}};
const Rgb WHITE = {255, 255, 255};

/* ------------------------------------------------------------ desktop */

/* Draws through to another surface, but only inside a box. */
class Clipped : public Surface {
 public:
  Clipped(Surface &s, Rect r) : s_(s), r_(s.clip(r)) {}
  int width() const override { return s_.width(); }
  int height() const override { return s_.height(); }
  bool mono() const override { return s_.mono(); }
  void pixel(int x, int y, Rgb c) override {
    if (x >= r_.x && y >= r_.y && x < r_.x + r_.w && y < r_.y + r_.h)
      s_.pixel(x, y, c);
  }

 private:
  Surface &s_;
  Rect r_;
};

Rgb hex(uint32_t v) { return rgb(v >> 16, (v >> 8) & 0xff, v & 0xff); }
const Rgb TEAL = hex(0x008080), SILVER = hex(0xc0c0c0), GREY = hex(0x808080), NAVY = hex(0x000080);

void bevel(Surface &g, int x, int y, int w, int h, bool raised) {
  g.fill_rect(x, y, w, h, SILVER);
  Rgb a = raised ? WHITE : GREY;
  g.fill_rect(x, y, w - 1, 1, a);
  g.fill_rect(x, y, 1, h - 1, a);
  Rgb b = raised ? BLACK : WHITE;
  g.fill_rect(x, y + h - 1, w, 1, b);
  g.fill_rect(x + w - 1, y, 1, h, b);
  Rgb c = raised ? GREY : SILVER;
  g.fill_rect(x + 1, y + h - 2, w - 2, 1, c);
  g.fill_rect(x + w - 2, y + 1, 1, h - 2, c);
}

/* The stock icons, drawn at 32x32 from rectangles, as ad.js has them. */
enum Icon { COMPUTER, NETWORK, INBOX, FLOPPY, DRIVE, FOLDER, PRINTER };
void icon(Surface &g, Icon which, int x, int y) {
  auto r = [&](uint32_t c, int a, int b, int w, int h) { g.fill_rect(x + a, y + b, w, h, hex(c)); };
  switch (which) {
    case COMPUTER:
      r(0xc0c0c0, 4, 2, 24, 19);
      r(0x000000, 4, 20, 24, 1);
      r(0x000000, 27, 2, 1, 19);
      r(0x008080, 7, 5, 18, 12);
      r(0xc0c0c0, 12, 21, 8, 3);
      r(0xc0c0c0, 2, 24, 28, 6);
      r(0x000000, 2, 29, 28, 1);
      r(0x808080, 20, 26, 7, 1);
      break;
    case NETWORK: {
      static const int P[3][2] = {{2, 12}, {18, 12}, {10, 0}};
      for (const auto &p : P) {
        r(0xc0c0c0, p[0], p[1] + 2, 12, 10);
        r(0x000080, p[0] + 2, p[1] + 4, 8, 6);
        r(0x808080, p[0], p[1] + 13, 12, 3);
      }
      r(0x000000, 8, 30, 16, 1);
      r(0x000000, 16, 16, 1, 14);
      break;
    }
    case INBOX:
      r(0xffff80, 6, 6, 20, 13);
      r(0x808000, 6, 6, 20, 1);
      r(0x000080, 2, 18, 28, 10);
      r(0x4040c0, 4, 20, 24, 6);
      break;
    case FLOPPY:
      r(0x000000, 6, 4, 20, 22);
      r(0xc0c0c0, 11, 4, 10, 8);
      r(0xffffff, 9, 15, 14, 9);
      break;
    case DRIVE:
      r(0xc0c0c0, 2, 12, 28, 12);
      r(0x808080, 2, 23, 28, 1);
      r(0x808080, 29, 12, 1, 12);
      r(0x00ff00, 24, 19, 3, 2);
      break;
    case FOLDER:
      r(0xc0c000, 3, 8, 12, 4);
      r(0xffff80, 3, 11, 26, 17);
      r(0x808000, 3, 27, 26, 1);
      r(0x808000, 28, 11, 1, 17);
      break;
    case PRINTER:
      r(0xffffff, 9, 3, 14, 10);
      r(0xc0c0c0, 3, 13, 26, 10);
      r(0x808080, 3, 22, 26, 2);
      r(0xffffff, 8, 24, 16, 4);
      break;
  }
}

/* Bold, the way a fixed font does it: twice, a pixel apart. */
void bold(Surface &g, const Font &f, int x, int y, const char *text, Rgb c) {
  draw_text(g, f, x, y, text, c);
  draw_text(g, f, x + 1, y, text, c);
}

/* An icon's caption, centred on cx in a 13 px box. */
void label(Surface &g, const char *text, int cx, int y, Rgb colour, const Rgb *back) {
  int w = text_width(font_6x10, text) + 4;
  if (back)
    g.fill_rect(round_half_up(cx - w / 2.0f), y, w, 13, *back);
  draw_text(g, font_6x10, cx - text_width(font_6x10, text) / 2, y + 2, text, colour);
}

void menu(Surface &g, const char *const *items, int n, int x, int y) {
  for (int i = 0; i < n; i++)
    x += draw_text(g, font_6x10, x, y, items[i], BLACK) + 14;
}

void window95(Surface &g, int x, int y, int w, int h, const char *title, bool active) {
  bevel(g, x, y, w, h, true);
  Rgb a = active ? NAVY : GREY, b = active ? hex(0x1084d0) : SILVER;
  for (int i = 0; i < w - 6; i++) {
    float t = (float) (i + 3) / w;
    g.fill_rect(x + 3 + i, y + 3, 1, 18,
                rgb(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t));
  }
  bold(g, font_6x10, x + 7, y + 7, title, active ? WHITE : SILVER);
  for (int i = 0; i < 3; i++) {
    int bx = x + w - 55 + i * 16 + (i == 2 ? 2 : 0);
    bevel(g, bx, y + 5, 16, 14, true);
    if (i == 0)
      g.fill_rect(bx + 4, y + 14, 6, 2, BLACK);
    if (i == 1) {
      g.fill_rect(bx + 3, y + 7, 9, 2, BLACK);
      g.fill_rect(bx + 3, y + 7, 1, 8, BLACK);
      g.fill_rect(bx + 11, y + 7, 1, 8, BLACK);
      g.fill_rect(bx + 3, y + 15, 9, 1, BLACK);
    }
    if (i == 2)
      for (int k = 0; k < 7; k++) {
        g.fill_rect(bx + 4 + k, y + 8 + k, 2, 1, BLACK);
        g.fill_rect(bx + 10 - k, y + 8 + k, 2, 1, BLACK);
      }
  }
}

const char *const LETTER[] = {"Dear Mom,", "", "The new computer is great. It has a", "screen saver with flying toasters and",
                              "I have not done any work since Tuesday.", "", "Please send cookies.", "", "Love,", "Me"};

void clock_text(char *out, size_t n) {
  Clock c;
  if (!local_time(c)) {
    c.hour = 10;
    c.minute = 10;
  }
  int hr = c.hour % 12 ? c.hour % 12 : 12;
  snprintf(out, n, "%d:%02d %s", hr, c.minute, c.hour < 12 ? "AM" : "PM");
}

/* ad.js's desktop(), for screens 120 px tall or more. */
void desktop(Surface &g) {
  int W = g.width(), H = g.height();
  g.fill_rect(0, 0, W, H, TEAL);
  const int bar = 28;
  struct Ic {
    Icon icon;
    const char *line1, *line2;
  };
  static const Ic ICONS[] = {{COMPUTER, "My Computer", nullptr}, {NETWORK, "Network", "Neighborhood"},
                             {INBOX, "Inbox", nullptr}};
  /* (Recycle Bin, My Briefcase and Letters come next, below 430 px.) */
  for (int i = 0; i < 3; i++) {
    int y = 10 + i * 70;
    if (y + 50 > H - bar)
      break;
    icon(g, ICONS[i].icon, 22, y);
    label(g, ICONS[i].line1, 38, y + 36, WHITE, &TEAL);
    if (ICONS[i].line2)
      label(g, ICONS[i].line2, 38, y + 49, WHITE, &TEAL);
  }

  /* My Computer, behind. */
  int mx = round_half_up(W * 0.46f), my = round_half_up(H * 0.08f);
  int mw = round_half_up(W * 0.48f), mh = round_half_up(H * 0.42f);
  mw = mw < 360 ? mw : 360;
  mh = mh < 230 ? mh : 230;
  if (mw > 160 && mh > 120) {
    window95(g, mx, my, mw, mh, "My Computer", false);
    static const char *const M[] = {"File", "Edit", "View", "Help"};
    menu(g, M, 4, mx + 9, my + 27);
    g.fill_rect(mx + 4, my + 42, mw - 8, mh - 66, WHITE);
    g.fill_rect(mx + 4, my + 42, mw - 8, 1, GREY);
    g.fill_rect(mx + 4, my + 42, 1, mh - 66, GREY);
    struct It {
      Icon icon;
      const char *name;
    };
    static const It ITEMS[] = {{FLOPPY, "3\xc2\xbd Floppy (A:)"}, {DRIVE, "(C:)"},        {DRIVE, "Cd (D:)"},
                               {FOLDER, "Control Panel"},       {PRINTER, "Printers"}, {FOLDER, "Dial-Up"}};
    for (int i = 0; i < 6; i++) {
      int ix = mx + 14 + (i % 4) * 82, iy = my + 50 + (i / 4) * 70;
      if (ix + 70 > mx + mw || iy + 50 > my + mh - 24)
        continue;
      icon(g, ITEMS[i].icon, ix + 20, iy);
      label(g, ITEMS[i].name, ix + 36, iy + 36, BLACK, nullptr);
    }
    bevel(g, mx + 4, my + mh - 22, mw - 8, 18, false);
    draw_text(g, font_6x10, mx + 9, my + mh - 18, "6 object(s)", BLACK);
  }

  /* Notepad, in front. */
  int nx = round_half_up(W * 0.2f), ny = round_half_up(H * 0.3f);
  int nw = round_half_up(W * 0.5f), nh = round_half_up(H * 0.5f);
  nw = nw < 400 ? nw : 400;
  nh = nh < 260 ? nh : 260;
  if (nw > 140 && nh > 100) {
    window95(g, nx, ny, nw, nh, "LETTER.TXT - Notepad", true);
    static const char *const M[] = {"File", "Edit", "Search", "Help"};
    menu(g, M, 4, nx + 9, ny + 27);
    g.fill_rect(nx + 4, ny + 42, nw - 8, nh - 46, WHITE);
    g.fill_rect(nx + 4, ny + 42, nw - 8, 1, GREY);
    g.fill_rect(nx + 4, ny + 42, 1, nh - 46, GREY);
    Clipped page(g, {nx + 6, ny + 44, nw - 12, nh - 50});
    for (int i = 0; i < 10; i++)
      draw_text(page, font_8x13, nx + 8, ny + 47 + i * 15, LETTER[i], BLACK);
  }

  /* The taskbar. */
  int ty = H - bar;
  g.fill_rect(0, ty, W, bar, SILVER);
  g.fill_rect(0, ty + 1, W, 1, WHITE);
  bevel(g, 2, ty + 4, 54, 22, true);
  g.fill_rect(8, ty + 9, 4, 4, hex(0xff0000));
  g.fill_rect(13, ty + 9, 4, 4, hex(0x00ff00));
  g.fill_rect(8, ty + 14, 4, 4, hex(0x0000ff));
  g.fill_rect(13, ty + 14, 4, 4, hex(0xffff00));
  bold(g, font_6x10, 21, ty + 10, "Start", BLACK);
  static const char *const TASKS[] = {"My Computer", "LETTER.TXT - Notepad"};
  for (int i = 0; i < 2; i++) {
    int bx = 62 + i * 150;
    if (bx + 144 > W - 70)
      break;
    bevel(g, bx, ty + 4, 144, 22, i == 0);
    Clipped button(g, {bx + 3, ty + 4, 138, 22});
    if (i == 1)
      bold(button, font_6x10, bx + 8, ty + 10, TASKS[i], BLACK);
    else
      draw_text(button, font_6x10, bx + 8, ty + 10, TASKS[i], BLACK);
  }
  bevel(g, W - 66, ty + 4, 63, 22, false);
  char now[16];
  clock_text(now, sizeof now);
  draw_text(g, font_6x10, W - 56, ty + 10, now, BLACK);
}

/* The same desktop for a screen too small for that layout: a Notepad, an
   icon or two and a thin taskbar, in the 4x6 font. */
void small_desktop(Surface &g) {
  int W = g.width(), H = g.height();
  g.fill_rect(0, 0, W, H, TEAL);
  int bar = 9, ty = H - bar;
  if (W >= 100) {
    /* My Computer and Inbox, at a quarter size. */
    for (int i = 0; i < 2 && 4 + i * 14 + 10 < ty; i++) {
      int x = 3, y = 4 + i * 14;
      if (i == 0) {
        g.fill_rect(x + 1, y, 8, 6, SILVER);
        g.fill_rect(x + 2, y + 1, 6, 4, TEAL);
        g.fill_rect(x, y + 7, 10, 2, SILVER);
      } else {
        g.fill_rect(x + 1, y + 1, 8, 4, hex(0xffff80));
        g.fill_rect(x, y + 5, 10, 4, NAVY);
      }
    }
  }
  int nx = W >= 100 ? round_half_up(W * 0.2f) : round_half_up(W * 0.12f);
  int ny = round_half_up(ty * 0.12f);
  int nw = round_half_up(W * 0.72f), nh = ty - ny - 3;
  if (nw > 24 && nh > 14) {
    bevel(g, nx, ny, nw, nh, true);
    g.fill_rect(nx + 2, ny + 2, nw - 4, 7, NAVY);
    Clipped bar_text(g, {nx + 2, ny + 2, nw - 4, 7});
    draw_text(bar_text, font_4x6, nx + 3, ny + 3, "Notepad", WHITE);
    g.fill_rect(nx + 2, ny + 10, nw - 4, nh - 12, WHITE);
    Clipped page(g, {nx + 3, ny + 11, nw - 6, nh - 14});
    for (int i = 0; i < 10; i++)
      draw_text(page, font_4x6, nx + 4, ny + 11 + i * 6, LETTER[i], BLACK);
  }
  g.fill_rect(0, ty, W, bar, SILVER);
  g.fill_rect(0, ty + 1, W, 1, WHITE);
  bevel(g, 1, ty + 2, 23, 7, true);
  draw_text(g, font_4x6, 3, ty + 2, "Start", BLACK);
  char now[16];
  clock_text(now, sizeof now);
  now[strlen(now) - 3] = 0;  // no AM/PM: no room
  int cw = text_width(font_4x6, now) + 5;
  if (W > 24 + cw + 4) {
    bevel(g, W - cw - 1, ty + 2, cw, 7, false);
    draw_text(g, font_4x6, W - cw + 2, ty + 2, now, BLACK);
  }
}

/* ------------------------------------------------------------ rain */

/* Everything within `r_out` of (cx, cy), measured to pixel centres, with the
   part inside `r_in` black and the rest `c`: one GDI Ellipse, black brush. */
void ring(Surface &s, int cx, int cy, float r_in, float r_out, Rgb c) {
  int top = (int) floorf(cy - r_out), bottom = (int) ceilf(cy + r_out);
  for (int y = top; y <= bottom; y++) {
    float dy = y + 0.5f - cy;
    float o2 = r_out * r_out - dy * dy;
    if (o2 <= 0)
      continue;
    float xo = sqrtf(o2);
    int a = (int) ceilf(cx - xo - 0.5f), b = (int) floorf(cx + xo - 0.5f);
    float i2 = r_in * r_in - dy * dy;
    if (i2 <= 0) {
      s.fill_rect(a, y, b - a + 1, 1, c);
      continue;
    }
    float xi = sqrtf(i2);
    int ia = (int) ceilf(cx - xi - 0.5f), ib = (int) floorf(cx + xi - 0.5f);
    s.fill_rect(a, y, ia - a, 1, c);
    s.fill_rect(ia, y, ib - ia + 1, 1, BLACK);
    s.fill_rect(ib + 1, y, b - ib, 1, c);
  }
}

struct Drop {
  int x, y;
  int n, k;  // n growing rings, then the one that erases; k the next to draw
  Rgb colour;
};

class HardRain : public Saver {
 public:
  int count = COUNT;
  float reach = REACH;
  bool clear_screen = false;
  float scale = 0;  // 0: from the screen

  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    mono_ = s.mono();
    sc_ = scale;
    if (sc_ <= 0) {
      int side = w_ < h_ ? w_ : h_;
      sc_ = side < 240 ? side / 240.0f : 1;
    }
    if (clear_screen)
      s.clear();
    else if (h_ >= 120)
      desktop(s);
    else
      small_desktop(s);
    drops_n_ = 0;
    clock_ = 0;
  }

  void frame(Surface &s, float dt) override {
    clock_ += dt;
    int n = 0;
    while (clock_ >= 1 / STEPS && n < 5) {
      clock_ -= 1 / STEPS;
      round(s);
      n++;
    }
    if (n == 5)
      clock_ = 0;
  }

 private:
  Drop new_drop() {
    int most = (int) floorf((2 * reach - 8) / 6);
    if (most < 2)
      most = 2;
    Drop d;
    d.x = (int) floorf(rng.range(0, w_));
    d.y = (int) floorf(rng.range(0, h_));
    d.n = 2 + (int) floorf(rng.uniform() * (most - 1));
    d.k = 0;
    d.colour = mono_ ? WHITE : COLOURS[rng.below(6)];
    return d;
  }

  /* One round: each drop draws its next ring; finished ones start again. */
  void round(Surface &s) {
    int want = count < MAX_DROPS ? count : MAX_DROPS;
    while (drops_n_ < want)
      drops_[drops_n_++] = new_drop();
    for (int i = 0; i < drops_n_; i++) {
      Drop &d = drops_[i];
      if (d.k < d.n) {
        /* 8 px across and 6 more a step; the first n/2 with a 2 px pen. The
           canvas strokes on the line, so half the pen is either side. */
        float r = (8 + 6 * d.k) * sc_ / 2;
        float pen = d.k < d.n / 2 ? 2 : 1;
        ring(s, d.x, d.y, r - pen / 2, r + pen / 2, d.colour);
      } else {
        /* 2 px wider than the last, black pen and brush. */
        float r = ((8 + 6 * (d.n - 1)) * sc_ + 2) / 2;
        ring(s, d.x, d.y, r + 0.5f, r + 0.5f, BLACK);
      }
      if (++d.k > d.n)
        d = new_drop();
    }
  }

  int w_ = 0, h_ = 0;
  bool mono_ = false;
  float sc_ = 1, clock_ = 0;
  Drop drops_[MAX_DROPS];
  int drops_n_ = 0;
};

/* On a character LCD: three drops, a quarter the size, on a DotMatrix. */
class HardRainText : public TextSaver {
 public:
  void start(TextScreen &t) override {
    dots_.begin(t.cols(), t.rows());
    rain_.count = 3;
    rain_.reach = 30;
    rain_.scale = 0.25f;
    rain_.clear_screen = true;
    rain_.start(dots_);
    dots_.compose(t);
  }
  void frame(TextScreen &t, float dt) override {
    rain_.frame(dots_, dt);
    dots_.compose(t);
  }

 private:
  DotMatrix dots_;
  HardRain rain_;
};

}  // namespace

Saver *make_hard_rain() { return new HardRain(); }
TextSaver *make_hard_rain_text() { return new HardRainText(); }

AD_REGISTER_SAVER("hard_rain", make_hard_rain, make_hard_rain_text)

}  // namespace adcore
#endif
