#pragma once
/*
 * ad_draw.h - the drawing the code-drawn savers share. Integer coordinates,
 * clipped, no anti-aliasing (the originals had none either).
 */
#include "ad_core.h"

namespace adcore {

/* A pixel, clipped. */
inline void plot(Surface &s, int x, int y, Rgb c) {
  if (x >= 0 && y >= 0 && x < s.width() && y < s.height())
    s.pixel(x, y, c);
}

/* Bresenham, both ends included; `thick` > 1 draws a square pen. */
void line(Surface &s, int x0, int y0, int x1, int y1, Rgb c, int thick = 1);
void circle(Surface &s, int cx, int cy, int r, Rgb c);
void fill_circle(Surface &s, int cx, int cy, int r, Rgb c);
void ellipse(Surface &s, int cx, int cy, int rx, int ry, Rgb c);
void fill_ellipse(Surface &s, int cx, int cy, int rx, int ry, Rgb c);
/* Any simple polygon, even-odd, `n` <= 64 points as x0, y0, x1, y1, ... */
void fill_polygon(Surface &s, const int *xy, int n, Rgb c);
void polygon(Surface &s, const int *xy, int n, Rgb c);

/* HSV, h in [0, 360), s and v in [0, 1]. */
Rgb hsv(float h, float s, float v);
inline Rgb rgb(int r, int g, int b) { return {(uint8_t) r, (uint8_t) g, (uint8_t) b}; }
inline bool same(Rgb a, Rgb b) { return a.r == b.r && a.g == b.g && a.b == b.b; }

}  // namespace adcore
