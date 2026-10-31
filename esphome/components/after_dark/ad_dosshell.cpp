/*
 * ad_dosshell.cpp - DOS Shell, a PC typing to itself at the C:\> prompt. A
 * port of all/modules/dosshell.js, which was checked against DOSSHELL.AD
 * under Wine and takes every line it prints from the module's data segment;
 * see that file for what was measured and what was inferred.
 *
 * Defaults are the module's: Green (0,128,0 on black), Speed Fast (3.5 keys a
 * second), Accuracy 94 (6% of commands mistyped). The disk it lists is the
 * web port's stand-in for a 1994 C: drive.
 *
 * The OEM font's 7x12 cells become 6x10 glyphs in 7x12 cells at 240 wide and
 * up; smaller screens get 4x6 in 4x6 cells, and lose the web port's floor of
 * 20 columns and 5 rows, which would not fit. Long lines wrap, as they do on
 * the original when the screen is narrow. On a 1-bit panel the text is lit and
 * the paper dark whatever the colour (dark green would dither away). Without
 * a clock, DATE and TIME count from Friday 03-25-1994 (the BIOS banner's
 * date) at 10:10:00.
 *
 * On a character LCD (DosShellText) the panel is the screen: the same shell,
 * 16 columns by 2 rows, typing at the prompt. Four rows or fewer is too few
 * to scroll a DOS screen past, so there the shell goes compact: no blank
 * lines, DIR one short line a file, answers one row a second, and a hold on
 * the last of them with the block blinking in the bottom-right corner before
 * the next prompt. The backslash and the block cursor are user glyphs, since
 * the HD44780's ROM has a yen sign where the backslash goes.
 *
 * Live data: given commands (ad_live.h, from the YAML's `commands:`), the
 * shell types those instead and answers each with a line an entity, its
 * label on the left and its state on the right, as Home Assistant sends them.
 * They come round in order, mistyped now and then like any command; with
 * `classic: true` the module's own commands are mixed in.
 */
#if defined(AD_SAVER_DOSSHELL) || defined(AD_ALL_SAVERS)
#include "ad_core.h"
#include "ad_text.h"
#include "ad_font.h"
#include "ad_font_4x6.h"
#include "ad_font_6x10.h"
#include "ad_live.h"

#include <cstring>
#include <vector>

