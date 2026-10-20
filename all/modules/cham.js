/**
 * cham.js - Chameleon, on the module's own artwork, film and code.
 *
 * CHAM.AD, 1995, from the 10th anniversary collection. Its own description:
 *
 *   "Chameleon. National Geographic never had it so good! We've baked every
 *    bizarre and disgusting behavior from the animal kingdom into these
 *    charming little creatures. Don't worry, the vomit washes off your desktop
 *    just fine.
 *    Quantity: Just how many chameleons can you stand?
 *    Zest: Crank it up, make 'em frisky!
 *    Vommeter: Controls the frequency of vomiting, of course!
 *    CapsLock: Hit it, and smite a chameleon."
 *   Art by Laurence Arcadias. Programming by Jeff "Trurl" Thomas.
 *
 * The art is a film, like the Totally Twisted modules': OFST timeline 1000
 * (1012 entries over 1236 ticks), cels in OFTB 1000-1001, frames in six RLEP
 * sequences numbered straight through from 1 (tools/adfilm.py with VOTE=1
 * gets that right). Frame 398 is not art: it is a 31x32 placeholder on
 * layer 1 where the icon a chameleon has its tongue on gets drawn
 * (MyOffset::DrawFrame). The art folder keeps those markers, the cel rects
 * and each sprite's OFTB size as well, because the code positions by them.
 *
 * Everything else is the module's code, which exports its C++ names
 * (Chameleon::DoState, ChamEngine::DoState, DoThatThingWithTheScreen, ...)
 * and runs on ADXPL40's CompoundSprite; both were read with capstone and are
 * followed here:
 *
 *  - A chameleon is a CompoundSprite. Its position is the centre of the
 *    current cel; stepping through a take moves it by the difference of the
 *    cel centres plus each entry's offset, and joining a new take goes
 *    through the take's link frame (the tick before it), lining up the art
 *    the two cels have in common - which is also how a chameleon turns
 *    round (the common frame is mirrored in one of them). NextSequence(n)
 *    starts at tick n and runs to the end of that run of ticks. A walk cycle
 *    is ticks 2-5: 17 px every 4 ticks, at the 125 ms tick, so 34 px/s.
 *  - Walking on is SetCenterPoint(target) and then CountFramesBackOutOfView
 *    / RollBackFrames: it is put back along the walk until it is off the
 *    screen, so it walks in and stops exactly there.
 *  - ChamEngine keeps Quantity/10 chameleons and lets Q - Q/3 of them (at
 *    least 4) out at once, sending "come on" to the first idle one; each one
 *    then waits up to 5 s, walks on from a random side to a random spot,
 *    stands, and from then on decides (state 3) after a pause that Zest sets:
 *    10, 7.5, 5, 2.5 s (Zest/20), taken only if a d100 beats Zest - 10. The
 *    decision is a d13: walk off (2), stand on (1), walk somewhere (1),
 *    fidget (1), sit up and look about (2), point at the screen (1/5 of 1),
 *    fetch a partner to the same side (1) or face to face (1), burp (1/4 of
 *    1), and be sick (2, if Vomiter > 20 and a d100 under it). Too near an
 *    edge, it walks off or walks back on.
 *  - Every decision starts a colour change to one of the nine PAL ramps
 *    1500-1508 (twenty colours each): 20 steps of 500 ms, and the module
 *    stops one step short of the new colours.
 *  - Partners: the one fetched walks up and stands where the pair take
 *    wants it, then hides; the other plays the take with both of them in it
 *    (CompoundSprite::Merge) - a sniff or a kiss, a tongue fight that can end
 *    with one eaten, or (high up the screen) a bonk on a folder that sets
 *    them both alight - and then gives the partner its place back.
 *  - Being sick ends, one time in four or five, with the puddle split off as
 *    another chameleon whose last frame is left on the desktop
 *    (LeaveImage); otherwise it eats it back up.
 *  - The desktop: DoThatThingWithTheScreen moves every window out of the way,
 *    reads the desktop icons and draws them again at random, not overlapping,
 *    one label in five swapped for one of its own folder names ("Sex GIFs",
 *    "Death Threats", ...). Up to ten are edible: a chameleon walks to one,
 *    gets its tongue on it (the icon comes off the desktop and travels on
 *    the tongue - the label stays), and eats it, or takes it off for a bit of
 *    folder fun and puts it back. Slots for icons that are not there sit at
 *    the top left corner, and the module goes for those too.
 *  - Caps Lock: the next one to decide turns to look at you and is
 *    flattened, after up to ten seconds of thinking about it. Zest above 95
 *    makes them do that on their own now and then.
 *  - After 15 minutes they all walk off and it starts again with the icons
 *    somewhere else; one engine pass in 50000 they all leave for a conga line.
 *
 * Checked against captures of the real module under tools/adrun.sh (24-bit,
 * 1024x768, on Wine's black desktop with its one "Screen Saver" icon, which
 * the module had moved): with the default settings four walk on at 34 px/s,
 * each up to five seconds after the last, stop for two ticks where they were
 * sent, then mostly walk on or off - changing colour over ten seconds as
 * they go; with the registry set by hand (which leaves the module one
 * chameleon) one walked to the icon, ate it - the icon gone, its label left
 * - was sick on the desktop and left it there, and walked off.
 * Inferred: how often an engine pass comes round for the 1-in-50000 conga
 * (taken as 30 a second); the desktop and its icons, which are ours
 * (AfterDark.desktop's Windows 95 icons) since a page cannot see yours;
 * no sound.
 *
 * The settings are its own, out of TYPE_1000, where each list item stands
 * for a value and the module reads the value: Quantity = Few 20 / Some 40 /
 * More 60 / Some More 80 / Lots 100 (default 55: five chameleons, four out
 * at once), Zest = Laconic 40 / Perky 60 / Frisky 80 / Hyper 100 (default
 * 51), Vomiter = None 20 / Upset Tummy 40 / Nauseous 60 / Sick 80 /
 * Poisoned 100 / Vomitorium 100 (default 27). A number 0-100 works too.
 * desktop="off" puts the icons on black, as on the capture machine.
 *
 *   <after-dark-cham quantity="more" zest="perky" vomiter="upset tummy">
 */
