/*
 * ad_messages.cpp - Messages, a line of text keeping your screen busy. A port
 * of all/modules/messages.js, which was checked against MESSAGE3.AD under
 * Wine with the eight messages it shipped in MESG_AD3.DAT; see that file for
 * what was measured and what was inferred.
 *
 * Defaults are the web port's: the first message ("OUT TO LUNCH", yellow),
 * Floating, Speed Moving (19.4 px/s along each diagonal, bouncing).
 *
 * The Windows faces (System, Script, Tms Rmn ...) all become the fixed fonts
 * here: the size is picked so the capitals stand about as tall as the
 * module's (17 px for a 32 px line), and smaller if it would be wider than
 * 92% of the screen, as the web port shrinks it. Where even the smallest is
 * too wide (a 40-letter message on a 128 px OLED) it is broken at its spaces
 * into more lines rather than cut off. Bold is 8x13 bold where that size is
 * chosen and a one-pixel overstrike otherwise, but not on 4x6 or 5x8 at
 * their own size, which it smudges; italic is a slant, but not on 4x6. The
 * 4 px margin round the message shrinks on small screens. On a 1-bit panel
 * every colour is lit (blue would dither away to nothing).
 *
 * On a character LCD (MessagesText) the message moves in whole cells, at the
 * same speed counting a dot of the panel as a pixel. A message that does not
 * fit the panel is run together into one line and slides across it instead,
 * at a new row each time. Spaces at the ends of its lines are dropped there.
 */
#if defined(AD_SAVER_MESSAGES) || defined(AD_ALL_SAVERS)
#include "ad_core.h"
#include "ad_text.h"
#include "ad_draw.h"
#include "ad_font.h"
#include "ad_font_4x6.h"
#include "ad_font_5x8.h"
#include "ad_font_6x10.h"
#include "ad_font_8x13.h"
#include "ad_font_8x13b.h"
#include "ad_font_10x20.h"

#include <cstring>
#include <vector>

namespace adcore {

namespace {

/* Pixels a second along each axis for floating and sliding, and seconds a
   pop for popping, for Sluggish .. Zoom!. */
const float PACE[] = {3, 8, 13, 19.4f, 24, 29, 33};
const float POP[] = {8, 6, 4, 3, 2, 1.2f, 0.6f};
const Rgb COLOURS[] = {{255, 255, 255}, {255, 0, 0},   {0, 255, 0},  {0, 0, 255},
                       {0, 255, 255},   {255, 0, 255}, {255, 255, 0}};

/* MESG_AD3.DAT, record by record: the text, its size (a line's height in
   pixels), colour, and whether bold, italic, underlined, centred. The face is
   left out; "System" was always bold, so those are marked bold. */
struct Message {
  const char *text;
  uint8_t pt, colour;
  bool bold, italic, underline, center;
};
const Message MESSAGES[] = {
    {"OUT TO LUNCH", 36, 6, true, false, false, false},
    {"Coffee Break", 90, 4, true, false, false, false},
    {"I Quit!", 37, 2, false, false, false, false},
    {"Why are you staring\nat my computer?", 24, 3, true, false, false, false},
    {"Gone for the day", 16, 0, true, false, false, false},
    {" After Dark - The Ultimate \n Screen Saver Collection ", 32, 1, true, true, false, true},
    {"Temporarily \nComatose ", 24, 5, true, true, true, false},
    {"Equal rights for silicon intelligences! ", 32, 2, true, true, false, false},
};
const int MESSAGE_COUNT = sizeof(MESSAGES) / sizeof(MESSAGES[0]);

enum Move { POPPING, FLOATING, SLIDING };

/* Lines of a message: starts and lengths, up to MAX_LINES. */
const int MAX_LINES = 8;
int split(const char *text, int *starts, int *lens) {
  int n = 0, s = 0, i = 0;
  for (;; i++) {
    if (text[i] == '\n' || text[i] == 0) {
      if (n < MAX_LINES) {
        starts[n] = s;
        lens[n] = i - s;
        n++;
      }
      if (text[i] == 0)
        break;
      s = i + 1;
    }
  }
  return n;
}

/* How tall capitals stand in each font, in its own pixels. */
struct Face {
  const Font *f;
  int caps, ascent;
};
const Face FACES[] = {{&font_4x6, 5, 5}, {&font_5x8, 6, 7}, {&font_6x10, 7, 8}, {&font_8x13, 9, 11}, {&font_10x20, 13, 16}};

class Messages : public Saver {
 public:
  int message = 0;
  int move = FLOATING;
  int speed = 3;  // Moving

  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    m_ = &MESSAGES[message >= 0 && message < MESSAGE_COUNT ? message : 0];
    pace_ = PACE[speed];
    pop_ = POP[speed];
    wrap_chars_ = 0;
    render(s.mono());
    place();
    vx_ = (rng.uniform() < 0.5f ? -1 : 1) * pace_;
    vy_ = (rng.uniform() < 0.5f ? -1 : 1) * pace_;
    if (move == SLIDING)
      x_ = w_;
    timer_ = pop_;
    drawn_ = false;
    s.clear();
    draw(s);
  }

