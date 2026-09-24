/**
 * mandelbrot.js - Mandelbrot, zooming for ever into the set.
 *
 * MANDELBR.AD ships no artwork. Its own description:
 *
 *   "MANDELBROT (tm) This module generates and displays the Mandelbrot set,
 *    an extremely beautiful mathematical oddity. As your computer zooms
 *    deeper and deeper into the set, the display only becomes more varied and
 *    compelling. Pressing the Caps Lock key will change the color scheme when
 *    in 256 colors. Special thanks to Ben 'Clut Meister' Haller for the color
 *    generation."
 *
 * Its controls are Delay (0 sec to 1 min, how long a finished picture stays
 * up), Colors (Earth, Air, Fire, Water, Random) and Blockiness (the size of
 * the pixels it computes). Each picture is computed a row at a time, the way
 * a 1993 PC would have painted it; then it picks somewhere interesting on the
 * edge of the set and dives in four times closer. When doubles run out of
 * digits it starts again from the whole set. Caps Lock still changes colours.
 *
 *   <after-dark-mandelbrot delay="5 sec" colors="random" blockiness="2">
 */
(function () {
	'use strict';

	var DELAYS = ['0 sec', '5 sec', '15 sec', '30 sec', '1 min'];
	var WAIT = [0, 5, 15, 30, 60];
	var COLORS = ['earth', 'air', 'fire', 'water', 'random'];
	var BLOCKS = ['1', '2', '4', '8', '16'];
	/* Milliseconds of each frame spent computing. */
	var BUDGET = 10;

	/* Each scheme is a run of stops the escape count cycles through. */
	var SCHEMES = {
		earth: [[40, 20, 0], [120, 70, 20], [200, 160, 80], [60, 120, 30], [20, 60, 10], [150, 110, 60]],
		air: [[10, 20, 80], [80, 140, 230], [240, 250, 255], [140, 190, 240], [30, 70, 170]],
		fire: [[40, 0, 0], [200, 20, 0], [255, 140, 0], [255, 240, 80], [255, 255, 230], [160, 30, 0]],
		water: [[0, 10, 50], [0, 60, 140], [0, 170, 200], [180, 240, 255], [0, 110, 170]]
	};
	var NAMES = ['earth', 'air', 'fire', 'water'];

	/** 256 colours around a scheme's stops, the way a CLUT would hold them. */
	function palette(name) {
		var stops = SCHEMES[name];
		var out = new Uint8Array(256 * 3);
		for (var i = 0; i < 256; i += 1) {
			var f = i / 256 * stops.length;
			var a = stops[Math.floor(f) % stops.length], b = stops[(Math.floor(f) + 1) % stops.length];
			var t = f - Math.floor(f);
			for (var c = 0; c < 3; c += 1) { out[i * 3 + c] = Math.round(a[c] + (b[c] - a[c]) * t); }
		}
		return out;
	}

	/** Escape count for c = (x, y), or -1 if it never leaves. */
	function escape(x, y, max) {
		var zx = 0, zy = 0, zx2 = 0, zy2 = 0;
		/* Skip the main cardioid and the period-2 bulb outright. */
		var q = (x - 0.25) * (x - 0.25) + y * y;
		if (q * (q + (x - 0.25)) < 0.25 * y * y || (x + 1) * (x + 1) + y * y < 0.0625) { return -1; }
		for (var i = 0; i < max; i += 1) {
			zy = 2 * zx * zy + y;
			zx = zx2 - zy2 + x;
			zx2 = zx * zx;
			zy2 = zy * zy;
			if (zx2 + zy2 > 4) { return i; }
		}
		return -1;
	}

	function Mandelbrot() {
		this.wait = WAIT[1];
		this.scheme = 'random';
		this.block = 2;
	}

	Mandelbrot.prototype.resize = function (w, h) {
		this.bw = Math.max(1, Math.ceil(w / this.block));
		this.bh = Math.max(1, Math.ceil(h / this.block));
		this.canvas = document.createElement('canvas');
		this.canvas.width = this.bw;
		this.canvas.height = this.bh;
		this.image = this.canvas.getContext('2d').createImageData(this.bw, this.bh);
		this.counts = new Int32Array(this.bw * this.bh);
		this.home();
	};

	Mandelbrot.prototype.home = function () {
		this.cx = -0.6;
		this.cy = 0;
		this.span = 3.2;
		this.depth = 0;
		this.begin();
	};

	Mandelbrot.prototype.begin = function () {
		if (this.scheme === 'random' || !this.pal) {
			this.current = this.scheme === 'random' ? NAMES[Math.floor(Math.random() * 4)] : this.scheme;
			this.pal = palette(this.current);
		}
		this.max = Math.round(120 + 60 * this.depth);
		this.row = 0;
		this.shown = 0;
		this.image.data.fill(0);
		for (var k = 3; k < this.image.data.length; k += 4) { this.image.data[k] = 255; }
	};

	Mandelbrot.prototype.colour = function (k) {
		var n = this.counts[k], o = k * 4, d = this.image.data;
		if (n < 0) {
			d[o] = d[o + 1] = d[o + 2] = 0;
		} else {
			var p = ((n * 4) % 256) * 3;
			d[o] = this.pal[p];
			d[o + 1] = this.pal[p + 1];
			d[o + 2] = this.pal[p + 2];
		}
		d[o + 3] = 255;
	};

	/** Somewhere on the edge, near the middle: lots of escape, but slowly. */
	Mandelbrot.prototype.target = function () {
		var best = -1, bestScore = -Infinity;
		for (var tries = 0; tries < 400; tries += 1) {
			var i = Math.floor(this.bw * (0.2 + Math.random() * 0.6));
			var j = Math.floor(this.bh * (0.2 + Math.random() * 0.6));
			var k = j * this.bw + i;
			var n = this.counts[k];
			if (n < 0) { continue; }
			/* Detail nearby means a mix of fast, slow and never escaping. */
			var mix = 0, inside = 0;
			for (var dj = -3; dj <= 3; dj += 3) {
				for (var di = -3; di <= 3; di += 3) {
					var kk = Math.min(this.counts.length - 1, Math.max(0, k + dj * this.bw + di));
					if (this.counts[kk] < 0) { inside += 1; } else { mix += Math.abs(this.counts[kk] - n); }
				}
			}
			var score = n + mix * 0.5 + (inside > 0 && inside < 8 ? 60 : 0);
			if (score > bestScore) { bestScore = score; best = k; }
		}
		if (best < 0) { return null; }
		var px = best % this.bw, py = Math.floor(best / this.bw);
		return {
			x: this.cx + (px / this.bw - 0.5) * this.span,
			y: this.cy + (py / this.bh - 0.5) * this.span * this.bh / this.bw
		};
	};

	Mandelbrot.prototype.step = function (dt, ctx, w, h) {
		var start = (window.performance || Date).now();
		var bw = this.bw, bh = this.bh;
		var sx = this.span / bw, sy = sx;
		var y0 = this.cy - bh / 2 * sy, x0 = this.cx - bw / 2 * sx;
		while (this.row < bh && (window.performance || Date).now() - start < BUDGET) {
			var y = y0 + (this.row + 0.5) * sy;
			for (var i = 0; i < bw; i += 1) {
				var k = this.row * bw + i;
				this.counts[k] = escape(x0 + (i + 0.5) * sx, y, this.max);
				this.colour(k);
			}
			this.row += 1;
		}
		if (this.row >= bh) {
			this.shown += dt;
			if (this.shown >= this.wait) {
				var t = this.target();
				this.depth += 1;
				if (!t || this.span / 4 < 1e-12) {
					this.home();
				} else {
					this.cx = t.x;
					this.cy = t.y;
					this.span /= 4;
					this.begin();
				}
			}
		}
		this.canvas.getContext('2d').putImageData(this.image, 0, 0);
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(this.canvas, 0, 0, bw * this.block, bh * this.block);
	};

	/* Caps Lock, as in the original, goes on to the next colour scheme. */
	Mandelbrot.prototype.nextColours = function () {
		var at = NAMES.indexOf(this.current || 'earth');
		this.current = NAMES[(at + 1) % NAMES.length];
		this.pal = palette(this.current);
		for (var k = 0; k < this.row * this.bw; k += 1) { this.colour(k); }
	};

	AfterDark.define('after-dark-mandelbrot', function (el) {
		var sim = new Mandelbrot();
		sim.wait = WAIT[AfterDark.choice(el, 'delay', DELAYS, '5 sec')];
		sim.scheme = COLORS[AfterDark.choice(el, 'colors', COLORS, 'random')];
		sim.block = Number(BLOCKS[AfterDark.choice(el, 'blockiness', BLOCKS, '2')]);
		window.addEventListener('keydown', function (e) {
			if (e.key === 'CapsLock') { sim.nextColours(); }
		});
		return sim;
	});

	window.AfterDarkMandelbrot = Mandelbrot;
	Mandelbrot.escape = escape;
}());
