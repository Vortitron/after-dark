"""After Dark screensavers on an ESPHome display.

    after_dark:
      display_id: screen         # a pixel display, colour or 1-bit
      # lcd_id: lcd              # or a character LCD (lcd_pcf8574, lcd_gpio)
      savers:                    # what to compile in (default: all)
        - toasters
        - fishpro:               # some take options, fixed at build time so
            species: [emperor, sardines]   # only what they need goes in
        - clocks:
            face: classic
      saver: toasters            # what to start with, or "off"
      fps: 30                    # default 30, or 8 on a character LCD
      time_id: sntp_time         # for the clocks (optional)

Saver options (see SAVER_OPTIONS):
  fishpro: species - any of FISH_SPECIES. Default: all nine on a 1-bit panel;
           on a colour one, all but the yellow tang, red clown and jellyfish,
           whose colour art is 110 KB between them.
  clocks:  face - melting_digital, classic, modern, art_deco or mutating.
           Default: mutating (ten photographs, 189 KB) on colour,
           melting_digital on a 1-bit panel.

The display should have no lambda or pages; this draws into it directly.
"""
from pathlib import Path
import re

import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import display
from esphome.const import CONF_DIMENSIONS, CONF_ID, CONF_TIME_ID
from esphome.core import CORE

CODEOWNERS = ["@Vortitron"]

CONF_DISPLAY_ID = "display_id"
CONF_LCD_ID = "lcd_id"
CONF_SAVERS = "savers"
CONF_SAVER = "saver"
CONF_FPS = "fps"
CONF_AFTER_DARK_ID = "after_dark_id"
CLOCKS_FACES = ["melting_digital", "classic", "modern", "art_deco", "mutating"]
FISH_SPECIES = [
    "yellow_tang", "red_clown", "blue_tanger", "trigger_fish", "pink_squirrel",
    "butterfly_fish", "emperor", "jellyfish", "sardines",
]
FISH_COLOUR_DEFAULT = [s for s in FISH_SPECIES if s not in ("yellow_tang", "red_clown", "jellyfish")]



def _find_savers():
    """The savers in this directory, from each file's AD_REGISTER_SAVER line:
    name -> {"text": whether it has a character LCD version}. Each is built
    only when asked for, behind -DAD_SAVER_<NAME>."""
    found = {}
    pattern = re.compile(r'^AD_REGISTER_SAVER\("(\w+)",\s*\w+,\s*(\w+)\)', re.M)
    for path in sorted(Path(__file__).parent.glob("ad_*.cpp")):
        for name, make_text in pattern.findall(path.read_text()):
            found[name] = {"text": make_text != "nullptr"}
    return dict(sorted(found.items()))


SAVERS = _find_savers()

after_dark_ns = cg.esphome_ns.namespace("after_dark")
AfterDarkComponent = after_dark_ns.class_("AfterDarkComponent", cg.Component)
LCDDisplay = cg.esphome_ns.namespace("lcd_base").class_("LCDDisplay", cg.PollingComponent)
RealTimeClock = cg.esphome_ns.namespace("time").class_("RealTimeClock", cg.PollingComponent)


# Build-time options, under a saver's name in `savers:`. Each becomes -D flags
# in to_code, so the saver compiles in only the art it needs.
SAVER_OPTIONS = {
    "fishpro": cv.Schema(
        {
            cv.Optional("species"): cv.All(
                cv.ensure_list(cv.one_of(*FISH_SPECIES, lower=True, space="_")), cv.Length(min=1)
            ),
        }
    ),
    "clocks": cv.Schema({cv.Optional("face"): cv.one_of(*CLOCKS_FACES, lower=True, space="_")}),
}


def _savers(value):
    """A list of saver names, each optionally with its options under it, made
    into {name: options}."""
    out = {}
    for item in cv.ensure_list(cv.Any(cv.string, dict))(value):
        if isinstance(item, dict):
            if len(item) != 1:
                raise cv.Invalid("give one saver per list item, with its options indented under it")
            name, options = next(iter(item.items()))
        else:
            name, options = item, None
        name = cv.one_of(*SAVERS, lower=True)(name)
        if name in out:
            raise cv.Invalid(f"'{name}' is listed twice")
        schema = SAVER_OPTIONS.get(name)
        if options and schema is None:
            raise cv.Invalid(f"'{name}' has no options")
        out[name] = schema(options or {}) if schema else {}
    if not out:
        raise cv.Invalid("list at least one saver")
    return out


