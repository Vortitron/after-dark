/**
 * mikes.js - Mike's So-called Life, on the module's own artwork and film.
 *
 * Mikes.ad, 1995, one of the Totally Twisted modules. Its own description:
 *
 *   "Mike's So-called Life. Anthropology hits a new high in this nerd
 *    aquarium. Study Mike the lovable loser in his trailer park habitat, and
 *    learn all about his socialization (zero), eating habits, and personal
 *    hygiene. This is truly a lesson in how NOT to seize the day.
 *    Activity Level: Frankly, this control does absolutely nothing."
 *   Art by Laurence Arcadias and Dana Muise. Programming by Bruno
 *   Saskatchewan.
 *
 * Its one setting, out of TYPE_1000, is Activity Level, a slider from 0 to
 * 100 that starts at 50 - and as it says, it does nothing, here too.
 *
 * The art is one film (an OFST timeline over OFTB cels; see mboris.js):
 * 2966 ticks holding his three rooms - the living room, the bathroom and
 * the kitchen, each one cel built out of strips and furniture - and every
 * thing he does in them, built out of a head, a torso, arms and legs, with
 * the TV, the phone, the shower, the trash can and his visitors. The data
 * segment names where 94 of CSpriteMike's states start (the table is in
 * MIKE_STATES below); a state runs to the next one's start, its last entry
 * being the link to whatever follows.
 *
 * What follows what is in the code, which has not been read. Here it is
 * worked out from the film: a state can follow another when it starts with
 * Mike exactly where the other left him. Which room a state is in comes
 * from its props (the bathroom's door frame and shower, the kitchen's
 * trash and counter, the living room's TV), passed along those links to
 * the states that only show Mike. When he walks out of a room he turns up
 * in another. From the capture: the room is a 408 x 199 window on a black
 * screen, about a minute in one room before he moves, and each room is
 * shown somewhere else on the screen; ten ticks a second.
 *
 *   <after-dark-mikes-life art="art/mikes" activity-level="50">
 */
