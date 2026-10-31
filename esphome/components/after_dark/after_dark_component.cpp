#include "after_dark_component.h"
#include "esphome/core/hal.h"
#include "esphome/core/log.h"
#ifdef USE_API
#include "esphome/components/api/api_server.h"
#endif

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
  subscribe_shell_();
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
    surface_.attach(display_);
    if (!screensaver_mode_) {
      display_->stop_poller();
      /* Savers erase what they drew; a clear before each push would undo that. */
      display_->set_auto_clear(false);
    }
  }
  if (screensaver_mode_) {
    /* Nothing to draw until start(); remember what to run then. */
    if (!set_saver(initial_))
      set_saver("random");
    return;
  }
  if (!set_saver(initial_))
    set_saver("off");
}

void AfterDarkComponent::add_shell_command(const std::string &name) {
  ::adcore::LiveCommand c;
  ::adcore::set_live(c.name, name);
  ::adcore::shell_commands.push_back(c);
}

void AfterDarkComponent::add_shell_entity(const std::string &entity_id, const std::string &attribute,
                                          const std::string &label, const std::string &unit) {
  if (::adcore::shell_commands.empty())
    return;
  auto &lines = ::adcore::shell_commands.back().lines;
  ::adcore::LiveLine line;
  ::adcore::set_live(line.label, label.empty() ? entity_id : label);
  ::adcore::set_live(line.unit, unit);
  lines.push_back(line);
  shell_entities_.push_back({::adcore::shell_commands.size() - 1, lines.size() - 1, entity_id, attribute,
                             !label.empty(), !unit.empty()});
}

void AfterDarkComponent::add_shell_text(std::function<std::string()> &&f) {
  if (::adcore::shell_commands.empty())
    return;
  ::adcore::LiveLine line;
  line.text = std::move(f);
  ::adcore::shell_commands.back().lines.push_back(line);
}

void AfterDarkComponent::set_shell_lines(std::function<std::vector<std::string>()> &&f) {
  if (!::adcore::shell_commands.empty())
    ::adcore::shell_commands.back().lines_fn = std::move(f);
}

void AfterDarkComponent::set_shell_when(std::function<bool()> &&f) {
  if (!::adcore::shell_commands.empty())
    ::adcore::shell_commands.back().when = std::move(f);
}

/* Home Assistant sends each state as it changes, once it has connected.
   AD_SHELL_LIVE is set when DOS Shell has commands; it also asks ESPHome for
   the state subscriptions, which 2025.10 and later leave out unless asked. */