  void frame(Surface &s, float dt) override {
    if (move == POPPING) {
      /* Up somewhere, then gone and up somewhere else. */
      timer_ -= dt;
      if (timer_ <= 0) {
        place();
        timer_ = pop_;
      }
    } else if (move == FLOATING) {
      x_ += vx_ * dt;
      y_ += vy_ * dt;
      if (x_ < 0) {
        x_ = 0;
        vx_ = fabsf(vx_);
      }
      if (y_ < 0) {
        y_ = 0;
        vy_ = fabsf(vy_);
      }
      if (x_ + sw_ > w_) {
        x_ = sw_ < w_ ? w_ - sw_ : 0;
        vx_ = -fabsf(vx_);
      }
      if (y_ + sh_ > h_) {
        y_ = sh_ < h_ ? h_ - sh_ : 0;
        vy_ = -fabsf(vy_);
      }
    } else {
      /* Sliding: in from the right, out at the left, at a new height. */
      x_ -= pace_ * dt;
      if (x_ + sw_ < 0) {
        x_ = w_;
        y_ = rng.uniform() * (h_ - sh_ > 0 ? h_ - sh_ : 0);
      }
    }
    draw(s);
  }

 private:
  /* The message drawn once, tight, into a bitmap, so moving it is a blit. */
  void render(bool mono) {
    int starts[MAX_LINES], lens[MAX_LINES];
    int n = split(m_->text, starts, lens);
    /* The module's capitals are 17 px in a 32 px line. */
    float want = m_->pt * 17.0f / 32;
    int room = (int) (w_ * 0.92f);
    const Face *best = nullptr;
    int best_scale = 1;
    float best_err = 1e9f;
    /* As it is if any size fits; failing that, broken at its spaces. */
    for (int pass = 0; pass < 2 && !best; pass++)
      for (const Face &fc : FACES)
        for (int scale = 1; scale <= 4; scale++) {
          int fh = fc.f->h * scale, cw = fc.f->w * scale;
          int extra = (m_->italic ? (fh + 4) / 5 : 0) + (m_->bold ? 1 : 0);
          int ls[MAX_LINES], ll[MAX_LINES];
          int k = n;
          if (pass == 0) {
            memcpy(ls, starts, sizeof ls);
            memcpy(ll, lens, sizeof ll);
          } else {
            k = rewrap(m_->text, (room - extra) / cw, ls, ll);
          }
          int widest = 0;
          for (int i = 0; i < k; i++)
            if (ll[i] > widest)
              widest = ll[i];
          if (k == 0 || widest * cw + extra > room || fh * k > h_)
            continue;
          float err = fabsf(fc.caps * scale - want);
          if (err < best_err) {
            best_err = err;
            best = &fc;
            best_scale = scale;
            if (pass == 1)
              wrap_chars_ = (room - extra) / cw;
          }
        }
    if (!best) {
      best = &FACES[0];
      best_scale = 1;
    }
    if (wrap_chars_)
      n = rewrap(m_->text, wrap_chars_, starts, lens);
    int widest = 0;
    for (int i = 0; i < n; i++)
      if (lens[i] > widest)
        widest = lens[i];
    const Font *f = best->f;
    bool real_bold = m_->bold && f == &font_8x13;
    if (real_bold)
      f = &font_8x13b;
    int scale = best_scale;
    int fh = f->h * scale, cw = f->w * scale;
    /* Nor does a slant help the very smallest. */
    int slant = m_->italic && (scale > 1 || f->w >= 5) ? (fh + 4) / 5 : 0;
    /* An overstrike only smudges the smallest fonts. */
    int bold = m_->bold && !real_bold && (scale > 1 || f->w >= 6) ? 1 : 0;
    int pad = w_ >= 240 ? 4 : w_ >= 100 ? 2 : 1;
    int text_w = widest * cw + slant + bold;
    sw_ = text_w + pad * 2;
    sh_ = fh * n + pad * 2;
    stride_ = (sw_ + 7) / 8;
    bits_.assign(stride_ * sh_, 0);
    for (int i = 0; i < n; i++) {
      int lx = pad + (m_->center ? (widest - lens[i]) * cw / 2 : 0);
      int ly = pad + i * fh;
      for (int k = 0; k < lens[i]; k++) {
        uint8_t code = (uint8_t) m_->text[starts[i] + k];
        int gx = lx + k * cw;
        for (int r = 0; r < f->h; r++) {
          uint32_t row = glyph_row(*f, code, r);
          for (int dy = 0; dy < scale; dy++) {
            int y = ly + r * scale + dy;
            int shift = slant ? (fh - 1 - (r * scale + dy)) / 5 : 0;
            for (int c = 0; c < f->w; c++) {
              if (!(row & (0x80000000u >> c)))
                continue;
              for (int dx = 0; dx < scale + bold; dx++)
                set(gx + c * scale + dx + shift, y);
            }
          }
        }
      }
      if (m_->underline) {
        int uy = ly + (best->ascent + 1) * scale;
        for (int t = 0; t < scale; t++)
          for (int x = 0; x < lens[i] * cw; x++)
            set(lx + x, uy + t);
      }
    }
    ink_ = mono ? Rgb{255, 255, 255} : COLOURS[m_->colour];
  }

