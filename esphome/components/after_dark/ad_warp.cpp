/*
 * ad_warp.cpp - Warp!, flying through the stars. A port of all/modules/warp.js,
 * which was checked against WARP.AD's own SetPixel calls under Wine; see that
 * file for what was measured and what was inferred.
 *
 * Defaults are the module's: Fast In, 71 stars, Small, no colour.
 */
#if defined(AD_SAVER_WARP) || defined(AD_ALL_SAVERS)
#include "ad_core.h"
#include "ad_text.h"

namespace adcore {

namespace {

/* Depth a frame for fast in .. fast out; a star is born at depth BIRTH. */
const int VELOCITY[] = {6, 4, 2, 1, -1, -2, -4, -6};
const float BIRTH = 100;
const float TURN = 3.14159265f / 100;
const float FPS = 30;
const int MAX_STARS = 200;
/* The EGA colours that read as stars. */
const Rgb COLOURS[] = {{255, 255, 255}, {255, 255, 85}, {85, 255, 255}, {255, 85, 85},
                       {85, 85, 255},   {255, 85, 255}, {85, 255, 85}};

struct Star {
  float x, y, z;
  bool big;
  Rgb rgb;
  /* Where it was last drawn and how big (0 = not drawn), to erase. */
  int16_t px, py;
  uint8_t drawn;
};

class Warp : public Saver {
 public:
  int velocity = VELOCITY[0];
  int count = 71;
  int size = 0;  // small, big, both
  bool colour = false;

  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    roll_ = 0;
    clock_ = 0;
    s.clear();
    /* Start in the steady state: each star already some way along. */
    for (int i = 0; i < count; i++) {
      Star &st = stars_[i];
      place(st);
      int steps = rng.below(400);
      for (int j = 0; j < steps; j++) {
        Star t = st;
        t.z = st.z + velocity;
        float x, y;
        if (!project(t, x, y))
          break;
        st.z = t.z;
      }
      st.drawn = 0;
    }
  }

  void frame(Surface &s, float dt) override {
    clock_ += dt;
    int n = 0;
    while (clock_ >= 1 / FPS && n < 5) {
      clock_ -= 1 / FPS;
      advance();
      n++;
    }
    if (n == 5)
      clock_ = 0;
    if (n == 0)
      return;

    for (int i = 0; i < count; i++) {
      Star &st = stars_[i];
      if (st.drawn)
        s.fill_rect(st.px, st.py, st.drawn, st.drawn, BLACK);
    }
    for (int i = 0; i < count; i++) {
      Star &st = stars_[i];
      float x, y;
      st.drawn = 0;
      if (!project(st, x, y))
        continue;
      st.px = (int16_t) floorf(x);
      st.py = (int16_t) floorf(y);
      st.drawn = st.big ? 2 : 1;
      s.fill_rect(st.px, st.py, st.drawn, st.drawn, st.rgb);
    }
  }

 private:
  /* A new star at the birth depth. Positions are in screen pixels as seen at
     that depth, before the roll. */
  void place(Star &s) {
    float hw = w_ / 2.0f, hh = h_ / 2.0f;
    s.z = BIRTH;
    if (velocity > 0) {
      /* Somewhere on the edge of the 15/16 box. */
      float bw = hw * 15 / 16, bh = hh * 15 / 16;
      float along = rng.uniform() * 2 * (bw + bh);
      float side = rng.uniform() < 0.5f ? -1 : 1;
      if (along < 2 * bw) {
        s.x = along - bw;
        s.y = side * bh;
      } else {
        s.x = side * bw;
        s.y = along - 2 * bw - bh;
      }
    } else {
      s.x = rng.range(-hw, hw) * 3 / 8;
      s.y = rng.range(-hh, hh) * 3 / 8;
    }
    /* Undo the roll so it is born where it was picked on screen. */
    float c = cosf(-roll_), n = sinf(-roll_);
    float x = s.x * c - s.y * n, y = s.x * n + s.y * c;
    s.x = x;
    s.y = y;
    s.big = size == 1 || (size == 2 && rng.uniform() < 0.5f);
    s.rgb = colour ? COLOURS[rng.below(7)] : COLOURS[0];
  }

  /* Where a star shows, or false once it has gone (into the hole, or off screen). */
  bool project(const Star &s, float &ox, float &oy) const {
    if (s.z <= 0)
      return false;
    float c = cosf(roll_), n = sinf(roll_);
    float k = BIRTH / s.z;
    float x = (s.x * c - s.y * n) * k, y = (s.x * n + s.y * c) * k;
    float sx = w_ / 1024.0f, sy = h_ / 768.0f;
    if (velocity > 0) {
      if (fabsf(x) < 25 * sx && y > -23 * sy && y < 19 * sy)
        return false;
    } else if (fabsf(x) > w_ / 2.0f || fabsf(y) > h_ / 2.0f) {
      return false;
    }
    ox = w_ / 2.0f + x;
    oy = h_ / 2.0f + y;
    return true;
  }

  /* One frame of the original: every star moves one step and the field turns. */
  void advance() {
    roll_ += velocity > 0 ? TURN : -TURN;
    for (int i = 0; i < count; i++) {
      Star &st = stars_[i];
      st.z += velocity;
      float x, y;
      if (!project(st, x, y))
        place(st);  // leaves px, py and drawn for frame() to erase
    }
  }

  int w_ = 0, h_ = 0;
  float roll_ = 0, clock_ = 0;
  Star stars_[MAX_STARS];
};

/* On a character LCD: the same stars on a DotMatrix, fewer of them. */
class WarpText : public TextSaver {
 public:
  void start(TextScreen &t) override {
    dots_.begin(t.cols(), t.rows());
    warp_.count = t.cols() * t.rows() * 2 / 5;
    warp_.velocity = -4;
    warp_.start(dots_);
    dots_.compose(t);
  }
  void frame(TextScreen &t, float dt) override {
    warp_.frame(dots_, dt);
    dots_.compose(t);
  }

 private:
  DotMatrix dots_;
  Warp warp_;
};

}  // namespace

Saver *make_warp() { return new Warp(); }
TextSaver *make_warp_text() { return new WarpText(); }

AD_REGISTER_SAVER("warp", make_warp, make_warp_text)

}  // namespace adcore
#endif
