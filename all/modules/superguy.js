/**
 * superguy.js - Super Guy, the comic book that draws itself.
 *
 * SUPERGUY.AD (After Dark 4.0, 1996). Its description resource:
 *
 *   "There is a little super hero inside of each of us just waiting to bust
 *    out."
 *   Check "Background sound" if you want to hear the sounds of a school yard.
 *   (Continued next issue)
 *
 * Its one control, Background Sound, is left out: nothing here makes sound.
 *
 * The art, in all/art/superguy/, is 24 RLE strips: Super Guy himself in a
 * few hundred rendered poses (18006-18022), the things he leaves lying about
 * (18020, 18022, 18023), the caption boxes - a plain panel, a thought cloud
 * and a shout (18023) - the comic lettering, 183 glyphs (18500), and a set
 * of flat grey silhouettes (18000-18005) that are his shadow, the shadows of
 * whatever he is wrestling, and five sound-effect stamps (WOK! BOK!, a
 * burst, stars, a whoosh, a speech tail). The grey is palette index 217,
 * the darkest step of the pavement's ramp, and the module ships three
 * palettes (18200-18202: grey, blue, green) that recolour the pavement tile
 * and every shadow together. Each issue steps on to the next, as the code
 * does (it counts 0, 1, 2 round; the capture starts on blue).
 *
 * The staging is all data. The compound sequence (TYPE_8100/8102, here
 * scene.json) is a 3,005-frame script on one stage; the module's code holds
 * 87 actions, each a short queue of its runs, and its data section holds 25
 * issues, each a list of actions. Those were read out of the disassembly
 * and are used as they are: an issue is played action by action, with the
 * caption the code attaches to that action - a random line from the matching
 * one of the 32 caption lists (STRINGLIST 18000-18031) - lettered into a
 * caption box in the module's own font. The bent bars, toilet rolls and other
 * props he leaves behind stay until the next issue, which starts on a fresh
 * pavement with the five sound-effect stamps where the capture shows them.
 *
 * Filled in: which of the three boxes a caption gets (the code's choice was
 * not traced; this is random), where the box sits relative to him, the pauses
 * between actions (the handlers' hold counts, taken as idle loops), turning
 * him round to keep him on screen, and the frame
 * rate (ten a second, as the other 4.0 compound modules).
 *
 *   <after-dark-super-guy art="art/superguy"></after-dark-super-guy>
 */
