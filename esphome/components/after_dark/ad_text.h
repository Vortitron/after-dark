#pragma once
/*
 * ad_text.h - savers for character LCDs: the HD44780 1602 / 2004 sort, a grid
 * of 5x8 cells showing either a character from the controller's ROM or one of
 * eight glyphs the saver defines. Redefining a glyph changes every cell that
 * shows it at once, which is how the sprites here are animated.
 */
#include "ad_core.h"

namespace adcore {

class TextScreen {
 public:
  static const int MAX_COLS = 40;
  static const int MAX_ROWS = 4;
  static const int GLYPHS = 8;

  void begin(int cols, int rows);
  int cols() const { return cols_; }
  int rows() const { return rows_; }
  void clear();
  /* A ROM character code, or 0-7 for a defined glyph. Clipped. */
  void put(int col, int row, uint8_t code);
  /* Five bits a row (bit 4 is the left column), top row first. */
  void glyph(int slot, const uint8_t bits[8]);

  /* For whatever drives the panel. */
  uint8_t at(int col, int row) const { return chars_[row][col]; }
  const uint8_t *glyph_bits(int slot) const { return glyphs_[slot]; }
  bool glyph_changed(int slot) const { return glyph_dirty_ & (1 << slot); }
  /* Since mark_sent(): savers may clear and redraw every frame. */
  bool changed() const;
  void mark_sent();

 private:
  int cols_ = 16, rows_ = 2;
  uint8_t chars_[MAX_ROWS][MAX_COLS];
  uint8_t sent_[MAX_ROWS][MAX_COLS];
  uint8_t glyphs_[GLYPHS][8];
  uint8_t glyph_dirty_ = 0xFF;
};

class TextSaver {
 public:
  virtual ~TextSaver() = default;
  virtual void start(TextScreen &t) = 0;
  virtual void frame(TextScreen &t, float dt) = 0;
};

/*
 * Runs a pixel saver on a character LCD. It is a 1-bit Surface laid out like
 * the panel, cells 5x8 with a dot's gap between them (so 95x17 for a 1602),
 * and compose() turns it into characters: the eight cells with the most lit
 * get exact glyphs, the rest the nearest of a few ROM characters.
 */
class DotMatrix : public Surface {
 public:
  void begin(int cols, int rows);
  int width() const override { return cols_ * 6 - 1; }
  int height() const override { return rows_ * 9 - 1; }
  bool mono() const override { return true; }
  void pixel(int x, int y, Rgb c) override;
  void compose(TextScreen &t);

 private:
  int cols_ = 16, rows_ = 2;
  uint8_t cells_[TextScreen::MAX_ROWS][TextScreen::MAX_COLS][8];
};

/* A glyph from ASCII art, '#' lit: the five columns starting at `col`. */
void glyph_from_art(const char *const art[8], int col, uint8_t out[8]);

}  // namespace adcore
