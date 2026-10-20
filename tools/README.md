# After Dark pipeline

The tools that turn the original screensaver modules in `../AD40/` into
something a browser can use. They only need Python 3 + Pillow, except
`adrun.sh`, which needs a 32-bit Wine.

```
AD40/**/*.AD  ──adextract.py──▶  raw resources
              ──adart.py─────▶  decoded sprite sheets (PNG)
              ──adweb.py─────▶  all/art/<module>/  (strips + index.json)
              ──adclassic.py─▶  all/art/<module>/  (the 3.x modules, see below)
              ──adtext.py────▶  all/art/<module>/  (text, chalk and grammar)
              ──admovie.py───▶  a 4.0 module's recorded choreography (JSON)
              ──adfilm.py────▶  a Twisted module's films, into its index.json
              ──adray.py─────▶  all/art/ray/  (Ray's pre-traced scenes)
              ──adsrf.py─────▶  all/art/hall-of-fame/  (out of hof.srf)
              ──adrun.sh─────▶  the real thing running under Wine (reference)
```

`adrle.py --check` reports how many of a module's frames close at exactly their
IHDR height, which is how the row opcodes below were found. `adchoreo.py` is the
Bad Dog! choreography exporter that `admovie.py` generalises.

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

For a long time the decoder took every byte with a low nibble of 0 as "end of
row". The row-offset builder at `CODE:0x431cec` says there are three: `0x10`
ends the row, `0x00` ends the frame, and `0x30 HH LL` makes the next row a copy
of row `HHLL` (big-endian, already decoded). Most modules only write `0x10`,
which is why it went unnoticed; the flat parts of the 4.0 modules - Bad Dog!'s
fake desktop, the Hula Twins' chalk drawings, Time Flies' clock housing - are
mostly copied rows and decoded to stripes. It changes 5858 frames across about
25 modules. With it, every BADDOG, HULA and BADDOG3 frame closes exactly.

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

That was the first reading, and it turned out too gloomy. Bungee Roulette was
first rebuilt with its rope and drop drawn in code; it is in fact an OF film
like the Twisted modules (see below), with the rope, the snap, the fall and the
splat all in its score, and its exported `JumperSprite` / `FallSprite` code says
the rest - one jumper at a time, and the rope holds 100 / 75 / 50 / 25 / 0% of
the time by Equipment. Most "staged scenes" are like that.

The second and third groups are otherwise portable by watching the original
run and rebuilding the staging by eye — which is what `adrun.sh` is for, and
which turns out to work for more modules than the note below used to claim.
Of 33 modules tried, 20 painted their own display and 13 fell back to Starry
Night, which is what the engine shows when a module will not load:

| | |
| --- | --- |
| Painted | BADDOG, CHAM, CRITIC, FISH, GUERNSEY, HALL OF FAME, LIFE, MARBLES, MESSAGES, OUT, PSYCHO, RAIN, RPS, SLOWBURN, SUPERGUY, SWIRLING, TOAST2K, TOASTER 2K, TOASTERS, TURTLE |
| Fell back to Starry Night | CYBER, HULA, MBORIS, MIMEHUNT, PHLEGM_B, POINTS, RATRACE, RODGER, SHADOW, TIME, TOXIC, VOYEUR, YBYH |

That was the first sandbox. The rebuilt one (see `adrun.sh` below) paints every
one of them except Ray and Points of View.

That is the useful result, because it is the staged scenes that need it. Bad
Dog paints its whole fake desktop — scattered folder icons, a 3D Application
window with a vase in it, and the dog — none of which is in the resource
table. Guernsey paints too, which is the way to fix its palette: its sprites
decode to grey noise because neither a CTAB nor a module PAL turns up for it,
and a capture says what the colours should be.

The 45 modules with no artwork at all draw themselves, so porting one means
writing the drawing. All of them run in the browser now; the first thirty-five:

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
They were written with no capture to check them against, because 16-bit
modules painted nothing under the first Wine sandbox. The rebuilt one runs them
(with `AD30RSDB.DLL` in place), so they can be checked now; that has not been
done yet.

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

