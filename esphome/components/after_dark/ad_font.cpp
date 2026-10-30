#include "ad_font.h"

namespace adcore {

uint8_t next_latin1(const char *&s) {
  uint8_t c = (uint8_t) *s++;
  if (c < 0x80)
    return c;
  /* Two-byte UTF-8 covers Latin-1; anything longer becomes '?'. */
  int more = (c & 0xE0) == 0xC0 ? 1 : (c & 0xF0) == 0xE0 ? 2 : (c & 0xF8) == 0xF0 ? 3 : 0;
  uint32_t cp = more == 1 ? (c & 0x1F) : more == 2 ? (c & 0x0F) : (c & 0x07);
  for (int i = 0; i < more && (*s & 0xC0) == 0x80; i++)
    cp = (cp << 6) | (*s++ & 0x3F);
  return more && cp <= 0xFF ? (uint8_t) cp : '?';
}

int text_length(const char *utf8) {
  int n = 0;
  while (*utf8) {
    next_latin1(utf8);
    n++;
  }
  return n;
}

uint32_t glyph_row(const Font &f, uint8_t code, int row) {
  if (code < 0x20)
    code = '?';
  const uint8_t *p = f.bits + ((code - 0x20) * f.h + row) * f.stride;
  uint32_t v = 0;
  for (int i = 0; i < f.stride; i++)
    v = (v << 8) | p[i];
  return v << (32 - 8 * f.stride);
}

static int draw(Surface &s, const Font &f, int x, int y, const char *utf8, Rgb fg, const Rgb *bg, int scale) {
  int x0 = x;
  const int sw = s.width(), sh = s.height();
  while (*utf8) {
    uint8_t code = next_latin1(utf8);
    if (x >= sw)
      break;
    if (x + f.w * scale > 0) {
      if (bg)
        s.fill_rect(x, y, f.w * scale, f.h * scale, *bg);
      for (int r = 0; r < f.h; r++) {
        uint32_t bits = glyph_row(f, code, r);
        for (int c = 0; bits; c++, bits <<= 1) {
          if (!(bits & 0x80000000u))
            continue;
          if (scale == 1) {
            int px = x + c, py = y + r;
            if (px >= 0 && py >= 0 && px < sw && py < sh)
              s.pixel(px, py, fg);
          } else {
            s.fill_rect(x + c * scale, y + r * scale, scale, scale, fg);
          }
        }
      }
    }
    x += f.w * scale;
  }
  return x - x0;
}

int draw_text(Surface &s, const Font &f, int x, int y, const char *utf8, Rgb fg, int scale) {
  return draw(s, f, x, y, utf8, fg, nullptr, scale);
}

int draw_text_on(Surface &s, const Font &f, int x, int y, const char *utf8, Rgb fg, Rgb bg, int scale) {
  return draw(s, f, x, y, utf8, fg, &bg, scale);
}

}  // namespace adcore