namespace adcore {

namespace {

/* Ink and paper: Amber, Green, Mono, Programmer. */
const Rgb SCHEMES[4][2] = {{{128, 128, 0}, {0, 0, 0}},
                           {{0, 128, 0}, {0, 0, 0}},
                           {{128, 128, 128}, {0, 0, 0}},
                           {{255, 255, 255}, {0, 0, 128}}};
/* Keys a second for Pokey, Normal, Fast, Demon. */
const float KEYS[] = {1.2f, 2.5f, 3.5f, 8};
/* The chance a command goes in mistyped, for Low .. Perfect accuracy. */
const float TYPO[] = {0.5f, 0.25f, 0.06f, 0};

float rand_range(float a, float b) { return a + rng.uniform() * (b - a); }

/* ------------------------------------------------------------ the disk -- */

struct File {
  const char *name, *ext;
  int32_t size;  // -1 for a directory
  const char *date, *time;
};

const File ROOT[] = {{"DOS", "", -1, "09-30-93", "6:20a"},        {"WINDOWS", "", -1, "09-30-93", "6:24a"},
                     {"AFTERDRK", "", -1, "03-25-94", "10:02a"},  {"GAMES", "", -1, "11-12-93", "8:41p"},
                     {"UTIL", "", -1, "10-02-93", "9:15a"},       {"COMMAND", "COM", 54619, "09-30-93", "6:20a"},
                     {"AUTOEXEC", "BAT", 212, "03-25-94", "10:05a"}, {"CONFIG", "SYS", 157, "03-25-94", "10:05a"},
                     {"WINA20", "386", 9349, "09-30-93", "6:20a"},   {"TOAST", "TXT", 1994, "04-01-94", "4:01p"}};
const File DOS[] = {{"EDIT", "COM", 413, "09-30-93", "6:20a"},      {"QBASIC", "EXE", 194309, "09-30-93", "6:20a"},
                    {"MEM", "EXE", 32502, "09-30-93", "6:20a"},     {"FORMAT", "COM", 22916, "09-30-93", "6:20a"},
                    {"CHKDSK", "EXE", 12241, "09-30-93", "6:20a"},  {"DOSSHELL", "EXE", 235484, "09-30-93", "6:20a"}};
const File WINDOWS[] = {{"WIN", "COM", 44170, "11-01-93", "3:11a"},     {"WIN", "INI", 8872, "03-25-94", "10:06a"},
                        {"SYSTEM", "INI", 3310, "03-25-94", "10:06a"},  {"SOL", "EXE", 180688, "11-01-93", "3:11a"},
                        {"WINMINE", "EXE", 27776, "11-01-93", "3:11a"}, {"SYSTEM", "", -1, "11-01-93", "3:11a"}};
const File AFTERDRK[] = {{"AFTERDRK", "EXE", 47104, "03-25-94", "10:02a"}, {"TOAST3", "AD", 124672, "03-25-94", "10:02a"},
                         {"MARBLES2", "AD", 41488, "03-25-94", "10:02a"},  {"DOSSHELL", "AD", 30208, "03-25-94", "10:02a"},
                         {"WARP", "AD", 9728, "03-25-94", "10:02a"}};
const File GAMES[] = {{"DOOM", "EXE", 580391, "12-10-93", "11:59p"},
                      {"KEEN4", "EXE", 263119, "12-15-91", "1:00p"},
                      {"PRINCE", "EXE", 103904, "10-03-90", "2:22p"}};
const File UTIL[] = {{"PKZIP", "EXE", 42166, "02-01-93", "2:04a"}, {"LIST", "COM", 12863, "06-02-91", "9:51p"}};

struct Dir {
  const char *path, *name;  // name as it is listed in C:\ (none for the root)
  const File *files;
  int n;
};
#define AD_DIR(path, name, list) {path, name, list, (int) (sizeof(list) / sizeof(list[0]))}
const Dir DISK[] = {AD_DIR("C:\\", "", ROOT),          AD_DIR("C:\\DOS", "DOS", DOS),
                    AD_DIR("C:\\WINDOWS", "WINDOWS", WINDOWS), AD_DIR("C:\\AFTERDRK", "AFTERDRK", AFTERDRK),
                    AD_DIR("C:\\GAMES", "GAMES", GAMES), AD_DIR("C:\\UTIL", "UTIL", UTIL)};
#undef AD_DIR
const int DIRS = sizeof(DISK) / sizeof(DISK[0]);

/* The directory a listed one opens into, or -1. Only the root's have any. */
int subdir(int cwd, const File &f) {
  if (cwd != 0 || f.size >= 0)
    return -1;
  for (int d = 1; d < DIRS; d++)
    if (strcmp(DISK[d].name, f.name) == 0)
      return d;
  return -1;
}

/* A little printf, as there is none here: text, padded numbers. */
struct Out {
  char *p;
  int cap, n = 0;
  Out(char *out, int size) : p(out), cap(size) { p[0] = 0; }
  Out &s(const char *t) {
    while (*t && n < cap - 1)
      p[n++] = *t++;
    p[n] = 0;
    return *this;
  }
  Out &c(char ch) {
    if (n < cap - 1)
      p[n++] = ch;
    p[n] = 0;
    return *this;
  }
  /* Left-justified in `w`, cut to it. */
  Out &pad(const char *t, int w) {
    int i = 0;
    for (; t[i] && i < w; i++)
      c(t[i]);
    for (; i < w; i++)
      c(' ');
    return *this;
  }
  /* Right-justified in at least `w`. */
  Out &rnum(long v, int w, char fill = ' ') {
    char d[16];
    int k = 0;
    bool neg = v < 0;
    unsigned long u = neg ? -v : v;
    do {
      d[k++] = '0' + u % 10;
      u /= 10;
    } while (u);
    if (neg)
      d[k++] = '-';
    for (int i = k; i < w; i++)
      c(fill);
    while (k)
      c(d[--k]);
    return *this;
  }
  Out &rstr(const char *t, int w) {
    for (int i = strlen(t); i < w; i++)
      c(' ');
    return s(t);
  }
};

/* --------------------------------------------------------- the machine -- */

/* The shell itself, on a screen of cols x rows characters: what it types and
   prints, and when, as dosshell.js's queue. */
class Shell {
 public:
  int speed = 2;     // Fast
  int accuracy = 2;  // 94