The games and staged scenes are done too - Confetti Factory, Daredevil Dan,
Rat Race, You Bet Your Head and Lunatic Fringe - built from their parts,
since no module keeps a picture of its scene. And DrawMorph, whose morphs are
the text files beside it (`adtext.py morphs`). Worth knowing:

- **Rat Race** names its runners in `RATN 2000` (fifty-four of them) and writes
  on its tote board in `PICT 110`, spaced by its `STFT` table: the x of each
  glyph from ASCII 32.
- **You Bet Your Head**'s 228 questions are its `STRINGLIST`s from 10000 up,
  the right answer first.
- **Lunatic Fringe** keeps each sprite as frames stacked in one bitmap with a
  blank row between; the ships have 32 headings, up first and clockwise.

Ray is done too, which finished the 3.x set. Its `TRACES/*.TRC` are not
pictures but the output of a ray tracer: each pixel is a row of a 64 x 256
colour table and an offset into whatever is behind it, so the glass torus
really does bend your desktop. `tools/adray.py` has the format and the colour
arithmetic, both read out of the module's code (the compositor at segment 3
`0x0256`, the table builder at `0x08ea`). Ray now loads under Wine - it wants
`AD30RSDB.DLL` in `C:\windows`, an 8-bit display, and its scene file named in
`MODULES.INI` as `[Ray] RaySceneFile=` - and opens the trace, then dies of a
stack overflow in its 16-bit code (at `0x1476`), so where
it puts the shapes, its Pattern and Boxes backdrops, its shadows and the
exploding cat (PICT 1000) are not reproduced.

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

## The 4.0 and 10th-anniversary modules

Everything in `AD40/AD40/` and `AD40/AD10th/` runs now too. With the sandbox
rebuilt, all of them could be watched under Wine - the 16-bit ones as well, which
had painted nothing before - so each port was checked against its own
capture. They turned out to keep far more of their staging than the 3.x ones.

### Choreography is in the resources

`TYPE_8100`, `8101` and `8102`, in every 4.0 module that has them, are the
engine's CompoundSequence - a recorded score, not leftovers:

- **8100** is a list of composed pictures. Each is a union rect, then a count,
  then per layer a frame number, a channel (z), a flip flag and a rect on the
  module's stage (640x480 for most; Hula's is 671x407). Some files are eight
  bytes short at the end: the last record has no union rect.
- **8102** is the score: a short header (the count is at +12), then 10-byte
  records of id, byte offset of the picture in 8100, which 8100 resource it is
  in (RPS splits its fights over three), dx and dy. One record is one tick, ten
  a second in most modules.
- A run of consecutive ids is one action - a walk cycle, a gag, a hula move. Its
  first record repeats the picture the previous action ended on, and the
  engine lines the two up; that is how a walk carries someone across the
  screen.
- Frame numbers count through the module's strips in id order, each strip
  taking one number more than it has frames. Safer still is each `CSTM` chunk's
  own id (+4, low word, plus one), because CYBER's font numbers from zero again.
- **8101** only summarises: total size, the highest id, the stage size.

`tools/admovie.py X.AD <id> -o dir` writes any module's score as JSON
(`tools/adchoreo.py` is the Bad Dog! version it grew out of). What a run
*means* is in the code: the PE modules export their C++ symbols
(`objdump -p` - `Dog::Setup_PeeOnFolder`, `FlyingBigGag`, the RPS fighters'
vtables), and the constants each one pushes are the run ids. TOASTERS.AD's
classes - ToasterControl, TrafficControl, FlyingToaster, FlyingBigGag,
KaraokeControl - and `ADXPL510.DLL`'s `CompoundSprite` were ported outright.

### Per module

- **Flying Toasters! (4.0)** - 22000 is a 3309-frame stage library (flaps,
  rolls, the wedding, the cage, the intro pictures). The karaoke timing is
  16-byte `[frame, word, ms, type]` records at DATA `0x43a21c` (adult) and
  `0x43ac0c` (baby); the lines sit 3 px above the bottom and the bagel bounces
  at height - 31. Module timers compare against uptime, so a clock started at
  zero makes the first gags wait twenty seconds.
- **Toaster 2K** - `Toast2k.ad` and `Toaster 2k.ad` are one saver; the second
  lacks the scanner art and plays a different MIDI. 1709 steps; five runs need
  frames 573-787 that neither file ships, cut transform content. It inherits the
  lyric strips and karaoke table from TOASTERS.AD but has no control for them.