(function () {
  'use strict';

  var TICK = 0.1;
  /* CSpriteMike: state -> start tick, from the data segment. */
  var MIKE_STATES = {
    2: 1249, 3: 1254, 4: 1244, 5: 1950, 6: 1932, 7: 1863, 8: 1880, 9: 1856, 10: 1270, 11: 1299, 12: 1310,
    13: 1292, 14: 1904, 15: 1327, 16: 1229, 17: 1845, 18: 1338, 19: 1647, 20: 1693, 21: 1917, 22: 1237,
    23: 1962, 24: 592, 25: 684, 26: 635, 27: 265, 28: 87, 29: 46, 30: 777, 31: 785, 32: 799, 33: 803,
    34: 732, 35: 760, 36: 1362, 37: 1455, 38: 2903, 39: 2889, 40: 2332, 41: 2308, 42: 2318, 43: 2897,
    44: 2362, 45: 2607, 46: 2407, 47: 2866, 48: 2256, 49: 1589, 50: 2124, 51: 21, 52: 2005, 53: 2794,
    54: 2812, 55: 2751, 56: 2847, 57: 1022, 58: 2947, 59: 2788, 60: 494, 61: 511, 62: 474, 63: 567,
    64: 548, 65: 540, 66: 2032, 67: 2175, 68: 2099, 69: 1791, 70: 1735, 71: 2636, 72: 2498, 73: 912,
    74: 861, 75: 2276, 76: 2282, 77: 179, 78: 190, 79: 230, 80: 1117, 81: 1625, 82: 1121, 83: 1187,
    84: 1126, 85: 1489, 86: 1195, 87: 1144, 88: 1096, 89: 1163, 90: 1206, 91: 1472, 92: 1563, 93: 456,
    94: 1620, 95: 1557
  };
  /* The rooms, each one cel, and the window they are seen through. */
  var ROOMS = { living: 1, bathroom: 5, kitchen: 10 };
  var VIEW = [104, 148, 408, 199];
  /* Props that say which room a state is in. */
  var PROPS = { 1000: 'living', 1005: 'living', 1006: 'bathroom', 1007: 'bathroom', 1008: 'bathroom',
    1009: 'bathroom', 1012: 'bathroom', 1013: 'bathroom', 1015: 'bathroom', 1010: 'kitchen', 1011: 'kitchen' };
  var MIKE = [1001, 1003, 1004, 1008];

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function drawCel(g, art, film, c, x, y, dx, dy) {
    var sp = film.cels[c];
    for (var i = 0; i < sp.length; i += 1) {
      var q = sp[i], seq = art.sequence(q[0]);
      if (!seq) { continue; }
      var f = seq.frames[q[1]];
      var px = Math.round(x + q[4] + dx), py = Math.round(y + q[5] + dy);
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

  /** Where Mike is in an entry: his head, or his towelled self. */
  function where(film, e) {
    if (!e) { return null; }
    var sp = film.cels[e[1]];
    for (var k = 0; k < MIKE.length; k += 1) {
      for (var i = 0; i < sp.length; i += 1) {
        if (sp[i][0] === MIKE[k]) { return [MIKE[k], sp[i][4] + e[2], sp[i][5] + e[3]]; }
      }
    }
    return null;
  }

  function near(a, b) {
    return a && b && a[0] === b[0] && Math.abs(a[1] - b[1]) <= 6 && Math.abs(a[2] - b[2]) <= 6;
  }

  /** Cut the film into Mike's states and work out how they join up. */
  function study(film) {
    var starts = [], k;
    for (k in MIKE_STATES) { if (MIKE_STATES.hasOwnProperty(k)) { starts.push(MIKE_STATES[k]); } }
    starts.push(1, 5, 10);
    starts.sort(function (a, b) { return a - b; });
    var takes = [];
    starts.forEach(function (s, i) {
      if (s === 1 || s === 5 || s === 10) { return; }
      var end = i + 1 < starts.length ? starts[i + 1] : Infinity;
      var run = film.entries.filter(function (e) { return e[0] >= s && e[0] < end; });
      if (run.length < 2) { return; }
      var link = run[run.length - 1];
      run = run.slice(0, -1);
      var room = null;
      run.forEach(function (e) {
        film.cels[e[1]].forEach(function (q) { if (PROPS[q[0]]) { room = room || PROPS[q[0]]; } });
      });
      takes.push({
        start: s,
        run: run.map(function (e, j) {
          var next = j + 1 < run.length ? run[j + 1][0] : link[0];
          return [e[1], e[2], e[3], Math.max(1, next - e[0])];
        }),
        from: where(film, run[0]),
        to: where(film, link),
        room: room,
        next: []
      });
    });
    takes.forEach(function (a) {
      takes.forEach(function (b) {
        if (a !== b && near(a.to, b.from)) { a.next.push(b); }
      });
    });
    /* Rooms pass along the links, both ways, to states that only show Mike. */
    for (var pass = 0; pass < 6; pass += 1) {
      takes.forEach(function (a) {
        a.next.forEach(function (b) {
          if (a.room && !b.room) { b.room = a.room; }
          if (b.room && !a.room) { a.room = b.room; }
        });
      });
    }
    takes.forEach(function (a) { a.room = a.room || 'living'; });
    return takes;
  }

  function MikesLife() {
    this.ready = false;
  }

  MikesLife.prototype.resize = function (w, h) {
    this.w = w;
    this.h = h;
    if (this.ready && this.take) { this.place(); }
  };

  /** Each room is seen somewhere else on the screen. */
  MikesLife.prototype.place = function () {
    this.vx = Math.round(rand(0, Math.max(0, this.w - VIEW[2])));
    this.vy = Math.round(rand(0, Math.max(0, this.h - VIEW[3])));
  };

  MikesLife.prototype.go = function (take) {
    var moved = !this.take || take.room !== this.take.room;
    this.take = take;
    this.i = 0;
    this.at = 0;
    if (moved) {
      this.place();
      this.inRoom = 0;
      this.stay = rand(30, 60);
    }
  };

  MikesLife.prototype.choose = function () {
    var t = this.take, room = t.room, self = this;
    var here = t.next.filter(function (b) { return b.room === room; });
    var away = t.next.filter(function (b) { return b.room !== room; });
    var stay = this.inRoom < this.stay;
    /* Stay a while (the capture: the better part of a minute), then take
       the first way out. */
    if (away.length && (!stay || !here.length)) { return this.go(pick(away)); }
    if (here.length) { return this.go(pick(here)); }
    /* He has walked out: he walks in again, here or in another room. */
    var entries = this.takes.filter(function (b) {
      return (stay ? b.room === room : b.room !== room) && b.from && !self.lead[b.start];
    });
    this.go(pick(entries.length ? entries : this.takes));
  };

  MikesLife.prototype.tick = function () {
    this.inRoom += TICK;
    this.at += 1;
    if (this.at >= this.take.run[this.i][3]) {
      this.at = 0;
      this.i += 1;
      if (this.i >= this.take.run.length) { this.choose(); }
    }
  };

  MikesLife.prototype.step = function (dt, ctx, w, h) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (!this.ready) { return; }
    if (!this.take) {
      this.go(pick(this.takes.filter(function (t) { return t.room === 'living' && t.next.length; })));
      this.clock = 0;
    }
    this.clock += dt;
    var n = 0;
    while (this.clock >= TICK && n < 5) {
      this.clock -= TICK;
      this.tick();
      n += 1;
    }
    var ox = this.vx - VIEW[0], oy = this.vy - VIEW[1];
    var room = this.film.entries.filter(function (e) { return e[0] === ROOMS[this.take.room]; }, this)[0];
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.vx, this.vy, VIEW[2], VIEW[3]);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    drawCel(ctx, this.art, this.film, room[1], ox, oy, 0, 0);
    var r = this.take.run[this.i];
    drawCel(ctx, this.art, this.film, r[0], ox, oy, r[1], r[2]);
    ctx.restore();
  };

  AfterDark.define('after-dark-mikes-life', function (el) {
    var sim = new MikesLife();
    sim.activity = Number(AfterDark.setting(el, 'activity-level') || 50);   // and it does nothing
    var base = AfterDark.setting(el, 'art') || 'art/mikes';
    Promise.all([AfterDark.load(base), AfterDark.data(base)]).then(function (both) {
      sim.art = both[0];
      sim.film = both[1].films['1000'];
      sim.takes = study(sim.film);
      /* States someone else leads into, so not where he walks in. */
      sim.lead = {};
      sim.takes.forEach(function (a) { a.next.forEach(function (b) { sim.lead[b.start] = true; }); });
      sim.ready = true;
    }).catch(function (err) {
      if (window.console) { console.error(err); }
    });
    return sim;
  });

  window.AfterDarkMikesLife = MikesLife;
}());