  void begin(int cols, int rows) {
    cols_ = cols < 1 ? 1 : cols;
    rows_ = rows < 1 ? 1 : rows;
    compact_ = rows_ <= 4;
    pending_nl_ = false;
    hold_until_ = -1;
    next_live_ = 0;
    text_.assign((rows_ + 1) * cols_, ' ');
    len_.assign(rows_ + 1, 0);
    keys_ = KEYS[speed];
    typo_ = TYPO[accuracy];
    t_ = 0;
    blink_ = 0;
    boot();
  }

  void step(float dt) {
    t_ += dt;
    wait_ -= dt;
    int guard = 0;
    while (wait_ <= 0 && guard < 200) {
      guard++;
      if (counting_) {
        count_at_ = count_at_ + 64 < count_to_ ? count_at_ + 64 : count_to_;
        char line[24];
        Out(line, sizeof line).c(' ').rnum(count_at_, 3).s(" KB OK");
        set_last(line);
        if (count_at_ >= count_to_)
          counting_ = false;
        wait_ += 0.06f;
        continue;
      }
      if (head_ == tail_)
        plan();
      const Act &a = queue_[head_++];
      switch (a.op) {
        case WAIT:
          wait_ += a.wait;
          break;
        case KEY: {
          char k[2] = {a.key, 0};
          write(k);
          blink_ = t_;
          /* Humans are uneven typists. */
          wait_ += rand_range(0.5f, 1.5f) / keys_;
          break;
        }
        case COUNT:
          counting_ = true;
          count_to_ = a.arg;
          count_at_ = 0;
          break;
        case CD:
          cwd_ = a.arg;
          break;
        case CLEAR:
          clear();
          break;
        case PROMPT:
          write(DISK[cwd_].path);
          write(">");
          break;
        case OUT:
          write(pool_ + a.arg);
          if (!a.raw)
            write("\n");
          wait_ += a.wait > 0 ? a.wait : a.fast ? 0.02f : 0.1f;
          break;
        case HOLD:
          hold_until_ = t_ + a.wait;
          wait_ += a.wait;
          break;
      }
    }
  }

  int lines() const { return n_; }
  int length(int r) const { return len_[r]; }
  char at(int r, int c) const { return text_[r * cols_ + c]; }
  /* The block cursor: 0.3 s on, 0.3 s off, on again at each key. */
  bool cursor_on() const { return fmodf((t_ - blink_) / 0.3f, 2) < 1; }
  /* Holding on an answer (compact): the block blinks in the bottom-right
     corner instead, 0.4 s on, 0.4 s off. */
  bool holding() const { return t_ < hold_until_; }
  bool corner_on() const { return fmodf((hold_until_ - t_) / 0.4f, 2) >= 1; }

 private:
  enum Op : uint8_t { WAIT, KEY, COUNT, CD, CLEAR, PROMPT, OUT, HOLD };
  struct Act {
    Op op;
    bool raw, fast;
    char key;
    int arg;  // a count, a directory, or where the text is in the pool
    float wait;  // WAIT, HOLD; for OUT, the pause after it (0: the usual)
  };
  static const int QUEUE = 128;
  static const int POOL = 3072;

