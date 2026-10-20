/**
 * guernsey.js - Guernsey Madness, on the module's own artwork and code.
 *
 * GUERNSEY.AD, from After Dark 4.0. Its own description:
 *
 *   "Guernsey Madness. It is a warm August evening and the sun starts to dip
 *    below a flat horizon. A warm wind travels across the plains and stirs a
 *    gentle rhythm from the prairie grass. You step out from behind the grange
 *    hall with a large mug of cider in hand. Leaning against the porch railing
 *    you take a sip and watch the colors of the herd in the twilight.
 *    'Flavor' determines the color of the cows. 'Tutti-Frutti' shows a random
 *    display of them."
 *
 * The settings are its own, out of TYPE_1000: Flavor = Vanilla / Chocolate /
 * Strawberry / Blueberry / Grape / Banana / Lemon-Lime / Rainbow Splash /
 * Bubble Gum / Cinnamon / Mint / Tutti-Frutti (the default), and Music, which
 * does nothing here because there is no sound.
 *
 * What it really is, checked against a capture of the module running
 * (tools/adrun.sh, 1024x768, Tutti-Frutti): a kaleidoscope of cows. Four
 * impressionistic cows, mirrored left/right and up/down about the middle of
 * the screen, walk in towards the centre and through it; every eight seconds
 * another mirrored set starts; the colour of the whole herd fades from one
 * flavour to the next every five to ten seconds.
 *
 * Everything below is read out of the module, nothing is invented:
 *
 * - The cows are a CompoundSequence (TYPE_8100/8102 24000, exported to
 *   art/guernsey/compound.json): side-on, front and rear views fading up out
 *   of a speck, walks west / south-west / north-west, grazing, and the same
 *   walks fading away. Each of the ten strips is a cow *part*; a picture is
 *   two of them laid together on the stage. The engine half here is the
 *   CompoundSprite of modules/toasters-40.js (ADXPL510.DLL's), cut down to
 *   what Guernsey calls, plus SetDrawOpcode: bit 0 mirrors a cow left/right
 *   and bit 1 turns it upside down, movement included. That is how the
 *   module makes its kaleidoscope out of one walking cow.
 * - The module half is a transcription of CowModule (DoDrawFrame's state
 *   machine, NextQuadType's shuffle bag of eight patterns, ComputeCowCount,
 *   ChooseANewPalette, DoPaletteFade) and Guernsey (StartGuernsey's 35 ways
 *   to start a cow, PlayGuernsey ten times a second, QueNextWest / Eat / NW /
 *   SW, KeepGrazingH/V, IsGuernseyOff). Names in comments are its exports.
 * - The sprites decode grey because they *are* grey: every pixel is one of
 *   the 29 entries of PAL 24000. Flavor picks one of the other PAL resources
 *   (Chocolate is 24007, Cinnamon the yellow-to-red 24001, ...) and the
 *   module repaints the art with it entry by entry (ColorizeCows), fading
 *   over five steps half a second apart.
 *
 * Not the original: no music or moos, and Caps Lock does not annoy the cows
 * (AnnoyCow). Random numbers are Math.random where the module used RandInt.
 * The capture only showed the opening kaleidoscope patterns; the grazing herd
 * and the parade along the top and bottom edges that follow them are from the
 * code alone.
 *
 *   <after-dark-guernsey art="art/guernsey" flavor="tutti-frutti"></after-dark-guernsey>
 */
