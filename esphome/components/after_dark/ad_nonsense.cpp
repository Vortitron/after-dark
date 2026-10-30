/*
 * ad_nonsense.cpp - Nonsense, grammatical and meaningless. A port of
 * all/modules/nonsense.js, which strings together the words and grammar codes
 * in NONSENSE.AD's own string table (and NONSENSE.TXT's names); see that file
 * for what was measured under Wine and what was inferred.
 *
 * Defaults are the module's: Laconic (one sentence at a time), Short delay
 * (a new one every 1.2 s), no coloured background.
 *
 * The words are ad_art_nonsense.h, packed from all/art/nonsense/index.json:
 * one blob of NUL-terminated fields and an offset table, about 8.5 KB.
 *
 * Small screens: the module's 24 px sans serif in 30 px lines in a 300 px
 * column becomes a fixed font picked by the screen width (10x20 in 25 px
 * lines at 320 wide, 5x8 in 10 px lines at 128, 4x6 at 72), the column no
 * wider than the screen. Where a sentence would run off the bottom of the
 * screen even in the smallest font, it makes up to three more and keeps the
 * shortest. On a 1-bit panel the text is always lit (the random inks would
 * dither to nothing), and with a coloured background the paper is lit and the
 * text black. The erase box keeps the original's quirk of sometimes leaving the
 * last line behind, but only 240 px wide and up: on a small screen every
 * sentence lands on top of the leftovers and neither can be read.
 *
 * On a character LCD (NonsenseText) each sentence is wrapped to the panel's
 * width and centred line by line; the first screenful comes up at once, then
 * it moves up a line every delay until its last line has been shown, and the
 * next sentence replaces it.
 */
#if defined(AD_SAVER_NONSENSE) || defined(AD_ALL_SAVERS)
#include "ad_core.h"
#include "ad_text.h"
#include "ad_draw.h"
#include "ad_font.h"
#include "ad_font_4x6.h"
#include "ad_font_5x8.h"
#include "ad_font_6x10.h"
#include "ad_font_8x13.h"
#include "ad_font_10x20.h"
#include "ad_art_nonsense.h"

#include <cstring>

namespace adcore {

namespace {

using namespace art_nonsense;

/* Sentences on the screen at once, for Curt .. Tennysonian. */
const int ON_SCREEN[] = {1, 1, 2, 4, 7, 11};
const int MAX_SHOWN = 11;
/* Seconds between sentences, for Very Short .. Very Long. */
const float WAIT[] = {0.55f, 1.2f, 2.7f, 3.8f, 4.9f};
const Rgb PAPERS[] = {{0xaa, 0, 0}, {0, 0xaa, 0}, {0, 0, 0xaa}, {0xaa, 0, 0xaa},
                      {0, 0xaa, 0xaa}, {0xaa, 0x55, 0}, {0x55, 0x55, 0x55}, {0, 0, 0x80}};
const Rgb WHITE = {255, 255, 255};

bool chance(float p) { return rng.uniform() < p; }

/* ---------------------------------------------------------- the words -- */

int count(const WordList &l) { return l.n; }

/* Field `k` of entry `i`. */
const char *field(const WordList &l, int i, int k) {
  const char *p = WORDS + OFF[l.first + i];
  while (k-- > 0)
    p += strlen(p) + 1;
  return p;
}

int fields(const WordList &l, int i) {
  int n = 0;
  for (int o = OFF[l.first + i]; o < OFF[l.first + i + 1]; o++)
    n += WORDS[o] == 0;
  return n;
}

int pick(const WordList &l) { return rng.below(l.n); }
const char *pick_word(const WordList &l) { return field(l, pick(l), 0); }

/* A string being built, cut off quietly if it gets too long. */
struct Buf {
  char *p;
  int cap, n = 0;
  Buf(char *out, int size) : p(out), cap(size) { p[0] = 0; }
  void add(const char *s) {
    while (*s && n < cap - 1)
      p[n++] = *s++;
    p[n] = 0;
  }
  void add(char c) {
    if (n < cap - 1)
      p[n++] = c;
    p[n] = 0;
  }
  void cut(int at) {
    n = at;
    p[n] = 0;
  }
};

struct Subject {
  int person;
  bool plural;
};

/* The sentence machine, as nonsense.js's Grammar. */
class Grammar {
 public:
  /* One sentence into `out`. */
  void sentence(char *out, int cap) {
    char raw[640];
    Buf b(raw, sizeof raw);
    char end = '.';
    if (chance(0.25f)) {
      question(b);
      end = '?';
    } else {
      clause(b, 0);
      if (chance(0.2f)) {
        b.add(", ");
        b.add(pick_word(CONJUNCTIONS));
        b.add(' ');
        clause(b, 1);
      }
      if (chance(0.1f)) {
        /* "However, ..." goes in front. */
        const char *conn = pick_word(CONNECTIVES);
        int k = strlen(conn) + 2;
        if (b.n + k < (int) sizeof raw) {
          memmove(raw + k, raw, b.n + 1);
          memcpy(raw, conn, k - 2);
          raw[k - 2] = ',';
          raw[k - 1] = ' ';
          b.n += k;
        }
      }
    }
    /* Runs of spaces to one, trimmed, capitalised. */
    Buf o(out, cap);
    for (int i = 0; i < b.n; i++) {
      char c = raw[i];
      if (c == ' ' && (o.n == 0 || o.p[o.n - 1] == ' '))
        continue;
      o.add(c);
    }
    while (o.n > 0 && o.p[o.n - 1] == ' ')
      o.cut(o.n - 1);
    if (o.n > 0 && o.p[0] >= 'a' && o.p[0] <= 'z')
      o.p[0] -= 'a' - 'A';
    o.add(end);
  }