- **Flying Toasters (Toast2.ad)** - Bill Stewart's 1990 one: a single 64x64
  toaster with four wings and three toasts, named in its RESINFO (28677). It
  runs unthrottled under Wine, so only the look is confirmed. Slider defaults
  are a percentage at +0x18 of the TYPE_1000 entry, the range at +0x30.
- **Bad Dog! (4.0)** - 2667 cues; gag names from `Dog::Setup_*`. 23009 is the
  whole fake desktop - taskbar, icons, windows, Start menu - and STRINGLIST
  23010 the folder names. Every desktop part ships twice, Windows and Mac.
- **Bad Dog (1994)** - RLEP/RDAT is the ordinary container. No score: its
  behaviour is code (PerformCables, PerformAppearInHole, ...) and was rebuilt
  from recordings, where it paints on black. Its control-panel, window and icon
  tricks need a real Windows 3.1 desktop and are not reproduced.
- **Shadow Agents** - the huge shadows are 50% stipple frames in the same
  strips. What an agent does is a 26-way switch in the code.
- **Out 'n About** - DATA `0x420468` is a 28x7 table of runs per person,
  `0x420778` the passers-by. The waiter's chairs stay as their own sprites.
- **Super Guy** - 87 actions (jump table `0x412779`), 25 issues (DATA
  `0x420202`), captions from STRINGLIST 18000-18031 lettered in its own font
  (18500). The grey silhouettes are palette index 217, recoloured with the
  pavement by PAL 18200-18202.
- **Hula Twins** - nothing was missing from the capture: the backgrounds are
  the five chalk drawings, which had decoded to stripes. Cues 1-26 lay them out.
- **CYb3r W@t** - its font is 3500-3508, 180 glyphs at five levels of smear,
  with its own score; the chatter is STRINGLIST 3000-3004; the four colours
  are linear ramps (PAL 3200-3203) over cyan art.
- **Life & All** - the equation is code, measured off the capture.
- **Rodger Dodger** - 24 levels in DATA (pointers at `0x423834`): 18x14 cells
  stored as a checkerboard of wall bits, then items, revolving doors and
  teleporters. 25 thing types of 15 ints at `0x4205cc`.
- **Rock Paper Scissors** - a channel's high byte is the fighter (1 paper,
  3 rock, 4 scissors). Health 16, a jab 1, a heavy 4, 83 ms a frame.
- **Art Critic** - reads its pictures folder from `MODULES.INI`,
  `[Art Gallery] Art Path=`; the batch capture's "no valid files" was that.
  The eight frame styles are three pieces each, listed at `0x410668`.
- **Time Flies** - map canvases repaint only what changed, so draw onto a
  persistent canvas. Every digit animation spans one second.
- **Messages 4.0** - stock messages STRINGLIST 500; Foggy's letters carry the
  fog patches and the finger as extra objects.
- **Magic Turtle** - the eight programs are initialised data, not resources: a
  tag table (Posi = 0x15 ... Co = 0x243), then 100 twelve-byte cells each. The
  interpreter is at CODE `0x413550`. Tags contain digits (S1, S2).
- **Points of View** - TYPE_4000 is 603 int16 x, y, z triples; only the 47 ids
  in the table at `0x4344f0` are used. It paints black under Wine, so it is
  read from the code alone.
- **Slow Burn** - an infection model (classes BogSim, PaletteMusher) on a
  wrapping 224x224 board tiled over the screen.
- **Swirling Magic** - class Mana: three 256x256 whirlpool fields; a pixie's
  colour is its speed.
- **Psycho Deli** - its pictures are formulas over point charges, eleven
  parameter sets in a switch at `0x410c0c`; the BITMAPs are not them.
- **Hall of Fame** - the art is not in the module but in `hof.srf`, Midnight
  Software's resource file: `tools/adsrf.py`.

Common to many of them: a TYPE_1000 popup's default is the word at +0x18, and
sliders store 0-100.

### The Totally Twisted set are films

