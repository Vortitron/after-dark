/**
 * string.js - String Theory, moire strung across the screen from edge to edge.
 *
 * STRING.AD ships no artwork. Its own description:
 *
 *   "STRING THEORY (tm) Original idea by James J. Eastman.
 *    Colourful moire patterns that follow the edge of your monitor. For more
 *    variation, select up to 4 strings at the same time."
 *
 * Checked against the original (October 2026): a WINEDEBUG=+relay trace of
 * its pen and line calls and a disassembly of its drawing code. What it
 * does, exactly:
 *
 *   Each group is one string stretched across the screen: it starts either
 *   top edge to bottom edge (x1 in [2, W), x2 in [0, W)) or left edge to
 *   right edge, chosen by a coin. Each step every end moves 2..4 px along its
 *   edge; an end that would leave the screen stays put, turns back, and
 *   carries on along the other edge it is now in the corner of. The speeds
 *   are picked again every 701 steps. Each step draws the new line, a
 *   one-pixel LineTo, and blacks out the one from Strings steps ago (nothing
 *   is taken off with Infinite). The fan of lines a few pixels apart is the
 *   moire.
 *   Colour: on a display of more than 16 colours it uses PALETTEINDEX and a
 *   palette of 235; otherwise, as here, its own 22-colour table (black and
 *   21 cycling VGA colours). Each group starts on a random colour; every
 *   (100 - Color Speed) * 5 steps they all move on one.
 *   Defaults: 3 groups, 140 strings, Color Speed 96 (of 1..100), Clear Screen
 *   First off - it draws over the desktop, and its erasing leaves black
 *   lines across it.
 *
 * Inferred: the speed. It has no timer of its own and runs unthrottled under
 * Wine; 60 steps a second is a choice.
 *
 *   <after-dark-string-theory groups="3" strings="140" color-speed="96">
 */