  void set(int x, int y) {
    if (x >= 0 && y >= 0 && x < sw_ && y < sh_)
      bits_[y * stride_ + x / 8] |= 0x80 >> (x & 7);
  }

  void place() {
    x_ = rng.uniform() * (w_ - sw_ > 0 ? w_ - sw_ : 0);
    y_ = rng.uniform() * (h_ - sh_ > 0 ? h_ - sh_ : 0);
  }

  /* Rub out what the new place leaves of the old, then blit. */
  void draw(Surface &s) {
    int x = round_half_up(x_), y = round_half_up(y_);
    if (drawn_ && x == px_ && y == py_)
      return;
    if (drawn_) {
      Rect o = {px_, py_, sw_, sh_};
      int nx1 = x + sw_, ny1 = y + sh_, ox1 = o.x + sw_, oy1 = o.y + sh_;
      bool overlap = x < ox1 && nx1 > o.x && y < oy1 && ny1 > o.y;
      if (!overlap) {
        s.fill(o, BLACK);
      } else {
        if (o.y < y)
          s.fill_rect(o.x, o.y, sw_, y - o.y, BLACK);
        if (oy1 > ny1)
          s.fill_rect(o.x, ny1, sw_, oy1 - ny1, BLACK);
        int top = o.y > y ? o.y : y, bot = oy1 < ny1 ? oy1 : ny1;
        if (o.x < x)
          s.fill_rect(o.x, top, x - o.x, bot - top, BLACK);
        if (ox1 > nx1)
          s.fill_rect(nx1, top, ox1 - nx1, bot - top, BLACK);
      }
    }
    for (int j = 0; j < sh_; j++) {
      int sy = y + j;
      if (sy < 0 || sy >= h_)
        continue;
      const uint8_t *row = &bits_[j * stride_];
      for (int i = 0; i < sw_; i++) {
        int sx = x + i;
        if (sx < 0 || sx >= w_)
          continue;
        s.pixel(sx, sy, (row[i >> 3] & (0x80 >> (i & 7))) ? ink_ : BLACK);
      }
    }
    px_ = x;
    py_ = y;
    drawn_ = true;
  }

  /* Lines of at most `chars`, broken at spaces (and the message's own
     breaks); 0 if a word is longer than that. */
  static int rewrap(const char *text, int chars, int *starts, int *lens) {
    if (chars < 1)
      return 0;
    int n = 0, i = 0;
    while (text[i]) {
      while (text[i] == ' ')
        i++;
      if (!text[i])
        break;
      if (text[i] == '\n') {
        i++;
        continue;
      }
      int s = i, end = i;
      for (;;) {
        int we = i;
        while (text[we] && text[we] != ' ' && text[we] != '\n')
          we++;
        if (we - s > chars) {
          if (end == s)
            return 0;
          break;
        }
        end = we;
        i = we;
        if (text[i] != ' ')
          break;
        while (text[i] == ' ')
          i++;
        if (!text[i] || text[i] == '\n')
          break;
      }
      if (n == MAX_LINES)
        return 0;
      starts[n] = s;
      lens[n] = end - s;
      n++;
      i = end;
    }
    return n;
  }

  int wrap_chars_ = 0;
  const Message *m_ = &MESSAGES[0];
  int w_ = 0, h_ = 0;
  float pace_ = 19.4f, pop_ = 3;
  float x_ = 0, y_ = 0, vx_ = 0, vy_ = 0, timer_ = 0;
  int sw_ = 0, sh_ = 0, stride_ = 0;
  std::vector<uint8_t> bits_;
  Rgb ink_ = {255, 255, 255};
  int px_ = 0, py_ = 0;
  bool drawn_ = false;
};

/* On a character LCD: the message in whole cells, or sliding across a row if
   it does not fit. A dot of the panel counts as a pixel: 6 to a cell across,
   9 down. */
class MessagesText : public TextSaver {
 public:
  int message = 0;
  int move = FLOATING;
  int speed = 3;

