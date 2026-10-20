/**
 * phlegm.js - Phlegm Boy, on the module's own artwork and its own film.
 *
 * PHLEGM_B.AD, 1995, from the 10th anniversary collection. Its own description:
 *
 *   "Phlegm Boy is a rude little guy that just loves to cause trouble. He
 *    can't help but spit, hock and flick things all over your screen. Don't
 *    hate him tho', that's just the way he is.
 *    'Homo sum: humani nihil a me alienum puto.'
 *    Behavior: would you like a loogie with that, ma'am?
 *    Mess: this module should come with a squeegie, doncha think?"
 *   Art by Robert Cuenca. Programming by Scott Garcia.
 *
 * The settings are its own, out of TYPE_1000: Behavior = Pesky / Unruly /
 * Ill-Mannered / Horrid / Atrocious / Kill It!!! (stored as 15 30 45 60 75
 * 100, default 51), Mess = Unkempt / Besmirched / Disquieting / Nauseous /
 * Disgusting / Art Form / Are You Crazy?! (16 32 48 64 80 96 100, default 52)
 * and Clear Screen First (on).
 *
 * Like the Totally Twisted modules it is a film: an OFST timeline of 670 ticks
 * over the RLE frames of 9000-9002, cut into 68 takes. tools/adfilm.py puts it
 * in art/phlegm_b/index.json; it needs VOTE=1, because the three sequences are
 * numbered 1, 47 and 111 with no spare number between them.
 *
 * The module exports its C++ symbols, and what follows is the code of
 * PhlegmBoySprite and ResidueSprite (NE segments 7 and 8) carried over state
 * by state rather than guessed at:
 *
 *  - One boy. He comes in either walking from off one side at a random height
 *    (take 13, looped until a whole cycle ends with him fully on the screen),
 *    or as a drip falling from the top edge at a random x (take 208), which
 *    splats and rises up out of the puddle (193).
 *  - Then he does "activities", one at a time, each followed by an 800 ms
 *    hold on its last frame: faces (235/239/253/270), picking and flicking
 *    (243, 372), hocking a loogie that hangs and swings (306-328), the yo-yo
 *    of snot (409-460), sneezes (295, 467), a burp (276) - eight of them,
 *    never the same twice running. After 1-2 of them (1-4 from Horrid up) he
 *    moves on: a third of the time he melts into a puddle (173) which runs
 *    down the screen (208) and rises again further down; otherwise he winds
 *    up (228) and either spits a gob at the screen (523, which runs down it
 *    and sometimes crawls away, 537-569) - the chance is the Behavior value
 *    out of 100 - or walks off a step (7, 13), or melts and leaps out of his
 *    own puddle (37) to fly about (70-138) before landing (389-400).
 *  - The ticks are 100 ms. Moving from one cel to the next keeps the picture
 *    registered: the boy's position is the centre of the current cel's rect
 *    (OFTB rect plus the entry's offset), and each step adds the difference of
 *    the two centres (CompoundSequence::GetCenterDistance), mirrored when he
 *    faces right. The walk loops by jumping from its last tick to its first
 *    without that step, which is what carries him across the screen.
 *  - What he leaves (ResidueSprite): drips where he walks (145-157), the puddle
 *    he jumped out of (141), the splat he landed in (385), spit and snot
 *    (463, 581-614, 628/639), the gob (537) - each plays where it was left
 *    and is then stamped into the background, so it stays.
 *  - Mess is how often the background is wiped black again: every Mess x 5
 *    minutes (default 20), checked as he comes back on.
 *
 * Checked against a capture of the real thing at the defaults: the boy about
 * 64 px tall standing in his puddle near the top left, flicking and picking,
 * melting and leaping out of his puddle, flying, landing and rising again, the
 * drips and puddles left behind. Not reproduced: the sounds, and toggling Caps
 * Lock (which the original reads as "do the sneeze now").
 *
 *   <after-dark-phlegm behavior="ill-mannered" mess="disquieting">
 */