 private:
  static const char *plural(int noun, char *tmp, int cap) {
    const char *pl = field(NOUNS, noun, 1);
    if (*pl)
      return pl;
    const char *s = field(NOUNS, noun, 0);
    int n = strlen(s);
    Buf b(tmp, cap);
    auto ends = [&](const char *e) {
      int m = strlen(e);
      return n >= m && strcmp(s + n - m, e) == 0;
    };
    auto vowel = [](char c) { return c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u'; };
    if (ends("s") || ends("x") || ends("z") || ends("ch") || ends("sh")) {
      b.add(s);
      b.add("es");
    } else if (n >= 2 && s[n - 1] == 'y' && !vowel(s[n - 2])) {
      b.add(s);
      b.cut(n - 1);
      b.add("ies");
    } else {
      b.add(s);
      b.add('s');
    }
    return tmp;
  }

  static bool starts_vowel(const char *s) {
    char c = *s;
    if (c >= 'A' && c <= 'Z')
      c += 'a' - 'A';
    return c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u';
  }

  /* Some adjectives, sometimes with "very" or "excruciatingly" in front. */
  void adjectives(Buf &b) {
    int n = chance(0.5f) ? (chance(0.3f) ? 2 : 1) : 0;
    for (int i = 0; i < n; i++) {
      if (i)
        b.add(", ");
      if (chance(0.2f)) {
        b.add(pick_word(INTENSIFIERS));
        b.add(' ');
      }
      b.add(pick_word(ADJECTIVES));
    }
  }

  /* A noun phrase onto `b`; `object` asks for "me" rather than "I". */
  Subject noun(Buf &b, bool object) {
    float r = rng.uniform();
    if (r < 0.15f && count(NAMES)) {
      b.add(pick_word(NAMES));
      return {3, false};
    }
    if (r < 0.3f) {
      int k = rng.below(PRONOUNS.n);
      b.add(field(PRONOUNS, k, object ? 1 : 0));
      return {k < 2 ? 1 : (k < 4 ? 2 : 3), k % 2 == 1};
    }
    char adj[200];
    Buf a(adj, sizeof adj);
    adjectives(a);
    if (r < 0.4f) {
      if (chance(0.4f))
        b.add("some ");
      if (a.n) {
        b.add(adj);
        b.add(' ');
      }
      b.add(pick_word(MASS));
      return {3, false};
    }
    bool pl = chance(0.35f);
    int nn = pick(NOUNS);
    char head[240], tmp[48];
    Buf h(head, sizeof head);
    if (a.n) {
      h.add(adj);
      h.add(' ');
    }
    h.add(pl ? plural(nn, tmp, sizeof tmp) : field(NOUNS, nn, 0));
    if (chance(0.15f)) {
      /* Somebody's: "my wombat", "Elvis's pretzels". */
      if (rng.uniform() < 0.5f && count(NAMES)) {
        b.add(pick_word(NAMES));
        b.add("'s");
      } else {
        b.add(field(PRONOUNS, rng.below(PRONOUNS.n), 2));
      }
      b.add(' ');
    } else {
      const char *det = field(DETERMINERS, pick(DETERMINERS), pl ? 1 : 0);
      if (*det) {
        /* "a" before a vowel is "an". */
        b.add(strcmp(det, "a") == 0 && starts_vowel(head) ? "an" : det);
        b.add(' ');
      }
    }
    b.add(head);
    return {3, pl};
  }

  /* Which "to be": am / are / is. */
  static int be(Subject s) {
    if (s.person == 1 && !s.plural)
      return 0;
    if (s.person == 3 && !s.plural)
      return 2;
    return 1;
  }

  /* What follows a verb, by its code letters. */
  void complement(Buf &b, const char *code, int depth) {
    int n = strlen(code);
    char c = n ? code[rng.below(n)] : 0;
    if (depth > 2 && (c == 'c' || c == 'i' || c == 'g'))
      c = 'n';
    switch (c) {
      case 'n':
        noun(b, true);
        break;
      case 'p':
        b.add(pick_word(PREPOSITIONS));
        b.add(' ');
        noun(b, true);
        break;
      case 'c':
        b.add("that ");
        clause(b, depth + 1);
        break;
      case 'i': {
        int v = pick(VERBS);
        b.add("to ");
        b.add(field(VERBS, v, 1));
        after(b, v, depth + 1);
        break;
      }
      case 'g': {
        int v = pick(VERBS);
        b.add(field(VERBS, v, 4));
        after(b, v, depth + 1);
        break;
      }
      case 'a':
        if (chance(0.3f)) {
          b.add(pick_word(INTENSIFIERS));
          b.add(' ');
        }
        b.add(pick_word(ADJECTIVES));
        break;
      default:
        break;
    }
  }

  void after(Buf &b, int verb, int depth) {
    const char *code = fields(VERBS, verb) > 5 ? field(VERBS, verb, 5) : "";
    if (!*code)
      code = " ";
    int at = b.n;
    b.add(' ');
    complement(b, code, depth);
    if (b.n == at + 1)
      b.cut(at);
  }

  /* Subject and verb phrase, in one of the tenses the tables allow. */
  void clause(Buf &b, int depth) {
    Subject subj = noun(b, false);
    b.add(' ');
    int v = pick(VERBS);
    bool third = subj.person == 3 && !subj.plural;
    if (chance(0.2f)) {
      b.add(pick_word(ADVERBS));
      b.add(' ');
    }
    float r = rng.uniform();
    if (r < 0.3f) {
      b.add(field(VERBS, v, third ? 0 : 1));
    } else if (r < 0.55f) {
      b.add(field(VERBS, v, 2));
    } else if (r < 0.7f) {
      b.add(field(BE, be(subj), chance(0.5f) ? 0 : 2));
      b.add(' ');
      b.add(field(VERBS, v, 4));
    } else if (r < 0.82f) {
      b.add(third ? "has " : "have ");
      b.add(field(VERBS, v, 3));
    } else {
      int m = pick(MODALS);
      b.add(field(MODALS, m, rng.below(fields(MODALS, m))));
      b.add(' ');
      b.add(field(VERBS, v, 1));
    }
    after(b, v, depth);
  }

  /* A yes-no question, the modal first. */
  void question(Buf &b) {
    int m = pick(MODALS);
    b.add(field(MODALS, m, rng.below(fields(MODALS, m))));
    b.add(' ');
    noun(b, false);
    b.add(' ');
    int v = pick(VERBS);
    if (chance(0.3f)) {
      b.add("have ");
      b.add(field(VERBS, v, 3));
    } else {
      b.add(field(VERBS, v, 1));
    }
    after(b, v, 0);
  }
};

/* Word wrap in characters, as nonsense.js's wrap() in pixels: `starts` and
   `lens` get each line's start and length. Returns the line count. */
int wrap(const char *text, int room, int *starts, int *lens, int max_lines) {
  int n = 0, start = -1, len = 0;
  int i = 0;
  while (text[i]) {
    while (text[i] == ' ')
      i++;
    if (!text[i])
      break;
    int ws = i;
    while (text[i] && text[i] != ' ')
      i++;
    int wl = i - ws;
    if (start < 0) {
      start = ws;
      len = wl;
    } else if (ws - start + wl > room) {
      if (n < max_lines) {
        starts[n] = start;
        lens[n] = len;
      }
      n++;
      start = ws;
      len = wl;
    } else {
      len = ws - start + wl;
    }
  }
  if (start < 0) {
    start = 0;
    len = 0;
  }
  if (n < max_lines) {
    starts[n] = start;
    lens[n] = len;
  }
  return n + 1;
}

/* A bright colour, any colour. */
Rgb ink() {
  float c[3] = {rng.uniform(), rng.uniform(), rng.uniform()};
  float top = c[0] > c[1] ? c[0] : c[1];
  if (c[2] > top)
    top = c[2];
  if (top <= 0)
    top = 1;
  float lift = 0.7f + rng.uniform() * 0.3f;
  return rgb(round_half_up(c[0] / top * lift * 255), round_half_up(c[1] / top * lift * 255),
             round_half_up(c[2] / top * lift * 255));
}

class Nonsense : public Saver {
 public:
  int how_many = 1;  // Laconic
  int delay = 1;     // Short
  bool colored = false;

  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    mono_ = s.mono();
    count_ = ON_SCREEN[how_many];
    wait_ = WAIT[delay];
    /* The module's 24 px font in 30 px lines, 300 px wide, sized down. */
    font_ = w_ >= 300 ? &font_10x20 : w_ >= 200 ? &font_8x13 : w_ >= 150 ? &font_6x10 : w_ >= 100 ? &font_5x8 : &font_4x6;
    small_ = w_ >= 100 ? &font_4x6 : nullptr;
    shown_n_ = 0;
    next_ = 0.3f;
    s.clear();
  }

