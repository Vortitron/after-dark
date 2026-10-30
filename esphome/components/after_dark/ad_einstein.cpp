/*
 * ad_einstein.cpp - Einstein, somebody kept in after class at the
 * blackboard. A port of all/modules/einstein.js, which was checked against
 * EINSTEIN.AD under Wine; see that file for what was measured (black board,
 * one-pixel chalk, equations along the top row from x 9, the wipe) and what
 * comes only from the module's data (the written-out lines, the mistakes,
 * the wobble).
 *
 * The chalk is the module's own stroke font, drawn a step at a time along
 * its own pen paths; ad_art_einstein.h is made from all/art/einstein by
 * einstein2c.py. Defaults are the panel's: Errors Seldom, Neatness Pretty
 * Bad, # of Lines Fill Screen.
 *
 * Small screens (adapted): the font stays at its own size, as on the web, so
 * a 128x64 board holds an equation or two (those that fit, as the web
 * filters them) and three rows of lines. Below 200 px high the first
 * baseline moves up from 46, to 32 for equations (their tallest pieces
 * reach 31 px above it) and 12 for lines, or a board of lines would have no
 * room for a second row. A line that wraps to more rows than fit is written
 * once and cut off, where the web would write it no times at all.
 *
 * Character LCD (EinsteinText): the lines only, written a letter at a time
 * at the chalk's pace (each letter takes as long as its pen path would),
 * with the same mistakes rubbed out and the same wipe. The equations are
 * pieces of physics in their own glyphs and have no LCD form, so they are
 * left out there, and only lines that fit the panel are chosen.
 */
#if defined(AD_SAVER_EINSTEIN) || defined(AD_ALL_SAVERS)
#include "ad_core.h"
#include "ad_draw.h"
#include "ad_text.h"
#include "ad_art_einstein.h"

#include <cstdlib>
#include <cstring>
#include <vector>

namespace adcore {

namespace {

using art_einstein::Glyph;

/* Errors and Neatness at the panel's defaults (Seldom, Pretty Bad). */
const float MISTAKE = 0.01f;
const float WOBBLE = 0.9f;
/* # of Lines: 0 for Fill Screen, else 1, 5, 10 or 20. */
const int LINES_DEFAULT = 0;
/* Chalk steps a second: a row of equations ~950 px across took 13-15 s. */
const float PACE = 240;
const int LEFT = 9, BASE = 46, ROW = 80, LINE_GAP = 22;
/* Below this height the baselines move up (see the top). */
const int SMALL = 200, SMALL_BASE_EQ = 32, SMALL_BASE_LINES = 12;
const char *const GAP = "   ";
/* How often a board is lines rather than equations; see einstein.js. */
const float LINES_CHANCE = 0.2f;
const int MAX_ROWS = 40, MAX_TEXT = 160;
const Rgb CHALK = {255, 255, 255};

const Glyph *find_glyph(uint8_t code) {
  int lo = 0, hi = art_einstein::GLYPH_COUNT - 1;
  while (lo <= hi) {
    int mid = (lo + hi) / 2;
    uint8_t c = art_einstein::GLYPHS[mid].code;
    if (c == code)
      return &art_einstein::GLYPHS[mid];
    if (c < code)
      lo = mid + 1;
    else
      hi = mid - 1;
  }
  return nullptr;
}

/* The glyph for a code; '$' is not in the font, so it is an S with a bar
   (see dollar_bar), and anything else missing is a space. */
const Glyph *glyph(uint8_t code) {
  const Glyph *g = find_glyph(code == '$' ? 'S' : code);
  return g ? g : find_glyph(' ');
}

/* How many pen points the bar of a '$' adds. */
int dollar_bar(const Glyph *s) { return 1 + (2 - (s->top - 2)); }

/* A glyph's pen points, including a '$' bar. */
int points(uint8_t code) {
  const Glyph *g = glyph(code);
  return g->count + (code == '$' && g->code == 'S' ? dollar_bar(g) : 0);
}

int advance(uint8_t code) { return glyph(code)->advance; }

int width(const char *text, int n = -1) {
  int w = 0;
  for (int i = 0; text[i] && (n < 0 || i < n); i++)
    w += advance((uint8_t) text[i]);
  return w;
}

/* Break `text` into rows no wider than `room` (by `measure`), at spaces, as
   einstein.js's wrap(). Each row is (start, length) into text. */
template<typename Measure>
int wrap(const char *text, float room, Measure measure, int *starts, int *lengths, int max) {
  int n = 0, line_start = -1, line_end = 0;
  int i = 0;
  while (text[i]) {
    int ws = i;
    while (text[i] && text[i] != ' ')
      i++;
    int we = i;
    if (line_start < 0) {
      line_start = ws;
      line_end = we;
    } else if (measure(text + line_start, we - line_start) > room) {
      if (n < max) {
        starts[n] = line_start;
        lengths[n++] = line_end - line_start;
      }
      line_start = ws;
      line_end = we;
    } else {
      line_end = we;
    }
    if (text[i] == ' ')
      i++;
  }
  if (line_start >= 0 && n < max) {
    starts[n] = line_start;
    lengths[n++] = line_end - line_start;
  }
  return n;
}

class Einstein : public Saver {
 public:
  float mistake = MISTAKE, wobble = WOBBLE;
  int lines = LINES_DEFAULT;

  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    s_ = 1;  // the font's own pixels, on any screen
    small_ = h_ < SMALL;
    /* As many rows of lines as the board can hold. */
    max_rows_ = h_ / LINE_GAP + 2;
    if (max_rows_ > MAX_ROWS)
      max_rows_ = MAX_ROWS;
    text_.assign(max_rows_ * (MAX_TEXT + 1), 0);
    rows_.assign(max_rows_, Row{});
    row_count_ = 0;
    state_ = WAIT;
    timer_ = 0.6f;
    have_char_ = false;
    s.clear();
  }

