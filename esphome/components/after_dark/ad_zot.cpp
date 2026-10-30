/*
 * ad_zot.cpp - Zot!, lightning on a black screen. A port of all/modules/zot.js,
 * which was checked against ZOT.AD's drawing calls under Wine; see that file
 * for what was traced (the bolt's walk, the forks, the gaps between strikes)
 * and what is still chosen (how long a flash stays up, the turning rule).
 *
 * Defaults are the module's: Forkiness Forky, How Often Often.
 *
 * The strike is drawn and then erased by drawing it again in black, as the
 * module did, so only the bolt's own pixels change. Adapted for slow panels:
 * a flash shows for at least one frame, with at least one dark frame between
 * the two of a double strike, however long a frame takes; the web version
 * runs at 60 fps and never needs that.
 *
 * On a 1-bit panel the grey forks go through the ordered dither like any
 * colour and come out as dotted lines, fainter than the bolt, which is how
 * they look next to it in colour too. On a character LCD (ZotText) it strikes
 * on a DotMatrix, the flash held a few frames so the slow panel shows it.
 */
#if defined(AD_SAVER_ZOT) || defined(AD_ALL_SAVERS)
#include "ad_core.h"
#include "ad_draw.h"
#include "ad_text.h"

#include <vector>

namespace adcore {

namespace {

/* The longest fork, in steps, for Few, Forky and Max Forky!. */
const int FORKS[] = {6, 23, 54};
/* Seconds between strikes for Rarely, Sometimes, Often and Stormy!. */
const float OFTEN[][2] = {{10, 17}, {4, 13.5f}, {2.5f, 8.5f}, {2.5f, 9.5f}};
const float TURN = 1 / 60.0f;  // chance a step turns the bolt round
const float DARK = 0.06f;      // between the two flashes of a double strike
const int MAIN_STEPS = 400;
const int MAX_FORKS = 17;
const Rgb WHITE = {255, 255, 255};
const Rgb GREY = {128, 128, 128};

struct Pt {
  float x, y;
};

class Zot : public Saver {
 public:
  int forkiness = 1;
  int how_often = 2;
  float flash = 0.05f;  // a flash stays up this long

  void start(Surface &s) override {
    w_ = s.width();
    h_ = s.height();
    s.clear();
    pts_.clear();
    pts_.reserve(MAIN_STEPS + 1 + MAX_FORKS * (FORKS[forkiness] + 1));
    nbolts_ = 0;
    nflash_ = cur_ = 0;
    drawn_ = false;
    clock_ = 0;
    wait_ = rng.range(OFTEN[how_often][0], OFTEN[how_often][1]);
  }

  void frame(Surface &s, float dt) override {
    clock_ += dt;
    wait_ -= dt;
    if (wait_ <= 0) {
      if (drawn_)
        draw(s, false);
      fire();
    }
    if (drawn_) {
      if (clock_ >= flash_at_[cur_] + flash) {
        draw(s, false);
        cur_++;
      }
    } else if (cur_ < nflash_ && clock_ >= flash_at_[cur_]) {
      draw(s, true);
    }
  }

 private:
  /* Walk down from (x, y): each step 0..18 px down and 0..25 px across in the
     current direction, which now and then turns round (and does at the
     screen's sides). Step sizes are for 1024x768, times `k`. */
  void walk(float x, float y, int dir, float bottom, int steps, float k) {
    pts_.push_back({x, y});
    for (int i = 0; i < steps && y < bottom; i++) {
      if (rng.uniform() < TURN)
        dir = -dir;
      x += dir * rng.below(26) * k;
      if (x < 0 || x > w_ - 1) {
        x = x < 0 ? 0 : w_ - 1;
        dir = -dir;
      }
      y += rng.below(19) * k;
      pts_.push_back({x, y});
    }
  }

  void begin_bolt() { start_[nbolts_++] = (uint16_t) pts_.size(); }

  void strike() {
    float k = w_ / 1024.0f;
    int forks = FORKS[forkiness];
    float bottom = h_ - 28 * k;
    pts_.clear();
    nbolts_ = 0;
    begin_bolt();
    float x = (float) rng.below(w_);
    int dir = rng.uniform() < 0.5f ? -1 : 1;
    walk(x, 0, dir, bottom, MAIN_STEPS, k);
    int main_len = (int) pts_.size();
    int n = 4 + rng.below(14);
    for (int i = 0; i < n && main_len > 2; i++) {
      Pt from = pts_[1 + rng.below(main_len - 2)];
      float r = rng.uniform();
      int len = 1 + (int) floorf(r * r * r * forks);
      int fdir = rng.uniform() < 0.5f ? -1 : 1;
      begin_bolt();
      walk(from.x, from.y, fdir, (float) h_, len, k);
    }
    start_[nbolts_] = (uint16_t) pts_.size();
  }

  void fire() {
    strike();
    clock_ = 0;
    cur_ = 0;
    nflash_ = rng.uniform() < 0.6f ? 2 : 1;
    flash_at_[0] = 0;
    flash_at_[1] = flash + DARK;
    wait_ = rng.range(OFTEN[how_often][0], OFTEN[how_often][1]);
  }

  /* The strike in its colours, or in black to rub it out. */
  void draw(Surface &s, bool lit) {
    for (int b = 0; b < nbolts_; b++) {
      Rgb c = !lit ? BLACK : b == 0 ? WHITE : GREY;
      int x0 = round_half_up(pts_[start_[b]].x), y0 = round_half_up(pts_[start_[b]].y);
      for (int i = start_[b] + 1; i < start_[b + 1]; i++) {
        int x1 = round_half_up(pts_[i].x), y1 = round_half_up(pts_[i].y);
        line(s, x0, y0, x1, y1, c);
        x0 = x1;
        y0 = y1;
      }
    }
    drawn_ = lit;
  }

  int w_ = 0, h_ = 0;
  std::vector<Pt> pts_;
  uint16_t start_[MAX_FORKS + 2];
  int nbolts_ = 0;
  float flash_at_[2] = {0, 0};
  int nflash_ = 0, cur_ = 0;
  bool drawn_ = false;
  float clock_ = 0, wait_ = 0;
};

/* On a character LCD: the same strikes on the dot grid, each flash held long
   enough for the slow liquid crystal to show it. */
class ZotText : public TextSaver {
 public:
  void start(TextScreen &t) override {
    dots_.begin(t.cols(), t.rows());
    zot_.flash = 0.3f;
    zot_.start(dots_);
    dots_.compose(t);
  }
  void frame(TextScreen &t, float dt) override {
    zot_.frame(dots_, dt);
    dots_.compose(t);
  }

 private:
  DotMatrix dots_;
  Zot zot_;
};

}  // namespace

Saver *make_zot() { return new Zot(); }
TextSaver *make_zot_text() { return new ZotText(); }

AD_REGISTER_SAVER("zot", make_zot, make_zot_text)

}  // namespace adcore
#endif
