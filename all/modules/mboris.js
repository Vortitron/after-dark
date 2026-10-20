/**
 * mboris.js - Mowin' Boris, on the module's own artwork and its own film.
 *
 * Mboris.ad, 1995, one of the Totally Twisted modules. Its own description:
 *
 *   "Mowin' Boris. Together at last! Everybody's favorite cute cuddly kitty,
 *    frolicking in the sunny meadow, chasing butterflies. Along comes Mowin'
 *    Man, just doing his job. Together, they make magic.
 *    DISCLAIMER: No mower blades were dulled in the making of this module.
 *    Borises: more kitties = more gore
 *    Mow Speed: faster mower = more gore
 *    Revenge: if you feel sorry for Boris, crank this up
 *    Mow Sound: turns mower sounds on and off"
 *   Art by Matt Small and Igor Gasowski. Programming by Bruno Saskatchewan.
 *
 * The settings are its own, out of TYPE_1000: Mower Speed = Sluggish /
 * Normal / Hurried / Manic, Cats = 1-6, Revenge = Never / Rare / Sometimes /
 * Frequent / Always, and Mower Sound (no sound here, so it does nothing).
 *
 * The Twisted modules do not keep loose sprites. Their art is a *film*: an
 * OFST timeline of 545 ticks, each tick naming a cel in the OFTB table, and
 * each cel a stack of RLE frames placed at screen positions, with an offset.
 * tools/adweb.py + the OF export put both in all/art/mboris/. The film is a
 * library of short takes laid end to end - the data segment of the module
 * names where each sprite's states start, and with which facing:
 *
 *   CSpriteBoris     56 states at ticks 30-315 and 433-453 (sit, walk, run,
 *                    stalk, pounce, leap, wash, blink, doze, lie down, sleep,
 *                    and lying flat)
 *   CSpriteFlutterby 8 states at 320-360: one flap in each of 8 directions
 *   CSpriteMower     12 states at 370-537: driving, catching a kitten under
 *                    the deck, the mess that makes, the man looking back at a
 *                    kitten on the back of the mower, the kitten taking the
 *                    wheel, and the kitten driving and running the man over
 *   CSpriteGreens    ticks 5-27: a blade of grass, six flowers, two heads
 *
 * A take runs from its start tick to the last entry before the next take;
 * that last entry is only a link and is not shown, and the offset of the
 * last entry shown is how far the sprite has moved. That is read off the
 * walk: its eight frames step 3,2,2,5,3,4,4,5 pixels, the same in the
 * capture of the real thing, which runs at ten ticks a second.
 * Boris's state choices are the module's own transition lists, also in its
 * data segment (sit -> stalk / run / leap / look / sit / walk, and so on);
 * which list belongs to which state is inferred from what is in them.
 *
 * The rest is from captures of the real thing (10 ticks a second). The
 * lawn starts black and comes up a blade and a flower at a time. About
 * thirteen seconds in the mower arrives at the top right and mows the lawn
 * in lanes 43 pixels apart, right to left and back, at a tenth of the Mower
 * Speed value in pixels a tick, cutting the flowers. With Revenge at Always
 * Boris is driving from the first lane and there are no kittens about; the
 * Mowin' Men's heads pop up in his lane and he mows those. Otherwise the man
 * drives and a kitten in his lane goes under. Inferred, not seen: Revenge as
 * the odds, per mowing and per kitten that gets onto the back of the mower,
 * that Boris ends up driving; what is left of a run-over kitten lying flat
 * for a while and then soaking into the lawn; how hard he chases the
 * butterfly.
 *
 *   <after-dark-mowin-boris art="art/mboris" mower-speed="normal" cats="1" revenge="rare">
 */