  void frame(Surface &s, float dt) override {
    next_ -= dt;
    if (next_ > 0)
      return;
    /* Like clockwork: the oldest goes, the next one comes. */
    while (shown_n_ >= count_) {
      s.fill(shown_[0], BLACK);
      for (int i = 1; i < shown_n_; i++)
        shown_[i - 1] = shown_[i];
      shown_n_--;
    }
    shown_[shown_n_++] = phrase(s);
    next_ += wait_;
    if (next_ <= 0)
      next_ = wait_;
  }

 private:
  static const int MAX_LINES = 40;
  struct Layout {
    const Font *f;
    int pitch, pad, room, n, box_lines, tw;
    int starts[MAX_LINES], lens[MAX_LINES];
  };

  void lay_out(Layout &l, const char *text, const Font *f) {
    l.f = f;
    l.pitch = (f->h * 5 + 2) / 4;
    l.pad = colored ? (8 * f->h + 10) / 20 : 0;
    int px = w_ < 300 ? w_ : 300;
    l.room = px / f->w;
    if (l.room < 1)
      l.room = 1;
    l.n = wrap(text, l.room, l.starts, l.lens, MAX_LINES);
    if (l.n > MAX_LINES)
      l.n = MAX_LINES;
    /* The box the module rubs out is worked out at 1.2 times the width. */
    int s2[MAX_LINES], l2[MAX_LINES];
    l.box_lines = wrap(text, l.room * 6 / 5, s2, l2, MAX_LINES);
    l.tw = 0;
    for (int i = 0; i < l.n; i++)
      if (l.lens[i] > l.tw)
        l.tw = l.lens[i];
    l.tw *= f->w;
  }