(function () {
  'use strict';

  var TICK = 125;                 // ms, Chameleon +0x166
  var POINT_TICK = 100;           // state 0x16 runs faster

  var QUANTITY = { 'few': 20, 'some': 40, 'more': 60, 'some more': 80, 'lots': 100 };
  var ZEST = { 'laconic': 40, 'perky': 60, 'frisky': 80, 'hyper': 100 };
  var VOMITER = { 'none': 20, 'upset tummy': 40, 'nauseous': 60, 'sick': 80, 'poisoned': 100, 'vomitorium': 100 };
  var DEFAULTS = { quantity: 55, zest: 51, vomiter: 27 };

  /* ds:0x306, ms, indexed by Zest/20. The sixth is whatever follows the
     table in the data segment (two words of the sound table), read as a
     dword - Hyper can stop a chameleon for a day and a half. */
  var PAUSE = [10000, 7500, 5000, 2500, 0, 0x07d107d0];

  /* ds:0x16a, the nine tongue takes of TongueEat */
  var TONGUES = [0x37, 0x42, 0x4d, 0x59, 0x64, 0x6f, 0x7b, 0x85, 0x90];

  /* ds:0x356, thirty bytes each */
  var FOLDERS = ['Sex GIFs', 'After Dark', 'Toxic', 'Porn-Softcore', 'Porn-Hardcore', 'Games',
                 'More Games', 'Blackmail', 'Dirt', 'FooBar', 'PR Releases', 'Job Aps.', 'Resumes',
                 'Pirated Stuff', 'Passwords', 'Death Threats', 'Security Leaks'];

  /* PAL 1500-1508. The art is drawn in the first; a chameleon's colours are
     these twenty slots, faded from one ramp to another. */
  var RAMPS = [
    '33ff00 444444 005500 ffff33 007700 ff3300 eeeeee 004400 333333 003300 cc3300 bbbbbb cccccc 110000 cc0000 99cc66 669966 333366 dddddd aaaaaa',
    'ff3300 444444 993300 ffff33 993300 00ff00 eeeeee 330000 333333 660000 cc3300 bbbbbb cccccc 110000 cc0000 ffcc66 cc9966 333366 dddddd aaaaaa',
    'ff9999 444444 ff6699 ffff33 ff6699 ff3300 eeeeee f80075 333333 990033 cc3300 bbbbbb cccccc 110000 cc0000 ff6666 ff9966 333366 dddddd aaaaaa',
    'ffcc00 444444 cc6600 ffff33 996633 ff3300 eeeeee 993300 333333 663300 cc3300 bbbbbb cccccc 110000 cc0000 ffcc66 ff9966 333366 dddddd aaaaaa',
    'ff66ff 444444 9900cc ffff33 bd47ff ff3300 eeeeee 9900ff 333333 660099 cc3300 bbbbbb cccccc 110000 cc0000 ff99ff 669966 333366 dddddd aaaaaa',
    '66cc00 444444 336600 ffff33 007700 ff3300 eeeeee 004400 333333 003300 cc3300 bbbbbb cccccc 110000 cc0000 99cc66 669966 333366 dddddd aaaaaa',
    '99ff66 444444 339933 ffff33 33cc33 ff3300 eeeeee 004400 333333 003300 cc3300 bbbbbb cccccc 110000 cc0000 99cc66 669966 333366 dddddd aaaaaa',
    '66ff66 444444 009933 ffff33 009933 ff3300 eeeeee 003300 333333 006600 cc3300 bbbbbb cccccc 110000 cc0000 99cc99 66cc66 333366 dddddd aaaaaa',
    '00ffcc 444444 00a6ff ffff33 6699ff ff3300 eeeeee 0038ff 333333 000082 cc3300 bbbbbb cccccc 110000 cc0000 a3cfff 669966 333366 dddddd aaaaaa'
  ].map(function (s) {
    return s.split(' ').map(function (h) {
      var v = parseInt(h, 16);
      return [(v >> 16) * 257, ((v >> 8) & 255) * 257, (v & 255) * 257];   // XRGBColor, 16 bits
    });
  });

  var HIDE = -1000;

  function randInt(n) {                      // ADXPL40 RandInt: 0 .. n-1
    return n > 1 ? Math.floor(Math.random() * n) : 0;
  }

  function trunc(a, b) {                     // idiv
    var q = a / b;
    return q < 0 ? Math.ceil(q) : Math.floor(q);
  }

  function intersects(a, b) {
    return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  }

  /* ------------------------------------------------------------ the film */

  function Film(film) {
    this.byTick = {};
    for (var i = 0; i < film.entries.length; i += 1) {
      this.byTick[film.entries[i][0]] = film.entries[i];
    }
    this.cels = film.cels;
    this.rects = film.rects;
    this.marks = film.marks;
  }

  Film.prototype.valid = function (t) { return t > 0 && !!this.byTick[t]; };
  Film.prototype.entry = function (t) { return this.byTick[t]; };
  Film.prototype.first = function (s) { return this.valid(s) ? s : 0; };
  Film.prototype.last = function (s) {
    if (!this.valid(s)) { return 0; }
    while (this.valid(s + 1)) { s += 1; }
    return s;
  };
  Film.prototype.link = function (s) { return this.valid(s - 1) ? s - 1 : s; };

  /* The cel's rect moved by the entry's offset: what the centres are
     measured on (CompoundSequence::GetFrameRect). */
  Film.prototype.frameRect = function (t) {
    var e = this.byTick[t], r = this.rects[e[1]];
    return [r[0] + e[2], r[1] + e[3], r[2] + e[2], r[3] + e[3]];
  };

  /* GetCenterDistance: how far the centre moves from tick a to tick b. */
  Film.prototype.distance = function (a, b, mirror) {
    var ra = this.frameRect(a), rb = this.frameRect(b), m = mirror ? 1 : 0;
    var dx = ((rb[0] + rb[2] + m) >> 1) - ((ra[0] + ra[2] + m) >> 1);
    var dy = ((rb[1] + rb[3]) >> 1) - ((ra[1] + ra[3]) >> 1);
    return [mirror ? -dx : dx, dy];
  };

  /* Where a cel puts one of its sprites, the cel centred on (x, y). A
     sprite is [seq, frame, layer, flags, l, t, w, h]; a marker is
     [layer, l, t, w, h]. */
  Film.prototype.place = function (t, l, top, w, x, y, mirror) {
    var r = this.rects[this.byTick[t][1]];
    var sl = mirror ? r[0] + r[2] - (l + w) : l;
    return [x + sl - ((r[0] + r[2]) >> 1), y + top - ((r[1] + r[3]) >> 1)];
  };

  /* ------------------------------------------------- the CompoundSprite */

  function Body(film) {
    this.film = film;
    this.x = HIDE; this.y = HIDE;
    this.frame = 0;              // tick shown, 0 for nothing (+0x3a)
    this.mirror = 0;             // +0x3c bit 0
    this.cur = 0;                // +0x42 sequence
    this.done = 0;               // +0x44
    this.just = 0;               // +0x46
    this.loops = 0;              // +0x4a
    this.queued = -1;            // +0x4c
    this.leave = 0;              // +0x4e
    this.queue = [];
  }

  Body.prototype.moveRel = function (f) {
    var film = this.film;
    if (film.valid(this.frame) && film.valid(f)) {
      var d = film.distance(this.frame, f, this.mirror);
      this.x += d[0]; this.y += d[1];
    }
    this.frame = f;
  };

  /* MoveThroughCommonArtFrame: keep the art two cels share where it is. */
  Body.prototype.moveCommon = function (f) {
    var film = this.film, a = this.frame;
    if (film.valid(a) && film.valid(f)) {
      var ca = film.cels[film.entry(a)[1]], cb = film.cels[film.entry(f)[1]];
      outer:
      for (var i = 0; i < ca.length; i += 1) {
        for (var j = 0; j < cb.length; j += 1) {
          if (ca[i][0] === cb[j][0] && ca[i][1] === cb[j][1]) {
            var p = film.place(a, ca[i][4], ca[i][5], ca[i][6], this.x, this.y, this.mirror);
            var m = this.mirror ^ ((ca[i][3] ^ cb[j][3]) & 1);
            var q = film.place(f, cb[j][4], cb[j][5], cb[j][6], 0, 0, m);
            this.x = p[0] - q[0]; this.y = p[1] - q[1];
            this.mirror = m;
            break outer;
          }
        }
      }
    }
    this.frame = f;
  };

  Body.prototype.nextSub = function (s) {
    var film = this.film;
    if (this.frame) { this.moveCommon(film.link(s)); }
    this.moveRel(film.first(s));
    this.cur = s;
    this.just = 1;
    this.queued = -1;
  };

  Body.prototype.next = function (s) {
    this.nextSub(s);
    this.leave = 0;
    this.queue = [];
    this.done = 0;
  };

  Body.prototype.nexts = function (list) {
    this.next(list[0]);
    this.queue = list.slice(1);
  };

  /* PlaySequence. Returns what LeaveImage asks to have stamped, if anything. */
  Body.prototype.play = function () {
    var film = this.film, stamp = false;
    this.done = 0;
    if (this.queued !== -1) { this.nextSub(this.queued); }
    var first = film.first(this.cur), last = film.last(this.cur);
    if (this.just) {
      this.just = 0;
    } else if (this.frame >= first && this.frame < last) {
      this.moveRel(this.frame + 1);
    }
    if (this.frame >= first && this.frame < last) { return false; }
    if (this.loops > 0) {
      this.loops -= 1;
      this.queued = this.cur;
    } else if (this.queue.length) {
      this.queued = this.queue.shift();
    } else if (this.leave) {
      this.leave = 0;
      stamp = true;
      this.queued = 0;
    } else {
      this.done = 1;
    }
    return stamp;
  };

  Body.prototype.setCenter = function (x, y) { this.x = x; this.y = y; };

  Body.prototype.frameWithin = function () {
    var last = this.film.last(this.cur);
    if (this.frame < this.cur || last < this.frame || this.cur <= 0) { return -1; }
    return this.frame - this.cur;
  };

  /* GetSequenceDelta(s, 1): the centre's move from the first to the last tick. */
  Body.prototype.delta = function (s) {
    return this.film.distance(this.film.first(s), this.film.last(s), this.mirror)[0];
  };

  Body.prototype.bounds = function () {
    if (!this.film.valid(this.frame)) { return [HIDE, HIDE, HIDE, HIDE]; }
    var r = this.film.rects[this.film.entry(this.frame)[1]];
    var l = this.x + r[0] - ((r[0] + r[2]) >> 1), t = this.y + r[1] - ((r[1] + r[3]) >> 1);
    return [l, t, l + r[2] - r[0], t + r[3] - r[1]];
  };

  /* The sprite or marker on a layer, in screen pixels: [l, t, r, b]. */
  Body.prototype.channel = function (layer) {
    var film = this.film;
    if (!film.valid(this.frame)) { return null; }
    var c = film.entry(this.frame)[1], i, s, p;
    for (i = 0; i < film.cels[c].length; i += 1) {
      s = film.cels[c][i];
      if (s[2] === layer) {
        p = film.place(this.frame, s[4], s[5], s[6], this.x, this.y, this.mirror);
        return [p[0], p[1], p[0] + s[6], p[1] + s[7]];
      }
    }
    for (i = 0; i < film.marks[c].length; i += 1) {
      s = film.marks[c][i];
      if (s[0] === layer) {
        p = film.place(this.frame, s[1], s[2], s[3], this.x, this.y, this.mirror);
        return [p[0], p[1], p[0] + s[3], p[1] + s[4]];
      }
    }
    return null;
  };

  /* MoveToAlignChannelRect: put the layer's top left on the rect's. */
  Body.prototype.alignChannel = function (layer, rect) {
    var c = this.channel(layer);
    if (!c) { return; }
    this.x += rect[0] - c[0];
    this.y += rect[1] - c[1];
  };

  Body.prototype.save = function () {
    return { x: this.x, y: this.y, frame: this.frame, mirror: this.mirror, cur: this.cur };
  };

  Body.prototype.restore = function (s) {
    this.x = s.x; this.y = s.y; this.frame = s.frame; this.mirror = s.mirror; this.cur = s.cur;
  };

  /* After next(walk) at the target: CountFramesBackOutOfView(screen, end)
     and RollBackFrames - wind back along the walk until it is off the screen,
     and leave it to play forward to here. */
  Body.prototype.walkIn = function (walk, end, screen) {
    var film = this.film;
    var saved = this.save();
    this.nextSub(end);
    var c = end, wraps = 0, n = 0;
    while (intersects(this.bounds(), screen) && n < 4000) {
      if (this.frame > film.first(c)) {
        this.moveRel(this.frame - 1);
      } else {
        if (c === walk) { wraps += 1; }
        this.moveRel(film.link(c));
        this.moveCommon(film.last(walk));
        c = walk;
      }
      n += 1;
    }
    if (n === 0) {
      this.restore(saved);
      this.next(0);
      return;
    }
    this.cur = c;
    this.just = 1;
    this.loops = c === walk ? wraps : 0;
    this.queued = -1;
    this.queue = [];
    this.done = 0;
  };

  /* --------------------------------------------------------- colours */

  function Colours() {
    this.from = RAMPS[0];
    this.to = RAMPS[0];
    this.now = RAMPS[0];
    this.id = 0;          // which ramp, +0x156 - 1500
    this.step = 20;       // +0x158
    this.at = 0;          // +0x15e
    this.key = 'base';
  }

  Colours.prototype.start = function (now) {
    if (this.step < 20) { return; }
    var id;
    do { id = randInt(9); } while (id === this.id);
    this.to = RAMPS[id];
    this.at = now + 500;
    this.id = id;
    this.step = 0;
  };

  Colours.prototype.update = function (now) {
    if (this.step >= 20 || this.at >= now) { return; }
    this.at = now + 500;
    var out = [], step = this.step;
    for (var i = 0; i < 20; i += 1) {
      var a = this.from[i], b = this.to[i], c = [];
      for (var k = 0; k < 3; k += 1) { c.push(a[k] + trunc(b[k] - a[k], 20) * step); }
      out.push(c);
    }
    this.now = out;
    this.step += 1;
    if (this.step === 20) { this.from = out; }
    this.key = out.map(function (c) { return (c[0] >> 8) + ',' + (c[1] >> 8) + ',' + (c[2] >> 8); }).join(';');
  };

  var BASE = {};
  RAMPS[0].forEach(function (c, i) { BASE[((c[0] >> 8) << 16) | ((c[1] >> 8) << 8) | (c[2] >> 8)] = i; });

  /* ----------------------------------------------------- one chameleon */

  function Cham(sim, id) {
    this.sim = sim;
    this.id = id;                     // +0x11a, 1-based
    this.body = new Body(sim.film);
    this.colours = new Colours();
    this.state = 0;
    this.pending = 0x8000;            // enter state 0
    this.wake = 0;                    // +0x15a
    this.tick = TICK;                 // +0x166
    this.dir = 0;                     // +0x11e
    this.partner = 0;                 // +0x122
    this.waiting = 0;                 // +0x13a
    this.grab = 0;                    // +0x140, take the icon off the desktop
    this.icon = -1;                   // +0x122 / +0x126 in the icon states
    this.tongue = 0;                  // +0x124
    this.flag13e = 0;
    this.x130 = 0; this.y132 = 0;
    this.target = [0, 0];             // +0x134
    this.saved = null;                // +0x84, SavePositionInto
    this.cache = {};
    this.cacheKey = '';
  }

  Cham.prototype.go = function (state) { this.pending = state; };

  Cham.prototype.run = function (now) {
    if (this.pending !== null) {
      var s = this.pending & 0x7fff;
      this.pending = null;
      this.state = s;
      this.enter(s, now);
      return;
    }
    this.colours.update(now);
    this.doTick(this.state, now);
  };

  /* the timer most ticks start with */
  Cham.prototype.due = function (now) {
    if (this.wake > now) { return false; }
    this.wake = now + this.tick;
    return true;
  };

  Cham.prototype.other = function () { return this.sim.chams[this.partner] || null; };

  Cham.prototype.capsCheck = function () {
    var sim = this.sim;
    if (sim.caps === 2 && this.body.x > sim.screen[0] - 40 && this.body.x < sim.screen[2] + 40) {
      sim.caps = 1;
      this.go(3);
      return true;
    }
    return false;
  };

  /* Chameleon::FreeCham - the first idle slot, as a partner. */
  Cham.prototype.freeCham = function () {
    var sim = this.sim;
    for (var d = 1; d <= sim.count; d += 1) {
      if (!sim.busy[d]) { this.partner = d; return true; }
    }
    return false;
  };

  Cham.prototype.stand = function () {
    this.x130 = this.body.x; this.y132 = this.body.y;
  };

  Cham.prototype.walkTo = function (x, y) {
    var b = this.body, sim = this.sim;
    b.setCenter(x, y);
    b.next(2);
    b.walkIn(2, 9, sim.screen);
  };

  Cham.prototype.enter = function (s, now) {
    var sim = this.sim, b = this.body, scr = sim.screen, p, r, i;
    switch (s) {
      case 0:
        this.tick = TICK;
        break;
      case 2:     // walk on to the target
        this.walkTo(this.target[0], this.target[1]);
        this.stand();
        break;
      case 3:     // decide, after a pause
        if (randInt(100) > sim.zest - 10) {
          var d = PAUSE[Math.min(5, Math.floor(sim.zest / 20))];
          this.wake = now + (d ? randInt(d >> 1) + (d >> 1) : 0);
        }
        b.next(10);
        this.stand();
        break;
      case 4: {   // walk to somewhere else on the screen
        var last = this.dir;
        sim.busy[this.id] = 1;
        this.stand();
        this.target[0] = randInt(scr[2] - scr[0] - 160) + scr[0] + 120;
        this.dir = this.target[0] < this.x130 ? 1 : 0;
        if (this.dir !== last) {
          b.next(0x1b);
        } else {
          this.walkLoops(this.target[0], -1);
        }
        this.stand();
        sim.inbox[this.id].type = 0;
        this.wake = now + this.tick;
        break;
      }
      case 5: {   // the conga line
        var cr = sim.film.frameRect(0x429), cw = cr[2] - cr[0], ch = cr[3] - cr[1];
        var tx = this.dir ? scr[2] + 40 : scr[0] - 40;
        var ty = randInt(scr[3] - scr[1] - ch) + ((ch) >> 1) + scr[1];
        b.setCenter(tx, ty);
        b.next(0x429);
        b.walkIn(0x429, 0x40e, scr);
        this.stand();
        this.wake = 0;
        void cw;
        break;
      }
      case 6:     // fetch a partner to stand alongside
      case 9:     // or to face it
        sim.inbox[this.partner] = { type: s === 6 ? 2 : 3, param: this.id };
        sim.inbox[this.id].param = 0;
        this.waiting = this.partner;
        this.wake = now + this.tick * 5;
        break;
      case 0xb: { // the pair, on a folder
        var o = this.other();
        if (o) { this.merge(o, 0x1a2); }
        this.icon = -1;
        for (i = 0; i < 10 && this.icon === -1; i += 1) {
          if (sim.icons[i].real) { this.icon = i; }
        }
        if (this.icon > -1 && sim.carried === null) {
          sim.carried = this.icon;
          this.grab = 1;
        } else {
          this.icon = -1;
        }
        break;
      }
      case 0xc: { // walk off the way it faces
        b.next(2);
        var delta = b.delta(2);
        this.stand();
        var edge = b.mirror ? scr[0] : scr[2];
        var q = trunc(this.x130 - edge, delta);
        b.loops = Math.abs(q) + 3;
        if (b.loops > 0) { b.done = 0; }
        break;
      }
      case 0xd:
        if (b.cur !== 0x135 && b.cur !== 0x124) { b.nexts([0x11c, 0x124]); } else { b.next(0x124); }
        break;
      case 0xe:
        if (b.cur !== 0x135 && b.cur !== 0x124) { b.nexts([0x11c, 0x135]); } else { b.next(0x135); }
        break;
      case 0xf: b.next(0x143); break;
      case 0x10: b.next(0xe); break;
      case 0x11: b.next(0xaf); break;
      case 0x12: { // FolderSex: any icon slot, at random
        var tries = 0;
        this.icon = -1;
        i = randInt(10);
        while (i < 10 && this.icon === -1) {
          if (!sim.icons[i].used) { this.icon = i; }
          i = randInt(10);
          if (tries++ > 50) { break; }
        }
        if (this.icon < 0) { break; }
        this.toIcon(0x171, 2, 2, -1, now);
        break;
      }
      case 0x13:  // TossEat
      case 0x14:  // TongueEat
        this.icon = -1;
        for (i = 0; i < 10 && this.icon === -1; i += 1) {
          r = sim.icons[i];
          if (!r.used) {
            if (r.rect[0] >= scr[0] && r.rect[2] <= scr[2] && r.rect[1] >= scr[1] && r.rect[3] <= scr[3]) {
              this.icon = i;
            }
            r.used = true;
          }
        }
        if (this.icon < 0) { break; }
        if (s === 0x13) {
          this.toIcon(0x156, 6, 1, -1, now);
        } else {
          this.tongue = TONGUES[randInt(9)];
          this.toIcon(this.tongue, 6, 2, -2, now);
        }
        break;
      case 0x15: b.next(0xb8); break;      // throw up
      case 0x16:  // look at the screen and be smitten
        this.tick = POINT_TICK;
        b.next(0x1ff);
        b.loops = -1;
        break;
      case 0x18:  // fetched: come and stand alongside
      case 0x19:  // fetched: come and face it
        p = this.other();
        if (!p) { this.go(0); break; }
        this.dir = s === 0x18 ? p.body.mirror : (p.body.mirror ? 0 : 1);
        if (s === 0x18 && b.mirror !== this.dir) { b.mirror ^= 1; }
        b.setCenter(p.body.x, p.body.y);
        b.frame = p.body.frame;
        b.next(9);
        b.moveCommon(s === 0x18 ? 0x374 : 0x196);
        r = b.channel(s === 0x18 ? 0x10 : 8) || b.bounds();
        this.x130 = (r[0] + r[2]) >> 1;
        this.y132 = ((r[1] + r[3]) >> 1) + (s === 0x18 ? 5 : 6);
        this.x130 += b.mirror ? 2 : -2;
        b.setCenter(this.x130, this.y132);
        if (s === 0x19 && b.mirror !== this.dir) { b.mirror ^= 1; }
        b.next(2);
        b.walkIn(2, 9, scr);
        this.stand();
        sim.inbox[this.id].type = 0;
        this.wake = now + this.tick;
        break;
      case 0x1a:  // the puddle, left on the desktop
        b.leave = 1;
        break;
    }
  };

  /* Stand where the take puts its tongue (layer 1) on the icon, and walk in. */
  Cham.prototype.toIcon = function (take, dy, dxMirror, dxPlain, now) {
    var sim = this.sim, b = this.body, rect = sim.icons[this.icon].rect;
    var cx = (rect[0] + rect[2]) >> 1, cy = (rect[1] + rect[3]) >> 1;
    var scx = (sim.screen[0] + sim.screen[2]) >> 1, scy = (sim.screen[1] + sim.screen[3]) >> 1;
    void cx; void scx;
    this.dir = cy < scy ? 1 : 0;           // the module compares the y's
    if (b.mirror !== this.dir) { b.mirror ^= 1; }
    b.next(take);
    b.alignChannel(1, rect);
    this.x130 = b.x;
    this.y132 = b.y + dy;
    this.x130 += b.mirror ? dxMirror : dxPlain;
    b.setCenter(this.x130, this.y132);
    b.moveCommon(9);
    b.next(2);
    b.walkIn(2, 9, sim.screen);
    this.stand();
    sim.inbox[this.id].type = 0;
    this.wake = now + this.tick;
  };

  /* Walk the walk cycle towards x: loops = |x130 - x| / delta - 1. */
  Cham.prototype.walkLoops = function (x, extra) {
    var b = this.body;
    b.next(2);
    var q = trunc(this.x130 - x, b.delta(2));
    var n = Math.abs(q) + extra;
    b.loops = n;
    if (n > 0) { b.done = 0; }
  };

  /* CompoundSprite::Merge: the partner goes blank, we play the pair take. */
  Cham.prototype.merge = function (o, take) {
    o.body.next(0);
    this.body.next(take);
  };

  /* Give the partner back its place and send it on (Chameleon state 0x17). */
  Cham.prototype.release = function (param, hide) {
    var o = this.other(), sim = this.sim;
    this.body.moveCommon(10);
    if (!o) { return; }
    sim.inbox[this.partner].type = 6;
    if (hide) {
      sim.inbox[this.partner].param = 0;
      o.body.setCenter(HIDE, HIDE);
    } else {
      if (o.saved) { o.body.restore(o.saved); }
      sim.inbox[this.partner].param = param;
    }
  };

  Cham.prototype.doTick = function (s, now) {
    var sim = this.sim, b = this.body, scr = sim.screen, box, o, k;
    switch (s) {
      case 0: {   // off stage, waiting to be sent for
        sim.busy[this.id] = 0;
        box = sim.inbox[this.id];
        if (box.type === 2 || box.type === 3) {
          var t = box.type;
          box.type = 0;
          this.partner = box.param;
          this.wake = now + this.tick;
          sim.busy[this.id] = 1;
          this.go(t === 2 ? 0x18 : 0x19);
        } else if (box.type === 5) {
          box.type = 0;
          this.wake = 0;
          sim.busy[this.id] = 1;
          this.go(0x1a);
        } else if (box.type === 7 || box.type === 1) {
          var type = box.type;
          box.type = 0;
          sim.busy[this.id] = 1;
          this.waiting = 0;
          this.partner = 0;
          this.dir = randInt(2);
          if (b.mirror !== this.dir) { b.mirror ^= 1; }
          if (type === 7) { this.go(5); break; }
          this.x130 = this.dir ? scr[2] + 40 : scr[0] - 40;
          this.target[1] = this.y132 = randInt(scr[3] - scr[1] - 80) + scr[1] + 40;
          this.target[0] = randInt(scr[2] - scr[0] - 80) + scr[0] + 40;
          this.wake = now + this.tick + randInt(5000);
          if (randInt(3)) { this.go(2); } else if (randInt(3)) { this.go(0x14); } else { this.go(randInt(2) ? 0x12 : 0x13); }
        }
        break;
      }
      case 2:
        if (!this.due(now)) { break; }
        if (sim.caps === 2 && b.x > scr[0] - 40 && b.x < scr[2] + 40) { sim.caps = 1; this.go(3); break; }
        b.play();
        if (b.done) { if (b.cur === 2) { b.next(9); } else { this.go(3); } }
        break;
      case 3:
        this.decide(now);
        break;
      case 4:
        if (!this.due(now)) { break; }
        if (this.capsCheck()) { break; }
        b.play();
        if (b.done) {
          if (b.cur === 0x1b) {
            this.stand();
            this.walkLoops(this.target[0], -1);
            b.play();
          } else if (b.cur !== 9) {
            b.next(9);
          } else {
            this.go(3);
          }
        }
        break;
      case 5:
        if (this.wake > now) { break; }
        this.colours.start(now);
        this.wake = now + this.tick;
        b.play();
        if (b.done) {
          if (!intersects(b.bounds(), scr)) {
            sim.busy[this.id] = 0;
            sim.parade = 0;
            this.go(0);
          } else {
            b.next(randInt(2) ? 0x40e : 0x429);
          }
        }
        break;
      case 6:
      case 9:
        this.pair(s, now);
        break;
      case 0xa:
        this.fight(now);
        break;
      case 0xb:
        if (!this.due(now)) { break; }
        if (this.icon === -1) { b.next(0x22e); this.go(0xa); break; }
        b.play();
        if (b.done) {
          if (b.cur === 0x1a2) {
            sim.carried = null; this.grab = 0;
            b.next(0x1d7);
          } else if (b.cur === 0x1d7) {
            b.next(randInt(2) ? 0x1eb : 0x1d7);
          } else if (b.cur === 0x1eb) {
            sim.carried = null; this.grab = 0;
            this.release(0, true);
            this.go(0);
          }
        }
        break;
      case 0xc:
        if (!this.due(now)) { break; }
        if (this.capsCheck()) { break; }
        b.play();
        if (b.done) { this.go(0); }
        break;
      case 0xd:
      case 0xe:
        if (!this.due(now)) { break; }
        b.play();
        if (b.done) {
          k = randInt(4);
          this.go(k < 2 ? 0xf : (k === 2 ? 0xd : 0xe));
        }
        break;
      case 0xf:
      case 0x10:
      case 0x11:
        if (!this.due(now)) { break; }
        b.play();
        if (b.done) { this.go(3); }
        break;
      case 0x12:
      case 0x13:
      case 0x14:
        this.iconTick(s, now);
        break;
      case 0x15:
        this.puke(now);
        break;
      case 0x16:
        if (!this.due(now)) { break; }
        b.play();
        var within = b.frameWithin();
        if (b.cur === 0x1ff && within === 12 && randInt(2) === 0) {
          b.next(0x211);
          this.wake += randInt(10000);
        } else if ((b.cur === 0x1ff && within === 18) ||
                   (b.cur === 0x20a && within === 7 && randInt(3) === 0)) {
          this.wake += randInt(10000);
          b.next(0x20a);
        }
        if (b.done) {
          b.setCenter(HIDE, HIDE);
          b.play();
          this.go(0);
        }
        break;
      case 0x17:  // hidden inside the partner's take
        box = sim.inbox[this.id];
        if (box.type === 6) {
          if (this.saved) { b.restore(this.saved); }
          b.next(10);
          if (box.param) { this.go(box.param); } else { b.setCenter(HIDE, HIDE); this.go(0); }
        } else if (!(o = this.other()) || o.partner !== this.id) {
          b.setCenter(HIDE, HIDE);
          this.go(0);
        }
        break;
      case 0x18:
      case 0x19:
        if (!this.due(now)) { break; }
        b.play();
        if (b.done) {
          if (b.cur !== 9) {
            b.next(9);
          } else {
            sim.inbox[this.partner] = { type: 4, param: this.id };
            this.saved = b.save();
            this.stand();
            this.go(0x17);
          }
        }
        break;
      case 0x1a:
        if (!this.due(now)) { break; }
        if (b.play()) { sim.stamp(this); }
        if (b.done) {
          b.leave = 0;
          b.setCenter(HIDE, HIDE);
          this.go(0);
        }
        break;
    }
  };

  Cham.prototype.decide = function (now) {
    var sim = this.sim, b = this.body, scr = sim.screen;
    if (sim.caps) { sim.caps = 0; this.go(0x16); return; }
    if (this.wake > now && !sim.release) { return; }
    this.colours.start(now);
    this.stand();
    if (this.x130 < scr[0] + 80 || this.x130 > scr[2] - 80) {
      this.go(randInt(2) ? 0xc : 4);
      return;
    }
    this.wake = now + this.tick;
    if (sim.zest > 95 && randInt(5) === 0) { this.go(0x16); return; }
    if (sim.release || this.y132 > scr[3]) { this.go(0xc); return; }
    var r = randInt(13), ok;
    if (r < 2) { this.go(0xc); }
    else if (r === 2) { this.go(3); }
    else if (r === 3) { this.go(4); }
    else if (r === 4) { this.go(0x10); }
    else if (r === 5) { this.go(0xd); }
    else if (r === 6) { this.go(0xe); }
    else if (r === 7) { if (randInt(5) === 0) { this.go(0x16); } }
    else if (r === 8 || r === 9) {
      ok = this.dir ? this.x130 < scr[2] - 40 : this.x130 > scr[0] + 40;
      if (ok && this.freeCham()) {
        sim.busy[this.partner] = 1;
        this.go(r === 8 ? 6 : 9);
      }
    }
    else if (r === 10) { if (randInt(4) === 0) { this.go(0x11); } }
    else if (sim.vomiter >= 21 && randInt(100) < sim.vomiter) { this.go(0x15); }
    void b;
  };

  /* states 6 and 9: wait for the partner to arrive, then the pair takes */
  Cham.prototype.pair = function (s, now) {
    var sim = this.sim, b = this.body, o = this.other(), box = sim.inbox[this.id];
    if (!this.due(now)) { return; }
    if (this.waiting && box.param === this.waiting && (s === 9 || b.done)) {
      this.waiting = 0;
      b.next(10);
      if (s === 6 && o && o.body.mirror !== b.mirror) { b.next(0x32a); }
    } else if (!o || o.partner !== this.id) {
      this.partner = 0;
      this.go(3);
      return;
    }
    if (this.waiting) {
      b.play();
      if (b.done && randInt(105 - sim.zest) === 0 && box.param !== this.waiting) {
        if (s === 6) { b.next(randInt(2) ? 0xe : 0xaf); } else { b.next(randInt(10) ? 0xe : 0xaf); }
      }
      return;
    }
    if (s === 9) {
      if (b.y < 200 && randInt(2) === 0 && sim.carried === null) { this.go(0xb); } else { this.go(0xa); }
      return;
    }
    if (b.cur === 10) { this.merge(o, 0x375); return; }
    if (b.cur === 0x32a) { b.play(); if (b.done) { b.next(10); } return; }
    b.play();
    if (!b.done) { return; }
    switch (b.cur) {
      case 0x375: b.next(randInt(2) ? 0x39e : 0x3cb); break;
      case 0x39e:
        this.flag13e = 1;
        this.release(randInt(3) === 0 ? 0x16 : 3);
        this.go(3);
        break;
      case 0x3cb: {
        var k = randInt(6);
        if (k < 3) { this.flag13e = 0; this.release(3); this.go(3); } else if (k < 5) { b.next(0x3dc); }
        break;
      }
      case 0x3dc:
        b.next(0x22e);
        this.go(0xa);
        break;
    }
  };

  /* state 0xa: the tongue fight */
  Cham.prototype.fight = function (now) {
    var sim = this.sim, b = this.body, o = this.other(), scr = sim.screen;
    if (!this.due(now)) { return; }
    if (b.cur === 9 || b.cur === 10) {
      if (o) { this.merge(o, 0x196); }
      this.stand();
      b.next(0x22e);
      return;
    }
    b.play();
    if (!b.done) { return; }
    switch (b.cur) {
      case 0x22e: b.next(0x23e); break;
      case 0x23e:
        if (randInt(2)) { b.next(0x254); } else { b.nexts([0x272, 0x294, 0x29d]); }
        break;
      case 0x29d:
        if (randInt(2)) { b.next(0x29d); break; }
        var reach = b.x + (b.mirror ? 1 : -1) * 366;
        b.next(reach < scr[0] || reach > scr[2] ? 0x2ad : 0x2c1);
        break;
      case 0x254:
      case 0x2ad:
      case 0x2c1:
        this.release(3, b.cur === 0x2c1);     // 0x2c1: it got eaten
        this.go(3);
        break;
    }
  };

  /* states 0x12-0x14: going for an icon */
  Cham.prototype.iconTick = function (s, now) {
    var sim = this.sim, b = this.body;
    if (!this.due(now)) { return; }
    if (this.icon < 0) { this.go(0); return; }
    b.play();
    if (!b.done) { return; }
    var take = s === 0x12 ? 0x171 : (s === 0x13 ? 0x156 : this.tongue);
    if (b.cur === 0) { this.go(0); return; }
    if (b.cur === 2) { b.next(9); return; }
    if (b.cur === 9) {
      if (sim.carried === null) {
        sim.carried = this.icon;
        this.grab = 1;
        b.next(take);
      } else {
        b.next(9);
      }
      return;
    }
    if (s === 0x12) {
      if (b.cur === 0x171) { b.next(0x181); }
      else if (b.cur === 0x181) { b.next(randInt(10) ? 0x181 : 0x187); }
      else if (b.cur === 0x187) {
        sim.icons[this.icon].used = false;
        sim.carried = null; this.grab = 0;
        this.go(randInt(2) ? 0x11 : 3);
      }
      return;
    }
    if (b.cur === take) {
      sim.carried = null; this.grab = 0;
      b.next(0x9d);
    } else if (b.cur === 0x9d) {
      this.go(randInt(2) ? 0x11 : 3);
    }
  };

  /* state 0x15 */
  Cham.prototype.puke = function (now) {
    var sim = this.sim, b = this.body, o;
    if (!this.due(now)) { return; }
    b.play();
    if (!b.done) { return; }
    switch (b.cur) {
      case 0xb8: b.next(0xc0); break;
      case 0xc0: b.next(randInt(2) ? 0xc0 : 0xc8); break;
      case 0xc8:
      case 0xe6:
        if (b.cur === 0xe6 && randInt(2)) { b.next(0xe6); break; }
        if (randInt(b.cur === 0xc8 ? 4 : 5) === 0 && this.freeCham()) {
          o = this.other();
          // CompoundSprite::Split: the puddle goes to another chameleon
          o.body.x = b.x; o.body.y = b.y; o.body.frame = b.frame; o.body.mirror = b.mirror;
          o.colours.now = this.colours.now; o.colours.key = this.colours.key;
          o.body.next(0xdc);
          b.next(0xe0);
          b.play(); o.body.play();
          sim.inbox[this.partner] = { type: 5, param: this.id };
          sim.busy[this.partner] = 1;
          this.go(3);
        } else {
          b.next(b.cur === 0xc8 ? 0xe6 : 0xf6);
        }
        break;
      case 0xe0:
      case 0xf6:
        this.go(3);
        break;
    }
  };

  /* --------------------------------------------------- the whole thing */

  function Chameleons(art, opts) {
    this.art = art;
    this.film = new Film(art.films ? art.films['1000'] : opts.film);
    this.quantity = opts.quantity;
    this.zest = opts.zest;
    this.vomiter = opts.vomiter;
    this.desktopOn = opts.desktop !== false;
    this.count = Math.max(1, Math.floor(this.quantity / 10));
    this.chams = [null];
    for (var i = 1; i <= this.count; i += 1) { this.chams.push(new Cham(this, i)); }
    this.busy = [];
    this.inbox = [];
    for (i = 0; i <= this.count; i += 1) { this.busy.push(0); this.inbox.push({ type: 0, param: 0 }); }
    this.caps = 0;          // +0x872
    this.release = 0;       // +0x874
    this.parade = 0;        // +0x876
    this.carried = null;    // +0x98a, the icon on someone's tongue
    this.icons = [];
    this.screen = [0, 0, 1024, 768];
    this.bg = null;
    this.time = 0;
    this.started = false;
  }

  Chameleons.prototype.limit = function () {
    var n = this.count;
    return n > 4 ? n - Math.floor(n / 3) : 4;
  };

  /* ChamEngine state 0: the desktop and the icons on it, chameleons off. */
  Chameleons.prototype.reset = function (w, h) {
    this.screen = [0, 0, w, h];
    this.releaseAt = this.time + 900000;
    this.release = 0;
    this.carried = null;
    for (var i = 1; i <= this.count; i += 1) { this.busy[i] = 0; }
    this.layout(w, h);
    this.started = true;
  };

  /* DoThatThingWithTheScreen: the icons again, at random. */
  Chameleons.prototype.layout = function (w, h) {
    var stock = this.stockIcons ? this.stockIcons() : [];
    var placed = [], i, tries;
    this.icons = [];
    for (i = 0; i < stock.length; i += 1) {
      var rect = null;
      for (tries = 0; tries < 200; tries += 1) {
        var cx = randInt(w - 32) + 16, cy = randInt(h - 32) + 16;
        var r = [cx - 16, cy - 16, cx + 16, cy + 16];
        var area = [r[0] - 22, r[1] - 4, r[2] + 22, r[3] + 30];
        if (!placed.some(function (p) { return intersects(p, area); })) { rect = r; placed.push(area); break; }
      }
      if (!rect) { continue; }
      var name = randInt(5) ? stock[i].name : FOLDERS[randInt(17)];
      this.icons.push({ rect: rect, name: name, image: stock[i].image, real: true, used: false });
    }
    this.icons = this.icons.slice(0, 10);
    while (this.icons.length < 10) {
      this.icons.push({ rect: [0, 0, 0, 0], name: '', image: null, real: false, used: false });
    }
    if (this.paintDesktop) { this.paintDesktop(w, h); }
  };

  /* ChamEngine state 3, once an engine pass; then every chameleon's turn. */
  Chameleons.prototype.step = function (dt) {
    if (!this.started) { return; }
    this.time += dt * 1000;
    var now = this.time, i;
    if (now > this.releaseAt) { this.release = 1; }
    if (!this.parade && Math.random() < dt * 30 / 50000) { this.release = this.parade = 1; }

    var busy = 0;
    for (i = 1; i <= this.count; i += 1) { if (this.busy[i]) { busy += 1; } }
    if (this.release && busy === 0 && !this.parade) {
      this.reset(this.screen[2], this.screen[3]);
      return;
    }
    if (this.parade && this.release && busy < 3) {
      var free = 0;
      this.release = 0;
      for (i = 1; i <= this.count; i += 1) { if (!this.busy[i]) { free = i; } }
      if (free) { this.inbox[free].type = 7; this.busy[free] = 1; } else { this.parade = 0; }
    }
    if (!this.release && !this.parade && this.limit() > busy) {
      for (i = 1; i <= this.count; i += 1) {
        if (!this.busy[i]) { this.inbox[i].type = 1; break; }
      }
    }
    for (i = 1; i <= this.count; i += 1) { this.chams[i].run(now); }
  };

  Chameleons.prototype.smite = function () { this.caps = 2; };

  /* LeaveImage: the puddle stays on the desktop. */
  Chameleons.prototype.stamp = function (c) {
    if (this.bgCtx) { this.drawBody(this.bgCtx, c); }
  };

  /* DrawToBackground: the icon off the desktop when it is taken, and back
     when FolderSex is through with it. */
  Chameleons.prototype.toBackground = function (c) {
    var g = this.bgCtx;
    if (this.carried === null) { return; }
    var icon = this.icons[this.carried];
    if (c.body.cur === 0x187 && c.body.frameWithin() === 2) {
      if (g && icon.image) { g.drawImage(icon.image, icon.rect[0], icon.rect[1]); }
      c.grab = 0;
    }
    if (c.grab) {
      if (g && icon.real) {
        g.fillStyle = this.desktopOn ? '#008080' : '#000';
        g.fillRect(icon.rect[0], icon.rect[1], 32, 32);
      }
      c.grab = 0;
    }
  };

  /* A frame in this chameleon's colours. */
  Chameleons.prototype.frameImage = function (c, seqId, fi) {
    var seq = this.art.sequence(seqId);
    if (!seq) { return null; }
    var f = seq.frames[fi];
    if (c.colours.key === 'base' || typeof document === 'undefined') {
      return { image: seq.image, x: f.x, y: f.y, w: f.w, h: f.h };
    }
    if (c.cacheKey !== c.colours.key) { c.cache = {}; c.cacheKey = c.colours.key; }
    var k = seqId + ':' + fi;
    var hit = c.cache[k];
    if (!hit) {
      var cv = document.createElement('canvas');
      cv.width = f.w; cv.height = f.h;
      var g = cv.getContext('2d');
      g.drawImage(seq.image, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      try {
        var d = g.getImageData(0, 0, f.w, f.h), px = d.data, pal = c.colours.now;
        for (var i = 0; i < px.length; i += 4) {
          if (!px[i + 3]) { continue; }
          var slot = BASE[(px[i] << 16) | (px[i + 1] << 8) | px[i + 2]];
          if (slot === undefined) { continue; }
          px[i] = pal[slot][0] >> 8; px[i + 1] = pal[slot][1] >> 8; px[i + 2] = pal[slot][2] >> 8;
        }
        g.putImageData(d, 0, 0);
      } catch (e) { /* a tainted canvas keeps the art's own colours */ }
      hit = c.cache[k] = { image: cv, x: 0, y: 0, w: f.w, h: f.h };
    }
    return hit;
  };

  Chameleons.prototype.drawBody = function (ctx, c) {
    var b = c.body, film = this.film;
    if (!film.valid(b.frame)) { return; }
    var cel = film.entry(b.frame)[1], sp = film.cels[cel], i, p;
    for (i = 0; i < sp.length; i += 1) {
      var s = sp[i];
      if (s[2] === 1) { continue; }
      var im = this.frameImage(c, s[0], s[1]);
      if (!im) { continue; }
      p = film.place(b.frame, s[4], s[5], s[6], b.x, b.y, b.mirror);
      var flipX = (b.mirror ^ (s[3] & 1)) === 1, flipY = (s[3] & 2) === 2;
      var x = Math.round(p[0]), y = Math.round(p[1]);
      if (!flipX && !flipY) {
        ctx.drawImage(im.image, im.x, im.y, im.w, im.h, x, y, im.w, im.h);
      } else {
        ctx.save();
        ctx.translate(x + (flipX ? s[6] : 0), y + (flipY ? s[7] : 0));
        ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
        ctx.drawImage(im.image, im.x, im.y, im.w, im.h, 0, 0, im.w, im.h);
        ctx.restore();
      }
    }
    // MyOffset::DrawFrame: layer 1 is where the carried icon goes
    if (this.carried !== null) {
      var icon = this.icons[this.carried], mk = film.marks[cel];
      for (i = 0; i < mk.length; i += 1) {
        if (mk[i][0] !== 1 || !icon.image) { continue; }
        p = film.place(b.frame, mk[i][1], mk[i][2], mk[i][3], b.x, b.y, b.mirror);
        ctx.drawImage(icon.image, Math.round(p[0]), Math.round(p[1]));
      }
    }
  };

  Chameleons.prototype.draw = function (ctx, w, h) {
    var i, c;
    for (i = 1; i <= this.count; i += 1) { this.toBackground(this.chams[i]); }
    if (this.bg) {
      ctx.drawImage(this.bg, 0, 0);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
    }
    var order = this.chams.slice(1).sort(function (a, b) { return a.body.bounds()[3] - b.body.bounds()[3]; });
    for (i = 0; i < order.length; i += 1) {
      c = order[i];
      this.drawBody(ctx, c);
    }
  };

  /* ------------------------------------------------------------ desktop */

  var UI = '11px "MS Sans Serif", "Microsoft Sans Serif", Tahoma, Arial, sans-serif';
  var STOCK = ['My Computer', 'Network Neighborhood', 'Inbox', 'Recycle Bin', 'My Briefcase', 'Letters'];

  /* The stock icons, cut out of AfterDark.desktop's Windows 95. */
  function stockIcons() {
    if (typeof document === 'undefined' || !window.AfterDark.desktop) { return []; }
    var d = window.AfterDark.desktop(200, 600);
    if (!d || !d.getContext) { return []; }
    return STOCK.map(function (name, i) {
      var c = document.createElement('canvas');
      c.width = 32; c.height = 32;
      c.getContext('2d').drawImage(d, 22, 10 + i * 70, 32, 32, 0, 0, 32, 32);
      return { name: name, image: c };
    });
  }

  function label(g, text, cx, y) {
    g.font = UI;
    g.textBaseline = 'top';
    g.textAlign = 'center';
    g.fillStyle = '#fff';
    var lines = text.length > 12 && text.indexOf(' ') > 0 ?
      [text.split(' ')[0], text.split(' ').slice(1).join(' ')] : [text];
    lines.forEach(function (l, i) { g.fillText(l, Math.round(cx), y + 1 + i * 13); });
    g.textAlign = 'left';
  }

  function paintDesktop(w, h) {
    /* jshint validthis: true */
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    var g = c.getContext('2d');
    g.fillStyle = this.desktopOn ? '#008080' : '#000';
    g.fillRect(0, 0, c.width, c.height);
    this.icons.forEach(function (ic) {
      if (!ic.real) { return; }
      g.drawImage(ic.image, ic.rect[0], ic.rect[1]);
      label(g, ic.name, (ic.rect[0] + ic.rect[2]) / 2, ic.rect[3] + 4);
    });
    this.bg = c;
    this.bgCtx = g;
  }

  /* ------------------------------------------------------------ element */

  function value(el, name, table) {
    var v = window.AfterDark.setting(el, name);
    if (v === null || v === undefined || v === '') { return DEFAULTS[name]; }
    v = String(v).toLowerCase().trim();
    if (table[v] !== undefined) { return table[v]; }
    var n = parseInt(v, 10);
    return isNaN(n) ? DEFAULTS[name] : Math.max(0, Math.min(100, n));
  }

  function ChamElement() { return Reflect.construct(HTMLElement, [], ChamElement); }
  ChamElement.prototype = Object.create(HTMLElement.prototype);
  ChamElement.prototype.constructor = ChamElement;
  Object.setPrototypeOf(ChamElement, HTMLElement);

  ChamElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var base = this.getAttribute('art') || 'art/cham';
    this.style.display = this.style.display || 'block';
    this.style.background = '#000';

    Promise.all([window.AfterDark.load(base), window.AfterDark.data(base)]).then(function (got) {
      var art = got[0];
      var desk = (window.AfterDark.setting(self, 'desktop') || '').toLowerCase();
      var sim = new Chameleons(art, {
        film: got[1].films['1000'],
        quantity: value(self, 'quantity', QUANTITY),
        zest: value(self, 'zest', ZEST),
        vomiter: value(self, 'vomiter', VOMITER),
        desktop: desk !== 'off' && desk !== 'no' && desk !== 'false'
      });
      sim.stockIcons = stockIcons;
      sim.paintDesktop = paintDesktop;

      var screen = new window.AfterDark.Screen(self);
      self._screen = screen;
      self.sim = sim;
      screen.onresize = function (w, h) {
        sim.screen = [0, 0, w, h];
        sim.layout(w, h);
      };
      sim.reset(screen.width, screen.height);

      self._onKey = function (e) {
        if (e.key === 'CapsLock') { sim.smite(); }
      };
      window.addEventListener('keydown', self._onKey);

      screen.run(function (dt, ctx, w, h) {
        sim.step(dt);
        sim.draw(ctx, w, h);
      });
    }).catch(function (err) {
      self.textContent = err.message;
    });
  };

  ChamElement.prototype.disconnectedCallback = function () {
    if (this._onKey) { window.removeEventListener('keydown', this._onKey); this._onKey = null; }
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-cham', ChamElement);
  window.AfterDarkCham = { Chameleons: Chameleons, Film: Film, Body: Body, RAMPS: RAMPS, QUANTITY: QUANTITY };
}());
