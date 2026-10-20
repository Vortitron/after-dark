/**
 * toasters-40.js - Flying Toasters!, the After Dark 4.0 one, on its own art.
 *
 * TOASTERS.AD (1996). Its description resource:
 *
 *   "Toaster meets toaster, toasters fall in love, Toasters get married,
 *    Baby Toasterettes! So much toast, yet not enough dough for college."
 *   "Objects" determine how many objects are on the screen.
 *   "Toaster" determines whether baby toasters or adult toasters fly across
 *   your screen. "Random" selects one of the two.
 *   "Music" determines the length of the music.
 *   Check "Display Karaoke" to show the lyrics.
 *   Programming by Brock Wagenaar, Art by Bob Ting,
 *   Sound and music by P.J. Sonnichsen.
 *
 * Nothing here is invented. Unlike the 1992 toasters this module is not
 * sprites drifting on a heading: every movement is choreography stored in the
 * module as "compound sequences" (resource types 8100/8101/8102, exported to
 * art/toasters-40/compound.json). 22000 is a 3309-frame library of labelled
 * flights - flap cycles, banks, rolls, dives, toasters meeting, the wedding,
 * the cage, food, smoke, the history-of-toaster-flight intro - where each frame
 * places cels of strips 22000-22035 on a stage, and the sprite moves by
 * following the stage: one label's link frame shares a cel with the previous
 * label's last frame and the engine keeps that cel still while it switches.
 * 22100 is the same for the karaoke lines, each word on its own channel.
 *
 * The engine half below is a port of ADXPL510.DLL's CompoundSprite
 * (NextSequence, PlaySequence, CountLoopsOutOfView, RollBackFrames,
 * PredictEndpoint, Split/Merge ...) and the module half is a transcription of
 * TOASTERS.AD's code, read out of its disassembly: ToasterControl (what to
 * launch, ten times a second), TrafficControl (the launch slots along the top
 * and right edges and the near-miss checks), FlyingToaster's choice of what
 * to do next and how to swerve, FlyingFood, FlyingCloud, the baby versions,
 * FlyingIntro and FlyingBigGag - the 36 scripted "gags" in three tiers - and
 * KaraokeControl with the module's own lyric timing tables for both songs.
 *
 * What is not the original: there is no music (the karaoke runs exactly as it
 * does while the song plays, and keeps cycling as the module does with Music
 * on), no sound effects, and Caps Lock does not force a gag. Two gags (the
 * ones that end with a third toaster joining) store a stack address instead
 * of a point when their predicted spot is off the left edge; that one value is
 * replaced with the spot the code clearly meant. The karaoke lines sit where
 * the capture of the real thing puts them (each line's frame ending 3 pixels
 * above the bottom), as the centring the code describes comes out a few pixels
 * off it. Random numbers are Math.random where the module used RandShort.
 *
 *   <after-dark-toasters-40 art="art/toasters-40" objects="squadron" toasters="adults"
 *     music="always" display-karaoke></after-dark-toasters-40>
 */
