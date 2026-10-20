/**
 * fishpro.js - Fish Pro, on the module's own artwork.
 *
 * FISHPRO.AD, 10th anniversary collection. Its own description:
 *
 *   "FISH PRO. Impress friends with your own multi-million dollar tropical fish
 *    aquarium, courtesy of Berkeley Systems. Click the Select Fish... button to
 *    see the different species. Select them all or choose your favorites.
 *    'Fish' selects the number of fish on the screen. 'Show Sea Floor' whether
 *    or not the sea floor is displayed. Just for fun, hit the Caps Lock key and
 *    watch the fish scatter!"
 *   Programming by Jeff Thomas and Bruce Burkhalter. Art by Dana Muise.
 *
 * The settings are the module's own, out of TYPE_1000: Fish = Solo / Study
 * Group / Class / School / University, and Show Sea Floor = None / Static /
 * Animated. The species names are its STRINGLIST 666.
 *
 * Artwork, from tools/adweb.py:
 *   3010-3080, 3110  nine species
 *   5000  three rocks      5010  a 577x45 sea floor to tile
 *   5020  five corals      6000-6030  four anemones, six frames each
 *   7000  a bubble stream, six frames
 *
 * Most species are drawn in pieces: a body, and short runs of small frames
 * for the head (working its mouth), the tail (swishing) and sometimes a fin,
 * each butted onto the body. Where each piece goes was measured by matching
 * the art against the module running under Wine at 1024x768 (24-bit,
 * 2026-10-15): every fish there is drawn at its own size, whole, with its
 * tail on. The offsets in `pieces` below are those, in the art's own
 * coordinates (x from the body's left edge, y from its top); a piece whose
 * frames differ in size keeps one edge and its middle where the capture puts
 * them. The Yellow Tang and the Red Clown are the exception: they are whole
 * in one frame, and their strips are a real rotation - broadside, round
 * through edge-on, out the other side - so those two turn by walking the
 * pivot, flipping at the edge-on end and walking back. The rest turn by
 * mirroring.
 *
 * Also from the capture: the sea floor is one fixed arrangement - a heap of
 * rocks at each end with an anemone on it, tube coral on the left, the sand
 * between - and bubbles rise from the right-hand heap all the way up the
 * screen at about 50 px a second. The jellyfish hang near the left and barely
 * move. Fish swim at 17 to 47 px a second. Still guessed: how often a
 * bubble cluster goes up, and how the turn-view frames would be paired.
 *
 *   <after-dark-fishpro fish="school" sea-floor="static"></after-dark-fishpro>
 */
