/**
 * toaster-2k.js - Toaster 2K, the 1999 Flying Toasters.
 *
 * Toast2k.ad, from the After Dark 10th Anniversary set. Its description:
 *
 *   "Toaster 2K. The Future of Aeronautic Toaster Evolution.
 *    Space: the final appliance garage."
 *   Director and artist Craig Foster; technical director Scott Garcia,
 *   Midnight Software. Original concept by Jack Eastman.
 *
 * Its control panel is Objects (Flight, Squadron, Air Wing, Swarm), Toasters
 * (Adults, Babies, Random) and Music (Never ... Always). Music only chooses
 * how long the MIDI plays, and there is no sound here, so it is left out.
 *
 * The same module ships twice, as Toast2k.ad and "Toaster 2k.ad". They have
 * the same controls, description and choreography tables; Toast2k.ad is the
 * full build with the scanner sequence (22024-22042) and plays "Flying
 * Toasters.mid", "Toaster 2k.ad" is the cut-down one without the scanner art
 * that plays "Toasters2k.mid". With the sound gone they are the same saver,
 * so this plays Toast2k.ad's art.
 *
 * Nothing here is drawn by eye. The sprites are the module's RLE sequences
 * (all/art/toast2k/22000-22042.png), and how they move is the module's own
 * choreography: TYPE_8100 22000/22001 are cels (a bounding box and up to
 * seven frames, each placed in a 640x480 authoring space) and TYPE_8102 22000
 * is 1709 steps of (cel, dx, dy), numbered so that each unbroken run of ids
 * is one move - a flap cycle, folding the wings into a glide, popping a
 * slice, a boost blur, the scanner. They are in all/art/toast2k/runs.json.
 * A run ends on the pose another run starts with, so those link up into a
 * graph per toaster, and a toaster flies by picking its next move from the
 * runs that start where the last one ended.
 *
 * What is mine, read off captures of the real engine rather than the module:
 *   - the step rate (10 a second, which is the 50 px/s the toasters drift
 *     down and to the left at) and that a step identical to the one before is
 *     not shown twice - with both, the toast slices move at the 100 px/s the
 *     capture shows;
 *   - which moves are picked how often (the plain flap loop mostly; the
 *     scanner and the six-baby formation rarely);
 *   - the mix: adults come in threes, in a row or a column, as in both
 *     captures, among single gadgets, toast and bagels, and the odd baby;
 *     the moon, stars, planets and nebulae drift behind;
 *   - Objects as a count of things in the air, 7 / 12 / 18 / 26 (a baby
 *     formation counts each baby); Squadron gives the 8-10 on screen the
 *     captures show, and they ran on the defaults;
 *   - Babies swaps the adults for babies and the toast for the rattles,
 *     blocks and space-suited toys, which is a guess from the art.
 * The module also carries karaoke lyric strips (22100-22103) and their
 * layout, byte-for-byte the ones in TOASTERS.AD; Toast2k has no Display
 * Karaoke control and neither capture shows them, so they are not used.
 *
 *   <after-dark-toaster-2k art="art/toast2k" objects="squadron" toasters="adults">
 */