  void frame(Surface &s, float dt) override {
    switch (state_) {
      case WAIT:
        timer_ -= dt;
        if (timer_ <= 0) {
          plan();
          state_ = WRITE;
          budget_ = 0;
        }
        break;
      case WRITE:
        budget_ += PACE * dt;
        while (budget_ >= 1 && state_ == WRITE) {
          if (!have_char_) {
            if (!next_char()) {
              /* A full board is wiped almost at once. */
              state_ = ADMIRE;
              timer_ = 0.3f;
              break;
            }
            have_char_ = true;
          }
          Char &c = cur_;
          if (c.at >= c.count) {
            if (c.wrong) {
              /* Rub it out and try again. */
              state_ = OOPS;
              timer_ = 0.5f;
              oops_ = c;
            }
            have_char_ = false;
            continue;
          }
          float px, py;
          bool lift = point(c, px, py);
          if (!lift && c.at > 0)
            line(s, (int) floorf(c.lx), (int) floorf(c.ly), (int) floorf(px), (int) floorf(py), CHALK);
          c.lx = px;
          c.ly = py;
          c.at++;
          budget_ -= 1;
        }
        break;
      case OOPS:
        timer_ -= dt;
        if (timer_ <= 0) {
          const Char &o = oops_;
          rub(s, o.x + s_, o.y - 16 * s_, fmaxf(s_, o.advance - s_), 20 * s_);
          state_ = WRITE;
        }
        break;
      case ADMIRE:
        timer_ -= dt;
        if (timer_ <= 0) {
          state_ = ERASE;
          sweep_ = 0;
        }
        break;
      case ERASE: {
        /* The wipe runs left to right across the board in a few tenths of a second. */
        float from = sweep_ * w_;
        sweep_ = fminf(1, sweep_ + dt / 0.3f);
        s.fill_rect((int) floorf(from), 0, (int) ceilf(sweep_ * w_ - from) + 1, h_, BLACK);
        if (sweep_ >= 1) {
          state_ = WAIT;
          timer_ = 0.2f;
        }
        break;
      }
    }
  }

