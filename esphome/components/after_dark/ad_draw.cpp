#include "ad_draw.h"

#include <cstdlib>

namespace adcore {

void line(Surface &s, int x0, int y0, int x1, int y1, Rgb c, int thick) {
  int dx = abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  int dy = -abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  int err = dx + dy;
  int h = thick / 2;
  for (;;) {
    if (thick <= 1)
      plot(s, x0, y0, c);
    else
      s.fill_rect(x0 - h, y0 - h, thick, thick, c);
    if (x0 == x1 && y0 == y1)
      break;
    int e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

void circle(Surface &s, int cx, int cy, int r, Rgb c) { ellipse(s, cx, cy, r, r, c); }
void fill_circle(Surface &s, int cx, int cy, int r, Rgb c) { fill_ellipse(s, cx, cy, r, r, c); }

/* Midpoint ellipse; `fill` draws spans instead of the four points. */
static void ellipse_impl(Surface &s, int cx, int cy, int rx, int ry, Rgb c, bool fill) {
  if (rx < 0 || ry < 0)
    return;
  if (rx == 0 || ry == 0) {
    s.fill_rect(cx - rx, cy - ry, 2 * rx + 1, 2 * ry + 1, c);
    return;
  }
  auto four = [&](int x, int y) {
    if (fill) {
      s.fill_rect(cx - x, cy - y, 2 * x + 1, 1, c);
      if (y)
        s.fill_rect(cx - x, cy + y, 2 * x + 1, 1, c);
    } else {
      plot(s, cx + x, cy + y, c);
      plot(s, cx - x, cy + y, c);
      plot(s, cx + x, cy - y, c);
      plot(s, cx - x, cy - y, c);
    }
  };
  long a2 = (long) rx * rx, b2 = (long) ry * ry;
  int x = 0, y = ry;
  long px = 0, py = 2 * a2 * y;
  long p = b2 - a2 * ry + a2 / 4;
  while (px < py) {
    four(x, y);
    x++;
    px += 2 * b2;
    if (p < 0) {
      p += b2 + px;
    } else {
      y--;
      py -= 2 * a2;
      p += b2 + px - py;
    }
  }
  p = (long) (b2 * (x + 0.5) * (x + 0.5) + a2 * (y - 1) * (y - 1) - a2 * b2);
  while (y >= 0) {
    four(x, y);
    y--;
    py -= 2 * a2;
    if (p > 0) {
      p += a2 - py;
    } else {
      x++;
      px += 2 * b2;
      p += a2 - py + px;
    }
  }
}

void ellipse(Surface &s, int cx, int cy, int rx, int ry, Rgb c) { ellipse_impl(s, cx, cy, rx, ry, c, false); }
void fill_ellipse(Surface &s, int cx, int cy, int rx, int ry, Rgb c) { ellipse_impl(s, cx, cy, rx, ry, c, true); }

void polygon(Surface &s, const int *xy, int n, Rgb c) {
  for (int i = 0; i < n; i++) {
    int j = (i + 1) % n;
    line(s, xy[2 * i], xy[2 * i + 1], xy[2 * j], xy[2 * j + 1], c);
  }
}

void fill_polygon(Surface &s, const int *xy, int n, Rgb c) {
  if (n < 3 || n > 64)
    return;
  int top = xy[1], bottom = xy[1];
  for (int i = 1; i < n; i++) {
    if (xy[2 * i + 1] < top)
      top = xy[2 * i + 1];
    if (xy[2 * i + 1] > bottom)
      bottom = xy[2 * i + 1];
  }
  if (top < 0)
    top = 0;
  if (bottom >= s.height())
    bottom = s.height() - 1;
  int xs[64];
  for (int y = top; y <= bottom; y++) {
    /* Sample at the pixel centre so shared edges don't double up. */
    float fy = y + 0.5f;
    int k = 0;
    for (int i = 0; i < n; i++) {
      int j = (i + 1) % n;
      float y0 = xy[2 * i + 1], y1 = xy[2 * j + 1];
      if ((y0 <= fy && y1 > fy) || (y1 <= fy && y0 > fy)) {
        float x0 = xy[2 * i], x1 = xy[2 * j];
        xs[k++] = (int) floorf(x0 + (fy - y0) / (y1 - y0) * (x1 - x0) + 0.5f);
      }
    }
    for (int a = 1; a < k; a++)
      for (int b = a; b > 0 && xs[b - 1] > xs[b]; b--) {
        int t = xs[b];
        xs[b] = xs[b - 1];
        xs[b - 1] = t;
      }
    for (int a = 0; a + 1 < k; a += 2)
      s.fill_rect(xs[a], y, xs[a + 1] - xs[a], 1, c);
  }
}

Rgb hsv(float h, float s, float v) {
  h = fmodf(h, 360);
  if (h < 0)
    h += 360;
  float c = v * s, x = c * (1 - fabsf(fmodf(h / 60, 2) - 1)), m = v - c;
  float r, g, b;
  if (h < 60) {
    r = c, g = x, b = 0;
  } else if (h < 120) {
    r = x, g = c, b = 0;
  } else if (h < 180) {
    r = 0, g = c, b = x;
  } else if (h < 240) {
    r = 0, g = x, b = c;
  } else if (h < 300) {
    r = x, g = 0, b = c;
  } else {
    r = c, g = 0, b = x;
  }
  return {(uint8_t) ((r + m) * 255 + 0.5f), (uint8_t) ((g + m) * 255 + 0.5f), (uint8_t) ((b + m) * 255 + 0.5f)};
}

}  // namespace adcore