  /* ---------------------------------------------------------- the queue -- */
  void reset_queue() {
    head_ = tail_ = 0;
    used_ = 0;
  }
  Act &push(Op op) {
    Act &a = queue_[tail_ < QUEUE ? tail_++ : QUEUE - 1];
    a = Act{op, false, false, 0, 0, 0};
    return a;
  }
  void wait(float s) { push(WAIT).wait = s; }
  /* A line of output. Compact, a line is cut into rows that come `pace`
     seconds apart, and blank ones are left out. */
  void out(const char *t, bool raw, bool fast, float pace = 1.0f) {
    if (compact_ && !raw) {
      int n = strlen(t);
      if (!n)
        return;
      /* Wrapped at spaces where a word allows it. */
      char row[128];
      int step = cols_ < 127 ? cols_ : 127;
      for (int at = 0; at < n;) {
        while (at < n && t[at] == ' ')
          at++;
        if (at >= n)
          break;
        int k = n - at < step ? n - at : step;
        if (at + k < n && t[at + k] != ' ') {
          int b = k;
          while (b > 0 && t[at + b] != ' ')
            b--;
          if (b > 0)
            k = b;
        }
        int e = k;
        while (e > 0 && t[at + e - 1] == ' ')
          e--;
        for (int i = 0; i < e; i++)
          row[i] = t[at + i];
        row[e] = 0;
        put_out(row, false, fast, pace);
        at += k;
      }
      return;
    }
    put_out(t, raw, fast, 0);
  }
  void put_out(const char *t, bool raw, bool fast, float pace) {
    int n = strlen(t);
    if (used_ + n + 1 > POOL)
      return;
    memcpy(pool_ + used_, t, n + 1);
    Act &a = push(OUT);
    a.arg = used_;
    a.raw = raw;
    a.fast = fast;
    a.wait = pace;
    used_ += n + 1;
  }

  void boot() {
    n_ = 1;
    len_[0] = 0;
    cwd_ = 0;
    wait_ = 0;
    counting_ = false;
    reset_queue();
    push(COUNT).arg = 640;
    wait(0.1f);
    static const char *const BANNER[] = {"", "", "Toaster-BIOS v1.3.02.P0100137 3/25/94 rev.A-A1", "Copyright(c)BSI",
                                         "", "", "AfterDark DOS Shell version 2.7(Win)",
                                         "Copyright(c) 1993,94 Berkeley Systems, Inc.  All rights reserved.", "", "",
                                         "Welcome to AD-DOS.", ""};
    if (compact_)
      out("\n", true, true);  // off the memory count's line
    for (int i = 0; i < 12; i++) {
      if (compact_) {
        out(BANNER[i], false, true, 0.6f);
        continue;
      }
      char line[80];
      Out o(line, sizeof line);
      if (i)
        o.c('\n');
      o.s(BANNER[i]);
      out(line, true, true);
    }
    if (compact_)
      push(HOLD).wait = 2;
    out("\n", true, false);
    push(PROMPT);
  }

  /* --------------------------------------------------------- the screen -- */
  void new_line() {
    len_[n_] = 0;
    n_++;
    /* Off the bottom: everything goes up a line. */
    if (n_ > rows_)
      scroll();
  }
  void scroll() {
    memmove(&text_[0], &text_[cols_], (n_ - 1) * cols_);
    for (int i = 1; i < n_; i++)
      len_[i - 1] = len_[i];
    n_--;
  }
  void write(const char *t) {
    for (; *t; t++) {
      if (*t == '\n') {
        /* Compact, a newline waits for the next character, so the last row
           is never left blank and blank lines don't happen. */
        if (compact_)
          pending_nl_ = pending_nl_ || len_[n_ - 1] > 0;
        else
          new_line();
        continue;
      }
      if (pending_nl_) {
        new_line();
        pending_nl_ = false;
      } else if (len_[n_ - 1] >= cols_) {
        new_line();
      }
      int r = n_ - 1;
      text_[r * cols_ + len_[r]++] = *t;
    }
  }
  void set_last(const char *t) {
    int r = n_ - 1, i = 0;
    for (; t[i] && i < cols_; i++)
      text_[r * cols_ + i] = t[i];
    len_[r] = i;
  }
  void clear() {
    n_ = 1;
    len_[0] = 0;
    pending_nl_ = false;
    if (rng.uniform() < 0.3f)
      cwd_ = 1 + rng.below(DIRS - 1);
  }

  /* --------------------------------------------------------- commands -- */
  void name_of(const File &f, Out &o) {
    o.s(f.name);
    if (*f.ext)
      o.c('.').s(f.ext);
  }

