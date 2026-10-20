/**
 * bungee.js - Bungee Roulette, on the module's own artwork and its own film.
 *
 * BUNGEE.AD, 1995, from the 10th anniversary collection. Its own description:
 *
 *   "Bungee Roulette. Falling is such sweet sorrow! Dedicated to those brave
 *    souls who risk their lives every day for cheap thrills. Bungee was a
 *    runner up in the 1992 After Dark Display Contest and Grand Prize winner
 *    in the 1992 Weird Software Contest.
 *    Jumper: Pick your road pizza.
 *    Jumps: Just how many must die before the screen FINALLY clears!?
 *    Equipment: Play God! Determine the quality of the rope."
 *   Art by Robert Cuenca. Programming by Scott Garcia.
 *
 * The settings are its own, out of TYPE_1000: Jumper = Daredevil / Half
 * Daredevil / Cow / Fish / Half Fish / Random (default Daredevil), Jumps =
 * One / Few / Many / Droves / Whole Bunches / Hundreds (default Many),
 * Equipment = Safe / Reliable / Used / So - So / Purfikt (default Used), and
 * Clear Screen First (on).
 *
 * Like the Totally Twisted modules it is a film: an OFST timeline of 423
 * ticks over the RLE frames of 9000 and 9001, each tick a cel of several
 * frames - a cow is a body, a tail, legs and a head, and the rope is a stack
 * of 33- or 66-pixel pieces that wriggle. tools/adfilm.py puts it in
 * art/bungee/index.json; it has to run with VOTE=1, because 9001's frames are
 * numbered straight on from 9000's with no spare number between them.
 *
 * The module exports its C++ symbols, and what follows is read off the code
 * (NE segments 5 and 6) rather than guessed. Two sprites, one jumper at a time:
 *
 *   JumperSprite  SetUpEntry: a random x across the screen, starting half its
 *                 own height above the top, looping the dangling take and
 *                 dropping 10 px a tick (40 ms) to a random stop chosen so the
 *                 top of the rope never shows. Equipment is the chance the rope
 *                 holds, decided as it jumps: Safe always, Reliable 3 in 4,
 *                 Used 1 in 2, So - So 1 in 4, Purfikt never.
 *                 SetUpBounce: if it holds, the bounce plays once (80 ms a
 *                 tick) and the jumper is left hanging there for good.
 *                 SetUpSnap / SetUpRecoil: if not, the snap plays, the body
 *                 is handed to the FallSprite, and the rope that is left
 *                 springs back up and stays.
 *   FallSprite    SetUpFall: falls from where the snap left it, 6 px lower,
 *                 at 1, 3, 5 ... 11 px a tick, until its take's bottom is
 *                 within (20 + a margin per jumper) of the bottom of the screen.
 *                 SetUpSplat: then the splat plays once and is left there. The
 *                 daredevil has two splats, one picked at random, and three
 *                 times in four only the first 12 ticks of it play; the longer
 *                 one has something crawling off out of the mess.
 *
 * The next jumper waits until the faller has landed. "Jumps" is counted as
 * each one sets off: One clears the screen every jump, Few after 4, Many 8,
 * Droves 12, Whole Bunches 16 and Hundreds 250, by wiping whatever has been
 * left on the background. The chicken of the earlier port was the cow's head.
 *
 * The take starts and the take each sprite and jumper uses (state -> tick):
 *
 *               entry bounce snap recoil fall splat
 *   Daredevil     72    82   115   339   122  128 or 363
 *   Half Dd.      72    82   159   167   184  190 or 394
 *   Cow            1     7    40   339    47   53
 *   Fish         222   228   261   339   268  274
 *   Half Fish    222   228   293   302   318  324
 *
 * A take runs to the last of its consecutive ticks (the code asks the film for
 * its length). Positions are cel centres, as the code keeps them: the stop,
 * the start above the screen and the landing are all tested on the centre of
 * the current cel, and moving from one cel to the next keeps the picture where
 * it was plus the entry's own offset - which only the recoiling rope has.
 *
 * Checked against a capture of the real thing at the defaults (Daredevil,
 * Many, Used): one at a time, the drop at ~260 px/s, the snap high up, the
 * rope left at the top wriggling back and the remains piling up along the
 * bottom 740-757 px down a 768 screen, survivors left hanging, the screen
 * wiped after eight. Not reproduced: the sounds (a moo, the scream, the
 * splat).
 *
 *   <after-dark-bungee jumper="daredevil" jumps="many" equipment="used">
 */
