/*
 * ad_snake.cpp - Snake, a random maze and a snake that solves it. A port of
 * all/modules/snake.js, which was checked against SNAKE.AD under Wine; see
 * that file for what was measured and what was inferred.
 *
 * Defaults are the module's stored ones: Solution speed 0 (130 cells a
 * second), Maze complexity 0 (20 px cells), Pause when done 0 sec.
 *
 * The web version repaints the whole maze every frame; this draws it once
 * and then only the cell the snake moves into or backs out of.
 *
 * Small screens: the grid is laid out as the JS lays it, from 20 px cells
 * and a cell's margin, but with the cell shrunk with the screen's width
 * against 320 (8 px at 128 wide, never under 6) so there is still a maze; the
 * snake's inset and the markers outside the openings shrink with it. On a
 * 1-bit panel the snake and the markers are white, as the darker VGA
 * colours would dither to nothing. No character LCD version: a maze needs
 * a different glyph in nearly every cell and the panel has eight.
 */
#if defined(AD_SAVER_SNAKE) || defined(AD_ALL_SAVERS)
#include "ad_draw.h"

#include <vector>

namespace adcore {

namespace {

const float SPEED = 130;  // cells a second at Solution speed 0
/* The standard VGA colours bar black and white; one per maze. */
const Rgb COLOURS[] = {{128, 0, 0},     {0, 128, 0},   {128, 128, 0}, {0, 0, 128},   {128, 0, 128},
                       {0, 128, 128},   {192, 192, 192}, {128, 128, 128}, {255, 0, 0}, {0, 255, 0},
                       {255, 255, 0},   {0, 0, 255},   {255, 0, 255}, {0, 255, 255}};
const Rgb WHITE = {255, 255, 255};
const Rgb GREEN = {0, 255, 0}, RED = {255, 0, 0};

enum { N = 1, E = 2, S = 4, W = 8, SEEN = 16 };
const int DX[9] = {0, 0, 1, 0, 0, 0, 0, 0, -1};
const int DY[9] = {0, -1, 0, 0, 1, 0, 0, 0, 0};
int opp(int d) { return d == N ? S : d == S ? N : d == E ? W : E; }

void shuffled(int out[4]) {
  out[0] = N;
  out[1] = E;
  out[2] = S;
  out[3] = W;
  for (int i = 3; i > 0; i--) {
    int j = (int) floorf(rng.uniform() * (i + 1));
    int t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
}

struct End {
  int x, y, side;
};

/* Fills the ellipse in the box, by pixel centres, as a canvas fill does. */
void fill_oval(Surface &s, int x, int y, int w, int h, Rgb c) {
  float rx = w / 2.0f, ry = h / 2.0f, cx = x + rx, cy = y + ry;
  for (int py = y; py < y + h; py++) {
    float dy = (py + 0.5f - cy) / ry;
    float k = 1 - dy * dy;
    if (k <= 0)
      continue;
    float half = rx * sqrtf(k);
    int a = (int) ceilf(cx - half - 0.5f), b = (int) floorf(cx + half - 0.5f);
    s.fill_rect(a, py, b - a + 1, 1, c);
  }
}

class Snake : public Saver {
 public:
  float speed = SPEED;
  float pause = 0;

  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    mono_ = s.mono();
    int base = w_ >= 320 ? 20 : round_half_up(20.0f * w_ / 320);
    if (base < 6)
      base = 6;  // the least that leaves the snake 2 px and a gap each side
    cell_ = base;
    cols_ = (w_ - 2 * base) / base;
    rows_ = (h_ - base) / base;
    cols_ = cols_ < 2 ? 2 : cols_;
    rows_ = rows_ < 2 ? 2 : rows_;
    k_ = cell_ / 20.0f;
    inset_ = cell_ >= 10 ? 3 : 2;
    grid_.assign(cols_ * rows_, 0);
    visited_.assign(cols_ * rows_, 0);
    stack_.reserve(cols_ * rows_);
    trail_.reserve(cols_ * rows_);
    rebuild(s);
  }

  void frame(Surface &s, float dt) override {
    if (done_) {
      wait_ -= dt;
      if (wait_ <= 0)
        rebuild(s);
      return;
    }
    budget_ += dt * speed;
    while (budget_ >= 1 && !done_) {
      budget_ -= 1;
      move(s);
    }
    if (done_)
      budget_ = 0;
  }

 private:
  int at(int x, int y) const { return y * cols_ + x; }

  /* A perfect maze, recursive backtracker, every cell starting walled in. */
  void generate() {
    for (uint8_t &g : grid_)
      g = N | E | S | W;
    int cx = (int) floorf(rng.uniform() * cols_), cy = (int) floorf(rng.uniform() * rows_);
    stack_.clear();
    stack_.push_back(at(cx, cy));
    grid_[at(cx, cy)] |= SEEN;
    while (!stack_.empty()) {
      cx = stack_.back() % cols_;
      cy = stack_.back() / cols_;
      int dirs[4];
      shuffled(dirs);
      bool carved = false;
      for (int d : dirs) {
        int nx = cx + DX[d], ny = cy + DY[d];
        if (nx < 0 || ny < 0 || nx >= cols_ || ny >= rows_ || (grid_[at(nx, ny)] & SEEN))
          continue;
        grid_[at(cx, cy)] &= ~d;
        grid_[at(nx, ny)] &= ~opp(d);
        grid_[at(nx, ny)] |= SEEN;
        stack_.push_back(at(nx, ny));
        carved = true;
        break;
      }
      if (!carved)
        stack_.pop_back();
    }
  }

  /* Entrance and exit in opposite edges at random places. */
  void openings() {
    bool across = rng.uniform() < 0.5f;
    bool flip = rng.uniform() < 0.5f;
    End a, b;
    if (across) {
      a = {0, (int) floorf(rng.uniform() * rows_), W};
      b = {cols_ - 1, (int) floorf(rng.uniform() * rows_), E};
    } else {
      a = {(int) floorf(rng.uniform() * cols_), 0, N};
      b = {(int) floorf(rng.uniform() * cols_), rows_ - 1, S};
    }
    grid_[at(a.x, a.y)] &= ~a.side;
    grid_[at(b.x, b.y)] &= ~b.side;
    start_ = flip ? a : b;
    goal_ = flip ? b : a;
  }

  void rebuild(Surface &s) {
    /* +1: the original's lines sit one pixel right of and below centre. */
    ox_ = (w_ - cols_ * cell_) / 2 + 1;
    oy_ = (h_ - rows_ * cell_) / 2 + 1;
    generate();
    openings();
    for (uint8_t &v : visited_)
      v = 0;
    visited_[at(start_.x, start_.y)] = 1;
    trail_.clear();
    trail_.push_back(at(start_.x, start_.y));
    colour_ = COLOURS[rng.below(sizeof COLOURS / sizeof COLOURS[0])];
    if (mono_)
      colour_ = WHITE;
    budget_ = 0;
    done_ = false;
    wait_ = 0;
    draw_maze(s);
  }

  /* The fill of one cell. */
  Rect box(int i) const {
    int x = ox_ + (i % cols_) * cell_, y = oy_ + (i / cols_) * cell_;
    return {x + inset_, y + inset_, cell_ - 2 * inset_, cell_ - 2 * inset_};
  }
  static Rect join(Rect a, Rect b) {
    int x0 = a.x < b.x ? a.x : b.x, y0 = a.y < b.y ? a.y : b.y;
    int x1 = a.x + a.w > b.x + b.w ? a.x + a.w : b.x + b.w;
    int y1 = a.y + a.h > b.y + b.h ? a.y + a.h : b.y + b.h;
    return {x0, y0, x1 - x0, y1 - y0};
  }
  /* A cell's fill stretched out through its gap to the outer wall line. */
  Rect outward(const End &e) const {
    Rect b = box(at(e.x, e.y));
    int x1 = b.x + b.w, y1 = b.y + b.h;
    if (e.side == W)
      b.x = ox_;
    if (e.side == E)
      x1 = ox_ + cols_ * cell_ + 1;
    if (e.side == N)
      b.y = oy_;
    if (e.side == S)
      y1 = oy_ + rows_ * cell_ + 1;
    return {b.x, b.y, x1 - b.x, y1 - b.y};
  }
  /* The box just outside an opening: `depth` deep, `len` along the edge. */
  Rect outside(const End &e, int depth, int len) const {
    int x = ox_ + e.x * cell_, y = oy_ + e.y * cell_;
    int right = ox_ + cols_ * cell_, bottom = oy_ + rows_ * cell_;
    if (e.side == W)
      return {x - depth, y + 1, depth, len};
    if (e.side == E)
      return {right + 1, y + 1, depth, len};
    if (e.side == N)
      return {x + 1, y - depth, len, depth};
    return {x + 1, bottom + 1, len, depth};
  }

  void draw_maze(Surface &s) {
    s.clear();
    for (int y = 0; y < rows_; y++)
      for (int x = 0; x < cols_; x++) {
        int walls = grid_[at(x, y)];
        int px = ox_ + x * cell_, py = oy_ + y * cell_;
        if (walls & N)
          s.fill_rect(px, py, cell_ + 1, 1, WHITE);
        if (walls & W)
          s.fill_rect(px, py, 1, cell_ + 1, WHITE);
        if (y == rows_ - 1 && (walls & S))
          s.fill_rect(px, py + cell_, cell_ + 1, 1, WHITE);
        if (x == cols_ - 1 && (walls & E))
          s.fill_rect(px + cell_, py, 1, cell_ + 1, WHITE);
      }
    int d7 = round_half_up(7 * k_), d8 = round_half_up(8 * k_);
    s.fill(outside(start_, d7 < 1 ? 1 : d7, cell_ - 2), mono_ ? WHITE : GREEN);
    Rect r = outside(goal_, d8 < 2 ? 2 : d8, cell_ - 1);
    fill_oval(s, r.x, r.y, r.w, r.h, mono_ ? WHITE : RED);
    s.fill(outward(start_), colour_);
  }

  /* One move of the depth-first search: forward into a new cell or back. */
  void move(Surface &s) {
    int head = trail_.back();
    if (head == at(goal_.x, goal_.y)) {
      done_ = true;
      wait_ = pause;
      s.fill(outward(goal_), colour_);
      return;
    }
    int walls = grid_[head], hx = head % cols_, hy = head / cols_;
    int dirs[4];
    shuffled(dirs);
    for (int d : dirs) {
      if (walls & d)
        continue;
      int nx = hx + DX[d], ny = hy + DY[d];
      if (nx < 0 || ny < 0 || nx >= cols_ || ny >= rows_ || visited_[at(nx, ny)])
        continue;
      visited_[at(nx, ny)] = 1;
      trail_.push_back(at(nx, ny));
      s.fill(join(box(head), box(at(nx, ny))), colour_);
      return;
    }
    /* A dead end: back out, and take this cell's piece off the snake. */
    trail_.pop_back();
    if (trail_.empty()) {  // can't happen in a perfect maze; start again
      rebuild(s);
      return;
    }
    int back = trail_.back();
    s.fill(join(box(back), box(head)), BLACK);
    s.fill(box(back), colour_);
  }

  int w_ = 0, h_ = 0;
  bool mono_ = false;
  int cell_ = 20, cols_ = 2, rows_ = 2, inset_ = 3, ox_ = 0, oy_ = 0;
  float k_ = 1;
  std::vector<uint8_t> grid_, visited_;
  std::vector<uint16_t> stack_, trail_;
  End start_{0, 0, W}, goal_{0, 0, E};
  Rgb colour_ = WHITE;
  float budget_ = 0, wait_ = 0;
  bool done_ = false;
};

}  // namespace

Saver *make_snake() { return new Snake(); }

AD_REGISTER_SAVER("snake", make_snake, nullptr)

}  // namespace adcore
#endif
