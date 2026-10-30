/*
 * ad_photon.cpp - Photon, bursts of particles. A port of all/modules/photon.js,
 * which was checked against PHOTON.AD under Wine; see that file for what was
 * measured and what was inferred.
 *
 * Defaults are the module's: Length 16, Burst Delay 1 sec., Always Centered,
 * Mixed bursts.
 *
 * The web version moves the particles and samples their trails once a browser
 * frame; here that is once every 1/60 s on a fixed-step clock, so a trail
 * covers the same time whatever the frame rate. Rather than clear the screen
 * each frame it blacks out last frame's trails and draws the new ones, which
 * looks the same and keeps the SPI push to the trails.
 *
 * Small screens: the JS scales speeds by min(w, h) / 480 but never below 1, so
 * a tiny window gets the 320x240 speeds and a burst is gone in a blink. Below
 * 240 px this scales them by min(w, h) / 240 instead, so a burst crosses the
 * screen in the time it does at 320x240. On a 1-bit panel every particle is
 * white: the dithered palette colours break a 1-pixel line into dashes.
 */
#if defined(AD_SAVER_PHOTON) || defined(AD_ALL_SAVERS)
#include "ad_core.h"
#include "ad_draw.h"
#include "ad_text.h"

namespace adcore {

namespace {

const float PI = 3.14159265f;
const float STEPS = 60;
const int LENGTH = 16;   // trail, in steps
const float WAIT = 1;    // seconds between bursts
const bool CENTERED = true;
const int KIND = 0;      // 0 mixed, 1 photon, 2 electron, 3 proton, 4 neutrino
const int MAX_BURSTS = 4;
const int MAX_PARTS = 16;
const int TRAIL = LENGTH + 1;
/* The Windows static palette colours seen in a grab of the real module. */
const Rgb COLOURS[] = {{0xa0, 0xa0, 0xa4}, {0xc0, 0xc0, 0xc0}, {0x00, 0xff, 0x00}, {0xc0, 0xdc, 0xc0},
                       {0x00, 0xff, 0xff}, {0xff, 0x00, 0xff}, {0xff, 0xfb, 0xf0}, {0x00, 0x80, 0x80},
                       {0x80, 0x80, 0x00}, {0xff, 0xff, 0x00}, {0x80, 0x00, 0x80}, {0xff, 0x00, 0x00}};
const int NCOLOURS = sizeof(COLOURS) / sizeof(COLOURS[0]);

struct Part {
  float a, v, spin, orbit, wobble;
  Rgb colour;
  /* The trail as pixels, a ring of the last `len` places, oldest at `head`. */
  int16_t tx[TRAIL], ty[TRAIL];
  uint8_t head, len;
};

struct Burst {
  int kind;
  float x, y, t, life;
  int n;
  Part parts[MAX_PARTS];
};

class Photon : public Saver {
 public:
  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    float m = (float) (w_ < h_ ? w_ : h_);
    scale_ = m >= 240 ? (m / 480 > 1 ? m / 480 : 1) : m / 240;
    count_ = 0;
    next_ = 0;
    clock_ = 0;
    s.clear();
  }

  void frame(Surface &s, float dt) override {
    clock_ += dt;
    int n = 0;
    while (clock_ >= 1 / STEPS && n < 15) {
      clock_ -= 1 / STEPS;
      n++;
    }
    if (n == 15)
      clock_ = 0;
    if (n == 0)
      return;
    for (int i = 0; i < count_; i++)
      draw(s, bursts_[i], BLACK, true);
    for (int k = 0; k < n; k++)
      advance();
    for (int i = 0; i < count_; i++)
      draw(s, bursts_[i], {255, 255, 255}, s.mono());
  }

 private:
  void add() {
    Burst &b = bursts_[count_++];
    b.kind = KIND ? KIND : 1 + rng.below(4);
    b.x = CENTERED ? w_ / 2.0f : rng.range(w_ * 0.2f, w_ * 0.8f);
    b.y = CENTERED ? h_ / 2.0f : rng.range(h_ * 0.2f, h_ * 0.8f);
    b.t = 0;
    static const int COUNTS[] = {4, 8, 12, 16};
    b.n = COUNTS[rng.below(4)];
    for (int i = 0; i < b.n; i++) {
      Part &p = b.parts[i];
      p.a = (float) i / b.n * PI * 2 + rng.range(-0.05f, 0.05f);
      p.v = rng.range(90, 220) * scale_ * (b.kind == 4 ? 2.2f : 1);
      p.spin = rng.range(1.5f, 3.5f);
      p.spin *= rng.uniform() < 0.5f ? -1 : 1;
      p.orbit = rng.range(0.18f, 0.25f) * w_;
      p.wobble = rng.range(4, 9);
      p.colour = COLOURS[rng.below(NCOLOURS)];
      p.head = 0;
      p.len = 0;
    }
    b.life = b.kind == 2 ? rng.range(4, 7) : 8;
  }

