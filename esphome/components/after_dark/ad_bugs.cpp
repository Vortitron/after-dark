/*
 * ad_bugs.cpp - Bugs, on BUGS.AD's own artwork. A port of all/modules/bugs.js;
 * see that file for what is known of the module (it would not run under Wine,
 * so the walking is the web port's, not measured).
 *
 * Defaults are the web port's: Bug Density Swarm (35 bugs), Bug Type All
 * (jewel, ants, flys, scarab, roaches, ladybugs; no spiders, as there), Clear
 * screen first on.
 *
 * Jewel, ants and flys pick a pre-drawn heading and mirror it, as on the web.
 * Scarab, roaches and ladybugs are turned to their heading; the canvas does
 * that with smoothing, here it is nearest-pixel, so the turned ones are a
 * little jaggier than in a browser.
 *
 * The art headers hold only the frames the saver draws: 4000 and 6000 without
 * the fifteen spider-leg frames at the end, 1000 with the first three frames
 * of each heading's eight (so its stride is 3 here, 8 on the web), 5000 with
 * its first three. That cut-down index is esphome/tools/index/bugs.json:
 *
 *   art2c.py all/art/bugs bugs --index esphome/tools/index/bugs.json -o ad_art_bugs.h
 *   art2c.py all/art/bugs bugs_mN --index esphome/tools/index/bugs.json \
 *       --scale 1/N --mono --threshold 30 --edge 70 -o ad_art_bugs_mN.h
 *
 * The low threshold is because ants and ladybugs are dark red: at the usual
 * 110 they vanish. At 30 every bug is a solid silhouette with its legs, which
 * is what reads at 128x64.
 *
 * On a 1-bit panel the bugs are the baked art at 1/2, 1/3 or 1/4 size to suit
 * the screen (as ad_toasters.cpp chooses), with speeds and the wrap margin
 * shrunk to match and fewer of them (35 at a third size would be a carpet).
 * No character LCD version: a bug turning in one 5x8 cell is not the module.
 */
#if defined(AD_SAVER_BUGS) || defined(AD_ALL_SAVERS)
#include "ad_art.h"
#ifndef AD_MONO_ONLY  // a 1-bit build leaves the colour art out
#include "ad_art_bugs.h"
#endif
#ifndef AD_COLOUR_ONLY  // a colour build leaves the 1-bit art out
#include "ad_art_bugs_m2.h"
#include "ad_art_bugs_m3.h"
#include "ad_art_bugs_m4.h"
#endif

#include <vector>