 private:
  enum State { WAIT, WRITE, OOPS, ADMIRE, ERASE };

  struct Row {
    float x, y, slope;
    int len;
  };

  /* A character being chalked: the glyph's steps placed on the board, walked
     as the pen goes rather than laid out in advance. */
  struct Char {
    const Glyph *g;
    bool dollar, wrong;
    int at, count;
    int px, py;  // the pen, in glyph pixels
    float s, jx, jy, x, y, advance;
    float lx, ly;  // the last point
  };

  char *row_text(int r) { return &text_[r * (MAX_TEXT + 1)]; }

  void set_row(int r, const char *src, int n) {
    if (n > MAX_TEXT)
      n = MAX_TEXT;
    memcpy(row_text(r), src, n);
    row_text(r)[n] = 0;
    rows_[r].len = n;
  }

  static void rub(Surface &s, float x, float y, float w, float h) {
    s.fill_rect((int) floorf(x), (int) floorf(y), (int) ceilf(w), (int) ceilf(h), BLACK);
  }

  /*
   * What goes on the next board. Usually physics: equations one after
   * another along the top, three spaces apart, until the next will not fit.
   * Now and then a line to be written out the chosen number of times.
   */
  void plan() {
    float room = (w_ - LEFT * 2) / s_;
    int fit[art_einstein::EQUATION_COUNT], nfit = 0;
    for (int i = 0; i < art_einstein::EQUATION_COUNT; i++)
      if (width(art_einstein::EQUATIONS[i]) <= room)
        fit[nfit++] = i;
    int gap = LINE_GAP, base = small_ ? SMALL_BASE_LINES : BASE;
    row_count_ = 0;
    if (rng.uniform() >= LINES_CHANCE && nfit) {
      char row[MAX_TEXT + 1] = {0};
      int len = 0;
      for (int tries = 0; tries < 40; tries++) {
        const char *e = art_einstein::EQUATIONS[fit[rng.below(nfit)]];
        char next[MAX_TEXT + 1];
        int n = 0;
        if (len) {
          memcpy(next, row, len);
          n = len;
          for (const char *g = GAP; *g && n < MAX_TEXT; g++)
            next[n++] = *g;
        }
        for (const char *p = e; *p && n < MAX_TEXT; p++)
          next[n++] = *p;
        next[n] = 0;
        if (width(next) > room || n >= MAX_TEXT)
          break;
        memcpy(row, next, n + 1);
        len = n;
      }
      set_row(0, row, len);
      row_count_ = 1;
      gap = ROW;
      base = small_ ? SMALL_BASE_EQ : BASE;
    } else {
      int rows = (int) floorf((h_ / s_ - base) / gap) + 1;
      if (rows < 1)
        rows = 1;
      if (rows > max_rows_)
        rows = max_rows_;
      const char *line = art_einstein::LINES[rng.below(art_einstein::LINE_COUNT)];
      int starts[MAX_ROWS], lengths[MAX_ROWS];
      int n = wrap(line, room, [](const char *t, int k) { return (float) width(t, k); }, starts, lengths, MAX_ROWS);
      int times = lines == 0 ? rows / n : lines;
      if (times < 1)
        times = 1;  // the web writes none here; see the top
      for (int k = 0; k < times && row_count_ < rows; k++)
        for (int i = 0; i < n && row_count_ < rows; i++)
          set_row(row_count_++, line + starts[i], lengths[i]);
    }
    for (int r = 0; r < row_count_; r++) {
      rows_[r].x = LEFT;
      rows_[r].y = (base + r * gap) * s_;
      rows_[r].slope = rng.range(-1, 1) * wobble * 0.006f;
    }
    row_ = 0;
    col_ = 0;
    pen_set_ = false;
  }

