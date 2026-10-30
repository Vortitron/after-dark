#include "ad_core.h"
#include "ad_art.h"

#include <cstring>

namespace adcore {

Random rng;

Rect Surface::clip(Rect r) const {
  if (r.x < 0) {
    r.w += r.x;
    r.x = 0;
  }
  if (r.y < 0) {
    r.h += r.y;
    r.y = 0;
  }
  if (r.x + r.w > width())
    r.w = width() - r.x;
  if (r.y + r.h > height())
    r.h = height() - r.y;
  return r;
}

void Surface::fill_rect(int x, int y, int w, int h, Rgb c) {
  Rect r = clip({x, y, w, h});
  for (int j = 0; j < r.h; j++)
    for (int i = 0; i < r.w; i++)
      pixel(r.x + i, r.y + j, c);
}

void Surface::span(int x, int y, int n, const uint8_t *index, const uint8_t *palette) {
  for (int i = 0; i < n; i++) {
    const uint8_t *p = palette + 3 * index[i];
    pixel(x + i, y, {p[0], p[1], p[2]});
  }
}

const Sequence *Art::sequence(uint16_t id) const {
  for (int i = 0; i < sequence_count; i++)
    if (sequences[i].id == id)
      return &sequences[i];
  return nullptr;
}

Rect draw_frame(Surface &s, const Art &art, const Sequence &seq, int index, float cx, float cy) {
  const Frame &f = seq.frames[((index % seq.count) + seq.count) % seq.count];
  int x0 = round_half_up(cx - f.w / 2.0f);
  int y0 = round_half_up(cy - f.h / 2.0f);
  const int sw = s.width(), sh = s.height();
  const uint8_t *p = art.data + f.offset;
  for (int y = y0; y < y0 + f.h; y++) {
    int x = x0;
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
        /* Clip the span left and right. */
        int a = x < 0 ? -x : 0;
        int b = x + run > sw ? sw - x : run;
        if (b > a)
          s.span(x + a, y, b - a, p + a, art.palette);
      }
      x += run;
      p += run;
    }
  }
  return s.clip({x0, y0, f.w, f.h});
}

}  // namespace adcore