(function () {
  'use strict';

  var FILM = '9000';

  /* From JumperSprite::SetUp* and FallSprite::SetUp*. `margin` is the
     per-jumper slack FallSprite::AboutToHitRockBottom adds to its 20 px;
     `short` is how much of the daredevil splats plays three times in four. */
  var KINDS = {
    'daredevil':      { entry: 72,  bounce: 82,  snap: 115, recoil: 339, fall: 122, margin: 16, splat: [128, 363], short: 11 },
    'half daredevil': { entry: 72,  bounce: 82,  snap: 159, recoil: 167, fall: 184, margin: 20, splat: [190, 394], short: 12 },
    'cow':            { entry: 1,   bounce: 7,   snap: 40,  recoil: 339, fall: 47,  margin: 6,  splat: [53] },
    'fish':           { entry: 222, bounce: 228, snap: 261, recoil: 339, fall: 268, margin: 10, splat: [274] },
    'half fish':      { entry: 222, bounce: 228, snap: 293, recoil: 302, fall: 318, margin: 10, splat: [324] }
  };
  var ORDER = ['daredevil', 'half daredevil', 'cow', 'fish', 'half fish'];

  /* JumperSprite::theirMaxJumpCount: 1, then four a step, and Hundreds 250. */
  var JUMPS = {
    'one': 1, 'few': 4, 'many': 8, 'droves': 12, 'whole bunches': 16, 'hundreds': 250
  };
  /* The chance the rope holds (theirSuccessJump against rand() % 100). */
  var HOLDS = {
    'safe': 1, 'reliable': 0.75, 'used': 0.5, 'so - so': 0.25, 'so-so': 0.25, 'purfikt': 0
  };

  var ENTRY_TICK = 0.04;      // the drop, and the fall
  var PLAY_TICK = 0.08;       // bounce, snap, recoil and splat
  var DROP = 10;              // px a tick on the way down

  function irand(n) { return Math.floor(Math.random() * Math.max(1, n)); }

  /* ------------------------------------------------------------ the film */

  function Film(art, film) {
    this.art = art;
    this.cels = film.cels;
    this.at = {};
    var self = this;
    film.entries.forEach(function (e) { self.at[e[0]] = e; });
    // Each cel's rect is the union of its frames (it is in the OFTB too).
    this.rect = film.cels.map(function (cel) {
      var r = [Infinity, Infinity, -Infinity, -Infinity];
      cel.forEach(function (q) {
        var f = art.sequence(q[0]).frames[q[1]];
        r[0] = Math.min(r[0], q[4]); r[1] = Math.min(r[1], q[5]);
        r[2] = Math.max(r[2], q[4] + f.w); r[3] = Math.max(r[3], q[5] + f.h);
      });
      return r;
    });
  }

  /** A take: from `start` to the last of its consecutive ticks, or `end`. */
  Film.prototype.take = function (start, end) {
    var last = start;
    while (this.at[last + 1]) { last += 1; }
    if (end === undefined || end > last) { end = last; }
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    for (var t = start; t <= end; t += 1) {
      var r = this.rect[this.at[t][1]];
      b[0] = Math.min(b[0], r[0]); b[1] = Math.min(b[1], r[1]);
      b[2] = Math.max(b[2], r[2]); b[3] = Math.max(b[3], r[3]);
    }
    return { start: start, end: end, w: b[2] - b[0], h: b[3] - b[1] };
  };

  Film.prototype.centre = function (tick) {
    var r = this.rect[this.at[tick][1]];
    return [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
  };

  /** The entry's own offset, which is relative to its take, not cumulative. */
  Film.prototype.offset = function (tick) {
    var e = this.at[tick];
    return [e[2], e[3]];
  };

  /** Draw the cel at `tick` with film (0,0) at (tx, ty). */
  Film.prototype.draw = function (ctx, tick, tx, ty) {
    var cel = this.cels[this.at[tick][1]];
    for (var i = 0; i < cel.length; i += 1) {
      var q = cel[i];
      var seq = this.art.sequence(q[0]);
      var f = seq.frames[q[1]];
      ctx.drawImage(seq.image, f.x, f.y, f.w, f.h,
                    Math.round(q[4] + tx), Math.round(q[5] + ty), f.w, f.h);
    }
  };

  /* -------------------------------------------------------------- sprites */

  /* A sprite is a take, the tick it is on, and where film (0,0) is on the
     screen. Moving from tick a to tick b keeps the picture registered and
     adds the difference of the two entries' offsets. */
  function Sprite(film) {
    this.film = film;
    this.state = 0;
    this.take = null;
    this.cur = 0;
    this.tx = 0;
    this.ty = 0;
    this.every = PLAY_TICK;
    this.acc = 0;
  }

  Sprite.prototype.shift = function (a, b) {
    var da = this.film.offset(a), db = this.film.offset(b);
    this.tx += db[0] - da[0];
    this.ty += db[1] - da[1];
  };

  /** Cut to the start of a take, keeping the picture where it is. */
  Sprite.prototype.cut = function (take) {
    this.shift(this.cur, take.start);
    this.take = take;
    this.cur = take.start;
  };

  /** One tick of a take played once; true when it has finished. */
  Sprite.prototype.once = function () {
    if (this.cur >= this.take.end) { return true; }
    this.shift(this.cur, this.cur + 1);
    this.cur += 1;
    return false;
  };

  /** One tick of a take on a loop, dropping `dy` as it goes. */
  Sprite.prototype.loop = function (dy) {
    var next = this.cur >= this.take.end ? this.take.start : this.cur + 1;
    this.shift(this.cur, next);
    this.cur = next;
    this.ty += dy;
  };

  /** The centre of the current cel on the screen, which is what the code tests. */
  Sprite.prototype.y = function () {
    return this.film.centre(this.cur)[1] + this.ty;
  };

  Sprite.prototype.draw = function (ctx) {
    this.film.draw(ctx, this.cur, this.tx, this.ty);
  };

  /* ------------------------------------------------------------- the module */

  function Bungee(art, data) {
    this.film = new Film(art, data.films[FILM]);
    this.choice = 'daredevil';
    this.max = JUMPS.many;
    this.hold = HOLDS.used;
    this.clear = true;
  }

  Bungee.prototype.setJumper = function (name) {
    name = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    this.choice = KINDS[name] || name === 'random' ? name : 'daredevil';
  };

  Bungee.prototype.reset = function (w, h) {
    this.w = w;
    this.h = h;
    this.back = document.createElement('canvas');
    this.back.width = Math.max(1, Math.round(w));
    this.back.height = Math.max(1, Math.round(h));
    this.count = 0;
    this.handoff = null;
    this.jumper = new Sprite(this.film);
    this.faller = new Sprite(this.film);
    this.jumper.state = 1;
  };

  /** Leave a sprite's current cel on the background for good. */
  Bungee.prototype.stamp = function (s) {
    var g = this.back.getContext('2d');
    if (g) { s.draw(g); }
  };

  Bungee.prototype.wipe = function () {
    var g = this.back.getContext('2d');
    if (g) { g.clearRect(0, 0, this.back.width, this.back.height); }
  };

  /** JumperSprite::SetUpEntry. */
  Bungee.prototype.entry = function () {
    var j = this.jumper, f = this.film;
    var name = this.choice === 'random' ? ORDER[irand(ORDER.length)] : this.choice;
    j.kind = KINDS[name];
    j.take = f.take(j.kind.entry);
    var h = j.take.h, H = this.h;
    var len = j.take.end - j.take.start + 1;
    // Where it stops: low enough to see, never so low the rope's top shows.
    var range = h - 30 < Math.trunc(H / 2) ?
      Math.trunc(h / 2) + Math.trunc(h / 4) - 30 :
      Math.trunc(H / 2) - Math.trunc(h / 2) + Math.trunc(h / 4) - 30;
    j.target = irand(range) - Math.trunc(h / 4);
    j.holds = Math.random() < this.hold;
    j.cur = j.take.start + irand(len - 1);
    var c = f.centre(j.cur);
    j.tx = irand(this.w) - c[0];
    j.ty = -Math.trunc(h / 2) - 2 - c[1];
    j.every = ENTRY_TICK;
    j.state = 2;
  };

  /** JumperSprite::DoState, one tick. */
  Bungee.prototype.jumperTick = function () {
    var j = this.jumper, k = j.kind;
    switch (j.state) {
    case 0:
      j.state = 1;
      break;
    case 1:
      // The next one goes once the last has landed; setting off counts as a
      // jump, and one too many wipes the screen first.
      if (!this.handoff) {
        this.entry();
        this.count += 1;
        if (this.count > this.max) { this.wipe(); this.count = 1; }
      }
      break;
    case 2:
      j.loop(DROP);
      if (j.y() >= j.target) {
        j.cut(this.film.take(j.holds ? k.bounce : k.snap));
        j.every = PLAY_TICK;
        j.state = j.holds ? 3 : 4;
      }
      break;
    case 3:
      if (j.once()) { this.stamp(j); j.state = 0; }
      break;
    case 4:
      if (j.once()) {
        this.handoff = { kind: k, cur: j.cur, tx: j.tx, ty: j.ty };
        j.cut(this.film.take(k.recoil));
        j.state = 5;
      }
      break;
    case 5:
      if (j.once()) { this.stamp(j); j.state = 0; }
      break;
    }
  };

  /** FallSprite::DoState, one tick. */
  Bungee.prototype.fallerTick = function () {
    var s = this.faller, f = this.film, k;
    switch (s.state) {
    case 0:
      if (this.handoff) {
        k = s.kind = this.handoff.kind;
        s.cur = this.handoff.cur;
        s.tx = this.handoff.tx;
        s.ty = this.handoff.ty;
        s.cut(f.take(k.fall));
        s.ty += 6;
        s.speed = 1;
        s.every = ENTRY_TICK;
        s.state = 1;
      }
      break;
    case 1:
      k = s.kind;
      if (s.y() + Math.trunc(s.take.h / 2) + k.margin + 20 > this.h) {
        var start = k.splat[irand(k.splat.length)];
        var end = k.short && Math.random() * 100 >= 26 ? start + k.short : undefined;
        s.cut(f.take(start, end));
        s.every = PLAY_TICK;
        s.state = 2;
      } else {
        s.loop(s.speed);
        if (s.speed < 10) { s.speed += 2; }
      }
      break;
    case 2:
      if (s.once()) {
        this.stamp(s);
        s.state = 0;
        this.handoff = null;
      }
      break;
    }
  };

  Bungee.prototype.step = function (dt) {
    var self = this;
    [[this.jumper, this.jumperTick], [this.faller, this.fallerTick]].forEach(function (p) {
      var s = p[0];
      s.acc = Math.min(s.acc + dt, 0.25);
      while (s.acc >= s.every) {
        s.acc -= s.every;
        p[1].call(self);
      }
    });
  };

  Bungee.prototype.draw = function (ctx, w, h) {
    if (this.clear) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.clearRect(0, 0, w, h);
    }
    ctx.drawImage(this.back, 0, 0, w, h);
    if (this.faller.state > 0) { this.faller.draw(ctx); }
    if (this.jumper.state > 1) { this.jumper.draw(ctx); }
  };

  /* ------------------------------------------------------------ element */

  function BungeeElement() { return Reflect.construct(HTMLElement, [], BungeeElement); }
  BungeeElement.prototype = Object.create(HTMLElement.prototype);
  BungeeElement.prototype.constructor = BungeeElement;
  Object.setPrototypeOf(BungeeElement, HTMLElement);

  BungeeElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var base = this.getAttribute('art') || 'art/bungee';
    this.style.display = this.style.display || 'block';

    Promise.all([window.AfterDark.load(base), window.AfterDark.data(base)]).then(function (both) {
      var sim = new Bungee(both[0], both[1]);
      sim.setJumper(AfterDark.setting(self, 'jumper') || 'daredevil');
      var jumps = (AfterDark.setting(self, 'jumps') || 'many').toLowerCase();
      sim.max = JUMPS[jumps] || parseInt(jumps, 10) || JUMPS.many;
      var kit = (AfterDark.setting(self, 'equipment') || 'used').toLowerCase().trim();
      sim.hold = HOLDS[kit] !== undefined ? HOLDS[kit] : HOLDS.used;
      sim.clear = AfterDark.setting(self, 'clear-screen') !== 'no';
      if (sim.clear) { self.style.background = '#000'; }

      var screen = new AfterDark.Screen(self);
      self._screen = screen;
      self.sim = sim;
      screen.onresize = function (w, h) { sim.reset(w, h); };
      sim.reset(screen.width, screen.height);
      screen.run(function (dt, ctx, w, h) {
        sim.step(dt);
        sim.draw(ctx, w, h);
      });
    }).catch(function (err) {
      self.textContent = err.message;
    });
  };

  BungeeElement.prototype.disconnectedCallback = function () {
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-bungee', BungeeElement);
  window.AfterDarkBungee = Bungee;
}());
