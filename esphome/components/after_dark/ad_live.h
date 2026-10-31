#pragma once
/*
 * ad_live.h - live data from Home Assistant for the savers that can show it:
 * so far DOS Shell, which types each command and prints its lines. Whatever
 * runs the savers fills this in (the ESPHome component from its `commands:`
 * option, the host renderer from AD_SHELL_DEMO) and keeps the values current.
 *
 * Text is held in Latin-1, the savers' character set; set_live() converts.
 */
#include <string>
#include <vector>

namespace adcore {

struct LiveLine {
  std::string label;  // "Living room", or the entity's friendly name
  std::string value;  // its state (or attribute); empty until it arrives
  std::string unit;   // "°C", or the entity's unit_of_measurement
};

struct LiveCommand {
  std::string name;  // what gets typed: "TEMP"
  std::vector<LiveLine> lines;
};

/* DOS Shell's commands. Empty: it runs the module's own (DIR, TIME...). */
extern std::vector<LiveCommand> shell_commands;
/* With commands given, still mix in the module's own now and then. */
extern bool shell_classic;

/* Store UTF-8 `text` in `dst` as Latin-1. */
void set_live(std::string &dst, const std::string &text);

}  // namespace adcore