def available_savers(config):
    """The savers this config can show, in order."""
    savers = list(config[CONF_SAVERS])
    if CONF_LCD_ID in config:
        savers = [s for s in savers if SAVERS[s]["text"]]
    return savers


def _check(config):
    if CONF_LCD_ID in config and not available_savers(config):
        raise cv.Invalid("none of these savers has a character LCD version", [CONF_SAVERS])
    saver = config.get(CONF_SAVER, available_savers(config)[0])
    if saver != "off" and saver not in available_savers(config):
        raise cv.Invalid(f"'{saver}' isn't built for this screen: {available_savers(config)}", [CONF_SAVER])
    config[CONF_SAVER] = saver
    return config


CONFIG_SCHEMA = cv.All(
    cv.Schema(
        {
            cv.GenerateID(): cv.declare_id(AfterDarkComponent),
            cv.Exclusive(CONF_DISPLAY_ID, "screen"): cv.use_id(display.Display),
            cv.Exclusive(CONF_LCD_ID, "screen"): cv.use_id(LCDDisplay),
            cv.Optional(CONF_SAVERS, default=list(SAVERS)): _savers,
            cv.Optional(CONF_SAVER): cv.one_of(*SAVERS, "off", lower=True),
            cv.Optional(CONF_FPS): cv.int_range(min=1, max=60),
            cv.Optional(CONF_TIME_ID): cv.use_id(RealTimeClock),
        }
    ).extend(cv.COMPONENT_SCHEMA),
    cv.has_exactly_one_key(CONF_DISPLAY_ID, CONF_LCD_ID),
    _check,
)


# Display platforms that are 1-bit, so the colour artwork can stay out.
MONO_PLATFORMS = {
    "ssd1306_i2c", "ssd1306_spi", "ssd1305_i2c", "ssd1305_spi", "st7567_i2c", "st7567_spi",
    "pcd8544", "st7920", "max7219digit", "waveshare_epaper", "inkplate6",
}


def _display_conf(display_id):
    for conf in CORE.config.get("display", []):
        if conf.get(CONF_ID) == display_id:
            return conf
    raise cv.Invalid(f"can't find display '{display_id}'")


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    mono = False
    if CONF_LCD_ID in config:
        cg.add_build_flag("-DAD_USE_LCD")
        lcd = await cg.get_variable(config[CONF_LCD_ID])
        # Pixel savers and their art are dropped (AD_TEXT_ONLY).
        cg.add_build_flag("-DAD_TEXT_ONLY")
        cols, rows = _display_conf(config[CONF_LCD_ID])[CONF_DIMENSIONS]
        cg.add(var.set_lcd(lcd, cols, rows))
        fps = config.get(CONF_FPS, 8)
    else:
        mono = _display_conf(config[CONF_DISPLAY_ID]).get("platform") in MONO_PLATFORMS
        if mono:
            cg.add_build_flag("-DAD_MONO_ONLY")  # savers leave their colour art out
        else:
            cg.add_build_flag("-DAD_COLOUR_ONLY")  # and these their 1-bit art
        disp = await cg.get_variable(config[CONF_DISPLAY_ID])
        cg.add(var.set_display(disp))
        fps = config.get(CONF_FPS, 30)
    cg.add(var.set_fps(fps))
    if CONF_TIME_ID in config:
        cg.add_build_flag("-DAD_USE_TIME")
        cg.add(var.set_time(await cg.get_variable(config[CONF_TIME_ID])))
    cg.add(var.set_initial_saver(config[CONF_SAVER]))
    for saver, options in config[CONF_SAVERS].items():
        cg.add_build_flag(f"-DAD_SAVER_{saver.upper()}")
        if saver == "fishpro":
            species = options.get("species", FISH_SPECIES if mono else FISH_COLOUR_DEFAULT)
            cg.add_build_flag("-DAD_FISHPRO_PICKED")
            for fish in species:
                cg.add_build_flag(f"-DAD_FISHPRO_{fish.upper()}")
        elif saver == "clocks" and "face" in options:
            cg.add_build_flag(f"-DAD_CLOCKS_TYPE={CLOCKS_FACES.index(options['face'])}")
