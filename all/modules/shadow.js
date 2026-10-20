/**
 * shadow.js - Shadow Agents, the weasels in trench coats.
 *
 * SHADOW.AD (After Dark 4.0, 1996). Its description resource:
 *
 *   "These weasels are trained professionals. Please do not put trench coats
 *    on your pets. It will annoy them."
 *   "Agents" determines how many agents are on the screen at once.
 *   Check "Clear Screen First" for a black background.
 *   Background automatically becomes black after 90 minutes for better
 *   screen saving.
 *
 * Its controls are Agents (Solo, Few, Many, Lots, Bunches), Clear Screen
 * First, and Music, which is left out because nothing here makes sound.
 *
 * The art, in all/art/shadow/, is sixteen RLE strips (9000-9015): the agent
 * sneaking, tiptoeing, crawling, running, on a rocket, behind a radar dish,
 * reading a TOP SECRET file, with a dog, with a bunny, lighting a bomb - and
 * for every pose, the huge stippled shadow he throws up the wall behind him.
 *
 * None of those strips is an animation on its own. SHADOW.AD also carries a
 * compound sequence the 4.0 engine plays (TYPE_8100/8102, here scene.json):
 * 243 cels, each a list of [strip, frame, channel, x, y] laid out on one
 * shared stage, and a 976-frame script of cels and offsets. A run of
 * consecutive script frames is one action; its first frame repeats the last
 * frame of whatever leads into it, and the engine lines the two up, which is
 * how a walk loop carries the agent across the screen. That is reproduced
 * below exactly, mirroring for agents that walk right to left.
 *
 * What each agent does is the module's own code, read out of the disassembly:
 * the screen is cut into one lane per agent (1, 2, 3, 4, 5 on a short screen,
 * 1, 3, 5, 7, 10 on one 550 or more tall), each lane ticking at ten frames a
 * second, staggered. A new agent is mostly a walker (sneak, tiptoe, crawl,
 * briefcase, dog, radar, rocket, TOP SECRET; the dog, crawl and file ones only
 * every 2-13 minutes); one in five is a runner who stops to do a gag - the
 * bunny ears, the hat, the camera flash, the bomb, the shadow that runs off
 * without him; one in twenty, now and then, peeks in from the edge or pops up
 * from the bottom. Two agents sometimes walk into each other. The very first
 * agent is the one who peeks in. Caps Lock asks for a gag next, as it did.
 *
 * Filled in: when an agent counts as gone (its whole picture off screen) and
 * the 0-2.5 s pause before a lane gets a new one.
 *
 *   <after-dark-shadow-agents art="art/shadow" agents="few" clear-screen></after-dark-shadow-agents>
 */
