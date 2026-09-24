# After Dark pipeline

Six tools that turn the original screensaver modules in `../AD40/` into
something a browser can use. They only need Python 3 + Pillow, except
`adrun.sh`, which needs a 32-bit Wine.

```
AD40/**/*.AD  ──adextract.py──▶  raw resources
              ──adart.py─────▶  decoded sprite sheets (PNG)
              ──adweb.py─────▶  all/art/<module>/  (strips + index.json)
              ──adclassic.py─▶  all/art/<module>/  (the 3.x modules, see below)
              ──adtext.py────▶  all/art/<module>/  (text, chalk and grammar)
              ──adrun.sh─────▶  the real thing running under Wine (reference)
```

`node tools/test-savers.js` checks Gravity, Snake, Zot!, Bogglins, Om
Appliances, Fish World, Rainforest, Down the Drain, Shapes, Spheres, Hard
Rain, String Theory, Mandelbrot, Messages, Globe, Starry Night, Warp!,
Nonsense, Einstein's chalk, GeoBounce's solids and Strange Attractors without
a browser.

There are two artwork formats, and which one a module uses does not follow from
whether it is 16-bit or 32-bit. Run both tools and see which bites.

## adextract.py — resources

`.AD` modules are ordinary Windows DLLs: AD 3.x and the Twisted set are 16-bit
NE, AD 4.0 and the 10th-anniversary set are 32-bit PE. This walks both resource
tables.

```sh
python3 tools/adextract.py AD40/AD10th/MARBLES.AD --list
python3 tools/adextract.py 'AD40/AD10th/*.AD' -o extracted/
```

`TYPE_1000` resources hold each module's original control-panel strings, which
is where the option names ("A Few / A Pouch Full / A Jar Full / A Box Full")
come from.

## adart.py — animated artwork

Most modules store animation in a big-endian container Berkeley Systems carried
over from the Mac, compressed with an RLE whose opcode table is transcribed in
the file's docstring — it was read out of `ADXPL510.DLL`'s jump table at
`CODE:0x431014` rather than guessed.

```sh
python3 tools/adart.py 'AD40/AD10th/*.AD' --check      # coverage report
python3 tools/adart.py AD40/AD10th/BUNGEE.AD -o sprites/
```

21,552 frames across 38 modules decode; the sprite sheets match frame-for-frame
against captures of the modules running for real.

One wrinkle worth knowing about: the word at offset 44 of the sequence header
is how many colour depths the sequence ships. 37 sequences, all in 3.x modules,
have **two** — a 256-colour frame and a dithered 16-colour one, interleaved,
with a `CTAB` each. Decoding all of them and colouring the lot from the first
`CTAB` gives an animation that alternates between the right art and a green
mess. Take every *n*th chunk; the first of each group is the deep one.

## adclassic.py — the 3.x still artwork

The older modules mostly skip the RLE container and keep plain Windows DIBs in
resource type `0x7005`, with a directory in type 15 naming them. Marbles is one
of these: one 160x16 bitmap holding ten marbles, a 1-bit mask, and the pin at
three sizes.

```sh
python3 tools/adclassic.py 'AD40/CLASSIC/*.AD' --list
python3 tools/adclassic.py AD40/CLASSIC/MARBLES2.AD -o all/art/marbles2
python3 tools/adclassic.py AD40/AD10th/Aqua.ad -o all/art/aqua --ids 900,1000-1118,1900
```

Which resource type holds the bitmaps is not consistent — `0x7005`, a type
literally named `DIB`, or `MICT`/`QICT`/`SICT` split by size — so the tool
sniffs for the `BM` signature rather than trusting the type.

Transparency comes from the mask where the directory names one (`MMARBLE` masks
`MARBLES`), and otherwise from whichever palette index runs round the edge of
the bitmap. That is index 0 in Marbles and index 15 in Flocks, so assuming
either one leaves half the library with its sprites punched out.

`--ids` is there because several modules ship the same artwork five times over.
Aquatic Realm has 16-colour art, 256-colour art and three bands of masks, 193
bitmaps for 19 creatures; only `1000-1118` is worth exporting.