(function () {
  'use strict';

  var TICK = 100;            // ToasterControl runs at 1000 / 10 ms
  var OBJECTS = ['flight', 'squadron', 'air wing', 'swarm'];
  var OBJECT_VALUES = [0, 25, 50, 75];
  var TOASTERS = ['adults', 'babies', 'random'];
  var MUSIC = ['never', '1 min.', '2 mins.', '5 mins.', '30 mins.', 'always'];
  var KARAOKE_H = 22;        // the strip the module takes off the bottom

  var BAD = -1000;           // the module's "no point" (0xfc18)

  function rnd(n) { return n > 0 ? Math.floor(Math.random() * n) : 0; }
  function half(a, b) { return (a + b) / 2 | 0; }             // sar with jns/adc
  function hit(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }
  function ctr(r) { return [half(r[0], r[2]), half(r[1], r[3])]; }
  function onPoint(r, p) {
    var w = r[2] - r[0], h = r[3] - r[1];
    var l = p[0] - (w >> 1), t = p[1] - (h >> 1);
    return [l, t, l + w, t + h];
  }

  /* The module's shuffle bag (0x4167f5): no repeats until all are used. */
  function Bag(n) { this.n = n; this.used = {}; this.count = 0; this.last = -1; }
  Bag.prototype.pick = function (n) {
    if (n !== undefined) { this.n = n; }
    if (this.count >= this.n) { this.used = {}; this.count = 0; }
    var r, tries = 0;
    do { r = rnd(this.n); tries += 1; } while ((this.used[r] || r === this.last) && tries < 100);
    this.used[r] = 1;
    this.count += 1;
    this.last = r;
    return r;
  };
  Bag.prototype.release = function (r) {
    if (this.used[r]) { this.used[r] = 0; if (this.count > 0) { this.count -= 1; } }
  };

  /* ------------------------------------------------------ CompoundSequence */

  function CSeq(data, art) {
    this.f = data.frames;
    this.cels = data.cels;
    this.art = art;
    this.size = {};
    for (var id in data.cels) {
      var c = data.cels[id], s = art.sequence(c[0]), fr = s.frames[c[1]];
      this.size[id] = [fr.w, fr.h];
    }
  }
  CSeq.prototype.valid = function (t) { return t > 0 && t < this.f.length && !!this.f[t]; };
  CSeq.prototype.cx = function (t) { var f = this.f[t]; return (f[0] + f[2]) >> 1; };
  CSeq.prototype.cy = function (t) { var f = this.f[t]; return (f[1] + f[3]) >> 1; };
  CSeq.prototype.labelRange = function (t) { var s = t; while (this.valid(s)) { s += 1; } return s - t; };

  /* ------------------------------------------------------ CompoundSprite */

  function Sprite(seq) {
    this.s = seq;
    this.frame = 0; this.cx = 0; this.cy = 0; this.seq = 0;
    this.loops = 0; this.queued = -1; this.done = 1; this.just = 0;
    this.q = []; this.qi = -1;
    this.rect = [BAD, BAD, BAD, BAD]; this.vis = false;
  }
  var SP = Sprite.prototype;
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
  SP.frameCount = function (s) {
    if (s === -1) { s = this.seq; }
    return s === 0 ? 1 : this.s.labelRange(s);
  };
  SP.setFrame = function (f) { this.frame = f; this.upd(); };
  SP.moveRel = function (f) {
    if (this.s.valid(this.frame) && this.s.valid(f)) {
      this.cx += this.s.cx(f) - this.s.cx(this.frame);
      this.cy += this.s.cy(f) - this.s.cy(this.frame);
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
            this.cx += (a[i][3] - this.s.cx(this.frame)) + (this.s.cx(f) - b[j][3]);
            this.cy += (a[i][4] - this.s.cy(this.frame)) + (this.s.cy(f) - b[j][4]);
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
  SP.moveBack = function (s) {
    if (this.frame !== 0) { this.moveRel(s === 0 ? this.first(-1) : this.link(-1)); }
    this.moveCommon(this.last(s));
    this.moveRel(this.first(s));
    this.seq = s;
    this.upd();
  };
  SP.delta = function (s) {               // GetSequenceDelta(s, 0)
    var p = this.save();
    this.cx = 0; this.cy = 0;
    this.frame = this.seq = this.first(s);
    this.moveIntoNext(s);
    var d = [this.cx, this.cy];
    this.restore(p);
    return d;
  };
  SP.countLoopsOutOfView = function (rect) {
    if (!hit(rect, this.rect)) { return -1; }
    var p = this.save(), n = 0;
    if (this.queued !== -1) { this.moveIntoNext(this.queued); }
    this.moveToEnd();
    while (hit(rect, this.rect) && n < 400) {
      this.moveIntoNext(this.seq);
      this.moveToEnd();
      n += 1;
    }
    this.restore(p);
    return n;
  };
  SP.countFramesBack = function (rect, s) {
    var seq = this.seq, q = this.qcount(), n = 0, guard = 0;
    var p = this.save();
    if (this.queued !== -1) { seq = this.queued; }
    this.setFrame(0);
    this.moveIntoNext(s);
    while (hit(rect, this.rect) && guard < 400) {
      var s2;
      if (q > 0) { q -= 1; s2 = this.entry(q); } else { s2 = seq; }
      this.moveBack(s2);
      n += this.frameCount(-1);
      guard += 1;
    }
    while (this.last(-1) > this.frame) {
      this.moveRel(this.frame + 1);
      if (hit(rect, this.rect)) { break; }
      n -= 1;
    }
    this.restore(p);
    return n;
  };
  SP.rollBack = function (n, s) {
    var seq = this.seq, q = this.qcount();
    if (n === 0) { this.nextSequence(0); return; }
    if (this.queued !== -1) { seq = this.queued; this.queued = -1; }
    this.loops = -1;
    this.setFrame(0);
    this.moveIntoNext(s);
    do {
      var s2;
      if (q > 0) { q -= 1; s2 = this.entry(q); } else { q = -1; s2 = seq; this.loops += 1; }
      this.moveBack(s2);
      n -= this.frameCount(-1);
    } while (n > 0);
    this.moveRel(this.seq - n);
    if (this.loops < 0) { this.loops = 0; }
    while (q >= 0) { this.pop(); q -= 1; }
  };
  SP.predict = function (s) {
    var q = this.qcount(), loops = this.loops, p = this.save(), i;
    if (this.queued !== -1) { this.moveIntoNext(this.queued); }
    while (loops > 0) { this.moveIntoNext(this.seq); loops -= 1; }
    for (i = 0; i < q; i += 1) { this.moveIntoNext(this.entry(i)); }
    this.moveIntoNext(s);
    var r = [this.cx, this.cy];
    this.restore(p);
    return r;
  };
  SP.channelRect = function (ch) {
    if (!this.s.valid(this.frame)) { return [0, 0, 0, 0]; }
    var f = this.s.f[this.frame], l = this.cx - ((f[2] - f[0]) >> 1), t = this.cy - ((f[3] - f[1]) >> 1);
    for (var i = 4; i < f.length; i += 1) {
      if (f[i][1] === ch) {
        var sz = this.s.size[f[i][0]], x = f[i][3] - f[0] + l, y = f[i][4] - f[1] + t;
        return [x, y, x + sz[0], y + sz[1]];
      }
    }
    return [0, 0, 0, 0];
  };
  SP.alignChannel = function (ch, r) {
    if (!this.s.valid(this.frame)) { return; }
    var f = this.s.f[this.frame];
    for (var i = 4; i < f.length; i += 1) {
      if (f[i][1] === ch) {
        this.cx = this.s.cx(this.frame) + (r[0] - f[i][3]);
        this.cy = this.s.cy(this.frame) + (r[1] - f[i][4]);
        this.upd();
        return;
      }
    }
  };
  SP.split = function (other, sThis, sOther) {
    other.frame = this.frame; other.seq = this.seq; other.cx = this.cx; other.cy = this.cy;
    other.upd();
    other.nextSequence(sOther);
    this.nextSequence(sThis);
  };
  SP.merge = function (other, s) { other.nextSequence(0); this.nextSequence(s); };
  SP.draw = function (ctx) {
    if (!this.vis || !this.s.valid(this.frame)) { return; }
    var f = this.s.f[this.frame], dx = this.rect[0] - f[0], dy = this.rect[1] - f[1];
    for (var i = 4; i < f.length; i += 1) {
      var it = f[i], c = this.s.cels[it[0]], seq = this.s.art.sequence(c[0]), fr = seq.frames[c[1]];
      var x = it[3] + dx, y = it[4] + dy;
      if (!it[2]) {
        ctx.drawImage(seq.image, fr.x, fr.y, fr.w, fr.h, x, y, fr.w, fr.h);
      } else {
        ctx.save();
        ctx.translate(x + (it[2] & 1 ? fr.w : 0), y + (it[2] & 2 ? fr.h : 0));
        ctx.scale(it[2] & 1 ? -1 : 1, it[2] & 2 ? -1 : 1);
        ctx.drawImage(seq.image, fr.x, fr.y, fr.w, fr.h, 0, 0, fr.w, fr.h);
        ctx.restore();
      }
    }
  };

  /* ------------------------------------------------------ TrafficControl */

  function Traffic(world, bg) {
    this.world = world;
    var w = bg[2] - bg[0], h = bg[3] - bg[1];
    var ew = w + (w % 80 ? 80 - w % 80 : 0) + 320, eh = h + (h % 80 ? 80 - h % 80 : 0) + 320;
    this.bg = bg;
    this.region = [bg[0] - 160, bg[1] - 160, bg[0] - 160 + ew, bg[1] - 160 + eh];
    var cols = ew / 80 | 0, rows = eh / 80 | 0;
    this.top = (cols - 5) / 2 | 0;
    this.slots = rows + this.top - 4;
    this.used = []; this.usedT = []; this.resv = []; this.resvT = [];
    this.lastLaunch = -1e12;
    this.lastSlot = 0;
    this.bag = new Bag(this.slots);
    this.objs = [];
  }
  var TP = Traffic.prototype;
  TP.ok = function (s) { return s >= 0 && s < this.slots; };
  TP.isUsed = function (s) {
    if (!this.ok(s)) { return false; }
    if (this.used[s] && this.world.now - this.usedT[s] > 25000) { this.used[s] = 0; }
    return !!this.used[s];
  };
  TP.isResv = function (s) {
    if (!this.ok(s)) { return false; }
    if (this.resv[s] && this.world.now - this.resvT[s] > 25000) { this.resv[s] = 0; }
    return !!this.resv[s];
  };
  TP.markUsed = function (s) { if (this.ok(s)) { this.used[s] = 1; this.usedT[s] = this.world.now; } };
  TP.clearUsed = function (s) { if (this.ok(s)) { this.used[s] = 0; } };
  TP.markResv = function (s) { if (this.ok(s)) { this.resv[s] = 1; this.resvT[s] = this.world.now; } };
  TP.clearResv = function (s) { if (this.ok(s)) { this.resv[s] = 0; } };
  TP.point = function (s) {
    var b = this.bg;
    return s < this.top ? [b[2] + (s - this.top) * 160 + 240, b[1] - 80] : [b[2] + 80, b[1] + (s - this.top) * 80];
  };
  TP.add = function (o) { if (this.objs.indexOf(o) < 0) { this.objs.push(o); } o.trect = [BAD, BAD, BAD, BAD]; };
  TP.remove = function (o) { var i = this.objs.indexOf(o); if (i >= 0) { this.objs.splice(i, 1); } };
  TP.record = function (o) { o.trect = o.rect(); };
  TP.hide = function (o) { o.trect = [BAD, BAD, BAD, BAD]; };
  TP.occupied = function (x, y, self) {
    var q = [x - 40, y - 40, x + 40, y + 40], r = this.region;
    if (q[0] < r[0] || q[2] > r[2] || q[1] < r[1] || q[3] > r[3]) { return null; }
    var found = null;
    for (var i = 0; i < this.objs.length; i += 1) {
      var o = this.objs[i];
      if (o !== self && o.trect && hit(o.trect, q)) { found = o; }
    }
    return found;
  };
  /* 0x4171ad: one launch point, at most every half second. */
  TP.launch = function () {
    var now = this.world.now, tries = 0, s = 0, p;
    if (this.lastLaunch + 500 > now) { return null; }
    for (;;) {
      do {
        s = this.bag.pick(this.slots);
        if (!this.isUsed(s) && !this.isResv(s)) { break; }
        tries += 1;
      } while (tries < 4);
      if (tries >= 4) { return null; }
      p = this.point(s);
      if (!this.occupied(p[0], p[1], null) && !this.occupied(p[0] - 160, p[1] + 80, null)) { break; }
      tries += 1;
      if (tries >= 4) { return null; }
    }
    this.lastLaunch = now;
    this.lastSlot = s;
    return p;
  };
  /* 0x417378: a run of neighbouring slots for a gag. */
  TP.launchGroup = function (count, offset, start, range) {
    var ok = true, i;
    if (range <= 0) { range = 1; }
    if (range + start > this.slots) { range = this.slots - start; }
    var s = start + rnd(range);
    for (i = 0; i < count; i += 1) { if (ok) { ok = !this.isUsed(s - offset + i); } }
    if (!ok) {
      for (i = 0; i < count; i += 1) { this.markResv(s - offset + i); }
      return null;
    }
    this.lastSlot = s;
    for (i = 0; i < count; i += 1) { this.markUsed(s - offset + i); }
    for (i = 0; i < count; i += 1) { this.clearResv(s - offset + i); }
    return this.point(s);
  };

  /* ------------------------------------------------------ FlyingObject */

  function Flying(world, kind) {
    this.world = world;
    this.kind = kind;
    this.sp = new Sprite(world.flight);
    this.state = 1;
  }
  var FP = Flying.prototype;
  FP.center = function () { return [this.sp.cx, this.sp.cy]; };
  FP.rect = function () { return [this.sp.cx - 35, this.sp.cy - 35, this.sp.cx + 35, this.sp.cy + 35]; };
  FP.offLeft = function () { return this.rect()[2] < this.world.bg[0]; };
  FP.offBottom = function () { return this.rect()[1] > this.world.bg[3]; };
  FP.offRight = function () { return this.rect()[0] > this.world.bg[2]; };
  FP.onScreen = function () { return hit(this.rect(), this.world.bg); };
  FP.plain = function () { return true; };
  FP.finished = function () { return this.state === 3; };
  FP.sprites = function () { return [this.sp]; };
  FP.hideAll = function () { this.sp.nextSequence(0); this.sp.vis = false; };

  /* ---- FlyingToaster */

  function Toaster(world, adult) {
    Flying.call(this, world, 'toaster');
    this.adult = adult;
    this.type = 0; this.seq = 0; this.f48 = 0; this.f4a = 0; this.f4c = 1;
    this.slot60 = -1; this.slot64 = 0; this.loops6c = 0;
    this.sp.nextSequence(0);
  }
  Toaster.prototype = Object.create(FP);
  var TO = Toaster.prototype;
  TO.plain = function () { return this.f4a === 0; };
  TO.start = function (s) {            // 0x419cc1
    if ((this.seq === 0x73 || this.seq === 0x69) && s !== 0x73 && s !== 0x7a) {
      this.sp.nextSequences([0x7a, s]);
    } else {
      this.sp.nextSequence(s);
    }
    this.seq = s;
  };
  TO.startChain = function (list) {    // 0x419d10
    this.start(list[0]);
    for (var i = 1; i < list.length; i += 1) { this.sp.addQ(list[i]); this.seq = list[i]; }
  };
  TO.flags = function (a, b, c) { this.f48 = a; this.f4a = b; this.f4c = c; };
  /* 0x41987f: would the next loop of s fly into someone? */
  TO.blocked = function (s) {
    var tr = this.world.traffic, d = this.sp.delta(s), x = this.sp.cx, y = this.sp.cy;
    if (s === 3) { return tr.occupied(x + (d[0] / 4 | 0), y + (d[1] / 4 | 0), this); }
    return tr.occupied(x + (d[0] / 2 | 0), y + (d[1] / 2 | 0), this) || tr.occupied(x + d[0], y + d[1], this);
  };
  TO.chainBlocked = function (list) {  // 0x419b0b
    var tr = this.world.traffic, sp = this.sp, x0 = sp.cx, y0 = sp.cy;
    var d = sp.delta(list[0]);
    var px = x0 + (d[0] / 2 | 0), py = y0 + (d[1] / 2 | 0);
    var o = tr.occupied(px, py, this);
    if (!o) { px = x0 + d[0]; py = y0 + d[1]; o = tr.occupied(px, py, this); }
    for (var i = 1; i < list.length && !o; i += 1) {
      sp.setCenter(px, py);
      d = sp.delta(list[i]);
      var qx = px + (d[0] / 2 | 0), qy = py + (d[1] / 2 | 0);
      o = tr.occupied(qx, qy, this);
      if (!o) { qx = px + d[0]; qy = py + d[1]; o = tr.occupied(qx, qy, this); }
      px = qx; py = qy;
      sp.setCenter(px, py);
    }
    sp.setCenter(x0, y0);
    return !!o;
  };
  TO.chooseType = function () {        // 0x419d8d
    if (!this.adult) { return 3; }
    var r = this.world.bags.type.pick(11);
    return r === 0 ? 3 : r <= 5 ? 2 : 1;
  };
  TO.special = function () {           // 0x419e80
    if (this.adult) { return 0x3d7; }
    var r = this.world.bags.special.pick(24);
    return [0x40e, 0x453, 0x457, 0x957, 0x472, 0x482, 0x495, 0x4a8][r] || 0x3d7;
  };
  TO.launchPlain = function (s, p) {   // 0x41a3ea
    this.start(s);
    this.flags(0, 1, 0);
    this.sp.setCenter(p[0], p[1]);
    this.world.traffic.record(this);
  };
  TO.launchSpecial = function (s, p) { // 0x41a276
    var bg = this.world.bg, tr = this.world.traffic;
    this.start(s);
    this.flags(1, 0, 0);
    this.sp.setCenter(p[0], p[1]);
    if (s === 0x453) {
      this.start(0x429);
      var h = bg[3] - bg[1];
      this.sp.setCenter(bg[2] + 40, rnd(h > 200 ? h - 200 : 1) + bg[1] + 200);
      this.seq = 0x453;
    } else if (s === 0x457) {
      this.sp.setCenter(rnd(300) + ((bg[2] - bg[0]) / 2 | 0) - 150, bg[3] + 40);
    } else if (s === 0x957) {
      this.sp.setCenter(this.sp.cx + 20, this.sp.cy - 8);
    }
    tr.record(this);
    this.slot60 = tr.lastSlot;
    tr.markUsed(this.slot60);
  };
  TO.update = function () {
    if (this.state === 1) {
      var p = this.world.traffic.launch();
      if (!p) { return; }
      this.slot64 = this.world.traffic.lastSlot;
      this.type = this.chooseType();
      if (this.type === 3) {
        var s = this.special();
        if ([0x40e, 0x453, 0x457, 0x957, 0x472, 0x482, 0x495, 0x4a8].indexOf(s) >= 0) {
          this.launchSpecial(s, p);
        } else {
          this.launchPlain(0x3d7, p);
        }
      } else {
        this.launchPlain(this.type === 2 ? 0x5d : 3, p);
      }
      this.state = 2;
    } else if (this.state === 2) {
      if (this.sp.done) {
        if (this.offLeft() || this.offBottom()) { this.state = 3; return; }
        this.chooseNext();
      }
      this.sp.play();
      if (!this.f4c) { this.world.traffic.record(this); }
    }
  };
  TO.ok = function (s) {               // start s unless blocked, flags (a,b,0)
    return !this.blocked(s);
  };
  /* 0x4188cf */
  TO.chooseNext = function () {
    var w = this.world, si = false, s, obj, e;
    if (this.type === 3) {
      s = this.f48 ? this.seq : [0x3dc, 0x3f6, 0x3f1, 0x3fb][w.bags.trick3.pick(80)] || 0x3d7;
      switch (s) {
        case 0x3f1:
          if (this.f48) {
            if (rnd(10) === 0 && this.ok(0x3fb)) {
              this.start(0x3fb); this.seq = 0x3f6; this.flags(1, 1, 0); si = true;
            } else if (rnd(10) !== 0 && this.ok(0x3f1)) { this.start(0x3f1); this.flags(1, 1, 0); si = true; }
          } else if (!this.chainBlocked([0x3f1, 0x3f1, 0x3f1])) {
            this.startChain([0x3f1, 0x3f1, 0x3f1]); this.flags(1, 1, 0); si = true;
          }
          break;
        case 0x3f6:
          if (this.f48) {
            if (rnd(10) === 0 && this.ok(0x401)) { this.start(0x401); this.seq = 0x3f1; this.flags(1, 1, 0); si = true; }
            if (rnd(10) !== 0 && this.ok(0x3f6)) { this.start(0x3f6); this.flags(1, 1, 0); si = true; }
          } else if (!this.chainBlocked([0x3f6, 0x3f6, 0x3f6])) {
            this.startChain([0x3f6, 0x3f6, 0x3f6]); this.flags(1, 1, 0); si = true;
          }
          break;
        case 0x3fb: case 0x401:
          if (this.ok(0x3fb)) { this.startChain([0x3fb, 0x401]); this.flags(0, 1, 0); si = true; }
          break;
        case 0x3dc: case 0x3e5: case 0x3eb:
          if (this.f48) {
            e = [0x3dc, 0x3e5, 0x3eb][rnd(3)];
            if (rnd(5) !== 0 && this.ok(e)) { this.start(e); this.flags(1, 1, 0); si = true; }
          } else if (this.ok(0x3dc)) { this.start(0x3dc); this.flags(1, 1, 0); si = true; }
          break;
        case 0x472:
          if (this.f48 || (this.slot64 > w.traffic.top && w.traffic.slots - 2 > this.slot64)) {
            this.start(0x472); this.flags(1, 0, 0); si = true;
            break;
          }
          this.start(0x482); this.flags(1, 0, 0); si = true;
          break;
        case 0x482: case 0x495: case 0x4a8:
          this.start(s); this.flags(1, 0, 0); si = true;
          break;
        case 0x957:
          if (this.f48) { this.start(0x957); this.flags(1, 0, 0); si = true; break; }
          if (!w.g72) { this.start(0x957); this.flags(1, 0, 0); si = true; w.g72 = 1; break; }
          this.start(0x40e); this.flags(1, 0, 0); si = true;
          break;
        case 0x40e: case 0x453:
          this.start(s); this.flags(1, 0, 0); si = true;
          break;
        case 0x457:
          this.start(0x3d7); this.flags(1, 0, 0); si = true;
          break;
      }
      if (!si) {
        obj = this.blocked(0x3d7);
        if (!obj) { this.start(0x3d7); this.flags(0, 1, 0); } else { this.avoid(obj); }
      }
    } else if (this.type === 2) {
      if (this.f48) { s = this.seq; } else {
        var r2 = w.bags.trick2.pick(30);
        s = (r2 === 2 || r2 === 3) ? 0xe7 : (r2 === 5 || r2 === 6) ? 0xfc : (r2 >= 10 && r2 < 20) ? 0x27e : 0x5d;
      }
      if (s === 0xe7 || s === 0xfc) {
        if (this.ok(s)) { this.start(s); this.flags(0, 1, 0); si = true; }
      } else if (s === 0x27e) {
        if (this.f48) {
          if (rnd(10) !== 0 && !this.chainBlocked([0x27e, 0x283])) { this.start(0x27e); this.flags(1, 1, 0); }
          else { this.start(0x283); this.flags(0, 1, 0); }
          si = true;
        } else if (!this.chainBlocked([0x26e, 0x27e])) {
          this.start(0x26e); this.seq = 0x27e; this.flags(1, 1, 0); si = true;
        }
      }
      if (!si) {
        obj = this.blocked(0x5d);
        if (!obj) { this.start(0x5d); this.flags(0, 1, 0); } else { this.avoid(obj); }
      }
    } else {
      if (this.f48) { s = this.seq; } else {
        var r1 = w.bags.trick1.pick(35);
        s = r1 === 1 ? 0x85 : r1 === 2 ? 0xac : r1 === 3 ? 0xd1 : (r1 >= 10 && r1 < 20) ? 0x21 : (r1 >= 20 && r1 < 30) ? 0x25a : 3;
      }
      if (s === 0x85 || s === 0xac || s === 0xd1) {
        if (this.ok(s)) { this.start(s); this.flags(0, 1, 0); si = true; }
      } else if (s === 0x21) {
        if (this.f48) {
          if (rnd(10) !== 0 && !this.chainBlocked([0x21, 0x30])) { this.start(0x21); } else { this.start(0x30); }
          this.flags(1, 1, 0); si = true;
        } else if (!this.chainBlocked([0x12, 0x30])) {
          this.start(0x12); this.seq = 0x21; this.flags(1, 1, 0); si = true;
        }
      } else if (s === 0x25a) {
        if (this.f48) {
          if (rnd(10) !== 0 && !this.chainBlocked([0x25a, 0x25f])) { this.start(0x25a); this.flags(1, 1, 0); }
          else { this.start(0x25f); this.flags(0, 1, 0); }
          si = true;
        } else if (!this.chainBlocked([0x24a, 0x25f])) {
          this.start(0x24a); this.seq = 0x25a; this.flags(1, 1, 0); si = true;
        }
      }
      if (!si) {
        obj = this.blocked(3);
        if (!obj) { this.start(3); this.flags(0, 1, 0); this.loops6c += 1; } else { this.avoid(obj); }
      }
    }
  };
  /* 0x419f5e: which way round the other one is, as the module's sector bits. */
  TO.sectors = function (o) {
    var a = this.center(), b = o.center(), dx = b[0] - a[0], dy = a[1] - b[1], th, bits = 0;
    var PI = 3.14159265359, TWO = 2 * PI;
    if (dx === 0 && dy === 0) { return 0; }
    if (dx === 0) { th = dy > 0 ? PI * 0.5 : PI * 1.5; }
    else if (dy === 0) { th = dx > 0 ? 0 : PI; }
    else if (dx > 0 && dy > 0) { th = Math.atan(dy / dx); }
    else if (dx > 0) { th = TWO - Math.atan(-dy / dx); }
    else if (dy > 0) { th = PI - Math.atan(dy / -dx); }
    else { th = PI + Math.atan(-dy / -dx); }
    th -= PI + 0.3805063771124;
    while (th < 0) { th += TWO; }
    while (th >= TWO) { th -= TWO; }
    if ((th >= 0 && th < PI * 0.5) || !(th < PI * 1.5 || th > TWO)) {
      bits |= 1;
      if (th >= 0 && th < PI) { bits |= 4; bits |= th < PI * 0.25 ? 0x10 : 0x20; }
      else { bits |= 8; bits |= (th >= PI * 1.75 && th <= TWO) ? 0x800 : 0x400; }
    } else {
      bits |= 2;
      if (th >= 0 && th < PI) { bits |= 4; bits |= (th >= PI * 0.75 && th < PI) ? 0x80 : 0x40; }
      else { bits |= 8; bits |= (th >= PI && th < PI * 1.25) ? 0x100 : 0x200; }
    }
    return bits;
  };
  /* 0x41948a: swerve, stall or brake round whoever is in the way. */
  TO.avoid = function (o) {
    var d = this.sectors(o), other = o.plain(), self = this;
    function tryS(s) {
      if (self.blocked(s)) { return false; }
      self.start(s); self.flags(0, 1, 0);
      return true;
    }
    if (this.type === 3) {
      if (d & 1 && !this.blocked(0x3f1)) { this.start(0x3f1); this.flags(1, 1, 0); return; }
      if (d & 1 && !this.blocked(0x3f6)) { this.start(0x3f6); this.flags(1, 1, 0); return; }
      this.seq = 0x3d7; this.flags(0, 1, 0); this.start(0x3d7);
      return;
    }
    if (this.type === 2) {
      if (d & 1 || other) {
        if (d & 4) { if (tryS(0xfc) || tryS(0xe7)) { return; } }
        else if (tryS(0xe7) || tryS(0xfc)) { return; }
      }
      if (d & 1) {
        if (this.seq === 0x73 || this.seq === 0x69) { this.seq = 0x73; this.type = 1; } else { this.seq = 0x69; }
      } else if (other) { this.seq = 0x5d; }
      this.sp.nextSequence(this.seq);
      return;
    }
    if ((d & 1 || other) && tryS(0x85)) { return; }
    if ((d & 1 || other) && tryS(0xac)) { return; }
    if ((d & 1 || other) && tryS(0xd1)) { return; }
    if (d & 1) { this.seq = (this.seq === 0x73 || this.seq === 0x69) ? 0x73 : 0x69; }
    else if (other) { this.seq = 3; }
    this.sp.nextSequence(this.seq);
  };
  TO.finish = function () {
    this.state = 3;
    if (this.slot60 !== -1) { this.world.traffic.clearUsed(this.slot60); }
    if (this.seq === 0x957) { this.world.g72 = 0; }
    this.hideAll();
  };

  /* ---- FlyingFood and FlyingBabyFood */

  function Food(world, baby) {
    Flying.call(this, world, baby ? 'babyfood' : 'food');
    this.baby = baby; this.seq = 0; this.slot = 0;
    this.sp.nextSequence(0);
  }
  Food.prototype = Object.create(FP);
  Food.prototype.choose = function () {
    var b = this.world.bags;
    if (this.baby) { return [0xcca, 0xccf, 0xcd6, 0xcdb, 0xce0][b.babyfood.pick(6)] || 0xce5; }
    return [0xbdf, 0xbd0, 0xbcb, 0xbba, 0xbb5, 0xba3, 0xb99][b.food.pick(9)] || 0xb9e;
  };
  Food.prototype.update = function () {
    var tr = this.world.traffic;
    if (this.state === 1) {
      var p = tr.launch();
      if (!p) { return; }
      this.seq = this.choose();
      this.sp.setCenter(p[0], p[1]);
      tr.record(this);
      this.slot = tr.lastSlot;
      tr.markUsed(this.slot);
      this.state = 2;
    } else if (this.state === 2) {
      if (this.sp.done) {
        if (this.offLeft() || this.offBottom()) { this.state = 3; return; }
        this.sp.nextSequence(this.seq);
      }
      this.sp.play();
      tr.record(this);
    }
  };
  Food.prototype.finish = function () { this.state = 3; this.world.traffic.clearUsed(this.slot); this.hideAll(); };

  /* ---- FlyingCloud and FlyingBabyCloud */

  function Cloud(world, baby) {
    Flying.call(this, world, baby ? 'babycloud' : 'cloud');
    this.baby = baby; this.seq = 0; this.k = 0;
    this.sp.nextSequence(0);
  }
  Cloud.prototype = Object.create(FP);
  Cloud.prototype.choose = function () {
    var b = this.world.bags, w = this.world;
    if (this.baby) {
      var r = b.babycloud.pick(10);
      if (r === 4 && !w.moon) { w.moon = 1; return 0xca7; }
      if ((r === 4 || r === 5) && !w.moon) { w.moon = 1; return 0xcac; }
      return [0xc7f, 0xc84, 0xc89, 0xc8e, 0xcb1, 0xcb1, 0xcb1, 0xcb6, 0xcbb, 0xcc0][r] || 0xcc5;
    }
    var row = b.cloud.pick(4);
    var col = b['cloud' + Math.min(row, 4)].pick(4);
    return [0xc2a, 0xc02, 0xc16, 0xbee, 0xc2f, 0xc07, 0xc1b, 0xbf3, 0xc34, 0xc0c, 0xc20, 0xbf8, 0xc39, 0xc11, 0xc25][row * 4 + col] || 0xbfd;
  };
  Cloud.prototype.startPoint = function () {   // 0x41813b
    var bg = this.world.bg, cols = (bg[2] - bg[0]) / 100 | 0, rows = (bg[3] - bg[1]) / 100 | 0;
    var k = this.world.bags.cloudstart.pick(rows + cols + 1);
    this.k = k;
    return rows > k ? [-50, k * 100 + 50] : [(k - cols) * 100 - 50, -50];
  };
  Cloud.prototype.update = function () {
    var w = this.world;
    if (this.state === 1) {
      var p = this.startPoint(), t = w.cloudTimes, now = w.now, k = this.k;
      function free(i) { return !(i in t) || now > t[i] + 20000; }
      if (free(k - 1) && free(k) && free(k + 1)) {
        t[k] = now;
        this.seq = this.choose();
        this.sp.setCenter(p[0], p[1]);
        this.state = 2;
      }
    } else if (this.state === 2) {
      if (this.sp.done) {
        if (this.offRight() || this.offBottom()) { this.state = 3; return; }
        this.sp.nextSequence(this.seq);
      }
      this.sp.play();
    }
  };
  Cloud.prototype.finish = function () {
    this.state = 3;
    if (this.seq === 0xca7 || this.seq === 0xcac) { this.world.moon = 0; }
    this.hideAll();
  };

  /* ---- FlyingIntro: the history of toaster flight */

  function Intro(world) {
    Flying.call(this, world, 'intro');
    this.f34 = 0;
    this.sp.nextSequence(0);
  }
  Intro.prototype = Object.create(FP);
  Intro.prototype.update = function () {
    var bg = this.world.bg;
    if (this.state === 1) {
      this.sp.nextSequence(0xc3d);
      this.sp.setCenter((bg[2] - bg[0]) / 2 | 0, (bg[3] - bg[1]) / 2 | 0);
      this.f34 = 0;
      this.state = 2;
    } else if (this.state === 2) {
      if (this.sp.done) {
        if (this.f34 === 0) { this.sp.nextSequences([0x73, 0x7a]); this.f34 = 1; }
        else if (this.offLeft() || this.offBottom()) { this.state = 3; return; }
        else { this.sp.nextSequence(0x5d); }
      }
      this.sp.play();
    }
  };
  Intro.prototype.finish = function () { this.state = 3; this.hideAll(); };

  /* ---- FlyingBigGag */

  var SMALL = [0x6f6, 0x788, 0x318, 0x327, 0x2ed, 0x35d, 0x112, 0x127, 0x138, 0x149, 0x22e, 0x1c8];
  var MEDIUM = [0x957, 0x966, 0x4bd, 0x4cb, 0x508, 0x292, 0x3a0, 0x551, 0x55c, 0x8bf, 0x56b, 0x8e0, 0x8fa];
  var BIG = [0x975, 0x99a, 0xab0, 0xb5e, 0x57a, 0x688, 0x820, 0x2a7, 0x545, 0x36f];
  /* 0x415bf1: weight, slots needed, offset, [first slot, range], delay. */
  function gagParams(g, tr) {
    var top = tr.top, n = tr.slots, P = {
      0x6f6: [2, 3, 0], 0x788: [2, 2, 1], 0x318: [2, 2, 1], 0x327: [2, 2, 1],
      0x2ed: [1, 2, 1, 2, n - 4], 0x35d: [1, 1, 0, 2, n - 4], 0x112: [1, 3, 2, top + 1, n - top - 3],
      0x127: [1, 2, 1, top - 1, n - top], 0x138: [1, 2, 0, 2, n - top - 3], 0x149: [1, 2, 1, top, n - top - 3],
      0x22e: [1, 3, 0, 0, n - 2], 0x1c8: [1, 3, 2, top + 1, n - top - 3], 0x17c: [1, 2, 0, 1, n - 3],
      0x957: [2, 1, 0, null, null, 1000], 0x966: [2, 1, 0, null, null, 1000],
      0x975: [4, 4, 1, null, null, 1000], 0x99a: [4, 4, 1, null, null, 1000],
      0x57a: [2, 3, 0, top, n - top - 4, 1000], 0x688: [2, 5, 0, 2, n - 8, 1000],
      0x820: [2, 4, 1, null, null, 1000], 0x2a7: [1, 3, 2, null, null, 1000],
      0x36f: [2, 3, 2, null, null, 1000], 0x3b2: [2, 3, 2, null, null, 1000],
      0x545: [2, 3, 0, top, n - top - 4, 1000], 0x292: [1, 3, 1], 0x3a0: [1, 2, 1],
      0x551: [1, 3, 1], 0x55c: [1, 2, 1], 0x8bf: [2, 3, 2, null, null, 4000],
      0x4bd: [1, 1, 0], 0x4cb: [1, 1, 0], 0x56b: [1, 3, 1, null, null, 4000], 0x508: [1, 3, 1]
    }[g] || [1, 5, 2];
    var start = P[3] === undefined || P[3] === null ? top : P[3];
    var range = P[4] === undefined || P[4] === null ? n - top - 4 : P[4];
    if (n - 1 < start) { start = n - 1; }
    if (start + range > n) { range = n - start; }
    if (start < 0) { start = 0; }
    if (range < 1) { range = 1; }
    return { weight: P[0], count: P[1], offset: P[2], start: start, range: range, delay: P[5] || 0 };
  }

  function Assoc(owner) { this.owner = owner; this.pt = [BAD, BAD]; this.kind = 'assoc'; }
  Assoc.prototype.center = function () { return this.pt; };
  Assoc.prototype.rect = function () { return [this.pt[0] - 35, this.pt[1] - 35, this.pt[0] + 35, this.pt[1] + 35]; };
  Assoc.prototype.plain = function () { return true; };

  function Gag(world) {
    Flying.call(this, world, 'gag');
    this.s40 = new Sprite(world.flight);
    this.s44 = new Sprite(world.flight);
    this.s48 = new Sprite(world.flight);
    this.assoc = [new Assoc(this), new Assoc(this), new Assoc(this)];
    var self = this;
    this.assoc.forEach(function (a) { world.traffic.add(a); });
    [this.sp, this.s40, this.s44, this.s48].forEach(function (s) { s.nextSequence(0); });
    this.f = {};
    this.start = [BAD, BAD];
    this.f34 = 0; this.f38 = 0; this.f58 = 0; this.f5c = 0; this.f60 = 0;
    this.fb0 = 1; this.f8c = 0;
    this.g = self.choose();
    var p = gagParams(this.g, world.traffic);
    this.p = p;
    this.weight = p.weight;
  }
  Gag.prototype = Object.create(FP);
  var GP = Gag.prototype;
  GP.sprites = function () { return [this.sp, this.s40, this.s44, this.s48]; };
  GP.choose = function () {            // 0x410c24
    var w = this.world, now = w.now, r = w.bags.tier.pick(3);
    if (r === 0 && now > w.lastBig + 15000) {
      w.lastBig = now;
      return BIG[w.bags.big.pick(11)] || 0x3b2;
    }
    if (r <= 1 && now > w.lastMed + 6000) {
      w.lastMed = now;
      return MEDIUM[w.bags.medium.pick(14)] || 0x92d;
    }
    return SMALL[w.bags.small.pick(13)] || 0x17c;
  };
  GP.update = function () {
    var tr = this.world.traffic, f = this.f, sp = this.sp;
    if (this.state === 1) {
      var p = tr.launchGroup(this.p.count, this.p.offset, this.p.start, this.p.range);
      if (!p) { return; }
      this.start = p;
      sp.setCenter(p[0], p[1]);
      f[0x70] = 1;
      tr.record(this);
      this.t64 = this.world.now;
      this.f8c = 1;
      this.slot98 = tr.lastSlot;
      this.state = 2;
      return;
    }
    if (this.state !== 2) { return; }
    if (f[0x68] && sp.done && f[0x6a] && this.s40.done && f[0x6c] && this.s44.done && f[0x6e] && this.s48.done) {
      var self = this;
      this.assoc.forEach(function (a) { a.pt = [BAD, BAD]; tr.hide(a); });
      self.state = 3;
      return;
    }
    if ((f[0x70] && sp.done) || (f[0x72] && this.s40.done) || (f[0x74] && this.s44.done) || (f[0x76] && this.s48.done)) {
      this.script(this.f8c ? this.g : 0);
      this.f8c = 0;
    }
    if (this.world.now < this.t64 + this.p.delay) { return; }
    sp.play(); this.s40.play(); this.s44.play(); this.s48.play();
    tr.record(this);
    var chans = [this.f58, this.f5c, this.f60], extra = [this.s40, this.s44, this.s48];
    for (var i = 0; i < 3; i += 1) {
      this.assoc[i].pt = chans[i] ? ctr(sp.channelRect(chans[i])) : [extra[i].cx, extra[i].cy];
      tr.record(this.assoc[i]);
    }
  };
  GP.finish = function () {
    this.state = 3;
    var tr = this.world.traffic;
    for (var i = 0; i < this.p.count; i += 1) { tr.clearUsed(this.slot98 - this.p.offset + i); }
    this.assoc.forEach(function (a) { tr.remove(a); });
    [this.s40, this.s44, this.s48, this.sp].forEach(function (s) { s.nextSequence(0); s.vis = false; });
  };

  /* Helpers for the script, each a pattern the module repeats. */
  GP.exit = function (s, seq) { s.nextSequence(seq); var n = s.countLoopsOutOfView(this.world.bg); s.loops = n; if (n > 0) { s.done = 0; } };
  GP.setLoops = function (s, n) { s.loops = n; if (n > 0) { s.done = 0; } };
  GP.alignAt = function (ch, pt) { var r = onPoint(this.sp.channelRect(ch), pt); this.sp.alignChannel(ch, r); };
  GP.flyIn = function (s, pt, n) {     // SetCenterPoint then RollBackFrames(n)
    s.setCenter(pt[0], pt[1]);
    if (n === undefined) { n = s.countFramesBack(this.world.bg, 0); }
    s.rollBack(n, 0);
    return n;
  };
  GP.mark = function (keys, v) { var f = this.f; keys.forEach(function (k) { f[k] = v; }); };

  /* 0x410efe / 0x412719 / 0x414cd7: the gags. */
  GP.script = function (arg) {
    var g = arg || (this.f38 ? this.f34 : this.choose());
    var f = this.f, s = this.sp, a = this.s40, b = this.s44, c = this.s48, bg = this.world.bg;
    var P, P2, n, r1, r2, r3, r4, v, list, x, k;
    var CHAIN = {
      0x112: [0x5d, 0x26e, 0x112, 0x283, 0x5d, 0x5d], 0x22e: [0x5d, 0x26e, 0x22e, 0x283, 0x5d]
    };
    var EXIT = { 0x112: 0x5d, 0x127: 0x133, 0x138: 0x144, 0x149: 0x153, 0x22e: 0x5d, 0x1c8: 0x5d, 0x17c: 0x5d, 0x2ed: 3, 0x35d: 0x35d };
    var K = { 0x127: 4, 0x138: 1, 0x149: 3 };
    var self = this;

    function chainGag(list, firstSeq, extra, randomLoops) {
      s.nextSequences(list);
      P = s.predict(0);
      s.nextSequence(firstSeq);
      s.setCenter(P[0], P[1]);
      n = s.countLoopsOutOfView(bg) - extra;
      if (n < 0) { n = 0; }
      s.nextSequences(list);
      s.setCenter(self.start[0], self.start[1]);
      self.setLoops(s, randomLoops ? rnd(n + 1) + extra : n);
      self.mark([0x70, 0x78, 0x6a, 0x6c, 0x6e], 1);
      self.f34 = g; self.f38 = 1;
    }
    function meet(gagSeq, loopsN, alignCh) {   // fly a toaster to a spot, swap it for gagSeq there
      s.nextSequence(3);
      self.setLoops(s, loopsN);
      P = s.predict(0);
      s.nextSequence(gagSeq);
      self.alignAt(alignCh, P);
    }

    switch (g) {
      /* ---- small */
      case 0x6f6: case 0x788:
        if (!this.f38) {
          meet(g, rnd(7) + 1, 2);
          r1 = s.channelRect(1); r2 = s.channelRect(2);
          s.nextSequence(0); f[0x70] = 0;
          b.nextSequence(3); n = this.flyIn(b, ctr(r2)); f[0x74] = 1; f[0x7c] = 1;
          a.nextSequence(0x5d); this.flyIn(a, ctr(r1), n); f[0x72] = 1; f[0x7a] = 1;
          this.f34 = g; this.f38 = 1; f[0x68] = 1; f[0x6e] = 1;
        } else {
          if (f[0x7a] && a.done) { a.nextSequence(g === 0x6f6 ? 0x6fa : 0x78d); f[0x7a] = 0; }
          if (f[0x7c] && b.done) { b.nextSequence(g === 0x6f6 ? 0x73c : 0x7d4); f[0x7c] = 0; }
          if (!f[0x7a] && a.done) { this.exit(a, 0x5d); f[0x72] = 0; f[0x6a] = 1; }
          if (!f[0x7c] && b.done) { this.exit(b, 3); f[0x74] = 0; f[0x6c] = 1; }
        }
        break;
      case 0x318:
        if (!this.f38) {
          meet(0x318, rnd(6) + 1, 1);
          r1 = s.channelRect(1); r2 = s.channelRect(2);
          s.nextSequence(0); f[0x70] = 0;
          a.nextSequence(3); n = this.flyIn(a, ctr(r1)); f[0x72] = 1; f[0x7a] = 1;
          b.nextSequence(0xb99); this.flyIn(b, ctr(r2), n);
          this.f34 = 0x318; this.f38 = 1; f[0x68] = 1; f[0x6e] = 1;
        } else {
          if (f[0x7a] && a.done) { a.merge(b, 0x318); f[0x7a] = 0; f[0x6c] = 1; }
          if (!f[0x7a] && a.done) { this.exit(a, 3); f[0x72] = 0; f[0x6a] = 1; }
        }
        break;
      case 0x327:
        if (!this.f38) {
          s.nextSequence(3); this.setLoops(s, rnd(9) + 3);
          P = s.predict(0);
          s.nextSequences([3, 0x327]);
          this.flyIn(s, P);
          f[0x70] = 1; f[0x78] = 1; this.f34 = 0x327; this.f38 = 1; f[0x6c] = 1; f[0x6e] = 1;
        } else if (f[0x78] && s.done) {
          s.split(a, 0x5d, 0xb9e);
          this.setLoops(s, s.countLoopsOutOfView(bg));
          f[0x70] = 0; f[0x78] = 0; f[0x68] = 1;
          this.setLoops(a, a.countLoopsOutOfView(bg));
          f[0x6a] = 1;
        }
        break;
      case 0x112: case 0x22e: case 0x1c8: case 0x17c: case 0x2ed: case 0x35d:
      case 0x127: case 0x138: case 0x149:
        if (f[0x78]) { this.exit(s, EXIT[g]); f[0x68] = 1; break; }
        if (K[g]) {
          s.nextSequence(0x5d); this.setLoops(s, K[g]);
          P = s.predict(0);
          s.nextSequence(0x5d); s.setCenter(P[0], P[1]);
          n = Math.max(0, s.countLoopsOutOfView(bg));
          s.nextSequences([0x5d, 0x26e, g]);
          s.setCenter(this.start[0], this.start[1]);
          this.setLoops(s, rnd(n + 1));
          this.mark([0x70, 0x78, 0x6a, 0x6c, 0x6e], 1);
          this.f34 = g; this.f38 = 1;
        } else if (g === 0x1c8 || g === 0x17c) {
          v = rnd(3);
          list = g === 0x1c8 ? [0x5d, 0x26e, 0x1a8] : [0x5d, 0x26e, 0x158];
          for (k = 0; k < v; k += 1) { list.push(g); }
          list = list.concat(g === 0x1c8 ? [0x1e3, 0x283, 0x5d] : [0x18b, 0x283]);
          chainGag(list, 0x5d, 0, g === 0x1c8);
        } else if (g === 0x2ed) {
          x = this.slot98 < this.world.traffic.top ? 2 : 0;
          chainGag([3, 0x2ed, 3, 3], 3, x, true);
        } else if (g === 0x35d) {
          chainGag([3, 0x34e, 0x35d, 0x35d], 3, 2, true);
        } else {
          chainGag(CHAIN[g], 0x5d, 0, true);
        }
        break;

      /* ---- big */
      case 0x975:
        if (this.f38) { this.exit(s, 0x975); f[0x70] = 0; this.mark([0x68, 0x6a, 0x6c, 0x6e], 1); }
        else {
          s.nextSequence(0x975); this.alignAt(7, this.start); this.setLoops(s, 3);
          f[0x70] = 1; this.f34 = 0x975; this.f38 = 1; this.f58 = 7; this.f5c = 4; this.f60 = 1;
        }
        break;
      case 0x99a:
        if (this.f38) {
          [[s, 0x70, 0x68], [a, 0x72, 0x6a], [b, 0x74, 0x6c], [c, 0x76, 0x6e]].forEach(function (e) {
            if (f[e[1]] && e[0].done) { self.exit(e[0], 0x5d); f[e[2]] = 1; f[e[1]] = 0; }
          });
        } else {
          this.start = [this.start[0] - 50, this.start[1] + 20];
          s.nextSequence(0x99a); this.alignAt(4, this.start);
          r1 = s.channelRect(1); r2 = s.channelRect(2); r3 = s.channelRect(3); r4 = s.channelRect(4);
          s.nextSequence(0x9a9); P = ctr(r1); s.setCenter(P[0], P[1]); f[0x70] = 1;
          a.nextSequence(0x9f4); P = ctr(r2); a.setCenter(P[0], P[1]); f[0x72] = 1;
          b.nextSequence(0xa33); P = ctr(r3); b.setCenter(P[0], P[1]); f[0x74] = 1;
          c.nextSequence(0xa72); P = ctr(r4); c.setCenter(P[0], P[1]); f[0x76] = 1;
          this.f34 = 0x99a; this.f38 = 1;
        }
        break;
      case 0xab0:
        if (this.f38) {
          if (f[0x70] && s.done) { this.exit(s, 0x133); f[0x68] = 1; f[0x70] = 0; }
          if (f[0x72] && a.done) { this.exit(a, 0x27e); f[0x6a] = 1; f[0x72] = 0; }
          if (f[0x74] && b.done) { this.exit(b, 0x144); f[0x6c] = 1; f[0x74] = 0; }
          f[0x6e] = 1;
        } else {
          s.nextSequence(0xab0);
          r1 = s.channelRect(1); r2 = s.channelRect(2); r3 = s.channelRect(3);
          s.nextSequences([0x5d, 0x5d, 0x5d, 0x26e, 0x127]); P = ctr(r1); s.setCenter(P[0], P[1]); f[0x70] = 1;
          a.nextSequences([0x5d, 0x5d, 0x5d, 0x26e]); P = ctr(r2); a.setCenter(P[0], P[1]); f[0x72] = 1;
          b.nextSequences([0x5d, 0x5d, 0x5d, 0x26e, 0x138]); P = ctr(r3); b.setCenter(P[0], P[1]); f[0x74] = 1;
          f[0x76] = 0; this.f34 = 0xab0; this.f38 = 1;
        }
        break;
      case 0xb5e:
        if (this.f38) { this.exit(s, 0xb94); f[0x70] = 0; this.mark([0x68, 0x6a, 0x6c, 0x6e], 1); }
        else { s.nextSequence(0xb5e); f[0x70] = 1; this.f34 = 0xb5e; this.f38 = 1; this.f58 = 1; this.f5c = 2; this.f60 = 3; }
        break;
      case 0x57a: case 0x820:
        if (!this.f38) {
          meet(g, g === 0x57a ? rnd(2) + 1 : rnd(6) + 1, g === 0x57a ? 2 : 1);
          if (g === 0x57a) { r1 = s.channelRect(2); r2 = s.channelRect(1); } else { r1 = s.channelRect(1); r2 = s.channelRect(3); }
          s.nextSequence(0); f[0x70] = 0;
          a.nextSequence(3); n = this.flyIn(a, ctr(r1)); f[0x72] = 1; f[0x7a] = 1;
          b.nextSequence(0x5d); this.flyIn(b, ctr(r2), n); f[0x74] = 1; f[0x7c] = 1;
          this.f34 = g; this.f38 = 1; f[0x68] = 1; f[0x6e] = 1;
        } else {
          if (f[0x7a] && a.done) { a.nextSequence(g === 0x57a ? 0x604 : 0x824); f[0x7a] = 0; }
          if (f[0x7c] && b.done) { b.nextSequence(g === 0x57a ? 0x57f : 0x87e); f[0x7c] = 0; }
          if (!f[0x7a] && a.done) { this.exit(a, 3); f[0x72] = 0; f[0x6a] = 1; }
          if (!f[0x7c] && b.done) { this.exit(b, 0x5d); f[0x74] = 0; f[0x6c] = 1; }
        }
        break;
      case 0x688:
        if (!this.f38) {
          meet(0x688, rnd(4) + 1, 2);
          this.flyIn(s, [s.cx, s.cy]);
          f[0x70] = 1; f[0x78] = 1; this.f34 = 0x688; this.f38 = 1; f[0x6c] = 1; f[0x6e] = 1;
        } else {
          if (f[0x78] && s.done) { s.split(a, 0x696, 0x6c6); f[0x78] = 0; f[0x72] = 1; f[0x7a] = 1; }
          if (!f[0x78] && s.done) { this.exit(s, 3); f[0x70] = 0; f[0x68] = 1; }
          if (f[0x7a] && a.done) { this.exit(a, 3); f[0x72] = 0; f[0x7a] = 0; f[0x6a] = 1; }
        }
        break;
      case 0x2a7:
        if (!this.f38) {
          meet(0x2a7, rnd(6) + 3, 2);
          r1 = s.channelRect(1); r3 = s.channelRect(3);
          s.nextSequence(0); f[0x70] = 0;
          b.nextSequence(3); n = this.flyIn(b, ctr(r3)); f[0x74] = 1; f[0x7c] = 1;
          a.nextSequence(0x2a3); this.flyIn(a, ctr(r1), n); f[0x72] = 1; f[0x7a] = 1;
          this.f34 = 0x2a7; this.f38 = 1; f[0x68] = 1; f[0x6e] = 1;
        } else {
          if (f[0x7a] && a.done) { this.exit(a, 0x2a3); f[0x72] = 0; f[0x7a] = 0; f[0x6a] = 1; }
          if (f[0x7c] && b.done) {
            b.nextSequences([[0x2ab, 0x2d0], [0x2ab, 0x2d0, 0x2d0], [0x2ab, 0x2d0, 0x2c3, 0x2c3, 0x2d0]][rnd(3)]);
            f[0x7c] = 0;
          }
          if (!f[0x7c] && b.done) { this.exit(b, 0x2c3); f[0x74] = 0; f[0x6c] = 1; }
        }
        break;
      case 0x36f: case 0x3b2:
        if (!this.f38) {
          v = rnd(3);
          meet(g === 0x36f ? 0x36b : 0x3ae, rnd(7) + 3, 1);
          r1 = s.channelRect(1); r2 = s.channelRect(2);
          s.nextSequence(3); P = ctr(r2); s.setCenter(P[0], P[1]); this.setLoops(s, 5);
          P2 = s.predict(0);
          s.nextSequence(0); f[0x70] = 0;
          /* The module stores a stack address here when P2 is off the left edge. */
          if (P2[0] <= bg[0]) { P2 = ctr(r2); }
          this.p2 = P2;
          if (g === 0x36f) {
            list = [3, 0x34e, 0x35d];
            for (k = 0; k < v; k += 1) { list.push(0x35d); }
            a.nextSequences(list);
          } else {
            a.nextSequence(3);
          }
          n = this.flyIn(a, ctr(r1)); f[0x72] = 1; f[0x7a] = 1;
          b.nextSequence(0x5d); this.flyIn(b, ctr(r2), n); f[0x74] = 1; f[0x7c] = 1;
          this.f34 = g; this.f38 = 1; f[0x68] = 1;
        } else {
          if (f[0x72] && f[0x7a] && a.done) { a.nextSequence(g); f[0x7a] = 0; }
          if (f[0x74] && f[0x7c] && b.done) { b.nextSequence(0x208); f[0x7c] = 0; }
          if (f[0x72] && !f[0x7a] && a.done) { this.exit(a, g === 0x36f ? 0x391 : 3); f[0x72] = 0; f[0x6a] = 1; }
          if (f[0x74] && !f[0x7c] && b.done) { this.exit(b, 0x21a); f[0x74] = 0; f[0x6c] = 1; }
          if (!f[0x76] && f[0x6c] && c.done) {
            c.nextSequences([0x21a, 0x21f]);
            this.flyIn(c, this.p2);
            f[0x76] = 1; f[0x7e] = 1;
          }
          if (f[0x76] && f[0x7e] && c.done) { this.exit(c, 3); f[0x76] = 0; f[0x7e] = 0; f[0x6e] = 1; }
        }
        break;
      case 0x545:
        if (!this.f38) {
          s.nextSequences([0x2a3]);
          f[0x70] = 1; f[0x78] = 1; this.f34 = 0x545; this.f38 = 1; f[0x6c] = 1; f[0x6e] = 1;
          break;
        }
        if (f[0x70] && s.done) {
          if (hit(this.rect(), bg)) {
            s.nextSequences([0x2a3]);
            this.world.count545 += 1;
            if (this.world.count545 - 1 > 0) { f[0x72] = 1; }
          } else { f[0x70] = 0; f[0x78] = 0; f[0x68] = 1; f[0x72] = 1; }
        }
        if (f[0x72] && a.done) {
          if (f[0x7a]) { this.exit(a, 0x545); f[0x72] = 0; f[0x7a] = 0; f[0x6a] = 1; }
          else {
            a.nextSequence(0x545); a.setCenter(this.start[0], this.start[1]); this.setLoops(a, 2);
            f[0x72] = 1; f[0x7a] = 1;
          }
        }
        break;

      /* ---- medium */
      case 0x957:
        if (this.f38) { this.exit(s, 0x957); this.mark([0x68, 0x6a, 0x6c, 0x6e], 1); this.mark([0x70, 0x72, 0x74, 0x76], 0); }
        else {
          s.nextSequence(0x957); this.alignAt(1, this.start); this.setLoops(s, 3);
          this.f34 = 0x957; this.f38 = 1; f[0x70] = 1; this.f58 = 1; this.f5c = 2; this.f60 = 4;
        }
        break;
      case 0x966:
        if (f[0x72]) { this.exit(a, 0x3d7); f[0x6a] = 1; f[0x72] = 0; }
        else if (this.f38) {
          r4 = s.channelRect(4);
          this.exit(s, 0x966); f[0x70] = 0; this.mark([0x68, 0x6c, 0x6e], 1);
          a.nextSequences([0x3dc, 0x3dc, 0x3dc, 0x3e5, 0x3e5, 0x3eb, 0x3eb, 0x3eb, 0x3f1]);
          P = ctr(r4); a.setCenter(P[0], P[1]); f[0x72] = 1;
        } else {
          s.nextSequence(0x957); this.alignAt(1, this.start); this.setLoops(s, 6);
          this.f34 = 0x966; this.f38 = 1; f[0x70] = 1; this.f58 = 0; this.f5c = 1; this.f60 = 3;
        }
        break;
      case 0x4cb: case 0x292: case 0x4bd: case 0x551: case 0x55c: case 0x3a0: case 0x8bf: case 0x56b:
        if (f[0x78]) { this.exit(s, g); f[0x70] = 0; f[0x78] = 0; f[0x68] = 1; break; }
        s.nextSequence(g);
        if (g === 0x3a0) { this.alignAt(1, this.start); }
        if (g === 0x8bf || g === 0x56b) { this.alignAt(2, this.start); }
        if (g === 0x56b) { s.nextSequence(g); }
        this.setLoops(s, 2);
        f[0x70] = 1; f[0x78] = 1; this.f34 = g; this.f38 = 1; this.mark([0x6a, 0x6c, 0x6e], 1);
        break;
      case 0x508: {
        var w = this.world;
        if (w.cage === 0) {
          if (this.f38) {
            if (f[0x78] && s.done) { s.nextSequence(0x4d1); f[0x78] = 0; }
            if (!f[0x78] && s.done) { this.exit(s, 0x508); f[0x70] = 0; f[0x68] = 1; w.cage = 1; }
          } else {
            s.nextSequence(3); this.setLoops(s, rnd(4) + 2);
            f[0x70] = 1; f[0x78] = 1; this.f34 = 0x508; this.f38 = 1; this.mark([0x6a, 0x6c, 0x6e], 1);
          }
        } else if (w.cage === 1) {
          if (this.f38) { this.exit(s, 0x508); f[0x70] = 0; f[0x68] = 1; w.cage = 2; }
          else {
            s.nextSequence(0x508); this.setLoops(s, 2);
            f[0x70] = 1; f[0x78] = 1; this.f34 = 0x508; this.f38 = 1; this.mark([0x6a, 0x6c, 0x6e], 1);
          }
        } else if (w.cage === 2) {
          if (this.f38) {
            if (f[0x78] && s.done) { s.nextSequence(0x517); f[0x78] = 0; }
            if (!f[0x78] && s.done) { this.exit(s, 3); f[0x70] = 0; f[0x68] = 1; w.cage = 0; }
          } else {
            s.nextSequence(0x508); this.setLoops(s, rnd(6) + 2);
            f[0x70] = 1; f[0x78] = 1; this.f34 = 0x508; this.f38 = 1; this.mark([0x6a, 0x6c, 0x6e], 1);
          }
        }
        break;
      }
      case 0x8e0: case 0x8fa:
      default:
        if (g !== 0x8e0 && g !== 0x8fa) { g = 0x92d; }
        if (this.f38) {
          if (this.fb0) {
            if (g === 0x92d) {
              s.nextSequences(rnd(2) ? [0x911, 0x92d, 0x92d, 0x93c] : [0x911, 0x92d, 0x93c]);
            } else {
              s.nextSequence(g); this.setLoops(s, g === 0x8e0 ? rnd(3) : 0);
            }
            this.fb0 = 0;
          } else {
            this.exit(s, 0x8d1); this.f34 = g;
            this.mark([0x68, 0x6a, 0x6c, 0x6e], 1); this.mark([0x70, 0x72, 0x74, 0x76], 0);
          }
        } else {
          s.nextSequence(0x8d1); this.alignAt(1, this.start); this.setLoops(s, rnd(6) + 2);
          this.f34 = g; this.f38 = 1; f[0x70] = 1; this.f58 = 1; this.f5c = 2; this.f60 = 0; this.fb0 = 1;
        }
        break;
    }
  };

  /* ------------------------------------------------------ ToasterControl */

  function World(art, data, opts) {
    this.art = art;
    this.flight = new CSeq(data.flight, art);
    this.lyrics = new CSeq(data.karaoke, art);
    this.songs = data.songs;
    this.opts = opts;
    this.now = 1e7;
    var b = this.bags = {};
    ['type', 'special', 'trick1', 'trick2', 'trick3', 'food', 'babyfood', 'babycloud', 'cloud', 'cloud0', 'cloud1',
     'cloud2', 'cloud3', 'cloud4', 'cloudstart', 'tier', 'small', 'medium', 'big', 'kind'].forEach(function (k) { b[k] = new Bag(1); });
    this.lastBig = -1e12; this.lastMed = -1e12;
    this.g72 = 0; this.moon = 0; this.cage = 0; this.count545 = 0;
    this.cloudTimes = {};
  }

  World.prototype.reset = function (w, h) {
    var o = this.opts;
    this.w = w; this.h = h;
    this.karaoke = o.karaoke && o.music !== 0;
    this.bg = [0, 0, w, this.karaoke ? h - KARAOKE_H : h];
    this.traffic = new Traffic(this, this.bg);
    /* 0x41c010: counts scale with the screen's area against 800x600. */
    var area = w * h / 480000, N = area * (this.baby ? 22 : 30), min = this.baby ? 5 : 3;
    var food = area * 3, clouds = area * 5, v = o.objects;
    if (v >= 75) { this.max = N | 0; this.cap1 = food | 0; this.cap2 = clouds | 0; if (this.cap2 <= 0) { this.cap2 = 2; } }
    else if (v >= 50) { this.max = N * 0.5 | 0; this.cap1 = food | 0; this.cap2 = clouds | 0; if (this.cap2 <= 0) { this.cap2 = 2; } }
    else if (v >= 25) { this.max = N * 0.25 | 0; this.cap1 = food * 0.5 | 0; this.cap2 = clouds * 0.5 | 0; if (this.cap2 <= 0) { this.cap2 = 1; } }
    else { this.max = min; this.cap1 = 0; this.cap2 = 0; }
    if (this.max < min) { this.max = min; }
    this.objs = [];
    this.nToast = 0; this.nFood = 0; this.nCloud = 0; this.lastCloud = -1e12; this.lastGag = -1e12;
    this.intro = !this.baby;
    this.introObj = null;
    this.next = 0;
    this.kar = new Karaoke(this);
  };

  World.prototype.chooseKind = function () {  // 0x41e260
    var now = this.now;
    if (this.nCloud < this.cap1 && now > this.lastCloud + 5000) { return 3; }
    var r = this.bags.kind.pick(5);
    var ratio = this.nFood > 0 ? this.nToast / this.nFood : 4;
    if (r === 0) {
      if (this.nCloud < this.cap2 && now > this.lastCloud + 5000) { return 3; }
      this.bags.kind.release(r);
      return 2;
    }
    if (r === 1 && now > this.lastGag + 2000 && !this.baby) { this.lastGag = now; return 4; }
    if (r === 2 && ratio > 2) { return 1; }
    return ratio > 4 ? 1 : 2;
  };

  /* 0x41dcd0, ten times a second. */
  World.prototype.play = function () {
    var i, o;
    if (this.intro) {
      if (!this.introObj) { this.introObj = new Intro(this); this.introObj.z = 900; }
      this.introObj.update();
      /* The intro is over once the pictures are; its toaster flies on as an
         ordinary object, and is booked as a toaster on its way out. */
      if (this.introObj.f34) {
        this.intro = false;
        this.objs.push(this.introObj);
        this.introObj = null;
      }
      return;
    }
    for (i = 0; i < this.objs.length; i += 1) {
      o = this.objs[i];
      if (o.finished()) {
        if (o.kind === 'cloud' || o.kind === 'babycloud') { this.nCloud -= 1; }
        else if (o.kind === 'food' || o.kind === 'babyfood') { this.nFood -= 1; }
        else if (o.kind === 'gag') { this.nToast -= o.weight; }
        else { this.nToast -= 1; }
        o.finish();
        this.traffic.remove(o);
        this.objs.splice(i, 1);
        i -= 1;
      }
    }
    if (this.nToast + this.nFood < this.max) {
      var kind = this.chooseKind(), n;
      if (kind === 4) {
        n = new Gag(this); this.nToast += n.weight; n.z = 600;
      } else if (kind === 3) {
        n = new Cloud(this, this.baby); this.nCloud += 1; this.lastCloud = this.now; n.z = this.baby ? 100 : 0;
      } else if (kind === 1) {
        n = new Food(this, this.baby); this.nFood += 1; n.z = this.baby ? 300 : 200;
      } else {
        n = new Toaster(this, !this.baby); this.nToast += 1; n.z = 700;
      }
      this.traffic.add(n);
      this.objs.push(n);
    }
    for (i = 0; i < this.objs.length; i += 1) { this.objs[i].update(); }
  };

  World.prototype.step = function (dt) {
    this.now += dt * 1000;
    if (!this.next) { this.next = this.now; }
    var guard = 0;
    while (this.now >= this.next && guard < 5) {
      this.play();
      this.next += TICK;
      guard += 1;
    }
    if (this.now - this.next > 1000) { this.next = this.now; }
    if (this.karaoke) { this.kar.update(); }
  };

  World.prototype.draw = function (ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.bg[0], this.bg[1], this.bg[2] - this.bg[0], this.bg[3] - this.bg[1]);
    ctx.clip();
    var list = this.objs.slice();
    if (this.introObj) { list.push(this.introObj); }
    list.sort(function (p, q) { return p.z - q.z; });
    list.forEach(function (o) { o.sprites().forEach(function (s) { s.draw(ctx); }); });
    if (this.karaoke) { this.kar.bagel.draw(ctx); }
    ctx.restore();
    if (this.karaoke) { ctx.drawImage(this.kar.strip, 0, this.h - KARAOKE_H); }
  };

  /* ------------------------------------------------------ KaraokeControl */

  function Karaoke(world) {
    this.world = world;
    this.table = world.songs[world.baby ? 'baby' : 'adult'];
    this.seq = world.lyrics;
    this.bagel = new Sprite(world.flight);
    this.strip = document.createElement('canvas');
    this.strip.width = Math.max(1, world.w);
    this.strip.height = KARAOKE_H;
    this.g = this.strip.getContext('2d');
    /* The code centres each line on width / 2 and bounces the bagel at
       height - 31. Vertically, measured against the capture, every line's
       frame ends 3 pixels above the bottom of the screen whatever its height,
       so that is where they go here (this.center[1] is unused). */
    this.center = [(world.w / 2) | 0, 0];
    this.frames = world.flight.labelRange(0xce9);
    this.bagelY = world.h - 31;
    this.count = 0;
    this.saved = 0;
    this.reset();
  }
  var KP = Karaoke.prototype;
  KP.clear = function () {
    this.g.fillStyle = '#000';
    this.g.fillRect(0, 0, this.strip.width, this.strip.height);
    this.bagel.nextSequence(0);
  };
  KP.reset = function () {             // 0x41b187
    this.clear();
    this.idx = 0;
    this.t40 = this.t44 = this.world.now;
    this.dx = 0; this.step = 0;
  };
  /* The frame placed in the strip, and channel ch's rect within it. */
  KP.place = function (frame) {
    var f = this.seq.f[frame], w = f[2] - f[0], h = f[3] - f[1];
    return [this.center[0] - (w >> 1) - f[0], KARAOKE_H - 3 - h - f[1]];
  };
  KP.chanRect = function (frame, ch) {
    var f = this.seq.f[frame], o = this.place(frame);
    for (var i = 4; i < f.length; i += 1) {
      if (f[i][1] === ch) {
        var sz = this.seq.size[f[i][0]];
        return [f[i][3] + o[0], f[i][4] + o[1], f[i][3] + o[0] + sz[0], f[i][4] + o[1] + sz[1]];
      }
    }
    return [0, 0, 0, 0];
  };
  KP.drawChannel = function (frame, ch, clip) {
    var f = this.seq.f[frame], o = this.place(frame), g = this.g, art = this.world.art;
    g.save();
    if (clip) { g.beginPath(); g.rect(clip[0], clip[1], clip[2] - clip[0], clip[3] - clip[1]); g.clip(); }
    for (var i = 4; i < f.length; i += 1) {
      if (f[i][1] !== ch) { continue; }
      var c = this.seq.cels[f[i][0]], s = art.sequence(c[0]), fr = s.frames[c[1]];
      g.drawImage(s.image, fr.x, fr.y, fr.w, fr.h, f[i][3] + o[0], f[i][4] + o[1], fr.w, fr.h);
    }
    g.restore();
  };
  KP.drawWord = function (e, type) {   // 0x41b1f0
    var frame = e[0], ch = e[1];
    if (!frame) { return; }
    if (type === 0) { this.clear(); this.drawChannel(frame, 1); }
    else if (type === 1) { this.drawChannel(frame, ch); }
    else if (type === 3) { this.drawChannel(frame, 1, this.chanRect(frame, ch)); }
    else { this.drawChannel(frame, 1); }
  };
  KP.update = function () {            // 0x41b31f
    var now = this.world.now, stop = false, guard = 0;
    while (now >= this.t44 && !stop && guard < 50) {
      guard += 1;
      var b = this.bagel;
      if (b.done) {
        var cur = this.table[this.idx];
        this.saved = this.idx;
        this.idx += 1;
        var nxt = this.table[this.idx] || [0, 10, 0, 4];
        if (cur[3] === 4 && cur[0] === 0 && cur[1] === 10) { this.reset(); return; }
        if (cur[3] === 0 && cur[0] === 0 && cur[1] === 1) { this.t40 += cur[2]; this.t44 = this.t40; this.clear(); return; }
        if (cur[3] === 4) { this.t40 += cur[2]; this.t44 = this.t40; this.clear(); return; }
        var r, x0, x1;
        if (cur[3] === 0) {
          r = this.chanRect(nxt[0], nxt[1]);
          x0 = half(r[0], r[2]) - (r[2] - r[0]);
        } else {
          r = this.chanRect(cur[0], cur[1]);
          x0 = half(r[0], r[2]);
        }
        if (nxt[3] === 4 || nxt[3] === 0) {
          r = this.chanRect(cur[0], cur[1]);
          x1 = (r[2] - r[0]) + half(r[0], r[2]);
        } else {
          r = this.chanRect(nxt[0], nxt[1]);
          x1 = half(r[0], r[2]);
        }
        this.dx = (x1 - x0) / this.frames | 0;
        this.step = cur[2] / this.frames | 0;
        this.t44 = this.t40;
        this.t40 += cur[2];
        b.nextSequence(0xce9);
        b.setCenter(x0, this.bagelY);
        this.drawWord(cur, cur[3]);
        if (cur[3] === 1) { this.count = 2; }
        b.play();
        this.t44 += this.step;
        stop = true;
      } else {
        if (this.count > 0) {
          this.count -= 1;
          if (this.count === 0) { this.drawWord(this.table[this.saved], 3); }
        }
        b.setCenter(b.cx + this.dx, b.cy);
        b.play();
        this.t44 += this.step;
        if (b.frame === 0xcec) { stop = true; }
      }
    }
  };

  /* ------------------------------------------------------ element */

  function ToastersElement() { return Reflect.construct(HTMLElement, [], ToastersElement); }
  ToastersElement.prototype = Object.create(HTMLElement.prototype);
  ToastersElement.prototype.constructor = ToastersElement;
  Object.setPrototypeOf(ToastersElement, HTMLElement);

  ToastersElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var base = (this.getAttribute('art') || 'art/toasters-40').replace(/\/$/, '');
    this.style.display = this.style.display || 'block';
    this.style.background = '#000';
    var AD = window.AfterDark;
    var opts = {
      objects: OBJECT_VALUES[AD.choice(this, 'objects', OBJECTS, 'squadron')],
      toaster: AD.choice(this, 'toasters', TOASTERS, 'adults'),
      music: AD.choice(this, 'music', MUSIC, 'always'),
      karaoke: AD.flag(this, 'display-karaoke')
    };
    Promise.all([
      AD.load(base),
      fetch(AD.bust(base + '/compound.json')).then(function (r) {
        if (!r.ok) { throw new Error('no compound.json at ' + base); }
        return r.json();
      })
    ]).then(function (got) {
      var world = new World(got[0], got[1], opts);
      world.baby = opts.toaster === 1 || (opts.toaster === 2 && Math.random() < 0.5);
      var screen = new AD.Screen(self);
      self._screen = screen;
      self.world = world;
      screen.onresize = function (w, h) { world.reset(w, h); };
      world.reset(screen.width, screen.height);
      screen.run(function (dt, ctx) {
        world.step(dt);
        world.draw(ctx);
      });
    }).catch(function (err) {
      self.textContent = err.message;
    });
  };

  ToastersElement.prototype.disconnectedCallback = function () {
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  if (window.customElements && !customElements.get('after-dark-toasters-40')) {
    customElements.define('after-dark-toasters-40', ToastersElement);
  }
}());