(function () {
  'use strict';

  /* A piece is a list of [frame, dx, dy] played in turn. */
  function run(first, last, dx, cy, rightEdge) {
    var out = [];
    for (var k = first; k <= last; k += 1) { out.push([k, dx, cy, rightEdge]); }
    return out;
  }

  /* id, name from STRINGLIST 666, the body frames, the pieces, the pivot out
     to edge-on for the two that have one, and which way the art faces (-1
     left, +1 right, 0 for the jellyfish, which has no left or right and is
     never mirrored). In `run`, dx is the piece's left edge - or, with
     rightEdge, its right edge - and cy the middle of it, from the body. */
  var SPECIES = [
    { id: '3010', name: 'Yellow Tang',    body: [0, 4],  pivot: [5, 6, 7],                   faces: -1 },
    { id: '3020', name: 'Red Clown',      body: [12, 18], pivot: [11, 10, 9, 8, 7, 6, 5, 4], faces: -1 },
    { id: '3030', name: 'Blue Tanger',    body: [0, 0],  faces: -1,
      pieces: [run(6, 8, -27, 27), run(9, 16, 62, 27)] },
    { id: '3040', name: 'Trigger Fish',   body: [0, 2],  faces: -1,
      pieces: [run(3, 4, -12, 36), run(5, 6, 79, 32)] },
    { id: '3050', name: 'Pink Squirrel',  body: [0, 0],  faces: -1,
      pieces: [run(10, 13, 26, 43), run(15, 18, 87, 22)] },
    { id: '3070', name: 'Butterfly Fish', body: [0, 3],  faces: 1,
      pieces: [run(4, 10, 6, 34, true)] },
    { id: '3080', name: 'Emperor',        body: [0, 0],  faces: -1,
      pieces: [run(1, 3, -17, 28), run(12, 21, 64, 25)] },
    { id: '3060', name: 'Jellyfish',      body: [0, 4],                                      faces: 0 },
    { id: '3110', name: 'Sardines',       body: [0, 4],                                      faces: -1 }
  ];

  var COUNTS = {
    'solo': 1, 'study group': 3, 'class': 7, 'school': 14, 'university': 25
  };

  var FLOOR = '5010', ROCKS = '5000', CORAL = '5020', BUBBLES = '7000';
  var ANEMONES = ['6000', '6010', '6020', '6030'];

  // "Show Sea Floor", the module's own three settings: nothing, the floor and
  // its scenery standing still, or the anemones opening and the bubbles going.
  var SEA_FLOOR = ['none', 'static', 'animated'];

  var SWIM = 3.5;              // broadside cycle, frames per second
  var PIVOT = 14;              // how fast it goes through the turn
  var ANEMONE = 3;             // anemone open/close, frames per second
  var BUBBLE = 6;
  var RISE = 50;               // px a second, bubbles going up

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  /** Where piece frame `p` ([frame, dx, cy, rightEdge]) sits, from the body's top left. */
  function place(seq, p) {
    var f = seq.frames[p[0]];
    return { f: f, x: p[3] ? p[1] - f.w : p[1], y: Math.round(p[2] - f.h / 2) };
  }

  /** The whole fish's box: body frame `b` plus each piece at step `t`. */
  function pieceBox(spec, seq, b, t) {
    var body = seq.frames[b], box = { x0: 0, y0: 0, x1: body.w, y1: body.h };
    (spec.pieces || []).forEach(function (piece) {
      var q = place(seq, piece[t % piece.length]);
      box.x0 = Math.min(box.x0, q.x);
      box.y0 = Math.min(box.y0, q.y);
      box.x1 = Math.max(box.x1, q.x + q.f.w);
      box.y1 = Math.max(box.y1, q.y + q.f.h);
    });
    return box;
  }

  function FishPro(art) {
    this.art = art;
    this.species = [];
    var i;
    for (i = 0; i < SPECIES.length; i += 1) {
      var spec = SPECIES[i];
      var seq = art.sequence(spec.id);
      if (!seq) { continue; }
      spec.pivot = spec.pivot || [];
      // How big the fish is once its pieces are on, which is what the edge
      // tests want rather than the sequence's nominal size.
      var box = pieceBox(spec, seq, spec.body[0], 0);
      this.species.push({ spec: spec, seq: seq, width: box.x1 - box.x0, height: Math.max(seq.height, box.y1 - box.y0) });
    }
    this.floor = art.sequence(FLOOR);
    this.rocks = art.sequence(ROCKS);
    this.coral = art.sequence(CORAL);
    this.bubbles = art.sequence(BUBBLES);
    this.anemones = [];
    for (i = 0; i < ANEMONES.length; i += 1) {
      var a = art.sequence(ANEMONES[i]);
      if (a) { this.anemones.push(a); }
    }

    this.chosen = null;        // null means every species, as "Select Fish..."
    this.count = COUNTS.school;
    this.seaFloor = 'static';
    this.fish = [];
    this.props = [];
    this.streams = [];
  }

  FishPro.prototype.pool = function () {
    var chosen = this.chosen;
    if (!chosen) { return this.species; }
    var out = this.species.filter(function (s) {
      return chosen.indexOf(s.spec.name.toLowerCase()) >= 0;
    });
    return out.length ? out : this.species;
  };

  FishPro.prototype.floorHeight = function () {
    return this.seaFloor === 'none' || !this.floor ? 0 : this.floor.height * (this.scale || 1);
  };

  /* Depth is the one thing the artwork asks for that the resources don't
     record: the species are drawn in perspective and turn through the viewer's
     plane, so they are set back in the tank at a size to match. */
  FishPro.prototype.spawn = function (w, h, anywhere) {
    var s = pick(this.pool());
    // Back to front at random. The module draws every fish at its own size.
    var depth = Math.random();
    var scale = this.scale || 1;
    var right = Math.random() < 0.5;
    var deep = h - this.floorHeight();
    var high = s.height * scale * 0.6;
    // The jellyfish hardly moves; the fish swim at 17 to 47 px a second.
    var pace = s.spec.faces === 0 ? rand(1, 4) : 17 + depth * 30;
    return {
      s: s,
      depth: depth,
      scale: scale,
      right: right,
      speed: pace * scale * (right ? 1 : -1),
      x: anywhere ? rand(0, w) : (right ? -s.width : w + s.width),
      y: rand(high, Math.max(high + 1, deep - high * 0.4)),
      drift: rand(-7, 7),
      cycle: rand(0, 8),
      turn: 0,                  // 0 while cruising, else how far along the pivot
      turning: 0                // +1 out, -1 back
    };
  };

  FishPro.prototype.reset = function (w, h) {
    var i;
    // Everything at its own size on a 1024x768 screen.
    this.scale = Math.max(1, Math.round(Math.min(w, h) / 768));
    this.fish = [];
    for (i = 0; i < this.count; i += 1) { this.fish.push(this.spawn(w, h, true)); }
    this.sort();

    // Scenery is rooted, so it is placed once and only redrawn. It is the
    // module's own arrangement, measured off the capture at 1024x768: each
    // entry is [sequence, frame, left edge from the screen's left (or, for
    // the right-hand heap, the same distance from its right), height of its
    // bottom above the screen's bottom, mirrored]. Both heaps use the same
    // art the same way round; only where things stand is mirrored.
    this.props = [];
    this.streams = [];
    this.nextBubble = 1;
    if (this.seaFloor === 'none') { return; }
    var k = this.scale, self = this;
    var HEAP = [[ROCKS, 1, 0, 0], [ROCKS, 2, 75, 0], [CORAL, 2, 49, 0, true], [CORAL, 3, 115, 0, true],
      [CORAL, 4, 172, 0, true]];
    var put = function (id, frame, x, up, flip, right, still) {
      var seq = self.art.sequence(id);
      if (!seq) { return; }
      var f = seq.frames[frame % seq.count];
      var left = right ? w - (x + f.w) * k : x * k;
      self.props.push({ seq: seq, frame: frame, still: still !== false, flip: !!flip,
        x: left + f.w * k / 2, y: h - up * k - f.h * k / 2 });
    };
    HEAP.forEach(function (r) { put(r[0], r[1], r[2], r[3], r[4], false); });
    HEAP.forEach(function (r) { put(r[0], r[1], r[2], r[3], r[4], true); });
    put(CORAL, 1, 285, 34, false, false);
    // A boulder in front of the coral, and its partner on the right.
    put(CORAL, 4, 290, 0, true, false);
    put(CORAL, 4, 211, 0, true, true);
    // An anemone on each heap, open. Its six frames are it opening.
    put(ANEMONES[2], 5, 305, 27, true, false, false);
    put(ANEMONES[2], 5, 279, 23, true, true, false);
  };

  /* Back of the tank first, so the near fish pass in front. */
  FishPro.prototype.sort = function () {
    this.fish.sort(function (a, b) { return a.depth - b.depth; });
  };

  /** The Caps Lock key, which the module's own description tells you to press. */
  FishPro.prototype.scatter = function () {
    for (var i = 0; i < this.fish.length; i += 1) {
      var f = this.fish[i];
      f.speed *= 3.4;
      f.drift = rand(-40, 40);
    }
  };

  FishPro.prototype.step = function (dt, w, h) {
    var i, f, spec, resort = false;
    for (i = 0; i < this.fish.length; i += 1) {
      f = this.fish[i];
      spec = f.s.spec;

      if (f.turning) {
        f.turn += PIVOT * dt * f.turning;
        if (f.turn >= spec.pivot.length) {
          // Edge-on: this is where the mirror happens and the pivot runs back.
          f.turn = spec.pivot.length - 0.001;
          f.turning = -1;
          f.right = !f.right;
          f.speed = -f.speed;
        } else if (f.turn <= 0) {
          f.turn = 0;
          f.turning = 0;
        }
      } else {
        f.x += f.speed * dt;
        f.y += f.drift * dt;
        f.cycle += SWIM * dt;
        if (Math.abs(f.speed) > 90) { f.speed *= Math.pow(0.4, dt); }   // after a scatter
      }

      var high = f.s.height * f.scale * 0.55;
      var deep = h - this.floorHeight() - high * 0.3;
      if (f.y < high || f.y > deep) { f.drift = -f.drift; f.y = Math.min(Math.max(f.y, high), deep); }

      // Turn round before swimming off, if the species has the art for it.
      var pad = f.s.width * f.scale;
      var out = f.speed > 0 ? f.x > w - pad * 0.4 : f.x < pad * 0.4;
      if (out && !f.turning) {
        if (spec.pivot.length) { f.turning = 1; }
        else { f.speed = -f.speed; f.right = !f.right; }
      }
      if (f.x < -pad * 2 || f.x > w + pad * 2) {
        this.fish[i] = this.spawn(w, h, false);
        resort = true;
      }
    }
    // A replacement arrives at a new depth, so the back-to-front order has to
    // be redone or the tank slowly stops having any.
    if (resort) { this.sort(); }

    for (i = 0; i < this.props.length; i += 1) {
      if (!this.props[i].still && this.seaFloor === 'animated') {
        this.props[i].frame += ANEMONE * dt;
      }
    }
    // Bubbles go up from the right-hand heap, a cluster every few seconds,
    // all the way to the top.
    if (this.bubbles && this.seaFloor !== 'none') {
      this.nextBubble -= dt;
      if (this.nextBubble <= 0) {
        this.nextBubble = rand(4, 7);
        this.streams.push({ x: w - rand(130, 170) * this.scale, y: h - 70 * this.scale, frame: rand(0, 6) });
      }
    }
    for (i = this.streams.length - 1; i >= 0; i -= 1) {
      this.streams[i].frame += BUBBLE * dt;
      this.streams[i].y -= RISE * this.scale * dt;
      if (this.streams[i].y < -this.bubbles.height * this.scale) { this.streams.splice(i, 1); }
    }
  };

  /* An anemone opens and closes rather than looping, so its six frames are
     played there and back. */
  function pingpong(frame, count) {
    var span = (count - 1) * 2 || 1;
    var t = Math.floor(frame) % span;
    return t < count ? t : span - t;
  }

  /* The whole fish, body plus its pieces, centred on the fish and mirrored
     as a unit so the head stays on the leading end. */
  FishPro.prototype.drawFish = function (ctx, f) {
    var spec = f.s.spec, seq = f.s.seq, t = Math.floor(f.cycle), b, pieces = [];

    if (f.turning) {
      b = spec.pivot[Math.min(spec.pivot.length - 1, Math.floor(f.turn))];
    } else {
      var lo = spec.body[0], hi = spec.body[1];
      b = lo + (hi > lo ? t % (hi - lo + 1) : 0);
      pieces = spec.pieces || [];
    }
    var body = seq.frames[b];
    var box = f.turning ? { x0: 0, y0: 0, x1: body.w, y1: body.h } : pieceBox(spec, seq, b, t);
    var ox = -(box.x0 + box.x1) / 2, oy = -(box.y0 + box.y1) / 2;
    // faces 0 is a creature with no left or right, so it is never mirrored.
    var flip = spec.faces !== 0 && (f.right ? spec.faces < 0 : spec.faces > 0);

    ctx.save();
    ctx.translate(Math.round(f.x), Math.round(f.y));
    if (flip) { ctx.scale(-1, 1); }
    ctx.scale(f.scale, f.scale);
    ctx.drawImage(seq.image, body.x, body.y, body.w, body.h,
                  Math.round(ox), Math.round(oy), body.w, body.h);
    for (var i = 0; i < pieces.length; i += 1) {
      var q = place(seq, pieces[i][t % pieces[i].length]);
      ctx.drawImage(seq.image, q.f.x, q.f.y, q.f.w, q.f.h,
                    Math.round(ox + q.x), Math.round(oy + q.y), q.f.w, q.f.h);
    }
    ctx.restore();
  };

  FishPro.prototype.draw = function (ctx, w, h) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    var i, x, p;
    var k = this.scale || 1;
    if (this.seaFloor !== 'none' && this.floor) {
      // The sand, centred, and repeated out to the sides of a wide screen.
      var fw = this.floor.width * k, x0 = w / 2 - fw / 2;
      while (x0 > 0) { x0 -= fw; }
      for (x = x0; x < w; x += fw) {
        this.floor.draw(ctx, 0, x + fw / 2, h - this.floor.height * k / 2, { scale: k });
      }
    }
    for (i = 0; i < this.props.length; i += 1) {
      p = this.props[i];
      p.seq.draw(ctx, p.still || this.seaFloor !== 'animated' ? p.frame : pingpong(p.frame, p.seq.count),
                 p.x, p.y, { flipX: p.flip, scale: k });
    }
    for (i = 0; i < this.fish.length; i += 1) { this.drawFish(ctx, this.fish[i]); }
    for (i = 0; i < this.streams.length; i += 1) {
      p = this.streams[i];
      this.bubbles.draw(ctx, Math.floor(p.frame), p.x, p.y, { scale: k });
    }
  };

  /* ------------------------------------------------------------ element */

  function FishProElement() { return Reflect.construct(HTMLElement, [], FishProElement); }
  FishProElement.prototype = Object.create(HTMLElement.prototype);
  FishProElement.prototype.constructor = FishProElement;
  Object.setPrototypeOf(FishProElement, HTMLElement);

  FishProElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var base = this.getAttribute('art') || 'art/fishpro';
    this.style.display = this.style.display || 'block';
    this.style.background = '#000';

    window.AfterDark.load(base).then(function (art) {
      var sim = new FishPro(art);
      var fish = (AfterDark.setting(self, 'fish') || 'school').toLowerCase();
      sim.count = COUNTS[fish] || parseInt(fish, 10) || COUNTS.school;
      var floor = AfterDark.setting(self, 'sea-floor');
      if (floor !== null) {
        floor = floor.toLowerCase();
        // A bare sea-floor attribute means show it; anything unrecognised
        // gets the module's own default rather than silently becoming static.
        if (floor === '' || floor === 'yes') { floor = 'animated'; }
        sim.seaFloor = SEA_FLOOR.indexOf(floor) >= 0 ? floor : sim.seaFloor;
      }
      var only = AfterDark.setting(self, 'select-fish');
      if (only) {
        sim.chosen = only.toLowerCase().split(',').map(function (s) { return s.trim(); });
      }

      var screen = new AfterDark.Screen(self);
      self._screen = screen;
      self.sim = sim;
      screen.onresize = function (w, h) { sim.reset(w, h); };
      sim.reset(screen.width, screen.height);

      // "Just for fun, hit the Caps Lock key and watch the fish scatter!"
      self._onKey = function (e) {
        if (e.key === 'CapsLock' ||
            (e.getModifierState && e.getModifierState('CapsLock'))) {
          sim.scatter();
        }
      };
      window.addEventListener('keydown', self._onKey);

      screen.run(function (dt, ctx, w, h) {
        sim.step(dt, w, h);
        sim.draw(ctx, w, h);
      });
    }).catch(function (err) {
      self.textContent = err.message;
    });
  };

  FishProElement.prototype.disconnectedCallback = function () {
    if (this._onKey) { window.removeEventListener('keydown', this._onKey); this._onKey = null; }
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-fishpro', FishProElement);
  window.AfterDarkFishPro = FishPro;
}());