  /* Where a particle is at time t into its burst, by the burst's kind. */
  static void place(const Burst &b, const Part &p, float t, float &x, float &y) {
    float a = p.a, r;
    if (b.kind == 1) {
      /* Photon: out, weaving side to side. */
      r = p.v * t;
      a += sinf(t * p.wobble) * 0.25f;
    } else if (b.kind == 2) {
      /* Electron: swings out to its orbit and goes round. */
      r = p.orbit * (t * 1.2f < 1 ? t * 1.2f : 1);
      a += p.spin * t;
    } else if (b.kind == 3) {
      /* Proton: spirals out. */
      r = p.v * t * 0.8f;
      a += p.spin * t * 0.6f;
    } else {
      r = p.v * t;
    }
    x = b.x + cosf(a) * r;
    y = b.y + sinf(a) * r;
  }

  /* One step of the original's frame: a new burst if one is due, then every
     particle moves on and its trail takes the new place. */
  void advance() {
    next_ -= 1 / STEPS;
    if (next_ <= 0 && count_ < MAX_BURSTS) {
      add();
      next_ = WAIT > 0.4f ? WAIT : 0.4f;
    }
    for (int i = count_ - 1; i >= 0; i--) {
      Burst &b = bursts_[i];
      b.t += 1 / STEPS;
      int gone = 0;
      for (int k = 0; k < b.n; k++) {
        Part &p = b.parts[k];
        float x, y;
        place(b, p, b.t, x, y);
        if (x < -50 || y < -50 || x > w_ + 50 || y > h_ + 50)
          gone++;
        /* Far off screen only matters for `gone`; keep the pixels in range. */
        x = x < -30000 ? -30000 : x > 30000 ? 30000 : x;
        y = y < -30000 ? -30000 : y > 30000 ? 30000 : y;
        int slot = (p.head + p.len) % TRAIL;
        p.tx[slot] = (int16_t) floorf(x);
        p.ty[slot] = (int16_t) floorf(y);
        if (p.len < TRAIL)
          p.len++;
        else
          p.head = (p.head + 1) % TRAIL;
      }
      if (gone == b.n || b.t > b.life) {
        for (int j = i; j < count_ - 1; j++)
          bursts_[j] = bursts_[j + 1];
        count_--;
      }
    }
  }

  /* Every trail of a burst, in its own colours or all in `c`. */
  void draw(Surface &s, const Burst &b, Rgb c, bool plain) const {
    for (int k = 0; k < b.n; k++) {
      const Part &p = b.parts[k];
      Rgb col = plain ? c : p.colour;
      if (p.len == 0)
        continue;
      int x0 = p.tx[p.head], y0 = p.ty[p.head];
      if (p.len == 1) {
        plot(s, x0, y0, col);
        continue;
      }
      for (int j = 1; j < p.len; j++) {
        int slot = (p.head + j) % TRAIL;
        int x1 = p.tx[slot], y1 = p.ty[slot];
        if (visible(x0, y0, x1, y1))
          line(s, x0, y0, x1, y1, col);
        x0 = x1;
        y0 = y1;
      }
    }
  }

  /* Whether a segment could touch the screen (it saves walking ones that can't). */
  bool visible(int x0, int y0, int x1, int y1) const {
    return !((x0 < 0 && x1 < 0) || (y0 < 0 && y1 < 0) || (x0 >= w_ && x1 >= w_) || (y0 >= h_ && y1 >= h_));
  }

  int w_ = 0, h_ = 0;
  float scale_ = 1, next_ = 0, clock_ = 0;
  int count_ = 0;
  Burst bursts_[MAX_BURSTS];
};

/* On a character LCD: the same bursts on a DotMatrix. */
class PhotonText : public TextSaver {
 public:
  void start(TextScreen &t) override {
    dots_.begin(t.cols(), t.rows());
    photon_.start(dots_);
    dots_.compose(t);
  }
  void frame(TextScreen &t, float dt) override {
    photon_.frame(dots_, dt);
    dots_.compose(t);
  }

 private:
  DotMatrix dots_;
  Photon photon_;
};

}  // namespace

Saver *make_photon() { return new Photon(); }
TextSaver *make_photon_text() { return new PhotonText(); }

AD_REGISTER_SAVER("photon", make_photon, make_photon_text)

}  // namespace adcore
#endif
