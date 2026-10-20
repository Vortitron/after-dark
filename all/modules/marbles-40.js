/**
 * marbles-40.js - Marbles! as it was rebuilt for After Dark 4.0.
 *
 * Not the one most people remember (that is modules/marbles.js, the 1992
 * MARBLES2). AD10th's MARBLES.AD is a pachinko board: sixteen pegs scattered
 * over a black screen - pinwheels, plasma globes, poker chips, eyeballs, snow
 * globes - and one marble at a time dropped in from the top. It falls,
 * bounces off the pegs (which play a little animation when hit) and off the
 * marbles already down, and when it can go no further it stays where it
 * stopped. The heap grows; when it is big enough the screen is wiped and a
 * new board laid out.
 *
 * Checked against a capture of the module running (tools/adrun.sh, 1024x768,
 * default settings): sixteen pegs of two kinds, one marble moving at a time,
 * the rest lying where they came to rest. Everything below is read out of the
 * module's code rather than guessed (names in comments are its exports):
 *
 * - Aggate: Launch (a random one of the ten agates, a random spot along the
 *   top, a small random push), PlayAggate (gravity 0.0009 px/ms^2 on a clock
 *   running 1.25 times fast, in steps of at most 10 ms), CheckCollision /
 *   TimeToCollide / TimeToEdges (exact time-of-impact against circles and the
 *   left, right and bottom edges; pegs and resting marbles reflect with their
 *   own restitution, walls with 0.8), and the module's tests for "it has
 *   stopped" including CheckRollOff (resting on two things either side of it).
 *   The roll animation's speed and direction follow the speed at each bounce.
 * - PegSprite::SetPegType: each peg kind's picture, hit animation, size and
 *   bounce (the poker chip gives back 1.1 - more than it got - wearing down
 *   to 0.95 by 0.005 a hit until the next marble is launched).
 * - Marbles::SetUpScatter: 16 pegs at 1024x768 (12, 8 or 1 on smaller
 *   screens), kept 64 px apart and clear of the top 111 px; Pattern picks
 *   which kinds may appear. DoDrawFrame: a pause of up to two seconds between
 *   marbles, and a new board three seconds after the count of pegs plus
 *   marbles reaches the limit Marbles sets ((H*4/5 / 32) / 4 * W / 32, times
 *   1-4 for A Few .. A Box Full).
 *
 * The eight Custom patterns are boards the user saves from the module's own
 * editor (Caps Lock) into Marbles1.ini .. Marbles8.ini. Out of the box none
 * exist, and the module then scatters pegs with that pattern's own set of
 * kinds - which is what this does. Not here: the editor, its "Press caps-lock
 * to arrange the pegs" line, and the sounds.
 *
 * Artwork: art/marbles from tools/adweb.py, placed by the module's compound
 * sequence (TYPE_8100/8102 8000, art/marbles/compound.json).
 *
 *   <after-dark-marbles-40 count="a pouch full" pattern="random"></after-dark-marbles-40>
 */
