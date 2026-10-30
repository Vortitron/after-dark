# After Dark on ESPHome

The savers from `all/modules/` ported to C++, as an ESPHome external component
that draws straight onto a display: colour panels, 1-bit OLEDs, and even
16×2 character LCDs.

## The savers

31 so far, all ported from the web versions (which were checked against the
original modules), with each file's header saying where a small screen forced
a change.

| Saver | From | Character LCD |
|---|---|---|
| `boris` | Boris (BORIS.AD) | ✓ one cat, hand-drawn poses |
| `bugs` | Bugs | |
| `clocks` | Clocks 3.0 (CLOCKS3.AD); pick a `face` | ✓ big 3×2 digits, drifting |
| `dosshell` | DOS Shell | ✓ the panel is the screen |
| `einstein` | Einstein | ✓ lines only |
| `fishpro` | Fish Pro; pick the `species` | ✓ |
| `flocks` | Flocks (the birds) | ✓ |
| `geobounce` | GeoBounce | |
| `gravity` | Gravity | |
| `hard_rain` | Hard Rain (RAIN.AD) | ✓ (marginal) |
| `mandelbrot` | Mandelbrot | |
| `marbles` | Marbles, the 1992 original (MARBLES2.AD) | |
| `messages` | Messages (MESSAGE3.AD) | ✓ |
| `mountains` | Mountains | |
| `mowin` | Mowin' Man | ✓ |
| `nocturne` | Nocturnes | ✓ |
| `nonsense` | Nonsense | ✓ |
| `photon` | Photon | ✓ |
| `rebound` | Rebound | |
| `rose` | Rose | |
| `shapes` | Shapes | |
| `snake` | Snake | |
| `spheres` | Spheres | |
| `spiral` | Spiral Gyra | |
| `starry_night` | Starry Night | ✓ |
| `strange` | Strange Attractors | |
| `string_theory` | String Theory | |
| `toasters` | Flying Toasters Pro (TOAST3.AD) | ✓ hand-drawn |
| `toilets` | Flying Toilets | ✓ hand-drawn |
| `warp` | Warp! | ✓ (outward) |
| `zot` | Zot! | ✓ |

Each kind of screen gets the saver a different way:

| Screen | Example | How the savers draw |
|---|---|---|
| Colour (ILI9341, ST7789…) | [`after-dark-s3.yaml`](after-dark-s3.yaml) | the original art, full size |
| 1-bit OLED (SH1106, SSD1306) | [`after-dark-c3-oled.yaml`](after-dark-c3-oled.yaml) | art shrunk (1/2 to 1/6) and baked to black and white by `art2c.py --mono`; sizes, speeds and counts scaled to match |
| Character LCD (1602, 2004) | [`after-dark-c3-lcd.yaml`](after-dark-c3-lcd.yaml) | the panel's eight user-defined characters, redefined to animate |

On a character LCD the sprites are redrawn by hand in 5×8 cells, because
nothing of the real art survives being shrunk that far; dot-and-line savers
run on a dot grid shaped like the panel (`DotMatrix`). The savers without an
LCD version are the ones that came out as noise or a speck there.

## Using it