A few 4.0 modules keep extra still pictures as PE `BITMAP` resources that
start with a `BITMAPINFOHEADER` (`0x28`) rather than `BM`, so `adclassic.py`
skips them. Fish World and Rainforest have a set of these (species / creature
picker icons at 80×64 and 80×60); they are not tiled backgrounds. `all/ad.js`
loads both `sequences` and `bitmaps` from the same `index.json`.

## adweb.py — web assets

```sh
python3 tools/adweb.py AD40/AD10th/MARBLES.AD -o all/art/
```

Writes one horizontal strip per animation plus `index.json`. `all/ad.js` reads
either tool's `index.json`; a per-module behaviour file under `all/modules/`
decides what moves.

## What is actually in there

Of the 99 distinct modules across `AD40/`, `AD10th/` and `CLASSIC/`:

| | |
| --- | --- |
| Animated RLE artwork | 38 modules |
| Still DIB artwork | 16 modules |
| No artwork at all | 45 modules |

That last group is not a gap in the tools. `WARP`, `SPIRAL`, `MANDELBR`,
`GLOBE`, `GRAVITY`, `STARRYNI` and the rest draw themselves with code, so
porting one means writing the drawing, not extracting it.

Having the artwork is not the same as being able to rebuild the module, and the
line between the two is not where the bitmap count suggests. What decides it is
whether a sprite is a whole thing that moves on its own:

- **Sprite-per-object.** Marbles, Flying Toasters, Flocks, Aquatic Realm, Fish
  Pro, Fish World, Bugs, Rainforest, Rebound, Bogglins and Om Appliances. Each bitmap is a complete marble, bird, fish, ball, blob, appliance or jungle creature, the module's
  settings say how many and how fast, and the rest is motion. These are done.
  Two of them carry their facing in the artwork rather than needing it guessed:
  every Fish Pro species is a broadside cycle followed by the fish rotating
  away until it is edge-on, and the Bugs jewel beetle, ant and fly each ship a
  quarter turn of pre-rendered headings that a mirror in x and y completes.
  Fish World and Rainforest skip shrinking turn-views and grey shadow frames
  and mirror the remaining swim or flap.
- **Composed characters.** Swan Lake keeps bodies (`600-608`), necks
  (`300-307`) and water reflections (`700-707`) as separate bitmaps that have
  to be layered at the right offsets. Flying Toilets is a toilet plus a
  detached pair of wings. Bugs' spiders are fifteen frames of one jointed leg
  at the end of `4000` and `6000`, with no body anywhere. The offsets are in
  the code, not the resources. Flying Toilets is now running by composing its
  occupant, toilet, wing and trailing-object frames in the browser.
- **Staged scenes.** Confetti Factory has ducks, gears, conveyor belts and two
  wall styles but no picture of the factory. Bad Dog needs a desktop and Rat
  Race a track. The layout was drawn in code and is simply not recoverable
  from the resource table.

Bungee Roulette is the one of these that is done, and it shows what the third
group costs. All 171 of its frames decode, and they carry more than they look
like they do: each jumper is the same creature at a run of different lengths,
because it hangs upside down by the ankles and the rope stretches it, so
sorting that run by height gives the tension ramp. What is nowhere in the
resources is the rope, the gantry or the ground — so the drop, the recoil and
the rope are drawn in `all/modules/bungee.js` rather than lifted, and only the
pixels are the original's.

The second and third groups are otherwise portable by watching the original
run and rebuilding the staging by eye — which is what `adrun.sh` is for, and
which turns out to work for more modules than the note below used to claim.
Of 33 modules tried, 20 painted their own display and 13 fell back to Starry
Night, which is what the engine shows when a module will not load:

| | |
| --- | --- |
| Painted | BADDOG, CHAM, CRITIC, FISH, GUERNSEY, HALL OF FAME, LIFE, MARBLES, MESSAGES, OUT, PSYCHO, RAIN, RPS, SLOWBURN, SUPERGUY, SWIRLING, TOAST2K, TOASTER 2K, TOASTERS, TURTLE |
| Fell back to Starry Night | CYBER, HULA, MBORIS, MIMEHUNT, PHLEGM_B, POINTS, RATRACE, RODGER, SHADOW, TIME, TOXIC, VOYEUR, YBYH |

That is the useful result, because it is the staged scenes that need it. Bad
Dog paints its whole fake desktop — scattered folder icons, a 3D Application
window with a vase in it, and the dog — none of which is in the resource
table. Guernsey paints too, which is the way to fix its palette: its sprites
decode to grey noise because neither a CTAB nor a module PAL turns up for it,
and a capture says what the colours should be.

The 45 modules with no artwork at all draw themselves, so porting one means
writing the drawing. Thirty-five of those run in the browser so far:

| | |
| --- | --- |
| Physics and mazes | Gravity, Snake, Zot!, Down the Drain, GeoBounce |
| Stamps and lines | Shapes, Spheres, Rose, Spiral Gyra, String Theory, Sunburst, Photon |
| Flying through something | Warp!, Tunnel, Zooommm! |
| Maths | Mandelbrot, Strange Attractors, Vertigo, Satori, Stained Glass, Frost and Fire |
| Pictures | Starry Night, Hard Rain, Messages, Globe, Nocturnes, Meadow |
| Words | Einstein, Nonsense, DOS Shell |
| Eating the desktop | Spotlight, Punch Out, Puzzle, Can of Worms, Spin Brush |

What each one does comes from its own description string and control panel.
There is no capture to check them against: all but Starry Night are 16-bit
modules, which will not paint under Wine (below), and Starry Night - 32-bit,
and the engine's own fallback, so it does paint - was ported after the Wine
sandbox had gone. It is the one worth capturing next time one is set up.

"No artwork" means no sprites in the formats `adart.py` and `adclassic.py`
read. Plenty of these modules carry something else, and it pays to look
beside a module before guessing:

- **Starry Night** keeps its description as RTF, in `TYPE_2000` id 40, once per
  language. It says what the sliders mean - Buildings is a count from 0 to 100,
  height is 5% to 95% of the screen, and the flasher is one light on the
  tallest building. Its one `BITMAP`, 101, is the shooting star: a fireball in
  two 32x32 frames, in `all/art/starryni/`.
- **Globe** wraps a bitmap round its sphere, and the ones it shipped with sit in
  `CLASSIC/BITMAPS/`. `EARTH.BMP` is in `all/art/globe/` as it came.
- **Messages** keeps its eight default messages, with their faces, sizes,
  colours and styles, in `MESG_AD3.DAT`: 246-byte records, which
  `all/modules/messages.js` carries over.
- **Einstein** ships its chalk. Type 32513, named `LETTER`, is a handwriting
  font keyed by character code, each glyph the pen's path one pixel step at a
  time; codes 128 and up are whole pieces of equations. Its string table has
  fifty lines to write out and fifteen equations in those codes.
- **Nonsense** keeps its whole grammar in its string table: nouns with their
  irregular plurals, verbs in five forms plus what may follow each, pronouns,
  modals, adverbs, and so on, in blocks of a thousand ids.
- **DOS Shell** has its boot banner, its commands, its `DIR` line format and its
  error messages in its data segment - `strings` finds them all.
- **Frost and Fire** ships six of its palettes as `PAL` resources (Windows
  `LOGPALETTE`s). Zooommm! offers the same names, so it uses them too.
- **Nocturnes**, **Meadow** and **Spin Brush** keep plain `BITMAP` resources
  (a sheet of eyes, six flowers and a mask, and the patterns it smears), which
  `adextract.py` converts. `adclassic.py` misses them because they start with a
  `BITMAPINFOHEADER` rather than `BM`.

`adtext.py` pulls the Einstein and Nonsense data out:

```sh
python3 tools/adtext.py einstein AD40/CLASSIC/EINSTEIN.AD -o all/art/einstein
python3 tools/adtext.py nonsense AD40/CLASSIC/NONSENSE.AD -o all/art/nonsense
python3 tools/adtext.py strings AD40/CLASSIC/ANYTHING.AD     # any string table
```

