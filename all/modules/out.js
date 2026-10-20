/**
 * out.js - Out 'n About, the pavement cafe.
 *
 * OUT.AD (After Dark 4.0, 1996). Its description resource:
 *
 *   "Complaints about the service should be directed to the cafe management,
 *    not to the employees of Berkeley Systems or their families."
 *   "Crowd" controls the amount of activity.
 *
 * Its one control is Crowd (Calm, Lively, Bustling).
 *
 * The art, in all/art/out/, is four RLE strips of people (4000-4003) - a sax
 * player, a guitarist, a bongo player, kids with a ball, a dog, a cat, a lady
 * in a hat, an old man on a skateboard, a skipping girl, a granny with a cane,
 * nuns, a cop, a rollerblader, businessmen, the man who sets out the cafe's
 * chairs and tables and the people who come and sit at them - and three
 * 256x256 pavements (4004-4006), one of which is tiled behind everything.
 *
 * As with Shadow Agents, the strips are only frames. OUT.AD's compound
 * sequence (TYPE_8100/8102, here scene.json) is a 2,698-frame script laid
 * out on one stage, and its runs are the actions: start walking, walk, stop,
 * stand, and one or two things each person does while stopped. The module's
 * data section has a 28-row table of those runs, one row per person
 * (start, walk, other walk, stop, stand, act, act), seventeen of them on the
 * list of passers-by, and the sitting runs for the four cafe customers.
 * Those numbers are used as they are.
 *
 * The behaviour is the module's code, followed where it could be read: a
 * passer-by walks on from the side they face, walks up to twenty more strides
 * once on screen, stops, and for two to five seconds alternates standing
 * about with their own bit of business before starting off again and walking
 * out. Groups come on together and stand together for five seconds, the
 * three musicians for thirty. The waiter brings out chairs and then a table,
 * and the cafe grows; customers walk up, sit, and leave. The frame rate is
 * the capture's ten a second.
 *
 * Filled in by eye from the running original rather than read from code: how
 * many people each Crowd setting keeps about, which groups turn up, where
 * the waiter puts the tables and how often, and how long customers sit. The
 * ball the kids, the dog and the cat chase and the golfer are not staged.
 * Which pavement is used is chosen at random each time.
 *
 *   <after-dark-out-n-about art="art/out" crowd="lively"></after-dark-out-n-about>
 */