The easy way is the builder on the site, [After Dark for ESPHome](https://vortitron.github.io/after-dark/all/esphome.html):
pick the board and screen, tick the savers (each has a preview of how it
looks on that screen), and it shows how much flash they take and writes the
config. If your Home Assistant is connected to [Vome](https://vome.io/), the
builder also gives you a request to paste to your AI assistant, which then
adds the config to ESPHome Device Builder, builds it and installs it.

By hand, the parts of a config that matter are:

```yaml
display:
  - platform: ili9xxx
    id: screen
    # ...
    update_interval: never      # after_dark pushes the frames
    auto_clear_enabled: false   # and erases only what it drew

after_dark:
  display_id: screen            # or lcd_id: for a character LCD
  savers:                       # compiled in (default: all)
    - toasters
    - warp
    - fishpro:                  # some savers take options under their name
        species: [emperor, sardines, jellyfish]
    - clocks:
        face: classic
  saver: toasters               # starting saver, or "off"
  fps: 30                       # default 30, or 8 on a character LCD
  time_id: sntp_time            # for the clocks; without one they count from 10:10

select:
  - platform: after_dark        # pick the saver from Home Assistant
    name: Screensaver
```

The display must not have a `lambda` or `pages`, or the two will fight over
the screen. For a character LCD, use `lcd_id:` instead of `display_id:`; its
size is read from the LCD's own config.

Saver options are fixed when the firmware is built, so only what they need
goes in:

- `fishpro: species:` any of `yellow_tang`, `red_clown`, `blue_tanger`,
  `trigger_fish`, `pink_squirrel`, `butterfly_fish`, `emperor`, `jellyfish`,
  `sardines`. Each species' colour art is 6 to 47 KB. By default a colour
  build has all but the yellow tang, red clown and jellyfish (110 KB between
  them), and a 1-bit build has all nine, as its art is small.
- `clocks: face:` `melting_digital`, `classic`, `modern`, `art_deco` or
  `mutating` (the module's default: ten photographs, 189 KB). On a 1-bit
  panel the default is `melting_digital`, as the photographs don't read as a
  clock at a third size.

### Flash

The build leaves out what the screen can't show: a character LCD build has
no pixel savers or art at all (`AD_TEXT_ONLY`), a 1-bit build (the display
platform is one of `ssd1306_*`, `st7567_*`, `pcd8544`…) has no colour art
(`AD_MONO_ONLY`), and a colour build has no 1-bit art (`AD_COLOUR_ONLY`).
On a 4 MB board with OTA:

| Build (ESPHome 2025.7, ESP-IDF, Wi-Fi + API + OTA + SNTP) | Savers | Flash used of the 1.8 MB OTA slot |
|---|---|---|
| ESP32-C3 + SH1106 OLED ([example](after-dark-c3-oled.yaml)) | all 31 | 1.39 MB (76%) |
| ESP32-C3 + 1602 LCD ([example](after-dark-c3-lcd.yaml)) | the 17 with LCD versions | 1.03 MB (56%) |
| ESP32-S3 + ILI9341 ([example](after-dark-s3.yaml)) | all 31 | 1.75 MB (95%) |
| ESP32-S3 + ILI9341 | `toasters`, `warp` (no SNTP) | 0.99 MB (54%) |

So a colour build of everything only just fits; list `savers:` to leave room
for anything else on the board, or use one with 8 MB of flash. The biggest
colour sets are Clocks' mutating photographs (189 KB; the classic face is
32 KB), Fish Pro (80 KB of scenery plus its species), Bugs (135 KB), the
toasters (102 KB) and Boris (69 KB). The builder shows each saver's cost for
the screen you pick; `tools/measure.py` measures them with the ESP32
compilers (`all/esphome-savers.json`) and errs a few per cent high.


## Layout

- `components/after_dark/ad_*`: the savers and their artwork. They know
  nothing about ESPHome; each draws on an `adcore::Surface`, or for a
  character LCD on an `adcore::TextScreen` (`ad_text.h`). Shared drawing is
  in `ad_draw.h`, fonts (X11 misc-fixed) in `ad_font.h`.
- `components/after_dark/after_dark_*`, `__init__.py`, `select.py`: the
  ESPHome wrapper. `__init__.py` finds the savers by reading each file's
  `AD_REGISTER_SAVER` line.
- `tools/`: the generators for the headers. `art2c.py` turns
  `all/art/<module>` into an `ad_art_<name>.h` (one palette per module,
  frames as run-length rows; `--scale`/`--mono` for small screens, `--cells`
  for 3.x strips, `--index` for a trimmed index from `tools/index/`).
  `font2c.py` makes the fonts, `words2c.py` Nonsense's grammar and
  `einstein2c.py` Einstein's chalk. `measure.py` writes the builder's sizes
  (`savers.json` beside it holds each saver's name, page and note), and
  `previews.sh` renders its previews into `all/esphome/`.
- `host/`: renders a saver on the desktop, so a port can be checked frame by
  frame without a board.

```sh
make -C esphome/host gif SAVER=toasters SCREEN=320x240            # colour
make -C esphome/host gif SAVER=toasters SCREEN=128x64m ZOOM=4     # 1-bit OLED
make -C esphome/host gif SAVER=warp SCREEN=lcd16x2 FPS=8 FRAMES=80
# -> esphome/host/out/<saver>-<screen>.gif

esphome/host/preview.sh OUTDIR zot ad_zot.cpp   # one saver, every screen, contact sheets
```

For colour screens the renderer also prints the average box of changed pixels
per frame. That box is what the ILI9xxx driver sends over SPI, so it gives a
rough idea of the frame rate a real panel will reach. The LCD simulation's
letters come from X11's 5x8 font (`host/make_font.py`), not the HD44780's
ROM, so they differ from a real panel's by a dot here and there.

## Adding a saver

1. Port `all/modules/<name>.js` to `components/after_dark/ad_<name>.cpp`,
   inside `#if defined(AD_SAVER_<NAME>) || defined(AD_ALL_SAVERS)`, ending
   with `AD_REGISTER_SAVER("<name>", make_<name>, make_<name>_text)` (or
   `nullptr` for no LCD version). The YAML finds it from that line.
2. Erase what you drew last frame rather than clearing the screen, where the
   original does. On a 1-bit screen (`Surface::mono()`), pick the `--mono` art.
3. If it has artwork, run `tools/art2c.py` on it, once in colour (inside
   `#ifndef AD_MONO_ONLY`) and once per mono size.
4. For a character LCD, write a `TextSaver` too, or wrap the pixel saver in
   a `DotMatrix` if it is made of dots and lines that survive 95×17.
5. Check it with `host/preview.sh` on every screen.
6. Add it to `tools/savers.json` and run `tools/measure.py` and
   `tools/previews.sh`, so the builder offers it with a preview.
