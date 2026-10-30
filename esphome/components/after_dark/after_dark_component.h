#pragma once
/*
 * The ESPHome end of the After Dark savers: draws the chosen saver straight
 * into a display's buffer and pushes it, at its own frame rate, instead of
 * going through a display lambda (which would clear and redraw everything).
 *
 * It drives either a pixel display (colour, or 1-bit like the SSD1306/SH1106
 * OLEDs, which get baked black-and-white art) or a character LCD (lcd_pcf8574,
 * lcd_gpio), where the savers draw with the eight user-defined glyphs.
 *
 * The savers themselves are in the ad_*.cpp files and know nothing of ESPHome.
 */
#include "esphome/core/component.h"
#include "esphome/core/helpers.h"
#include "esphome/components/display/display.h"
#ifdef AD_USE_LCD
#include "esphome/components/lcd_base/lcd_display.h"
#endif
#ifdef AD_USE_TIME
#include "esphome/components/time/real_time_clock.h"
#endif

#include "ad_core.h"
#include "ad_text.h"

#include <memory>
#include <string>

namespace esphome {
namespace after_dark {

class DisplaySurface : public ::adcore::Surface {
 public:
  void attach(display::Display *d) {
    display_ = d;
    width_ = d->get_width();
    height_ = d->get_height();
    mono_ = d->get_display_type() == display::DISPLAY_TYPE_BINARY;
  }
  int width() const override { return width_; }
  int height() const override { return height_; }
  bool mono() const override { return mono_; }
  void pixel(int x, int y, ::adcore::Rgb c) override;
  void fill_rect(int x, int y, int w, int h, ::adcore::Rgb c) override;

 protected:
  display::Display *display_{nullptr};
  int width_{0}, height_{0};
  bool mono_{false};
};

class AfterDarkComponent : public Component {
 public:
  void set_display(display::Display *display) { display_ = display; }
#ifdef AD_USE_LCD
  void set_lcd(lcd_base::LCDDisplay *lcd, int cols, int rows) {
    lcd_ = lcd;
    lcd_cols_ = cols;
    lcd_rows_ = rows;
  }
#endif
#ifdef AD_USE_TIME
  void set_time(time::RealTimeClock *time) { time_ = time; }
#endif
  void set_fps(int fps) { fps_ = fps; }
  void set_initial_saver(const std::string &name) { initial_ = name; }

  void setup() override;
  void loop() override;
  void dump_config() override;
  /* After the display has its buffer. */
  float get_setup_priority() const override { return setup_priority::LATE; }

  /* Switch saver; "off" blanks the screen and stops drawing. */
  bool set_saver(const std::string &name);
  const std::string &get_saver() const { return current_; }
  void add_on_saver_callback(std::function<void(const std::string &)> &&cb) { callback_.add(std::move(cb)); }

 protected:
  bool text_mode_() const { return lcd_cols_ > 0; }
  void blank_();
  void push_();

  display::Display *display_{nullptr};
  DisplaySurface surface_;
  std::unique_ptr<::adcore::Saver> saver_;
#ifdef AD_USE_LCD
  lcd_base::LCDDisplay *lcd_{nullptr};
#endif
  int lcd_cols_{0}, lcd_rows_{0};
#ifdef AD_USE_TIME
  time::RealTimeClock *time_{nullptr};
#endif
  ::adcore::TextScreen text_;
  std::unique_ptr<::adcore::TextSaver> text_saver_;

  std::string initial_;
  std::string current_;
  int fps_{30};
  uint32_t last_ms_{0};
  HighFrequencyLoopRequester high_freq_;
  CallbackManager<void(const std::string &)> callback_;
};

}  // namespace after_dark
}  // namespace esphome