namespace adcore {

namespace {

const float PI = 3.14159265f;
const float Q = PI / 2;

/* As SPECIES in bugs.js: headings x phases frames from `first`, `stride`
   apart; `facing` is the screen angle a single-heading strip is drawn at. */
struct Species {
  uint16_t id;
  uint8_t headings, phases, first, stride;
  float speed, step, facing;
};
const Species SPECIES[] = {
    {4000, 20, 2, 0, 2, 26, 9, 0},       // jewel
    {6000, 20, 2, 0, 2, 34, 12, 0},      // ants
    {1000, 5, 3, 0, 3, 96, 22, 0},       // flys (stride 8 in the full strip)
    {2000, 1, 24, 0, 24, 20, 10, -Q},    // scarab
    {3000, 1, 9, 0, 9, 58, 16, PI},      // roaches
    {5000, 1, 3, 0, 3, 22, 8, -Q},       // ladybugs
};
const int KINDS = sizeof(SPECIES) / sizeof(SPECIES[0]);

const float TURN = 1.5f;   // radians per second a bug can swing round
const float WANDER = 0.9f; // how often it picks a new direction

struct Variant {
  const Art *art;
  float scale;
  bool mono;
  int min_height;
};
const Variant VARIANTS[] = {
#ifndef AD_MONO_ONLY
    {&art_bugs::ART, 1, false, 0},
#endif
#ifndef AD_COLOUR_ONLY
    {&art_bugs_m2::ART, 1 / 2.0f, true, 96},
    {&art_bugs_m3::ART, 1 / 3.0f, true, 48},
    {&art_bugs_m4::ART, 1 / 4.0f, true, 0},
#endif
};

/* Unpack one frame's run-length rows into w*h palette indices, 0 clear. */
void decode(const Art &art, const Frame &f, uint8_t *out) {
  const uint8_t *p = art.data + f.offset;
  for (int y = 0; y < f.h; y++) {
    uint8_t *row = out + y * f.w;
    for (int x = 0; x < f.w; x++)
      row[x] = 0;
    int x = 0;
    for (;;) {
      uint8_t skip = *p++, run = *p++;
      if (run == 0) {
        if (skip == 0)
          break;
        x += skip;
        continue;
      }
      x += skip;
      for (int i = 0; i < run; i++, x++)
        if (x >= 0 && x < f.w)
          row[x] = p[i];
      p += run;
    }
  }
}

inline void put(Surface &s, int x, int y, const uint8_t *palette, uint8_t index) {
  if (index && x >= 0 && y >= 0 && x < s.width() && y < s.height()) {
    const uint8_t *c = palette + 3 * index;
    s.pixel(x, y, {c[0], c[1], c[2]});
  }
}

struct Bug {
  int kind;
  float x, y, angle, want, next, phase;
};

class Bugs : public Saver {
 public:
  int count = 35;  // Swarm

  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    variant_ = &VARIANTS[0];
    if (s.mono()) {
      for (const Variant &v : VARIANTS)
        if (v.mono && h_ >= v.min_height) {
          variant_ = &v;
          break;
        }
    }
    kinds_n_ = 0;
    size_t biggest = 0;
    for (int k = 0; k < KINDS; k++) {
      const Sequence *seq = variant_->art->sequence(SPECIES[k].id);
      if (!seq)
        continue;
      seq_[k] = seq;
      kinds_[kinds_n_++] = k;
      for (int i = 0; i < seq->count; i++) {
        size_t n = (size_t) seq->frames[i].w * seq->frames[i].h;
        if (n > biggest)
          biggest = n;
      }
    }
    buf_.assign(biggest, 0);

    int n = count;
    if (variant_->scale < 1) {
      n = (int) roundf(count * variant_->scale * 1.5f);
      if (n < 3)
        n = 3;
    }
    bugs_.assign(kinds_n_ ? n : 0, Bug{});
    drawn_.assign(bugs_.size(), Rect{0, 0, 0, 0});
    for (Bug &b : bugs_)
      b = spawn();
    s.clear();
  }

  void frame(Surface &s, float dt) override {
    const float speed_scale = variant_->scale;
    for (Bug &b : bugs_) {
      const Species &sp = SPECIES[b.kind];
      b.next -= dt;
      if (b.next <= 0) {
        b.want = b.angle + rng.range(-1.4f, 1.4f);
        b.next = rng.range(WANDER * 0.4f, WANDER * 2);
      }
      float diff = fmodf(b.want - b.angle + PI * 3, PI * 2) - PI;
      float lim = TURN * dt;
      b.angle += diff < -lim ? -lim : diff > lim ? lim : diff;

      b.x += cosf(b.angle) * sp.speed * speed_scale * dt;
      b.y += sinf(b.angle) * sp.speed * speed_scale * dt;
      b.phase += sp.step * dt;

      // Off one edge, on at the other, the way they crawl over a desktop.
      float pad = seq_[b.kind]->w;
      if (b.x < -pad)
        b.x = w_ + pad;
      else if (b.x > w_ + pad)
        b.x = -pad;
      if (b.y < -pad)
        b.y = h_ + pad;
      else if (b.y > h_ + pad)
        b.y = -pad;
    }

    for (const Rect &r : drawn_)
      s.fill(r, BLACK);
    for (size_t i = 0; i < bugs_.size(); i++)
      drawn_[i] = draw(s, bugs_[i]);
  }

 private:
  Bug spawn() {
    Bug b;
    b.kind = kinds_[rng.below(kinds_n_)];
    b.x = rng.range(0, w_);
    b.y = rng.range(0, h_);
    b.angle = rng.range(0, PI * 2);
    b.want = rng.range(0, PI * 2);
    b.next = rng.range(0, WANDER * 2);
    b.phase = rng.range(0, SPECIES[b.kind].phases);
    return b;
  }

