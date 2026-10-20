/**
 * toxic.js - Toxic Swamp, on the module's own artwork and its own film.
 *
 * Toxic.ad, 1995, from the 10th anniversary collection. Its own description:
 *
 *   "Take a tropical underwater paradise, add a touch of toxic waste, a
 *    sprinkle of contaminated syringes, and watch the whole eco system go down
 *    the tubes. That's just what happened here. Thank your lucky stars we
 *    didn't make it scratch-n-sniff. Watch for Larry the Lawyer!
 *    Critters: just how much can you stand?
 *    Lung Capacity: how long will the lawyer suffer? YOU decide.
 *    Fish Only: gives you only fish, if it's checked."
 *   Art by Robert Cuenca. Programming by Scott Garcia.
 *
 * The settings, out of TYPE_1000: Critters = Depopulated / Lonely / Fruitful /
 * Swarming / Festering (stored 20 40 60 80 100, default 53), Lung Capacity =
 * Thimble / Cup / Quart / Gallon / Barrel (20-100, default 53) and Show Swamp
 * Floor. "Fish Only" is in the resource but disabled (control type 5) and the
 * code never reads it, so it is not offered here.
 *
 * Like the Totally Twisted modules it is a film: an OFST timeline of 1082
 * ticks over the RLE frames of 9000-9002, cut into 119 takes. tools/adfilm.py
 * puts it in art/toxic/index.json; it needs VOTE=1, because the sequences are
 * numbered 1, 68 and 141 with no spare number between them.
 *
 * The module exports its C++ symbols, and what follows is the code of
 * FloorSprite and ToxicSwampSprite (NE segments 2 and 4) carried over state by
 * state rather than guessed at:
 *
 *  - The floor is drawn once into the background: the pipe (tick 7) at one
 *    end, then sand (1 or 3) tile by tile to the other edge, with the toilet
 *    (5) once, a third of the time, somewhere along it.
 *  - Nine floor sprites stand on it: the eye coral (105/152/199, which blinks
 *    and looks about), the thing in the pipe (9, coming out every 10-30 s:
 *    12, 31, 51), the clam (96, opening: 64), three bits of junk (98, 100,
 *    102), Larry the Lawyer (672-700), who sinks in from the top in his
 *    cement shoes and stands on the bottom fidgeting (710-749) until his
 *    Lung Capacity runs out - 30 s to 20 min - and then drowns by stages
 *    (766-874), and two things that only sink in after 12 minutes (900, 958).
 *  - Critters x 15 / 100 swamp sprites (default 7) swim across, each a random
 *    one of seven: the eel (211-293), the hermit thing that hides when a
 *    piranha comes within 70 px (383-450), the blue fish (465/481), the
 *    gar skeleton (498/513), the piranha (525-597, which turns round), the
 *    mutant fish (615-645) and the sea snake (656). Off one side, on at
 *    the other edge at a random height, again.
 *  - Every sprite ticks at 100 ms. Moving from one cel to the next keeps the
 *    picture registered: positions are cel centres (OFTB rect plus the
 *    entry's offset) and a step adds the difference of the two centres
 *    (CompoundSequence::GetCenterDistance), mirrored for a sprite facing the
 *    other way.
 *  - After 90 minutes the screen is wiped and the floor is gone for good.
 *
 * Checked against a capture of the real thing at the defaults: the floor along
 * the bottom 1024 px wide with the pipe at the left and the toilet, the coral,
 * Larry sinking and fidgeting, seven critters coming and going at their own
 * speeds. Not reproduced: the bubbling sound, and Caps Lock (which in the
 * original calls up a piranha, or the Easter-egg creature at 1021).
 *
 *   <after-dark-toxic critters="fruitful" lung-capacity="cup" swamp-floor>
 */