Mowin' Boris, FrankenScreen, Mime Hunt, Mike's So-called Life and Voyeur (1995)
keep the same kind of score under other type numbers: OFMM (32513) is the
header, OFST (32514) the timeline of `(tick, cel offset, chunk, dx, dy)`, OFTB
(32515 + chunk) the cels, each a rect and a stack of `(frame, layer, flags,
rect)` (flags bit 1 mirrors x, bit 2 mirrors y), and RDAT/RLEP (32517/32518) the
frames. `tools/adfilm.py` adds them to an art folder's `index.json`.

- A take runs from its start tick to the entry before the next take; that last
  entry is only a link and is not shown. The offsets are absolute per entry.
  Mowin' Boris' walk steps (3, 2, 2, 5, 3, 4, 4, 5) match the capture at ten
  ticks a second.
- Where each take starts is in the NE data segment - Boris' (state, tick,
  mirrored) triples, Mike's (state, tick) pairs. FrankenScreen and Mime Hunt
  export C++ symbols that name their parts (EyeGod, NoseSprite, DongleSprite).
- Frames number per film in Franken and Mime Hunt; Voyeur's had to be matched
  by sprite size. Voyeur's window scenes are all authored at one window, 99 x
  86.5 apart, and moved to the others.
- **Swan Lake** (1992) is picture 100 with a neck (300-305) and a body
  (400-403, at 28, 23) laid over it and the ripple 60 px below.
- `AD10th/TOILET.AD` is a smaller build of the same Flying Toilets, and
  `Toaster 2k.ad` of Toaster 2K.

## Checked against the originals (October 2026)

Once the sandbox ran the 16-bit modules, every port written before then was
compared with the real thing. Most were wrong, some completely: they had been
built from descriptions and resources without ever being seen running. What
each one now does, and what is still inferred, is in each module's header.

How the checking was done, and what to know before doing more of it:

- **Capture the 3.x modules at 8 bits** (`AD_DEPTH=8` in the capture wrapper;
  `Xvfb -screen 0 1024x768x8`). Many refuse anything else ("The Artist requires
  control of the palette", Lunatic "only runs in 16 & 256 color modes").
- **Colours from an 8-bit capture are wrong**: ffmpeg's `x11grab` maps the pixels
  through the default colormap, not the module's palette. `import -window <the
  1024x768 saver window>` sometimes does better, but not for the
  palette-animating modules. Judge shape, size, layout and timing from 8-bit
  clips, and take colours from the module's own PAL/CTAB resources.
- **`winver_for` must read the whole file.** 33 Classic modules have their NE
  header at exactly 0x400; reading only that much ran them as Windows 7, and
  they failed with "Unable to load selected module".
- **`select.reg` is per prefix**, or parallel slots select each other's modules.
- **Some modules want files or INI entries:** `MESG_AD3.DAT` and `NONSENSE.TXT` in
  `C:\windows`; `AD_PREFS.INI [After Dark] GlobeFile=`; `MODULES.INI`
  `[Slide Show] CatalogName=BITMAPS` (it opens `C:\windows\BITMAPS.ADC`, whose
  folder path sits at offset 0x25), `[The Artist] Image=`, `[Art Gallery] Art
  Path=`, `[Ray] RaySceneFile=`.
- **`ControlN` is TYPE_1000 resource id N+1**, counting empty records and
  checkboxes. Word 0 of a record is its type (0 hidden, 1 labelled slider,
  2 slider, 3 popup, 5 checkbox); the default is the word at +0x18. A labelled
  slider's default is a 0-100 value that picks the first label whose position
  (the table after the labels) is at or above it; a plain slider maps it onto
  min/max at +0x30; a popup's is an index. Modules use the raw value even when
  the panel would round it (Rebound: balls = value / 5; Chameleon's 55 is five
  chameleons). Writing some controls breaks a module: any value for BORIS or
  MARBLES2 blanks it, so capture their defaults by leaving the registry alone.
- **Many 3.x modules run unthrottled under Wine**, so a capture gives look and
  behaviour but not speed. `SIGSTOP`/`SIGCONT` on the process slows them enough
  to watch.
- **A two-second `WINEDEBUG=+relay` run** lists every GDI call a code-drawn
  module makes; Stained Glass and Nirvana were decoded that way.
- **Fonts:** EINSTEIN's (0,0) pen step inside a glyph is real - only trailing
  zeros are padding (`adtext.py` was cutting glyphs short).

A second pass (20 October) did the rest, mostly from `WINEDEBUG=+relay` traces of
each module's GDI calls rather than from captures, because several of these
draw something a capture cannot see:

- **Zot!** draws each strike and erases it again within one tick, so every
  capture is black; the trace shows a 1-px white bolt with grey forks.
- **Tunnel** draws once in black palette entries and then only animates the
  palette; `WINEDEBUG=+palette` prints every `AnimatePalette` colour. At 24 bits
  it takes a different path entirely, so check the depth before trusting a trace.
- **Warp!** is single white pixels, almost invisible in a capture.
- Some modules read a labelled slider's `ControlN` as a list *index* (Zot!,
  Warp!: write 0, 1, 2), others as a 0-100 position; out-of-range values give
  garbage or a blank screen.
- A 16-bit `CreateSolidBrush(0x02rrggbb)` is `PALETTERGB`: on real Windows it
  fills flat with the nearest entry of AFTERDAR.SCR's `AD_PALETTE` 104 (a 6x6x6
  cube plus greys). The 8x8 dither in Wine's 8-bit captures is Wine's, not the
  module's.
- A private copy of a prefix on its own 8-bit Xvfb, with `[HKCU\Software\Wine\X11
  Driver] PrivateColorMap=Y`, grabbed with `import -window`, gives true VGA
  colours for the code-drawn modules. Keep such copies under `~/.cache`: the
  scratch tmpfs fills up. `RelayInclude` under `HKCU\Software\Wine\Debug` keeps
  relay logs small enough to run for longer.

What each one turned out to be is in its header: Rose is dots from two
rotating vectors; Spiral Gyra draws every line four times, mirrored; String
Theory's strings run edge to edge with their ends turning corners; Sunburst is
rings of interlocking triangles; Snake is a depth-first search that erases
itself; Down the Drain smears blocks of the screen round into the drain;
Shapes is flat rectangles and ellipses; Spheres is 34 shrinking circles; Hard
Rain is black-filled coloured rings with a black erase; Meadow is a whole field
of blades under a horizon.

Still not checked, or not fixable this way:

- **Nocturnes** now loads but never blits in two minutes under Wine (it loops on
  `GetTickCount` and text colours); its loop would need disassembling.
- **Bugs** calls the unimplemented `USER.GetNextQueueWindow`; **Ray** dies of a
  stack overflow.
- **Spotlight, Punch Out and Puzzle** see a black desktop whatever is behind
  them, so only their defaults were corrected.

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
- Rebuilt in October 2026 from Ubuntu's `wine32:i386` 6.0.3 packages (fetched
  with `apt-get download` and unpacked with `dpkg-deb -x`, 133 of them), every
  module paints, 16-bit included - Hula as well, which used to fall back to
  Starry Night. The exceptions are Ray (below) and Points of View, which is
  black.
- The 3.x modules look for `AD30RSDB.DLL` in `C:\windows`; copy it there from
  `CLASSIC/`. Their sound DLL, `AD_SND`, will not start without a wave device
  to open, and takes the module down with it ("Unable to load selected
  module"); `adrun.sh` points Wine's ALSA at a silent default device in
  `$AD_SANDBOX/alsa/alsa.conf` (`pcm.!default { type null }` after including
  the system `alsa.conf`). Most 3.x modules also want an 8-bit display - they
  need control of the palette. Art Critic reads its pictures folder, and Ray its scene file, from
  `C:\windows\MODULES.INI`. Ray refuses to run on anything but an 8-bit
  display: start `Xvfb :98 -screen 0 1024x768x8` and set `AD_DISPLAY=:98`.
- `AD_PREFIX` picks the Wine prefix, so copies of it (`cp -a wineprefix
  wineprefix1`) on their own displays can capture side by side;
  `stop_engine` only ends what is running in its own prefix. Anything that
  holds a lock round a capture must not let the Xvfb it starts inherit the
  lock's file descriptor, or the slot stays locked forever.
- `select.reg` writes only the controls you pass, and the rest keep whatever
  the last capture set. Pass all of them when it matters.
- Some modules run unthrottled under Wine (Toast2), so a capture shows the look
  and not the speed.