  Rect draw(Surface &s, const Bug &b) {
    const Species &sp = SPECIES[b.kind];
    const Sequence &seq = *seq_[b.kind];
    const Art &art = *variant_->art;
    int phase = (int) floorf(b.phase) % sp.phases;
    float dx = cosf(b.angle), dy = sinf(b.angle);
    if (sp.headings == 1)
      return turned(s, art, seq.frames[(sp.first + phase) % seq.count], b.x, b.y, b.angle - sp.facing);
    // The strip runs head-up to head-left; a mirror in x and y reaches the
    // rest, so the heading only has to be folded into that quarter.
    float t = atan2f(fabsf(dx), fabsf(dy)) / Q;
    int index = sp.first + round_half_up(t * (sp.headings - 1)) * sp.stride + phase;
    bool fx = dx > 1e-6f, fy = dy > 1e-6f;
    if (!fx && !fy)
      return draw_frame(s, art, seq, index, b.x, b.y);
    return mirrored(s, art, seq.frames[index % seq.count], b.x, b.y, fx, fy);
  }

  /* As ad.js Sequence.draw with flipX/flipY: translate to the rounded centre,
     mirror, and draw at round(-w/2). */
  Rect mirrored(Surface &s, const Art &art, const Frame &f, float cx, float cy, bool fx, bool fy) {
    decode(art, f, buf_.data());
    int rx = round_half_up(cx), ry = round_half_up(cy);
    int ox = round_half_up(-f.w / 2.0f), oy = round_half_up(-f.h / 2.0f);
    for (int v = 0; v < f.h; v++) {
      int y = fy ? ry - oy - 1 - v : ry + oy + v;
      for (int u = 0; u < f.w; u++) {
        int x = fx ? rx - ox - 1 - u : rx + ox + u;
        put(s, x, y, art.palette, buf_[v * f.w + u]);
      }
    }
    int left = fx ? rx - ox - f.w : rx + ox;
    int top = fy ? ry - oy - f.h : ry + oy;
    return s.clip({left, top, f.w, f.h});
  }

  /* As ad.js Sequence.drawTurned: centred on the rounded point, turned by
     `angle` (clockwise on screen), sampled at the nearest source pixel. */
  Rect turned(Surface &s, const Art &art, const Frame &f, float cx, float cy, float angle) {
    decode(art, f, buf_.data());
    int rx = round_half_up(cx), ry = round_half_up(cy);
    int ox = round_half_up(-f.w / 2.0f), oy = round_half_up(-f.h / 2.0f);
    float c = cosf(angle), sn = sinf(angle);
    float hw = (fabsf(f.w * c) + fabsf(f.h * sn)) / 2 + 1;
    float hh = (fabsf(f.w * sn) + fabsf(f.h * c)) / 2 + 1;
    Rect box = s.clip({rx - (int) hw - 1, ry - (int) hh - 1, 2 * (int) hw + 3, 2 * (int) hh + 3});
    for (int y = box.y; y < box.y + box.h; y++) {
      float py = y + 0.5f - ry;
      for (int x = box.x; x < box.x + box.w; x++) {
        float px = x + 0.5f - rx;
        int u = (int) floorf(px * c + py * sn - ox);
        int v = (int) floorf(-px * sn + py * c - oy);
        if (u >= 0 && v >= 0 && u < f.w && v < f.h)
          put(s, x, y, art.palette, buf_[v * f.w + u]);
      }
    }
    return box;
  }

  const Variant *variant_ = &VARIANTS[0];
  const Sequence *seq_[KINDS] = {};
  int kinds_[KINDS];
  int kinds_n_ = 0;
  int w_ = 0, h_ = 0;
  std::vector<Bug> bugs_;
  std::vector<Rect> drawn_;
  std::vector<uint8_t> buf_;
};

}  // namespace

Saver *make_bugs() { return new Bugs(); }

AD_REGISTER_SAVER("bugs", make_bugs, nullptr)

}  // namespace adcore
#endif