(function () {
  'use strict';

  var CROWD = ['calm', 'lively', 'bustling'];
  var PEOPLE = [3, 6, 10];             // per 640x480 of screen
  var TICK = 0.1;

  /* The 28-row table from OUT.AD's data section: start, walk, other walk,
     stop, stand, act, act. */
  var CH = [
    [189, 201, 0, 209, 221, 229, 244], [344, 352, 0, 360, 367, 375, 400],
    [430, 438, 0, 446, 453, 461, 488], [515, 523, 0, 534, 547, 547, 547],
    [657, 664, 0, 675, 688, 688, 688], [769, 776, 0, 787, 797, 797, 797],
    [857, 864, 0, 878, 886, 893, 901], [1026, 1035, 0, 1043, 1052, 1067, 1052],
    [1096, 1103, 0, 1110, 1117, 1124, 1117], [1146, 1154, 1165, 1172, 1179, 1165, 1165],
    [1216, 1223, 0, 1230, 1237, 1237, 1237], [1256, 1265, 0, 1274, 1283, 1293, 1283],
    [1304, 1313, 0, 1322, 1331, 1340, 1331], [1358, 1368, 0, 1379, 1389, 1389, 1389],
    [1472, 1479, 0, 1487, 1493, 1493, 1493], [1500, 1509, 0, 1517, 1493, 1493, 1493],
    [1869, 1876, 0, 1891, 1897, 1897, 1897], [2014, 2023, 0, 2041, 2050, 2050, 2050],
    [2127, 2136, 0, 2154, 2163, 2163, 2163], [2239, 2247, 0, 2262, 2269, 2269, 2269],
    [2341, 2349, 0, 2364, 2371, 2371, 2371], [2441, 2448, 0, 2465, 2472, 2472, 2472],
    [2624, 2624, 0, 2624, 0, 2624, 2624], [1525, 1532, 0, 1540, 1546, 1553, 1546],
    [1565, 1574, 1591, 1603, 1614, 1614, 1614], [1621, 1628, 0, 1642, 1649, 1656, 1649],
    [1665, 1672, 0, 1691, 1698, 1705, 1698], [1753, 1760, 0, 1777, 1784, 1784, 1784]
  ];
  var A = 0, B = 1, C = 2, D = 3, E = 4, F = 5, G = 6;
  /* Passers-by, from the module's list at 0x420778. */
  var WALKERS = [3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 23, 24, 25, 26, 27];
  /* Groups. The musicians, and the module's other short lists of people. */
  var GROUPS = [[0, 1, 2], [19, 20, 25, 26], [3, 4, 10], [11, 12, 13], [6, 27], [15, 14, 14], [25, 26], [23, 23]];
  /* The cafe customers: approach, stop, sit down, sit (two loops), get up. */
  var SIT = {
    17: { walk: 2023, stop: 2041, down: 2060, sit: [2068, 2092], up: [2118, 2014] },
    18: { walk: 2136, stop: 2154, down: 2172, sit: [2180, 2205], up: [2230, 2127] },
    19: { walk: 2247, stop: 2262, down: 2277, sit: [2284, 2308], up: [2334, 2239] },
    20: { walk: 2349, stop: 2364, down: 2379, sit: [2385, 2409], up: [2434, 2341] }
  };
  /* The waiter: in with chairs, put them down, out; in with the table. */
  var WAITER = { chairs: 1914, chairsDown: 1932, chairsProp: 1951, table: 1966, tableDown: 1984, setProp: 2008 };
  var PAVEMENTS = [4004, 4005, 4006];

  function rand(n) { return Math.floor(Math.random() * n); }
  function pick(a) { return a[rand(a.length)]; }

  /* ------------------------------------------------ compound sequences --- */

  function Scene(art, data) {
    var self = this;
    this.art = art;
    this.size = data.size || [284, 183];
    this.where = {};
    this.runs = [];
    Object.keys(data.runs).forEach(function (key) {
      var first = Number(key);
      var run = data.runs[key].map(function (rec) {
        var cel = data.cels[rec[0]];
        var items = [], l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
        cel.forEach(function (it) {
          var seq = art.sequence(it[0]);
          if (!seq) { return; }
          var f = seq.frames[it[1]];
          var x = it[3] + rec[1], y = it[4] + rec[2];
          items.push({ seq: seq, f: f, key: it[0] * 1000 + it[1], x: x, y: y });
          l = Math.min(l, x); t = Math.min(t, y);
          r = Math.max(r, x + f.w); b = Math.max(b, y + f.h);
        });
        return { items: items, l: l, t: t, r: r, b: b };
      });
      run.first = first;
      self.runs.push(run);
      run.forEach(function (rec, i) { self.where[first + i] = [run, i]; });
    });
  }

  /* The point the engine lines two runs up on: the same picture in both. */
  function anchor(a, b) {
    for (var i = 0; i < a.items.length; i += 1) {
      for (var j = 0; j < b.items.length; j += 1) {
        if (a.items[i].key === b.items[j].key) {
          return [a.items[i].x - b.items[j].x, a.items[i].y - b.items[j].y];
        }
      }
    }
    return [a.l - b.l, a.t - b.t];
  }

  function Sprite(scene) {
    this.scene = scene;
    this.flip = false;
    this.ox = 0;
    this.oy = 0;
    this.run = null;
    this.i = 0;
    this.id = 0;
    this.visible = true;
  }

  /** Start playing at script frame `id`, joined on to whatever was showing. */
  Sprite.prototype.play = function (id) {
    var at = this.scene.where[id];
    if (!at) { return false; }
    var run = at[0], i = at[1];
    if (this.run && i > 0) {
      var d = anchor(this.run[this.i], run[i - 1]);
      this.ox += (this.flip ? -1 : 1) * d[0];
      this.oy += d[1];
    }
    this.run = run;
    this.i = i;
    this.id = id;
    return true;
  };

  /** Next frame; false when the run is used up. */
  Sprite.prototype.advance = function () {
    if (this.i + 1 >= this.run.length) { return false; }
    this.i += 1;
    return true;
  };

  Sprite.prototype.frameId = function () { return this.run.first + this.i; };
  Sprite.prototype.rec = function () { return this.run[this.i]; };

  /* Screen box of what is showing. */
  Sprite.prototype.box = function () {
    var rec = this.rec();
    if (this.flip) {
      return { l: this.ox - rec.r, r: this.ox - rec.l, t: this.oy + rec.t, b: this.oy + rec.b };
    }
    return { l: this.ox + rec.l, r: this.ox + rec.r, t: this.oy + rec.t, b: this.oy + rec.b };
  };

  /** Centre what is showing on (x, y) - the engine's MoveTo. */
  Sprite.prototype.moveTo = function (x, y) {
    var rec = this.rec();
    var cx = (rec.l + rec.r) / 2, cy = (rec.t + rec.b) / 2;
    this.ox = x - (this.flip ? -cx : cx);
    this.oy = y - cy;
  };

  Sprite.prototype.copyFrom = function (o) {
    this.flip = o.flip;
    this.ox = o.ox;
    this.oy = o.oy;
  };

  Sprite.prototype.draw = function (ctx) {
    if (!this.visible || !this.run) { return; }
    var items = this.rec().items;
    for (var k = 0; k < items.length; k += 1) {
      var it = items[k], f = it.f;
      var y = Math.round(this.oy + it.y);
      if (!this.flip) {
        ctx.drawImage(it.seq.image, f.x, f.y, f.w, f.h, Math.round(this.ox + it.x), y, f.w, f.h);
      } else {
        ctx.save();
        ctx.translate(Math.round(this.ox - it.x), y);
        ctx.scale(-1, 1);
        ctx.drawImage(it.seq.image, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
        ctx.restore();
      }
    }
  };


  /* Turn round on the spot. */
  Sprite.prototype.turn = function () {
    var rec = this.rec();
    this.ox = this.flip ? this.ox - rec.l - rec.r : this.ox + rec.l + rec.r;
    this.flip = !this.flip;
  };

  /* How far playing `ids` on from here would move the origin, in stage units. */
  Sprite.prototype.predict = function (ids) {
    var where = this.scene.where, cur = this.rec(), dx = 0, dy = 0;
    for (var k = 0; k < ids.length; k += 1) {
      var at = where[ids[k]];
      if (!at) { continue; }
      if (at[1] > 0) {
        var d = anchor(cur, at[0][at[1] - 1]);
        dx += d[0];
        dy += d[1];
      }
      cur = at[0][at[0].length - 1];
    }
    return [dx, dy];
  };

  function OutNAbout(el) {
    this.crowd = AfterDark.choice(el, 'crowd', CROWD, 'lively');
    this.scene = null;
    this.people = [];
    this.props = [];
    this.waiter = null;
    this.clock = 0;
    this.spawnIn = 0.2;
    this.waiterIn = 4 + Math.random() * 6;
    this.formation = rand(GROUPS.length);
    this.pavement = pick(PAVEMENTS);
    var self = this;
    var base = (el.getAttribute('art') || 'art/out').replace(/\/$/, '');
    Promise.all([
      AfterDark.load(base),
      fetch(AfterDark.bust(base + '/scene.json')).then(function (r) { return r.json(); })
    ]).then(function (got) {
      self.art = got[0];
      self.scene = new Scene(got[0], got[1]);
    });
  }

  OutNAbout.prototype.resize = function (w, h) {
    this.w = w;
    this.h = h;
    this.target = Math.max(2, Math.round(PEOPLE[this.crowd] * (w * h) / (640 * 480)));
    this.maxTables = Math.max(1, Math.round((1 + this.crowd) * Math.sqrt((w * h) / (640 * 480))));
  };

  OutNAbout.prototype.person = function (ch, flip, x, y) {
    var p = new Sprite(this.scene);
    p.ch = ch;
    p.row = CH[ch];
    p.flip = flip;
    p.queue = [];
    p.base = p.row[B];
    p.play(p.base);
    var b = p.rec(), hw = (b.r - b.l) / 2;
    p.moveTo(x === undefined ? (flip ? this.w + hw : -hw) : x, y);
    p.phase = 'in';
    p.strides = rand(20);
    p.seen = false;
    return p;
  };

  /* A passer-by, or now and then a group. */
  OutNAbout.prototype.spawn = function () {
    var flip = rand(2) === 1;
    var y = 30 + rand(Math.max(1, this.h - 90));
    var free = this.props.filter(function (t) { return t.table && !t.taken; });
    if (free.length && rand(4) === 0) {
      this.customer(pick(free));
      return;
    }
    if (rand(7) === 0) {
      var g = GROUPS[this.formation];
      this.formation = (this.formation + 1) % GROUPS.length;
      var same = g.length > 3 || g === GROUPS[2] || g === GROUPS[3];
      var who = same ? pick(g) : null;
      var n = g === GROUPS[0] || g === GROUPS[5] ? 3 : 2 + rand(3);
      var strides = rand(20);
      for (var i = 0; i < n; i += 1) {
        var ch = who !== null ? who : g[i % g.length];
        var p = this.person(ch, flip, undefined, y + i * 18 - n * 9);
        p.ox += (flip ? 1 : -1) * (i * 26 + rand(8));
        p.strides = strides;
        p.stay = ch <= 2 ? 30 : 5;
        this.people.push(p);
      }
      return;
    }
    this.people.push(this.person(pick(WALKERS), flip, undefined, y));
  };

  /* A customer walks in from the left to a free table and sits down. */
  OutNAbout.prototype.customer = function (table) {
    var ch = 17 + rand(4);
    var s = SIT[ch];
    var p = this.person(ch, false, undefined, 0);
    p.base = s.walk;
    p.play(s.walk);
    p.oy = table.oy;
    var b = p.rec();
    p.ox = -b.r;
    p.phase = 'to-table';
    p.table = table;
    table.taken = true;
    this.people.push(p);
  };

  OutNAbout.prototype.prop = function (id, from, table) {
    var t = new Sprite(this.scene);
    t.copyFrom(from);
    t.play(id);
    t.i = t.run.length - 1;
    t.table = table;
    t.taken = false;
    this.props.push(t);
    return t;
  };

  /* Where tables may go: clear of the others. */
  OutNAbout.prototype.spot = function () {
    for (var tries = 0; tries < 20; tries += 1) {
      var x = this.w * (0.25 + Math.random() * 0.6);
      var y = 60 + Math.random() * (this.h - 160);
      var ok = this.props.every(function (t) {
        var b = t.box();
        return Math.abs((b.l + b.r) / 2 - x) > 70 || Math.abs((b.t + b.b) / 2 - y) > 60;
      });
      if (ok) { return [x, y]; }
    }
    return null;
  };

  OutNAbout.prototype.sendWaiter = function () {
    var at = this.spot();
    if (!at) { return; }
    var p = new Sprite(this.scene);
    p.ch = 16;
    p.row = CH[16];
    p.flip = false;
    p.queue = [];
    p.base = WAITER.chairs;
    p.play(WAITER.chairs);
    p.moveTo(0, at[1]);
    var b = p.rec();
    p.ox -= b.r;
    p.phase = 'chairs';
    p.goal = at[0];
    p.seen = false;
    this.waiter = p;
  };

  /* Has walking brought the origin, after `ids`, to within half a stride of x? */
  function arrived(p, ids, x, stride) {
    var d = p.predict(ids);
    var ox = p.ox + (p.flip ? -1 : 1) * d[0];
    return Math.abs(ox - x) <= stride / 2 + 1 || (!p.flip && ox > x) || (p.flip && ox < x);
  }

  function stride(p, id) {
    var at = p.scene.where[id];
    if (!at) { return 20; }
    var run = at[0];
    return Math.abs(anchor(run[run.length - 1], run[Math.max(0, at[1] - 1)])[0]) || 20;
  }

  OutNAbout.prototype.waiterTick = function (p) {
    var ended = !p.advance();
    if (p.phase === 'chairs' || p.phase === 'table') {
      var target = p.phase === 'chairs' ? null : p.chairs;
      if (ended) {
        var downId = p.phase === 'chairs' ? WAITER.chairsDown : WAITER.tableDown;
        var walkId = p.phase === 'chairs' ? WAITER.chairs : WAITER.table;
        var goalX = target ? target.ox : p.goal - 300;
        if (arrived(p, [walkId, downId], goalX, stride(p, walkId))) {
          if (target) {
            var d = p.predict([downId]);
            p.ox = target.ox - (p.flip ? -1 : 1) * d[0];
            p.oy = target.oy - d[1];
          }
          p.play(downId);
          p.phase = p.phase === 'chairs' ? 'chairs-down' : 'table-down';
        } else {
          p.play(walkId);
        }
      }
    } else if (p.phase === 'chairs-down' || p.phase === 'table-down') {
      if (ended) {
        if (p.phase === 'chairs-down') {
          p.chairs = this.prop(WAITER.chairsProp, p, false);
        } else {
          var i = this.props.indexOf(p.chairs);
          if (i >= 0) { this.props.splice(i, 1); }
          this.prop(WAITER.setProp, p.chairs, true);
        }
        p.next = p.phase === 'chairs-down' ? 'fetch' : 'gone';
        p.turn();
        p.play(p.row[A]);
        p.phase = 'leaving';
      }
    } else if (p.phase === 'leaving') {
      if (ended) { p.play(p.row[B]); }
      var b = p.box();
      if (b.r < 0 || b.l > this.w) {
        if (p.next === 'fetch') {
          /* Back the way he went, with the table. */
          p.flip = false;
          p.play(WAITER.table);
          p.oy = p.chairs.oy;
          var r = p.rec();
          p.ox = -r.r;
          p.phase = 'table';
        } else {
          this.waiter = null;
        }
      }
    }
  };

  OutNAbout.prototype.personTick = function (p) {
    var ended = !p.advance();
    var b = p.box();
    var on = b.r > 0 && b.l < this.w;
    if (on) { p.seen = true; }

    if (p.phase === 'to-table') {
      var s = SIT[p.ch];
      if (ended) {
        if (arrived(p, [s.walk, s.stop, s.down], p.table.ox, stride(p, s.walk))) {
          var d = p.predict([s.stop, s.down]);
          p.ox = p.table.ox - d[0];
          p.oy = p.table.oy - d[1];
          p.queue = [s.down];
          p.base = pick(s.sit);
          p.play(s.stop);
          p.phase = 'sit';
          p.until = this.clock + 10 + Math.random() * 25;
        } else {
          p.play(s.walk);
        }
      }
      return;
    }
    if (p.phase === 'sit') {
      if (ended) {
        if (p.queue.length) { p.play(p.queue.shift()); return; }
        if (this.clock > p.until) {
          p.queue = SIT[p.ch].up.slice(1);
          p.base = p.row[B];
          p.play(SIT[p.ch].up[0]);
          p.phase = 'out';
          p.table.taken = false;
          p.table = null;
        } else {
          p.base = pick(SIT[p.ch].sit);
          p.play(p.base);
        }
      }
      return;
    }
    if (!ended) { return; }
    if (p.queue.length) { p.play(p.queue.shift()); return; }

    if (p.phase === 'in') {
      if (p.seen && p.strides-- <= 0 && b.l > 0 && b.r < this.w) {
        p.phase = 'idle';
        p.until = this.clock + (p.stay || (2 + Math.random() * 3));
        p.count = 0;
        p.play(p.row[D]);
        return;
      }
      p.play(p.row[B]);
      return;
    }
    if (p.phase === 'idle') {
      if (this.clock > p.until) {
        p.phase = 'out';
        p.queue = [p.row[B]];
        p.play(p.row[A]);
        return;
      }
      var ch = p.ch, row = p.row;
      p.count += 1;
      if (p.count % 2) {
        if (ch === 9 || ch === 24) {
          p.play(row[C]);
        } else {
          for (var k = 3 + rand(4); k > 0; k -= 1) { p.queue.push(row[E]); }
          p.play(row[E]);
        }
      } else if (ch === 6) {
        p.play(rand(2) ? row[F] : row[G]);
      } else if (ch <= 2) {
        p.play(p.count % 4 ? row[F] : row[G]);
      } else if (ch === 7 || ch === 23 || ch === 25 || ch === 26 || ch === 8 || ch === 11 || ch === 12) {
        p.play(row[F]);
      } else {
        p.play(row[E]);
      }
      return;
    }
    if (p.phase === 'out') {
      p.play(p.row[B]);
      if (b.r < -20 || b.l > this.w + 20) { p.done = true; }
    }
  };

  OutNAbout.prototype.step = function (dt, ctx, w, h) {
    if (this.scene) {
      this.clock += dt;
      this.acc = (this.acc || 0) + dt;
      while (this.acc >= TICK) {
        this.acc -= TICK;
        var self = this;
        this.people.forEach(function (p) { self.personTick(p); });
        this.people = this.people.filter(function (p) {
          if (p.phase === 'out' && !p.done) {
            var b = p.box();
            if (b.r < -20 || b.l > w + 20) { p.done = true; }
          }
          if (p.phase === 'in' && !p.seen && (p.ttl = (p.ttl || 0) + 1) > 600) { p.done = true; }
          return !p.done;
        });
        if (this.waiter) { this.waiterTick(this.waiter); }
      }
      this.spawnIn -= dt;
      if (this.spawnIn <= 0 && this.people.length < this.target) {
        this.spawn();
        this.spawnIn = 0.5 + Math.random() * 2;
      }
      this.waiterIn -= dt;
      if (this.waiterIn <= 0 && !this.waiter) {
        if (this.props.filter(function (t) { return t.table; }).length < this.maxTables) { this.sendWaiter(); }
        this.waiterIn = 20 + Math.random() * 40;
      }
    }

    var bg = this.art && this.art.sequence(this.pavement);
    if (bg) {
      var f = bg.frames[0];
      for (var y = 0; y < h; y += f.h) {
        for (var x = 0; x < w; x += f.w) {
          ctx.drawImage(bg.image, f.x, f.y, f.w, f.h, x, y, f.w, f.h);
        }
      }
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
    }
    if (!this.scene) { return; }
    /* Back to front by where their feet are. */
    var all = this.props.concat(this.people);
    if (this.waiter) { all.push(this.waiter); }
    all.sort(function (a, b) { return a.box().b - b.box().b; });
    all.forEach(function (s) { s.draw(ctx); });
  };

  AfterDark.define('after-dark-out-n-about', function (el) {
    return new OutNAbout(el);
  });
}());
