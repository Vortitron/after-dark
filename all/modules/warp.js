/**
 * warp.js - Warp!, flying through the stars.
 *
 * WARP.AD ships no artwork. Its own description:
 *
 *   "WARP! (tm)
 *    'Speed' controls the speed and direction of travel through the stars.
 *    'Size' controls the size of the stars.
 *    'Number of Stars' controls the number of stars displayed.
 *    'Color' allows color stars for those with color monitors.
 *    Rotational stellar effects and black hole designed by Bill Stewart and
 *    Jack Eastman."
 *
 * Checked against the original running under Wine (October 2026), from
 * +relay traces of its SetPixel calls at six of the eight speeds (the stars
 * are single white pixels that an 8-bit screen capture all but loses):
 *
 * - Defaults, from its TYPE_1000: Speed Fast In, Stars 71 (a 1-200 slider),
 *   Size Small, Color off. So by default it is 71 one-pixel white stars.
 * - Each frame every star is erased and redrawn. Its 3-D position is
 *   projected about the screen centre, its depth steps by 6, 4, 2 or 1 (Fast,
 *   Medium, Slow, Impulse) against a birth depth of about 100, and the whole
 *   field turns pi/100 radians a frame - clockwise going In, anticlockwise
 *   going Out. That turn is the "rotational stellar effect".
 * - In is the black hole: stars are born on the edge of a box 15/16 of the
 *   screen and fall away from you, spiralling into the middle, where they
 *   bunch up until they reach a box about 50 x 42 px round the centre and
 *   are born again on the edge.
 * - Out is the familiar starfield: stars are born inside the middle 3/8 of
 *   the screen and come towards you until they leave it.
 *
 * Under Wine it runs unthrottled (it never reads the clock), so the frame
 * rate here, FPS, is chosen. Impulse's step was too slow to see a birth in
 * the trace and is taken as 1; Big (2 x 2 here) and the Color palette were not
 * traced and are inferred.
 *
 *   <after-dark-warp speed="fast in" stars="71" size="small">
 */
(function () {
	'use strict';

	var SPEEDS = ['fast in', 'medium in', 'slow in', 'impulse in',
		'impulse out', 'slow out', 'medium out', 'fast out'];
	/* Depth a frame; a star is born at depth BIRTH. */
	var VELOCITY = [6, 4, 2, 1, -1, -2, -4, -6];
	var BIRTH = 100;
	var TURN = Math.PI / 100;
	var FPS = 30;
	var SIZES = ['small', 'big', 'both'];
	/* The EGA colours that read as stars. */
	var COLOURS = [[255, 255, 255], [255, 255, 85], [85, 255, 255], [255, 85, 85],
		[85, 85, 255], [255, 85, 255], [85, 255, 85]];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Warp() {
		this.velocity = VELOCITY[0];
		this.count = 71;
		this.size = 0;
		this.color = false;
		this.stars = [];
		this.roll = 0;
		this.clock = 0;
	}

	/**
	 * A new star at the birth depth. Positions are in screen pixels as seen at
	 * that depth, before the roll, so (x, y) * BIRTH / z is where it shows.
	 */
	Warp.prototype.place = function (s) {
		var hw = this.w / 2, hh = this.h / 2;
		s.z = BIRTH;
		if (this.velocity > 0) {
			/* Somewhere on the edge of the 15/16 box. */
			var bw = hw * 15 / 16, bh = hh * 15 / 16;
			var along = Math.random() * 2 * (bw + bh);
			var side = Math.random() < 0.5 ? -1 : 1;
			if (along < 2 * bw) {
				s.x = along - bw; s.y = side * bh;
			} else {
				s.x = side * bw; s.y = along - 2 * bw - bh;
			}
		} else {
			s.x = rand(-hw, hw) * 3 / 8;
			s.y = rand(-hh, hh) * 3 / 8;
		}
		/* Undo the roll so it is born where it was picked on screen. */
		var c = Math.cos(-this.roll), n = Math.sin(-this.roll);
		var x = s.x * c - s.y * n, y = s.x * n + s.y * c;
		s.x = x; s.y = y;
		s.big = this.size === 1 || (this.size === 2 && Math.random() < 0.5);
		s.rgb = this.color ? COLOURS[Math.floor(Math.random() * COLOURS.length)] : COLOURS[0];
		return s;
	};

	/** Where a star shows, or null once it has gone (into the hole, or off screen). */
	Warp.prototype.project = function (s) {
		if (s.z <= 0) { return null; }
		var c = Math.cos(this.roll), n = Math.sin(this.roll);
		var k = BIRTH / s.z;
		var x = (s.x * c - s.y * n) * k, y = (s.x * n + s.y * c) * k;
		var sx = this.w / 1024, sy = this.h / 768;
		if (this.velocity > 0) {
			if (Math.abs(x) < 25 * sx && y > -23 * sy && y < 19 * sy) { return null; }
		} else if (Math.abs(x) > this.w / 2 || Math.abs(y) > this.h / 2) {
			return null;
		}
		return { x: this.w / 2 + x, y: this.h / 2 + y };
	};

	Warp.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.stars = [];
		/* Start in the steady state: each star already some way along. */
		for (var i = 0; i < this.count; i += 1) {
			var s = this.place({});
			var steps = Math.floor(Math.random() * 400);
			for (var j = 0; j < steps; j += 1) {
				var z = s.z + this.velocity;
				var t = { x: s.x, y: s.y, z: z };
				if (!this.project(t)) { break; }
				s.z = z;
			}
			this.stars.push(s);
		}
	};

	/** One frame of the original: every star moves one step and the field turns. */
	Warp.prototype.advance = function () {
		this.roll += this.velocity > 0 ? TURN : -TURN;
		for (var i = 0; i < this.stars.length; i += 1) {
			var s = this.stars[i];
			s.z += this.velocity;
			if (!this.project(s)) { this.place(s); }
		}
	};

	Warp.prototype.step = function (dt, ctx, w, h) {
		this.clock += dt;
		var n = 0;
		while (this.clock >= 1 / FPS && n < 5) {
			this.clock -= 1 / FPS;
			this.advance();
			n += 1;
		}
		if (n === 5) { this.clock = 0; }

		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		for (var i = 0; i < this.stars.length; i += 1) {
			var s = this.stars[i];
			var p = this.project(s);
			if (!p) { continue; }
			ctx.fillStyle = 'rgb(' + s.rgb[0] + ',' + s.rgb[1] + ',' + s.rgb[2] + ')';
			ctx.fillRect(Math.floor(p.x), Math.floor(p.y), s.big ? 2 : 1, s.big ? 2 : 1);
		}
	};

	AfterDark.define('after-dark-warp', function (el) {
		var sim = new Warp();
		sim.velocity = VELOCITY[AfterDark.choice(el, 'speed', SPEEDS, 'fast in')];
		var stars = parseInt(AfterDark.setting(el, 'stars'), 10);
		sim.count = stars >= 1 && stars <= 200 ? stars : 71;
		sim.size = AfterDark.choice(el, 'size', SIZES, 'small');
		sim.color = AfterDark.flag(el, 'color');
		return sim;
	});

	window.AfterDarkWarp = Warp;
	Warp.SPEEDS = SPEEDS;
	Warp.VELOCITY = VELOCITY;
}());
