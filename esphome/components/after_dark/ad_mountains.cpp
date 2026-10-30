/*
 * ad_mountains.cpp - Mountains, fractal landscapes of the nine planets. A port
 * of all/modules/mountains.js, which was checked against MOUNTAIN.AD under
 * Wine; see that file for what was measured and what was inferred.
 *
 * Defaults are the web version's: View Random, Water Image Surface, Planet
 * Random, Complexity Medium (a 64-cell grid), Zoom Medium. Each landscape is
 * drawn a grid row at a time from the back on a black sky, then stays up for
 * 60 seconds before the next.
 *
 * Adapted:
 * - The terrain (diamond-square) is made in 16.16 fixed point rather than
 *   floats (17 KB for the 65x65 grid), so a new
 *   landscape costs next to nothing on a chip with no FPU. The heights are
 *   normalised to 0..1 as in the JS; drawing uses floats.
 * - The JS draws a row per animation frame, about 60 a second in a browser;
 *   here that is a fixed 60 rows a second (at most 3 a frame), so a landscape
 *   takes about a second.
 * - Canvas anti-aliases; here the corners are rounded to pixels and each
 *   facet is filled and outlined in its own colour (as the JS fills and
 *   strokes it), so neighbouring facets meet without gaps.
 * - The Surface water's faint grid (8% white stroked over the sea) is that
 *   blend worked out over the sea colour, and Sheet water (45% sea over
 *   whatever is behind) is taken over black, as there is no reading back.
 * On a 1-bit panel the colours go through the ordered dither, which keeps the
 * facets' shading. No character-LCD version: 17 dots of height is no
 * landscape.
 */
#if defined(AD_SAVER_MOUNTAINS) || defined(AD_ALL_SAVERS)
#include "ad_core.h"
#include "ad_draw.h"

#include <algorithm>
#include <cmath>
#include <vector>

namespace adcore {

namespace {

enum View { BOUNDARIES, WEBS, MOUNTAINS, CONSTRUCTIONS, HIGHLANDS, VIEW_RANDOM };
enum Water { FRAME, SHELL, SHEET, SURFACE, SOLID, WATER_RANDOM };

const int SIZE[] = {5, 6, 7};  // Complexity low, medium, high: 2^n cells
const float DISTANCE[] = {1.5f, 1.15f, 0.85f};  // Zoom far, medium, near
const float ROWS_PER_SECOND = 60;
/* At most this many rows a frame, so a slow frame doesn't make the next slower. */
const int MAX_ROWS_PER_FRAME = 3;
const float REST = 60;

/* Low ground, high ground, peaks, sea (or none), and how much is under water. */
struct World {
  Rgb land[3];
  bool has_sea;
  Rgb sea;
  float level;
};
const World WORLDS[] = {
    {{{0x4a, 0x46, 0x44}, {0x8a, 0x84, 0x7c}, {0xd6, 0xd0, 0xc4}}, false, {0, 0, 0}, 0},           // mercury
    {{{0x6a, 0x4a, 0x10}, {0xc8, 0x9a, 0x3a}, {0xf2, 0xdc, 0x90}}, true, {0xa8, 0x54, 0x1a}, 0.3f},  // venus
    {{{0x2e, 0x6a, 0x24}, {0x7a, 0x6a, 0x3c}, {0xf4, 0xf4, 0xf4}}, true, {0x1c, 0x4c, 0xa0}, 0.42f},  // earth
    {{{0x6a, 0x20, 0x0e}, {0xb4, 0x4a, 0x22}, {0xe8, 0xa0, 0x70}}, false, {0, 0, 0}, 0},           // mars
    {{{0x7a, 0x4a, 0x2a}, {0xd8, 0xa8, 0x70}, {0xf4, 0xe8, 0xd0}}, true, {0xa8, 0x6a, 0x3a}, 0.5f},  // jupiter
    {{{0x6a, 0x5a, 0x3a}, {0xc8, 0xb0, 0x7a}, {0xf4, 0xea, 0xd0}}, true, {0x9a, 0x8a, 0x5a}, 0.35f},  // saturn
    {{{0x2a, 0x6a, 0x70}, {0x6a, 0xc0, 0xc4}, {0xd0, 0xf4, 0xf4}}, true, {0x1a, 0x8a, 0x9a}, 0.45f},  // uranus
    {{{0x10, 0x1c, 0x6a}, {0x3a, 0x5a, 0xc8}, {0xa8, 0xc0, 0xf4}}, true, {0x1a, 0x2a, 0xa0}, 0.5f},  // neptune
    {{{0x5a, 0x5a, 0x6a}, {0xa8, 0xaa, 0xb8}, {0xf4, 0xf6, 0xff}}, true, {0x88, 0x90, 0xa8}, 0.2f},  // pluto
};
const int PLANETS = sizeof(WORLDS) / sizeof(WORLDS[0]);

/* [-scale, scale), as rand(-1, 1) * scale with scale in 16.16. */
inline int32_t jitter(int32_t scale) { return (int32_t) (((int64_t) (int32_t) rng.next() * scale) >> 31); }

inline uint8_t clamp8(float v) { return (uint8_t) std::max(0, std::min(255, round_half_up(v))); }

inline float clampf(float v, float lo, float hi) { return std::max(lo, std::min(hi, v)); }

class Mountains : public Saver {
 public:
  int view = VIEW_RANDOM;
  int water = SURFACE;
  int planet = -1;  // random
  int complexity = 1;
  int zoom = 1;

  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    /* A 64-cell grid on a small 1-bit panel is dither mush: the low one (32
       cells) reads at 128 wide, and 16 below 100. */
    size_ = 1 << (!s.mono() || w_ >= 200 ? SIZE[complexity] : w_ >= 100 ? SIZE[0] : SIZE[0] - 1);
    int n = size_ + 1;
    map_.assign((size_t) n * n, 0);
    /* The grid's projection by row: scale across, ground line, height scale. */
    across_.resize(n);
    ground_.resize(n);
    lift_.resize(n);
    float near = 1.15f / DISTANCE[zoom];
    for (int gy = 0; gy < n; gy++) {
      float Y = 1 - (float) gy / size_;
      float depth = 1 + Y * 0.8f;
      across_[gy] = w_ * 1.5f * near / depth;
      ground_[gy] = h_ * 0.30f + h_ * 0.72f * powf(1 - Y, 1.4f);
      lift_[gy] = h_ * 0.32f * near / depth;
    }
    begin(s);
  }

