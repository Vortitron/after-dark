/**
 * voyeur.js - Voyeur, on the module's own artwork and its own film.
 *
 * Voyeur.ad, 1995, one of the Totally Twisted modules. Its own description:
 *
 *   "Voyeur. You think Jimmy Stewart had it good in Rear Window? That's kid
 *    stuff. Marvel at the deranged antics of your wacked-out neighbors as
 *    they cavort the night away. Special residents include the hacker, the
 *    suicide guy, the crabby old lady and the Vietnam vet. Plus other
 *    surprises! You'll wish you'd never looked."
 *   Based on a concept by Team Expresso. Art by Duncan Pond. Programming by
 *   Jeff "Trurl" Thomas.
 *
 * The settings are its own, out of TYPE_1000: Pace = Pokey / Mellow / Brisk
 * / Quick / Fast, Order = Random / In Order, Guy = Random / Coming Soon /
 * Twist / Honesty / Big Bang / Wow / Shake Head / Pull Back / Thumbs Up /
 * Point Left / Point Right / Point At Screen, and Music. Guy and Music do
 * nothing here: which of the film's scenes the Guy names are has not been
 * found, and there is no sound.
 *
 * The art: the apartment block (a 396 x 430 facade, 4 windows across), its
 * roof - the domed penthouse, a chimney, a satellite dish, the railing - the
 * fire escape, the moon, three pieces of skyline with their reflections,
 * and the night sky as a gradient strip; and one film (an OFST timeline
 * over OFTB cels; see mboris.js) of 3230 ticks: 111 scenes, each a lit
 * window or two or three - shutters, the glow round the frame, and
 * silhouettes of the neighbours doing what they do - plus people on the
 * fire escape and things in the sky (a saucer, a plane, explosions). The
 * scenes are cut at the ticks the timeline skips; several of them are named
 * in the data segment as starts.
 *
 * Every window scene is drawn at the same window or row of windows; the
 * engine (VoyEngine::ChangeWindow) moves it to another. Here each one goes to
 * a free window on the facade where it fits, a few at a time, and the rest
 * of the windows stay dark. The layout is measured off the capture: the
 * facade's top left at (0, 424) on a 1024 x 768 screen, windows every 99 px
 * across and 86.5 down, the penthouse at (223, 295), the moon at (556, 56),
 * the skyline from (599, 414); everything sits on the bottom of the screen.
 * Inferred: where the fire-escape and sky scenes go (the fire escape scenes
 * are lined up on the drawn fire escape; the sky ones over the skyline),
 * the pace (ticks a second), the stars, and how many windows are lit at once.
 *
 *   <after-dark-voyeur art="art/voyeur" pace="brisk" order="random" guy="random">
 */
