/**
 * marbles.js - Marbles, the 1992 original, on the module's own artwork.
 *
 * MARBLES2.AD describes itself, in its own resource string:
 *
 *   "MARBLES simulates colorful spheres bouncing through an obstacle course of
 *    pins and magically stacking at the bottom. As with people, some marbles
 *    are more sensitive than others."
 *    Windows version by Mike Overlin. Concept and Mac version by Kevin McLeod.
 *    Artwork by Igor Gasowski. (c) 1992 Berkeley Systems Inc.
 *
 * Checked against the real module running under Wine at 1024x768 (default
 * settings, 25 s and 150 s captures, 15 fps):
 *
 *   - One marble is in play at a time. It comes in at the top at a random x,
 *     already falling (~300 px/s) and with a random sideways throw of up to
 *     ~450 px/s, and the next one is let go a moment after it comes to rest.
 *     That is about five marbles in 25 s; after 150 s there is one row of
 *     them along the bottom with a few sat in the notches between pairs.
 *   - Gravity is ~900 px/s/s. Pins are lively (a marble leaves one at nearly
 *     the speed it arrived), the side walls give back about two thirds and the
 *     floor a little over half. Then it rolls along the floor at an even speed
 *     and bounces off any marble already there.
 *   - A marble that has stopped never moves again, and it stops on a lattice:
 *     the bottom row at x = 16n, the next half a marble over and 14 px up in
 *     the hollow between two. That is the "magically stacking"; later marbles
 *     bounce off the pile as if it were more pins.
 *   - At the default settings there are 28 Big (48 px) pins, scattered with
 *     no two closer than ~52 px between centres, across the screen from about
 *     y = 110 to y = 690 at 768 high.
 * Still inferred: the rolling friction and exactly when a marble counts as
 * stopped (it decides quickly, in a few frames, once it is slow); the Speed
 * slider's scale (the capture is the default); and the pin counts for the
 * named # Pins choices, which assume the count follows the setting's 0-100
 * value (the default, 58, gave the 28 above).
 *
 * The sensitive ones are the two faces at the end of the strip - the smiley
 * turns into the open-mouthed one when it takes a knock, which is what the
 * module's OH_SOUND is for.
 *
 * Artwork, from tools/adclassic.py:
 *   marbles   160x16, ten 16x16 marbles side by side (mask MMARBLE applied)
 *   100/101/102  the pin, at the module's X-Small, Medium and Big settings
 *
 * The original control panel offers Pin Size, # Pins (None/Few/Many/Lots),
 * Speed, and Redraw Every (10 sec ... 2 hours: how long before the screen is
 * cleared and the pins scattered again); all four are attributes here.
 *
 *   <after-dark-marbles pins="many" pin-size="big" speed="medium" redraw="5 min">
 */