  void dir(bool wide) {
    const Dir &d = DISK[cwd_];
    if (compact_) {
      dir_compact(d);
      return;
    }
    out("Volume in drive C has no label.", false, true);
    char line[96];
    Out(line, sizeof line).s("Directory of ").s(d.path);
    out(line, false, true);
    out("", false, true);
    static const File DOTS[] = {{".", "", -1, "09-30-93", "6:20a"}, {"..", "", -1, "09-30-93", "6:20a"}};
    int extra = cwd_ ? 2 : 0, n = d.n + extra;
    long bytes = 0;
    Out row(line, sizeof line);
    int per = cols_ / 16 > 1 ? cols_ / 16 : 1, in_row = 0;
    for (int i = 0; i < n; i++) {
      const File &f = i < extra ? DOTS[i] : d.files[i - extra];
      if (f.size >= 0)
        bytes += f.size;
      if (wide) {
        char nm[24];
        Out o(nm, sizeof nm);
        if (f.size < 0)
          o.c('[').s(f.name).c(']');
        else
          name_of(f, o);
        row.pad(nm, 16);
        if (++in_row == per) {
          flush_row(row);
          in_row = 0;
        }
        continue;
      }
      /* "%-9s%-4s%s %02d-%02d-%02d  %2d:%02d%c" */
      Out o(line, sizeof line);
      o.pad(f.name, 9).pad(f.ext, 4);
      if (f.size < 0)
        o.s("<DIR>    ");
      else
        o.rnum(f.size, 9);
      char hm[8];
      int k = strlen(f.time);
      memcpy(hm, f.time, k - 1);
      hm[k - 1] = 0;
      o.c(' ').s(f.date).s("  ").rstr(hm, 5).c(f.time[k - 1]);
      out(line, false, true);
    }
    if (wide && in_row)
      flush_row(row);
    Out o(line, sizeof line);
    o.rnum(n, 9).s(" file(s) ").rnum(bytes, 10).s(" bytes");
    out(line, false, true);
    Out f(line, sizeof line);
    f.rnum((long) round_half_up(rand_range(8, 60)) * 32768, 28).s(" bytes free");
    out(line, false, true);
  }
  /* DIR on a few short rows: NAME.EXT with its size in K, or <DIR>. */
  void dir_compact(const Dir &d) {
    char line[48];
    for (int i = 0; i < d.n; i++) {
      const File &f = d.files[i];
      char nm[16], sz[12];
      Out n(nm, sizeof nm);
      name_of(f, n);
      Out z(sz, sizeof z);
      if (f.size < 0)
        z.s("<DIR>");
      else
        z.rnum((f.size + 1023) / 1024, 1).c('K');
      Out o(line, sizeof line);
      /* One column short, so the corner block during the hold has a cell. */
      int gap = cols_ - 1 - (int) strlen(nm) - (int) strlen(sz);
      o.s(nm);
      for (int k = 0; k < (gap > 1 ? gap : 1); k++)
        o.c(' ');
      o.s(sz);
      out(line, false, true);
    }
  }

  void flush_row(Out &row) {
    while (row.n > 0 && row.p[row.n - 1] == ' ')
      row.n--;
    row.p[row.n] = 0;
    out(row.p, false, true);
    row.n = 0;
    row.p[0] = 0;
  }

  /* One live line: the label on the left, the value and unit on the right,
     across at most 40 columns (compact, one short of the screen, leaving the
     corner block its cell). */
  void live_line(const LiveLine &l, char *buf, int cap) {
    int width = compact_ ? cols_ - 1 : cols_ < 40 ? cols_ : 40;
    std::string v = l.value.empty() ? std::string("----") : l.value;
    if (!l.unit.empty() && !l.value.empty()) {
      unsigned char u = (unsigned char) l.unit[0];
      if (u != 0xB0 && u != '%')  // 21.5°C and 40%, but 3.2 kW
        v += ' ';
      v += l.unit;
    }
    int room = width - (int) v.size() - 1;
    Out o(buf, cap);
    if (room > 0) {
      int k = 0;
      for (; k < (int) l.label.size() && k < room; k++)
        o.c(l.label[k]);
      for (; k < room + 1; k++)
        o.c(' ');
    }
    o.s(v.c_str());
  }