(function () {
  'use strict';

  var PACES = ['pokey', 'mellow', 'brisk', 'quick', 'fast'];
  var RATE = [6, 9, 12, 15, 20];
  var ORDERS = ['random', 'in order'];
  var GUYS = ['random', 'coming soon', 'twist', 'honesty', 'big bang', 'wow', 'shake head', 'pull back',
    'thumbs up', 'point left', 'point right', 'point at screen'];
  var MUSIC = ['never', 'once', 'twice', 'four times', 'driveyoucrazy'];

  /* Where things are on a 1024 x 768 screen, from the capture. */
  var FACADE = [0, 424];
  var WIN = { x: -5, y: 422, dx: 99, dy: 86.5, cols: 4, rows: 4 };
  /* The film draws its window scenes at these windows. */
  var FILM_WIN = { x: 240, y: 205, dx: 99, dy: 86.5 };
  var ROOF = [[1500, 7, 60, 370], [1500, 6, 77, 382], [1500, 5, 212, 332], [1500, 4, 223, 295],
    [1500, 8, 0, 404]];
  var ESCAPE_X = 396, ESCAPE_TOP = 404;
  var MOON = [556, 56];
  var SKYLINE = [[2, 0, 414], [1, 153, 466], [3, 267, 475]], SKY_PERIOD = 351, SKY_FROM = 599;
  var SKY_STRIP = 209;
  /* Fire-escape scenes: their ladder is at film (194, 136 + 86.5k). */
  var ESCAPE_SHIFT = [ESCAPE_X - 194, ESCAPE_TOP + 34 - 136];
  var SKY_SHIFT = [450, 40];
  var SLOTS = 5;

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function drawCel(g, art, film, c, x, y, skip) {
    var sp = film.cels[c];
    for (var i = 0; i < sp.length; i += 1) {
      var q = sp[i];
      if (skip && skip(q)) { continue; }
      var seq = art.sequence(q[0]);
      if (!seq) { continue; }
      var f = seq.frames[q[1]];
      if (!f) { continue; }
      var px = Math.round(x + q[4]), py = Math.round(y + q[5]);
      if (!q[3]) {
        g.drawImage(seq.image, f.x, f.y, f.w, f.h, px, py, f.w, f.h);
        continue;
      }
      g.save();
      g.translate(px + (q[3] & 1 ? f.w : 0), py + (q[3] & 2 ? f.h : 0));
      g.scale(q[3] & 1 ? -1 : 1, q[3] & 2 ? -1 : 1);
      g.drawImage(seq.image, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      g.restore();
    }
  }

  function isEscape(q) {
    return q[0] === 1007 && (q[1] === 4 || q[1] === 5);
  }

  /** The film's scenes: runs of ticks between the ones it skips. */
  function scenes(film) {
    var out = [], run = [film.entries[0]];
    for (var i = 1; i <= film.entries.length; i += 1) {
      var e = film.entries[i];
      if (!e || e[0] - film.entries[i - 1][0] > 1) {
        out.push(run);
        run = [];
      }
      if (e) { run.push(e); }
    }
    return out.map(function (run) {
      var wins = {}, escape = false, n;
      run.forEach(function (e) {
        film.cels[e[1]].forEach(function (q) {
          if (q[0] === 1007 && q[1] === 3) {
            var c = Math.round((q[4] + e[2] - FILM_WIN.x) / FILM_WIN.dx);
            var r = Math.round((q[5] + e[3] - FILM_WIN.y) / FILM_WIN.dy);
            wins[c + ',' + r] = [c, r];
          }
          if (isEscape(q)) { escape = true; }
        });
      });
      var list = Object.keys(wins).map(function (k) { return wins[k]; });
      var c0 = Infinity, r0 = Infinity, c1 = -Infinity, r1 = -Infinity;
      list.forEach(function (w) {
        c0 = Math.min(c0, w[0]); r0 = Math.min(r0, w[1]);
        c1 = Math.max(c1, w[0]); r1 = Math.max(r1, w[1]);
      });
      n = run.map(function (e, j) {
        var next = j + 1 < run.length ? run[j + 1][0] : e[0] + 1;
        return [e[1], e[2], e[3], Math.max(1, next - e[0])];
      });
      return { run: n, wins: list, c0: c0, r0: r0, w: c1 - c0 + 1, h: r1 - r0 + 1,
        kind: list.length ? 'window' : escape ? 'escape' : 'sky' };
    });
  }

  function Voyeur() {
    this.rate = RATE[2];
    this.inOrder = false;
    this.ready = false;
  }

  Voyeur.prototype.resize = function (w, h) {
    this.w = w;
    this.h = h;
    this.backdrop = null;
  };

  /** Sky, stars, moon, skyline, and the dark block: drawn once. */
  Voyeur.prototype.paint = function () {
    var w = this.w, h = this.h, oy = h - 768, art = this.art;
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    var g = c.getContext('2d');
    if (!g) { return c; }
    g.imageSmoothingEnabled = false;
    g.fillStyle = 'rgb(0,0,17)';
    g.fillRect(0, 0, w, h);
    var strip = art.sequence(2000), f = strip.frames[0];
    for (var sx = 0; sx < w; sx += f.w) {
      g.drawImage(strip.image, f.x, f.y, f.w, f.h, sx, SKY_STRIP + oy, f.w, f.h);
    }
    g.fillStyle = 'rgb(50,0,203)';
    g.fillRect(0, SKY_STRIP + oy + f.h, w, Math.max(0, h - (SKY_STRIP + oy + f.h)));
    /* Stars, above the horizon. */
    for (var i = 0; i < w * (SKY_STRIP + oy + 200) / 900; i += 1) {
      var v = Math.floor(rand(60, 200));
      g.fillStyle = 'rgb(' + v + ',' + v + ',' + Math.min(255, v + 30) + ')';
      g.fillRect(Math.floor(rand(0, w)), Math.floor(rand(0, SKY_STRIP + oy + 230)), 1, 1);
    }
    var put = function (seq, k, x, y) {
      var s = art.sequence(seq), fr = s && s.frames[k];
      if (fr) { g.drawImage(s.image, fr.x, fr.y, fr.w, fr.h, Math.round(x), Math.round(y), fr.w, fr.h); }
    };
    put(1500, 0, MOON[0], MOON[1] + oy);
    for (var x = SKY_FROM - SKY_PERIOD * Math.ceil(SKY_FROM / SKY_PERIOD); x < w; x += SKY_PERIOD) {
      SKYLINE.forEach(function (p) { put(1500, p[0], x + p[1], p[2] + oy); });
    }
    put(1007, 1, FACADE[0], FACADE[1] + oy);
    ROOF.forEach(function (p) { put(p[0], p[1], p[2], p[3] + oy); });
    /* The fire escape: the top landing, and a ladder and cage a floor, as
       the fire-escape scenes have it. */
    put(1007, 4, ESCAPE_X + 14, ESCAPE_TOP + oy);
    for (var k = 0; k < 5; k += 1) { put(1007, 5, ESCAPE_X, ESCAPE_TOP + 34 + k * WIN.dy + oy); }
    return c;
  };

  /** Start a scene in a slot, at a window where it fits and nothing else is. */
  Voyeur.prototype.start = function (slot) {
    var list = this.scenes, pick = null, self = this;
    for (var tries = 0; tries < 30 && !pick; tries += 1) {
      var i = this.inOrder ? this.cursor : Math.floor(Math.random() * list.length);
      var sc = list[i];
      if (this.inOrder) { this.cursor = (this.cursor + 1) % list.length; }
      if (sc.kind !== 'window') {
        /* One outside scene at a time. */
        if (!this.slots.some(function (s) { return s && s.scene.kind !== 'window'; })) { pick = [sc, 0, 0]; }
        continue;
      }
      var spots = [];
      for (var C = 0; C + sc.w <= WIN.cols; C += 1) {
        for (var R = 0; R + sc.h <= WIN.rows; R += 1) {
          var free = sc.wins.every(function (w) {
            return !self.taken[(C + w[0] - sc.c0) + ',' + (R + w[1] - sc.r0)];
          });
          if (free) { spots.push([C, R]); }
        }
      }
      if (spots.length) {
        var at = spots[Math.floor(Math.random() * spots.length)];
        pick = [sc, at[0], at[1]];
      }
    }
    if (!pick) { return; }
    sc = pick[0];
    var shift;
    if (sc.kind === 'window') {
      shift = [WIN.x + pick[1] * WIN.dx - (FILM_WIN.x + sc.c0 * FILM_WIN.dx),
        WIN.y + pick[2] * WIN.dy - (FILM_WIN.y + sc.r0 * FILM_WIN.dy)];
      sc.wins.forEach(function (w) { self.taken[(pick[1] + w[0] - sc.c0) + ',' + (pick[2] + w[1] - sc.r0)] = slot + 1; });
    } else {
      shift = sc.kind === 'escape' ? ESCAPE_SHIFT : SKY_SHIFT;
    }
    this.slots[slot] = { scene: sc, i: 0, at: 0, shift: shift };
  };

  Voyeur.prototype.free = function (slot) {
    var k;
    for (k in this.taken) { if (this.taken[k] === slot + 1) { delete this.taken[k]; } }
    this.slots[slot] = null;
    this.wait[slot] = rand(0.3, 2);
  };

  Voyeur.prototype.tick = function () {
    for (var s = 0; s < SLOTS; s += 1) {
      var p = this.slots[s];
      if (!p) { continue; }
      p.at += 1;
      if (p.at >= p.scene.run[p.i][3]) {
        p.at = 0;
        p.i += 1;
        if (p.i >= p.scene.run.length) { this.free(s); }
      }
    }
  };

  Voyeur.prototype.step = function (dt, ctx, w, h) {
    if (!this.ready) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      return;
    }
    if (!this.backdrop) {
      this.backdrop = this.paint();
      this.slots = [];
      this.taken = {};
      this.wait = [];
      for (var k = 0; k < SLOTS; k += 1) { this.slots.push(null); this.wait.push(rand(0, 2)); }
      this.clock = 0;
    }
    var s;
    for (s = 0; s < SLOTS; s += 1) {
      if (!this.slots[s]) {
        this.wait[s] -= dt;
        if (this.wait[s] <= 0) { this.start(s); }
      }
    }
    this.clock += dt;
    var n = 0, tick = 1 / this.rate;
    while (this.clock >= tick && n < 5) {
      this.clock -= tick;
      this.tick();
      n += 1;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.backdrop, 0, 0, w, h);
    var oy = h - 768;
    for (s = 0; s < SLOTS; s += 1) {
      var p = this.slots[s];
      if (!p) { continue; }
      var e = p.scene.run[p.i];
      drawCel(ctx, this.art, this.film, e[0], p.shift[0] + e[1], p.shift[1] + e[2] + oy, isEscape);
    }
  };

  AfterDark.define('after-dark-voyeur', function (el) {
    var sim = new Voyeur();
    sim.rate = RATE[AfterDark.choice(el, 'pace', PACES, 'brisk')];
    sim.inOrder = AfterDark.choice(el, 'order', ORDERS, 'random') === 1;
    sim.cursor = 0;
    void GUYS;
    void MUSIC;
    var base = AfterDark.setting(el, 'art') || 'art/voyeur';
    Promise.all([AfterDark.load(base), AfterDark.data(base)]).then(function (both) {
      sim.art = both[0];
      sim.film = both[1].films['1000'];
      sim.scenes = scenes(sim.film);
      sim.ready = true;
    }).catch(function (err) {
      if (window.console) { console.error(err); }
    });
    return sim;
  });

  window.AfterDarkVoyeur = Voyeur;
}());
