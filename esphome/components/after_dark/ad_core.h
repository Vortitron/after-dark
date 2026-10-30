#pragma once
/*
 * ad_core.h - the part of the After Dark savers that knows nothing about
 * ESPHome, so the same code runs on the ESP32 and in esphome/host/render.
 *
 * A saver draws on a Surface. It is expected to erase only what it drew last
 * frame rather than clear the screen, because the ESPHome SPI drivers push
 * just the changed region to the panel and that is most of the frame rate.
 */
#include <cstdint>
#include <cmath>

namespace adcore {

struct Rgb {
  uint8_t r, g, b;
};

static const Rgb BLACK = {0, 0, 0};

struct Rect {
  int x, y, w, h;
  bool empty() const { return w <= 0 || h <= 0; }
};

class Surface {
 public:
  virtual ~Surface() = default;
  virtual int width() const = 0;
  virtual int height() const = 0;
  /* A 1-bit panel (an OLED): savers pick their baked black-and-white art. */
  virtual bool mono() const { return false; }
  /* In bounds; callers clip. */
  virtual void pixel(int x, int y, Rgb c) = 0;
  /* Clipped here, so savers can pass anything. */
  virtual void fill_rect(int x, int y, int w, int h, Rgb c);
  /* `n` pixels from palette indices, in bounds and none of them transparent. */
  virtual void span(int x, int y, int n, const uint8_t *index, const uint8_t *palette);

  void clear(Rgb c = BLACK) { fill_rect(0, 0, width(), height(), c); }
  void fill(const Rect &r, Rgb c) { fill_rect(r.x, r.y, r.w, r.h, c); }
  Rect clip(Rect r) const;
};

/* xorshift32. Savers use this rather than rand() so the host renderer can
   repeat a run exactly. */
class Random {
 public:
  /* Scrambled first (murmur3's finaliser), so nearby seeds don't start alike. */
  void seed(uint32_t s) {
    s ^= s >> 16;
    s *= 0x85ebca6bu;
    s ^= s >> 13;
    s *= 0xc2b2ae35u;
    s ^= s >> 16;
    state_ = s ? s : 0x9e3779b9u;
  }
  uint32_t next() {
    state_ ^= state_ << 13;
    state_ ^= state_ >> 17;
    state_ ^= state_ << 5;
    return state_;
  }
  /* [0, 1), as Math.random(). */
  float uniform() { return (next() >> 8) * (1.0f / 16777216.0f); }
  float range(float a, float b) { return a + uniform() * (b - a); }
  int below(int n) { return (int) (uniform() * n); }

 private:
  uint32_t state_ = 0x9e3779b9u;
};

extern Random rng;

/*
 * Whether a colour lights a pixel on a 1-bit panel. Baked mono art is pure
 * black and white so this is a threshold for it; anything in between gets an
 * ordered dither, which keeps erasing a sprite exact (no error to carry).
 */
inline bool mono_on(int x, int y, Rgb c) {
  static const uint8_t BAYER[4][4] = {{0, 8, 2, 10}, {12, 4, 14, 6}, {3, 11, 1, 9}, {15, 7, 13, 5}};
  int lum = (77 * c.r + 150 * c.g + 29 * c.b) >> 8;
  return lum > BAYER[y & 3][x & 3] * 14 + 16;
}

/* Math.round(): halves go up. */
inline int round_half_up(float v) { return (int) floorf(v + 0.5f); }

class Saver {
 public:
  virtual ~Saver() = default;
  /* Clear the surface and set up for its size. */
  virtual void start(Surface &s) = 0;
  /* Move on by `dt` seconds and draw. */
  virtual void frame(Surface &s, float dt) = 0;
};

class TextSaver;  // ad_text.h

struct SaverEntry {
  const char *name;
  Saver *(*make)();
  /* For a character LCD, or null if it has no version for one. */
  TextSaver *(*make_text)();
  const SaverEntry *next;
};

/*
 * Each saver registers itself from its own file, behind its AD_SAVER_<NAME>
 * build flag (or AD_ALL_SAVERS), so a firmware carries only what it asked for:
 *
 *   #if defined(AD_SAVER_WARP) || defined(AD_ALL_SAVERS)
 *   ...
 *   AD_REGISTER_SAVER("warp", make_warp, make_warp_text)
 *   #endif
 */
struct SaverRegistrar {
  explicit SaverRegistrar(SaverEntry *e);
};
/* A character-LCD-only build (AD_TEXT_ONLY) leaves the pixel savers
   unreferenced, so the linker drops them and their artwork. */
#ifdef AD_TEXT_ONLY
#define AD_PIXEL_SAVER(make) nullptr
#else
#define AD_PIXEL_SAVER(make) make
#endif
#define AD_REGISTER_SAVER(name, make, make_text) \
  static ::adcore::SaverEntry ad_entry_##make{name, AD_PIXEL_SAVER(make), make_text, nullptr}; \
  static ::adcore::SaverRegistrar ad_registrar_##make(&ad_entry_##make);

/* The savers in this build, in name order. */
const SaverEntry *first_saver();
const SaverEntry *find_saver(const char *name);

/*
 * The time of day, for the clocks. Whatever runs the savers sets the source
 * (ESPHome's time component, or the host's clock); without one, local_time()
 * returns false and a saver should show something that needs no clock.
 */
struct Clock {
  int year, month, day;  // month 1-12, day 1-31
  int weekday;           // 0 = Sunday
  int hour, minute, second;
};
extern bool (*time_source)(Clock &out);
inline bool local_time(Clock &out) { return time_source != nullptr && time_source(out); }

}  // namespace adcore