  void frame(Surface &s, float dt) override {
    if (row_ < size_) {
      due_ += dt * ROWS_PER_SECOND;
      for (int n = 0; due_ >= 1 && row_ < size_ && n < MAX_ROWS_PER_FRAME; n++) {
        due_ -= 1;
        draw_row(s, row_++);
      }
      if (due_ >= 1)
        due_ = 0;
      if (row_ >= size_)
        finish(s);
      return;
    }
    rest_ += dt;
    if (rest_ > REST)
      begin(s);
  }

 private:
  struct Pt {
    float x, y;
  };

  void begin(Surface &s) {
    v_ = view == VIEW_RANDOM ? rng.below(5) : view;
    wv_ = water == WATER_RANDOM ? rng.below(5) : water;
    world_ = &WORLDS[planet < 0 ? rng.below(PLANETS) : planet];
    terrain(rng.range(0.55f, 0.7f));
    row_ = 0;
    due_ = 0;
    rest_ = 0;
    /* The original's sky is plain black. */
    s.clear();
  }

  /* Midpoint displacement - diamond-square - on the (2^n + 1) grid, 0..1. */
  void terrain(float rough) {
    const int n = size_ + 1;
    int32_t *h = map_.data();
    auto at = [&](int x, int y) -> int32_t & { return h[y * n + x]; };
    const int32_t ONE = 1 << 16;
    at(0, 0) = rng.next() >> 16;
    at(size_, 0) = rng.next() >> 16;
    at(0, size_) = rng.next() >> 16;
    at(size_, size_) = rng.next() >> 16;
    int32_t scale = ONE, r = (int32_t) (rough * ONE);
    for (int step = size_; step > 1; step /= 2) {
      int half = step / 2;
      for (int y = half; y < n; y += step)
        for (int x = half; x < n; x += step)
          at(x, y) = (at(x - half, y - half) + at(x + half, y - half) + at(x - half, y + half) +
                      at(x + half, y + half)) / 4 + jitter(scale);
      for (int y = 0; y < n; y += half)
        for (int x = (y / half) % 2 ? 0 : half; x < n; x += step) {
          int32_t sum = 0, cnt = 0;
          if (y >= half) sum += at(x, y - half), cnt++;
          if (y + half < n) sum += at(x, y + half), cnt++;
          if (x >= half) sum += at(x - half, y), cnt++;
          if (x + half < n) sum += at(x + half, y), cnt++;
          at(x, y) = sum / cnt + jitter(scale);
        }
      scale = (int32_t) (((int64_t) scale * r) >> 16);
    }
    int32_t lo = h[0], hi = h[0];
    for (int i = 0; i < n * n; i++) {
      lo = std::min(lo, h[i]);
      hi = std::max(hi, h[i]);
    }
    int64_t inv = ((int64_t) 65535 << 16) / std::max<int32_t>(1, hi - lo);
    for (int i = 0; i < n * n; i++)
      h[i] = (int32_t) (((int64_t) (h[i] - lo) * inv) >> 16);
  }