  int height(const Layout &l) const { return l.pitch * l.n + l.pad * 2; }

  Rect phrase(Surface &s) {
    /* Kept off the stack: the sentence machine recurses. */
    Layout &l = layout_[0];
    grammar_.sentence(text_, sizeof text_);
    lay_out(l, text_, font_);
    if (height(l) > h_ && small_ && font_ != small_)
      lay_out(l, text_, small_);
    /* Too tall even so: a few more tries, keeping the shortest. */
    for (int tries = 0; tries < 3 && height(l) > h_; tries++) {
      char *again = again_;
      Layout &m = layout_[1];
      grammar_.sentence(again, sizeof again_);
      lay_out(m, again, small_ ? small_ : font_);
      if (height(m) < height(l)) {
        memcpy(text_, again, sizeof text_);
        l = m;
      }
    }
    const Font &f = *l.f;
    int bw = l.tw + l.pad * 2, bh = height(l);
    int x = round_half_up(rng.uniform() * (w_ - bw > 0 ? w_ - bw : 0));
    int y = round_half_up(rng.uniform() * (h_ - bh > 0 ? h_ - bh : 0));
    Rgb fg;
    if (colored) {
      Rgb paper = PAPERS[rng.below(8)];
      s.fill_rect(x, y, bw, bh, mono_ ? WHITE : paper);
      fg = mono_ ? BLACK : WHITE;
    } else {
      fg = ink();
      if (mono_)
        fg = WHITE;
    }
    int top = (l.pitch - f.h + 1) / 2;
    char line[MAX_LINE + 1];
    for (int i = 0; i < l.n; i++) {
      int n = l.lens[i] < MAX_LINE ? l.lens[i] : MAX_LINE;
      memcpy(line, text_ + l.starts[i], n);
      line[n] = 0;
      int lx = x + bw / 2 - n * f.w / 2;
      draw_text(s, f, lx, y + l.pad + i * l.pitch + top, line, fg);
    }
    /* The short box only where there is room for what it leaves behind. */
    int keep = w_ >= 240 ? l.pitch * l.box_lines + l.pad * 2 : bh;
    return {x, y, bw, bh < keep ? bh : keep};
  }