(function () {
  'use strict';

  var FLAVORS = ['vanilla', 'chocolate', 'strawberry', 'blueberry', 'grape',
                 'banana', 'lemon-lime', 'rainbow splash', 'bubble gum',
                 'cinnamon', 'mint', 'tutti-frutti'];
  var TUTTI = 11;
  /* ChooseANewPalette's switch: flavour -> PAL 24000 + n. */
  var FLAVOR_PAL = [0, 7, 8, 10, 6, 9, 4, 5, 2, 1, 3];
  var SHADES = 29;
  var TICK = 100;                 // PlayGuernsey: one cow frame per 100 ms

  function rnd(n) { return n > 0 ? Math.floor(Math.random() * n) : 0; }

  /* ------------------------------------------------- CompoundSequence */

  function CSeq(data, art) {
    this.f = data.frames;
    this.cels = data.cels;
    this.art = art;
  }
  CSeq.prototype.valid = function (t) { return t > 0 && t < this.f.length && !!this.f[t]; };
  CSeq.prototype.cx = function (t) { var f = this.f[t]; return (f[0] + f[2]) >> 1; };
  CSeq.prototype.cy = function (t) { var f = this.f[t]; return (f[1] + f[3]) >> 1; };
  CSeq.prototype.rect = function (t) { return this.f[t].slice(0, 4); };
  /* The rect a whole labelled sequence covers (CompoundSequence +0x70). */
  CSeq.prototype.seqRect = function (s) {
    var r = this.rect(s);
    for (var t = s + 1; this.valid(t); t += 1) {
      var f = this.f[t];
      r = [Math.min(r[0], f[0]), Math.min(r[1], f[1]), Math.max(r[2], f[2]), Math.max(r[3], f[3])];
    }
    return r;
  };

  /* ------------------------------------------------- CompoundSprite */

  /* The subset of modules/toasters-40.js's port of ADXPL510's CompoundSprite
     that Guernsey uses, with the draw opcode's mirroring added: sx/sy turn
     the stage deltas round as well as the picture. */
  function Sprite(seq) {
    this.s = seq;
    this.frame = 0; this.cx = 0; this.cy = 0; this.seq = 0;
    this.loops = 0; this.queued = -1; this.done = 1; this.just = 0;
    this.q = []; this.qi = -1;
    this.rect = [-500, -500, -500, -500]; this.vis = false;
    this.op = 0; this.sx = 1; this.sy = 1;
  }
  var SP = Sprite.prototype;
  SP.setOpcode = function (op) { this.op = op; this.sx = op & 1 ? -1 : 1; this.sy = op & 2 ? -1 : 1; };
  SP.upd = function () {
    if (!this.s.valid(this.frame)) { this.vis = false; return; }
    var f = this.s.f[this.frame], w = f[2] - f[0], h = f[3] - f[1];
    var l = this.cx - (w >> 1), t = this.cy - (h >> 1);
    this.rect = [l, t, l + w, t + h];
    this.vis = true;
  };
  SP.qcount = function () { return this.qi < 0 ? 0 : this.q.length - this.qi; };
  SP.entry = function (i) { return this.q[this.qi + i]; };
  SP.pop = function () {
    var v = this.q[this.qi];
    this.qi += 1;
    if (this.qi >= this.q.length) { this.qi = -1; this.q = []; }
    return v;
  };
  SP.clearQ = function () { this.qi = -1; this.q = []; };
  SP.addQ = function (s) { if (this.qi < 0) { this.q = []; this.qi = 0; } this.q.push(s); };
  SP.addQs = function (list) { for (var i = 0; i < list.length; i += 1) { this.addQ(list[i]); } };
  SP.link = function (s) {
    if (s === -1) { s = this.seq; }
    if (!this.s.valid(s)) { return 0; }
    return this.s.valid(s - 1) ? s - 1 : s;
  };
  SP.first = function (s) { if (s === -1) { s = this.seq; } return this.s.valid(s) ? s : 0; };
  SP.last = function (s) {
    if (s === -1) { s = this.seq; }
    if (!this.s.valid(s)) { return 0; }
    while (this.s.valid(s + 1)) { s += 1; }
    return s;
  };
  SP.moveRel = function (f) {
    if (this.s.valid(this.frame) && this.s.valid(f)) {
      this.cx += this.sx * (this.s.cx(f) - this.s.cx(this.frame));
      this.cy += this.sy * (this.s.cy(f) - this.s.cy(this.frame));
    }
    this.frame = f;
    this.upd();
  };
  /* NewCenterCommonArt: keep the first cel the two frames share still. */
  SP.moveCommon = function (f) {
    if (this.s.valid(this.frame) && this.s.valid(f)) {
      var a = this.s.f[this.frame], b = this.s.f[f], i, j, done = false;
      for (i = 4; i < a.length && !done; i += 1) {
        for (j = 4; j < b.length; j += 1) {
          if (a[i][0] === b[j][0]) {
            this.cx += this.sx * ((a[i][3] - this.s.cx(this.frame)) + (this.s.cx(f) - b[j][3]));
            this.cy += this.sy * ((a[i][4] - this.s.cy(this.frame)) + (this.s.cy(f) - b[j][4]));
            done = true;
            break;
          }
        }
      }
    }
    this.frame = f;
    this.upd();
  };
  SP.nextSub = function (s) {
    if (this.frame !== 0) { this.moveCommon(this.link(s)); }
    this.moveRel(this.first(s));
    this.seq = s;
    this.just = 1;
    this.queued = -1;
  };
  SP.nextSequence = function (s) {
    this.nextSub(s);
    this.loops = 0;
    this.clearQ();
    this.done = 0;
  };
  SP.nextSequences = function (list) {
    this.nextSequence(list[0]);
    for (var i = 1; i < list.length; i += 1) { this.addQ(list[i]); }
  };
  SP.setCenter = function (x, y) { this.cx = x; this.cy = y; this.upd(); };
  SP.play = function () {
    this.done = 0;
    if (this.queued !== -1) { this.nextSub(this.queued); }
    var first = this.first(-1), last = this.last(-1);
    if (this.just) {
      this.just = 0;
    } else if (last > this.frame && first <= this.frame) {
      this.moveRel(this.frame + 1);
    } else {
      this.upd();
    }
    if (last > this.frame && first <= this.frame) { return; }
    if (this.loops > 0) {
      if (this.loops !== 0x7fff) { this.loops -= 1; }
      this.queued = this.seq;
    } else if (this.qcount() > 0) {
      this.queued = this.pop();
    } else {
      this.done = 1;
    }
  };
  SP.save = function () { return [this.frame, this.seq, this.cx, this.cy, this.rect, this.vis]; };
  SP.restore = function (p) {
    this.frame = p[0]; this.seq = p[1]; this.cx = p[2]; this.cy = p[3];
    this.rect = p[4]; this.vis = p[5];
    this.upd();
  };
  SP.moveToEnd = function () { this.moveRel(this.last(-1)); };
  SP.moveIntoNext = function (s) {
    if (this.frame !== 0) { this.moveToEnd(); this.moveCommon(this.link(s)); }
    this.moveRel(this.first(s));
    this.seq = s;
    this.upd();
  };
  /* PredictEndpoint(s): where the centre ends up after the queue and s. */
  SP.predict = function (s) {
    var q = this.qcount(), loops = this.loops, p = this.save(), i;
    if (this.queued !== -1) { this.moveIntoNext(this.queued); }
    while (loops > 0 && loops !== 0x7fff) { this.moveIntoNext(this.seq); loops -= 1; }
    for (i = 0; i < q; i += 1) { this.moveIntoNext(this.entry(i)); }
    this.moveIntoNext(s);
    var r = [this.cx, this.cy];
    this.restore(p);
    return r;
  };
  SP.draw = function (ctx, sheets) {
    if (!this.vis || !this.s.valid(this.frame)) { return; }
    var f = this.s.f[this.frame];
    var ox = f[0] + ((f[2] - f[0]) >> 1), oy = f[1] + ((f[3] - f[1]) >> 1);
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.scale(this.sx, this.sy);
    for (var i = 4; i < f.length; i += 1) {
      var it = f[i], c = this.s.cels[it[0]], seq = this.s.art.sequence(c[0]);
      if (!seq) { continue; }
      var fr = seq.frames[c[1]], img = sheets[c[0]] || seq.image;
      var x = it[3] - ox, y = it[4] - oy;
      if (!it[2]) {
        ctx.drawImage(img, fr.x, fr.y, fr.w, fr.h, x, y, fr.w, fr.h);
      } else {
        ctx.save();
        ctx.translate(x + (it[2] & 1 ? fr.w : 0), y + (it[2] & 2 ? fr.h : 0));
        ctx.scale(it[2] & 1 ? -1 : 1, it[2] & 2 ? -1 : 1);
        ctx.drawImage(img, fr.x, fr.y, fr.w, fr.h, 0, 0, fr.w, fr.h);
        ctx.restore();
      }
    }
    ctx.restore();
  };

  /* ------------------------------------------------- Guernsey (one cow) */

  function Cow(herd) {
    this.herd = herd;
    this.sp = new Sprite(herd.seq);
    var sp = this.sp, seq = herd.seq;
    // IGuernsey
    this.a4 = herd.stage[1];            // stage height
    this.a8 = herd.stage[0];            // stage width
    sp.nextSequence(0xd);
    sp.setOpcode(1);
    sp.setCenter(0, 0);
    this.b0 = sp.predict(0)[0];         // one west walk, mirrored
    sp.nextSequence(0x4a);
    sp.setCenter(0, 0);
    this.b4 = sp.predict(0)[0];
    sp.nextSequence(0x87);
    sp.setCenter(0, 0);
    this.b8 = sp.predict(0)[0];
    sp.setOpcode(0);
    sp.setCenter(-500, -500);
    sp.vis = false;
    sp.done = 1;
    this.active = 0;                    // c4
    this.played = 1;                    // c6
    this.kind = -1;                     // 98
    this.east = 0;                      // a0
    this.lastFrame = 0;                 // bc
    this.eats = 0;                      // ac
    this.next = 0;                      // c0
    this.halfW14 = (seq.rect(0xe)[2] - seq.rect(0xe)[0]) >> 1;
  }
  var CP = Cow.prototype;

  /* IsGuernseyOff */
  CP.isOff = function () {
    if (!this.played) { return false; }
    var off = false, W = this.herd.W;
    if (this.east === 0) { if (this.sp.rect[2] < 0) { off = true; } }
    else if (this.sp.rect[0] > W) { off = true; }
    if (this.sp.done && this.lastFrame === 0) { off = true; }
    return off;
  };

  /* KeepGrazingH: room for another walk before the edge. */
  CP.grazeH = function () {
    if (this.east === 0) { return this.sp.cx - this.b0 - this.a8 >= 0; }
    return this.sp.cx + this.b0 + this.a8 <= this.herd.W;
  };
  /* KeepGrazingV - the module measures with the walks' x endpoints. */
  CP.grazeV = function (up) {
    if (up) { return this.sp.cy - this.b8 - this.a4 >= 0; }
    return this.sp.cy + this.b4 + this.a4 <= this.herd.H;
  };

  CP.queNextWest = function () {
    if (this.grazeH()) { this.sp.nextSequences([0xd, 0xd]); return; }
    this.sp.addQs([0x25, 0]);
    this.lastFrame = 0;
  };
  CP.queNextEat = function () {
    var sp = this.sp;
    this.eats -= 1;
    if (this.eats > 0) { sp.nextSequences([0xfa, 0xfa]); return; }
    if (this.grazeH()) {
      sp.nextSequences([0x112, 0x172, 0xd, 0xbb, 0xe2, 0xfa, 0xfa]);
      this.eats = rnd(3) + 1;
      return;
    }
    sp.nextSequences([0xfa, 0x112, 0x12a, 0x142, 0x15a, 0x172, 0x25, 0]);
    this.lastFrame = 0;
  };
  CP.queNextNW = function () {
    if (this.grazeV(1)) { this.sp.nextSequences([0x87, 0x87]); return; }
    this.sp.addQs([0x87, 0x9f, 0]);
    this.lastFrame = 0;
  };
  CP.queNextSW = function () {
    if (this.grazeV(0)) { this.sp.nextSequences([0x4a, 0x4a]); return; }
    this.sp.addQs([0x4a, 0x62, 0]);
    this.lastFrame = 0;
  };

  /* PlayGuernsey */
  CP.play = function (now) {
    if (now <= this.next) { return; }
    this.played = 1;
    if (this.lastFrame !== 0 && this.sp.frame === this.lastFrame) {
      switch (this.kind) {
        case 1: this.queNextWest(); break;
        case 2: this.queNextEat(); break;
        case 3: this.queNextNW(); break;
        case 4: this.queNextSW(); break;
        default: break;
      }
    }
    this.sp.play();
    this.next = now + TICK;
  };

  /* StartGuernsey(now, index, type, param, pt) - `seed` is the time the
     module passes, which it also uses as a coin (seed % 3, seed & 1). */
  CP.start = function (seed, type, param, pt) {
    var sp = this.sp, herd = this.herd, W = herd.W, H = herd.H, seq = herd.seq;
    var di = this.halfW14, x, y, e, r1, r2, r, si;
    this.active = 1; this.played = 0;
    this.next = 0;
    this.kind = -1;
    var band = H - this.a4 - 8;
    this.lastFrame = 0;
    sp.setOpcode(0);
    seed = Math.floor(seed);

    if (type === 0) {                                   // a cow wanders in
      this.kind = 2;
      if (rnd(4) === 3) { this.kind = rnd(5); }
      y = (rnd(band >> 5) << 5) + ((H - band) >> 1);
      switch (this.kind) {
        case 1:
          sp.nextSequences([4, 0xd]);
          this.lastFrame = sp.last(0xd);
          this.east = rnd(2);
          if (this.east === 0) { x = W; } else { sp.setOpcode(1); x = 0; }
          sp.setCenter(x, y);
          break;
        case 2:
          r = rnd(3);
          if (r === 0) { sp.nextSequences([4]); }
          else if (r === 1) { sp.nextSequences([0x7e, 0x1c4]); }
          else { sp.nextSequences([0x41, 0x18a]); }
          sp.addQs([0xbb, 0xca, 0xe2, 0xfa, 0xfa]);
          this.lastFrame = sp.last(0xfa);
          this.eats = rnd(3) + 1;
          this.east = rnd(2);
          if (this.east === 0) { x = W; } else { sp.setOpcode(1); x = 0; }
          sp.setCenter(x, y);
          break;
        case 3:
          sp.nextSequences([0x7e, 0x87]);
          this.lastFrame = sp.last(0x87);
          this.east = rnd(2);
          y = H - rnd(this.a4 >> 1);
          x = rnd(this.a8 >> 1) + (this.a8 >> 1);
          if (this.east === 0) { x = W - x; } else { sp.setOpcode(1); }
          sp.setCenter(x, y);
          break;
        case 4:
          sp.nextSequences([0x41, 0x4a]);
          this.lastFrame = sp.last(0x4a);
          this.east = rnd(2);
          y = rnd(this.a4 >> 1);
          x = rnd(this.a8 >> 1) + (this.a8 >> 1);
          if (this.east === 0) { x = W - x; } else { sp.setOpcode(1); }
          sp.setCenter(x, y);
          break;
        default: break;
      }
      return;
    }

    if (type === 8 || type === 9) {                     // the parade
      sp.nextSequence(0xd);
      var rr = seq.seqRect(0xd);
      si = (rr[3] - rr[1]) >> 1;
      if (type === 8) {
        sp.setCenter(W + di, si); sp.setOpcode(2); this.east = 0;
      } else {
        sp.setCenter(-di, H - si); sp.setOpcode(1); this.east = 1;
      }
      sp.loops = 0x7fff;
      return;
    }

    if (type >= 0xa && type <= 0xd) {                   // four walk in to the middle
      sp.nextSequences([0x41, 0x4a, 0x4a, 0x4a, 0x4a, 0x4a]);
      sp.setCenter(pt[0], pt[1]);
      sp.setOpcode([0, 2, 1, 3][type - 0xa]);
      e = sp.predict(0);
      sp.nextSequences([0x41, 0x4a, 0x4a, 0x4a, 0x4a, 0x4a, 0x4a, 0x4a, 0x4a, 0x4a, 0x4a, 0x62, 0]);
      sp.setCenter(pt[0] + (pt[0] - e[0]), pt[1] + (pt[1] - e[1]));
      this.east = 1;
      return;
    }

    if (type >= 0xe && type <= 0x11) {                  // four walk in from above and below
      sp.nextSequences([0x41, 0x4a, 0x4a, 0x4a, 0x4a]);
      sp.setCenter(pt[0], 0);
      sp.setOpcode(1);
      e = sp.predict(0);
      sp.setOpcode([0, 1, 2, 3][type - 0xe]);
      var below = type >= 0x10;
      sp.nextSequences([0x41, 0x4a, 0x4a, 0x4a, 0x4a, 0x4a, 0x4a, 0x4a, 0x62, 0]);
      sp.setCenter(pt[0], below ? pt[1] + e[1] : pt[1] - e[1]);
      this.east = 1;
      return;
    }

    if (type >= 0x12 && type <= 0x15) {                 // four walk away from the middle
      sp.nextSequences([0x7e, 0x87, 0x87, 0x87, 0x87, 0x87, 0x87, 0x9f, 0]);
      sp.setCenter(pt[0], pt[1]);
      sp.setOpcode([0, 2, 1, 3][type - 0x12]);
      this.east = 1;
      return;
    }

    if (type >= 0x16 && type <= 0x19) {                 // four graze round the middle
      var ur = seq.seqRect(0xd);
      si = (ur[3] - ur[1]) >> 1;
      sp.setOpcode(1);
      sp.setCenter(0, 0);
      sp.nextSequences([4, 0xd, 0xbb, 0xe2, 0xfa, 0x112, 0x172]);
      e = sp.predict(0);
      switch (type) {
        case 0x16: sp.setOpcode(1); x = (W >> 1) - e[0]; y = (H >> 1) - si; break;
        case 0x17: sp.setOpcode(0); x = (W >> 1) + e[0]; y = (H >> 1) - si; break;
        case 0x18: sp.setOpcode(3); x = (W >> 1) - e[0]; y = si + (H >> 1); break;
        default: sp.setOpcode(2); x = (W >> 1) + e[0]; y = si + (H >> 1); break;
      }
      sp.nextSequences([4, 0xbb, 0xe2, 0xfa, 0x112, 0x172, 0x25, 0x41,
                        0x4a, 0x4a, 0x4a, 0x4a, 0x4a, 0x4a, 0x62, 0]);
      sp.setCenter(x, y);
      this.east = 1;
      return;
    }

    if (type >= 0x1a && type <= 0x1e) {                 // five graze in a cross
      r1 = seed % 3; r2 = seed & 1;
      sp.nextSequences([4, 0xbb, 0xe2, 0xfa, 0xfa]);
      if (r2) { sp.addQ(0xfa); }
      sp.addQs([0x112, 0x172, 0x25, 0]);
      this.east = r2;
      if (param === 1) {
        sp.setOpcode(this.east === 1 ? 1 : 0);
        x = (this.east === 1 ? -di : di) + (W >> 1);
        y = H >> 1;
        switch (type - 0x1a) {
          case 0: y = H >> 2; break;
          case 1: x = this.east === 1 ? x + this.a8 : x - this.a8; break;
          case 2: x = this.east === 1 ? x - this.a8 : x + this.a8; break;
          case 3: y = H - (H >> 2); break;
          default: if (r1 !== 0) { sp.nextSequence(0); } else { y = H >> 1; } break;
        }
      } else {
        if (this.east === 1) { sp.setOpcode(1); x = di; } else { sp.setOpcode(0); x = W - di; }
        y = H >> 2;
        switch (type - 0x1a) {
          case 0: x = (this.east === 1 ? di : -di) + (W >> 1); break;
          case 2:
            x = (this.east === 1 ? di : -di) + (W >> 1);
            y = H - y;
            if (r1 && r2) { sp.setOpcode(sp.op | 2); }
            break;
          case 3:
            y = H - y;
            if (r1 && r2) { sp.setOpcode(sp.op | 2); }
            break;
          case 4:
            if (r1) { sp.nextSequence(0); break; }
            y = H >> 1;
            x = this.east === 1 ? di + (W >> 2) : W - (W >> 2) - di;
            break;
          default: break;
        }
      }
      sp.setCenter(x, y);
      return;
    }

    if (type === 0x1f || type === 0x20 || type === 0x21 || type === 0x22) {
      r1 = seed % 3;
      var pair = type <= 0x20;                          // 1f/20: mirrored up/down; 21/22: left/right
      if (pair) {
        r2 = seed & 1;
        if (r2 === 1) { this.east = 1; sp.setOpcode(1); x = pt[0] - di; } else { x = di + pt[0]; }
      } else {
        sp.setOpcode(0);
        x = pt[0];
      }
      y = pt[1];
      sp.nextSequences([4, 0xbb, 0xe2, 0xfa]);
      switch (param) {
        case 0:
          if (r1) { sp.addQ(0xfa); }
          sp.addQs([0xfa, 0x112, 0x172, 0x25, 0]);
          break;
        case 1: sp.addQs([0x112, 0x12a, 0x142, 0x15a, 0x172, 0x25, 0]); break;
        case 2: sp.addQs([0x112, 0x172, 0x237, 0x9f, 0]); break;
        case 3:
          y -= this.b4 >> 1;
          sp.nextSequences([0x41, 0x18a]);
          if (r1) { sp.addQs([0xd, 0x237, 0x9f, 0]); } else { sp.addQs([0xbb, 0x172, 0x237, 0x9f, 0]); }
          break;
        case 4:
          sp.nextSequences(pair ? [4, 0x25, 4, 0x25] : [4, 0x25, 4, 0x25, 4, 0x25]);
          break;
        default: break;
      }
      if (type === 0x20) { sp.setOpcode(sp.op | 2); y = H - y; }
      if (type === 0x21) { sp.setOpcode(1); this.east = 1; x = W - x; }
      sp.setCenter(x, y);
    }
  };

  /* ------------------------------------------------- CowModule */

  function Herd(art, data, flavor) {
    this.art = art;
    this.seq = new CSeq(data, art);
    this.stage = data.stage || [189, 145];
    this.palettes = data.palettes.map(function (p) {
      return p.map(function (h) { return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; });
    });
    this.flavor = flavor;
    this.now = 0;
    this.sheets = {};
    this.masks = {};
    this.prepare();
    var r13 = this.seq.rect(0xd);
    this.cowH = r13[3] - r13[1];        // 90
    this.cowW = r13[2] - r13[0];        // a8
  }
  var HP = Herd.prototype;

  /* Each strip as palette indices, so ColorizeCows can repaint it. */
  HP.prepare = function () {
    var grey = {}, i, self = this;
    this.palettes[0].forEach(function (c, k) { grey[c[0]] = k; });
    Object.keys(this.art.sequences).forEach(function (id) {
      var img = self.art.sequences[id].image;
      if (!img || typeof document === 'undefined') { return; }
      var cv = document.createElement('canvas');
      if (!cv || typeof cv.getContext !== 'function') { return; }
      cv.width = img.width; cv.height = img.height;
      var c = cv.getContext('2d');
      if (!c || typeof c.getImageData !== 'function') { return; }
      c.drawImage(img, 0, 0);
      var px = c.getImageData(0, 0, cv.width, cv.height), d = px.data;
      var mask = new Uint8Array(cv.width * cv.height);
      for (i = 0; i < mask.length; i += 1) {
        var k = grey[d[i * 4]];
        mask[i] = d[i * 4 + 3] < 128 || k === undefined ? 255 : k;
      }
      self.sheets[id] = cv;
      self.masks[id] = { ctx: c, data: px, mask: mask };
    });
  };

  /* ColorizeCows: the grey entries become `pal`'s. */
  HP.colorize = function (pal) {
    for (var id in this.masks) {
      var m = this.masks[id], d = m.data.data, mask = m.mask;
      for (var i = 0, n = mask.length; i < n; i += 1) {
        var k = mask[i];
        if (k === 255) { d[i * 4 + 3] = 0; continue; }
        var c = pal[k];
        d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
      }
      m.ctx.putImageData(m.data, 0, 0);
    }
  };

  /* ChooseANewPalette */
  HP.choose = function () {
    var f = this.flavor;
    if (f > 10) {
      do { f = rnd(11); } while (f === this.lastPick);
      this.lastPick = f;
      this.paletteAt = this.now + rnd(5000) + 5000;
    }
    this.target = FLAVOR_PAL[f];
  };

  /* DoPaletteFade: five steps, half a second apart. */
  HP.fade = function () {
    if (this.now < this.fadeAt) { return; }
    var cur = this.palettes[this.current], tgt = this.palettes[this.target], step = this.fadeStep;
    var mix = [];
    for (var i = 0; i < SHADES; i += 1) {
      mix.push([0, 1, 2].map(function (ch) {
        return cur[i][ch] - Math.trunc((cur[i][ch] - tgt[i][ch]) * step / 5);
      }));
    }
    this.fadeStep += 1;
    if (this.fadeStep >= 6) {
      this.fadeAt = 0;
      this.fadeStep = 1;
      this.current = this.target;
      this.colorize(this.palettes[this.current]);
      return;
    }
    this.colorize(mix);
    this.fadeAt = this.now + 500;
  };

  HP.reset = function (w, h) {
    this.W = w; this.H = h;
    // ComputeCowCount
    this.count = h < 400 ? 4 : h < 500 ? 6 : h < 650 ? 10 : 14;
    this.cows = [];
    for (var i = 0; i < Math.max(this.count, 8); i += 1) { this.cows.push(new Cow(this)); }
    this.state = 6;
    this.lastPick = -1;
    this.paletteAt = 0;
    this.fadeAt = 0; this.fadeStep = 1;
    this.choose();                     // SetCurrentPalette
    this.current = this.target;
    this.colorize(this.palettes[this.current]);
    this.repeatAt = 0; this.stateUntil = 0;
    this.repeats = 0; this.quad = 0;
    this.bag = [0, 0, 0, 0, 0, 0, 0, 0]; this.bagCount = 0; this.lastQuad = -1;
  };

  /* NextQuadType: a bag of eight, never the same twice running. Exactly as
     the module has it, which refills the slot it took from one past the end
     of the bag - the first time, from the word after the bag, which is its
     own count (8). An 8 then plays as pattern 3, which is where both of
     DoDrawFrame's switches send anything out of range. */
  HP.nextQuad = function () {
    var b = this.bag, k, tries = 0;
    if (this.bagCount <= 0) {
      for (k = 0; k < 8; k += 1) { b[k] = k; }
      this.bagCount = 8;
    }
    do {
      k = rnd(this.bagCount);
      tries += 1;
    } while (b[k] === this.lastQuad && tries < 50);
    var t = b[k];
    this.lastQuad = t;
    b[k] = this.bagCount === 8 ? 8 : b[this.bagCount];
    this.bagCount -= 1;
    return t;
  };

  HP.counts = function () {               // CountCows
    var active = 0, off = 0, offAll = 0, i;
    for (i = 0; i < this.count; i += 1) { if (this.cows[i].isOff()) { off += 1; } else { active += 1; } }
    for (i = 0; i < this.cows.length; i += 1) { if (this.cows[i].isOff()) { offAll += 1; } }
    return { active: active, off: off, offAll: offAll };
  };

  /* StartQuadGuernsey: the first cow that is free. */
  HP.startFree = function (type, param, pt, seed) {
    for (var i = 0; i < this.cows.length; i += 1) {
      if (this.cows[i].isOff()) { this.cows[i].start(seed === undefined ? this.now : seed, type, param, pt); return; }
    }
  };

  HP.startQuad = function () {
    var W = this.W, H = this.H, now = this.now, c = this.cows, pt = [W >> 1, H >> 1], i, r, n;
    this.state = 7;
    this.repeatAt = now + 8000;
    this.repeats = 0;
    this.quad = this.nextQuad();
    switch (this.quad) {
      case 0: case 1: case 2: case 3: case 8:
        var base = [0xa, 0xe, 0x12, 0x16][Math.min(this.quad, 3)];
        for (i = 0; i < 4; i += 1) { c[i].start(now, base + i, 0, pt); }
        this.repeats = rnd(3) + 4;
        break;
      case 4:
        r = rnd(2);
        for (i = 0; i < 5; i += 1) { c[i].start(now, 0x1a + i, r, pt); }
        break;
      case 5:
        r = rnd(5);
        pt = [W >> 2, (H >> 2) + rnd(H >> 3)];
        c[0].start(now, 0x1f, r, pt); c[1].start(now, 0x20, r, pt);
        pt = [W - (W >> 2), (H >> 2) + rnd(H >> 3)];
        r = rnd(5);
        c[2].start(now + r, 0x1f, r, pt); c[3].start(now + r, 0x20, r, pt);
        if (rnd(3) === 2) {
          pt = [W >> 1, (H >> 2) + rnd(H >> 3)];
          r = rnd(5);
          c[4].start(now + r, 0x1f, r, pt); c[5].start(now + r, 0x20, r, pt);
        }
        this.repeats = rnd(3) + 4;
        break;
      case 6:
        n = 2 * ((H - this.cowH) / this.cowH | 0);
        var step = H / (H / this.cowH | 0) | 0;
        for (i = 0; i < n && i + 1 < c.length; i += 2) {
          if (this.counts().offAll >= 2) {
            pt = [W - rnd(W >> 1), rnd(this.cowH >> 2) + (step >> 1) * i + step];
            r = rnd(5);
            c[i].start(now, 0x21, r, pt);
            c[i + 1].start(now, 0x22, r, pt);
          }
        }
        this.repeats = rnd(3) + 4;
        break;
      default:
        this.state = 3;
        break;
    }
  };

  HP.repeatQuad = function () {
    var W = this.W, H = this.H, pt = [W >> 1, H >> 1], r, i;
    switch (this.quad) {
      case 0: for (i = 0; i < 4; i += 1) { this.startFree(0xa + i, 0, pt); } break;
      case 1: for (i = 0; i < 4; i += 1) { this.startFree(0xe + i, 0, pt); } break;
      case 2: for (i = 0; i < 4; i += 1) { this.startFree(0x12 + i, 0, pt); } break;
      case 5:
        r = rnd(5);
        pt = [(rnd(W >> 1) + W) >> 2, rnd(H >> 3) + (H >> 2)];
        this.startFree(0x1f, r, pt); this.startFree(0x20, r, pt);
        break;
      case 6:
        pt = [W - rnd(W >> 1), rnd(H >> 1) + (H >> 2)];
        r = rnd(5);
        this.startFree(0x21, r, pt); this.startFree(0x22, r, pt);
        break;
      default:                                        // 3, 4 and the stray 8
        for (i = 0; i < 4; i += 1) { this.startFree(0x16 + i, 0, pt); }
        break;
    }
  };

  /* DoDrawFrame */
  HP.step = function (dt) {
    this.now += dt * 1000;
    var now = this.now, i;
    if (now > this.paletteAt && !this.fadeAt && this.flavor > 10) {
      this.choose();
      this.fadeAt = 1;
    }
    if (this.fadeAt) { this.fade(); }
    for (i = 0; i < this.cows.length; i += 1) { this.cows[i].play(now); }
    var n = this.counts(), W = this.W;
    switch (this.state) {
      case 0:                                         // a few cows wander about
        this.stateUntil = now + rnd(5000) + 30000;
        this.state = 1;
        break;
      case 1:
        if (n.active < this.count && now > this.repeatAt) {
          this.repeatAt = now + 3000;
          for (i = 0; i < this.count; i += 1) {
            if (this.cows[i].isOff()) { this.cows[i].start(now, 0, 0, null); break; }
          }
        }
        if (now > this.stateUntil) { this.state = 2; }
        break;
      case 2:
        if (n.off === this.count) { this.state = 6; }
        break;
      case 3:
        this.state = 4;
        this.stateUntil = now + rnd(5000) + 20000;
        break;
      case 4:                                         // the parade
        if (n.off > 0) {
          var maxX = 0, off = n.off;
          for (i = 0; i < this.count; i += 1) {
            var cw = this.cows[i];
            if (cw.east === 0 && !cw.isOff() && cw.sp.cx > maxX) { maxX = cw.sp.cx; }
          }
          if (W - this.cowW > maxX) {
            for (i = 0; i < this.count; i += 1) {
              if (this.cows[i].isOff()) { this.cows[i].start(now, 8, 0, null); off -= 1; break; }
            }
          }
          // The module looks for the eastbound cows' least x here, then
          // tests the westbound maximum again; so both rows start together.
          if (off !== 0 && W - this.cowW > maxX) {
            for (i = 0; i < this.count; i += 1) {
              if (this.cows[i].isOff()) { this.cows[i].start(now, 9, 0, null); break; }
            }
          }
        }
        if (now > this.stateUntil) { this.state = 5; }
        break;
      case 5:
        if (n.off === this.count) { this.state = 0; }
        break;
      case 6:
        this.startQuad();
        break;
      case 7:
        if (this.repeats <= 0) {
          if (n.active === 0) { this.state = 0; }
          break;
        }
        if (now > this.repeatAt && n.offAll >= 4) {
          this.repeats -= 1;
          this.repeatAt = now + 8000;
          this.repeatQuad();
        }
        break;
      default: break;
    }
  };

  HP.draw = function (ctx, w, h) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < this.cows.length; i += 1) { this.cows[i].sp.draw(ctx, this.sheets); }
  };

  /* ------------------------------------------------------------ element */

  function GuernseyElement() { return Reflect.construct(HTMLElement, [], GuernseyElement); }
  GuernseyElement.prototype = Object.create(HTMLElement.prototype);
  GuernseyElement.prototype.constructor = GuernseyElement;
  Object.setPrototypeOf(GuernseyElement, HTMLElement);

  GuernseyElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var AD = window.AfterDark;
    var base = (this.getAttribute('art') || 'art/guernsey').replace(/\/$/, '');
    this.style.display = this.style.display || 'block';
    this.style.background = '#000';

    Promise.all([
      AD.load(base),
      fetch(AD.bust(base + '/compound.json')).then(function (r) {
        if (!r.ok) { throw new Error('no compound.json at ' + base); }
        return r.json();
      })
    ]).then(function (got) {
      var f = FLAVORS.indexOf((AD.setting(self, 'flavor') || 'tutti-frutti').toLowerCase());
      var herd = new Herd(got[0], got[1], f < 0 ? TUTTI : f);
      var screen = new AD.Screen(self);
      self._screen = screen;
      self.sim = herd;
      screen.onresize = function (w, h) { herd.reset(w, h); };
      herd.reset(screen.width, screen.height);
      screen.run(function (dt, ctx, w, h) {
        herd.step(dt);
        herd.draw(ctx, w, h);
      });
    }).catch(function (err) {
      self.textContent = err.message;
    });
  };

  GuernseyElement.prototype.disconnectedCallback = function () {
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-guernsey', GuernseyElement);
  window.AfterDarkGuernsey = { Herd: Herd, Cow: Cow, Sprite: Sprite, FLAVORS: FLAVORS, FLAVOR_PAL: FLAVOR_PAL };
}());