(function () {
  'use strict';

  var AGENTS = ['solo', 'few', 'many', 'lots', 'bunches'];
  var TICK = 0.1;                       // the module asks for a frame every 100 ms
  var BLACK_AFTER = 90 * 60;            // seconds

  function rand(n) { return Math.floor(Math.random() * n); }
  /* The module's own odds helper: RandInt(n) == n - 2. */
  function chance(n) { return rand(n) === n - 2; }
  /* Rest period after a rare agent: 2 to 13 minutes. */
  function cooldown(now) { return now + 120 + rand(8) * 96; }

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

  /* ------------------------------------------------------------ agents --- */

  /* What each kind of agent starts on, and whether it has a loop count. */
  var START = {
    0: 51, 1: 4, 2: 17, 3: 51, 4: 88, 5: 878, 6: 892, 7: 907, 8: 29, 9: 920,
    10: 930, 11: 950, 19: 64, 20: 51, 22: 51
  };
  [12, 13, 14, 15, 16, 17, 18, 21, 23, 24, 25].forEach(function (t) { START[t] = 114; });

  function ShadowAgents(el) {
    this.rowsIndex = AGENTS.indexOf(String(AfterDark.setting(el, 'agents') || 'few').toLowerCase());
    if (this.rowsIndex < 0) { this.rowsIndex = 1; }
    this.clear = AfterDark.flag(el, 'clear-screen');
    this.scene = null;
    this.rows = [];
    this.partner = null;
    this.now = 0;
    this.spawned = 0;
    this.cd = { rare: 0, 4: 0, 7: 0, 9: 0 };
    this.counter = 3 + rand(3);
    this.flag13 = false;
    this.force = false;
    var self = this;
    var base = (el.getAttribute('art') || 'art/shadow').replace(/\/$/, '');
    Promise.all([
      AfterDark.load(base),
      fetch(AfterDark.bust(base + '/scene.json')).then(function (r) { return r.json(); })
    ]).then(function (got) {
      self.scene = new Scene(got[0], got[1]);
      self.layout();
    });
    this.onKey = function (e) {
      if (e.key === 'CapsLock') { self.force = true; }
    };
    window.addEventListener('keydown', this.onKey);
  }

  ShadowAgents.prototype.resize = function (w, h) {
    this.w = w;
    this.h = h;
    this.desk = this.clear ? null : AfterDark.desktop(w, h);
    this.layout();
  };

  /* One lane per agent, top to bottom, each with its own 100 ms clock. */
  ShadowAgents.prototype.layout = function () {
    if (!this.scene || !this.w) { return; }
    var n = (this.h >= 550 ? [1, 3, 5, 7, 10] : [1, 2, 3, 4, 5])[this.rowsIndex];
    var tall = this.scene.size[1];
    var laneH = Math.floor((this.h - tall) / n);
    var keep = this.rows;
    this.rows = [];
    for (var i = 0; i < n; i += 1) {
      var row = keep[i] || { agent: null, wait: 0.3 + i * 0.6 };
      row.y = laneH * i + Math.floor(tall / 2) + n - 2;
      row.phase = (TICK / n) * i;
      row.clock = row.clock || 0;
      row.index = i;
      this.rows.push(row);
    }
    if (!this.partner) { this.partner = { agent: null, busy: false }; }
  };

  ShadowAgents.prototype.exists = function (type) {
    return this.rows.some(function (r) { return r.agent && r.agent.type === type; });
  };

  /* The module's spawn dispatcher, case for case. */
  ShadowAgents.prototype.pickType = function () {
    var now = this.now, t, cat;
    if (this.spawned === 0) { return 10; }
    if (chance(20) && now > this.cd.rare) {
      cat = 1;
      this.cd.rare = cooldown(now);
    } else {
      cat = chance(5) ? 0 : 2;
    }
    if (this.force) { cat = 0; this.force = false; }

    if (cat === 1) { return 10 + rand(2); }
    if (cat === 0) {
      t = 12;
      if (chance(10) && !this.flag13) {
        if (!this.exists(13)) { t = 13; }
      } else if (chance(4)) {
        if (!this.partner.busy) { t = 24; this.partner.busy = true; }
      } else if (chance(3)) {
        t = 14;
      } else if (chance(8)) {
        t = [15, 15, 15, 15, 18, 21, 23, 16, 16, 17, 17][rand(11)];
        if (this.exists(t)) { t = 14; }
        if (t === 21 || t === 23) {
          if (this.partner.busy) { t = 14; } else { this.partner.busy = true; }
        }
      }
      return t;
    }
    var r = rand(9);
    if (r < 3 && this.exists([6, 7, 8][r])) { r = 3 + rand(6); }
    t = [6, 7, 8, 1, 2, 3, 5, 4, 9][r];
    if (t === 4 || t === 7 || t === 9) {
      if (now < this.cd[t]) {
        t = 1 + rand(2);
      } else {
        this.cd[t] = cooldown(now);
      }
    }
    if (t === 3 && !this.partner.busy && chance(30)) {
      t = 19;
      this.partner.busy = true;
    }
    return t;
  };

  ShadowAgents.prototype.spawn = function (row) {
    var type = this.pickType();
    this.spawned += 1;
    var a = new Sprite(this.scene);
    a.type = type;
    a.base = START[type];
    a.queue = [];
    a.loops = 0;
    a.seen = false;
    if (type === 4) { a.loops = 3 + rand(3); }
    if (type === 8) { a.loops = 5 + rand(3); }
    if (type >= 12 && type <= 18 || type === 21 || type >= 23) { a.loops = 1 + rand(2); }
    a.play(a.base);
    var dir = (type === 9 || type === 19) ? 0 : rand(2);
    var y = row.y + rand(20) - 10;
    if (type === 11) {
      a.flip = false;
      a.moveTo(rand(Math.floor(this.w * 3 / 4)) + Math.floor(this.w / 8), this.h);
    } else if (type === 10) {
      a.flip = dir === 1;
      a.moveTo(dir ? this.w + 30 : -31, y);
    } else {
      a.flip = dir === 1;
      var b = a.rec(), hw = (b.r - b.l) / 2;
      a.moveTo(dir ? this.w + hw : -hw, y);
    }
    row.agent = a;

    if (type === 19) {
      /* Two of them, walking at each other from opposite sides. */
      var p = new Sprite(this.scene);
      p.type = 'pair';
      p.base = 64;
      p.queue = [];
      p.play(64);
      p.flip = !a.flip;
      var pb = p.rec();
      p.moveTo(a.flip ? -(pb.r - pb.l) / 2 : this.w + (pb.r - pb.l) / 2, y);
      p.row = row;
      p.seen = false;
      this.partner.agent = p;
    }
  };

  /* Show the partner sprite where `a` is, playing `ids` in turn. */
  ShadowAgents.prototype.detach = function (a, ids, type) {
    var p = new Sprite(this.scene);
    p.copyFrom(a);
    p.run = a.run;
    p.i = a.i;
    p.type = type;
    p.queue = ids.slice(1);
    p.base = ids[ids.length - 1];
    p.play(ids[0]);
    p.seen = true;
    p.row = a.row;
    this.partner.agent = p;
    this.partner.busy = true;
  };

  /* What happens when an agent reaches the end of the action it loops on. */
  ShadowAgents.prototype.decide = function (a) {
    var t = a.type;
    switch (t) {
      case 4:
        if (--a.loops === 0) { a.loops = 3 + rand(3); a.base = a.base === 101 ? 88 : 101; }
        break;
      case 8:
        if (--a.loops === 0) { a.loops = 3 + rand(3); a.base = a.base === 41 ? 29 : 41; }
        break;
      case 10:
      case 11:
        a.done = true;
        break;
      case 12:
        if (--a.loops <= 0) {
          a.queue.push(129, chance(10) ? 181 : 143);
          a.loops = 2 + rand(2);
          a.base = 114;
        }
        break;
      case 13:
        if (--a.loops === 0) { a.queue.push(129, 143, [245, 221, 273, 303][rand(4)]); a.base = 114; }
        break;
      case 14:
        if (--a.loops === 0) { a.queue.push(129, 143, rand(2) ? 731 : 697); a.base = 114; }
        break;
      case 15:
        if (--a.loops === 0) { a.queue.push(129, 143, 760, 777); a.base = 777; }
        break;
      case 16:
      case 18:
        if (--a.loops === 0) { a.queue.push(129, t === 18 ? 861 : 788); a.base = 114; }
        break;
      case 17:
        if (--a.loops === 0) {
          if (a.base === 826) { a.queue.unshift(838); } else { a.queue.push(129, 814); }
          a.loops = 5 + rand(5);
          a.base = 826;
        }
        break;
      case 21:
        if (--a.loops === 0) { a.queue.push(129, 181, 333); a.base = 349; }
        break;
      case 23:
        if (--a.loops === 0) { a.queue.push(129, 143); a.base = 349; }
        break;
      case 24:
        if (--a.loops === 0) {
          a.queue.push(129, 143);
          a.base = 416;
          if (rand(4) === 2) {
            if (--this.counter !== 0) {
              a.queue.push(617);
            } else {
              a.base = 560;
              this.counter = 3 + rand(3);
            }
          }
        }
        break;
      case 22:
        a.base = 380;
        break;
    }
  };

  /* Things that happen on a particular frame rather than at a loop's end. */
  ShadowAgents.prototype.cue = function (a) {
    var f = a.frameId();
    var p = this.partner;
    if (a.type === 21 && f === 342) { this.detach(a, [363, 380], 22); }
    if (a.type === 23 && f === 349 && !(p.agent && p.agent.visible)) { this.detach(a, [394, 380], 22); }
    if (a.type === 24 && (f === 438 || f === 657)) { this.detach(a, [536], 26); }
    if (a.type === 26 && f === 596) { a.done = true; }
    if (a.type === 19 && p.agent && p.agent.type === 'pair' && Math.abs(this.cx(a) - this.cx(p.agent)) < 56) {
      /* They bump into each other: one picture of the two of them. */
      p.agent.visible = false;
      a.queue = [114];
      a.play(77);
      a.type = 20;
      a.base = 114;
      a.loops = 1000;
    }
    if (a.type === 20 && f === 80) {
      /* ...and they split, running off in opposite directions. */
      a.type = 12;
      var q = new Sprite(this.scene);
      q.copyFrom(a);
      q.flip = !a.flip;
      q.type = 'runner';
      q.base = 114;
      q.queue = [];
      q.play(114);
      var b = a.box();
      q.moveTo((b.l + b.r) / 2 + (a.flip ? 7 : -7), (b.t + b.b) / 2 + 3);
      q.seen = true;
      q.row = a.row;
      p.agent = q;
    }
  };

  ShadowAgents.prototype.cx = function (a) {
    var b = a.box();
    return (b.l + b.r) / 2;
  };

  /* One 100 ms tick of one agent. */
  ShadowAgents.prototype.tick = function (a) {
    if (!a.advance()) {
      if (a.id === a.base || a.queue.length === 0) { this.decide(a); }
      if (a.done) { return; }
      if (a.type === 26 && a.queue.length === 0) { a.done = true; return; }
      a.play(a.queue.length ? a.queue.shift() : a.base);
    }
    this.cue(a);
    var b = a.box();
    var on = b.r > 0 && b.l < this.w && b.b > 0 && b.t < this.h;
    if (on) { a.seen = true; a.gone = 0; }
    else if (a.seen) { a.done = true; }
    else if ((a.gone = (a.gone || 0) + 1) > 200) { a.done = true; }
  };

  ShadowAgents.prototype.step = function (dt, ctx, w, h) {
    this.now += dt;
    if (this.scene && this.rows.length) {
      var self = this;
      this.rows.forEach(function (row) {
        if (!row.agent) {
          row.wait -= dt;
          if (row.wait <= 0) { self.spawn(row); }
          return;
        }
        row.clock += dt;
        while (row.clock >= TICK && row.agent) {
          row.clock -= TICK;
          self.tick(row.agent);
          if (row.agent.done) {
            if (row.agent.type === 19 || row.agent.type === 20) {
              if (self.partner.agent && self.partner.agent.type === 'pair') { self.partner.agent.done = true; }
            }
            if (row.agent.type === 24 || row.agent.type === 21 || row.agent.type === 23) {
              if (!self.partner.agent) { self.partner.busy = false; }
            }
            row.agent = null;
            row.wait = Math.random() * 2.5;
          }
        }
      });
      var p = this.partner;
      if (p.agent) {
        p.clock = (p.clock || 0) + dt;
        while (p.clock >= TICK && p.agent) {
          p.clock -= TICK;
          if (p.agent.type === 'pair' && !p.agent.visible) { break; }
          this.tick(p.agent);
          if (p.agent.done) { p.agent = null; p.busy = false; }
        }
      }
    }

    if (this.desk && this.now < BLACK_AFTER) {
      ctx.drawImage(this.desk, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
    }
    this.rows.forEach(function (row) { if (row.agent) { row.agent.draw(ctx); } });
    if (this.partner && this.partner.agent) { this.partner.agent.draw(ctx); }
  };

  AfterDark.define('after-dark-shadow-agents', function (el) {
    return new ShadowAgents(el);
  });
}());