(function () {
  'use strict';

  var TICK = 0.1;
  var IDLE = 173;                         // standing about
  var SHADE = [89, 89, 89];               // palette index 217 as decoded
  /* Super Guy's own pose strips: a run with none of these is a prop. */
  var BODY = { 18006: 1, 18007: 1, 18008: 1, 18009: 1, 18010: 1, 18011: 1, 18012: 1, 18013: 1,
               18014: 1, 18015: 1, 18016: 1, 18017: 1, 18018: 1, 18019: 1, 18021: 1 };
  /* The sound-effect stamps, and where the capture shows them on 1024x768. */
  var STAMPS = [[18005, 42, 210, 300], [18005, 40, 720, 250], [18005, 43, 510, 380],
                [18005, 44, 320, 510], [18005, 41, 760, 510]];
  /* Caption boxes: 18023 frames, and the cream interior of each. */
  var BOXES = [
    { frame: 12, l: 2, t: 2, r: 332, b: 71, align: 'left' },
    { frame: 13, l: 2, t: 3, r: 345, b: 102, align: 'center' },
    { frame: 14, l: 5, t: 3, r: 359, b: 93, align: 'center' }
  ];

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


  Sprite.prototype.turn = function () {
    var rec = this.rec();
    this.ox = this.flip ? this.ox - rec.l - rec.r : this.ox + rec.l + rec.r;
    this.flip = !this.flip;
  };

  function SuperGuy(el) {
    this.scene = null;
    this.data = null;
    this.guy = null;
    this.props = [];
    this.caption = null;
    this.palette = -1;
    var self = this;
    var base = (el.getAttribute('art') || 'art/superguy').replace(/\/$/, '');
    Promise.all([
      AfterDark.load(base),
      fetch(AfterDark.bust(base + '/scene.json')).then(function (r) { return r.json(); })
    ]).then(function (got) {
      self.art = got[0];
      self.data = got[1];
      self.scene = new Scene(got[0], got[1]);
      [18000, 18001, 18002, 18003, 18004, 18005].forEach(function (id) {
        var s = got[0].sequence(id);
        if (s) { s.original = s.image; }
      });
      self.isProp = {};
      Object.keys(got[1].runs).forEach(function (k) {
        var body = got[1].runs[k].some(function (rec) {
          return got[1].cels[rec[0]].some(function (it) { return BODY[it[0]]; });
        });
        if (!body) { self.isProp[k] = true; }
      });
      if (self.w) { self.issue(); }
    });
  }

  SuperGuy.prototype.resize = function (w, h) {
    this.w = w;
    this.h = h;
    if (this.scene) { this.paint(); }
  };

  /* Recolour the grey strips for palette `p`: the pavement ramp and index 217. */
  SuperGuy.prototype.recolour = function (p) {
    var pals = this.data.palettes, from = pals[0], to = pals[p];
    var self = this;
    [18000, 18001, 18002, 18003, 18004, 18005].forEach(function (id) {
      var s = self.art.sequence(id);
      if (!s || !s.original) { return; }
      var c = document.createElement('canvas');
      c.width = s.original.width;
      c.height = s.original.height;
      var g = c.getContext('2d');
      g.drawImage(s.original, 0, 0);
      var img = g.getImageData(0, 0, c.width, c.height), d = img.data;
      for (var i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) { continue; }
        var r = d[i], gg = d[i + 1], b = d[i + 2];
        if (r === SHADE[0] && gg === SHADE[1] && b === SHADE[2]) {
          d[i] = to[0][0]; d[i + 1] = to[0][1]; d[i + 2] = to[0][2];
        } else if (id === 18000 && Math.abs(r - gg) < 4 && Math.abs(gg - b) < 4 && r > 84 && r < 112) {
          var best = 0, bd = 1e9;
          for (var k = 0; k < from.length; k += 1) {
            var dd = Math.abs(from[k][0] - r) + Math.abs(from[k][1] - gg) + Math.abs(from[k][2] - b);
            if (dd < bd) { bd = dd; best = k; }
          }
          d[i] = to[best][0]; d[i + 1] = to[best][1]; d[i + 2] = to[best][2];
        }
      }
      g.putImageData(img, 0, 0);
      s.image = c;
    });
  };

  /* The pavement for this issue: the tile, and the stamps. */
  SuperGuy.prototype.paint = function () {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(this.w));
    c.height = Math.max(1, Math.round(this.h));
    var g = c.getContext('2d');
    var tile = this.art.sequence(18000), f = tile.frames[0];
    for (var y = 0; y < c.height; y += f.h) {
      for (var x = 0; x < c.width; x += f.w) {
        g.drawImage(tile.image, f.x, f.y, f.w, f.h, x, y, f.w, f.h);
      }
    }
    var sx = this.w / 1024, sy = this.h / 768;
    var self = this;
    STAMPS.forEach(function (st) {
      var s = self.art.sequence(st[0]), fr = s.frames[st[1]];
      g.drawImage(s.image, fr.x, fr.y, fr.w, fr.h,
                  Math.round(st[2] * sx - fr.w / 2), Math.round(st[3] * sy - fr.h / 2), fr.w, fr.h);
    });
    this.ground = c;
  };

  /* A new issue: new colours, a clean pavement, and one of the 25 stories. */
  SuperGuy.prototype.issue = function () {
    /* The module steps through its palettes in turn; the capture opens on blue. */
    var p = this.palette < 0 ? 1 : (this.palette + 1) % 3;
    this.palette = p;
    this.recolour(p);
    this.paint();
    this.props = [];
    this.caption = null;
    this.story = this.data.episodes[rand(this.data.episodes.length)].slice();
    if (!this.guy) {
      this.guy = new Sprite(this.scene);
      this.guy.play(IDLE);
      this.guy.moveTo(this.w * (0.3 + Math.random() * 0.4), this.h * (0.35 + Math.random() * 0.3));
    }
    this.queue = [];
    this.next();
  };

  /* The runs an action queues, from its handler: plain calls in order, the
     variadic ones (after each |) with their arguments the right way round,
     and where the handler rolls dice (R), one of the variadic calls. */
  SuperGuy.prototype.runsFor = function (a) {
    var toks = this.data.actions[a] || [];
    var groups = [[]], random = false;
    toks.forEach(function (t) {
      if (t === -2) { random = true; } else if (t === -1) { groups.push([]); } else { groups[groups.length - 1].push(t); }
    });
    var head = groups[0];
    var rest = groups.slice(1).map(function (g) { return g.slice().reverse(); });
    if (random && rest.length) { rest = [pick(rest)]; }
    var out = head.slice();
    rest.forEach(function (g) { out = out.concat(g); });
    return out;
  };

  SuperGuy.prototype.next = function () {
    var g = this.guy;
    if (!this.story.length) { this.issue(); return; }
    var a = this.story.shift();
    if (a === 0) {
      /* Between panels: the caption goes and he stands about a moment. */
      this.caption = null;
      this.queue = [IDLE, IDLE];
      return;
    }
    /* Face the middle, so what he does stays on the page. */
    var b = g.box(), cx = (b.l + b.r) / 2;
    if ((cx > this.w * 0.62 && !g.flip) || (cx < this.w * 0.38 && g.flip)) { g.turn(); }
    var self = this;
    this.queue = this.runsFor(a).filter(function (id) { return self.scene.where[id]; });
    var cap = this.data.captionOf[a];
    if (cap !== undefined) { this.say(cap); }
    if (a !== 54) { this.queue.push(IDLE); }
    /* The handler's hold count, read here as how long he stands after it. */
    var hold = cap !== undefined ? 4 + (this.data.hold[a] || 3) : 0;
    for (var k = 0; k < hold; k += 1) { this.queue.push(IDLE); }
    if (!this.queue.length) { this.queue = [IDLE]; }
  };

  SuperGuy.prototype.say = function (list) {
    var lines = this.data.captions[list];
    if (!lines || !lines.length) { return; }
    var box = BOXES[pick([0, 0, 1, 2])];
    var b = this.guy.box();
    var s = this.art.sequence(18023), f = s.frames[box.frame];
    var cx = (b.l + b.r) / 2, side = cx > this.w / 2 ? -1 : 1;
    var x = cx + side * 190 - f.w / 2;
    var y = b.t - 150;
    if (y < 10) { y = b.b + 30; }
    x = Math.max(8, Math.min(this.w - f.w - 8, x));
    y = Math.max(8, Math.min(this.h - f.h - 8, y));
    this.caption = { box: box, x: Math.round(x), y: Math.round(y), text: pick(lines) };
  };

  /* Glyph for a character: 18500 frame 0 is the space, in ASCII order. */
  function glyph(ch) {
    var c = ch.charCodeAt(0);
    if (c === 0x2018 || c === 0x91) { return 95; }
    if (c === 0x2019 || c === 0x92) { return 96; }
    if (c >= 32 && c < 127) { return c - 32; }
    return 0;
  }

  SuperGuy.prototype.measure = function (text) {
    var font = this.art.sequence(18500), w = 0;
    for (var i = 0; i < text.length; i += 1) { w += font.frames[glyph(text[i])].w + 1; }
    return w;
  };

  SuperGuy.prototype.wrap = function (text, width) {
    var words = text.split(' '), lines = [], cur = '';
    var self = this;
    words.forEach(function (wd) {
      var t = cur ? cur + ' ' + wd : wd;
      if (cur && self.measure(t) > width) { lines.push(cur); cur = wd; } else { cur = t; }
    });
    if (cur) { lines.push(cur); }
    return lines;
  };

  SuperGuy.prototype.drawCaption = function (ctx) {
    var c = this.caption;
    if (!c) { return; }
    var s = this.art.sequence(18023), f = s.frames[c.box.frame];
    ctx.drawImage(s.image, f.x, f.y, f.w, f.h, c.x, c.y, f.w, f.h);
    var font = this.art.sequence(18500);
    var box = c.box, innerW = box.r - box.l;
    var lines = this.wrap(c.text, box.align === 'left' ? innerW - 40 : innerW - (box.frame === 14 ? 110 : 80));
    var top = box.align === 'left' ? c.y + box.t + (lines.length > 3 ? 2 : 9) : c.y + Math.round((box.t + box.b) / 2 - lines.length * 8);
    var self = this;
    lines.forEach(function (line, n) {
      var x = box.align === 'left' ? c.x + box.l + 16 : c.x + Math.round((box.l + box.r) / 2 - self.measure(line) / 2);
      var y = top + n * 16;
      for (var i = 0; i < line.length; i += 1) {
        var fr = font.frames[glyph(line[i])];
        ctx.drawImage(font.image, fr.x, fr.y, fr.w, fr.h, x, y, fr.w, fr.h);
        x += fr.w + 1;
      }
    });
  };

  SuperGuy.prototype.tick = function () {
    var g = this.guy;
    this.props.forEach(function (p) { if (p.i < p.run.length - 1) { p.i += 1; } });
    if (g.advance()) { return; }
    var gb = g.box();
    if (gb.r < 0 || gb.l > this.w || gb.b < 0 || gb.t > this.h) {
      /* Gone off the page: he flies back in somewhere else. */
      g.run = null;
      g.play(IDLE);
      g.moveTo(this.w * (0.25 + Math.random() * 0.5), this.h * (0.3 + Math.random() * 0.4));
    }
    /* Run over: anything he puts down is left where it fell. */
    while (this.queue.length && this.isProp[this.scene.where[this.queue[0]][0].first]) {
      var p = new Sprite(this.scene);
      p.copyFrom(g);
      p.play(this.queue.shift());
      this.props.push(p);
    }
    if (!this.queue.length) { this.next(); }
    if (this.queue.length) { g.play(this.queue.shift()); }
  };

  SuperGuy.prototype.step = function (dt, ctx, w, h) {
    if (!this.scene || !this.guy) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      return;
    }
    this.acc = (this.acc || 0) + dt;
    while (this.acc >= TICK) {
      this.acc -= TICK;
      this.tick();
    }
    ctx.drawImage(this.ground, 0, 0, w, h);
    this.props.forEach(function (p) { p.draw(ctx); });
    this.guy.draw(ctx);
    this.drawCaption(ctx);
  };

  AfterDark.define('after-dark-super-guy', function (el) {
    return new SuperGuy(el);
  });
}());