  /* A live command typed and answered, as plan() does the module's own. */
  void plan_live() {
    const LiveCommand &lc = shell_commands[next_live_ % shell_commands.size()];
    next_live_++;
    char cmd[48];
    Out(cmd, sizeof cmd).s(lc.name.c_str());
    bool wrong = mistype(cmd);
    wait(rand_range(1, compact_ ? 2.5f : 5));
    for (int i = 0; cmd[i]; i++)
      push(KEY).key = cmd[i];
    wait(rand_range(0.2f, 0.5f));
    out("\n", true, false);
    if (wrong) {
      out("Bad command or file name", false, true);
    } else {
      char line[96];
      for (const LiveLine &l : lc.lines) {
        live_line(l, line, sizeof line);
        out(line, false, true);
      }
    }
    finish_answer();
  }

  /* A slip of the finger goes in as typed. */
  bool mistype(char *cmd) {
    if (rng.uniform() >= typo_)
      return false;
    int word = 0;
    while (cmd[word] && cmd[word] != ' ')
      word++;
    if (!word)
      return false;
    int at = rng.below(word);
    char ch = 'A' + rng.below(26);
    if (ch == cmd[at])
      return false;
    cmd[at] = ch;
    return true;
  }

  /* After an answer: a blank line, now and then a clean screen, the prompt.
     Compact, a hold on the last row first. */
  void finish_answer() {
    out("\n", true, true);
    if (compact_)
      push(HOLD).wait = 2.5f;
    if (rng.uniform() < 0.08f) {
      wait(rand_range(0.5f, 2));
      push(CLEAR);
    }
    push(PROMPT);
  }