(function () {
  'use strict';

  var FILM = '9000';
  var TICK = 100;           // ms, [this+0xd0] = now + 100 after every draw
  var HOLD = 800;           // ms, the pause after each activity

  /* What the control panel stores for each item; the module divides. */
  var BEHAVIOR = {
    'pesky': 15, 'unruly': 30, 'ill-mannered': 45, 'horrid': 60,
    'atrocious': 75, 'kill it!!!': 100, 'kill it': 100
  };
  var MESS = {
    'unkempt': 16, 'besmirched': 32, 'disquieting': 48, 'nauseous': 64,
    'disgusting': 80, 'art form': 96, 'are you crazy?!': 100, 'are you crazy': 100
  };
  var BEHAVIOR_DEFAULT = 51;
  var MESS_DEFAULT = 52;

  /* SetUpActivity's eight choices (state numbers). */
  var ACTIVITIES = [0x18, 0x1f, 0x20, 0x21, 0x25, 0x29, 0x2a, 0x2b];
  var HOLDING = 0x17;

  function rand() { return Math.floor(Math.random() * 32768); }
  /* C's rand() % n, which for a negative n is still 0..|n|-1. */
  function rmod(n) { n = Math.abs(n); return n ? rand() % n : 0; }
  function half(v) { return v < 0 ? -((-v) >> 1) : v >> 1; }

  /* ------------------------------------------------------------ the film */

  function Film(art, film) {
    this.art = art;
    this.cels = film.cels;
    this.at = {};
    this.flip = false;
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

  /** GetLabelRange: how many ticks run on from `start`. */
  Film.prototype.len = function (start) {
    var n = 0;
    while (this.at[start + n]) { n += 1; }
    return n;
  };

  /** GetFrameRect: the cel's rect moved by the entry's offset. */
  Film.prototype.rect = function (tick) {
    var e = this.at[tick];
    if (!e) { return [0, 0, 0, 0]; }
    var u = this.union[e[1]];
    return [u[0] + e[2], u[1] + e[3], u[2] + e[2], u[3] + e[3]];
  };

  /** GetCenterDistance from tick a to tick b, mirrored with the film. */
  Film.prototype.dist = function (a, b) {
    var ra = this.rect(a), rb = this.rect(b);
    var f = this.flip ? 1 : 0;
    var dx = ((rb[0] + rb[2] + f) >> 1) - ((ra[0] + ra[2] + f) >> 1);
    var dy = ((rb[1] + rb[3]) >> 1) - ((ra[1] + ra[3]) >> 1);
    return [f ? -dx : dx, dy];
  };

  /** ArtSprite::MoveSpriteAndFrame: the cel's rect centred on (x, y). */
  Film.prototype.draw = function (ctx, tick, x, y) {
    var e = this.at[tick];
    if (!e) { return; }
    var u = this.union[e[1]];
    var left = x - ((u[2] - u[0]) >> 1), top = y - ((u[3] - u[1]) >> 1);
    var cel = this.cels[e[1]];
    for (var i = 0; i < cel.length; i += 1) {
      var q = cel[i];
      var seq = this.art.sequence(q[0]);
      var f = seq.frames[q[1]];
      var px = this.flip ? left + (u[2] - q[4] - f.w) : left + (q[4] - u[0]);
      var py = top + (q[5] - u[1]);
      var mirror = !!(q[3] & 1) !== this.flip;
      if (!mirror && !(q[3] & 2)) {
        ctx.drawImage(seq.image, f.x, f.y, f.w, f.h, px, py, f.w, f.h);
      } else {
        ctx.save();
        ctx.translate(px + (mirror ? f.w : 0), py + (q[3] & 2 ? f.h : 0));
        ctx.scale(mirror ? -1 : 1, q[3] & 2 ? -1 : 1);
        ctx.drawImage(seq.image, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
        ctx.restore();
      }
    }
  };

  /* ---------------------------------------------------------- the module */

  function Phlegm(art, film) {
    this.art = art;
    this.film = film ? new Film(art, film) : null;
    this.behavior = BEHAVIOR_DEFAULT;
    this.mess = MESS_DEFAULT;
    this.clear = true;
    this.desktop = null;
  }

  Phlegm.prototype.reset = function (w, h) {
    this.w = w; this.h = h;
    this.now = 0;
    this.next = 0;
    // LoadStatics
    this.BEHAV = Math.floor(this.behavior / 15);
    this.MESS = Math.floor(this.mess / 16) + 1;
    this.DIR = 1; this.MOVE = 1; this.ADJ = 1;
    this.FIRST = 0; this.LAST = 0;
    if (this.film) { this.film.flip = false; }
    // the background the residue is stamped into
    this.bg = document.createElement('canvas');
    this.bg.width = Math.max(1, w); this.bg.height = Math.max(1, h);
    this.wipe(!this.clear);
    // IPhlegmBoySprite
    this.boy = {
      state: 0, x: 0, y: 0, cur: 0, da: 0, w: 0, h: 0,
      e0: rmod(this.BEHAV > 3 ? 4 : 2) + 1, e2: 0, e4: 0, e8: 0,
      ea: 0, ec: 0, ee: HOLD, f4: 0, shown: false, drawn: null,
      f0: this.MESS * 5 * 60000
    };
    // IResidueSprite
    this.res = { state: 0, x: -100, y: -100, cur: 0x91, d2: 0, FIRST: 0, LAST: 0, shown: false, drawn: null };
    this.req = 0; this.reqX = 0; this.reqY = 0;
    this.boyEnter(0);
  };

  /** Black, or (Clear Screen First off) whatever was on the screen. */
  Phlegm.prototype.wipe = function (desktop) {
    var g = this.bg.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, this.bg.width, this.bg.height);
    if (desktop && this.desktop) { g.drawImage(this.desktop, 0, 0); }
  };

  Phlegm.prototype.residue = function (type, x, y) {
    this.req = type; this.reqX = x; this.reqY = y;
  };

  /* -------------------------------------------------------------- the boy */

  Phlegm.prototype.adjust = function (o, a, b) {
    var d = this.film.dist(a, b);
    o.x += d[0]; o.y += d[1];
  };

  /** Start a take: FIRST, maybe registered to where the last one ended. */
  Phlegm.prototype.take = function (first, register) {
    var b = this.boy;
    if (register) { this.adjust(b, this.LAST, first); }
    this.FIRST = first;
    this.LAST = first + this.film.len(first) - 1;
    b.cur = first - 1;
  };

  /** PlayOnlyOnce: true when the take has run out (and nothing moves). */
  Phlegm.prototype.once = function (o, FIRST, LAST) {
    var d = [0, 0];
    if (o.cur >= FIRST && o.cur < LAST) { d = this.film.dist(o.cur, o.cur + 1); }
    o.cur += 1;
    if (o.cur > LAST) { o.cur = FIRST; return true; }
    o.x += d[0]; o.y += d[1];
    return false;
  };

  /** PlayLoop: the same, but the wrap moves it back to the first cel. */
  Phlegm.prototype.loop = function () {
    var b = this.boy, d = [0, 0];
    if (b.cur >= this.FIRST) {
      d = b.cur >= this.LAST ? this.film.dist(this.LAST, this.FIRST) : this.film.dist(b.cur, b.cur + 1);
    }
    b.x += d[0]; b.y += d[1];
    b.cur += 1;
    if (b.cur > this.LAST) { b.cur = this.FIRST; return true; }
    return false;
  };

  /** The walking and flying takes step by hand and loop without the wrap. */
  Phlegm.prototype.stepLoop = function () {
    var b = this.boy;
    if (b.cur >= this.FIRST) { this.adjust(b, b.cur, b.cur + 1); }
    b.cur += 1;
    return b.cur >= this.LAST;
  };

  Phlegm.prototype.offscreen = function () {
    var b = this.boy;
    switch (this.MOVE) {
      case 1: return b.x <= 0;
      case 2: return b.x >= this.w;
      case 3: return b.y <= 0;
      case 4: return b.y >= this.h;
    }
    return false;
  };

  Phlegm.prototype.onscreen = function () {
    var b = this.boy;
    return b.x + half(b.w) < this.w && b.x - half(b.w) > 0;
  };

  Phlegm.prototype.face = function (dir) {
    if (this.DIR !== dir) { this.film.flip = !this.film.flip; this.DIR = dir; }
  };

  Phlegm.prototype.setUpEntry = function () {
    var b = this.boy, r;
    this.FIRST = rand() % 2 ? 13 : 208;
    this.LAST = this.FIRST + this.film.len(this.FIRST) - 1;
    r = this.film.rect(this.FIRST);
    b.w = r[2] - r[0]; b.h = r[3] - r[1];
    if (this.FIRST === 208) {
      // a drip from the top edge
      b.x = rmod(this.w - b.w) + half(b.w);
      b.y = -half(b.h) - 1;
      this.MOVE = this.DIR; b.e4 = 0;
      if (rand() % 2) { if (this.DIR === 2) { this.MOVE = 1; this.face(1); } }
      else if (this.DIR === 1) { this.MOVE = 2; this.face(2); }
      b.ec = 8;
      b.cur = this.FIRST;
    } else {
      // walking on from one side
      b.y = rmod(this.h - b.h) + half(b.h);
      if (rand() % 2) { b.x = rmod(100) + half(b.w) + this.w; this.face(1); }
      else { b.x = -half(b.w) - rmod(100); this.face(2); }
      this.MOVE = this.DIR; b.ec = 3; b.e4 = 1;
      b.cur = this.FIRST - 1;
    }
    r = this.film.rect(30);
    b.w = r[2] - r[0]; b.h = r[3] - r[1];
    b.e8 = this.FIRST; b.ee = HOLD;
  };

  Phlegm.prototype.setUpFacial = function () {
    var f = rand() % 2 ? (rand() % 2 ? 0xeb : 0xef) : (rand() % 2 ? 0xfd : 0x10e);
    this.take(f, true);
  };

  Phlegm.prototype.setUpActivity = function () {
    var b = this.boy;
    var old = b.e2;
    b.e2 += 1;
    if (old > b.e0) {
      b.ec = rand() % 3 === 0 ? 7 : 6;
      b.e2 = 0;
      b.e0 = rmod(this.BEHAV > 3 ? 4 : 2) + 1;
      return;
    }
    do { b.ec = ACTIVITIES[rand() % 8]; } while (b.ec === b.ea);
    b.ea = b.ec;
  };

  /** Hold the frame `e8` for `ee` ms, then go to `ec`. */
  Phlegm.prototype.hold = function (frame, next, ms) {
    var b = this.boy;
    if (next !== undefined) { b.ec = next; }
    b.e8 = frame; b.ee = ms || HOLD;
    return this.boyGoto(HOLDING);
  };

  /** Activity done: pick the next one and hold the last frame. */
  Phlegm.prototype.then = function (frame) {
    this.setUpActivity();
    return this.hold(frame === undefined ? this.LAST : frame);
  };

  Phlegm.prototype.boyGoto = function (n) {
    this.boy.state = n;
    this.boyEnter(n);
    return false;
  };

  Phlegm.prototype.boyEnter = function (n) {
    var b = this.boy;
    switch (n) {
      case 0: b.shown = false; break;
      case 2: this.take(7, false); break;
      case 3:
        this.take(13, false);
        b.da = rmod(this.FIRST - this.LAST);
        this.MOVE = this.DIR;
        break;
      case 4: this.take(0x1e, false); break;
      case 5: this.take(0xa1, false); break;
      case 6: this.take(0xe4, true); break;
      case 7: this.take(0xad, true); break;
      case 8:
        this.take(0xd0, false);
        b.y += 1;
        b.da = rmod(this.FIRST - this.LAST);
        this.MOVE = 4;
        break;
      case 9:
        this.take(0xc1, false);
        this.MOVE = this.DIR;
        this.residue(3, b.x, b.y);
        break;
      case 10: this.take(0x289, false); break;
      case 11: this.take(0x296, false); break;
      case 12: this.take(0x25, true); b.da = 0; break;
      case 13:
        this.take(0x46, !!this.ADJ);
        this.ADJ = 1;
        this.MOVE = this.DIR;
        break;
      case 14: this.take(0x5e, true); this.MOVE = 4; break;
      case 15: this.take(0x6c, true); this.MOVE = this.DIR; break;
      case 16: this.take(0x77, true); this.MOVE = 3; break;
      case 17: this.take(0x85, true); this.MOVE = this.DIR; break;
      case 18: this.take(0x7f, true); this.MOVE = 3; break;
      case 19: this.take(0x66, true); this.MOVE = 4; break;
      case 20: this.take(0x185, false); this.MOVE = 4; break;
      case 21: this.take(0x18a, true); break;
      case 22: this.take(0x190, true); break;
      case HOLDING:
        b.cur = b.e8;
        b.f4 = this.now + b.ee;
        break;
      case 0x18: this.setUpFacial(); break;
      case 0x19: this.take(0x1f2, true); break;
      case 0x1a: this.take(0x1f6, true); break;
      case 0x1b: this.take(0x1ec, true); break;
      case 0x1c: this.take(0x205, true); break;
      case 0x1d: this.take(0xa9, false); break;
      case 0x1e: this.take(1, false); break;
      case 0x1f: this.take(0xf3, true); break;
      case 0x20: this.take(0x174, true); break;
      case 0x21: this.take(0x132, true); break;
      case 0x22: this.take(0x13c, true); b.f4 = this.now + 1500; break;
      case 0x23: this.take(0x143, true); break;
      case 0x24: this.take(0x148, true); break;
      case 0x25: this.take(0x199, true); break;
      case 0x26: this.take(0x1a0, true); b.f4 = this.now + 1500; break;
      case 0x27: this.take(0x1a6, true); break;
      case 0x28:
        if (rand() % 2) { this.take(0x1ad, true); b.da = 4; }
        else { this.take(0x1be, true); b.da = 1; }
        break;
      case 0x29: this.take(0x127, true); break;
      case 0x2a: this.take(0x1d3, true); break;
      case 0x2b: this.take(0x114, true); break;
      case 0x2c: this.take(0x20b, true); break;
    }
  };

  /** One DoState tick of the boy. True when he was drawn. */
  Phlegm.prototype.boyTick = function () {
    var b = this.boy;
    switch (b.state) {
      case 0: return this.boyGoto(1);
      case 1:
        if (b.f0 < this.now) {
          this.wipe(false);
          b.f0 = this.now + this.MESS * 5 * 60000;
        }
        this.setUpEntry();
        return this.boyGoto(HOLDING);
      case 2: case 4: case 7: case 14: case 16: case 20: case 21: case 0x25:
        if (this.once(b, this.FIRST, this.LAST)) {
          return this.boyGoto({ 2: 3, 4: 5, 7: 8, 14: 19, 16: 18, 20: 21, 21: 22, 0x25: 0x26 }[b.state]);
        }
        break;
      case 3:
        if (this.offscreen()) { return this.boyGoto(0); }
        if (b.cur === this.FIRST + b.da) {
          this.residue(1, this.DIR === 1 ? b.x - half(b.w) : b.x + half(b.w),
                       b.y + half(b.h) - rand() % 30 - 3);
        }
        if (this.stepLoop()) {
          if (this.onscreen()) { return this.boyGoto(4); }
          b.cur = this.FIRST;
        }
        break;
      case 5: case 9:
        if (this.once(b, this.FIRST, this.LAST)) {
          if (b.state === 5) { b.e4 = 0; }
          return this.then();
        }
        break;
      case 6:
        if (this.once(b, this.FIRST, this.LAST)) {
          if (rand() % 100 <= this.behavior) { return this.boyGoto(0x2c); }
          return this.boyGoto(rand() % 2 ? 2 : 12);
        }
        break;
      case 8:
        if (this.once(b, this.FIRST, this.LAST)) {
          if (this.offscreen()) { return this.boyGoto(0); }
          b.y += 2;
          return this.boyGoto(9);
        }
        if (b.cur === this.FIRST + b.da) { this.residue(1, b.x, b.y); }
        break;
      case 10:
        if (this.once(b, this.FIRST, this.LAST)) { return this.hold(0x296, 11, 500); }
        break;
      case 11:
        if (this.once(b, this.FIRST, this.LAST)) { return this.hold(0xbd, 9, 500); }
        break;
      case 12:
        if (this.once(b, this.FIRST, this.LAST)) {
          this.residue(2, b.x, b.y);
          return this.boyGoto(13);
        }
        break;
      case 13:
        if (this.offscreen()) { return this.boyGoto(0); }
        if (this.stepLoop()) {
          if (!this.onscreen()) { b.cur = this.FIRST; }
          else if (rand() % 2) {
            if (rand() % 2) { return this.boyGoto(20); }
            b.cur = this.FIRST;
          } else {
            return this.boyGoto(rand() % 2 ? 14 : 16);
          }
        }
        break;
      case 15: case 17:
        if (this.once(b, this.FIRST, this.LAST)) {
          if (rand() % 2 === 0 && this.onscreen()) { return this.boyGoto(20); }
          this.ADJ = 0;
          b.x += this.DIR === 1 ? -4 : 4;
          return this.boyGoto(13);
        }
        break;
      case 18:
        if (this.offscreen()) { return this.boyGoto(0); }
        if (this.once(b, this.FIRST, this.LAST)) {
          if (rand() % 2 === 0 && b.y - half(b.h) > 0) { return this.boyGoto(17); }
          b.y -= 13;
        }
        break;
      case 19:
        if (this.offscreen()) { return this.boyGoto(0); }
        if (this.once(b, this.FIRST, this.LAST)) {
          if (rand() % 2 === 0 && b.y + half(b.h) < this.h) { return this.boyGoto(15); }
          b.y += 13;
        }
        break;
      case 22:
        if (this.once(b, this.FIRST, this.LAST)) {
          if (this.offscreen()) { return this.boyGoto(0); }
          return this.hold(0xbd, 9);
        }
        break;
      case HOLDING:
        if (b.f4 < this.now) {
          if (b.ec === HOLDING) { this.setUpActivity(); }
          return this.boyGoto(b.ec);
        }
        break;
      case 0x18: case 0x19: case 0x1a:
        if (this.once(b, this.FIRST, this.LAST)) {
          return this.hold(this.LAST, b.state === 0x18 ? HOLDING : 0x1c);
        }
        break;
      case 0x1b:
        if (this.once(b, this.FIRST, this.LAST)) { return this.hold(this.LAST, rand() % 2 ? 0x19 : 0x1a); }
        break;
      case 0x1c:
        if (this.once(b, this.FIRST, this.LAST)) {
          if (rand() % 2 || this.req) { return this.boyGoto(2); }
          return this.boyGoto(12);
        }
        break;
      case 0x1d: case 0x1e:
        if (this.once(b, this.FIRST, this.LAST)) { return this.boyGoto(b.ec); }
        break;
      case 0x1f: case 0x27: case 0x2b:
        if (this.once(b, this.FIRST, this.LAST)) { return this.then(); }
        break;
      case 0x20:
        if (this.once(b, this.FIRST, this.LAST)) { return this.then(this.FIRST); }
        break;
      case 0x21:
        if (this.once(b, this.FIRST, this.LAST)) { return this.boyGoto(rand() % 2 ? 0x24 : 0x22); }
        break;
      case 0x22:
        if (this.loop() && b.f4 < this.now) {
          this.adjust(b, this.FIRST, this.LAST);
          return this.boyGoto(0x23);
        }
        break;
      case 0x23:
        if (this.once(b, this.FIRST, this.LAST)) {
          this.setUpActivity();
          return this.boyGoto(b.ec);
        }
        break;
      case 0x24:
        if (this.once(b, this.FIRST, this.LAST)) { return this.boyGoto(0x23); }
        break;
      case 0x26:
        if (this.loop() && b.f4 < this.now) {
          return this.boyGoto(rand() % 100 > this.behavior ? 0x27 : 0x28);
        }
        break;
      case 0x28:
        if (this.once(b, this.FIRST, this.LAST)) {
          this.residue(8, b.x, b.y);
          return this.then();
        }
        break;
      case 0x29:
        if (this.once(b, this.FIRST, this.LAST)) { return this.then(); }
        if (b.cur === this.FIRST + 3) { this.residue(9, b.x, b.y); }
        break;
      case 0x2a:
        if (this.once(b, this.FIRST, this.LAST)) { return this.then(); }
        if (b.cur === this.FIRST + 15) { this.residue(10, b.x, b.y); }
        break;
      case 0x2c:
        if (this.once(b, this.FIRST, this.LAST)) { return this.hold(this.LAST, 0x1b); }
        if (b.cur === this.FIRST + 5) { this.residue(5, b.x, b.y); }
        break;
      default:
        return this.boyGoto(0);
    }
    b.drawn = [b.cur, b.x, b.y];
    b.shown = true;
    return true;
  };

  /* ---------------------------------------------------------- what's left */

  Phlegm.prototype.resTake = function (first, after) {
    var r = this.res;
    r.FIRST = first;
    r.LAST = first + this.film.len(first) - 1;
    r.cur = first - 1;
    r.x = this.reqX; r.y = this.reqY;
    // registered against the boy's frame it came out of
    if (after !== undefined) { this.adjust(r, after, first); }
  };

  Phlegm.prototype.resGoto = function (n) {
    var r = this.res;
    r.state = n;
    switch (n) {
      case 0:
        this.req = 0; r.x = -100; r.y = -100; r.cur = 0x91; r.shown = false;
        break;
      case 1: this.resTake(rand() % 2 ? (rand() % 2 ? 0x91 : 0x95) : (rand() % 2 ? 0x99 : 0x9d)); break;
      case 2: this.resTake(0x8d, 0x25 + this.film.len(0x25) - 1); break;
      case 3: r.cur = 0x180; r.x = this.reqX; r.y = this.reqY; break;
      case 5: this.resTake(0x219, 0x210); break;
      case 6: this.adjust(r, r.LAST, 0x225); r.FIRST = 0x225; r.LAST = 0x225 + this.film.len(0x225) - 1; r.cur = r.FIRST - 1; break;
      case 7: this.adjust(r, r.LAST, 0x231); r.FIRST = 0x231; r.LAST = 0x231 + this.film.len(0x231) - 1; r.cur = r.FIRST - 1; break;
      case 8: this.resTake(0x1cf, 0x1ad + this.film.len(0x1ad) - 1); break;
      case 9: this.resTake([0x245, 0x257, 0x266][rand() % 3], 0x127 + this.film.len(0x127) - 1); break;
      case 10: this.resTake(rand() % 2 ? 0x274 : 0x27f, 0x1d3 + this.film.len(0x1d3) - 1); break;
      default: r.state = 0;
    }
    return false;
  };

  /** Stamp it into the background and go back to waiting. */
  Phlegm.prototype.stamp = function () {
    var r = this.res;
    if (r.drawn) {
      this.film.draw(this.bg.getContext('2d'), r.drawn[0], r.drawn[1], r.drawn[2]);
    }
    r.shown = false;
  };

  Phlegm.prototype.resTick = function () {
    var r = this.res;
    switch (r.state) {
      case 0:
        if (this.req) { return this.resGoto(this.req); }
        return false;
      case 1: case 2: case 8: case 9: case 10:
        if (this.once(r, r.FIRST, r.LAST)) { this.stamp(); return this.resGoto(0); }
        break;
      case 3:
        r.cur += 1;
        if (r.cur > 0x181) { this.stamp(); return this.resGoto(0); }
        break;
      case 5:
        if (this.once(r, r.FIRST, r.LAST)) { this.stamp(); return this.resGoto(rand() % 2 ? 6 : 0); }
        break;
      case 6:
        if (this.once(r, r.FIRST, r.LAST)) { return this.resGoto(7); }
        break;
      case 7:
        if (r.x <= 0 || r.x >= this.w) { return this.resGoto(0); }
        if (r.cur >= r.FIRST) { this.adjust(r, r.cur, r.cur + 1); }
        r.cur += 1;
        if (r.cur >= r.LAST) { r.cur = r.FIRST; }
        break;
      default:
        return false;
    }
    r.drawn = [r.cur, r.x, r.y];
    r.shown = true;
    return true;
  };

  /* --------------------------------------------------------------- frame */

  Phlegm.prototype.step = function (dt) {
    if (!this.film) { return; }
    this.now += dt * 1000;
    if (this.now < this.next) { return; }
    // A state change returns without drawing, and the module's loop calls
    // straight back in, so run on until the boy has drawn a frame.
    for (var i = 0; i < 24; i += 1) {
      var drew = this.boyTick();
      if (this.req) { this.resTick(); }
      if (drew) { break; }
    }
    this.next = this.now + TICK;
  };

  Phlegm.prototype.draw = function (ctx) {
    ctx.drawImage(this.bg, 0, 0);
    if (!this.film) { return; }
    var r = this.res, b = this.boy;
    if (r.shown && r.drawn) { this.film.draw(ctx, r.drawn[0], r.drawn[1], r.drawn[2]); }
    if (b.shown && b.drawn) { this.film.draw(ctx, b.drawn[0], b.drawn[1], b.drawn[2]); }
  };

  /* ------------------------------------------------------------ element */

  function PhlegmElement() { return Reflect.construct(HTMLElement, [], PhlegmElement); }
  PhlegmElement.prototype = Object.create(HTMLElement.prototype);
  PhlegmElement.prototype.constructor = PhlegmElement;
  Object.setPrototypeOf(PhlegmElement, HTMLElement);

  PhlegmElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var base = this.getAttribute('art') || 'art/phlegm_b';
    this.style.display = this.style.display || 'block';

    Promise.all([window.AfterDark.load(base), window.AfterDark.data(base)]).then(function (both) {
      var sim = new Phlegm(both[0], both[1].films && both[1].films[FILM]);
      var b = (AfterDark.setting(self, 'behavior') || '').toLowerCase();
      if (BEHAVIOR[b] !== undefined) { sim.behavior = BEHAVIOR[b]; }
      else if (/^\d+$/.test(b)) { sim.behavior = Math.min(100, parseInt(b, 10)); }
      var m = (AfterDark.setting(self, 'mess') || '').toLowerCase();
      if (MESS[m] !== undefined) { sim.mess = MESS[m]; }
      else if (/^\d+$/.test(m)) { sim.mess = Math.min(100, parseInt(m, 10)); }
      sim.clear = AfterDark.setting(self, 'clear-screen') !== 'no';

      var screen = new AfterDark.Screen(self);
      self._screen = screen;
      self.sim = sim;
      screen.onresize = function (w, h) {
        sim.desktop = sim.clear ? null : AfterDark.desktop(w, h);
        sim.reset(w, h);
      };
      screen.onresize(screen.width, screen.height);
      screen.run(function (dt, ctx) {
        sim.step(dt);
        sim.draw(ctx);
      });
    }).catch(function (err) {
      self.textContent = err.message;
    });
  };

  PhlegmElement.prototype.disconnectedCallback = function () {
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-phlegm', PhlegmElement);
  window.AfterDarkPhlegm = Phlegm;
}());
