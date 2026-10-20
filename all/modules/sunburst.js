/**
 * sunburst.js - Sunburst, rings of coloured spikes opening out from the centre.
 *
 * SUNBURST.AD ships no artwork and hardly a description: "SUNBURST(TM).
 * Dedicated to Anna Bensen, with contributions from Jon Benton and Ellen
 * Lewis and Connie Barker." Its one control is Delay, Slowest to Fastest.
 *
 * Checked against the original (October 2026): a WINEDEBUG=+relay trace
 * (Polygon, SetRect, CreateSolidBrush and GetTickCount calls, with times)
 * and a disassembly of its drawing code. What it does, exactly:
 *
 *   A pattern is 13 rings (25 in one mode) round the screen centre. A ring
 *   is n/2 triangles, each filled with a solid brush and outlined by the
 *   default black pen: base on radius r1 between angles a and a + 2 step,
 *   tip on radius r2 at a + step, step = 360/n degrees. The angle carries
 *   on from ring to ring (each ring ends one step short of a full turn, so
 *   the next one's spikes sit between this one's).
 *   n is 16 for the first four patterns, then one of (6 12 24 48),
 *   (8 16 32 64) or (10 20 30 40).
 *   A pattern starts at r1 = 4, r2 = 4 + [0, 40], and grows one of four ways:
 *    - stepped: every other ring is the same ring turned inside out (r1 and
 *      r2 swapped), then the next starts at the outer radius and is 10..70
 *      thicker; 3 in 4 times the angle also steps on between them;
 *    - random: 25 rings with radii anywhere in 10..230;
 *    - out: each ring starts where the last ended, 10..70 further out;
 *    - in (1 in 4): from r1 40..80, r2 200..240, r2 shrinks by 10 and r1 by
 *      0..5 a ring; when they cross, r1 jumps to 2..-78 and r2 to 200..240.
 *   Colour: a fresh random colour every ring, or one colour for the whole
 *   pattern. A random colour is black 1 time in 10, otherwise each of R, G,
 *   B is two random 0..30000s plus 4000 (its top byte taken), and then 6
 *   times in 7 one or two of them are knocked down to 0..5.
 *   The screen is never cleared: each pattern draws over the last. Between
 *   patterns it waits (100 - Delay) * 30 ms, a quarter of the time half
 *   that. Delay's stops are Slowest 30, Slow 50, Medium 70, Fast 90,
 *   Fastest 100; the default is Slow (1.5 s, measured).
 *
 * Inferred: how fast the rings go down. Under Wine a pattern appears at
 * once; 30 rings a second is a choice.
 *
 *   <after-dark-sunburst delay="slow">
 */