  /* What gets typed next and what comes back. */
  void plan() {
    reset_queue();
    /* Live commands, if there are any (now and then one of the module's own,
       with `classic`). The live data can change between reads, so it is read
       as each command is planned. */
    if (!shell_commands.empty() && !(shell_classic && rng.uniform() < 0.3f)) {
      plan_live();
      return;
    }
    static const char *const COMMANDS[] = {"DIR", "DIR /W", "VOL", "COPY", "CD", "TIME", "DATE", "PROMPT $P$G", "VER"};
    int what = rng.below(9);
    char cmd[48];
    Out c(cmd, sizeof cmd);
    int cd_to = -1;
    struct Answer {
      const char *lines[3];
      int n;
    } fixed = {{nullptr, nullptr, nullptr}, 0};
    char a0[64];
    bool listing = false, wide = false;
    const Dir &here = DISK[cwd_];
    switch (what) {
      case 0:
      case 1:
        c.s(COMMANDS[what]);
        listing = true;
        wide = what == 1;
        break;
      case 2:
        c.s("VOL");
        fixed = {{"Volume in drive C has no label.", nullptr, nullptr}, 1};
        break;
      case 3: {
        int files = 0;
        for (int i = 0; i < here.n; i++)
          files += here.files[i].size >= 0;
        if (!files) {
          c.s("COPY ????????.??? NUL:");
          fixed = {{"File not found - ????????.???", "        0 file(s) copied", nullptr}, 2};
        } else {
          int k = rng.below(files);
          for (int i = 0; i < here.n; i++)
            if (here.files[i].size >= 0 && k-- == 0) {
              c.s("COPY ");
              name_of(here.files[i], c);
              c.s(" NUL:");
              break;
            }
          Out(a0, sizeof a0).rnum(1, 9).s(" file(s) copied");
          fixed = {{a0, nullptr, nullptr}, 1};
        }
        break;
      }
      case 4: {
        /* CD goes down, back up, or just says where it is. */
        int subs[DIRS], ns = 0;
        for (int i = 0; i < here.n; i++) {
          int d = subdir(cwd_, here.files[i]);
          if (d >= 0)
            subs[ns++] = d;
        }
        float r = rng.uniform();
        if (cwd_ != 0 && r < 0.4f) {
          c.s("CD ..");
          cd_to = 0;
        } else if (ns && r < 0.8f) {
          cd_to = subs[rng.below(ns)];
          c.s("CD ").s(DISK[cd_to].name);
        } else {
          c.s("CD");
          fixed = {{here.path, nullptr, nullptr}, 1};
        }
        break;
      }
      case 5:
      case 6: {
        Clock k;
        if (!local_time(k)) {
          /* No clock: from the BIOS date, 10:10:00. */
          long s = 10 * 3600 + 10 * 60 + (long) t_;
          int days = (int) (s / 86400);
          k = {1994, 3, 25 + days, (5 + days) % 7, (int) (s / 3600 % 24), (int) (s / 60 % 60), (int) (s % 60)};
          static const uint8_t MONTH[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
          while (k.day > MONTH[k.month - 1]) {
            k.day -= MONTH[k.month - 1];
            if (++k.month > 12) {
              k.month = 1;
              k.year++;
            }
          }
        }
        if (what == 5) {
          /* "%2d:%02d:%02d.%02d%c" */
          c.s("TIME");
          int hr = k.hour % 12 ? k.hour % 12 : 12;
          int cs = (int) (fmodf(t_, 1) * 100);
          Out(a0, sizeof a0)
              .s("Current time is ")
              .rnum(hr, 2)
              .c(':')
              .rnum(k.minute, 2, '0')
              .c(':')
              .rnum(k.second, 2, '0')
              .c('.')
              .rnum(cs, 2, '0')
              .c(k.hour < 12 ? 'a' : 'p');
        } else {
          /* "%s %02d-%02d-%4d" */
          static const char *const DAYS[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
          c.s("DATE");
          Out(a0, sizeof a0)
              .s("Current date is ")
              .s(DAYS[k.weekday % 7])
              .c(' ')
              .rnum(k.month, 2, '0')
              .c('-')
              .rnum(k.day, 2, '0')
              .c('-')
              .rnum(k.year, 4);
        }
        fixed = {{a0, nullptr, nullptr}, 1};
        break;
      }
      case 7:
        c.s("PROMPT $P$G");
        break;
      default:
        c.s("VER");
        fixed = {{"AfterDark DOS Shell version 2.7(Win)", nullptr, nullptr}, 1};
        break;
    }
    bool wrong = mistype(cmd);
    wait(rand_range(1, compact_ ? 2.5f : 5));
    for (int i = 0; cmd[i]; i++)
      push(KEY).key = cmd[i];
    wait(rand_range(0.2f, 0.5f));
    out("\n", true, false);
    if (wrong) {
      out("Bad command or file name", false, true);
    } else {
      if (listing)
        dir(wide);
      for (int i = 0; i < fixed.n; i++)
        out(fixed.lines[i], false, true);
      if (cd_to >= 0)
        push(CD).arg = cd_to;
    }
    finish_answer();
  }

  int cols_ = 1, rows_ = 1;
  bool compact_ = false, pending_nl_ = false;
  float hold_until_ = -1;
  unsigned next_live_ = 0;
  std::vector<char> text_;
  std::vector<uint8_t> len_;
  int n_ = 1;
  int cwd_ = 0;
  float keys_ = 3.5f, typo_ = 0.06f;
  float t_ = 0, blink_ = 0, wait_ = 0;
  bool counting_ = false;
  int count_at_ = 0, count_to_ = 0;
  Act queue_[QUEUE];
  int head_ = 0, tail_ = 0;
  char pool_[POOL];
  int used_ = 0;
};

class DosShell : public Saver {
 public:
  int color = 1;  // Amber, Green, Mono, Programmer, Random
  Shell shell;

  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    if (w_ >= 240 && h_ >= 120) {
      font_ = &font_6x10;
      cw_ = 7;
      ch_ = 12;
      left_ = 5;
      top_ = 1;
    } else {
      font_ = &font_4x6;
      cw_ = 4;
      ch_ = 6;
      left_ = w_ >= 100 ? 2 : 0;
      top_ = 0;
    }
    cols_ = (w_ - left_) / cw_;
    rows_ = h_ / ch_;
    int sc = color == 4 ? rng.below(4) : color;
    ink_ = SCHEMES[sc][0];
    paper_ = SCHEMES[sc][1];
    if (s.mono()) {
      ink_ = {255, 255, 255};
      paper_ = BLACK;
    }
    shell.begin(cols_, rows_);
    shown_.assign(cols_ * rows_, ' ');
    s.clear(paper_);
    draw(s);
  }

  void frame(Surface &s, float dt) override {
    shell.step(dt);
    draw(s);
  }

 private:
  static const char CURSOR = 1;

  void draw(Surface &s) {
    int n = shell.lines();
    bool hold = shell.holding();
    bool cur = hold ? shell.corner_on() : shell.cursor_on();
    int cur_c = hold ? cols_ - 1 : shell.length(n - 1);
    for (int r = 0; r < rows_; r++)
      for (int c = 0; c < cols_; c++) {
        char want = r < n && c < shell.length(r) ? shell.at(r, c) : ' ';
        if (cur && r == n - 1 && c == cur_c)
          want = CURSOR;
        char &have = shown_[r * cols_ + c];
        if (want == have)
          continue;
        have = want;
        int x = left_ + c * cw_, y = r * ch_;
        s.fill_rect(x, y, cw_, ch_, paper_);
        if (want == CURSOR) {
          s.fill_rect(x, y + top_ * 2, cw_, ch_ - top_ * 2, ink_);
        } else if (want != ' ') {
          /* The shell holds Latin-1; draw_text reads UTF-8. */
          uint8_t u = (uint8_t) want;
          char t[3] = {want, 0, 0};
          if (u >= 0x80) {
            t[0] = (char) (0xC0 | (u >> 6));
            t[1] = (char) (0x80 | (u & 0x3F));
          }
          draw_text(s, *font_, x, y + top_, t, ink_);
        }
      }
  }

  int w_ = 0, h_ = 0, cols_ = 1, rows_ = 1;
  const Font *font_ = &font_4x6;
  int cw_ = 4, ch_ = 6, left_ = 0, top_ = 0;
  Rgb ink_ = {0, 128, 0}, paper_ = BLACK;
  std::vector<char> shown_;
};

/* On a character LCD: the panel is the screen. */
class DosShellText : public TextSaver {
 public:
  Shell shell;