void AfterDarkComponent::subscribe_shell_() {
#if defined(USE_API) && defined(AD_SHELL_LIVE)
  using Set = std::function<void(const std::string &)>;
  for (const ShellEntity &e : shell_entities_) {
    size_t c = e.command, l = e.line;
    optional<std::string> attribute;
    if (!e.attribute.empty())
      attribute = e.attribute;
    api::global_api_server->subscribe_home_assistant_state(e.entity_id, attribute, Set([c, l](const std::string &v) {
      ::adcore::set_live(::adcore::shell_commands[c].lines[l].value, v);
    }));
    if (!e.own_label)
      api::global_api_server->subscribe_home_assistant_state(
          e.entity_id, std::string("friendly_name"),
          Set([c, l](const std::string &v) { ::adcore::set_live(::adcore::shell_commands[c].lines[l].label, v); }));
    /* An attribute's unit isn't the entity's, so only the state gets one. */
    if (!e.own_unit && e.attribute.empty())
      api::global_api_server->subscribe_home_assistant_state(
          e.entity_id, std::string("unit_of_measurement"),
          Set([c, l](const std::string &v) { ::adcore::set_live(::adcore::shell_commands[c].lines[l].unit, v); }));
  }
#endif
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

/* Make and start saver `name` on this screen. */
bool AfterDarkComponent::run_(const std::string &name) {
  saver_.reset();
  text_saver_.reset();
  const ::adcore::SaverEntry *e = ::adcore::find_saver(name.c_str());
  if (e == nullptr || (text_mode_() ? e->make_text == nullptr : e->make == nullptr)) {
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
  ESP_LOGD(TAG, "Running %s", name.c_str());
  push_();
  last_ms_ = millis();
  high_freq_.start();
  return true;
}

/* Any saver in the build for this screen but the last one picked. */
std::string AfterDarkComponent::pick_random_() {
  std::vector<const char *> names;
  for (const ::adcore::SaverEntry *e = ::adcore::first_saver(); e; e = e->next)
    if ((text_mode_() ? e->make_text != nullptr : e->make != nullptr) && last_random_ != e->name)
      names.push_back(e->name);
  if (names.empty() && !last_random_.empty())
    return last_random_;  // the only one there is
  last_random_ = names.empty() ? std::string() : std::string(names[::adcore::rng.below(names.size())]);
  return last_random_;
}

bool AfterDarkComponent::set_saver(const std::string &name) {
  if (screensaver_mode_) {
    if (name != "random" && name != "off" && ::adcore::find_saver(name.c_str()) == nullptr) {
      ESP_LOGW(TAG, "No saver called '%s' in this build", name.c_str());
      return false;
    }
    current_ = name;
    callback_.call(current_);
    if (running_) {
      if (name == "off")
        stop();
      else
        run_(name == "random" ? pick_random_() : name);
    }
    return true;
  }
  if (name == "off") {
    saver_.reset();
    text_saver_.reset();
    blank_();
    high_freq_.stop();
  } else if (!run_(name)) {
    return false;
  }
  current_ = name;
  callback_.call(current_);
  return true;
}

void AfterDarkComponent::start() {
  if (!screensaver_mode_ || running_ || text_mode_() || current_ == "off")
    return;
  /* Move the display's own drawing aside, so its updates (timed, or asked
     for by the YAML) push our frames instead of drawing over them. */
  auto *d = static_cast<display::Display *>(display_);
  saved_writer_ = std::move(d->*DisplayInternals::writer());
  d->*DisplayInternals::writer() = DisplayInternals::Writer{};
  saved_page_ = d->*DisplayInternals::page();
  d->*DisplayInternals::page() = nullptr;
  saved_auto_clear_ = d->*DisplayInternals::auto_clear();
  d->set_auto_clear(false);
  running_ = true;
  if (!run_(current_ == "random" ? pick_random_() : current_))
    stop();
}

void AfterDarkComponent::stop() {
  if (!running_)
    return;
  saver_.reset();
  text_saver_.reset();
  high_freq_.stop();
  auto *d = static_cast<display::Display *>(display_);
  d->*DisplayInternals::writer() = std::move(saved_writer_);
  saved_writer_ = DisplayInternals::Writer{};
  d->*DisplayInternals::page() = saved_page_;
  d->set_auto_clear(saved_auto_clear_);
  running_ = false;
  ESP_LOGD(TAG, "Stopped; the display is its own again");
  d->update();
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
#ifdef AD_USE_LCD
  /* The YAML's own messages (a button's "Lights off") take the panel while
     they last; the saver carries on underneath. */
  if (text_mode_() && overlay_) {
    std::vector<std::string> lines = overlay_();
    if (!lines.empty()) {
      if (!overlay_shown_ || lines != last_overlay_) {
        for (int r = 0; r < lcd_rows_; r++) {
          std::string row = r < (int) lines.size() ? lines[r] : std::string();
          row.resize(lcd_cols_, ' ');
          lcd_->print(0, r, row.c_str());
        }
        lcd_->display();
        last_overlay_ = lines;
      }
      overlay_shown_ = true;
      return;
    }
    if (overlay_shown_) {
      overlay_shown_ = false;
      text_.invalidate();
    }
  }
#endif
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
  for (const auto &c : ::adcore::shell_commands)
    ESP_LOGCONFIG(TAG, "  DOS Shell command: %s (%u lines)", c.name.c_str(), (unsigned) c.lines.size());
  for (const ::adcore::SaverEntry *e = ::adcore::first_saver(); e; e = e->next)
    ESP_LOGCONFIG(TAG, "  Built in: %s%s", e->name, e->make_text ? "" : " (not on a character LCD)");
}

}  // namespace after_dark
}  // namespace esphome