(function () {
  'use strict';

  var TICK = 0.1;
  var SPEEDS = ['sluggish', 'normal', 'hurried', 'manic'];
  /* Pixels a tick: the control's own 25 / 50 / 75 / 100, a tenth of each.
     Measured off the captures: 2 with the control unset, 10 at Manic. */
  var PACE = [2, 5, 7, 10];
  var CATS = ['1', '2', '3', '4', '5', '6'];
  var REVENGE = ['never', 'rare', 'sometimes', 'frequent', 'always'];
  var ODDS = [0, 0.25, 0.5, 0.75, 1];

  /* Film position every sprite is placed by: the middle of Boris sitting
     facing us, at his feet. */
  var RX = 446, RY = 193;

  /* ---- the module's tables (data segment) --------------------------- */

  /* CSpriteBoris: state -> [start tick, mirrored] */
  var BORIS = {
    1: [300, 0], 2: [285, 0], 3: [305, 0], 4: [443, 1], 5: [433, 1], 6: [453, 1], 7: [443, 0], 8: [433, 0],
    9: [453, 0], 11: [150, 0], 12: [155, 0], 13: [175, 0], 14: [195, 0], 15: [205, 0], 16: [220, 0], 17: [160, 0],
    18: [170, 0], 19: [165, 0], 20: [185, 0], 21: [230, 0], 22: [80, 1], 23: [75, 1], 24: [90, 1], 25: [80, 0],
    26: [75, 0], 27: [90, 0], 28: [105, 1], 29: [95, 1], 30: [115, 1], 31: [125, 1], 32: [105, 0], 33: [95, 0],
    34: [115, 0], 35: [125, 0], 36: [60, 1], 37: [55, 1], 38: [70, 1], 39: [60, 0], 40: [55, 0], 41: [70, 0],
    42: [145, 0], 43: [140, 0], 44: [260, 0], 45: [255, 0], 46: [250, 0], 47: [310, 0], 48: [270, 0], 49: [30, 0],
    50: [315, 0], 51: [40, 1], 52: [35, 1], 53: [50, 1], 54: [40, 0], 55: [35, 0], 56: [50, 0]
  };
  /* CSpriteFlutterby: state -> [start, mirrored]; and the course it flies,
     a table of 32 of those states it works through. */
  var FLY = { 2: [360, 0], 3: [350, 1], 4: [350, 0], 5: [340, 1], 6: [340, 0], 7: [320, 0], 8: [330, 1], 9: [330, 0] };
  var COURSE = [6, 4, 2, 3, 5, 8, 7, 9, 2, 3, 4, 2, 3, 5, 2, 4, 6, 3, 5, 8, 4, 6, 9, 7, 8, 9, 5, 7, 8, 6, 7, 9];
  /* CSpriteMower: state -> start (it only ever drives one way) */
  var MOWER = { 1: 517, 2: 537, 3: 522, 4: 377, 5: 370, 6: 413, 7: 503, 8: 493, 9: 399, 11: 468, 12: 463, 13: 512 };
  /* CSpriteGreens: what grows - a blade, the six flowers, and two heads. */
  var GREENS = { blade: 5, flowers: [10, 12, 14, 16, 18, 20], heads: [25, 27] };

  /* Boris's transition lists, as they sit in the data segment; the keys
     (which state each list follows) are inferred from what is in them. */
  var SIT = [23, 26, 29, 33, 37, 40, 43, 43, 49, 49, 49, 49, 52, 52, 55, 55];
  var NEXT = {
    52: [51], 55: [54], 29: [28], 33: [32], 2: [1], 43: [11], 42: [11], 47: [11], 46: [45], 3: [45],
    51: [22, 28, 36, 51, 51, 51, 51, 53],
    54: [25, 32, 39, 54, 54, 54, 54, 56],
    28: [22, 22, 28, 28, 28, 30, 31, 36, 51],
    32: [25, 32, 32, 32, 34, 35, 39, 39, 54],
    22: [22, 22, 22, 24, 25, 25, 28, 51], 23: [22, 22, 22, 24, 25, 25, 28, 51],
    25: [22, 25, 25, 25, 27, 32, 32, 54], 26: [22, 25, 25, 25, 27, 32, 32, 54],
    36: [36, 36, 36, 38, 39, 28, 28, 51], 37: [36, 36, 36, 38, 39, 28, 28, 51],
    /* The mirror of the list above; the module's own copy is not certain. */
    39: [39, 39, 39, 41, 36, 32, 32, 54], 40: [39, 39, 39, 41, 36, 32, 32, 54],
    1: [1, 1, 1, 3]
  };
  var SITTING = [49, 50, 24, 27, 30, 34, 38, 41, 53, 56, 31, 35];
  var LOOKING = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
  var LOOK_NEXT = [12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
  var LOOK_EXIT = [46, 50, 50];
  var LYING = [44, 45, 48];
  var LIE_NEXT = [2, 2, 44, 45, 45, 48];
  /* Chasing the butterfly: by where it is - left and up, left, left and
     down, left; then the same to the right. */
  var CHASE = [36, 28, 22, 28, 39, 32, 25, 32];
  var MIRROR = { 22: 25, 23: 26, 24: 27, 28: 32, 29: 33, 30: 34, 31: 35, 36: 39, 37: 40, 38: 41, 51: 54, 52: 55, 53: 56 };
  (function () {
    var k;
    for (k in MIRROR) { if (MIRROR.hasOwnProperty(k)) { MIRROR[MIRROR[k]] = Number(k); } }
  }());
  var FLAT = [5, 4, 6];          // lying flat, facing left; +3 for right

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  /* ---- the film ----------------------------------------------------- */

  /**
   * Cuts the timeline into takes at every tick some sprite starts from.
   * A take is its entries, without the closing link.
   */
  function Film(art, film, starts) {
    this.art = art;
    this.cels = film.cels;
    var all = starts.slice().sort(function (a, b) { return a - b; });
    var takes = {};
    all.forEach(function (s, i) {
      var end = i + 1 < all.length ? all[i + 1] : Infinity;
      var run = film.entries.filter(function (e) { return e[0] >= s && e[0] < end; });
      if (run.length > 1) { run = run.slice(0, -1); }
      takes[s] = run;
    });
    this.takes = takes;
  }

  Film.prototype.take = function (start) {
    return this.takes[start] || [];
  };

  /** Draw cel `c` with the film point (RX, RY) at x, y; mirrored or not. */
  Film.prototype.draw = function (ctx, c, x, y, flip, s, dx, dy, skip) {
    var sp = this.cels[c];
    for (var i = 0; i < sp.length; i += 1) {
      var q = sp[i];
      if (skip && skip(q)) { continue; }
      var seq = this.art.sequence(q[0]);
      if (!seq) { continue; }
      var f = seq.frames[q[1]];
      var fx = q[4] + (dx || 0) - RX;
      var fy = q[5] + (dy || 0) - RY;
      var mirror = !!(q[3] & 1) !== !!flip;
      if (flip) { fx = -fx - f.w; }
      var px = Math.round(x + fx * s), py = Math.round(y + fy * s);
      if (!mirror && !(q[3] & 2)) {
        ctx.drawImage(seq.image, f.x, f.y, f.w, f.h, px, py, f.w * s, f.h * s);
      } else {
        ctx.save();
        ctx.translate(px + (mirror ? f.w * s : 0), py + (q[3] & 2 ? f.h * s : 0));
        ctx.scale(mirror ? -1 : 1, q[3] & 2 ? -1 : 1);
        ctx.drawImage(seq.image, f.x, f.y, f.w, f.h, 0, 0, f.w * s, f.h * s);
        ctx.restore();
      }
    }
  };

  /** Does cel `c` hold this frame anywhere? */
  Film.prototype.has = function (c, seq, frame) {
    return this.cels[c].some(function (q) { return q[0] === seq && (frame === undefined || q[1] === frame); });
  };

  /**
   * A sprite playing takes. Positions are screen pixels at the film point;
   * at the end of a take it has moved by the offset of the last entry shown.
   */
  function Actor(film, x, y) {
    this.film = film;
    this.x = x;
    this.y = y;
    this.flip = false;
    this.run = [];
    this.at = 0;
    this.state = 0;
  }

  Actor.prototype.play = function (start, flip, state) {
    this.run = this.film.take(start);
    this.flip = !!flip;
    this.at = 0;
    this.state = state || 0;
  };

  Actor.prototype.entry = function () {
    return this.run[Math.min(this.at, this.run.length - 1)];
  };

  /** Advance a tick. Returns true when the take has finished. */
  Actor.prototype.tick = function (s) {
    this.at += 1;
    if (this.at < this.run.length) { return false; }
    var last = this.run[this.run.length - 1];
    if (last) {
      this.x += (this.flip ? -last[2] : last[2]) * s;
      this.y += last[3] * s;
    }
    return true;
  };

  Actor.prototype.draw = function (ctx, s) {
    var e = this.entry();
    if (!e) { return; }
    this.film.draw(ctx, e[1], this.x, this.y, this.flip, s, e[2], e[3]);
  };

  /* ---- the screensaver --------------------------------------------- */

  function MowinBoris() {
    this.pace = PACE[1];
    this.count = 1;
    this.revenge = ODDS[2];
    this.film = null;
  }

  MowinBoris.prototype.resize = function (w, h) {
    this.w = w;
    this.h = h;
    this.s = Math.max(1, Math.round(Math.min(w, h) / 768));
    this.lawn = document.createElement('canvas');
    this.lawn.width = Math.max(1, Math.round(w));
    this.lawn.height = Math.max(1, Math.round(h));
    var g = this.lawn.getContext('2d');
    if (g) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
    }
    this.clock = 0;
    this.cats = null;
    this.mower = null;
    this.fly = null;
    /* The first mowing starts about thirteen seconds in. */
    this.mowerWait = 13;
    this.spawnWait = 0;
  };

  MowinBoris.prototype.begin = function () {
    var f = this.film, w = this.w, h = this.h, i;
    this.cats = [];
    this.flowers = [];
    this.heads = [];
    this.kittenDrives = Math.random() < this.revenge;
    for (i = 0; !this.kittenDrives && i < this.count; i += 1) {
      var c = new Actor(f, rand(w * 0.1, w * 0.9), rand(h * 0.2, h * 0.95));
      this.startCat(c, 49);
      this.cats.push(c);
    }
    this.fly = new Actor(f, rand(w * 0.2, w * 0.8), rand(h * 0.2, h * 0.6));
    this.fly.course = Math.floor(Math.random() * COURSE.length);
    this.flyOn();
    /* The lawn has only just started to come up. */
    for (i = 0; i < Math.round(w * h / 2500); i += 1) { this.grow(GREENS.blade); }
    for (i = 0; i < 4; i += 1) { this.flower(); }
  };

  /** A flower comes up; the mower cuts them, so they are kept track of. */
  MowinBoris.prototype.flower = function () {
    var x = rand(0, this.w), y = rand(10 * this.s, this.h + 10 * this.s);
    this.grow(pick(GREENS.flowers), x, y + 60 * this.s - (253 + 19 - RY) * this.s);
    this.flowers.push({ x: x, y: y });
  };

  MowinBoris.prototype.startCat = function (c, state) {
    var b = BORIS[state];
    c.play(b[0], b[1], state);
  };

  /** Stamp a greens cel onto the lawn somewhere. */
  MowinBoris.prototype.grow = function (start, x, y) {
    var g = this.lawn.getContext('2d');
    if (!g) { return; }
    var e = this.film.take(start)[0];
    if (!e) { return; }
    var px = x === undefined ? rand(0, this.w) : x;
    var py = y === undefined ? rand(0, this.h + 40 * this.s) : y;
    this.film.draw(g, e[1], px, py - 60 * this.s, false, this.s, e[2], e[3]);
  };

  /* ---- Boris ---- */

  MowinBoris.prototype.nextCat = function (c) {
    var st = c.state, w = this.w, h = this.h, s = this.s, n;
    if (c.dead) {
      c.flat = (c.flat || 0) + 1;
      if (c.flat > 3) { return this.bury(c); }
      n = pick(FLAT) + (c.flip ? 0 : 3);
      this.startCat(c, n);
      return;
    }
    var fly = this.fly;
    var near = fly && Math.abs(fly.x - c.x) < 180 * s && Math.abs(fly.y - c.y) < 140 * s;
    var free = SITTING.indexOf(st) >= 0 || [51, 54, 28, 32, 22, 23, 25, 26, 36, 37, 39, 40].indexOf(st) >= 0;
    if (near && free && Math.random() < 0.35) {
      var left = fly.x < c.x;
      var dy = fly.y - (c.y - 25 * s);
      var row = dy < -40 * s ? 0 : dy > 40 * s ? 2 : 1;
      n = CHASE[(left ? 0 : 4) + row];
    } else if (SITTING.indexOf(st) >= 0) {
      n = pick(SIT);
    } else if (LOOKING.indexOf(st) >= 0) {
      n = Math.random() < 0.15 ? pick(LOOK_EXIT) : (near && Math.random() < 0.5 ? pick([16, 21]) : pick(LOOK_NEXT));
    } else if (LYING.indexOf(st) >= 0) {
      n = Math.random() < 0.15 ? 47 : pick(LIE_NEXT);
    } else if (NEXT[st]) {
      n = pick(NEXT[st]);
    } else {
      n = 49;
    }
    /* Turn back from the edges, and keep off the very top and bottom. */
    var heading = BORIS[n][1] ? -1 : 1;
    var margin = 70 * s;
    if (MIRROR[n] && ((heading < 0 && c.x < margin) || (heading > 0 && c.x > w - margin))) { n = MIRROR[n]; }
    if ((n === 22 || n === 25) && c.y > h - 30 * s) { n = n === 22 ? 36 : 39; }
    if ((n === 36 || n === 39) && c.y < 90 * s) { n = n === 36 ? 22 : 25; }
    if ((n === 37 || n === 40) && c.y < 90 * s) { n = 49; }
    this.startCat(c, n);
  };

  /** A flattened kitten soaks into the lawn, and another turns up. */
  MowinBoris.prototype.bury = function (c) {
    var g = this.lawn.getContext('2d');
    if (g) { c.draw(g, this.s); }
    this.cats.splice(this.cats.indexOf(c), 1);
    this.spawnWait = rand(2, 6);
  };

  MowinBoris.prototype.spawn = function () {
    var s = this.s, fromLeft = Math.random() < 0.5;
    var c = new Actor(this.film, fromLeft ? -40 * s : this.w + 40 * s, rand(this.h * 0.2, this.h * 0.95));
    this.startCat(c, fromLeft ? 54 : 51);
    this.cats.push(c);
  };

  /* ---- the butterfly ---- */

  MowinBoris.prototype.flyOn = function () {
    var f = this.fly, w = this.w, h = this.h, s = this.s;
    var st = COURSE[f.course % COURSE.length];
    f.course += 1;
    /* It works through its course, but not off the screen. */
    var dirs = { 2: [0, 1], 3: [-1, 1], 4: [1, 1], 5: [-1, 0], 6: [1, 0], 7: [0, -1], 8: [-1, -1], 9: [1, -1] };
    var d = dirs[st], m = 40 * s;
    if ((d[0] < 0 && f.x < m) || (d[0] > 0 && f.x > w - m) || (d[1] < 0 && f.y < m) || (d[1] > 0 && f.y > h - m)) {
      var best = null;
      Object.keys(dirs).forEach(function (k) {
        var v = dirs[k];
        var gx = w / 2 - f.x, gy = h / 2 - f.y;
        var score = v[0] * gx + v[1] * gy;
        if (best === null || score > best[1]) { best = [Number(k), score]; }
      });
      st = best[0];
    }
    f.play(FLY[st][0], FLY[st][1], st);
  };

  /* ---- the mower ----
     He mows the lawn in lanes from the top, one way and then back the
     other, 43 pixels further down each time, as the capture shows. Who is
     driving is Revenge: with Always it is Boris from the first lane, and
     then there are no kittens on the lawn, only Mowin' Men's heads popping
     up in front of him. Otherwise it is the man, and any kitten in his lane
     goes under the deck; one that gets onto the back of the mower behind
     him may, by the same odds, take the wheel. */

  var LANE = 43, FRONT = 36, BACK = 73;

  MowinBoris.prototype.mowerOn = function () {
    var s = this.s;
    var m = new Actor(this.film, this.w + (BACK - 30) * s, 101 * s);
    m.dir = -1;
    m.kitten = this.kittenDrives;
    m.play(MOWER[m.kitten ? 1 : 5], false, m.kitten ? 1 : 5);
    this.mower = m;
  };

  /** The take after this one. */
  MowinBoris.prototype.mowerNext = function () {
    var m = this.mower, st = m.state, flip = m.dir > 0;
    var g = this.lawn.getContext('2d');
    if (g && m.stain !== undefined) {
      /* What the mower leaves behind is left on the lawn. */
      /* Not the deck's stripes (1006 #2): on the night lawn they do not show. */
      this.film.draw(g, m.stain[1], m.stainAt[0], m.stainAt[1], m.stainAt[2], this.s, m.stain[2], m.stain[3],
        function (q) { return q[0] === 1006; });
      m.stain = undefined;
    }
    if (m.victim) {
      var v = m.victim;
      m.victim = null;
      if (st === 4) {
        /* Caught: now the mess. */
        m.victim = v;
        var gore = pick([9, 6]);
        m.play(MOWER[gore], flip, gore);
        return;
      }
      /* What is left of him lies flat where he went under. */
      v.hidden = false;
      v.x = m.stainAt ? m.stainAt[0] : m.x;
      v.flip = flip;
      this.nextCat(v);
    }
    if (st === 12) {
      m.play(MOWER[11], flip, 11);
    } else if (st === 11) {
      if (Math.random() < this.revenge) {
        m.play(MOWER[13], flip, 13);
      } else {
        var lose = pick([8, 7]);
        m.play(MOWER[lose], flip, lose);
      }
    } else if (st === 13 || m.kitten) {
      m.kitten = true;
      m.play(MOWER[1], flip, 1);
    } else {
      m.play(MOWER[5], flip, 5);
    }
  };

  /** Flowers under the deck are cut; what is in front of it goes under. */
  MowinBoris.prototype.mow = function () {
    var m = this.mower, s = this.s, g = this.lawn.getContext('2d');
    var front = m.x + m.dir * FRONT * s;
    var lo = m.y - 30 * s, hi = m.y + 26 * s;
    var self = this;
    this.flowers = this.flowers.filter(function (f) {
      var under = f.y > lo && f.y < hi && (m.dir < 0 ? f.x > front && f.x < front + 60 * s : f.x < front && f.x > front - 60 * s);
      if (under && g) {
        g.fillStyle = '#000';
        g.fillRect(f.x - 12 * s, f.y - 20 * s, 24 * s, 21 * s);
        var clip = self.art.sequence(1005);
        if (clip) {
          var fr = clip.frames[pick([6, 7])];
          g.drawImage(clip.image, fr.x, fr.y, fr.w, fr.h, f.x - fr.w * s / 2, f.y - fr.h * s, fr.w * s, fr.h * s);
        }
      }
      return !under;
    });
    if (m.state !== 5 && m.state !== 1) { return; }
    var i, reach = function (x) { return m.dir < 0 ? x < front + 6 * s && x > front - 30 * s : x > front - 6 * s && x < front + 30 * s; };
    if (m.kitten) {
      for (i = 0; i < this.heads.length; i += 1) {
        var hd = this.heads[i];
        if (reach(hd.x)) {
          this.heads.splice(i, 1);
          var run = pick([3, 2]);
          m.play(MOWER[run], m.dir > 0, run);
          return;
        }
      }
      return;
    }
    for (i = 0; i < this.cats.length; i += 1) {
      var c = this.cats[i];
      if (c.dead || c.hidden || c.y < lo + 10 * s || c.y > hi) { continue; }
      if (reach(c.x)) {
        c.dead = true;
        c.flat = 0;
        c.hidden = true;
        m.victim = c;
        m.play(MOWER[4], m.dir > 0, 4);
        return;
      }
      var back = m.x - m.dir * (BACK + 10) * s;
      if (this.revenge > 0 && !c.tried && Math.abs(c.x - back) < 20 * s) {
        /* A kitten on the back: the man looks round. */
        c.tried = true;
        this.cats.splice(i, 1);
        m.play(MOWER[12], m.dir > 0, 12);
        return;
      }
    }
  };

  /** Heads come up in the lane in front of Boris. */
  MowinBoris.prototype.heads_ = function () {
    var m = this.mower, s = this.s;
    if (!m || !m.kitten || this.heads.length > 1 || Math.random() > 0.015) { return; }
    var x = m.x + m.dir * rand(90, 320) * s;
    if (x < 10 * s || x > this.w - 10 * s) { return; }
    this.heads.push({ x: x, y: m.y, cel: pick(GREENS.heads) });
  };

  MowinBoris.prototype.drive = function () {
    var m = this.mower, s = this.s;
    m.x += m.dir * this.pace * s;
    this.mow();
    this.heads_();
    var done = m.tick(s), e = m.entry();
    if (!done && e && !this.film.has(e[1], 1006, 0)) {
      /* The rest of the take is what the mower leaves behind: leave it on
         the lawn and drive on. */
      m.stain = e;
      m.stainAt = [m.x, m.y, m.dir > 0];
      done = true;
    }
    if (done) { this.mowerNext(); }
    var gone = m.dir < 0 ? m.x + BACK * s < 0 : m.x - BACK * s > this.w;
    if (gone && !m.victim && (m.state === 5 || m.state === 1)) {
      m.dir = -m.dir;
      m.y += LANE * s;
      this.heads = [];
      if (m.y - 60 * s > this.h) {
        /* Done. Next time, who drives is up to Revenge again. */
        this.mower = null;
        this.mowerWait = rand(8, 15);
        this.kittenDrives = Math.random() < this.revenge;
        return;
      }
      m.play(MOWER[m.kitten ? 1 : 5], m.dir > 0, m.kitten ? 1 : 5);
    }
  };

  /* ---- each tick ---- */

  MowinBoris.prototype.tick = function () {
    var i, s = this.s;
    /* The lawn comes up: blades all the time, a flower now and then. */
    for (i = 0; i < 2; i += 1) { this.grow(GREENS.blade); }
    if (Math.random() < 0.06) { this.flower(); }

    for (i = this.cats.length - 1; i >= 0; i -= 1) {
      var c = this.cats[i];
      if (c.hidden) { continue; }
      if (c.tick(s)) { this.nextCat(c); }
    }
    if (!this.kittenDrives && this.cats.length < this.count) {
      this.spawnWait -= TICK;
      if (this.spawnWait <= 0) { this.spawn(); this.spawnWait = rand(3, 8); }
    }

    if (this.fly.tick(s)) { this.flyOn(); }

    if (!this.mower) {
      this.mowerWait -= TICK;
      if (this.mowerWait <= 0) { this.mowerOn(); }
    } else {
      this.drive();
    }
  };

  MowinBoris.prototype.step = function (dt, ctx, w, h) {
    if (!this.film) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      return;
    }
    if (!this.cats) { this.begin(); }
    this.clock += dt;
    var n = 0;
    while (this.clock >= TICK && n < 5) {
      this.clock -= TICK;
      this.tick();
      n += 1;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.lawn, 0, 0, w, h);
    var s = this.s, m = this.mower, i;
    for (i = 0; i < this.heads.length; i += 1) {
      var hd = this.heads[i], e = this.film.take(hd.cel)[0];
      if (e) { this.film.draw(ctx, e[1], hd.x, hd.y - 60 * s + 2 * s, false, s, e[2], e[3]); }
    }
    var order = this.cats.filter(function (c) { return !c.hidden; });
    if (m) { order.push(m); }
    order.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < order.length; i += 1) { order[i].draw(ctx, s); }
    this.fly.draw(ctx, s);
  };

  AfterDark.define('after-dark-mowin-boris', function (el) {
    var sim = new MowinBoris();
    sim.pace = PACE[AfterDark.choice(el, 'mower-speed', SPEEDS, 'normal')];
    sim.count = Number(CATS[AfterDark.choice(el, 'cats', CATS, '1')]);
    sim.revenge = ODDS[AfterDark.choice(el, 'revenge', REVENGE, 'rare')];
    var base = AfterDark.setting(el, 'art') || 'art/mboris';
    Promise.all([AfterDark.load(base), AfterDark.data(base)]).then(function (both) {
      var starts = [5, 10, 12, 14, 16, 18, 20, 25, 27], k;
      for (k in BORIS) { if (BORIS.hasOwnProperty(k)) { starts.push(BORIS[k][0]); } }
      for (k in FLY) { if (FLY.hasOwnProperty(k)) { starts.push(FLY[k][0]); } }
      for (k in MOWER) { if (MOWER.hasOwnProperty(k)) { starts.push(MOWER[k]); } }
      starts = starts.filter(function (v, i, a) { return a.indexOf(v) === i; });
      sim.art = both[0];
      sim.film = new Film(both[0], both[1].films['1000'], starts);
    }).catch(function (err) {
      if (window.console) { console.error(err); }
    });
    return sim;
  });

  window.AfterDarkMowinBoris = MowinBoris;
}());