  void start(TextScreen &t) override {
    static const char *const ART[8] = {
        "     #####", "#    #####", " #   #####", "  #  #####",
        "   # #####", "    ######", "     #####", "     #####",
    };
    uint8_t bits[8];
    glyph_from_art(ART, 0, bits);
    t.glyph(BACKSLASH, bits);
    glyph_from_art(ART, 5, bits);
    t.glyph(BLOCK, bits);
    shell.begin(t.cols(), t.rows());
    draw(t);
  }

  void frame(TextScreen &t, float dt) override {
    shell.step(dt);
    draw(t);
  }

 private:
  static const uint8_t BACKSLASH = 0, BLOCK = 1;

  /* Latin-1 to the HD44780's A00 ROM: its own degree sign, user glyphs for
     the backslash, and '?' for what it lacks. */
  static uint8_t rom(char ch) {
    uint8_t c = (uint8_t) ch;
    if (c == '\\')
      return BACKSLASH;
    if (c == 0xB0)
      return 0xDF;
    return c < 0x80 ? c : '?';
  }

  void draw(TextScreen &t) {
    t.clear();
    int n = shell.lines();
    for (int r = 0; r < n && r < t.rows(); r++)
      for (int c = 0; c < shell.length(r); c++)
        t.put(c, r, rom(shell.at(r, c)));
    if (shell.holding()) {
      if (shell.corner_on())
        t.put(t.cols() - 1, n - 1, BLOCK);
    } else if (shell.cursor_on()) {
      t.put(shell.length(n - 1), n - 1, BLOCK);
    }
  }
};

}  // namespace

Saver *make_dosshell() { return new DosShell(); }
TextSaver *make_dosshell_text() { return new DosShellText(); }

AD_REGISTER_SAVER("dosshell", make_dosshell, make_dosshell_text)

}  // namespace adcore
#endif