(function () {
	'use strict';

	var GROUPS = ['1', '2', '3', '4'];
	var STRINGS = ['10', '20', '30', '40', '50', '60', '70', '80', '90', '100',
		'110', '120', '130', '140', '150', 'infinite'];
	var STEPS_PER_SECOND = 60;
	var RESPEED = 701;
	/* Its 22-colour table, index 0 (black) being the eraser. */
	var COLORS = [
		[0, 0, 0], [0, 0, 255], [0, 0, 128], [128, 0, 128], [255, 0, 255], [128, 0, 128],
		[128, 0, 0], [255, 0, 0], [128, 0, 0], [128, 128, 0], [255, 255, 0], [128, 128, 0],
		[85, 85, 85], [255, 255, 255], [170, 170, 170], [0, 128, 0], [0, 255, 0], [0, 128, 0],
		[0, 128, 128], [0, 255, 255], [0, 128, 128], [0, 0, 128]
	];

	function rnd(n) { return Math.floor(Math.random() * n); }

	/**
	 * One end's move along x (axis 0) or y (axis 1): returns the new position.
	 * `e` is {p: [x, y], v: [vx, vy], on: [mx, my]}; `size` is [W, H].
	 */
	function move(e, axis, size) {
		var p = e.p[axis] + e.v[axis] * e.on[axis];
		if (p < 0 || p > size[axis]) {
			e.v[axis] = -e.v[axis];
			e.on[axis] = 0;
			e.on[1 - axis] = 1;
			return e.p[axis];
		}
		e.p[axis] = p;
		return p;
	}

	function StringTheory() {
		this.groups = 3;
		this.strings = 140;
		this.colorSpeed = 96;
		this.clearScreen = false;
		this.w = 0;
	}

	StringTheory.prototype.resize = function (w, h) {
		w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
		this.w = w; this.h = h;
		this.canvas = document.createElement('canvas');
		this.canvas.width = w; this.canvas.height = h;
		var g = this.canvas.getContext('2d');
		g.fillStyle = '#000';
		g.fillRect(0, 0, w, h);
		if (!this.clearScreen) {
			var desk = AfterDark.desktop(w, h);
			if (desk) { g.drawImage(desk, 0, 0, w, h); }
		}
		this.image = g.getImageData(0, 0, w, h);
		this.set = [];
		for (var i = 0; i < this.groups; i += 1) {
			var s;
			if (rnd(2) === 0) {
				s = { a: { p: [rnd(w - 2) + 2, 0], on: [1, 0] }, b: { p: [rnd(w), h], on: [1, 0] } };
			} else {
				s = { a: { p: [0, rnd(h - 2) + 2], on: [0, 1] }, b: { p: [w, rnd(h)], on: [0, 1] } };
			}
			s.color = rnd(COLORS.length);
			s.ring = [];
			this.set.push(s);
		}
		this.head = 0;
		this.tick = 0;
		this.colorTick = 0;
		this.owed = 0;
	};

	StringTheory.prototype.respeed = function () {
		this.set.forEach(function (s) {
			s.a.v = [rnd(3) + 2, rnd(3) + 2];
			s.b.v = [rnd(3) + 2, rnd(3) + 2];
		});
	};

	StringTheory.prototype.line = function (x0, y0, x1, y1, c) {
		var w = this.w, h = this.h, px = this.image.data;
		var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
		var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
		while (x0 !== x1 || y0 !== y1) {		/* LineTo leaves out its last pixel */
			if (x0 >= 0 && y0 >= 0 && x0 < w && y0 < h) {
				var o = (y0 * w + x0) * 4;
				px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
			}
			var e2 = 2 * err;
			if (e2 >= dy) { err += dy; x0 += sx; }
			if (e2 <= dx) { err += dx; y0 += sy; }
		}
	};

	StringTheory.prototype.once = function () {
		var size = [this.w, this.h], self = this;
		var infinite = this.strings === Infinity;
		this.set.forEach(function (s) {
			if (!infinite) {
				var old = s.ring[self.head];
				if (old) { self.line(old[0], old[1], old[2], old[3], COLORS[0]); }
			}
			if (self.tick === 0) { self.respeed(); }
			move(s.a, 0, size); move(s.a, 1, size);
			move(s.b, 0, size); move(s.b, 1, size);
			var l = [s.a.p[0], s.a.p[1], s.b.p[0], s.b.p[1]];
			if (!infinite) { s.ring[self.head] = l; }
			self.line(l[0], l[1], l[2], l[3], COLORS[s.color]);
		});
		if (!infinite) { this.head = (this.head + 1) % this.strings; }
		var every = (100 - this.colorSpeed) * 5;
		this.colorTick += 1;
		if (this.colorTick > every) {
			this.set.forEach(function (s) {
				s.color += 1;
				if (s.color >= COLORS.length) { s.color = 1; }
			});
			this.colorTick = 0;
		}
		this.tick += 1;
		if (this.tick > RESPEED - 1) { this.tick = 0; }
	};

	StringTheory.prototype.step = function (dt, ctx, w, h) {
		if (!this.w) { this.resize(w, h); }
		this.owed = Math.min(this.owed + dt * STEPS_PER_SECOND, 10);
		while (this.owed >= 1) {
			this.owed -= 1;
			this.once();
		}
		this.canvas.getContext('2d').putImageData(this.image, 0, 0);
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(this.canvas, 0, 0, w, h);
	};

	AfterDark.define('after-dark-string-theory', function (el) {
		var sim = new StringTheory();
		sim.groups = Number(GROUPS[AfterDark.choice(el, 'groups', GROUPS, '3')]);
		var strings = STRINGS[AfterDark.choice(el, 'strings', STRINGS, '140')];
		sim.strings = strings === 'infinite' ? Infinity : Number(strings);
		var cs = Number(AfterDark.setting(el, 'color-speed'));
		sim.colorSpeed = AfterDark.setting(el, 'color-speed') !== null && isFinite(cs) ?
			Math.max(1, Math.min(100, Math.round(cs))) : 96;
		sim.clearScreen = AfterDark.flag(el, 'clear-screen');
		return sim;
	});

	window.AfterDarkStringTheory = StringTheory;
	StringTheory.move = move;
}());