  /* Chalk for one character at (x, y). */
  Char chalk(uint8_t code, float x, float y) {
    Char c;
    c.g = glyph(code);
    c.dollar = code == '$' && c.g->code == 'S';
    c.count = points(code);
    c.wrong = false;
    c.at = 0;
    c.px = c.py = 0;
    c.s = s_ * rng.range(1 - wobble * 0.02f, 1 + wobble * 0.02f);
    c.jx = rng.range(-1, 1) * wobble * 0.4f * s_;
    c.jy = rng.range(-1, 1) * wobble * 0.5f * s_;
    c.x = x;
    c.y = y;
    c.advance = c.g->advance * s_;
    c.lx = c.ly = 0;
    return c;
  }

  /* Step the pen to point `c.at`; true where the pen lifts to get there. */
  bool point(Char &c, float &x, float &y) {
    int dx, dy;
    if (c.at < c.g->count) {
      dx = art_einstein::STEPS[2 * (c.g->first + c.at)];
      dy = art_einstein::STEPS[2 * (c.g->first + c.at) + 1];
    } else if (c.at == c.g->count) {
      /* The bar of a '$', from above the S down through it. */
      dx = round_half_up(c.g->advance / 2.0f) - c.px;
      dy = c.g->top - 2 - c.py;
    } else {
      dx = 0;
      dy = 1;
    }
    bool lift = c.at == 0 || abs(dx) > 1 || abs(dy) > 1;
    c.px += dx;
    c.py += dy;
    x = c.x + c.jx + c.px * c.s;
    y = c.y + c.jy + c.py * c.s;
    return lift;
  }

  bool next_char() {
    while (row_ < row_count_) {
      const Row &r = rows_[row_];
      const char *text = row_text(row_);
      if (col_ < r.len) {
        float x = pen_set_ ? pen_ : r.x;
        float y = r.y + (x - r.x) * r.slope;
        uint8_t code = (uint8_t) text[col_];
        /* Now and then the wrong letter, noticed straight away. */
        if (code > 64 && code < 123 && rng.uniform() < mistake) {
          uint8_t bad = (uint8_t) (97 + rng.below(26));
          cur_ = chalk(bad, x, y);
          cur_.wrong = true;
          return true;
        }
        col_++;
        cur_ = chalk(code, x, y);
        pen_ = x + cur_.advance;
        pen_set_ = true;
        return true;
      }
      row_++;
      col_ = 0;
      pen_set_ = false;
    }
    return false;
  }

  int w_ = 0, h_ = 0;
  float s_ = 1;
  bool small_ = false;
  std::vector<char> text_;
  std::vector<Row> rows_;
  int max_rows_ = 1, row_count_ = 0, row_ = 0, col_ = 0;
  float pen_ = 0;
  bool pen_set_ = false;
  State state_ = WAIT;
  float timer_ = 0, budget_ = 0, sweep_ = 0;
  bool have_char_ = false;
  Char cur_{}, oops_{};
};

/* ------------------------------------------------------------ text */

class EinsteinText : public TextSaver {
 public:
  float mistake = MISTAKE;
  int lines = LINES_DEFAULT;

  void start(TextScreen &t) override {
    cols_ = t.cols();
    rows_ = t.rows();
    /* The lines that fit the panel once wrapped. */
    nfit_ = 0;
    for (int i = 0; i < art_einstein::LINE_COUNT && nfit_ < MAX_FIT; i++) {
      int st[TextScreen::MAX_ROWS + 1], ln[TextScreen::MAX_ROWS + 1];
      int n = wrap(art_einstein::LINES[i], cols_, [](const char *, int k) { return (float) k; }, st, ln,
                   TextScreen::MAX_ROWS + 1);
      bool ok = n <= rows_;
      for (int r = 0; r < n; r++)
        ok = ok && ln[r] <= cols_;
      if (ok)
        fit_[nfit_++] = i;
    }
    state_ = WAIT;
    timer_ = 0.6f;
    t.clear();
  }

