/**
 * mimehunt.js - Mime Hunt, on the module's own artwork and its own films.
 *
 * MIMEHUNT.AD, 1995, one of the Totally Twisted modules. Its own description:
 *
 *   "Mime Hunt. In an effort to bring inner peace and tranquility to
 *    humankind, we offer this psychotherapeutic exercise. Mimes are
 *    universally hated, even by their mothers. So grab your shotgun, or
 *    (better yet) a bazooka, hit CapsLock to go interactive, and start
 *    shootin'!
 *    Mimes: Sets how many mimes will annoy you.
 *    Weapons: Choose your weapon!
 *    Music: Makes the experience even more satisfying.
 *    CapsLock: Take control of the crosshairs -- click the mouse to pull
 *    the trigger!"
 *   Original concept by Tim Sniffen. Art by Matt Small. Programming by
 *   Brian Chen.
 *
 * The settings are its own, out of TYPE_1000: Mimes = One / Few / More /
 * Even More / Lots, Weapon = Shotgun / Bazooka / MimeSlayer / Random,
 * CyberMood = Benevolent / Bored / Postal / Sadistic / Manic (how the
 * computer handles the gun), and Music, which does nothing here.
 *
 * Art: two films (OFST timelines over OFTB cels; see mboris.js).
 *   2000  3252 ticks of one mime performing - built every tick out of a
 *         torso, two feet, arms, two hands, a head and a mouth. It is one
 *         long reel; the module's own debug menu names the routines in it
 *         (Dinner, Driving, Rock, Flower, Tight Rope, Rope Pull, Beg, Run
 *         Scare, Fake Death, Laugh).
 *   1000  the gun: the crosshair, the crosshair going off, shotgun pellets
 *         landing, five ways for a mime to be blown off his feet (his hat
 *         rolling away after him), and two bazooka hits - a fireball, and
 *         the hat coming down where he stood.
 *
 * From the captures (10 ticks a second): mimes on black, one above
 * another down the middle of the screen, each in his own band; a green
 * crosshair drifting about the screen. Benevolent never fires. With Postal
 * and the bazooka it fired once in 45 seconds: the mime went up in the
 * fireball and only his hat was left on the floor. With MimeSlayer he
 * fizzed away in violet and white sparks in under a second (drawn in code
 * here, as it was). No new mimes came in the half minute after. Inferred: each mime
 * plays the reel from his own place in it; how often the other moods fire
 * and how well they aim; a shotgun hit playing one of the five blown-over
 * takes; a new troupe half a minute after the last one is down.
 *
 *   <after-dark-mime-hunt art="art/mimehunt" mimes="one" weapon="shotgun" cybermood="postal">
 */
