#pragma once
/* after_dark.start, after_dark.stop and after_dark.is_running, for the YAML
   of a display that runs the savers as its screensaver (mode: screensaver). */
#include "esphome/core/automation.h"
#include "esphome/core/macros.h"
#include "esphome/core/version.h"

#include "after_dark_component.h"

namespace esphome {
namespace after_dark {

/* ESPHome 2025.11 started passing an action's arguments by reference. */
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2025, 11, 0)
#define AD_ARGS const Ts &...x
#else
#define AD_ARGS Ts... x
#endif

template<typename... Ts> class StartAction : public Action<Ts...>, public Parented<AfterDarkComponent> {
 public:
  void play(AD_ARGS) override { this->parent_->start(); }
};

template<typename... Ts> class StopAction : public Action<Ts...>, public Parented<AfterDarkComponent> {
 public:
  void play(AD_ARGS) override { this->parent_->stop(); }
};

template<typename... Ts> class IsRunningCondition : public Condition<Ts...>, public Parented<AfterDarkComponent> {
 public:
  bool check(AD_ARGS) override { return this->parent_->is_running(); }
};

#undef AD_ARGS

}  // namespace after_dark
}  // namespace esphome
