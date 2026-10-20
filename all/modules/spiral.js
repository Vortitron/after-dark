/**
 * spiral.js - Spiral Gyra, a ribbon of lines mirrored four ways.
 *
 * SPIRAL.AD ships no artwork, and says only:
 *
 *   "SPIRAL GYRA(tm) is another line drawing module with an interesting
 *    twist or two."
 *
 * Checked against the original (October 2026): a WINEDEBUG=+relay trace of
 * its MoveTo/LineTo/CreatePen calls and a disassembly of its drawing code.
 * What it does, exactly:
 *
 *   One line a step, from (cx + ax cos th, cy + ay sin th) to
 *   (cx + ax cos(th + ph), cy + ay sin(th + ph)), drawn four times, mirrored
 *   in x and in y about the screen centre (x -> W - x, y -> H - y). The last
 *   199 lines stay (a ring of 200; the oldest is redrawn in black, all four
 *   copies, as each new one goes down).
 *   th advances 360/n degrees a step. cx and cy drift one pixel a step,
 *   bouncing off 0..W-1 and 0..H; ax and ay breathe one pixel a step between
 *   3 and W/4 (H/4). At every bounce of cx or cy, n is picked again from
 *   Min + [Max/2, Max) and ph from 180/(k+1) degrees, k in 4..7.
 *   Start: ax in [W/16, W/8), ay in [H/16, H/8), cx in [W/4, W/2),
 *   cy in [H/4, H/2), ph = 180 degrees, n from [250, 500).
 *   Colour: a fully saturated hue, starting at red, turning a full circle in
 *   20 + (100 - Color Cycling) * 9.8 steps.
 *   Max Lines (20..360, default 54% = 204) is the lines per turn, Min Lines a
 *   percentage of it (default 28, never under 20).
 *   Speed: its timer allows 30 steps every 100 ms, 300 lines a second;
 *   under Wine it reaches about that.
 *
 *   <after-dark-spiral-gyra max-lines="204" min-lines="28" color-cycling="32">
 */