(function () {
  'use strict';

  var FILM = '9000';
  var TICK = 100;

  var CRITTERS = { 'depopulated': 20, 'lonely': 40, 'fruitful': 60, 'swarming': 80, 'festering': 100 };
  var LUNGS = { 'thimble': 20, 'cup': 40, 'quart': 60, 'gallon': 80, 'barrel': 100 };
  var DEFAULT = 53;           // what an unset control reads as

  /* FloorSprite::DoState's nudges for the pipe creature when it is mirrored. */
  var NUDGE = {
    10: [1, 0, -1, 0, 1, -1, 1, -1, 0, 0, 1, -1, 1, 0, 0, -1, 1, -1],
    11: [1, -1, 0, 0, 1, 0, 0, -1, 0, 0, 1, -1, 1, 0, 0, -1, 1, -1],
    12: [1, -1, 0, 0, 1, 0, 0, -1, 1, 0, -1],
    13: [0, 1, 0, -1, 0, 1, -1, 1, -1, 0, 0, 1, 0, 0, 0, 0, -1, 1, 0, 0, 0, 0, 0, 0,
         0, 0, 0, 0, 0, 0, 0, -1, 1, -1, 1, -1, 0]
  };

  function rand() { return Math.floor(Math.random() * 32768); }
  function rmod(n) { n = Math.abs(n); return n ? rand() % n : 0; }
  function half(v) { return v < 0 ? -((-v) >> 1) : v >> 1; }

  /* ------------------------------------------------------------ the film */

  function Film(art, film) {
    this.art = art;
    this.cels = film.cels;
    this.at = {};
    var self = this;
    film.entries.forEach(function (e) { self.at[e[0]] = e; });
    this.union = film.cels.map(function (cel) {
      var r = [Infinity, Infinity, -Infinity, -Infinity];
      cel.forEach(function (q) {
        var f = art.sequence(q[0]).frames[q[1]];
        r[0] = Math.min(r[0], q[4]); r[1] = Math.min(r[1], q[5]);
        r[2] = Math.max(r[2], q[4] + f.w); r[3] = Math.max(r[3], q[5] + f.h);
      });
      return r;
    });
  }

  Film.prototype.len = function (start) {
    var n = 0;
    while (this.at[start + n]) { n += 1; }
    return n;
  };

  Film.prototype.rect = function (tick) {
    var e = this.at[tick];
    if (!e) { return [0, 0, 0, 0]; }
    var u = this.union[e[1]];
    return [u[0] + e[2], u[1] + e[3], u[2] + e[2], u[3] + e[3]];
  };

  /** GetCenterDistance, unmirrored: the sprites mirror it themselves. */
  Film.prototype.dist = function (a, b) {
    var ra = this.rect(a), rb = this.rect(b);
    return [((rb[0] + rb[2]) >> 1) - ((ra[0] + ra[2]) >> 1),
            ((rb[1] + rb[3]) >> 1) - ((ra[1] + ra[3]) >> 1)];
  };

  /** Draw the cel of `tick` with its rect's top left at (left, top). */
  Film.prototype.drawAt = function (ctx, tick, left, top, mirror) {
    var e = this.at[tick];
    if (!e) { return; }
    var u = this.union[e[1]];
    var cel = this.cels[e[1]];
    for (var i = 0; i < cel.length; i += 1) {
      var q = cel[i];
      var seq = this.art.sequence(q[0]);
      var f = seq.frames[q[1]];
      var px = mirror ? left + (u[2] - q[4] - f.w) : left + (q[4] - u[0]);
      var py = top + (q[5] - u[1]);
      var m = !!(q[3] & 1) !== !!mirror;
      if (!m && !(q[3] & 2)) {
        ctx.drawImage(seq.image, f.x, f.y, f.w, f.h, px, py, f.w, f.h);
      } else {
        ctx.save();
        ctx.translate(px + (m ? f.w : 0), py + (q[3] & 2 ? f.h : 0));
        ctx.scale(m ? -1 : 1, q[3] & 2 ? -1 : 1);
        ctx.drawImage(seq.image, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
        ctx.restore();
      }
    }
  };

  /** ArtSprite::MoveSpriteAndFrame: the cel's rect centred on (x, y). */
  Film.prototype.draw = function (ctx, tick, x, y, mirror) {
    var e = this.at[tick];
    if (!e) { return; }
    var u = this.union[e[1]];
    this.drawAt(ctx, tick, x - ((u[2] - u[0]) >> 1), y - ((u[3] - u[1]) >> 1), mirror);
  };

  /* ------------------------------------------------------- shared moves */

  /* A sprite: position (centre), the take FIRST..LAST, the tick it is on,
     which way it faces (dir 1 = mirrored, and film steps are subtracted). */
  function Sprite(sim, index) {
    this.sim = sim;
    this.index = index;
    this.state = 0;
    this.x = -100; this.y = -100;
    this.FIRST = 0; this.LAST = 0; this.cur = 0;
    this.w = 0; this.h = 0;
    this.dir = 0; this.mirror = false;
    this.timer = 0;
    this.next = 0;
    this.shown = false;
    this.drawn = null;
  }

  Sprite.prototype.step = function (d) {
    this.x += this.dir === 1 ? -d[0] : d[0];
    this.y += d[1];
  };

  /** AdjustLocation: register tick b where tick a was. */
  Sprite.prototype.adjust = function (a, b, ax, ay) {
    var d = this.sim.film.dist(a, b);
    if (ax !== false) { this.x += this.dir === 1 ? -d[0] : d[0]; }
    if (ay !== false) { this.y += d[1]; }
  };

  Sprite.prototype.setTake = function (first, cur) {
    this.FIRST = first;
    this.LAST = first + this.sim.film.len(first) - 1;
    this.cur = cur === undefined ? first : cur;
  };

  Sprite.prototype.delta = function () {
    var F = this.sim.film;
    if (this.cur < this.FIRST) { return [0, 0]; }
    return this.cur >= this.LAST ? F.dist(this.LAST, this.FIRST) : F.dist(this.cur, this.cur + 1);
  };

  /** PlayLoop: true as it wraps. With `link` the wrap is the next step on. */
  Sprite.prototype.loop = function (link) {
    var d = this.FIRST === this.LAST ? [0, 0] : this.delta();
    this.step(d);
    this.cur += 1;
    if ((this.cur >= this.LAST && link) || this.cur > this.LAST) {
      this.cur = this.FIRST;
      return true;
    }
    return false;
  };

  Sprite.prototype.goto = function (n) {
    this.state = n;
    this.enter(n);
    return false;
  };

  Sprite.prototype.timeIn = function (ms) { this.timer = this.sim.now + ms; };
  Sprite.prototype.timeUp = function () { return this.timer <= this.sim.now; };

  /** One DoState, and on round until it has drawn (a change of state draws nothing). */
  Sprite.prototype.go = function () {
    for (var i = 0; i < 16; i += 1) {
      if (this.tick()) {
        if (this.cur >= this.FIRST || this.floor) {
          this.drawn = [this.cur, this.x, this.y, this.mirror];
          this.shown = true;
        }
        this.next = this.sim.now + TICK;
        return;
      }
    }
  };

  /* ------------------------------------------------------ swamp sprites */

  function Critter(sim, index) {
    Sprite.call(this, sim, index);
    // IToxicSwampSprite: the even ones come from the left
    this.want = index % 2 ? 0 : 1;
    this.dir = this.want;
    this.mirror = this.dir === 1;
    this.kind = 0;
  }
  Critter.prototype = Object.create(Sprite.prototype);

  /** PlayOnlyOnce: true at the end (and with `link`, a tick early). */
  Critter.prototype.once = function (link) {
    var d = this.delta();
    this.cur += 1;
    if ((this.cur >= this.LAST && link) || this.cur > this.LAST) {
      this.cur = this.LAST;
      return true;
    }
    this.step(d);
    return false;
  };

  Critter.prototype.offscreen = function () {
    var s = this.sim, hw = half(this.w), hh = half(this.h);
    if (this.state === 0) { return true; }
    if (this.x + hw <= 0 && this.dir === 0) { return true; }
    if (this.x - hw >= s.right && this.dir === 1) { return true; }
    return this.y + hh <= 0 || this.y - hh >= s.bottom;
  };

  Critter.prototype.piranhaNear = function () {
    var self = this;
    return this.sim.critters.some(function (o) {
      return o !== self && o.kind === 4 &&
        Math.abs(self.x - o.x) < 70 && Math.abs(self.y - o.y) < 70;
    });
  };

  var ENTRIES = [[0xd3, 1], [0x17f, 0xc], [0x1d1, 0x12], [0x1f2, 0x13],
                 [0x20d, 0x16], [0x267, 0x1e], [0x290, 0x23], [0x3fd, 0x24]];

  Critter.prototype.setUpEntry = function () {
    var s = this.sim, r;
    this.kind = rand() % 7;
    this.setTake(ENTRIES[this.kind][0]);
    r = s.film.rect(this.FIRST);
    this.w = r[2] - r[0]; this.h = r[3] - r[1];
    if (this.dir !== this.want) { this.mirror = !this.mirror; this.dir = this.want; }
    this.y = rmod(s.bottom - this.h) + half(this.h);
    this.x = this.dir === 0 ? half(this.w) + s.right : -half(this.w);
    this.cur = this.FIRST;
    return ENTRIES[this.kind][1];
  };

  Critter.prototype.enter = function (n) {
    switch (n) {
      case 0: this.shown = false; break;
      case 1: this.setTake(0xd3); this.timeIn(rand() % 3 * 1000 + 1000); break;
      case 2: this.setTake(0xe5); this.timeIn(rand() % 3 * 1000 + 1000); break;
      case 3: this.setTake(0xee); this.timeIn(rand() % 3 * 1000 + 1000); break;
      case 4: this.setTake(0xf9); this.timeIn(rand() % 3 * 1000 + 1000); break;
      case 5: this.setTake(0x103); this.timeIn(rand() % 3 * 1000 + 1000); break;
      case 6: this.setTake(0x10b); break;
      case 7: this.setTake(0x125); break;
      case 8: this.setTake(rand() % 2 ? (rand() % 2 ? 0x12f : 0x139) : (rand() % 2 ? 0x143 : 0x14d)); break;
      case 9: this.setTake(0x161); break;
      case 10: this.setTake(0x157); break;
      case 11: this.setTake(0x16c); break;
      case 12: this.adjust(this.LAST, 0x17f); this.setTake(0x17f); this.timeIn(rand() % 3 * 1000 + 1000); break;
      case 13: this.setTake(0x18b); this.timeIn(rand() % 3 * 1000 + 1000); break;
      case 14: this.setTake(0x195); break;
      case 15: this.setTake(0x1ab); break;
      case 16: this.adjust(this.LAST, 0x1b8); this.setTake(0x1b8); this.timeIn(rand() % 3 * 1000 + 2000); break;
      case 17: this.setTake(0x1c2); break;
      case 18: this.setTake(0x1d1, this.cur); break;
      case 19: this.setTake(0x1f2); this.timeIn(rand() % 4 * 1000 + 3000); break;
      case 20: this.setTake(0x201); this.timeIn(rand() % 4 * 1000 + 3000); break;
      case 21: case 22: this.setTake(0x20d); break;
      case 23: this.setTake(0x21a); this.timeIn(rand() % 3 * 1000 + 2000); break;
      case 24: this.setTake(0x228); break;
      case 25: this.setTake(0x233); this.timeIn(rand() % 3 * 1000 + 2000); break;
      case 26: this.setTake(0x23b); break;
      case 27: this.setTake(0x241); break;
      case 28: this.setTake(0x24f); break;
      case 29: this.setTake(0x255); break;
      case 30: this.setTake(0x267); this.timeIn(rand() % 5 * 1000 + 2000); break;
      case 31: this.adjust(this.LAST, 0x26f); this.setTake(0x26f); this.timeIn(rand() % 3 * 1000); break;
      case 32: this.adjust(this.LAST, 0x275); this.setTake(0x275); this.timeIn(rand() % 2 * 1000); break;
      case 33: this.adjust(this.LAST, 0x27f); this.setTake(0x27f); this.timeIn(rand() % 2 * 1000); break;
      case 34: this.adjust(this.LAST, 0x285); this.setTake(0x285); this.timeIn(rand() % 3 * 1000); break;
      case 35: this.setTake(0x290); break;
      case 36: this.setTake(0x3fd); this.timeIn(rand() % 4 * 1000 + 3000); break;
      case 37: this.setTake(0x40f); this.timeIn(rand() % 4 * 1000 + 3000); break;
    }
  };

  /** ToxicSwampSprite::DoState, one tick. True when it drew. */
  Critter.prototype.tick = function () {
    var odd = function () { return rand() % 2 !== 0; };
    switch (this.state) {
      case 0: return this.goto(this.setUpEntry());
      case 1:
        if (this.offscreen()) { return this.goto(0); }
        if (this.loop(true) && this.timeUp()) { return this.goto(odd() ? (odd() ? 8 : 2) : 3); }
        break;
      case 2: if (this.loop(true)) { return this.goto(odd() ? 1 : 3); } break;
      case 3: if (this.once(false)) { return this.goto(odd() ? 5 : 4); } break;
      case 4: if (this.loop(true) && this.timeUp()) { return this.goto(5); } break;
      case 5: if (this.loop(true) && this.timeUp()) { return this.goto(6); } break;
      case 6: if (this.loop(true)) { return this.goto(7); } break;
      case 7: case 9: case 10:
        this.loop(true);
        if (this.offscreen()) { return this.goto(0); }
        break;
      case 8:
        if (this.loop(true)) { return this.goto(1); }
        if (this.offscreen()) { return this.goto(0); }
        break;
      case 11: if (this.once(false)) { return this.goto(12); } break;
      case 12:
        if (this.offscreen()) { return this.goto(0); }
        if (this.loop(true) && this.timeUp()) { return this.goto(13); }
        break;
      case 13:
        if (this.offscreen()) { return this.goto(0); }
        if (this.loop(true) && this.timeUp()) { return this.goto(odd() ? 14 : 11); }
        if (this.piranhaNear()) { return this.goto(14); }
        break;
      case 14:
        if (this.offscreen()) { return this.goto(0); }
        if (this.once(false)) { return this.goto(15); }
        break;
      case 15: if (this.once(false)) { return this.goto(16); } break;
      case 16:
        if (this.offscreen()) { return this.goto(0); }
        if (this.loop(true) && this.timeUp() && !this.piranhaNear()) { return this.goto(17); }
        break;
      case 17: if (this.once(false)) { return this.goto(11); } break;
      case 18:
        if (this.offscreen()) { return this.goto(0); }
        if (this.loop(true)) { this.setTake(odd() ? 0x1d1 : 0x1e1); }
        break;
      case 19: case 20:
        if (this.offscreen()) { return this.goto(0); }
        if (this.loop(true) && this.timeUp()) { return this.goto(this.state === 19 ? 20 : 19); }
        break;
      case 21: case 22: if (this.loop(true)) { return this.goto(23); } break;
      case 23:
        if (this.offscreen()) { return this.goto(0); }
        if (this.loop(true) && this.timeUp()) { return this.goto(rand() % 3 ? 24 : 29); }
        break;
      case 24: if (this.loop(true)) { return this.goto(25); } break;
      case 25:
        if (this.offscreen()) { return this.goto(0); }
        if (this.loop(true)) { return this.goto(odd() ? 26 : 22); }
        break;
      case 26: if (this.loop(true)) { return this.goto(27); } break;
      case 27:
        if (this.offscreen()) { return this.goto(0); }
        if (this.loop(true)) { return this.goto(28); }
        break;
      case 28:
        if (this.offscreen()) { return this.goto(0); }
        if (this.loop(true)) { return this.goto(odd() ? 29 : 22); }
        break;
      case 29:
        if (this.offscreen()) { return this.goto(0); }
        if (this.loop(true)) {
          // the piranha turns round
          this.dir = this.dir ? 0 : 1;
          this.mirror = !this.mirror;
          return this.goto(21);
        }
        break;
      case 30:
        if (this.offscreen()) { return this.goto(0); }
        if (this.loop(true) && this.timeUp()) { return this.goto(31); }
        break;
      case 31: case 32: case 33:
        if (this.loop(true) && this.timeUp()) { return this.goto(this.state + 1); }
        break;
      case 34:
        if (this.loop(true) && this.timeUp()) {
          this.x += this.dir === 0 ? -2 : 2;
          return this.goto(30);
        }
        break;
      case 35:
        if (this.offscreen()) { return this.goto(0); }
        this.loop(true);
        break;
      case 36: case 37:
        if (this.offscreen()) { return this.goto(0); }
        if (this.loop(true) && this.timeUp()) { return this.goto(this.state === 36 ? 37 : 36); }
        break;
      default: return this.goto(0);
    }
    return true;
  };

  /* ------------------------------------------------------ floor sprites */

  function Prop(sim, index) {
    Sprite.call(this, sim, index);
    this.floor = true;
    this.kind = 0;       // the coral's kind, or how deep a sinker goes
    this.depth = 0;
  }
  Prop.prototype = Object.create(Sprite.prototype);

  /** FloorSprite::PlayOnlyOnce: always steps, true once it reaches LAST. */
  Prop.prototype.once = function () {
    this.step(this.delta());
    this.cur += 1;
    return this.cur >= this.LAST;
  };

  function overlap(a1, a2, b1, b2) {
    return (a1 < b1 && a2 > b1) || (a1 < b2 && a2 > b2) || (a1 > b1 && a1 < b2) ||
           (a2 > b1 && a2 < b2) || (a1 === b1 && a2 === b2);
  }
  function hits(t, c) {
    return overlap(t[0], t[2], c[0], c[2]) && overlap(t[1], t[3], c[1], c[3]);
  }

  /** A random x along the floor, clear of whatever `avoid` holds. */
  Prop.prototype.placeX = function (avoid) {
    var s = this.sim, hw = half(this.w);
    for (var tries = 0; tries < 200; tries += 1) {
      this.x = rmod(s.right - this.w + hw);
      var c = [this.x - hw, s.bottom - this.h, this.x + hw, s.bottom];
      if (!avoid.some(function (r) { return hits(r, c); })) { return; }
    }
  };

  Prop.prototype.useRect = function (tick, swapped) {
    var r = this.sim.film.rect(tick);
    this.w = swapped ? r[3] - r[1] : r[2] - r[0];
    this.h = swapped ? r[2] - r[0] : r[3] - r[1];
  };

  Prop.prototype.onSand = function (first) {
    var s = this.sim;
    this.FIRST = this.LAST = first;
    this.x = s.sand[0]; this.y = s.sand[1];
    this.adjust(1, first, false, true);
    this.useRect(first);
  };

  Prop.prototype.setUpSprite = function () {
    var s = this.sim, req;
    switch (this.index) {
      case 0:   // the eye coral
        this.kind = rand() % 3;
        this.setTake([0x69, 0x98, 0xc7][this.kind]);
        this.x = s.sand[0]; this.y = s.sand[1];
        this.adjust(1, this.FIRST, false, true);
        this.useRect(this.FIRST);
        this.placeX([s.toilet, s.pipe]);
        req = 0x13;
        break;
      case 1: this.setTake(0x3be); this.useRect(0x3be, true); req = 5; break;
      case 2: this.setTake(0x384); this.useRect(0x384, true); req = 1; break;
      case 3:   // Larry
        this.setTake(0x2a0);
        this.useRect(this.FIRST);
        this.x = rmod(s.right - this.w) + half(this.w);
        while (hits(s.pipe, [this.x - half(this.w), s.bottom - this.h, this.x + half(this.w), s.bottom])) {
          this.x = rmod(s.right - this.w) + half(this.w);
        }
        this.y = -half(this.h);
        req = 0x15;
        break;
      case 4:   // what lives in the pipe
        this.setTake(9);
        this.useRect(7);
        this.y = s.bottom - half(this.h) - 1;
        if (s.pipe[0] === 0) {
          this.x = half(this.w);
          this.dir = 1; this.mirror = !this.mirror;
          this.adjust(7, 9);
          this.x -= 2;
        } else {
          this.x = s.right - half(this.w);
          this.adjust(7, 9);
        }
        this.timeIn(5000);
        req = 9;
        break;
      case 5: this.onSand(0x60); this.placeX([s.pipe]); this.y += 20; req = 0xe; break;
      case 6: this.onSand(0x62); this.placeX([]); req = 0x10; break;
      case 7: this.onSand(0x64); this.placeX([]); req = 0x11; break;
      default: this.onSand(0x66); this.placeX([]); req = 0x12; break;
    }
    this.cur = this.FIRST;
    return req;
  };

  /** The two that sink in from the top, the first time after 12 minutes. */
  Prop.prototype.sinker = function () {
    var s = this.sim;
    this.x = rmod(s.right - this.w) + half(this.w);
    this.y = -half(this.h);
    this.timeIn(rand() % 60 * 1000 + 720000);
    this.depth = rmod(this.h) + half(this.h);
  };

  Prop.prototype.eyeCoral = function () {
    var r = rand() % 5;
    if (this.kind === 2) { this.FIRST = 0xc9; return; }
    this.FIRST = [[0x6b, 0x9a], [0x77, 0xa6], [0x79, 0xa8], [0x80, 0xaf], [0x8e, 0xbd]][r][this.kind];
    if (r === 1 || r === 3) { this.timeIn(3000); }
  };

  Prop.prototype.guido = function () {
    var r = rand() % 7;
    this.FIRST = [0x2c8, 0x2ca, 0x2cc, 0x2d5, 0x2dd, 0x2e4, 0x2ed][r];
    if (r < 2) { this.timeIn(3000); }
  };

  /** Move on to `first`, registered against the tick it is on now. */
  Prop.prototype.from = function (first) {
    this.adjust(this.cur, first);
    this.setTake(first);
  };

  Prop.prototype.enter = function (n) {
    var oldLast = this.LAST;
    switch (n) {
      case 0: this.shown = false; break;
      case 1: this.setTake(0x384); this.sinker(); break;
      case 3: this.setTake(0x392, 0x391); break;
      case 4: this.setTake(0x39c); break;
      case 5: this.setTake(0x3be); this.sinker(); break;
      case 7: this.setTake(0x3da, 0x3d9); break;
      case 8: this.setTake(0x3e6, 0x3e5); break;
      case 9: this.adjust(oldLast, 9); this.setTake(9); break;
      case 10: this.adjust(oldLast, 0xc); this.setTake(0xc, 0xb); break;
      case 11: this.adjust(oldLast, 0x1f); this.setTake(0x1f, 0x1e); break;
      case 12: this.adjust(this.cur, 0x33); this.setTake(0x33, 0x32); break;
      case 13: this.adjust(oldLast, 0x416); this.setTake(0x416, 0x415); break;
      case 14:
        this.adjust(this.cur, oldLast);
        this.FIRST = this.LAST = 0x60; this.cur = 0x60;
        this.timeIn(rand() % 10 * 1000 + 5);
        break;
      case 15:
        this.adjust(this.cur, oldLast);
        this.setTake(0x40);
        this.timeIn(rand() % 10 * 1000 + 5);
        break;
      case 19: this.from([0x69, 0x98, 0xc7][this.kind]); this.timeIn(rand() % 3 * 1000 + 3000); break;
      case 20: this.eyeCoral(); this.from(this.FIRST); break;
      case 21: this.setTake(0x2a0, this.cur); break;
      case 22: this.setTake(0x2bc); break;
      case 24: this.from(0x2c6); this.timeIn(rand() % 2 * 1000 + 1000); break;
      case 25: this.guido(); this.from(this.FIRST); break;
      case 26: this.from(0x2fe); break;
      case 27: this.from(0x308); this.timeIn(rand() % 2 * 1000 + 1000); break;
      case 28: this.from(0x30a); break;
      case 29: this.from(0x311); break;
      case 30: this.from(0x31b); this.timeIn(rand() % 2 * 1000 + 1000); break;
      case 31: this.from([0x31d, 0x31f, 0x321][rand() % 3]); this.timeIn(rand() % 2 * 1000 + 1000); break;
      case 32: this.from(0x328); break;
      case 33: this.from(0x33a); this.timeIn(rand() % 2 * 1000 + 1000); break;
      case 34: this.from(0x33c); break;
      case 35: this.from(0x343); break;
      case 36: this.from(0x34d); this.timeIn(rand() % 2 * 1000 + 1000); break;
      case 37: this.from(rand() % 2 ? 0x34f : 0x355); this.timeIn(rand() % 2 * 1000 + 1000); break;
      case 38: this.from(0x35c); break;
      case 39: this.from(0x368); this.timeIn(rand() % 5 * 1000 + 1000); break;
      case 40: this.from(0x36a); break;
    }
  };

  /** Larry's next stage comes 3-7 s after the last. */
  Prop.prototype.breath = function () {
    this.sim.lungTime = this.sim.now + rand() % 5 * 1000 + 3000;
  };

  /** FloorSprite::DoState, one tick. True when it drew. */
  Prop.prototype.tick = function () {
    var s = this.sim, i;
    var lungOut = function () { return s.lungTime <= s.now; };
    switch (this.state) {
      case 0:
        if (s.floorToDraw) { s.setUpFloor(); s.floorToDraw = false; }
        return this.goto(this.setUpSprite());
      case 1: case 5:
        if (this.timeUp()) { return this.goto(this.state + 1); }
        break;
      case 2: case 6:
        if (this.loop(true) && this.y >= this.depth) { return this.goto(this.state + 1); }
        break;
      case 3: case 7:
        if (this.loop(true)) { return this.goto(this.state + 1); }
        break;
      case 4: case 8:
        this.loop(true);
        if (this.x + half(this.w) - 3 <= 0) { return this.goto(0); }
        break;
      case 9:
        if (this.loop(true) && this.timeUp()) { return this.goto(10); }
        break;
      case 10: case 11: case 12: case 13:
        i = this.cur - this.FIRST;
        if (this.dir === 1 && i >= 0 && i < NUDGE[this.state].length) { this.x += NUDGE[this.state][i]; }
        if (this.once()) {
          if (this.state < 12) { return this.goto(this.state + 1); }
          this.timeIn(rand() % 20 * 1000 + 10000);
          return this.goto(9);
        }
        break;
      case 14: if (this.loop(true) && this.timeUp()) { return this.goto(15); } break;
      case 15: if (this.loop(false) && this.timeUp()) { return this.goto(14); } break;
      case 16: case 17: case 18: this.loop(true); break;
      case 19: if (this.loop(true) && this.timeUp()) { return this.goto(20); } break;
      case 20: case 25: case 31:
        if (this.FIRST !== this.LAST ? this.once() : (this.loop(true) && this.timeUp())) {
          return this.goto({ 20: 19, 25: 24, 31: 30 }[this.state]);
        }
        break;
      case 21:
        if (this.loop(true)) {
          this.setTake(rand() % 3 ? 0x2a0 : (rand() % 2 ? 0x2b2 : 0x2a7));
        }
        if (this.y >= s.bottom - half(this.h) - 10) { return this.goto(22); }
        break;
      case 22: if (this.once()) { return this.goto(24); } break;
      case 24: case 27: case 30: case 33: case 36:
        if (this.loop(true) && this.timeUp()) {
          return this.goto(this.state + (lungOut() ? 2 : 1));
        }
        break;
      case 26: case 29: case 32: case 35:
        if (this.once()) { this.breath(); return this.goto(this.state + 1); }
        break;
      case 28: case 34: case 37:
        if (this.once()) { return this.goto(this.state - 1); }
        break;
      case 38: if (this.once()) { return this.goto(39); } break;
      case 39: if (this.loop(true) && this.timeUp()) { return this.goto(40); } break;
      case 40: if (this.once()) { return this.goto(39); } break;
      default: return this.goto(0);
    }
    return true;
  };

  /* ---------------------------------------------------------- the module */

  function Toxic(art, film) {
    this.art = art;
    this.film = film ? new Film(art, film) : null;
    this.critterValue = DEFAULT;
    this.lungValue = DEFAULT;
    this.showFloor = true;
  }

  Toxic.LUNG_MS = [30000, 120000, 300000, 600000];

  Toxic.prototype.reset = function (w, h) {
    this.w = w; this.h = h;
    // the module never works on less than 400 x 300
    this.right = Math.max(w, 400);
    this.bottom = Math.max(h, 300);
    this.now = 0;
    this.restartAt = 90 * 60000;
    this.bg = document.createElement('canvas');
    this.bg.width = Math.max(1, w); this.bg.height = Math.max(1, h);
    var g = this.bg.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, this.bg.width, this.bg.height);
    if (!this.film) { return; }

    var n = Math.floor(this.critterValue * 15 / 100) || 1;
    var lung = Math.floor(this.lungValue / 20);
    this.lungTime = lung < 4 ? Toxic.LUNG_MS[lung] : 1200000;
    // FloorSprite::InitStatics
    var r = this.film.rect(1);
    this.sand = [half(r[2] - r[0]), this.bottom - half(r[3] - r[1])];
    this.toilet = [-100, -100, -100, -100];
    this.pipe = [-100, -100, -100, -100];
    this.floorToDraw = true;
    this.floorGone = !this.showFloor;
    this.props = [];
    var i;
    if (this.showFloor) {
      for (i = 0; i < 9; i += 1) { this.props.push(new Prop(this, i)); }
    }
    this.critters = [];
    for (i = 0; i < n; i += 1) { this.critters.push(new Critter(this, i)); }
  };

  /** FloorSprite::SetUpFloor: pipe, sand, toilet, straight into the background. */
  Toxic.prototype.setUpFloor = function () {
    var F = this.film, g = this.bg.getContext('2d');
    var fromRight = rand() % 2 !== 0;
    var r = F.rect(7), w = r[2] - r[0], h = r[3] - r[1];
    var R;
    if (fromRight) {
      R = [this.right - w, this.bottom - h, this.right, this.bottom];
      F.drawAt(g, 7, R[0], R[1], false);
    } else {
      R = [0, this.bottom - h, w - 1, this.bottom];
      F.drawAt(g, 7, R[0], R[1], true);
    }
    this.pipe = R.slice();
    var toilet = false;
    do {
      var t = rand() % 2 ? 1 : 3;
      if (rand() % 3 === 0 && !toilet) { toilet = true; t = 5; }
      r = F.rect(t); w = r[2] - r[0]; h = r[3] - r[1];
      R = fromRight ? [R[0] - w, this.bottom - h, R[0], this.bottom]
                    : [R[2], this.bottom - h, R[2] + w, this.bottom];
      F.drawAt(g, t, R[0], R[1], false);
      if (t === 5) { this.toilet = R.slice(); }
    } while (R[0] >= 0 && R[2] <= this.right);
  };

  Toxic.prototype.step = function (dt) {
    if (!this.film) { return; }
    this.now += dt * 1000;
    var i, p;
    if (!this.floorGone) {
      for (i = 0; i < this.props.length; i += 1) {
        p = this.props[i];
        if (p.next <= this.now) { p.go(); }
      }
    }
    for (i = 0; i < this.critters.length; i += 1) {
      p = this.critters[i];
      if (p.next <= this.now) { p.go(); }
    }
    if (this.restartAt <= this.now && !this.floorGone) {
      // after an hour and a half the floor goes and the screen is wiped
      var g = this.bg.getContext('2d');
      g.fillStyle = '#000';
      g.fillRect(0, 0, this.bg.width, this.bg.height);
      this.floorGone = true;
    }
  };

  Toxic.prototype.drawSprite = function (ctx, s) {
    if (s.shown && s.drawn) { this.film.draw(ctx, s.drawn[0], s.drawn[1], s.drawn[2], s.drawn[3]); }
  };

  Toxic.prototype.draw = function (ctx) {
    ctx.drawImage(this.bg, 0, 0);
    if (!this.film) { return; }
    var i;
    if (!this.floorGone) {
      for (i = 0; i < this.props.length; i += 1) { this.drawSprite(ctx, this.props[i]); }
    }
    for (i = 0; i < this.critters.length; i += 1) { this.drawSprite(ctx, this.critters[i]); }
  };

  /* ------------------------------------------------------------ element */

  function ToxicElement() { return Reflect.construct(HTMLElement, [], ToxicElement); }
  ToxicElement.prototype = Object.create(HTMLElement.prototype);
  ToxicElement.prototype.constructor = ToxicElement;
  Object.setPrototypeOf(ToxicElement, HTMLElement);

  function value(el, name, table) {
    var v = (AfterDark.setting(el, name) || '').toLowerCase();
    if (table[v] !== undefined) { return table[v]; }
    if (/^\d+$/.test(v)) { return Math.min(100, parseInt(v, 10)); }
    return DEFAULT;
  }

  ToxicElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var base = this.getAttribute('art') || 'art/toxic';
    this.style.display = this.style.display || 'block';
    this.style.background = '#000';

    Promise.all([window.AfterDark.load(base), window.AfterDark.data(base)]).then(function (both) {
      var sim = new Toxic(both[0], both[1].films && both[1].films[FILM]);
      sim.critterValue = value(self, 'critters', CRITTERS);
      sim.lungValue = value(self, 'lung-capacity', LUNGS);
      var floor = AfterDark.setting(self, 'swamp-floor');
      sim.showFloor = floor === null ? true : AfterDark.flag(self, 'swamp-floor');

      var screen = new AfterDark.Screen(self);
      self._screen = screen;
      self.sim = sim;
      screen.onresize = function (w, h) { sim.reset(w, h); };
      sim.reset(screen.width, screen.height);
      screen.run(function (dt, ctx) {
        sim.step(dt);
        sim.draw(ctx);
      });
    }).catch(function (err) {
      self.textContent = err.message;
    });
  };

  ToxicElement.prototype.disconnectedCallback = function () {
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-toxic', ToxicElement);
  window.AfterDarkToxic = Toxic;
}());
