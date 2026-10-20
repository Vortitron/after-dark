/**
 * franken.js - FrankenScreen, on the module's own artwork and its own films.
 *
 * FRANKEN.AD, 1995, one of the Totally Twisted modules. Its own description:
 *
 *   "Frankenscreen. Your digital Dr. Frankenstein builds eerie creatures out
 *    of a varied collection of disgusting body parts. You decide how many
 *    scars, warts, zits, screws, pus, festering scabs there are, and we'll
 *    take care of the rest. We recommend a biiiig ol' meal before watching
 *    this baby!
 *    Coherency: Sets how messed up things can get.
 *    Blemishes: Add zits, scabs, pus, etc.
 *    Lifespan: You hold its fate in your hands.
 *    Music: Oooooh, scaaarrry!
 *    CapsLock: Forces a new creature to be created (you're the boss!)"
 *   Art by Dana Muise. Programming by Brian Chen.
 *
 * The settings are its own, out of TYPE_1000: Coherence = Humanoid /
 * Disfigured / Mutated / Horrific / Hellspawned, Blemishes = Pretty Boy /
 * Teenager / Craterface / Disfigured / Scarface, Lifespan = Brief / Short /
 * Medium / Lengthy / Interminable, and Music (Never ... 'Til Ya Drop) - no
 * sound here, so Music does nothing. Caps Lock makes a new creature.
 *
 * The art is three of the Twisted modules' films (OFST timelines over OFTB
 * cels of RLE frames; see mboris.js), each a parts bin laid end to end -
 * the module's symbols name the parts: EyeSprite, NoseSprite (Nose1-3),
 * MouthSprite (Mouth1-3), DongleSprite (a squirt and a vein), extras:
 *
 *   eyes    a torn socket with a rolling eyeball; a tentacled socket with a
 *           cat's eye; a camera lens with a shutter; a cluster of eggs whose
 *           pupils drift; a stitched-on lid; an eye clamped in a steel frame
 *   noses   a horned yellow one that worms crawl out of; two orange
 *           nostrils (one picture and its mirror); a purple one, both
 *           dripping pus
 *   mouths  bloody lips over green fangs, drooling; lips stitched on a patch
 *           of skin, with a tongue; green lips with teeth that drool
 *   skins   pink veins, green scales, orange, purple - tiles, with the bumps
 *           that go with the orange and the purple
 *   the rest  ten stitched scars, a pulsing vein, a hole with a worm in it,
 *           zits, a scab, a safety pin, screws and a bolt, a brain
 *
 * Parts move the way their takes do: the frame a part comes back to most is
 * its rest, each run away from it and back is one move, played at ten ticks
 * a second (the capture's rate). All the eyes move together (EyeGod).
 *
 * From the capture (Humanoid, the defaults): the creature fills the screen -
 * the skin tiled edge to edge, eyes a quarter of the way in from either
 * side near the top, the nose in the middle, the mouth low down - and any
 * eye, nose, mouth and skin can go together. It holds still but for the
 * parts moving every few seconds, and after thirty seconds (Brief) the next
 * one replaces it at once. Inferred, not seen: what the other Coherency
 * settings do (here: parts further out of place, then extra eyes, then
 * eyes of different kinds and parts anywhere), what each Blemish level
 * adds, and the longer Lifespans.
 *
 *   <after-dark-frankenscreen art="art/franken" coherency="humanoid" blemishes="teenager" lifespan="brief">
 */
