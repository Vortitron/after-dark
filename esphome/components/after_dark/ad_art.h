#pragma once
/*
 * ad_art.h - ripped After Dark artwork as compiled in by tools/art2c.py, and
 * the blitter that draws it. See art2c.py for the run-length row format.
 */
#include "ad_core.h"

namespace adcore {

struct Frame {
  uint16_t w, h;
  uint32_t offset;  // into Art::data
};

struct Sequence {
  uint16_t id;
  uint16_t w, h;  // nominal size; each frame has its own tight box
  uint16_t count;
  const Frame *frames;
};

struct Art {
  const uint8_t *palette;  // RGB triples, entry 0 unused (transparent)
  uint16_t colours;
  const uint8_t *data;
  const Sequence *sequences;
  uint16_t sequence_count;

  const Sequence *sequence(uint16_t id) const;
};

/*
 * Draw frame `index` (wrapped) of `seq` centred on (cx, cy), as ad.js's
 * Sequence.draw does. Returns the on-screen box it covered, for erasing next
 * frame.
 */
Rect draw_frame(Surface &s, const Art &art, const Sequence &seq, int index, float cx, float cy);

}  // namespace adcore