(function () {
  'use strict';

  var COUNTS = { 'a few': 1, 'a pouch full': 2, 'a jar full': 3, 'a box full': 4 };
  var MARBLES = [5, 0x21, 0x3d, 0x59, 0x75, 0x91, 0xad, 0xc9, 0xe5, 0x101];
  /* SetUpScatter: the peg kinds each pattern may use. */
  var PATTERNS = [
    [342, 350, 357, 365, 373, 380, 388],
    [342, 350, 357, 365, 373, 380],
    [342, 350, 357, 365, 380],
    [342, 350, 365, 380],
    [357, 365, 380],
    [373, 388],
    [342, 380],
    [350, 365]
  ];
  /* SetPegType: kind -> [bounce, hit animation]. */
  var PEGS = {
    342: [0.85, 0x18e], 350: [0.9, 0x196], 357: [0.8, 0x1a3], 365: [1.1, 0x1bb],
    373: [0.6, 0x1c2], 380: [0.75, 0x1d5], 388: [0.85, 0x1e5]
  };
  var CHIP = 365;
  var MARBLE_R = 16;
  var TOP = 111;               // the height of the peg editor's palette (0x228)
  var GRAVITY = 0.0009, TIME_SCALE = 1.25, MAX_STEP = 10, MIN_STEP = 0.0101;
  var WALL_BOUNCE = 0.8, MARBLE_BOUNCE = 0.9, EPS = 0.001;

  function rnd(n) { return n > 0 ? Math.floor(Math.random() * n) : 0; }
  function trunc(v) { return Math.trunc(v); }
  function inRect(x, y, r) { return x >= r[0] && x < r[2] && y >= r[1] && y < r[3]; }

  /* ------------------------------------------------ compound pictures */

  function Pictures(data, art) { this.f = data.frames; this.cels = data.cels; this.art = art; }
  Pictures.prototype.valid = function (t) { return t > 0 && t < this.f.length && !!this.f[t]; };
  Pictures.prototype.last = function (t) { while (this.valid(t + 1)) { t += 1; } return t; };
  Pictures.prototype.width = function (t) { return this.f[t][2] - this.f[t][0]; };
  Pictures.prototype.height = function (t) { return this.f[t][3] - this.f[t][1]; };
  /* One frame centred on (cx, cy) the way CompoundSprite places it. */
  Pictures.prototype.draw = function (ctx, t, cx, cy) {
    if (!this.valid(t)) { return; }
    var f = this.f[t], l = cx - ((f[2] - f[0]) >> 1) - f[0], tp = cy - ((f[3] - f[1]) >> 1) - f[1];
    for (var i = 4; i < f.length; i += 1) {
      var it = f[i], c = this.cels[it[0]], seq = this.art.sequence(c[0]);
      if (!seq) { continue; }
      var fr = seq.frames[c[1]];
      ctx.drawImage(seq.image, fr.x, fr.y, fr.w, fr.h, it[3] + l, it[4] + tp, fr.w, fr.h);
    }
  };

  /* ------------------------------------------------ Marbles */

  function Board(art, data) {
    this.art = art;
    this.pics = new Pictures(data, art);
    this.tier = COUNTS['a pouch full'];
    this.pattern = -1;                   // -1 = Random
  }
  var BP = Board.prototype;

  BP.reset = function (w, h) {
    this.W = w; this.H = h;
    // IMarbles
    this.pegCount = (w < 256 || h < 256) ? 1 : (w < 600 || h < 400) ? 8 : (w < 710 || h < 510) ? 12 : 16;
    this.left = 16; this.right = w - 16; this.bottom = h - 16;
    var maxW = 0, self = this;
    PATTERNS[0].forEach(function (k) { maxW = Math.max(maxW, self.pics.width(k)); });
    this.margin = maxW;                  // Aggate's look-ahead past the path
    this.near2 = Math.pow(((maxW + 1) >> 1) + 17, 2);
    this.base = (((h * 4 / 5) | 0) >> 5) / 4 | 0;
    this.base *= w >> 5;
    this.now = this.now || 0;
    this.lastTick = this.now;
    this.setupPending = true;
    this.waitUntil = 0;
    this.ready = false;
    this.coll = [];
    this.pegs = [];
    this.marble = null;
    this.heap = null;
    this.heapList = [];
  };

  BP.limit = function () {
    if (this.pegCount === 1) { return 7; }
    return Math.min(this.base * this.tier, 0x703);
  };

  /* AddACollidable: kept in (y, x) order, as the module keeps it. */
  BP.addCollidable = function (peg, x, y, r, bounce) {
    var c = { peg: peg, x: x, y: y, r: r, bounce: bounce, R2: (r + 16) * (r + 16) };
    var i = 0;
    while (i < this.coll.length && (this.coll[i].y < y || (this.coll[i].y === y && this.coll[i].x <= x))) { i += 1; }
    this.coll.splice(i, 0, c);
  };

  /* DoSetUp + SetUpScatter */
  BP.setUp = function () {
    var W = this.W, H = this.H, pics = this.pics;
    this.coll = []; this.pegs = []; this.marble = null;
    this.heapList = [];
    this.clearHeap();
    var kinds = PATTERNS[this.pattern < 0 ? rnd(8) : this.pattern];
    var mw = 0, mh = 0, t;
    for (t = 0; t < 14; t += 1) {
      var id = [285, 293, 300, 308, 315, 323, 331, 342, 350, 357, 365, 373, 380, 388][t];
      mw = Math.max(mw, pics.width(id)); mh = Math.max(mh, pics.height(id));
    }
    var xRange = W - mw - 4, yRange = H - 32 - TOP - 8 - mh;
    var x0 = mw >> 1, y0 = TOP + (mh >> 1) + 2;
    for (var n = 0; n < this.pegCount; n += 1) {
      var x, y, ok, tries = 0;
      do {
        if (this.pegCount === 1) { x = W >> 1; y = H >> 1; }
        else { x = rnd(xRange) + x0; y = rnd(yRange) + y0; }
        var r = [x - mw, y - mh, x + mw, y + mh];
        ok = true;
        for (var j = 0; j < this.pegs.length; j += 1) {
          if (inRect(this.pegs[j].x, this.pegs[j].y, r)) { ok = false; break; }
        }
        tries += 1;
      } while (!ok && tries < 500);
      if (!ok) { break; }
      var kind = kinds[rnd(kinds.length)], spec = PEGS[kind];
      var peg = { kind: kind, anim: spec[1], bounce: spec[0], x: x, y: y, t: kind, queue: [], next: 0,
                  r: Math.max(pics.width(kind), pics.width(285)) >> 1 };
      this.pegs.push(peg);
      this.addCollidable(peg, x, y, peg.r, peg.bounce);
    }
    this.ready = true;
    this.setupPending = false;
    this.waitUntil = 0;
  };

  BP.clearHeap = function () {
    if (this.heap) { this.heap.getContext('2d').clearRect(0, 0, this.heap.width, this.heap.height); }
  };

  /* PlayPeg(now, hit) */
  BP.playPeg = function (peg, now, hit) {
    if (hit) {
      peg.queue = [];
      for (var t = peg.anim; this.pics.valid(t); t += 1) { peg.queue.push(t); }
      peg.queue.push(peg.kind);
      peg.next = now;
    }
    if (peg.queue.length && now >= peg.next) {
      peg.next = now + 100;
      peg.t = peg.queue.shift();
    }
  };

  /* Aggate::Launch */
  BP.launch = function (now) {
    var i;
    for (i = 0; i < this.coll.length; i += 1) {
      if (this.coll[i].peg && this.coll[i].peg.kind === CHIP) { this.coll[i].bounce = this.coll[i].peg.bounce; }
    }
    var vx = rnd(7) - 3;
    if (vx === 0) { vx = 1; }
    var seq = MARBLES[rnd(10)];
    var w = this.pics.width(seq), h = this.pics.height(seq);
    var m = {
      vx: vx * 0.09, vy: rnd(3) * 0.09,
      x: rnd(this.W - 4 * w) + 2 * w, y: 1 - (h >> 1),
      first: seq, last: this.pics.last(seq), t: seq,
      spinMode: 2, spinDir: 1, spinCount: 0,
      lastX: -1e9, lastY: -1e9, stuck: 0, hist: [[-10, -10], [-10, -10], [-10, -10]], histAt: 0,
      tick: now
    };
    m.cx = trunc(m.x); m.cy = trunc(m.y);
    this.marble = m;
  };

  BP.place = function (m) { m.cx = trunc(m.x); m.cy = trunc(m.y); };

  /* TimeToEdges */
  BP.timeToEdges = function (m) {
    var ok = false, t = 0, code = 0, tx = 0, dist;
    if (m.vx > 0) { dist = this.right - m.x; if (dist < 0) { dist = 0; } }
    else { dist = this.left - m.x; if (dist > 0) { dist = 0; } }
    if (m.vx !== 0) {
      tx = dist / m.vx;
      if (tx < EPS) { tx = EPS; }
      ok = true; t = tx; code = -2;
    }
    if (m.vy > 0) {
      dist = this.bottom - m.y;
      if (dist < 0) { dist = 0; }
      var ty = dist / m.vy;
      if (ty < EPS) { ty = EPS; }
      if (ok) {
        if (ty < tx) { code = -1; t = ty; } else if (ty === tx) { code = -3; }
      } else { ok = true; t = ty; code = -1; }
    }
    return ok ? [t, code] : null;
  };

  /* TimeToCollide */
  BP.timeToCollide = function (m, c, rect) {
    if (!inRect(c.x, c.y, rect)) { return -1; }
    var dx = c.x - m.x, dy = c.y - m.y;
    var c0 = dx * dx + dy * dy - c.R2;
    var b = (dx * m.vx + dy * m.vy) * -2;
    var a = m.vx * m.vx + m.vy * m.vy;
    var disc = b * b - 4 * a * c0;
    if (disc <= 0) { return -1; }
    var sq = Math.sqrt(disc), a2 = 2 * a;
    var t1 = (-b + sq) / a2, t2 = (-b - sq) / a2;
    if (t1 <= EPS && t2 <= EPS) { return -1; }
    if (t2 > t1) { if (t1 < EPS) { t1 = t2; } } else if (t2 > EPS) { t1 = t2; }
    if (c0 <= 0) { t1 = EPS; }
    return t1;
  };

  /* CheckRollOff: lying on two things, one either side. */
  BP.rollOff = function (m) {
    var px = m.cx, py = m.cy, count = 0, g = [1000, 1000], id = [-100, -100], coll = this.coll;
    if (px <= this.left) { count += 1; g[0] = MIN_STEP; id[0] = -2; }
    if (px >= this.right) { count += 1; g[0] = MIN_STEP; id[0] = -2; }
    if (py >= this.bottom) {
      count += 1;
      if (count === 1) { g[1] = MIN_STEP; id[1] = -1; }
    }
    if (count > 1) { return true; }
    for (var i = 0; i < coll.length; i += 1) {
      var ddx = (coll[i].x - px) * (coll[i].x - px), ddy = (py - coll[i].y) * (py - coll[i].y);
      if (ddx >= this.near2 || ddy >= this.near2) { continue; }
      count += 1;
      var gap = Math.sqrt(ddx + ddy) - 16 - coll[i].r;
      if (gap < 0) { gap = MIN_STEP; }
      var left = coll[i].x <= px;
      if (gap < g[0]) {
        var promote = true;
        if (id[0] >= 0) { promote = left ? coll[id[0]].x > px : coll[id[0]].x <= px; }
        if (promote) { g[1] = g[0]; id[1] = id[0]; }
        g[0] = gap; id[0] = i;
      } else {
        var opposite = false;
        if (id[1] >= 0) { opposite = left ? coll[id[1]].x > px : coll[id[1]].x <= px; }
        if (gap < g[1] && !opposite) { g[1] = gap; id[1] = i; }
      }
    }
    if (count > 1 && g[1] - g[0] < 1.25) {
      if (id[0] < 0 || id[1] < 0) { return true; }
      if (coll[id[0]].x <= px) { return px <= coll[id[1]].x; }
      return px >= coll[id[1]].x;
    }
    return false;
  };

  /* CheckCollision: move up to `step` ms, stopping at the first thing hit. */
  BP.checkCollision = function (m, step, now) {
    var tx = trunc(m.x + step * m.vx), ty = trunc(m.y + step * m.vy), k = this.margin + 17;
    var rect = [Math.min(m.cx, tx) - k, Math.min(m.cy, ty) - k, Math.max(m.cx, tx) + k, Math.max(m.cy, ty) + k];
    var tmin = step, second = step, idx = this.coll.length + 1, hit = false, i;
    var rest = false, floor = false, quiet = false, peg = null, bounce = 1;
    var e = this.timeToEdges(m);
    if (e && e[0] < tmin) { hit = true; tmin = e[0]; idx = e[1]; }
    for (i = 0; i < this.coll.length; i += 1) {
      var t = this.timeToCollide(m, this.coll[i], rect);
      if (t < 0) { continue; }
      if (t < tmin) { hit = true; second = tmin; tmin = t; idx = i; } else if (t < second) { second = t; }
    }
    if (!hit) {
      m.x += m.vx * step; m.y += m.vy * step;
      this.place(m);
      return [false, step];
    }
    var speed = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
    m.x += m.vx * tmin; m.y += m.vy * tmin;
    step = tmin;
    if (idx >= 0) {
      this.place(m);
      var c = this.coll[idx];
      peg = c.peg;
      bounce = c.bounce;
      if (peg && peg.kind === CHIP && c.bounce > 0.95) { c.bounce -= 0.005; }
      var nx = c.x - m.x, ny = c.y - m.y, len = Math.sqrt(nx * nx + ny * ny) || 1;
      nx /= len; ny /= len;
      var dot = 2 * (m.vx * nx + m.vy * ny);
      m.vx = (m.vx - dot * nx) * bounce;
      m.vy = (m.vy - dot * ny) * bounce;
    } else {
      var code = -idx;
      if (code & 1) { m.vy = -m.vy; floor = true; }
      if (code & 2) { m.vx = -m.vx; }
      if (m.y > this.bottom) { m.y = this.bottom; }
      if (m.x < this.left) { m.x = this.left; } else if (m.x > this.right) { m.x = this.right; }
      this.place(m);
      m.vx *= WALL_BOUNCE; m.vy *= WALL_BOUNCE;
    }
    if (speed < 0.05) {
      if (m.cx === m.lastX && m.cy === m.lastY) {
        m.stuck += 1;
        if (floor && m.stuck > 4) {
          rest = true;
        } else {
          if (tmin <= 0.001001 && second <= 0.001001) { rest = true; }
          if (m.stuck > 6) {
            if (this.rollOff(m)) {
              rest = true;
            } else {
              for (i = 0; i < 3; i += 1) {
                if (m.hist[i][0] === m.cx && m.hist[i][1] === m.cy) { rest = true; break; }
              }
              if (!rest) {
                // Nudge it a pixel off whatever it is perched on, and kick.
                m.hist[m.histAt] = [m.cx, m.cy];
                m.histAt = (m.histAt + 1) % 3;
                if (idx >= 0) { m.x += this.coll[idx].x > m.cx ? -1 : 1; }
                this.place(m);
                m.vx = m.vx / bounce * 1.5;
                m.vy = m.vy / bounce * 1.5;
                if (step < 3) { step = 3; }
                quiet = true;
              }
            }
            m.stuck = 0;
          }
        }
      } else {
        m.lastX = m.cx; m.lastY = m.cy; m.stuck = 0;
      }
    }
    // How fast it rolls from here, turning round at every bounce.
    var dir = m.spinDir < 0 ? -1 : 1;
    if (speed > 0.9) { m.spinMode = 4; m.spinDir = -3 * dir; }
    else if (speed > 0.45) { m.spinMode = 3; m.spinDir = -2 * dir; }
    else if (speed > 0.22) { m.spinMode = 2; m.spinDir = -dir; }
    else if (speed > 0.1) { m.spinMode = 1; m.spinDir = -dir; }
    else { m.spinMode = 0; m.spinDir = dir; }
    if (!quiet && peg) { this.playPeg(peg, now, true); }
    return [rest, step];
  };

  /* PlayAggate */
  BP.playAggate = function (m, now) {
    var dt = now - m.tick;
    if (dt > 1000) { dt = 1000; }
    var adv = 0;
    if (m.spinMode === 1) { m.spinCount += 1; if (m.spinCount & 1) { adv = m.spinDir; } }
    else if (m.spinMode >= 2) { adv = m.spinDir; }
    var t = m.t + adv;
    if (t > m.last) { t -= m.last - m.first; } else if (t < m.first) { t += m.last - m.first; }
    m.t = t;
    dt *= TIME_SCALE;
    var rest = false;
    while (dt > 0 && !rest) {
      var r = this.checkCollision(m, dt > MAX_STEP ? MAX_STEP : dt, now);
      rest = r[0];
      var step = r[1];
      if (step <= MIN_STEP) { step = MIN_STEP; }
      m.vy += GRAVITY * step;
      if (m.vy < 0 && m.vy > -GRAVITY) { m.vy = -GRAVITY; }
      dt -= step;
    }
    m.tick = now;
    return rest;
  };

  /* DoDrawFrame */
  BP.step = function (dt) {
    this.now += dt * 1000;
    var now = this.now;
    if (now - this.lastTick < 5) { return; }
    this.lastTick = now;
    if (this.setupPending) {
      if (now > this.waitUntil) { this.setUp(); }
    } else if (this.ready) {
      if (now > this.waitUntil) {
        this.launch(now - 10);
        this.playAggate(this.marble, now);
        this.ready = false;
      }
    } else if (this.marble) {
      if (this.playAggate(this.marble, now)) {
        var m = this.marble;
        this.addCollidable(null, m.cx, m.cy, MARBLE_R, MARBLE_BOUNCE);
        this.lay(m);
        this.marble = null;
        this.ready = true;
        this.waitUntil = now + rnd(500) * 4;
        if (this.coll.length >= this.limit()) {
          this.setupPending = true;
          this.waitUntil += 3000;
        }
      }
    }
    for (var i = 0; i < this.pegs.length; i += 1) { this.playPeg(this.pegs[i], now, false); }
  };

  /* A marble that has stopped is left in the picture. */
  BP.lay = function (m) {
    if (!this.heap && typeof document !== 'undefined') {
      var cv = document.createElement('canvas');
      if (cv && typeof cv.getContext === 'function' && cv.getContext('2d')) { this.heap = cv; }
    }
    if (this.heap) {
      if (this.heap.width !== this.W || this.heap.height !== this.H) {
        this.heap.width = this.W; this.heap.height = this.H;
        var c = this.heap.getContext('2d');
        for (var i = 0; i < this.heapList.length; i += 1) {
          var o = this.heapList[i];
          this.pics.draw(c, o[0], o[1], o[2]);
        }
      }
      this.pics.draw(this.heap.getContext('2d'), m.t, m.cx, m.cy);
    }
    this.heapList.push([m.t, m.cx, m.cy]);
  };

  BP.draw = function (ctx, w, h) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    var i;
    if (this.heap) { ctx.drawImage(this.heap, 0, 0); }
    else {
      for (i = 0; i < this.heapList.length; i += 1) {
        this.pics.draw(ctx, this.heapList[i][0], this.heapList[i][1], this.heapList[i][2]);
      }
    }
    for (i = 0; i < this.pegs.length; i += 1) { this.pics.draw(ctx, this.pegs[i].t, this.pegs[i].x, this.pegs[i].y); }
    if (this.marble) { this.pics.draw(ctx, this.marble.t, this.marble.cx, this.marble.cy); }
  };

  /* ------------------------------------------------------------ element */

  function MarblesElement() { return Reflect.construct(HTMLElement, [], MarblesElement); }
  MarblesElement.prototype = Object.create(HTMLElement.prototype);
  MarblesElement.prototype.constructor = MarblesElement;
  Object.setPrototypeOf(MarblesElement, HTMLElement);

  MarblesElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var AD = window.AfterDark;
    var base = (this.getAttribute('art') || 'art/marbles').replace(/\/$/, '');
    this.style.display = this.style.display || 'block';
    this.style.background = '#000';

    Promise.all([
      AD.load(base),
      fetch(AD.bust(base + '/compound.json')).then(function (r) {
        if (!r.ok) { throw new Error('no compound.json at ' + base); }
        return r.json();
      })
    ]).then(function (got) {
      var sim = new Board(got[0], got[1]);
      var wanted = (AD.setting(self, 'count') || 'a pouch full').toLowerCase();
      if (COUNTS[wanted]) { sim.tier = COUNTS[wanted]; }
      else if (!isNaN(parseInt(wanted, 10))) {
        var v = parseInt(wanted, 10);          // the slider's 0-100
        sim.tier = v < 33 ? 1 : v < 67 ? 2 : v < 98 ? 3 : 4;
      }
      var pattern = (AD.setting(self, 'pattern') || 'random').toLowerCase().replace('custom', '').trim();
      var p = parseInt(pattern, 10);
      sim.pattern = p >= 1 && p <= 8 ? p - 1 : -1;

      var screen = new AD.Screen(self);
      self._screen = screen;
      self.sim = sim;
      screen.onresize = function (w, h) { sim.reset(w, h); };
      sim.reset(screen.width, screen.height);
      screen.run(function (dt, ctx, w, h) {
        sim.step(dt);
        sim.draw(ctx, w, h);
      });
    }).catch(function (err) {
      self.textContent = err.message;
    });
  };

  MarblesElement.prototype.disconnectedCallback = function () {
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-marbles-40', MarblesElement);
  window.AfterDarkMarbles40 = Board;
}());
