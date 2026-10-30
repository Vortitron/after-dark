#include "after_dark_component.h"
#include "esphome/core/hal.h"
#include "esphome/core/log.h"

#include <cstring>

namespace esphome {
namespace after_dark {

static const char *const TAG = "after_dark";

void DisplaySurface::pixel(int x, int y, ::adcore::Rgb c) {
  if (mono_)
    display_->draw_pixel_at(x, y, ::adcore::mono_on(x, y, c) ? display::COLOR_ON : display::COLOR_OFF);
  else
    display_->draw_pixel_at(x, y, Color(c.r, c.g, c.b));
}

void DisplaySurface::fill_rect(int x, int y, int w, int h, ::adcore::Rgb c) {
  ::adcore::Rect r = clip({x, y, w, h});
  if (r.empty())
    return;
  if (!mono_)
    display_->filled_rectangle(r.x, r.y, r.w, r.h, Color(c.r, c.g, c.b));
  else if (c.r == 0 && c.g == 0 && c.b == 0)
    display_->filled_rectangle(r.x, r.y, r.w, r.h, display::COLOR_OFF);
  else
    Surface::fill_rect(r.x, r.y, r.w, r.h, c);  // dithered, a pixel at a time
}

#ifdef AD_USE_TIME
static time::RealTimeClock *clock_ = nullptr;
static bool esphome_time(::adcore::Clock &c) {
  ESPTime t = clock_->now();
  if (!t.is_valid())
    return false;
  c = {t.year, t.month, t.day_of_month, t.day_of_week - 1, t.hour, t.minute, t.second};
  return true;
}
#endif

void AfterDarkComponent::setup() {
  ::adcore::rng.seed(random_uint32());
#ifdef AD_USE_TIME
  clock_ = time_;
  ::adcore::time_source = esphome_time;
#endif
  /* We push the frames; the display's own timed redraw would clear them. */
#ifdef AD_USE_LCD
  if (text_mode_()) {
    lcd_->stop_poller();
    text_.begin(lcd_cols_, lcd_rows_);
  }
#endif
  if (!text_mode_()) {
    display_->stop_poller();
    /* Savers erase what they drew; a clear before each push would undo that. */
    display_->set_auto_clear(false);
    surface_.attach(display_);
  }
  if (!set_saver(initial_))
    set_saver("off");
}

void AfterDarkComponent::blank_() {
  if (text_mode_())
    text_.clear();
  else
    surface_.clear();
  push_();
}

void AfterDarkComponent::push_() {
#ifdef AD_USE_LCD
  if (text_mode_()) {
    if (!text_.changed())
      return;
    for (int g = 0; g < ::adcore::TextScreen::GLYPHS; g++) {
      if (!text_.glyph_changed(g))
        continue;
      uint8_t bits[8];
      memcpy(bits, text_.glyph_bits(g), 8);
      lcd_->loadchar(g, bits);
    }
    char row[::adcore::TextScreen::MAX_COLS + 1];
    for (int r = 0; r < text_.rows(); r++) {
      for (int c = 0; c < text_.cols(); c++) {
        uint8_t code = text_.at(c, r);
        /* Glyph 0 is also at 8; print() would take a 0 for the end. */
        row[c] = (char) (code == 0 ? 8 : code);
      }
      row[text_.cols()] = '\0';
      lcd_->print(0, r, row);
    }
    lcd_->display();
    text_.mark_sent();
    return;
  }
#endif
  display_->update();
}

bool AfterDarkComponent::set_saver(const std::string &name) {
  saver_.reset();
  text_saver_.reset();
  if (name == "off") {
    blank_();
    high_freq_.stop();
  } else {
    const ::adcore::SaverEntry *e = ::adcore::find_saver(name.c_str());
    if (e == nullptr || (text_mode_() && e->make_text == nullptr)) {
      ESP_LOGW(TAG, "No saver called '%s' for this screen in this build", name.c_str());
      return false;
    }
    if (text_mode_()) {
      text_saver_.reset(e->make_text());
      text_saver_->start(text_);
    } else {
      saver_.reset(e->make());
      saver_->start(surface_);
    }
    push_();
    last_ms_ = millis();
    high_freq_.start();
  }
  ESP_LOGD(TAG, "Saver: %s", name.c_str());
  current_ = name;
  callback_.call(current_);
  return true;
}

void AfterDarkComponent::loop() {
  if (!saver_ && !text_saver_)
    return;
  uint32_t now = millis();
  uint32_t elapsed = now - last_ms_;
  if (elapsed < 1000u / fps_)
    return;
  last_ms_ = now;
  /* A stall (OTA, a slow push) shouldn't send everything flying. */
  float dt = elapsed > 250 ? 0.25f : elapsed / 1000.0f;
  if (text_saver_)
    text_saver_->frame(text_, dt);
  else
    saver_->frame(surface_, dt);
  push_();
}

void AfterDarkComponent::dump_config() {
  ESP_LOGCONFIG(TAG, "After Dark:");
  if (text_mode_())
    ESP_LOGCONFIG(TAG, "  Character LCD: %dx%d at up to %d fps", lcd_cols_, lcd_rows_, fps_);
  else
    ESP_LOGCONFIG(TAG, "  Screen: %dx%d%s at up to %d fps", surface_.width(), surface_.height(),
                  surface_.mono() ? " (1-bit)" : "", fps_);
  ESP_LOGCONFIG(TAG, "  Saver: %s", current_.c_str());
  for (const ::adcore::SaverEntry *e = ::adcore::first_saver(); e; e = e->next)
    ESP_LOGCONFIG(TAG, "  Built in: %s%s", e->name, e->make_text ? "" : " (not on a character LCD)");
}

}  // namespace after_dark
}  // namespace esphome
