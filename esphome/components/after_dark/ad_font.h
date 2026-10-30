#pragma once
/*
 * ad_font.h - fixed-width bitmap fonts (X11 misc-fixed, via tools/font2c.py)
 * for the savers that write: Latin-1, 0x20-0xFF. Include the size you want,
 * e.g. "ad_font_6x10.h" for font_6x10. Sizes: 4x6, 5x8, 6x10, 8x13, 8x13b,
 * 10x20.
 */
#include "ad_core.h"

namespace adcore {

struct Font {
  uint8_t w, h;
  uint8_t stride;  // bytes a row
  const uint8_t *bits;  // 224 glyphs from 0x20, h rows each, MSB the left column
};

/* The next character of a UTF-8 string as Latin-1 ('?' past 0xFF); advances `s`. */
uint8_t next_latin1(const char *&s);
int text_length(const char *utf8);

/* Draws `utf8` with its top-left at (x, y), lit pixels only; `scale` blows each
   dot up to a square. Clipped. Returns the width drawn. */
int draw_text(Surface &s, const Font &f, int x, int y, const char *utf8, Rgb fg, int scale = 1);
/* As draw_text, but filling the glyph boxes with `bg` too. */
int draw_text_on(Surface &s, const Font &f, int x, int y, const char *utf8, Rgb fg, Rgb bg, int scale = 1);
inline int text_width(const Font &f, const char *utf8, int scale = 1) { return text_length(utf8) * f.w * scale; }

/* One glyph's row as bits, MSB the left column of a 32-bit word. */
uint32_t glyph_row(const Font &f, uint8_t code, int row);

}  // namespace adcore
