/**
 * rose.js - Rose, two wheels turning and a pen of coloured dots.
 *
 * ROSE.AD ships no artwork. Its own description:
 *
 *   "ROSE (tm) Original design and concept by Ben Haller.
 *    Rose was first conceived, in a rudimentary way, on an IBM PC in BASIC
 *    many years ago ... It's based on trigonometry, that most hated and most
 *    beautiful of mathematical subjects."
 *
 * Checked against the original (October 2026): a WINEDEBUG=+relay trace of
 * its SetPixel calls and a disassembly of its drawing code (segment 2). What
 * it does, exactly:
 *
 *   Every frame it draws one closed figure of 240/step dots,
 *     x = cx + C (B sin(A u) + sin(t + u)),  y = cy + C (B cos(A u) + cos(t + u)),
 *   u stepping by step * 1.5 degrees from one dot to the next, t turning
 *   1.5 degrees a frame. A is 0, 1, 4, 9 or 16, B one of -1.28..1.24 (the
 *   RCDATA 1 table), C = R sqrt(i) / 5.7 for i in 0..31, R = 4/9 of the
 *   smaller half-screen. A, B and C glide linearly to new random targets
 *   over 250 frames (s += 0.004 until it reaches 0.999). sin(A u) comes from
 *   a 128-step table (the angle is floored to it), sin(t + u) from a 1.5
 *   degree one.
 *   Each dot is one pixel (Big Dots: a 2x2 square); a ring buffer of the
 *   last N dots is kept and the oldest is blacked out as each new one is
 *   drawn, so the trail is N dots long.
 *   Colour: 50 entries, red x8, magenta x8, blue x8, cyan x8, green x9,
 *   yellow x9, indexed by floor(u * 50 / 2pi) + frame, mod 50.
 *   Speed picks the step (Lethargic 1, Slow 2, Moving 4, Fast 10, Swift 15,
 *   Quick 20); Trail Length and the step pick N (table below). The panel's
 *   defaults are Quick and Medium (288 dots).
 *
 * Inferred: the frame rate. Under Wine it runs unthrottled (a whole new
 * figure every video frame); 30 frames a second is a choice.
 *
 *   <after-dark-rose speed="quick" trail-length="medium" big-dots>
 */