Also done since: Clocks, Dominoes, Modern Art, SlideShow, Artist, Mountains,
Nirvana and Fractal Forest - see each module's header for what came from the
module and what was filled in. Worth knowing:

- **SlideShow** reads catalogue files; the one it shipped, `BITMAPS.ADC`, lists
  just `adlogo.bmp` and `toastvga.bmp`. The 10th-anniversary set put a
  `PICTURES` folder beside it, which is the other catalogue here.
- **Clocks**' Melting Digital is `PICT 4000`, one 47x5250 strip: the ten
  digits, then five-frame melts 9>0, 0>1 ... 8>9, blank>1, 1>blank and 5>0.
- **Modern Art**'s shaded splotch (`2101`) uses indices 1-12 for its shades,
  and the `RED8`/`BLUE8`/... palettes recolour it; the `*DRIP8` ones do the
  same for the drip (`2102`).
- **Dominoes**' `DOMINO_METRIC` resources give the face inset (3, 3) and size
  (113x55) on a 119x61 tile. One of its 16-colour bitmaps (`235`) is
  truncated; `adclassic.py` now skips such bitmaps instead of stopping.
- **Artist**'s own pictures are not in this install - only their names, in its
  string table - so it paints the desktop and the SlideShow pictures.
- **Fractal Forest**'s `TREEDATA` is read as branching parameters. That is a
  guess from how the six records differ, not from the code.

Still to do: Ray (its `TRACES/*.TRC` are pre-rendered scenes in a packed span
format, not yet decoded - the module also carries an easter-egg cat that runs
and explodes), DrawMorph (`MORPH*.DAT`), and the staged scenes and games:
Confetti Factory, Daredevil Dan, Rat Race, You Bet Your Head and Lunatic
Fringe.

Boris and Mowin' Man are done, and both keep more than one set of pictures,
chosen by colour depth in the module's `RESINFO` table (type 32515):

- **Boris** has every frame three times: the 1000s in 256 colours, the 3000s in
  1-bit for monochrome screens, the 18000s in 16 colours. The 5000s are the
  1-bit AND masks for the 1000s (same id + 4000), and the butterfly is 15000s
  masked by 17000s. `15201` is truncated in the module.
- **Mowin' Man**'s masks (5200-5203) were drawn for its 16-colour mower
  (200-203) and fit those to 98-99%, but only two of the four fit the colour
  set (1200-1203) it uses from 16 colours up. Those pictures have two
  background colours each, one of which is also the tyres, so
  `all/art/mowin/` is cut out by hand-picked fills - see its `index.json`.
  Its three grass bitmaps are one blade each: a 9-pixel-wide DIB of which
  only the first column is drawn.

## adrun.sh — running the originals

Runs `AFTERDAR.SCR` headless under Xvfb, so we can see how a module is actually
meant to look. Needs `AD_SANDBOX` set to a directory holding `wine32/root` (an
unpacked 32-bit Wine) and `wineprefix`.

```sh
export AD_SANDBOX=/path/to/sandbox
tools/adrun.sh setup                    # stage AD40/ into the wine prefix
tools/adrun.sh list
tools/adrun.sh shot AD10th MARBLES      # one png
tools/adrun.sh clip AD10th MARBLES 20   # 20s mp4
tools/adrun.sh all                      # everything
```

Module choice and each module's own settings live in the registry; see the
comment at the top of the script. Two things to know:

- The engine only enables its 16-bit module loader when `GetVersionExA` reports
  a 9x platform, so the prefix has to claim Windows 98 for NE modules — and the
  PE modules render blank under that setting. The script picks per module.
- Whether a module paints is per module rather than per format: Chameleon is
  16-bit and paints fine, Hula is 32-bit and does not. Wine complains
  `K32WOWHandle16 handle ... has non-zero HIWORD` either way. Artwork extracts
  perfectly, so this only affects reference capture.