(function () {
	'use strict';

	var RING = 200;
	var STEPS_PER_SECOND = 300;
	var TURN = 234;			/* SPIRAL.AD's angle unit: 234 to the circle */

	function clamp(v, lo, hi, d) {
		if (v === null || v === '') { return d; }
		v = Number(v);
		if (!isFinite(v)) { return d; }
		return Math.max(lo, Math.min(hi, Math.round(v)));
	}

	/* MS C rand(), as the module uses it. */
	function Rand() { this.seed = (Math.random() * 0x7fffffff) >>> 0; }
	Rand.prototype.next = function () {
		this.seed = (Math.imul(this.seed, 0x343fd) + 0x269ec3) >>> 0;
		return (this.seed >>> 16) & 0x7fff;
	};
	/** n (r + 32768) / 65536: somewhere in [n/2, n). */
	Rand.prototype.upper = function (n) {
		return Math.floor(n * (this.next() + 32768) / 65536);
	};

	function sinT(a) { return Math.sin(a * 2 * Math.PI / TURN); }

	function hue(h) {
		/* h 0..1, full saturation and value. */
		var s = h * 6, i = Math.floor(s) % 6, f = s - Math.floor(s);
		var q = Math.round(255 * (1 - f)), t = Math.round(255 * f);
		return [[255, t, 0], [q, 255, 0], [0, 255, t], [0, q, 255], [t, 0, 255], [255, 0, q]][i];
	}

	function SpiralGyra() {
		this.maxLines = 204;
		this.minPct = 28;
		this.cycling = 32;
		this.rand = new Rand();
		this.owed = 0;
		this.w = 0;
	}

	SpiralGyra.prototype.reset = function (w, h) {
		var r = this.rand;
		this.w = w; this.h = h;
		this.canvas = document.createElement('canvas');
		this.canvas.width = w; this.canvas.height = h;
		this.image = this.canvas.getContext('2d').createImageData(w, h);
		var px = this.image.data;
		for (var i = 3; i < px.length; i += 4) { px[i] = 255; }
		this.ax = Math.max(1, r.upper(w >> 3));
		this.ay = Math.max(1, r.upper(h >> 3));
		this.cx = r.upper(w >> 1);
		this.cy = r.upper(h >> 1);
		this.vax = 1; this.vay = 1; this.vcx = 1; this.vcy = 1;
		this.th = 0;
		this.ph = TURN / 2;
		this.dth = TURN / (r.upper(500) + 1);
		this.ring = new Int16Array(RING * 4);
		this.wi = RING - 1;
		this.ei = 0;
		this.hue = 0;
	};

	SpiralGyra.prototype.resize = function (w, h) {
		this.reset(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
	};

	SpiralGyra.prototype.line = function (x0, y0, x1, y1, c) {
		var w = this.w, h = this.h, px = this.image.data;
		var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
		var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
		for (;;) {
			/* LineTo leaves out its last pixel. */
			if (x0 === x1 && y0 === y1) { break; }
			if (x0 >= 0 && y0 >= 0 && x0 < w && y0 < h) {
				var o = (y0 * w + x0) * 4;
				px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
			}
			var e2 = 2 * err;
			if (e2 >= dy) { err += dy; x0 += sx; }
			if (e2 <= dx) { err += dx; y0 += sy; }
		}
	};

	SpiralGyra.prototype.four = function (x1, y1, x2, y2, c) {
		var W = this.w, H = this.h;
		this.line(x1, y1, x2, y2, c);
		this.line(W - x1, H - y1, W - x2, H - y2, c);
		this.line(W - x1, y1, W - x2, y2, c);
		this.line(x1, H - y1, x2, H - y2, c);
	};

	SpiralGyra.prototype.repick = function () {
		var r = this.rand;
		var min = Math.max(20, Math.floor(this.maxLines * this.minPct / 100));
		this.dth = TURN / (min + r.upper(this.maxLines));
		this.ph = (TURN / 2) / (((r.next() + 32768) << 3 >>> 16) + 1);
	};

	SpiralGyra.prototype.once = function () {
		var W = this.w, H = this.h;
		this.th += this.dth;
		this.cx += this.vcx;
		if (this.cx < 0) { this.vcx = 1; this.repick(); }
		else if (this.cx > W - 1) { this.vcx = -1; this.repick(); }
		this.cy += this.vcy;
		if (this.cy < 0) { this.vcy = 1; this.repick(); }
		else if (this.cy > H) { this.vcy = -1; this.repick(); }
		this.ax += this.vax;
		if (this.ax < 3 || this.ax > W >> 2) { this.vax = -this.vax; }
		this.ay += this.vay;
		if (this.ay < 3 || this.ay > H >> 2) { this.vay = -this.vay; }

		var t2 = this.th + this.ph;
		var x1 = Math.floor(sinT(this.th + TURN / 4) * this.ax) + this.cx;
		var y1 = Math.floor(sinT(this.th) * this.ay) + this.cy;
		var x2 = Math.floor(sinT(t2 + TURN / 4) * this.ax) + this.cx;
		var y2 = Math.floor(sinT(t2) * this.ay) + this.cy;

		var g = this.ring, e = this.ei * 4;
		this.four(g[e], g[e + 1], g[e + 2], g[e + 3], [0, 0, 0]);
		this.ei = (this.ei + 1) % RING;

		var period = 20 + (100 - this.cycling) * 980 / 100;
		this.hue = (this.hue + 1 / period) % 1;
		this.four(x1, y1, x2, y2, hue(this.hue));
		var k = this.wi * 4;
		g[k] = x1; g[k + 1] = y1; g[k + 2] = x2; g[k + 3] = y2;
		this.wi = (this.wi + 1) % RING;
	};

	SpiralGyra.prototype.step = function (dt, ctx, w, h) {
		if (!this.w) { this.resize(w, h); }
		this.owed = Math.min(this.owed + dt * STEPS_PER_SECOND, 30);
		while (this.owed >= 1) {
			this.owed -= 1;
			this.once();
		}
		this.canvas.getContext('2d').putImageData(this.image, 0, 0);
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(this.canvas, 0, 0, w, h);
	};

	AfterDark.define('after-dark-spiral-gyra', function (el) {
		var sim = new SpiralGyra();
		sim.maxLines = clamp(AfterDark.setting(el, 'max-lines'), 20, 360, 204);
		sim.minPct = clamp(AfterDark.setting(el, 'min-lines'), 0, 100, 28);
		sim.cycling = clamp(AfterDark.setting(el, 'color-cycling'), 0, 100, 32);
		return sim;
	});

	window.AfterDarkSpiralGyra = SpiralGyra;
}());