  static const int MAX_LINE = 120;
  Grammar grammar_;
  int w_ = 0, h_ = 0;
  bool mono_ = false;
  const Font *font_ = nullptr, *small_ = nullptr;
  int count_ = 1;
  float wait_ = 1.2f, next_ = 0.3f;
  Rect shown_[MAX_SHOWN];
  int shown_n_ = 0;
  char text_[480], again_[480];
  Layout layout_[2];
};

/* On a character LCD: one sentence at a time, wrapped and centred, moving up
   a line each delay. */
class NonsenseText : public TextSaver {
 public:
  int delay = 1;  // Short

  void start(TextScreen &t) override {
    cols_ = t.cols();
    rows_ = t.rows();
    wait_ = WAIT[delay];
    n_ = 0;
    top_ = 0;
    next_ = 0.3f;
    t.clear();
  }

  void frame(TextScreen &t, float dt) override {
    next_ -= dt;
    if (next_ > 0)
      return;
    next_ += wait_;
    if (next_ <= 0)
      next_ = wait_;
    if (top_ + rows_ < n_) {
      top_++;
    } else {
      fresh();
    }
    t.clear();
    for (int r = 0; r < rows_ && top_ + r < n_; r++) {
      int i = top_ + r;
      int x = (cols_ - lens_[i]) / 2;
      for (int c = 0; c < lens_[i]; c++)
        t.put(x + c, r, (uint8_t) text_[starts_[i] + c]);
    }
  }

 private:
  static const int MAX_LINES = 48;

  void fresh() {
    grammar_.sentence(text_, sizeof text_);
    int st[MAX_LINES], ln[MAX_LINES];
    int m = wrap(text_, cols_, st, ln, MAX_LINES);
    if (m > MAX_LINES)
      m = MAX_LINES;
    /* A word longer than the panel is cut where it reaches the edge. */
    n_ = 0;
    for (int i = 0; i < m; i++)
      for (int at = 0; at < ln[i] && n_ < MAX_LINES; at += cols_) {
        starts_[n_] = st[i] + at;
        lens_[n_] = ln[i] - at < cols_ ? ln[i] - at : cols_;
        n_++;
      }
    top_ = 0;
  }

  Grammar grammar_;
  int cols_ = 16, rows_ = 2;
  float wait_ = 1.2f, next_ = 0.3f;
  int n_ = 0, top_ = 0;
  int starts_[MAX_LINES], lens_[MAX_LINES];
  char text_[480];
};

}  // namespace

Saver *make_nonsense() { return new Nonsense(); }
TextSaver *make_nonsense_text() { return new NonsenseText(); }

AD_REGISTER_SAVER("nonsense", make_nonsense, make_nonsense_text)

}  // namespace adcore
#endif