  float height(int gx, int gy) const { return map_[(size_t) gy * (size_ + 1) + gx] * (1.0f / 65535); }

  /* Grid point to screen: the grid lies flat, seen from above the near edge. */
  Pt project(int gx, int gy, float z) const {
    float X = (float) gx / size_ - 0.5f;
    return {w_ / 2.0f + X * across_[gy], ground_[gy] - z * lift_[gy]};
  }

  Rgb colour(float z, float light) const {
    const Rgb *land = world_->land;
    float t = clampf(z, 0, 1), k;
    Rgb a, b;
    if (t < 0.5f) {
      a = land[0], b = land[1], k = t / 0.5f;
    } else {
      a = land[1], b = land[2], k = std::max(0.0f, (t - 0.5f) / 0.5f);
      k = k * k;
    }
    return {clamp8((a.r + (b.r - a.r) * k) * light), clamp8((a.g + (b.g - a.g) * k) * light),
            clamp8((a.b + (b.b - a.b) * k) * light)};
  }

  static int px(float v) { return round_half_up(v); }

  void tri(Surface &s, Pt a, Pt b, Pt c, Rgb col) {
    int xy[6] = {px(a.x), px(a.y), px(b.x), px(b.y), px(c.x), px(c.y)};
    fill_polygon(s, xy, 3, col);
    polygon(s, xy, 3, col);
  }

  void quad(Surface &s, const Pt *p, bool fill, Rgb fc, Rgb stroke) {
    int xy[8];
    for (int i = 0; i < 4; i++) {
      xy[2 * i] = px(p[i].x);
      xy[2 * i + 1] = px(p[i].y);
    }
    if (fill)
      fill_polygon(s, xy, 4, fc);
    polygon(s, xy, 4, stroke);
  }

  /* fillRect at a fractional place: the pixels whose centres it covers. */
  static void rect(Surface &s, float x, float y, float w, float h, Rgb c) {
    int x0 = px(x), y0 = px(y), x1 = px(x + w), y1 = px(y + h);
    s.fill_rect(std::min(x0, x1), std::min(y0, y1), std::abs(x1 - x0), std::abs(y1 - y0), c);
  }