  void start(TextScreen &t) override {
    cols_ = t.cols();
    rows_ = t.rows();
    const Message &m = MESSAGES[message >= 0 && message < MESSAGE_COUNT ? message : 0];
    pace_ = PACE[speed];
    pop_ = POP[speed];
    /* Its lines without the spaces at their ends. */
    int starts[MAX_LINES], lens[MAX_LINES];
    int n = split(m.text, starts, lens);
    n_ = 0;
    width_ = 0;
    int used = 0;
    for (int i = 0; i < n; i++) {
      int s = starts[i], e = starts[i] + lens[i];
      while (s < e && m.text[s] == ' ')
        s++;
      while (e > s && m.text[e - 1] == ' ')
        e--;
      starts_[n_] = used;
      lens_[n_] = e - s;
      memcpy(text_ + used, m.text + s, e - s);
      used += e - s;
      if (lens_[n_] > width_)
        width_ = lens_[n_];
      n_++;
    }
    center_ = m.center;
    mode_ = move;
    if (width_ > cols_ || n_ > rows_) {
      /* Too big: one line, sliding. */
      int len = 0;
      for (int i = 0; i < n_; i++) {
        if (i)
          one_[len++] = ' ';
        memcpy(one_ + len, text_ + starts_[i], lens_[i]);
        len += lens_[i];
      }
      memcpy(text_, one_, len);
      n_ = 1;
      starts_[0] = 0;
      lens_[0] = width_ = len;
      mode_ = SLIDING;
    }
    place();
    vx_ = (rng.uniform() < 0.5f ? -1 : 1) * pace_ / 6;
    vy_ = (rng.uniform() < 0.5f ? -1 : 1) * pace_ / 9;
    if (mode_ == SLIDING)
      x_ = cols_;
    timer_ = pop_;
    draw(t);
  }

  void frame(TextScreen &t, float dt) override {
    int room_x = cols_ - width_, room_y = rows_ - n_;
    if (mode_ == POPPING) {
      timer_ -= dt;
      if (timer_ <= 0) {
        place();
        timer_ = pop_;
      }
    } else if (mode_ == FLOATING) {
      x_ += vx_ * dt;
      y_ += vy_ * dt;
      /* A cell's width either side of the ends, so it rests a step there. */
      if (x_ < -0.5f) {
        x_ = -0.5f;
        vx_ = fabsf(vx_);
      }
      if (y_ < -0.5f) {
        y_ = -0.5f;
        vy_ = fabsf(vy_);
      }
      if (x_ > room_x + 0.49f) {
        x_ = room_x + 0.49f;
        vx_ = -fabsf(vx_);
      }
      if (y_ > room_y + 0.49f) {
        y_ = room_y + 0.49f;
        vy_ = -fabsf(vy_);
      }
    } else {
      x_ -= pace_ / 6 * dt;
      if (x_ + width_ < 0) {
        x_ = cols_;
        y_ = rng.below(room_y + 1);
      }
    }
    draw(t);
  }

 private:
  void place() {
    x_ = rng.below(cols_ - width_ + 1 > 0 ? cols_ - width_ + 1 : 1);
    y_ = rng.below(rows_ - n_ + 1 > 0 ? rows_ - n_ + 1 : 1);
  }

  void draw(TextScreen &t) {
    t.clear();
    int x = round_half_up(x_), y = round_half_up(y_);
    if (mode_ == FLOATING) {
      if (x < 0)
        x = 0;
      if (y < 0)
        y = 0;
    }
    for (int i = 0; i < n_; i++) {
      int lx = x + (center_ ? (width_ - lens_[i]) / 2 : 0);
      for (int k = 0; k < lens_[i]; k++)
        t.put(lx + k, y + i, (uint8_t) text_[starts_[i] + k]);
    }
  }

  int cols_ = 16, rows_ = 2;
  float pace_ = 19.4f, pop_ = 3;
  float x_ = 0, y_ = 0, vx_ = 0, vy_ = 0, timer_ = 0;
  int mode_ = FLOATING;
  bool center_ = false;
  int n_ = 0, width_ = 0;
  int starts_[MAX_LINES], lens_[MAX_LINES];
  char text_[128];
  char one_[128];
};

}  // namespace

Saver *make_messages() { return new Messages(); }
TextSaver *make_messages_text() { return new MessagesText(); }

AD_REGISTER_SAVER("messages", make_messages, make_messages_text)

}  // namespace adcore
#endif