(function () {
	'use strict';

	var DELAYS = ['slowest', 'slow', 'medium', 'fast', 'fastest'];
	var DELAY_VALUE = [30, 50, 70, 90, 100];
	var RINGS_PER_SECOND = 30;
	var SYMMETRY = [[6, 12, 24, 48], [8, 16, 32, 64], [10, 20, 30, 40]];

	/** SUNBURST.AD's random(n): 0..n inclusive. */
	function rnd(n) { return Math.floor(Math.random() * (n + 1)); }

	function randomColor() {
		if (rnd(9) < 1) { return [0, 0, 0]; }
		var c = [0, 1, 2].map(function () { return rnd(30000) + rnd(30000) + 4000; });
		var low = function () { return rnd(1500); };
		switch (rnd(6)) {
		case 0: c[0] = low(); break;
		case 1: c[1] = low(); break;
		case 2: c[2] = low(); break;
		case 3: c[0] = low(); c[1] = low(); break;
		case 4: c[0] = low(); c[2] = low(); break;
		case 5: c[2] = low(); c[1] = low(); break;
		}
		return c.map(function (v) { return v >> 8; });
	}

	function Sunburst() {
		this.delay = DELAY_VALUE[1];
		this.w = 0;
	}

	Sunburst.prototype.resize = function (w, h) {
		this.w = Math.max(1, Math.round(w));
		this.h = Math.max(1, Math.round(h));
		this.canvas = document.createElement('canvas');
		this.canvas.width = this.w;
		this.canvas.height = this.h;
		var g = this.canvas.getContext('2d');
		g.fillStyle = '#000';
		g.fillRect(0, 0, this.w, this.h);
		this.patterns = 0;
		this.angle = 0;
		this.color = [0, 0, 0];
		this.wait = 0;
		this.owed = 0;
		this.newPattern(false);
	};

	Sunburst.prototype.newPattern = function (pause) {
		this.ring = 0;
		this.r1 = 4;
		this.r2 = rnd(40) + 4;
		var table = this.patterns > 3 ? SYMMETRY[[1, 2, 0][rnd(2)]] : [16, 16, 16, 16];
		this.patterns += 1;
		this.n = table[rnd(3)];
		this.step_ = 2 * Math.PI / this.n;
		this.thick = rnd(40) + 10;
		this.rotate = rnd(3) !== 0;
		this.oneColor = rnd(1) === 1;
		this.random = rnd(1) === 1;
		this.out = rnd(1) === 1;
		this.keepColor = rnd(1) === 1;
		this.shrink = rnd(3) < 1;
		if (this.shrink) {
			this.out = true;
			this.random = false;
			this.oneColor = rnd(3) < 1;
			this.r1 = rnd(40) + 40;
			this.r2 = rnd(40) + 200;
		}
		this.patternColor = randomColor();
		this.rings = this.random ? 25 : 13;
		if (pause) {
			var t = (100 - this.delay) * 3;
			var d = rnd(1) ? t : t / 2;
			this.wait = (rnd(1) ? d : t) * 10 / 1000;
		}
	};

	Sunburst.prototype.drawRing = function (g) {
		var cx = this.w >> 1, cy = this.h >> 1, n = this.n, step = this.step_;
		var a = this.angle, r1 = this.r1, r2 = this.r2;
		function pt(r, ang) {
			return [Math.trunc(Math.cos(ang) * r + 0.5) + cx, Math.trunc(Math.sin(ang) * r + 0.5) + cy];
		}
		var first = pt(r1, a), prev = first, peak = null;
		var tris = [];
		for (var i = 1; i < n; i += 1) {
			a += step;
			if (i & 1) {
				peak = pt(r2, a);
			} else {
				var q = pt(r1, a);
				tris.push([prev, peak, q]);
				prev = q;
			}
		}
		tris.push([prev, peak, first]);
		this.angle = a;
		var c = this.ringColor;
		g.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
		g.strokeStyle = '#000';
		g.lineWidth = 1;
		tris.forEach(function (t) {
			g.beginPath();
			g.moveTo(t[0][0] + 0.5, t[0][1] + 0.5);
			g.lineTo(t[1][0] + 0.5, t[1][1] + 0.5);
			g.lineTo(t[2][0] + 0.5, t[2][1] + 0.5);
			g.closePath();
			g.fill();
			g.stroke();
		});
	};

	Sunburst.prototype.nextRing = function (g) {
		this.ring += 1;
		if (this.oneColor) {
			this.ringColor = this.patternColor;
		} else {
			if (!this.keepColor) { this.color = randomColor(); }
			this.ringColor = this.color;
		}
		while (this.angle > 360) { this.angle -= 360; }
		this.drawRing(g);
		this.thick = rnd(60) + 10;
		var t;
		if (this.out) {
			if (this.shrink) {
				this.r2 -= 10;
				this.r1 -= rnd(5);
				if (this.r2 < this.r1) {
					this.r1 = -(rnd(80) - 2);
					this.r2 = rnd(40) + 200;
				}
			} else {
				this.r1 = this.r2;
				this.r2 += this.thick;
			}
		} else if (this.ring & 1) {
			t = this.r1; this.r1 = this.r2; this.r2 = t;
		} else if (this.random) {
			this.r1 = rnd(220) + 10;
			this.r2 = rnd(220) + 10;
		} else {
			t = this.r1;
			this.r1 = t;
			this.r2 = t + this.thick;
			if (this.rotate) { this.angle += this.step_; }
		}
	};

	Sunburst.prototype.step = function (dt, ctx, w, h) {
		if (!this.w) { this.resize(w, h); }
		var g = this.canvas.getContext('2d');
		if (this.wait > 0) {
			this.wait -= dt;
		} else {
			this.owed = Math.min(this.owed + dt * RINGS_PER_SECOND, 4);
			while (this.owed >= 1 && this.wait <= 0) {
				this.owed -= 1;
				if (this.ring >= this.rings) {
					this.newPattern(true);
					this.owed = 0;
				} else {
					this.nextRing(g);
				}
			}
		}
		ctx.drawImage(this.canvas, 0, 0, w, h);
	};

	AfterDark.define('after-dark-sunburst', function (el) {
		var sim = new Sunburst();
		sim.delay = DELAY_VALUE[AfterDark.choice(el, 'delay', DELAYS, 'slow')];
		return sim;
	});

	window.AfterDarkSunburst = Sunburst;
}());
