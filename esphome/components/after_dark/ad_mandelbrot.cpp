/*
 * ad_mandelbrot.cpp - Mandelbrot, zooming for ever into the set. A port of
 * all/modules/mandelbrot.js, which was checked against MANDELBR.AD under
 * Wine; see that file for what was measured and what was inferred.
 *
 * Defaults are the module's: Delay 5 sec, Colors Random, Blockiness 1.
 *
 * As in the JS: passes of 32, 16, 8, 4, 2 and 1-pixel blocks, a row at a time
 * from the top, painted over the last picture; three dives of 2-2.5x toward
 * a busy bit of edge near the middle, then the whole set again in new colours.
 *
 * Adapted for the ESP32 (the C3 has no FPU):
 * - The escape loop is fixed point (Q5.27, 32x32->64 multiplies) instead of
 *   doubles. The deepest picture is ~0.25 units across, so a pixel is
 *   thousands of times the 7.5e-9 step; the picture is the same. Bailing out
 *   when |zx| or |zy| passes 2 gives exactly the JS's count (either implies
 *   zx^2 + zy^2 > 4) and keeps the squares in range.
 * - The JS computes for 10 ms of each frame; here each frame gets a budget
 *   of iterations (about 10 ms' worth on a C3), so a picture fills in over
 *   a second or two at 128x64 rather than at desktop speed, and the work is
 *   checked a block at a time rather than a row at a time.
 * - Escape counts are kept a byte a pixel (they never reach 255 when the
 *   next target is picked from them, so this is exact): 77 KB at 320x240,
 *   8 KB at 128x64.
 * Caps Lock's change of colours has no key here.
 *
 * On a 1-bit panel the palette goes through the ordered dither, which keeps
 * the bands; there is no character-LCD version (the set is ~20 dots across
 * on a 1602's dot grid, and the dithered bands don't survive composing).
 */
#if defined(AD_SAVER_MANDELBROT) || defined(AD_ALL_SAVERS)
#include "ad_core.h"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <vector>

namespace adcore {

namespace {

const float WAIT = 5;     // Delay: 5 sec
const int BLOCK = 1;      // Blockiness: 1
const int FIRST = 32;     // the first pass's blocks
const int DIVES = 3;
/* Iterations a second of drawing, and at most a frame. */
const float RATE = 1.5e6f;
const long MAX_WORK = 60000;
/* What one escape costs besides its iterations, and painting a pixel. */
const int ESCAPE_COST = 12;
const int INSIDE = 255;  // counts_ for "never escapes"

/* Q5.27 */
const int FRAC = 27;
const int32_t TWO = 2 << FRAC;
const int32_t FOUR = 4 << FRAC;

inline int32_t fx(double v) { return (int32_t) llround(v * (double) (1 << FRAC)); }
inline int32_t mul(int32_t a, int32_t b) { return (int32_t) (((int64_t) a * b) >> FRAC); }

/* Escape count for c = (x, y), or -1 if it never leaves; `iters` gets the work. */
int escape(int32_t x, int32_t y, int max, long &iters) {
  /* Skip the main cardioid and the period-2 bulb outright. */
  int32_t xq = x - (TWO >> 3);  // x - 0.25
  int32_t y2 = mul(y, y);
  int32_t q = mul(xq, xq) + y2;
  if ((int64_t) q * (q + xq) < ((int64_t) y2 << (FRAC - 2)))
    return -1;
  int32_t x1 = x + (TWO >> 1);  // x + 1
  if (mul(x1, x1) + y2 < (TWO >> 5))  // 0.0625
    return -1;
  int32_t zx = 0, zy = 0, zx2 = 0, zy2 = 0;
  for (int i = 0; i < max; i++) {
    zy = (int32_t) (((int64_t) zx * zy) >> (FRAC - 1)) + y;
    zx = zx2 - zy2 + x;
    if (zx > TWO || zx < -TWO || zy > TWO || zy < -TWO) {
      iters += i + 1;
      return i;
    }
    zx2 = mul(zx, zx);
    zy2 = mul(zy, zy);
    if (zx2 + zy2 > FOUR) {
      iters += i + 1;
      return i;
    }
  }
  iters += max;
  return -1;
}

class Mandelbrot : public Saver {
 public:
  void start(Surface &s) override {
    bw_ = std::max(1, (s.width() + BLOCK - 1) / BLOCK);
    bh_ = std::max(1, (s.height() + BLOCK - 1) / BLOCK);
    counts_.assign((size_t) bw_ * bh_, 0);
    s.clear();
    home();
  }