(function () {
  'use strict';

  var OBJECTS = ['flight', 'squadron', 'air wing', 'swarm'];
  var COUNTS = [7, 12, 18, 26];
  var TOASTERS = ['adults', 'babies', 'random'];
  var RATE = 10;                       // steps a second

  /* Families of runs (indices into runs.json) that link into one another. */
  var ADULTS = [
    [0, 1, 2, 3, 4, 5, 6, 7],          // yellow-green mech, red fins
    [8, 9, 10, 11, 12],                // yellow mech, blue fins; 11 is the scanner
    [13],                              // yellow toaster with the red antenna ball
    [14, 15, 16, 17],                  // toast pilot, yellow wings
    [18, 19, 20],                      // toast pilot, white wings
    [23],                              // chrome toaster, teal wings
    [24, 25],                          // chrome toaster on legs, yellow wings
    [26],                              // the classic: chrome, feathered wings
    [27, 28, 29, 30],                  // blue robot
    [32, 33, 34, 35, 37],              // green toaster, red wings; 35 drops a slice
    [43, 44, 45]                       // red robot
  ];
  var GADGETS = [[21], [22], [39], [40], [41]];   // wireframe, blip, dryer, mixer, cup
  var FOOD = [[56], [57], [58], [59], [60], [61], [62], [63], [64]];
  var BABIES = [[46, 47, 48, 53, 54], [49, 50, 51, 52]];
  var BABY_THINGS = [[81], [82], [83], [84], [85], [86], [87]];
  /* Behind them: nebulae, the earth, a satellite, a galaxy, star clusters and
     planets for the adults; the moon, the cow jumping over it and stars with
     faces for the babies, as in the captures of each. */
  var SPACE = [[65], [66], [67], [68], [69], [70], [71], [72], [73]];
  var NURSERY_SKY = [[74], [75], [76], [77], [78], [79], [80]];
  var MAX_SKY = 2;
  var DETACHED = [36];                 // the slice 35 drops, flying on by itself

  /* How often a move is picked against the others that could follow. */
  var WEIGHT = { 11: 0.08, 54: 0.3 };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function Toaster2K() {
    this.art = null;
    this.runs = null;
    this.count = COUNTS[1];
    this.babies = false;
    this.actors = [];
    this.w = 0;
    this.h = 0;
    this.clock = 0;
  }

  /* Turn runs.json into drawable runs: the steps shown are all but the last
     (which is only where the next run is anchored), without repeats. */
  Toaster2K.prototype.prepare = function (data) {
    var art = this.art;
    this.runs = data.runs.map(function (r, n) {
      if (!r) { return null; }
      var shown = [], prev = '';
      for (var i = 0; i < r.steps.length - 1; i += 1) {
        var key = JSON.stringify(r.steps[i]);
        if (key === prev) { continue; }
        prev = key;
        shown.push(r.steps[i]);
      }
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      r.steps.forEach(function (s) {
        s[2].forEach(function (l) {
          var f = art.sequence(l[0]).frames[l[1]];
          x0 = Math.min(x0, l[2] + s[0]); y0 = Math.min(y0, l[3] + s[1]);
          x1 = Math.max(x1, l[2] + s[0] + f.w); y1 = Math.max(y1, l[3] + s[1] + f.h);
        });
      });
      return { n: n, start: r.start, end: r.end, sx: r.sx, sy: r.sy, ex: r.ex, ey: r.ey,
               shown: shown, last: r.steps[r.steps.length - 1], box: [x0, y0, x1, y1] };
    });
  };

  Toaster2K.prototype.next = function (actor) {
    var runs = this.runs, cur = runs[actor.run], home = actor.family[0];
    var options = actor.family.filter(function (i) { return runs[i] && runs[i].start === cur.end; });
    if (!options.length) { return null; }
    var total = 0, weights = options.map(function (i) {
      var w = i in WEIGHT ? WEIGHT[i] : (i === home ? 4 : 1);
      total += w;
      return w;
    });
    var r = Math.random() * total;
    for (var k = 0; k < options.length; k += 1) {
      r -= weights[k];
      if (r <= 0) { return options[k]; }
    }
    return options[options.length - 1];
  };

  /* An actor's origin is added to the authoring-space positions of its run. */
  Toaster2K.prototype.actor = function (family, layer) {
    var run = family[0];
    return { family: family, run: run, step: 0, ox: 0, oy: 0, layer: layer === undefined ? 1 : layer };
  };

  /* Put an actor's first pose with its box's top-left at (x, y). */
  Toaster2K.prototype.place = function (a, x, y) {
    var b = this.runs[a.run].box;
    a.ox = x - b[0];
    a.oy = y - b[1];
  };

  /* Somewhere just off the right or top edge, so it drifts in: they head
     two and a half across for one down, so mostly the right. `fromTop`
     false keeps it to the right edge (a column would queue up off the top). */
  Toaster2K.prototype.entry = function (wide, tall, scatter, fromTop) {
    if (scatter) { return [rand(-wide * 0.3, this.w), rand(-tall * 0.3, this.h - tall * 0.5)]; }
    if (fromTop === false || Math.random() < this.h / (this.w * 0.4 + this.h)) {
      return [this.w + rand(0, 30), rand(-tall * 0.4, Math.max(-tall * 0.4, this.h * 0.8 - tall))];
    }
    return [rand(this.w * 0.2, this.w), -tall - rand(0, 30)];
  };

  Toaster2K.prototype.spawn = function (scatter) {
    var self = this, made = [], r = Math.random();
    var sky = this.actors.filter(function (a) { return a.layer === 0; }).length;
    if (this.babies) {
      if (r < 0.55) {
        made.push(this.actor(pick(BABIES), 2));
      } else if (r < 0.8 || sky >= MAX_SKY) {
        made.push(this.actor(pick(BABY_THINGS), 2));
      } else {
        made.push(this.actor(pick(NURSERY_SKY), 0));
      }
    } else if (r < 0.3) {
      /* A flight of three different toasters, in a row or a column. */
      var kinds = ADULTS.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 3);
      var row = Math.random() < 0.5;
      var gap = row ? rand(105, 135) : rand(190, 250);
      var at = this.entry(row ? 3 * gap : 140, row ? 140 : 3 * gap, scatter, row ? undefined : false);
      kinds.forEach(function (fam, i) {
        var a = self.actor(fam, 2);
        self.place(a, at[0] + (row ? i * gap : i * 30 * (Math.random() < 0.5 ? -1 : 1)),
                   at[1] + (row ? rand(-20, 20) : i * gap));
        made.push(a);
      });
    } else if (r < 0.45) {
      made.push(this.actor(pick(ADULTS), 2));
    } else if (r < 0.57) {
      made.push(this.actor(pick(GADGETS), 2));
    } else if (r < 0.62) {
      made.push(this.actor(pick(BABIES), 2));
    } else if (r < 0.85 || sky >= MAX_SKY) {
      made.push(this.actor(pick(FOOD), 2));
    } else {
      made.push(this.actor(pick(SPACE), 0));
    }
    if (made.length === 1) {
      var b = this.runs[made[0].run].box;
      for (var tries = 0; tries < 10; tries += 1) {
        var bw = b[2] - b[0], bh = b[3] - b[1];
        /* The sky drifts the other way, down and to the right. */
        var at1 = made[0].layer > 0 || scatter ? this.entry(bw, bh, scatter)
          : Math.random() < 0.5 ? [rand(-bw, this.w * 0.7), -bh] : [-bw, rand(-bh, this.h * 0.7)];
        this.place(made[0], at1[0], at1[1]);
        if (made[0].layer === 0 || !this.crowded(made)) { break; }
      }
    } else if (this.crowded(made)) {
      return 0;
    }
    made.forEach(function (a) {
      a.step = Math.floor(Math.random() * self.runs[a.run].shown.length);
      self.actors.push(a);
    });
    this.actors.sort(function (p, q) { return p.layer - q.layer; });
    return made.length;
  };

  Toaster2K.prototype.resize = function (w, h) {
    this.scale = Math.min(1, Math.max(0.35, Math.min(w / 1024, h / 768)));
    this.w = w / this.scale;
    this.h = h / this.scale;
    if (!this.runs) { return; }
    this.actors = [];
    for (var n = 0, guard = 0; n < this.count && guard < 200; guard += 1) {
      n += this.spawn(true);
    }
  };

  /* Would any of these land on top of something already flying? */
  Toaster2K.prototype.crowded = function (made) {
    var runs = this.runs;
    function box(a) {
      var b = runs[a.run].box;
      return [a.ox + b[0], a.oy + b[1], a.ox + b[0] + Math.min(140, b[2] - b[0]), a.oy + b[1] + Math.min(130, b[3] - b[1])];
    }
    return made.some(function (m) {
      var p = box(m);
      return this.actors.some(function (o) {
        if (o.layer === 0) { return false; }
        var q = box(o);
        return p[0] < q[2] && q[0] < p[2] && p[1] < q[3] && q[1] < p[3];
      });
    }, this);
  };

  /* Has the actor's current pose left by the left or the bottom edge? */
  Toaster2K.prototype.gone = function (a) {
    var b = this.runs[a.run].box;
    return a.ox + b[2] < -20 || a.oy + b[1] > this.h + 20 || a.ox + b[0] > this.w + 200;
  };

  Toaster2K.prototype.advance = function (a) {
    var run = this.runs[a.run];
    a.step += 1;
    if (a.step < run.shown.length) { return; }
    var self = this;
    /* A layer that leaves at the end becomes an actor of its own. */
    run.last[2].forEach(function (l) {
      var key = l[0] + ':' + l[1];
      DETACHED.forEach(function (d) {
        var dr = self.runs[d];
        if (dr && dr.start === key && key !== run.end) {
          var t = self.actor([d], a.layer);
          t.ox = a.ox + l[2] + run.last[0] - dr.sx;
          t.oy = a.oy + l[3] + run.last[1] - dr.sy;
          t.step = 0;
          self.born.push(t);
        }
      });
    });
    var to = this.next(a);
    if (to === null) { a.dead = true; return; }
    var nr = this.runs[to];
    a.ox += run.ex - nr.sx;
    a.oy += run.ey - nr.sy;
    a.run = to;
    a.step = 0;
  };

  Toaster2K.prototype.tick = function () {
    var self = this;
    this.born = [];
    this.actors.forEach(function (a) { self.advance(a); });
    var live = this.actors.filter(function (a) { return !a.dead && !self.gone(a); });
    var n = 0;
    live.forEach(function (a) {
      var s = self.runs[a.run].shown[a.step];
      n += s ? s[2].length : 1;
    });
    this.actors = live.concat(this.born);
    this.actors.sort(function (p, q) { return p.layer - q.layer; });
    var budget = 2;
    while (n < this.count && budget > 0) {
      n += this.spawn(false);
      budget -= 1;
    }
  };

  Toaster2K.prototype.draw = function (ctx, w, h) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    var dpr = ctx.canvas.width / Math.max(1, w);
    ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, 0, 0);
    ctx.imageSmoothingEnabled = this.scale * dpr < 1;
    for (var i = 0; i < this.actors.length; i += 1) {
      var a = this.actors[i];
      var s = this.runs[a.run].shown[a.step];
      if (!s) { continue; }
      for (var k = 0; k < s[2].length; k += 1) {
        var l = s[2][k], seq = this.art.sequence(l[0]), f = seq.frames[l[1]];
        ctx.drawImage(seq.image, f.x, f.y, f.w, f.h,
                      Math.round(a.ox + l[2] + s[0]), Math.round(a.oy + l[3] + s[1]), f.w, f.h);
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  Toaster2K.prototype.step = function (dt, ctx, w, h) {
    if (!this.runs) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      return;
    }
    this.clock += dt * RATE;
    var ticks = 0;
    while (this.clock >= 1 && ticks < 5) {
      this.clock -= 1;
      this.tick();
      ticks += 1;
    }
    if (this.clock > 1) { this.clock = 0; }
    this.draw(ctx, w, h);
  };

  AfterDark.define('after-dark-toaster-2k', function (el) {
    var sim = new Toaster2K();
    sim.count = COUNTS[AfterDark.choice(el, 'objects', OBJECTS, 'squadron')];
    var who = AfterDark.choice(el, 'toasters', TOASTERS, 'adults');
    sim.babies = who === 1 || (who === 2 && Math.random() < 0.5);
    /* The babies' capture has as many things on screen as the adults' with
       fewer babies than there are adults, as they come in pairs and sixes. */
    if (sim.babies) { sim.count = Math.round(sim.count * 0.75); }
    var base = (AfterDark.setting(el, 'art') || 'art/toast2k').replace(/\/$/, '');
    AfterDark.load(base).then(function (art) {
      sim.art = art;
      return fetch(AfterDark.bust(base + '/runs.json'), { cache: 'no-cache' });
    }).then(function (r) {
      if (!r.ok) { throw new Error('no runs.json in ' + base); }
      return r.json();
    }).then(function (data) {
      sim.prepare(data);
      sim.resize(sim.w * (sim.scale || 1), sim.h * (sim.scale || 1));
    }).catch(function (err) {
      if (window.console) { console.error(err); }
    });
    return sim;
  });

  window.AfterDarkToaster2K = Toaster2K;
}());