  void frame(TextScreen &t, float dt) override {
    switch (state_) {
      case WAIT:
        timer_ -= dt;
        if (timer_ <= 0) {
          plan();
          state_ = WRITE;
          budget_ = 0;
        }
        break;
      case WRITE:
        budget_ += PACE * dt;
        while (state_ == WRITE) {
          if (!have_char_) {
            if (!next_char()) {
              state_ = ADMIRE;
              timer_ = 0.3f;
              break;
            }
            have_char_ = true;
          }
          /* A letter shows once its strokes are done. */
          if (budget_ < cost_)
            break;
          budget_ -= cost_;
          have_char_ = false;
          t.put(cur_col_, cur_row_, code_);
          if (wrong_) {
            state_ = OOPS;
            timer_ = 0.5f;
          }
        }
        break;
      case OOPS:
        timer_ -= dt;
        if (timer_ <= 0) {
          t.put(cur_col_, cur_row_, ' ');
          state_ = WRITE;
        }
        break;
      case ADMIRE:
        timer_ -= dt;
        if (timer_ <= 0) {
          state_ = ERASE;
          sweep_ = 0;
        }
        break;
      case ERASE: {
        float from = sweep_ * cols_;
        sweep_ = fminf(1, sweep_ + dt / 0.3f);
        for (int c = (int) floorf(from); c < (int) ceilf(sweep_ * cols_) && c < cols_; c++)
          for (int r = 0; r < rows_; r++)
            t.put(c, r, ' ');
        if (sweep_ >= 1) {
          state_ = WAIT;
          timer_ = 0.2f;
        }
        break;
      }
    }
  }

 private:
  enum State { WAIT, WRITE, OOPS, ADMIRE, ERASE };
  static const int MAX_FIT = 64;

  void plan() {
    nrows_ = 0;
    if (nfit_ == 0)
      return;
    const char *line = art_einstein::LINES[fit_[rng.below(nfit_)]];
    int st[TextScreen::MAX_ROWS], ln[TextScreen::MAX_ROWS];
    int n = wrap(line, cols_, [](const char *, int k) { return (float) k; }, st, ln, TextScreen::MAX_ROWS);
    int times = lines == 0 ? rows_ / n : lines;
    if (times < 1)
      times = 1;
    for (int k = 0; k < times && nrows_ < rows_; k++)
      for (int i = 0; i < n && nrows_ < rows_; i++) {
        text_[nrows_] = line + st[i];
        len_[nrows_++] = ln[i];
      }
    row_ = col_ = 0;
    have_char_ = false;
  }

  bool next_char() {
    while (row_ < nrows_) {
      if (col_ < len_[row_]) {
        uint8_t code = (uint8_t) text_[row_][col_];
        cur_col_ = col_;
        cur_row_ = row_;
        wrong_ = code > 64 && code < 123 && rng.uniform() < mistake;
        code_ = wrong_ ? (uint8_t) (97 + rng.below(26)) : code;
        if (!wrong_)
          col_++;
        cost_ = (float) points(code_);
        return true;
      }
      row_++;
      col_ = 0;
    }
    return false;
  }

  int cols_ = 16, rows_ = 2;
  int fit_[MAX_FIT], nfit_ = 0;
  const char *text_[TextScreen::MAX_ROWS];
  int len_[TextScreen::MAX_ROWS], nrows_ = 0, row_ = 0, col_ = 0;
  int cur_col_ = 0, cur_row_ = 0;
  uint8_t code_ = ' ';
  bool wrong_ = false, have_char_ = false;
  float cost_ = 0;
  State state_ = WAIT;
  float timer_ = 0, budget_ = 0, sweep_ = 0;
};

}  // namespace

/* Outside the anonymous namespace, so a text-only build that leaves the
   pixel saver unreferenced does not warn. */
Saver *make_einstein() { return new Einstein(); }
TextSaver *make_einstein_text() { return new EinsteinText(); }

AD_REGISTER_SAVER("einstein", make_einstein, make_einstein_text)

}  // namespace adcore
#endif
