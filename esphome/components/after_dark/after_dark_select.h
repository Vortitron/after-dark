#pragma once
/* A select for choosing the saver from Home Assistant (or "off"). */
#include "esphome/core/component.h"
#include "esphome/components/select/select.h"

#include "after_dark_component.h"

namespace esphome {
namespace after_dark {

class AfterDarkSelect : public select::Select, public Component {
 public:
  void set_parent(AfterDarkComponent *parent) { parent_ = parent; }
  void setup() override {
    parent_->add_on_saver_callback([this](const std::string &name) { this->publish_state(name); });
    if (!parent_->get_saver().empty())
      this->publish_state(parent_->get_saver());
  }

 protected:
  void control(const std::string &value) override { parent_->set_saver(value); }
  AfterDarkComponent *parent_{nullptr};
};

}  // namespace after_dark
}  // namespace esphome