(function () {
  'use strict';

  var CELL = 16;                       // the marbles are 16x16
  var R = CELL / 2;
  var SMILEY = 8, SHOCKED = 9;         // last two cells of the strip
  var OH = 0.4;                        // seconds a sensitive marble stays shocked

  var PIN_SIZES = { 'x-small': '100', medium: '101', big: '102' };
  /* Screen area per pin, so the count scales with the screen: the module's
     default (# Pins = 58 of 100, which its popup shows as Many) put 28 pins
     on 1024x768. */
  var PIN_DENSITY = { none: 0, few: 32800, many: 28000, lots: 16400 };
  var DEFAULT_DENSITY = PIN_DENSITY.many;
  var PIN_GAP = 4;                     // closest two pins come, edge to edge
  var PIN_TOP = 0.14, PIN_BOTTOM = 0.9;
  var SPEEDS = { slow: 40, medium: 65, fast: 100 };
  var REDRAW = {
    '10 sec': 10, '30 sec': 30, '1 min': 60, '5 min': 300, '10 min': 600,
    '30 min': 1800, '1 hour': 3600, '2 hours': 7200
  };

  var GRAVITY = 900;                   // pixels per second per second
  var DROP_SPEED = 300;                // already falling as it comes in
  var THROW = 450;                     // and up to this much sideways
  var PIN_BOUNCE = 0.85;               // pins are lively
  var WALL_BOUNCE = 0.65;
  var FLOOR_BOUNCE = 0.55;
  var PILE_BOUNCE = 0.5;               // marbles that have stopped
  var ROLL_DRAG = 60;                  // px/s/s while it is rolling on something
  var STOP_SPEED = 100;                // slower than this, and resting on
  var STOP_TIME = 0.15;                // something for this long, it stops
  var NEXT = 0.4;                      // then the next is let go
  var GIVE_UP = 30;                    // a marble still going after this stops
  var KNOCK = 120;                     // what counts as a knock for the smiley
  var STEP = 1 / 240;                  // physics step, so nothing tunnels

  function rand(a, b) { return a + Math.random() * (b - a); }

  function Marbles(art) {
    this.strip = art.bitmap('marbles');
    this.pinArt = art;
    this.setPinSize('big');
    this.pins = [];
    this.density = DEFAULT_DENSITY;
    this.speed = SPEEDS.medium;
    this.redraw = REDRAW['5 min'];
    this.ball = null;                  // the one marble in play
    this.pile = [];                    // the ones that have stopped
    this.wait = 0;
    this.clock = 0;
    this.w = 0;
    this.h = 0;
  }

  Marbles.prototype.setPinSize = function (name) {
    var bm = this.pinArt.bitmap(PIN_SIZES[name] || PIN_SIZES.big);
    this.pin = bm;
    this.pinR = bm ? bm.width / 2 : 0;
  };

  /* The pins are scattered rather than laid out, only kept from touching. */
  Marbles.prototype.scatter = function (w, h) {
    this.pins = [];
    if (!this.density || !this.pin) { return; }
    var wanted = Math.round((w * h) / this.density);
    var gap = this.pin.width + PIN_GAP;
    var tries = 0;
    while (this.pins.length < wanted && tries < wanted * 200) {
      tries += 1;
      var x = rand(this.pinR + 10, w - this.pinR - 10);
      var y = rand(h * PIN_TOP, h * PIN_BOTTOM);
      var clear = true;
      for (var i = 0; i < this.pins.length; i += 1) {
        if (Math.hypot(this.pins[i].x - x, this.pins[i].y - y) < gap) {
          clear = false;
          break;
        }
      }
      if (clear) { this.pins.push({ x: x, y: y }); }
    }
  };

  Marbles.prototype.reset = function (w, h) {
    this.w = w;
    this.h = h;
    this.pile = [];
    this.slots = {};
    this.ball = null;
    this.wait = 0;
    this.clock = 0;
    this.scatter(w, h);
  };

  Marbles.prototype.release = function (w) {
    var type = Math.floor(rand(0, SMILEY + 1));    // the shocked face is a state
    this.ball = {
      type: type,
      sensitive: type === SMILEY,
      oh: 0,
      x: rand(R, w - R),
      y: -R,
      vx: rand(-THROW, THROW),
      vy: DROP_SPEED,
      slow: 0,
      age: 0
    };
  };

  /* Push the marble out of a circle it has run into and bounce it off. Returns
     true if it is leaning on the circle from above, i.e. resting on it. */
  function hitCircle(m, cx, cy, reach, bounce) {
    var dx = m.x - cx, dy = m.y - cy;
    var d = Math.hypot(dx, dy);
    if (d >= reach) { return false; }
    if (d === 0) { dx = rand(-1, 1); dy = -1; d = Math.hypot(dx, dy); }
    var nx = dx / d, ny = dy / d;
    m.x = cx + nx * reach;
    m.y = cy + ny * reach;
    var into = m.vx * nx + m.vy * ny;
    if (into < 0) {
      m.vx -= (1 + bounce) * into * nx;
      m.vy -= (1 + bounce) * into * ny;
      if (-into > KNOCK && m.sensitive) { m.oh = OH; }
    }
    return ny < -0.2;
  }

  Marbles.prototype.move = function (m, dt, w, h) {
    var i, rest = false;
    m.vy += GRAVITY * dt;
    m.x += m.vx * dt;
    m.y += m.vy * dt;

    if (m.x < R) { m.x = R; m.vx = Math.abs(m.vx) * WALL_BOUNCE; }
    if (m.x > w - R) { m.x = w - R; m.vx = -Math.abs(m.vx) * WALL_BOUNCE; }
    if (m.y > h - R) {
      m.y = h - R;
      if (m.vy > 0) {
        if (m.vy > KNOCK && m.sensitive) { m.oh = OH; }
        m.vy = -m.vy * FLOOR_BOUNCE;
      }
      rest = true;
    }
    for (i = 0; i < this.pins.length; i += 1) {
      if (hitCircle(m, this.pins[i].x, this.pins[i].y, this.pinR + R, PIN_BOUNCE)) { rest = true; }
    }
    for (i = 0; i < this.pile.length; i += 1) {
      if (hitCircle(m, this.pile[i].x, this.pile[i].y, CELL, PILE_BOUNCE)) { rest = true; }
    }
    return rest;
  };

  Marbles.prototype.step = function (dt, w, h) {
    // The Speed slider runs the whole simulation faster rather than making the
    // marbles heavier, so scale time and leave the trajectories alone.
    dt = Math.min(dt * (this.speed / SPEEDS.medium), 0.1);

    this.clock += dt;
    if (this.redraw && this.clock >= this.redraw) { this.reset(w, h); }

    var m = this.ball;
    if (!m) {
      this.wait -= dt;
      if (this.wait <= 0) { this.release(w); }
      return;
    }

    for (var t = dt; t > 1e-6; t -= STEP) {
      var sub = Math.min(STEP, t);
      var resting = this.move(m, sub, w, h);
      if (m.oh > 0) { m.oh -= sub; }
      m.age += sub;
      if (resting) {
        var v = Math.hypot(m.vx, m.vy);
        var drag = ROLL_DRAG * sub;
        if (v > drag) { m.vx -= m.vx / v * drag; m.vy -= m.vy / v * drag; }
      }
      if (resting && Math.hypot(m.vx, m.vy) < STOP_SPEED) {
        m.slow += sub;
      } else {
        m.slow = 0;
      }
      if (m.slow >= STOP_TIME || m.age > GIVE_UP) {
        this.settle(m, h);
        return;
      }
    }
  };

  /* Where it stops is where it stays, but snapped: the bottom row sits on a
     16-pixel lattice and each row above is set half a marble over and 14
     pixels up, in the hollow between two below - which is the "magically
     stacking". A marble that stops on a pin, away from the pile, stays put. */
  var ROW = 14;
  Marbles.prototype.slotX = function (k, i) { return CELL * i + R + (k % 2) * R; };
  Marbles.prototype.supported = function (k, i) {
    if (k === 0) { return true; }
    var below = k % 2 ? [i, i + 1] : [i - 1, i];
    return !!(this.slots[(k - 1) + ',' + below[0]] && this.slots[(k - 1) + ',' + below[1]]);
  };

  Marbles.prototype.settle = function (m, h) {
    var spot = null, best = 25;
    var k0 = Math.round((h - R - m.y) / ROW);
    for (var k = Math.max(0, k0 - 1); k <= k0 + 1; k += 1) {
      var i0 = Math.round((m.x - R - (k % 2) * R) / CELL);
      for (var i = i0 - 1; i <= i0 + 1; i += 1) {
        var x = this.slotX(k, i), y = h - R - k * ROW;
        if (x < R || x > this.w - R || this.slots[k + ',' + i] || !this.supported(k, i)) { continue; }
        var d = Math.hypot(x - m.x, y - m.y);
        if (d < best) { best = d; spot = { k: k, i: i, x: x, y: y }; }
      }
    }
    if (spot) { this.slots[spot.k + ',' + spot.i] = true; }
    this.pile.push({
      type: m.sensitive && m.oh > 0 ? SHOCKED : m.type,
      x: spot ? spot.x : m.x,
      y: spot ? spot.y : m.y
    });
    this.ball = null;
    this.wait = NEXT;
    // Once the pile reaches the top there is nowhere left to put one.
    if (m.y < CELL * 2) { this.reset(this.w, h); }
  };

  Marbles.prototype.draw = function (ctx, w, h) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    var i;
    for (i = 0; i < this.pins.length; i += 1) {
      this.pin.draw(ctx, this.pins[i].x, this.pins[i].y);
    }
    for (i = 0; i < this.pile.length; i += 1) {
      var s = this.pile[i];
      this.strip.drawCell(ctx, s.type, CELL, s.x, s.y);
    }
    var m = this.ball;
    if (m) {
      this.strip.drawCell(ctx, m.oh > 0 ? SHOCKED : m.type, CELL, m.x, m.y);
    }
  };

  /* ------------------------------------------------------------ element */

  function MarblesElement() { return Reflect.construct(HTMLElement, [], MarblesElement); }
  MarblesElement.prototype = Object.create(HTMLElement.prototype);
  MarblesElement.prototype.constructor = MarblesElement;
  Object.setPrototypeOf(MarblesElement, HTMLElement);

  MarblesElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var base = this.getAttribute('art') || 'art/marbles2';
    this.style.display = this.style.display || 'block';
    this.style.background = '#000';

    window.AfterDark.load(base).then(function (art) {
      var sim = new Marbles(art);
      sim.setPinSize((AfterDark.setting(self, 'pin-size') || 'big').toLowerCase());

      var pins = (AfterDark.setting(self, 'pins') || '').toLowerCase();
      sim.density = PIN_DENSITY[pins] !== undefined ? PIN_DENSITY[pins] : DEFAULT_DENSITY;

      var speed = (AfterDark.setting(self, 'speed') || 'medium').toLowerCase();
      sim.speed = SPEEDS[speed] || Number(speed) || SPEEDS.medium;

      var redraw = (AfterDark.setting(self, 'redraw') || '5 min').toLowerCase();
      sim.redraw = REDRAW[redraw] || REDRAW['5 min'];

      var screen = new AfterDark.Screen(self);
      self._screen = screen;
      self.sim = sim;
      screen.onresize = function (w, h) { sim.reset(w, h); };
      sim.reset(screen.width, screen.height);
      screen.run(function (dt, ctx, w, h) {
        sim.step(dt, w, h);
        sim.draw(ctx, w, h);
      });
    }).catch(function (err) {
      self.textContent = err.message;
    });
  };

  MarblesElement.prototype.disconnectedCallback = function () {
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-marbles', MarblesElement);
  window.AfterDarkMarbles = Marbles;
  Marbles.PIN_DENSITY = PIN_DENSITY;
  Marbles.REDRAW = REDRAW;
}());