  /* One row of the grid, from the back forward. */
  void draw_row(Surface &s, int gy) {
    float lvl = world_->has_sea ? world_->level : -1;
    for (int gx = 0; gx < size_; gx++) {
      float zs[4] = {std::max(height(gx, gy), lvl), std::max(height(gx + 1, gy), lvl),
                     std::max(height(gx + 1, gy + 1), lvl), std::max(height(gx, gy + 1), lvl)};
      Pt pts[4] = {project(gx, gy, zs[0]), project(gx + 1, gy, zs[1]), project(gx + 1, gy + 1, zs[2]),
                   project(gx, gy + 1, zs[3])};
      bool wet = lvl >= 0 && height(gx, gy) <= lvl && height(gx + 1, gy + 1) <= lvl;
      float avg = (zs[0] + zs[1] + zs[2] + zs[3]) / 4;
      /* Light from the left and behind: brighter where the ground faces it. */
      float slope = (zs[0] + zs[3] - zs[1] - zs[2]) * 3 + (zs[0] + zs[1] - zs[2] - zs[3]) * 2;
      float light = clampf(0.85f + slope, 0.35f, 1.3f);
      if (wet) {
        sea(s, pts);
        continue;
      }
      switch (v_) {
        case MOUNTAINS: {
          /* Two flat-shaded triangles a cell, as the original's facets are. */
          float l1 = clampf(0.85f + (zs[0] - zs[1]) * 4 + (zs[0] - zs[3]) * 3, 0.35f, 1.3f);
          float l2 = clampf(0.85f + (zs[3] - zs[2]) * 4 + (zs[1] - zs[2]) * 3, 0.35f, 1.3f);
          tri(s, pts[0], pts[1], pts[3], colour((zs[0] + zs[1] + zs[3]) / 3, l1));
          tri(s, pts[1], pts[2], pts[3], colour((zs[1] + zs[2] + zs[3]) / 3, l2));
          break;
        }
        case WEBS: {
          Rgb c = colour(avg, 1.1f);
          quad(s, pts, false, c, c);
          break;
        }
        case BOUNDARIES: {
          /* Only where the height crosses a contour. */
          int band = (int) floorf(zs[0] * 10);
          if (band != (int) floorf(zs[1] * 10) || band != (int) floorf(zs[3] * 10)) {
            Rgb c = colour(band / 10.0f, 1.2f);
            s.fill_rect((int) floorf(pts[0].x), (int) floorf(pts[0].y), 2, 2, c);
            s.fill_rect((int) floorf((pts[0].x + pts[1].x) / 2), (int) floorf((pts[0].y + pts[1].y) / 2), 2, 2, c);
          }
          break;
        }
        case CONSTRUCTIONS: {
          /* Columns standing on the plain, each as high as its ground. */
          Pt base = project(gx, gy, lvl < 0 ? 0 : lvl), top = pts[0];
          float wide = pts[1].x - pts[0].x;
          rect(s, top.x, top.y, wide * 0.8f, base.y - top.y, colour(zs[0], light * 0.8f));
          rect(s, top.x, top.y - 2, wide * 0.8f, 3, colour(zs[0], 1.25f));
          break;
        }
        default: {
          /* Highlands: the ground as points, thicker where it is high. */
          int r = std::max(1, px(1 + avg * 2.5f));
          s.fill_rect((int) floorf(pts[0].x), (int) floorf(pts[0].y), r, r, colour(avg, light));
          break;
        }
      }
    }
  }

  void sea(Surface &s, const Pt *pts) {
    Rgb c = world_->sea;
    switch (wv_) {
      case FRAME:
        return;
      case SHELL:
        quad(s, pts, false, c, c);
        return;
      case SHEET: {
        Rgb d = {clamp8(c.r * 0.45f), clamp8(c.g * 0.45f), clamp8(c.b * 0.45f)};
        quad(s, pts, true, d, d);
        return;
      }
      case SOLID:
        quad(s, pts, true, c, c);
        return;
      default: {
        Rgb e = {clamp8(c.r + (255 - c.r) * 0.08f), clamp8(c.g + (255 - c.g) * 0.08f),
                 clamp8(c.b + (255 - c.b) * 0.08f)};
        quad(s, pts, true, c, e);
        return;
      }
    }
  }

  /* Frame and Solid water draw round the edge of the sea once the land is done. */
  void finish(Surface &s) {
    if (!world_->has_sea)
      return;
    float lvl = world_->level;
    Pt a = project(0, 0, lvl), b = project(size_, 0, lvl), c = project(size_, size_, lvl),
       d = project(0, size_, lvl);
    if (wv_ == FRAME) {
      Pt p[4] = {a, b, c, d};
      for (int i = 0; i < 4; i++) {
        const Pt &u = p[i], &v = p[(i + 1) % 4];
        line(s, px(u.x), px(u.y), px(v.x), px(v.y), world_->sea, 2);
      }
    } else if (wv_ == SOLID) {
      /* The front of the slab of water. */
      Pt down = project(0, size_, 0);
      Rgb sc = world_->sea;
      rect(s, d.x, d.y, c.x - d.x, std::max(4.0f, down.y - d.y),
           {clamp8(sc.r * 0.55f), clamp8(sc.g * 0.55f), clamp8(sc.b * 0.55f)});
    }
  }

  int w_ = 0, h_ = 0, size_ = 64;
  std::vector<int32_t> map_;
  std::vector<float> across_, ground_, lift_;
  int v_ = MOUNTAINS, wv_ = SURFACE;
  const World *world_ = &WORLDS[2];
  int row_ = 0;
  float due_ = 0, rest_ = 0;
};

}  // namespace

Saver *make_mountains() { return new Mountains(); }

AD_REGISTER_SAVER("mountains", make_mountains, nullptr)

}  // namespace adcore
#endif