(function () {
  'use strict';

  var TICK = 0.1;
  var COHERENCY = ['humanoid', 'disfigured', 'mutated', 'horrific', 'hellspawned'];
  var BLEMISHES = ['pretty boy', 'teenager', 'craterface', 'disfigured', 'scarface'];
  var LIFESPANS = ['brief', 'short', 'medium', 'lengthy', 'interminable'];
  var LIFE = [30, 60, 120, 300, 900];
  var MUSIC = ['never', 'once', 'twice', 'thrice', 'four times', '\'tilyadrop'];

  /* [film, first tick, end tick] of each part in the films. */
  var EYES = [[1000, 1, 119], [1000, 119, 193], [2000, 1, 28], [2000, 28, 266], [3000, 1, 100], [3000, 100, 189]];
  var NOSES = [[1000, 193, 251], [2000, 319, 347], [3000, 225, 252]];
  var MOUTHS = [[1000, 254, 310], [2000, 266, 319], [3000, 189, 225]];
  /* Skin tile, and the bumps that go with it. */
  var SKINS = [
    { tile: 1012, bumps: [[1000, 324, 330]] },
    { tile: 1013, bumps: [[1000, 324, 330]] },
    { tile: 3011, bumps: [[3000, 254, 260]] },
    { tile: 3013, bumps: [[3000, 262, 268]] }
  ];
  var SCARS = [2000, 370, 389];
  var ZITS = [[3000, 268, 270], [3000, 270, 272]];
  var SCAB = [3000, 274, 276];
  var PIN = [3000, 272, 274];
  var SCREWS = [[1000, 315, 318], [1000, 318, 321], [1000, 321, 324]];
  var BRAIN = [1000, 251, 254];
  var VEIN = [2000, 347, 350];
  var SQUIRT = [2000, 350, 370];

  /* How many of each a Blemish level puts on: bumps, scars, zits, scabs,
     pins, screws, veins, squirts. Teenager is what the capture shows. */
  var SPOTS = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [5, 5, 0, 0, 0, 0, 0, 0],
    [14, 4, 5, 2, 0, 0, 0, 0],
    [10, 9, 3, 2, 1, 2, 1, 1],
    [8, 16, 3, 4, 2, 3, 2, 2]
  ];

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function irand(a, b) {
    return Math.floor(rand(a, b + 1));
  }

  /* ---- the films ---- */

  /** Draw cel `c` of `film`, its film point (fx, fy) at screen (x, y). */
  function drawCel(g, art, film, c, x, y, fx, fy, s) {
    var sp = film.cels[c];
    for (var i = 0; i < sp.length; i += 1) {
      var q = sp[i], seq = art.sequence(q[0]);
      if (!seq) { continue; }
      var f = seq.frames[q[1]];
      var px = Math.round(x + (q[4] - fx) * s), py = Math.round(y + (q[5] - fy) * s);
      if (!q[3]) {
        g.drawImage(seq.image, f.x, f.y, f.w, f.h, px, py, f.w * s, f.h * s);
        continue;
      }
      g.save();
      g.translate(px + (q[3] & 1 ? f.w * s : 0), py + (q[3] & 2 ? f.h * s : 0));
      g.scale(q[3] & 1 ? -1 : 1, q[3] & 2 ? -1 : 1);
      g.drawImage(seq.image, f.x, f.y, f.w, f.h, 0, 0, f.w * s, f.h * s);
      g.restore();
    }
  }

  /**
   * A part: the entries of one take, its rest cel, the moves away from it
   * and back, and the box of its rest cel in film pixels.
   */
  function Part(art, films, spec) {
    var film = films[String(spec[0])];
    this.art = art;
    this.film = film;
    var run = film.entries.filter(function (e) { return e[0] >= spec[1] && e[0] < spec[2]; });
    var count = {}, i;
    run.forEach(function (e) { count[e[1]] = (count[e[1]] || 0) + 1; });
    var rest = run[0][1];
    Object.keys(count).forEach(function (k) { if (count[k] > count[rest]) { rest = Number(k); } });
    this.rest = rest;
    this.moves = [];
    var move = [];
    for (i = 0; i < run.length; i += 1) {
      var dur = i + 1 < run.length ? run[i + 1][0] - run[i][0] : 1;
      if (run[i][1] === rest) {
        if (move.length) { this.moves.push(move); }
        move = [];
      } else {
        move.push([run[i][1], Math.max(1, dur)]);
      }
    }
    if (move.length) { this.moves.push(move); }
    this.cels = run.map(function (e) { return e[1]; });
    /* Box of the rest cel. */
    var box = [Infinity, Infinity, -Infinity, -Infinity];
    film.cels[rest].forEach(function (q) {
      var seq = art.sequence(q[0]);
      if (!seq) { return; }
      var f = seq.frames[q[1]];
      box[0] = Math.min(box[0], q[4]);
      box[1] = Math.min(box[1], q[5]);
      box[2] = Math.max(box[2], q[4] + f.w);
      box[3] = Math.max(box[3], q[5] + f.h);
    });
    this.box = box;
    this.cx = (box[0] + box[2]) / 2;
    this.cy = (box[1] + box[3]) / 2;
    this.w = box[2] - box[0];
    this.h = box[3] - box[1];
  }

  Part.prototype.draw = function (ctx, cel, x, y, s) {
    drawCel(ctx, this.art, this.film, cel, x, y, this.cx, this.cy, s);
  };

  /* ---- the creature ---- */

  function Franken() {
    this.coherency = 0;
    this.blemishes = 1;
    this.life = LIFE[0];
    this.ready = false;
  }

  Franken.prototype.resize = function (w, h) {
    this.w = w;
    this.h = h;
    this.s = Math.max(1, Math.round(Math.min(w, h) / 768));
    if (this.ready) { this.create(); }
  };

  Franken.prototype.part = function (spec) {
    var key = spec.join(':');
    if (!this.parts[key]) { this.parts[key] = new Part(this.art, this.films, spec); }
    return this.parts[key];
  };

  /** Room for a box here? (RectMgr kept the parts apart.) */
  Franken.prototype.free = function (x, y, w, h, pad) {
    for (var i = 0; i < this.taken.length; i += 1) {
      var r = this.taken[i];
      if (x - w / 2 - pad < r[2] && x + w / 2 + pad > r[0] && y - h / 2 - pad < r[3] && y + h / 2 + pad > r[1]) {
        return false;
      }
    }
    return true;
  };

  Franken.prototype.take = function (x, y, w, h) {
    this.taken.push([x - w / 2, y - h / 2, x + w / 2, y + h / 2]);
  };

  /** Put a part near (x, y), as near as there is room for it. */
  Franken.prototype.place = function (spec, x, y, jitter, list) {
    var p = this.part(spec), s = this.s, w = p.w * s, h = p.h * s;
    for (var tries = 0; tries < 40; tries += 1) {
      var spread = jitter * (1 + tries / 10);
      var px = x + rand(-spread, spread), py = y + rand(-spread, spread);
      px = Math.max(w / 2, Math.min(this.w - w / 2, px));
      py = Math.max(h / 2, Math.min(this.h - h / 2, py));
      if (this.free(px, py, w, h, 6 * s) || tries === 39) {
        this.take(px, py, w, h);
        var it = { part: p, x: px, y: py, cel: p.rest, move: null, at: 0, wait: rand(0.5, 4) };
        (list || this.live).push(it);
        return it;
      }
    }
    return null;
  };

  /** Stick a still extra on somewhere there is room. */
  Franken.prototype.stick = function (g, spec, cel) {
    var p = this.part(spec), s = this.s;
    var c = cel === undefined ? pick(p.cels) : cel;
    for (var tries = 0; tries < 30; tries += 1) {
      var x = rand(0, this.w), y = rand(0, this.h);
      if (this.free(x, y, p.w * s, p.h * s, 2 * s)) {
        p.draw(g, c, x, y, s);
        return;
      }
    }
  };

  Franken.prototype.create = function () {
    var w = this.w, h = this.h, s = this.s, co = this.coherency, i;
    this.parts = this.parts || {};
    this.taken = [];
    this.live = [];
    this.eyes = [];
    this.age = 0;
    this.skin = pick(SKINS);

    /* Humanoid is the capture's layout: eyes near the top a quarter of the
       way in, the nose in the middle, the mouth low. */
    var jitter = [10, 45, 70, 110, 160][co] * s;
    var eye = pick(EYES), eyes = [[0.245, 0.185], [0.73, 0.185]];
    var extra = [0, 0, 1, irand(1, 3), irand(3, 6)][co];
    var mouth = this.place(pick(MOUTHS), w * 0.49, h * 0.78, jitter);
    var nose = this.place(pick(NOSES), w * 0.485, h * 0.44, jitter);
    for (i = 0; i < eyes.length + extra; i += 1) {
      var at = i < eyes.length ? eyes[i] : [rand(0.1, 0.9), rand(0.1, co > 3 ? 0.9 : 0.6)];
      var kind = co >= 3 ? pick(EYES) : eye;
      this.place(kind, w * at[0], h * at[1], i < eyes.length ? jitter : jitter * 2, this.eyes);
    }
    if (co >= 4) {
      /* Hellspawned: anything anywhere. */
      [mouth, nose].forEach(function (it) {
        if (it) { it.x = rand(it.part.w * s / 2, w - it.part.w * s / 2); it.y = rand(it.part.h * s / 2, h - it.part.h * s / 2); }
      });
      if (Math.random() < 0.5) { this.place(pick(MOUTHS), rand(0.2, 0.8) * w, rand(0.2, 0.9) * h, jitter); }
    }

    /* The skin, the blemishes and the still extras are painted once. */
    this.bg = document.createElement('canvas');
    this.bg.width = Math.max(1, Math.round(w));
    this.bg.height = Math.max(1, Math.round(h));
    var g = this.bg.getContext('2d');
    if (!g) { return; }
    g.imageSmoothingEnabled = false;
    var tile = this.art.sequence(this.skin.tile), f = tile.frames[0];
    for (var ty = 0; ty < h; ty += f.h * s) {
      for (var tx = 0; tx < w; tx += f.w * s) {
        g.drawImage(tile.image, f.x, f.y, f.w, f.h, tx, ty, f.w * s, f.h * s);
      }
    }
    var n = SPOTS[this.blemishes];
    for (i = 0; i < n[0]; i += 1) { this.stick(g, pick(this.skin.bumps)); }
    for (i = 0; i < n[1]; i += 1) { this.stick(g, SCARS); }
    for (i = 0; i < n[2]; i += 1) { this.stick(g, pick(ZITS)); }
    for (i = 0; i < n[3]; i += 1) { this.stick(g, SCAB); }
    for (i = 0; i < n[4]; i += 1) { this.stick(g, PIN); }
    for (i = 0; i < n[5]; i += 1) { this.stick(g, pick(SCREWS)); }
    if (co >= 3 && Math.random() < 0.5) { this.stick(g, BRAIN); }
    /* The dongles move, so they live with the face parts. */
    for (i = 0; i < n[6]; i += 1) { this.place(VEIN, rand(0.1, 0.9) * w, rand(0.1, 0.9) * h, 200 * s); }
    for (i = 0; i < n[7]; i += 1) { this.place(SQUIRT, rand(0.1, 0.9) * w, rand(0.1, 0.9) * h, 200 * s); }
    this.eyeWait = rand(1, 3);
  };

  /** One part's tick: hold at rest, then run a move and come back. */
  Franken.prototype.animate = function (it, dt) {
    var moves = it.part.moves;
    if (!moves.length) { return; }
    if (!it.move) {
      it.wait -= dt;
      if (it.wait <= 0) { it.move = pick(moves); it.i = 0; it.at = 0; }
      return;
    }
    this.advance(it, dt);
  };

  Franken.prototype.advance = function (it, dt) {
    it.at += dt;
    while (it.move && it.at >= it.move[it.i][1] * TICK) {
      it.at -= it.move[it.i][1] * TICK;
      it.i += 1;
      if (it.i >= it.move.length) {
        it.move = null;
        it.cel = it.part.rest;
        it.wait = rand(1, 5);
        return;
      }
    }
    if (it.move) { it.cel = it.move[it.i][0]; }
  };

  Franken.prototype.step = function (dt, ctx, w, h) {
    if (!this.ready) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      return;
    }
    if (!this.bg) { this.create(); }
    this.age += dt;
    if (this.age > this.life || this.forced) {
      this.forced = false;
      this.create();
    }
    var i, s = this.s;
    for (i = 0; i < this.live.length; i += 1) { this.animate(this.live[i], dt); }
    /* EyeGod: the eyes all look the same way at the same time. */
    var lead = this.eyes[0];
    if (lead) {
      if (!lead.move) {
        this.eyeWait -= dt;
        if (this.eyeWait <= 0) {
          var k = Math.floor(Math.random() * 1000);
          this.eyes.forEach(function (e) {
            if (e.part.moves.length) { e.move = e.part.moves[k % e.part.moves.length]; e.i = 0; e.at = 0; }
          });
          this.eyeWait = rand(1, 4);
        }
      }
      for (i = 0; i < this.eyes.length; i += 1) {
        if (this.eyes[i].move) { this.advance(this.eyes[i], dt); }
      }
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.bg, 0, 0, w, h);
    var all = this.live.concat(this.eyes);
    for (i = 0; i < all.length; i += 1) {
      var it = all[i];
      it.part.draw(ctx, it.cel, it.x, it.y, s);
    }
  };

  AfterDark.define('after-dark-frankenscreen', function (el) {
    var sim = new Franken();
    sim.coherency = AfterDark.choice(el, 'coherency', COHERENCY, 'humanoid');
    sim.blemishes = AfterDark.choice(el, 'blemishes', BLEMISHES, 'teenager');
    sim.life = LIFE[AfterDark.choice(el, 'lifespan', LIFESPANS, 'brief')];
    void MUSIC;
    var base = AfterDark.setting(el, 'art') || 'art/franken';
    Promise.all([AfterDark.load(base), AfterDark.data(base)]).then(function (both) {
      sim.art = both[0];
      sim.films = both[1].films;
      sim.ready = true;
    }).catch(function (err) {
      if (window.console) { console.error(err); }
    });
    /* Caps Lock: a new creature, now. */
    window.addEventListener('keydown', function (e) {
      if (e.key === 'CapsLock' || e.keyCode === 20) { sim.forced = true; }
    });
    return sim;
  });

  window.AfterDarkFranken = Franken;
}());