(function () {
	'use strict';

	var SPEEDS = ['lethargic', 'slow', 'moving', 'fast', 'swift', 'quick'];
	var STEP = [1, 2, 4, 10, 15, 20];
	var TRAILS = ['shortest', 'short', 'medium', 'long', 'longest'];
	var FPS = 30;
	var DEG = Math.PI / 120;			/* 1.5 degrees */
	var A_TAB = [0, 1, 4, 9, 16];
	var B_TAB = [];
	(function () {
		/* RCDATA 1: two interleaved runs of -1.28 + 0.04 k. */
		var i;
		for (i = 0; i < 32; i += 1) { B_TAB.push(Math.round(-128 + 16 * (i >> 1) + 4 * (i & 1)) / 100); }
		for (i = 0; i < 32; i += 1) { B_TAB.push(Math.round(-120 + 16 * (i >> 1) + 4 * (i & 1)) / 100); }
	}());
	var COLORS = [];
	(function () {
		var runs = [['#f00', 8], ['#f0f', 8], ['#00f', 8], ['#0ff', 8], ['#0f0', 9], ['#ff0', 9]];
		runs.forEach(function (r) { for (var k = 0; k < r[1]; k += 1) { COLORS.push(r[0]); } });
	}());

	/** Trail length in dots, as ROSE.AD works it out from both controls. */
	function trailLength(step, trail) {
		/* trail: 0 shortest .. 4 longest; the code's own index runs 5..0. */
		var t = 5 - trail;
		if (t <= 2) { return [960, 720, 480][t]; }
		if (step === 1) { return t === 3 ? 480 : 240; }
		if (step === 2) { return [360, 240, 120][t - 3]; }
		if (step === 4 || step === 6) { return [240, 120, step === 4 ? 60 : 40][t - 3]; }
		return [288, 96, step === 10 ? 24 : step === 15 ? 16 : 12][t - 3];
	}

	function pick(tab) { return tab[Math.floor(Math.random() * tab.length)]; }

	function Rose() {
		this.step_ = 20;
		this.trail = 2;
		this.bigDots = false;
		this.owed = 0;
		this.reset(1024, 768);
	}

	Rose.prototype.reset = function (w, h) {
		this.cx = Math.floor(w / 2);
		this.cy = Math.floor(h / 2);
		this.R = Math.floor(Math.min(this.cx, this.cy) * 4 / 9);
		this.n = trailLength(this.step_, this.trail);
		this.xs = new Int32Array(this.n);
		this.ys = new Int32Array(this.n);
		this.head = 0;
		this.frame = 0;
		this.t = 0;
		this.s = 0;
		/* Starts from A, B as random picks and C = 0, gliding out. */
		this.a0 = pick(A_TAB); this.b0 = pick(B_TAB); this.c0 = 0;
		this.a1 = pick(A_TAB); this.b1 = pick(B_TAB); this.c1 = this.randC();
		this.cleared = false;
	};

	Rose.prototype.randC = function () {
		return this.R * Math.sqrt(Math.floor(Math.random() * 32)) * 10 / 57;
	};

	Rose.prototype.resize = function (w, h) {
		this.reset(w, h);
	};

	Rose.prototype.frameOnce = function (ctx) {
		var s = this.s;
		var A = this.a0 + (this.a1 - this.a0) * s;
		var B = this.b0 + (this.b1 - this.b0) * s;
		var C = this.c0 + (this.c1 - this.c0) * s;
		var size = this.bigDots ? 2 : 1;
		var step = this.step_;
		for (var k = 1; k * step <= 240; k += 1) {
			var u = k * step * DEG;
			var ti = (this.t + k * step) % 240;
			ctx.fillStyle = '#000';
			ctx.fillRect(this.xs[this.head], this.ys[this.head], size, size);
			var di = Math.floor(u * A * 128 / (2 * Math.PI)) & 127;
			var ang = di * 2 * Math.PI / 128;
			var x = this.cx + Math.floor(C * (B * Math.sin(ang) + Math.sin(ti * DEG)));
			var y = this.cy + Math.floor(C * (B * Math.cos(ang) + Math.cos(ti * DEG)));
			this.xs[this.head] = x;
			this.ys[this.head] = y;
			ctx.fillStyle = COLORS[(Math.floor(u * 50 / (2 * Math.PI)) + this.frame) % 50];
			ctx.fillRect(x, y, size, size);
			this.head = (this.head + 1) % this.n;
		}
		this.s += 0.004;
		if (this.s >= 0.999) {
			this.a0 = this.a1; this.b0 = this.b1; this.c0 = this.c1;
			this.a1 = pick(A_TAB); this.b1 = pick(B_TAB); this.c1 = this.randC();
			this.s = 0;
		}
		this.frame = (this.frame + 1) % 50;
		this.t = (this.t + 1) % 240;
	};

	Rose.prototype.step = function (dt, ctx, w, h) {
		if (!this.cleared) {
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);
			this.cleared = true;
		}
		this.owed = Math.min(this.owed + dt * FPS, 4);
		while (this.owed >= 1) {
			this.owed -= 1;
			this.frameOnce(ctx);
		}
	};

	AfterDark.define('after-dark-rose', function (el) {
		var sim = new Rose();
		sim.step_ = STEP[AfterDark.choice(el, 'speed', SPEEDS, 'quick')];
		sim.trail = AfterDark.choice(el, 'trail-length', TRAILS, 'medium');
		sim.bigDots = AfterDark.flag(el, 'big-dots');
		sim.reset(1024, 768);
		return sim;
	});

	window.AfterDarkRose = Rose;
}());