  void frame(Surface &s, float dt) override {
    long budget = std::min(MAX_WORK, (long) (RATE * dt));
    long work = 0;
    double sx = span_ / bw_;
    while (size_ && work < budget) {
      if (col_ == 0) {
        /* A new row of blocks: where its sample points are. */
        x0_ = fx(cx_ - bw_ / 2.0 * sx + 0.5 * sx);
        dx_ = fx(sx);
        y_ = fx(cy_ - bh_ / 2.0 * sx + (row_ + 0.5) * sx);
      }
      int n = escape(x0_ + (int32_t) col_ * dx_, y_, max_, work);
      paint(s, col_, row_, n);
      work += ESCAPE_COST + size_ * size_ / 4;
      col_ += size_;
      if (col_ >= bw_) {
        col_ = 0;
        row_ += size_;
        if (row_ >= bh_) {
          row_ = 0;
          size_ = size_ > 1 ? size_ / 2 : 0;
        }
      }
    }
    if (size_)
      return;
    shown_ += dt;
    if (shown_ < WAIT)
      return;
    double tx, ty;
    bool found = depth_ < DIVES && target(tx, ty);
    depth_++;
    if (!found) {
      home();
    } else {
      cx_ = tx;
      cy_ = ty;
      span_ /= 2 + (double) rng.uniform() * 0.5;
      begin();
    }
  }

 private:
  void home() {
    cx_ = -0.63;
    cy_ = 0;
    /* The whole set across the width, as the original framed it at 1024x768. */
    span_ = std::max(3.67, 2.75 * bw_ / bh_);
    depth_ = 0;
    palette();
    begin();
  }

  void begin() {
    max_ = 120 + 60 * depth_;
    size_ = std::max(1, round_half_up((float) FIRST / BLOCK));
    row_ = col_ = 0;
    shown_ = 0;
    /* Wide bands for the first few counts, closer ones toward the edge. */
    lut_.resize(max_);
    for (int n = 0; n < max_; n++)
      lut_[n] = pal_[std::min(255, round_half_up(255 * sqrtf(n / 160.0f)))];
  }

  /* Random colours: four stops, 256 entries running once through them. */
  void palette() {
    Rgb stops[4];
    for (Rgb &c : stops)
      c = {(uint8_t) round_half_up(rng.uniform() * 255), (uint8_t) round_half_up(rng.uniform() * 255),
           (uint8_t) round_half_up(rng.uniform() * 255)};
    for (int i = 0; i < 256; i++) {
      float f = i / 256.0f * 3;
      int k = (int) floorf(f);
      float t = f - k;
      const Rgb &a = stops[k], &b = stops[k + 1];
      pal_[i] = {(uint8_t) round_half_up(a.r + (b.r - a.r) * t), (uint8_t) round_half_up(a.g + (b.g - a.g) * t),
                 (uint8_t) round_half_up(a.b + (b.b - a.b) * t)};
    }
  }

  /* One block of the current pass: its corner's count fills it. */
  void paint(Surface &s, int i, int j, int n) {
    int w = std::min(size_, bw_ - i), h = std::min(size_, bh_ - j);
    uint8_t v = n < 0 ? INSIDE : (uint8_t) std::min(n, 254);
    for (int y = j; y < j + h; y++)
      for (int x = i; x < i + w; x++)
        counts_[(size_t) y * bw_ + x] = v;
    s.fill_rect(i * BLOCK, j * BLOCK, w * BLOCK, h * BLOCK, n < 0 ? BLACK : lut_[n]);
  }

  /* Somewhere on the edge, near the middle: lots of escape, but slowly. */
  bool target(double &tx, double &ty) {
    long best = -1;
    float best_score = -1e30f;
    long last = (long) counts_.size() - 1;
    for (int tries = 0; tries < 400; tries++) {
      int i = (int) floorf(bw_ * (0.2f + rng.uniform() * 0.6f));
      int j = (int) floorf(bh_ * (0.2f + rng.uniform() * 0.6f));
      long k = (long) j * bw_ + i;
      int n = counts_[k];
      if (n == INSIDE)
        continue;
      /* Detail nearby means a mix of fast, slow and never escaping. */
      long mix = 0;
      int inside = 0;
      for (int dj = -3; dj <= 3; dj += 3)
        for (int di = -3; di <= 3; di += 3) {
          long kk = std::min(last, std::max(0L, k + (long) dj * bw_ + di));
          if (counts_[kk] == INSIDE)
            inside++;
          else
            mix += labs((long) counts_[kk] - n);
        }
      float score = n + mix * 0.5f + (inside > 0 && inside < 8 ? 60 : 0);
      if (score > best_score) {
        best_score = score;
        best = k;
      }
    }
    if (best < 0)
      return false;
    long px = best % bw_, py = best / bw_;
    tx = cx_ + ((double) px / bw_ - 0.5) * span_;
    ty = cy_ + ((double) py / bh_ - 0.5) * span_ * bh_ / bw_;
    return true;
  }

  int bw_ = 1, bh_ = 1;
  std::vector<uint8_t> counts_;
  std::vector<Rgb> lut_;
  Rgb pal_[256];
  double cx_ = 0, cy_ = 0, span_ = 1;
  int depth_ = 0, max_ = 120, size_ = 0, row_ = 0, col_ = 0;
  int32_t x0_ = 0, dx_ = 0, y_ = 0;
  float shown_ = 0;
};

}  // namespace

Saver *make_mandelbrot() { return new Mandelbrot(); }

AD_REGISTER_SAVER("mandelbrot", make_mandelbrot, nullptr)

}  // namespace adcore
#endif
