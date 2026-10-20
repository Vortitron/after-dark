# After Dark in the Browser

![Flying Toasters in CSS](img/flying-toasters-css.jpg)

Do you longingly reminisce about the days when flying toasters graced your screen? Do words like "Confetti Factory" and "Daredevil Dan" make your heart skip a beat?

**[See them here!](https://vortitron.github.io/after-dark/)**

This started as [Bryan Braun's after-dark-css](https://github.com/bryanbraun/after-dark-css) — After Dark screensavers imitated with nothing but CSS animations and transforms, no images and no JavaScript. Those are all still here.

What's new is a second track: instead of redrawing the screensavers by eye, read the **original artwork out of the modules**.

## The decoded originals

After Dark ships each screensaver as a `.AD` file, which is just a Windows DLL — 16-bit NE for the 3.x and Twisted modules, 32-bit PE for the 4.0 and 10th-anniversary ones. The sprites, palettes, sound effects and the original control-panel settings all live in the resource table, and so does the module's own description of itself.

Most of the artwork is RLE-compressed inside a big-endian container Berkeley Systems carried over from the Mac. Rather than guess at the encoding, the opcode table was read out of the engine itself: `RLESequence::DrawFrame` in `ADXPL510.DLL` dispatches on the low nibble of each byte through a jump table at `CODE:0x431014`. Ten opcodes, transcribed in [`tools/adart.py`](tools/adart.py). The rest — the older modules, Marbles among them — keep plain Windows DIBs instead, which [`tools/adclassic.py`](tools/adclassic.py) unpacks.

Between the two, of the 99 modules here:

| | |
| --- | --- |
| Animated RLE artwork | 38 modules, 21,552 frames, 99.9% decoded |
| Still DIB artwork | 16 modules |
| No artwork — drawn in code | 45 modules |

The results are checked against the real thing: [`tools/adrun.sh`](tools/adrun.sh) boots the actual `AFTERDAR.SCR` engine headless under Wine and Xvfb, so a module can be recorded running and compared frame for frame.

Behaviour is reconstructed rather than decompiled, but from what the module says about itself: its settings, its class exports, its sound effect names and, in the 3.x modules, a description string that spells out what the thing is meant to do. Flocks names the Reynolds paper it implements; Flying Toasters' is the song lyric.

Having the artwork is not the same as being able to rebuild the module, though. Where each bitmap is a whole thing that moves on its own — a marble, a toaster, a gull, a fish — the module's settings supply the rest and it goes quickly. Where the sprites are parts that the original code composed into a character or a scene, it depends on the era. The 3.x modules kept that layout in code, so rebuilding one means watching the original run. The 4.0 and 10th-anniversary ones, and the Totally Twisted set, turned out to keep a recorded score beside their art: which picture goes where, tick by tick. So Bad Dog!, Super Guy, the Hula Twins and the 1996 Flying Toasters (karaoke and all) play the module's own choreography. Every module is here now, all 99 of them. See [tools/README.md](tools/README.md#what-is-actually-in-there).

See [tools/README.md](tools/README.md) for the whole pipeline.

## Layout

```
index.html          Display Properties, where After Dark for Windows lived
all/*.html          one page per screensaver
all/ad.js           loads decoded artwork and runs the animation loop
all/modules/*.js    what each screensaver actually does
all/art/<module>/   artwork + index.json, from tools/adweb.py or adclassic.py
tools/              extraction, decoding, emulation
AD40/               the original modules (local only — gitignored so GitHub Pages
                    does not try to publish ~80 MB of binaries and time out)
```

Two modules called Marbles turn up, and they are different screensavers. The
one people remember — small marbles dropping through a field of pins and
stacking at the bottom — is `MARBLES2.AD` from 1992. After Dark 4.0 shipped a
new `MARBLES.AD` named **Marbles!** that just drifts big rendered marbles
around. Both are here. There is also a tilt variant of the 1992 one
(`marbles-tilt.html`) that uses the device accelerometer so marbles fall toward
true down when you rotate the phone and the pile sloshes instead of snapping
onto a lattice.

The CSS screensavers are self-contained pages and open straight from disk. The decoded ones fetch their artwork, so they need serving over HTTP — `python3 -m http.server` from the repo root is enough.

Before pushing to GitHub Pages, the build stamp in the taskbar needs a bump so
phones drop their cache. You do not have to run that by hand: once, run

```
tools/install-hooks.sh
```

and every `git commit` will stamp `build.json` / `?v=…` cache-busters for you.
`tools/stamp.sh` is still there if you want to stamp without committing.

## Embedding one

Every screensaver here is a page in its own right, so the way that works anywhere is an iframe:

```html
<iframe src="https://vortitron.github.io/after-dark/all/marbles.html"
        width="640" height="480" scrolling="no" style="border:0"
        title="Marbles screen saver"></iframe>
```

The decoded ones are also custom elements, so if you are hosting the files yourself you can drop one straight into a page and set it with the original module's own options:

```html
<script src="all/ad.js"></script>
<script src="all/modules/marbles.js"></script>

<after-dark-marbles art="all/art/marbles2" pins="many" pin-size="big" speed="medium"
  style="display:block;width:640px;height:480px"></after-dark-marbles>
```

`art` points at the folder `adweb.py`/`adclassic.py` wrote, and the element fills whatever box you give it. The rest are:

| Element | Script | Options |
| --- | --- | --- |
| `<after-dark-toasters>` | `modules/toasters.js` | `objects` = flight / squadron / air wing / swarm |
| `<after-dark-toilets>` | `modules/toilets.js` | `crowd` = few / more / lots more / not pretty / phew!, `paper` = white / pastel / cow print / random, `occupant` = nobody / dumpin' dan / bessie / aaron / random |
| `<after-dark-marbles>` | `modules/marbles.js` | `pins` = none / few / many / lots, `pin-size` = x-small / medium / big, `speed` = slow / medium / fast, `redraw` = 10 sec … 2 hours. One marble at a time bounces down through the pins and stays where it stops |
| `<after-dark-marbles-tilt>` | `modules/marbles-tilt.js` | same options as marbles; gravity follows DeviceOrientation (tap to enable on iOS), and where there is no sensor the bungee cow hangs from a peg at the top as a plumb bob you can drag or steer with the arrow keys. Turning the phone over keeps the pile and the pins. When it fills up the walls give way, the marbles pour off the downhill edge and the pins go up as fireworks. Embed with `allow="accelerometer; gyroscope"` on the iframe |
| `<after-dark-flocks>` | `modules/flocks.js` | `kind` = birds / polliwogs / gnats / paparazzi / atoms / copters / dots, `size` = small / medium / large |
| `<after-dark-rebound>` | `modules/rebound.js` | `ball-type` = plastic / metal / both, `balls` = not many / more / lots more / bunches / oodles, `wobbly` and `clear-screen` are flags |
| `<after-dark-bogglins>` | `modules/bogglins.js` | `explosivity` = unstable / volatile / dangerous / evacuate!, `twanginess` = mild / rich / zesty / sharp |
| `<after-dark-om>` | `modules/om.js` | `entities` = 1–20, `life-energy` = 1000 kwh / 2000 kwh / 3000 kwh / 4000 kwh / 5000 kwh, `defrost` = never / rarely / occasionally / often / very often / almost always / constantly, `washer-karma` = none / a little / some / average / lots / complete |
| `<after-dark-gravity>` | `modules/gravity.js` | `balls` = 1–7, `size` = small / medium / large, `clear-screen` is a flag. No artwork: the original draws itself |
| `<after-dark-snake>` | `modules/snake.js` | `speed` = 0–9 (default 0), `maze-complexity` = 0–9 (0 = 20 px cells, n = 19 − n px), `pause-when-done` = 0 sec … 1 min (default 0 sec). No artwork |
| `<after-dark-zot>` | `modules/zot.js` | `forkiness` = few / forky / max forky! (how far forks run), `how-often` = rarely / sometimes / often / stormy!. No artwork |
| `<after-dark-draino>` | `modules/draino.js` | `speed` = slow / medium / fast (default fast), `direction` = clockwise / inward / counter (default counter), `drops` and `show-drain` are flags. Smears the desktop into the drain. No artwork |
| `<after-dark-shapes>` | `modules/shapes.js` | `color` (on by default) and `clear-screen` (off by default: shapes land on the desktop) are flags. No artwork |
| `<after-dark-spheres>` | `modules/spheres.js` | `max-size` = 10–100 (default 73), `offset` = 0–100 (default 10), `clear-every` = 1–200 (default 30); `clear-screen` is a flag, off by default. No artwork |
| `<after-dark-starry-night>` | `modules/starry-night.js` | `buildings` = none / few / some / many / lots, `height` = low / medium / tall / skyscrapers, `flasher` is a flag. The engine's own fallback, `STARRYNI.AD`; its shooting star is the module's one bitmap |
| `<after-dark-warp>` | `modules/warp.js` | `speed` = fast in / medium in / slow in / impulse in / impulse out / slow out / medium out / fast out, `stars` = 1–200 (default 71), `size` = small / big / both, `color` is a flag (off by default) |
| `<after-dark-hard-rain>` | `modules/hardrain.js` | `drops` = few / some / many / lots (default lots), `drop-size` = small / medium / large, `clear-screen` is a flag (off by default: it rains on the desktop) |
| `<after-dark-globe>` | `modules/globe.js` | `map` = earth / after dark / toaster (the bitmaps the install shipped), `speed` = slowest / slow / medium / fast / fastest, `mirror` = none / horizontal / vertical / both, `tilt` = 0 / 23 / 45 / 90 (ours; the original's Rotation control is its spin speed) |
| `<after-dark-messages>` | `modules/messages.js` | `message` = any of the eight it shipped with (out to lunch, coffee break, i quit!, …) or your own text, `move` = popping / floating / sliding, `speed` = sluggish / slow / medium / moving / quick / flying / zoom! |
| `<after-dark-mandelbrot>` | `modules/mandelbrot.js` | `delay` = 0 sec / 5 sec / 15 sec / 30 sec / 1 min, `colors` = earth / air / fire / water / random, `blockiness` = 1 / 2 / 4 / 8 / 16 |
| `<after-dark-rose>` | `modules/rose.js` | `speed` = lethargic / slow / moving / fast / swift / quick (default quick), `trail-length` = shortest / short / medium / long / longest, `big-dots` is a flag |
| `<after-dark-spiral-gyra>` | `modules/spiral.js` | `max-lines` = 20–360 (lines per turn, default 204), `min-lines` = 0–100 (% of max, default 28), `color-cycling` = 0–100 (default 32) |
| `<after-dark-string-theory>` | `modules/string.js` | `groups` = 1–4 (default 3), `strings` = 10–150 in tens or infinite (default 140), `color-speed` = 1–100 (default 96), `clear-screen` is a flag (default off) |
| `<after-dark-tunnel>` | `modules/tunnel.js` | `direction` = in / out, `shape` = r-rect / rect / random. Caps Lock turns it round, as it did |
| `<after-dark-zoom>` | `modules/zoom.js` | `colors` = any of the 21 palettes the module ships (smooth, saw, saw2 … oscillate2, banded; `random` is one of them, not a random choice), `speed` = slowest … zooommmin, `delay` = shortest … longest. Needs `palettes` pointing at `art/zoom` |
| `<after-dark-spotlight>` | `modules/spot.js` | `size` = random / 30 … 200 in steps of 10, `speed` = slow / medium / fast, `spots` = 1–4 |
| `<after-dark-punch-out>` | `modules/punch.js` | `shape` = circle / oval / square / rectangle / random, `size` = small / medium / large, `speed` = slow / medium / fast |
| `<after-dark-puzzle>` | `modules/puzzle.js` | `size` = small / medium / large, `speed` = slow / medium / fast, `invert-screen` is a flag |
| `<after-dark-worms>` | `modules/worms.js` | `wiggle` = straight / weavy / crawly / wiggly, `segments` = 2–20, `worms` = 1–20, `eat-screen` is a flag |
| `<after-dark-einstein>` | `modules/einstein.js` | `errors` = never / rarely / seldom / occasionally / frequently / almost always, `neatness` = very / not very / pretty bad / really bad / ugly ugly ugly / chalk disaster, `lines` = 1 / 5 / 10 / 20 / fill screen. Written in the module's own chalk font, stroke by stroke |
| `<after-dark-nonsense>` | `modules/nonsense.js` | `how-many` = curt / laconic / sagacious / proverbial / loquacious / tennysonian, `delay` = very short / short / medium / long / very long, `colored-background` is a flag |
| `<after-dark-dos-shell>` | `modules/dosshell.js` | `color` = amber / green / mono / programmer / random, `speed` = pokey / normal / fast / demon, `accuracy` = low / medium / high / perfect |
| `<after-dark-nocturnes>` | `modules/nocturne.js` | `density` = sparse / a few / a bunch / lots, `color` is a flag |
| `<after-dark-meadow>` | `modules/meadow.js` | `season` = spring / summer / fall / winter, `seasons-last` = 10 seconds … 1 week / forever |
| `<after-dark-frost>` | `modules/frost.js` | `size` = small / medium / large / huge, `palette` = bright / stormy / gray scale / ramped / electric / rainbows / sine / plasma / cycloid / random / icycloid, `maximize-speed` is a flag |
| `<after-dark-photon>` | `modules/photon.js` | `length` = 1–32, `burst-delay` = none / 1/2 sec. / 1 sec. / 2 sec. / 5 sec. / 10 sec. / 30 sec., `burst` = mixed / photon / electron / proton / neutrino, `always-centered` is on unless `always-centered="off"` |
| `<after-dark-sunburst>` | `modules/sunburst.js` | `delay` = slowest / slow / medium / fast / fastest (default slow) |
| `<after-dark-vertigo>` | `modules/vertigo.js` | `palette` = stingray / smooth / random, `pitch` = tight / loose / medium, `color-speed` = slow / medium / fast, `delay` = 0 secs … 1 minute |
| `<after-dark-stained-glass>` | `modules/stained.js` | `complexity` = low / medium / high, `duplication` = none / some / lots, `color` = few / medium / lots |
| `<after-dark-strange-attractors>` | `modules/strange.js` | `duration` = 5 seconds … 1 hour (15 steps, default 20 seconds), `color-speed` = none / slowest … fastest |
| `<after-dark-geobounce>` | `modules/geobounce.js` | `shape` = tetrahedron / cube / octahedron / dodecahedron / icosahedron, `size` = 10–100 (default 54), `speed` = 0–100 (default 28), `faces` = shading / colors / both |
| `<after-dark-spin-brush>` | `modules/spin.js` | `switch-every` = 15 sec. … never, `thickness` = 1–4 / variable, `spin` = spin / spiral / star / stretch / random, `use-screen` is a flag |
| `<after-dark-boris>` | `modules/boris.js` | `cats` = 1–4, `butterfly` = never / rarely / seldom / occasionally / frequently / always, `color` is a flag |
| `<after-dark-mowin-man>` | `modules/mowin.js` | `speed` = pokey / normal / hurried / menace, `mow-every` = always / day / 2 days … week, `growth-rate` = none / slow / medium / fast, `clear-screen` is a flag (off grows the lawn over the desktop) |
| `<after-dark-clocks>` | `modules/clocks.js` | `type` = melting digital / classic / modern / art deco / mutating, `drift-speed` = glacial / slow / medium / fast, `mutation-rate` = 1 min. … 1 sec. / genx |
| `<after-dark-dominoes>` | `modules/dominoes.js` | `speed` = slow / medium / fast, `type` = wood / ivory / b&w / random |
| `<after-dark-modern-art>` | `modules/modern.js` | `style` = griddy / fuzzy / splotchy / random |
| `<after-dark-slideshow>` | `modules/slide.js` | `slides` = bitmaps (the catalogue it shipped) / pictures, `effect` = blink / rain / wipe / split / spiral / blinds / bars / reveal / dissolve / random, `delay` = no delay … 1 hr. |
| `<after-dark-artist>` | `modules/artist.js` | `medium` = aquarelle / chalk / pastel / felt-tip / \ -- \| / random, `detail` = abstract / coarse / fine, `delay` = 5 seconds … 1 hour, `image` = desktop / window / icons / pictures / all |
| `<after-dark-mountains>` | `modules/mountains.js` | `view` = boundaries / webs / mountains / constructions / highlands / random, `water` = frame / shell / sheet / surface / solid / random, `planet` = mercury … pluto / random, `complexity` and `zoom` |
| `<after-dark-fractal-forest>` | `modules/fractal.js` | `trees` = one / few / some / many, `type` = maple / elm / pine / poplar / sapling / random, `season`, `seasons-last` |
| `<after-dark-nirvana>` | `modules/nirvana.js` | `color` = smooth / stripes / contrast / rainbow / metal / lines / enamel / random, `redraw-every`, `activity` = serene … frenetic, `change-color` = never … always |
| `<after-dark-drawmorph>` | `modules/drawmorph.js` | `morph` = clock / pipecleaner man / the athletes / underwater / ribit / all aboard / my first morph / random, `speed` = jerky / stuttered / fairly smooth / smoother |
| `<after-dark-confetti-factory>` | `modules/confetti.js` | `ducks` = none / seven, `workshift` = 10 sec. / 30 sec. / 1 min. / 2 min. / 5 min. / 10 min., `type` = wood / metal / both. Caps Lock turns the belts round |
| `<after-dark-daredevil-dan>` | `modules/daredevil.js` | `risk` = $500 / $1,000 / $5,000 / $10,000 / $100,000 |
| `<after-dark-rat-race>` | `modules/ratrace.js` | `training` = drop out / grade school / high school / collegiate / professional, `track` is a flag |
| `<after-dark-you-bet-your-head>` | `modules/ybyh.js` | `contestants` = text only / 1 / 2 / 3, `timer` = 10 / 20 / 30 / 45 seconds, `show-answers` is a flag. Caps Lock and 1, 2, 3 to play |
| `<after-dark-lunatic-fringe>` | `modules/lunatic.js` | `level` = 1–10. Shows its attract pages (title and high scores, bestiary, plot and credits); Caps Lock to play (J / L or arrows turn, K or Up thrusts, Space fires, P shield) |
| `<after-dark-satori>` | `modules/satori.js` | `display` = fields / pools / rays / waves / leaves / mix / random, `colors` = arizona / siberia / tijuana / pacific / hawaii / nile / louisiana / camelot / colorado / atlantis / outback / ithaca / oz / random, `end-clarity` = 1x1 … 16x16, `knots` = 1–8 |
| `<after-dark-aqua>` | `modules/aqua.js` | `creatures` and `seaweed` are counts; the sea floor is on unless `sea-floor="no"` |
| `<after-dark-marbles-40>` | `modules/marbles-40.js` | `count` = a few / a pouch full / a jar full / a box full (how big the heap gets before a new board), `pattern` = random / 1–8 (which peg kinds are scattered). Pachinko: one marble at a time drops through the pegs |
| `<after-dark-fishpro>` | `modules/fishpro.js` | `fish` = solo / study group / class / school / university, `sea-floor` = none / static / animated, `select-fish` = a comma-separated list of species |
| `<after-dark-fish-world>` | `modules/fish-world.js` | `select-fish` = a species name (or comma-separated list), `bubbles` and `show-background` are flags (on by default). Every half hour a flying toaster goes by |
| `<after-dark-bugs>` | `modules/bugs.js` | `density` = nest / colony / infestation / swarm / plague / new york, `type` = scarab / jewel / roaches / ants / ladybugs / flys / all, `clear-screen="no"` to let the page show through |
| `<after-dark-rainforest>` | `modules/rainforest.js` | `number` = few / some / many / hordes, `creatures` = a comma list of dragonfly / peruvian / lehman / beetle / butterfly / turtle (`type` still works), `background` = desktop / black / leaves / wet blue / moss / lichen / rock / mottled / soft green / random, `foliage` is a flag |
| `<after-dark-cham>` | `modules/cham.js` | `quantity` = few / some / more / some more / lots or 0–100 (default 55: five chameleons, four out at once), `zest` = laconic / perky / frisky / hyper or 0–100, `vomiter` = none / upset tummy / nauseous / sick / poisoned / vomitorium or 0–100, `desktop="off"` for black |
| `<after-dark-toxic>` | `modules/toxic.js` | `critters` = depopulated / lonely / fruitful / swarming / festering, `lung-capacity` = thimble / cup / quart / gallon / barrel, `swamp-floor` is a flag |
| `<after-dark-phlegm>` | `modules/phlegm.js` | `behavior` = pesky / unruly / ill-mannered / horrid / atrocious / kill it!!!, `mess` = unkempt / besmirched / disquieting / nauseous / disgusting / art form / are you crazy?!, `clear-screen="no"` to play over the painted desktop |
| `<after-dark-guernsey>` | `modules/guernsey.js` | `flavor` = vanilla / chocolate / strawberry / blueberry / grape / banana / lemon-lime / rainbow splash / bubble gum / cinnamon / mint / tutti-frutti |
| `<after-dark-bungee>` | `modules/bungee.js` | `jumper` = daredevil / half daredevil / cow / fish / half fish / random, `jumps` = one / few / many / droves / whole bunches / hundreds (how many before the screen is wiped), `equipment` = safe / reliable / used / so - so / purfikt (the chance the rope holds: 100 / 75 / 50 / 25 / 0%) |
| `<after-dark-toaster-2k>` | `modules/toaster-2k.js` | `objects` = flight / squadron / air wing / swarm, `toasters` = adults / babies / random. Flies on the module's own choreography (`art/toast2k/runs.json`) |
| `<after-dark-toasters-2>` | `modules/toasters-2.js` | `flying-things` = 1–12, `toast` = light / medium / dark, `color` is a flag (off uses the module's black-and-white bitmaps) |
| `<after-dark-toasters-40>` | `modules/toasters-40.js` | `objects` = flight / squadron / air wing / swarm, `toasters` = adults / babies / random, `music` = never / 1 min. / 2 mins. / 5 mins. / 30 mins. / always (no sound; "never" turns the karaoke off, as in the module), `display-karaoke` is a flag. Plays the module's own compound-sequence choreography: gags, the wedding, baby toasterettes, the bouncing-bagel karaoke |
| `<after-dark-ray>` | `modules/ray.js` | `objects` = 1–5, `shape` = bouncsph / multisph / rotcube / rotpyra / diamond / diabounc / torus / random (the TRACES files it shipped), `shadows` = none / black / grey and `backdrop` = desktop / pattern / boxes are accepted but only the desktop is drawn. Composites the pre-traced glass and mirror shapes over the desktop the way the module's own code does |
| `<after-dark-bad-dog>` | `modules/baddog.js` | `discipline` = lax / easygoing / moderate / strict / dictatorial, `freeze-motion` and `shuffle-behaviors` are flags, `debug` = all / control panel / window / trash / inside desk / icons / other desktop / non-desktop / black screen |
| `<after-dark-bad-dog-40>` | `modules/baddog-40.js` | `clear-screen` is a flag (on: icons on black, no taskbar, no taskbar gags) |
| `<after-dark-swan-lake>` | `modules/swans.js` | `speed` = too slow / just right / too fast / absurdly fast, `num-swans` = 1–10, `synchronized-swim` is a flag |
| `<after-dark-mowin-boris>` | `modules/mboris.js` | `mower-speed` = sluggish / normal / hurried / manic, `cats` = 1–6, `revenge` = never / rare / sometimes / frequent / always (Always: Boris drives and mows the Mowin' Men) |
| `<after-dark-frankenscreen>` | `modules/franken.js` | `coherency` = humanoid / disfigured / mutated / horrific / hellspawned, `blemishes` = pretty boy / teenager / craterface / disfigured / scarface, `lifespan` = brief / short / medium / lengthy / interminable. Caps Lock makes a new creature |
| `<after-dark-mime-hunt>` | `modules/mimehunt.js` | `mimes` = one / few / more / even more / lots, `weapon` = shotgun / bazooka / mimeslayer / random, `cybermood` = benevolent / bored / postal / sadistic / manic. Caps Lock to take the crosshairs, click to shoot |
| `<after-dark-mikes-life>` | `modules/mikes.js` | `activity-level` = 0–100 (does absolutely nothing, as in the original) |
| `<after-dark-voyeur>` | `modules/voyeur.js` | `pace` = pokey / mellow / brisk / quick / fast, `order` = random / in order |
| `<after-dark-shadow-agents>` | `modules/shadow.js` | `agents` = solo / few / many / lots / bunches, `clear-screen` is a flag (off sneaks across the desktop) |
| `<after-dark-out-n-about>` | `modules/out.js` | `crowd` = calm / lively / bustling |
| `<after-dark-super-guy>` | `modules/superguy.js` | none; its one control is Background Sound. Captions are lettered from the module's own font and caption lists |
| `<after-dark-hula-twins>` | `modules/hula.js` | `music` = never / 1 min. / 2 min. / 5 min. / 30 min. / always - how long they hula, then the hoops go down |
| `<after-dark-cyber>` | `modules/cyber.js` | `color` = cyan / blue / amber / green / random |
| `<after-dark-life>` | `modules/life.js` | `calculate` = life / universe / everything / nothing / love / money, `years` = 1 million … 9 million (as the module says, these do nothing) |
| `<after-dark-rodger-dodger>` | `modules/rodger.js` | `load-saved-level` is a flag (S saves level and lives in this browser). Plays itself; Caps Lock to play (arrows or keypad 8 4 6 2, P pauses, Space resumes) |
| `<after-dark-rock-paper-scissors>` | `modules/rps.js` | `stars-to-win` = 1 / 2 / 3 / 4, `display-score` is a flag. Caps Lock (or a tap) to play the computer: R / P / S |
| `<after-dark-art-critic>` | `modules/critic.js` | `pictures` = pictures / bitmaps / none (SlideShow's two catalogues out of `slides`, default `art/slide`; none is an empty folder and gets the "Sorry…" line and made-up abstracts), `critic-appears` = never / rarely / often / always, `duration` = 10 seconds … 15 minutes, `display` = in order / random |
| `<after-dark-time-flies>` | `modules/time.js` | `type` = liquid / transformer / random, `sounds` = ticks / chimes / both / neither (silent here), `drift-speed` = still / very slow / slow / moderate / fast. Shows the real time; Caps Lock swaps the clock |
| `<after-dark-messages-40>` | `modules/messages40.js` | `style` = fontasia / foggy / random, `duration` = short / medium / long, `message` = out to lunch / gone for the day / i quit! / be right back / gone for a caffeine fix / custom / random, or any other text as your own (`custom="…"` sets the Custom one) |
| `<after-dark-magic-turtle>` | `modules/turtle.js` | `display` = program 1–8 / random (the eight programs inside TURTLE.AD, interpreted), `speed` = snail / turtle / mule / rabbit / racehorse, `show-edit-message` is a flag |
| `<after-dark-points-of-view>` | `modules/points.js` | `new-shapes` = 10 seconds / 30 seconds / 1 minute / 5 minutes / 10 minutes, `color` = white / yellow / green / blue / random, `bigger-dots` is a flag. Caps Lock changes shape |
| `<after-dark-slow-burn>` | `modules/slowburn.js` | `burn` = sizzling / crackling / searing / scorching / scalding / inferno |
| `<after-dark-swirling-magic>` | `modules/swirling.js` | `pixies` = some / a few / plenty / loads / tons or 0–100 (default 35), `look` (the Style control) = swirling magic / spaghetti magic / tiled magic / peacock image / random, `palette` = bluesreds / candy / desert / reds / rainbow / field / sparkle / random; Caps Lock changes palette |
| `<after-dark-psycho-deli>` | `modules/psycho.js` | `picture` = tie-dye / the dome / peacock / the well / jagged / night train / splash / head cheese / pinwheel / gozar / crop circles / random, `speed` = slow / fast / faster / fastest or 0–99 (default 41), `knots` = center / a few / some / many / lots / random; Caps Lock new colours |
| `<after-dark-hall-of-fame>` | `modules/hall-of-fame.js` | none (the module has no controls) |

The option names are the module's own, read out of its `TYPE_1000` control-panel strings.

Spotlight, Punch Out, Puzzle and Can of Worms work on "your desktop", and so do
Hard Rain and String Theory with Clear Screen First off. A page cannot read the
pixels of whatever is behind it, so `ad.js` paints a Windows 95 desktop for them
to shine a light on, punch, shuffle and eat.

The front page takes a saver's page name after a `#`, so
`index.html#starry-night` opens with Starry Night in the monitor; the arrow keys
move through the list.

Every option also works as a query string, so a saver page is linkable with its settings set and no copy of the files needed:

```
all/marbles.html?pins=lots&pin-size=big&speed=fast
all/bungee.html?jumper=cow&equipment=purfikt&jumps=droves
all/zot.html?forkiness=max%20forky!&how-often=stormy!
```

The front page has a **Settings…** button that puts each module's own control panel back — the same options, in the module's own words — and applies them to the preview. **Embed…** then writes out the snippet with whatever is selected.

## Why?

Just for fun.

## License

* The HTML, CSS and JavaScript is licensed with [The MIT License](https://opensource.org/licenses/MIT).
* The [ChicagoFLF font](https://usemodify.com/fonts/chicago/) is licensed with [The SIL Open Font License](https://scripts.sil.org/ofl).

**The artwork is not mine to license.** The sprites under `all/art/`, everything under `AD40/`, and the images throughout are © Berkeley Systems, Inc. The tools here decode a file format; they don't grant any right to what's inside it. Treat this as preservation and reverse engineering, and use at your own risk — [the original project's take on that is here](https://github.com/bryanbraun/after-dark-css/issues/3#issuecomment-127814083).

## Thanks to

[Bryan Braun](https://github.com/bryanbraun/after-dark-css), whose CSS screensavers this is forked from.

[Jonathon Sampson](https://twitter.com/jonathansampson), [Keith Clark](http://codepen.io/keithclark/), [Rob Glazebrook](http://www.cssnewbie.com/pure-css-bouncing-ball), [Ryan Justice](http://ned.highline.edu/~ryan-j/200/final/) and others for posting tutorials & demos on CSS animations.

[N. Landsteiner](http://www.masswerk.at/flyer/), [David Donarumo](http://www.youtube.com/watch?v=M1w1SQ3ezh8), and [Lazy Game Reviews](http://www.youtube.com/watch?v=ANnYbX54oU4) for online preservation of what the original screensavers looked like.

Robin Casady for the Public Domain [ChicagoFLF](http://christtrekker.users.sourceforge.net/fnt/chicago.shtml) font.

The original screensavers and artwork are © 1989–1998 Berkeley Systems Inc.