(function () {
  'use strict';

  var TICK = 0.1;
  var MIMES = ['one', 'few', 'more', 'even more', 'lots'];
  /* One and Few were 1 and 2 in the captures; More, 2; Even More, 3. */
  var TROUPE = [1, 2, 2, 3, 5];
  var WEAPONS = ['shotgun', 'bazooka', 'mimeslayer', 'random'];
  var MOODS = ['benevolent', 'bored', 'postal', 'sadistic', 'manic'];
  /* Seconds between shots, and how much of the time it is aiming at a mime.
     Benevolent never fired in 75 seconds of capture; Postal fired once in
     each of two 45-second ones, and hit; Sadistic sat its crosshair on the
     mimes and never fired; Manic only left pellets on the floor. */
  var FIRE = [[Infinity, 0], [60, 0.3], [25, 0.9], [70, 0.97], [8, 0.1]];
  var MUSIC = ['never', 'once', 'twice', 'thrice', 'four times', 'forever'];

  /* Takes in film 1000: [first tick, end tick]. */
  var CURSOR = [2, 7], FIRING = [7, 16];
  var PELLETS = [[16, 36], [36, 52]];
  var BLOWN = [[52, 73], [73, 99], [99, 130], [130, 155], [155, 184]];
  var BAZOOKA = [[184, 224], [224, 272]];
  var REEL = 3252;

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  /* ---- films ---- */

  function drawCel(g, art, film, c, x, y, fx, fy, dx, dy) {
    var sp = film.cels[c];
    for (var i = 0; i < sp.length; i += 1) {
      var q = sp[i], seq = art.sequence(q[0]);
      if (!seq) { continue; }
      var f = seq.frames[q[1]];
      var px = Math.round(x + q[4] + dx - fx), py = Math.round(y + q[5] + dy - fy);
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

  /** Bottom middle of a cel, in film pixels: where a mime stands. */
  function footing(art, film, c) {
    var l = Infinity, r = -Infinity, b = -Infinity;
    film.cels[c].forEach(function (q) {
      var seq = art.sequence(q[0]);
      if (!seq) { return; }
      var f = seq.frames[q[1]];
      l = Math.min(l, q[4]);
      r = Math.max(r, q[4] + f.w);
      b = Math.max(b, q[5] + f.h);
    });
    return [(l + r) / 2, b];
  }

  /** The entries of a take, each with how many ticks it is held. */
  function take(film, span) {
    var run = film.entries.filter(function (e) { return e[0] >= span[0] && e[0] < span[1]; });
    return run.map(function (e, i) {
      var next = i + 1 < run.length ? run[i + 1][0] : span[1];
      return { cel: e[1], dx: e[2], dy: e[3], ticks: Math.max(1, next - e[0]) };
    });
  }

  /* ---- the hunt ---- */

  function MimeHunt() {
    this.troupe = 1;
    this.weapon = 0;
    this.mood = 1;
    this.ready = false;
    this.user = false;
  }

  MimeHunt.prototype.resize = function (w, h) {
    this.w = w;
    this.h = h;
    if (this.ready) { this.start(); }
  };

  MimeHunt.prototype.start = function () {
    var w = this.w, h = this.h, n = this.troupe;
    this.mimes = [];
    this.remains = [];
    this.effects = [];
    /* Up to three, one above another down the middle; more, in two or
       three columns. Each in his own band; the reel moves him about. */
    var cols = n > 3 ? 2 + (n > 6 ? 1 : 0) : 1, rows = Math.ceil(n / cols), band = h / rows;
    for (var i = 0; i < n; i += 1) {
      var c = i % cols, r = Math.floor(i / cols);
      var feet = Math.min(h - 4, Math.max(130, (r + 1) * band - rand(0, Math.max(0, band - 135))));
      var x = cols === 1 ? w * 0.49 : w * (0.15 + 0.7 * c / (cols - 1));
      this.mimes.push({ x: x + rand(-30, 30), y: feet, t: Math.floor(rand(1, REEL)), hold: 0 });
    }
    if (!this.cross) {
      this.cross = { x: w / 2, y: h / 2, vx: 0, vy: 0, tx: w / 2, ty: h / 2, run: null };
    }
    this.nextShot = this.fire[0] * rand(0.5, 1.5);
    this.clock = 0;
    this.restart = 0;
  };

  /** Where a mime's reel stands at tick t. */
  MimeHunt.prototype.reelAt = function (t) {
    var e = this.reel.entries, lo = 0, hi = e.length - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (e[mid][0] <= t) { lo = mid; } else { hi = mid - 1; }
    }
    return e[lo];
  };

  MimeHunt.prototype.shoot = function (x, y) {
    var cr = this.cross;
    cr.run = take(this.gun, FIRING);
    cr.i = 0;
    cr.at = 0;
    var weapon = this.weapon === 3 ? Math.floor(Math.random() * 3) : this.weapon;
    var hit = null, best = Infinity;
    for (var i = 0; i < this.mimes.length; i += 1) {
      var m = this.mimes[i], e = this.reelAt(m.t);
      var top = m.y - 130, d = Math.abs(x - m.x) + Math.abs(y - (m.y - 65)) / 2;
      if (x > m.x - 40 && x < m.x + 40 && y > top && y < m.y && d < best) { hit = i; best = d; }
      void e;
    }
    if (hit === null) {
      if (weapon !== 1) { this.effects.push({ run: take(this.gun, pick(PELLETS)), x: x, y: y, centre: true }); }
      return;
    }
    var mime = this.mimes.splice(hit, 1)[0];
    if (weapon === 2) {
      /* MimeSlayer: he fizzes away, black to violet, white to sparks. */
      this.effects.push({ melt: this.snapshot(mime), x: mime.x, y: mime.y, left: 10 });
      return;
    }
    var span = weapon === 1 ? pick(BAZOOKA) : pick(BLOWN);
    var run = take(this.gun, span);
    /* Line the take's mime up with where he stood. */
    var first = weapon === 1 ? run[0] : run[0];
    var foot = footing(this.art, this.gun, first.cel);
    var fx = foot[0], fy = foot[1];
    if (weapon === 1) { fx -= 8; }
    var flip = Math.random() < 0.5 && weapon !== 1;
    this.effects.push({ run: run, x: mime.x, y: mime.y, fx: fx, fy: fy, flip: flip, stays: true });
  };

  /** A mime as pixels, for MimeSlayer to dissolve. */
  MimeHunt.prototype.snapshot = function (m) {
    var c = document.createElement('canvas');
    c.width = 240;
    c.height = 200;
    var g = c.getContext('2d'), e = this.reelAt(m.t);
    drawCel(g, this.art, this.reel, e[1], 120, 180, this.rx, this.ry, e[2], e[3]);
    return { canvas: c, pixels: g.getImageData(0, 0, c.width, c.height) };
  };

  MimeHunt.prototype.fizz = function (fx) {
    var src = fx.melt.pixels, out = new ImageData(src.width, src.height);
    var keep = fx.left / 10, d = src.data, o = out.data;
    for (var p = 0; p < d.length; p += 4) {
      if (!d[p + 3] || Math.random() > keep) { continue; }
      var lum = d[p] + d[p + 1] + d[p + 2];
      var k = Math.random();
      if (lum < 180) { o[p] = 70 + 90 * k; o[p + 1] = 50 + 80 * k; o[p + 2] = 220 + 35 * k; } else {
        o[p] = 200 + 55 * k; o[p + 1] = 200 + 55 * k; o[p + 2] = 255;
      }
      o[p + 3] = 255;
    }
    fx.melt.canvas.getContext('2d').putImageData(out, 0, 0);
  };

  MimeHunt.prototype.aim = function (dt) {
    var cr = this.cross, w = this.w, h = this.h;
    if (this.user) {
      cr.x = cr.tx;
      cr.y = cr.ty;
      return;
    }
    /* Drift toward a target, picking a new one now and then; the better a
       shot the mood is, the more often the target is a mime. */
    cr.wait = (cr.wait || 0) - dt;
    if (cr.wait <= 0) {
      cr.wait = rand(1, 4);
      var m = this.mimes.length && Math.random() < this.fire[1] ? pick(this.mimes) : null;
      cr.tx = m ? m.x + rand(-10, 10) : rand(30, w - 30);
      cr.ty = m ? m.y - rand(40, 90) : rand(30, h - 30);
    }
    var ax = (cr.tx - cr.x) * 2 - cr.vx * 1.6, ay = (cr.ty - cr.y) * 2 - cr.vy * 1.6;
    cr.vx += ax * dt;
    cr.vy += ay * dt;
    cr.x += cr.vx * dt;
    cr.y += cr.vy * dt;
    if (this.mimes.length && !cr.run) {
      this.nextShot -= dt;
      if (this.nextShot <= 0) {
        this.nextShot = this.fire[0] * rand(0.5, 1.5);
        this.shoot(cr.x, cr.y);
      }
    }
  };

  MimeHunt.prototype.tick = function () {
    var i;
    for (i = 0; i < this.mimes.length; i += 1) {
      var m = this.mimes[i];
      m.t += 1;
      if (m.t >= REEL) { m.t = 1; }
    }
    var cr = this.cross;
    if (cr.run) {
      cr.at += 1;
      if (cr.at >= cr.run[cr.i].ticks) {
        cr.at = 0;
        cr.i += 1;
        if (cr.i >= cr.run.length) { cr.run = null; }
      }
    }
    for (i = this.effects.length - 1; i >= 0; i -= 1) {
      var fx = this.effects[i];
      if (fx.melt) {
        fx.left -= 1;
        if (fx.left <= 0) { this.effects.splice(i, 1); } else { this.fizz(fx); }
        continue;
      }
      fx.at = (fx.at || 0) + 1;
      fx.i = fx.i || 0;
      if (fx.at >= fx.run[fx.i].ticks) {
        fx.at = 0;
        if (fx.i + 1 < fx.run.length) {
          fx.i += 1;
        } else if (!fx.stays) {
          this.effects.splice(i, 1);
        }
      }
    }
    if (!this.mimes.length) {
      /* All down: after a while, a new troupe. */
      this.restart += TICK;
      if (this.restart > 30) { this.start(); }
    }
  };

  MimeHunt.prototype.drawEffect = function (ctx, e) {
    if (e.melt) {
      ctx.drawImage(e.melt.canvas, Math.round(e.x - 120), Math.round(e.y - 180));
      return;
    }
    var r = e.run[e.i || 0], s;
    if (e.centre) {
      var foot = footing(this.art, this.gun, e.run[0].cel);
      s = e.run[0];
      drawCel(ctx, this.art, this.gun, r.cel, e.x, e.y, foot[0], foot[1] - 6, r.dx, r.dy);
      void s;
      return;
    }
    if (e.flip) {
      ctx.save();
      ctx.translate(Math.round(e.x * 2), 0);
      ctx.scale(-1, 1);
    }
    drawCel(ctx, this.art, this.gun, r.cel, e.x, e.y, e.fx, e.fy, r.dx, r.dy);
    if (e.flip) { ctx.restore(); }
  };

  MimeHunt.prototype.step = function (dt, ctx, w, h) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (!this.ready) { return; }
    if (!this.mimes) { this.start(); }
    this.clock += dt;
    var n = 0;
    while (this.clock >= TICK && n < 5) {
      this.clock -= TICK;
      this.tick();
      n += 1;
    }
    this.aim(dt);
    ctx.imageSmoothingEnabled = false;
    var i;
    for (i = 0; i < this.effects.length; i += 1) {
      if (this.effects[i].stays) { this.drawEffect(ctx, this.effects[i]); }
    }
    for (i = 0; i < this.mimes.length; i += 1) {
      var m = this.mimes[i], e = this.reelAt(m.t);
      drawCel(ctx, this.art, this.reel, e[1], m.x, m.y, this.rx, this.ry, e[2], e[3]);
    }
    for (i = 0; i < this.effects.length; i += 1) {
      if (!this.effects[i].stays) { this.drawEffect(ctx, this.effects[i]); }
    }
    /* The crosshair: still, or going off. */
    var cr = this.cross, run = cr.run, cel = run ? run[cr.i].cel : this.cursor;
    var gun = this.gun;
    var foot = run ? this.fireAt : this.crossAt;
    drawCel(ctx, this.art, gun, cel, cr.x, cr.y, foot[0], foot[1], 0, 0);
  };

  AfterDark.define('after-dark-mime-hunt', function (el) {
    var sim = new MimeHunt();
    sim.troupe = TROUPE[AfterDark.choice(el, 'mimes', MIMES, 'one')];
    sim.weapon = AfterDark.choice(el, 'weapon', WEAPONS, 'shotgun');
    sim.fire = FIRE[AfterDark.choice(el, 'cybermood', MOODS, 'postal')];
    void MUSIC;
    var base = AfterDark.setting(el, 'art') || 'art/mimehunt';
    Promise.all([AfterDark.load(base), AfterDark.data(base)]).then(function (both) {
      sim.art = both[0];
      sim.gun = both[1].films['1000'];
      sim.reel = both[1].films['2000'];
      /* The reel's mime stands with his feet here. */
      var stand = footing(sim.art, sim.reel, sim.reel.entries[0][1]);
      sim.rx = stand[0];
      sim.ry = stand[1];
      sim.cursor = take(sim.gun, CURSOR)[0].cel;
      /* The crosshair's middle: its first frame is 47 x 47. */
      var q = sim.gun.cels[sim.cursor][0];
      sim.crossAt = [q[4] + 23, q[5] + 23];
      q = sim.gun.cels[take(sim.gun, FIRING)[0].cel][0];
      sim.fireAt = [q[4] + 23, q[5] + 23];
      sim.ready = true;
      sim.resize(sim.w || el.clientWidth, sim.h || el.clientHeight);
    }).catch(function (err) {
      if (window.console) { console.error(err); }
    });
    /* Caps Lock: the crosshairs are yours; click to shoot. */
    window.addEventListener('keydown', function (e) {
      if (e.key === 'CapsLock' || e.keyCode === 20) { sim.user = !sim.user; }
    });
    el.addEventListener('mousemove', function (e) {
      var r = el.getBoundingClientRect();
      if (sim.cross) { sim.cross.tx = e.clientX - r.left; sim.cross.ty = e.clientY - r.top; }
    });
    el.addEventListener('mousedown', function (e) {
      if (!sim.user || !sim.cross || !sim.ready) { return; }
      var r = el.getBoundingClientRect();
      sim.shoot(e.clientX - r.left, e.clientY - r.top);
    });
    return sim;
  });

  window.AfterDarkMimeHunt = MimeHunt;
}());
