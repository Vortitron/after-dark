/**
 * strange.js - Strange Attractors, chaos plotted a point at a time.
 *
 * STRANGE.AD ships no artwork. Its own description:
 *
 *   "STRANGE ATTRACTORS (tm) 'Duration' lets you choose how long each image
 *    is displayed (This value will be ignored and work will continue on the
 *    current frame as long as the Caps Lock key is enabled).
 *    'Color Speed' adjusts how quickly the colors change while an image is
 *    being drawn. Original Mac version by Ed Hall."
 *
 * Checked against the real module under Wine (8-bit display, defaults): each
 * picture is Barry Martin's "hopalong" map, x' = y - sign(x) sqrt|b x - c|,
 * y' = a - x, started at the origin and plotted a dot at a time at a fixed
 * scale, so it starts as a small figure in the middle of a black screen and
 * spreads out past the edges within a few seconds, filling in as it goes -
 * lattices of rings in a diamond, or lace round big black ovals, depending
 * on a, b and c. A new picture every 20 seconds by default (the module's
 * default Duration). Dots are solid, one pixel.
 * Still inferred: the ranges a, b and c are drawn from, and the colour - the
 * 8-bit grab reads pixels through the default colormap, not the module's
 * palette, so the captures cannot show it; the colour drifting as it draws
 * is from the description.
 *
 *   <after-dark-strange-attractors duration="20 seconds" color-speed="normal">
 */
(function () {
	'use strict';

	var DURATIONS = ['5 seconds', '10 seconds', '15 seconds', '20 seconds', '30 seconds', '45 seconds',
		'1 minute', '2 minutes', '5 minutes', '10 minutes', '15 minutes', '20 minutes', '30 minutes',
		'45 minutes', '1 hour'];
	var SECONDS = [5, 10, 15, 20, 30, 45, 60, 120, 300, 600, 900, 1200, 1800, 2700, 3600];
	var COLOR_SPEEDS = ['none', 'slowest', 'slower', 'slow', 'normal', 'fast', 'faster', 'fastest'];
	var HUE = [0, 2, 5, 10, 20, 40, 80, 160];
	/* Dots a frame: the original covered the screen in a few seconds. */
	var PER_FRAME = 1500;
	/* Dots whose spread sets the scale: about what is down after three seconds. */
	var SPREAD = 180000;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function hop(p, x, y) {
		return [y - (x < 0 ? -1 : 1) * Math.sqrt(Math.abs(p.b * x - p.c)), p.a - x];
	}

	/**
	 * Parameters for one picture, with how far its first few seconds reach:
	 * box is that early orbit's extent, reach its 90th-percentile radius.
	 */
	function find() {
		for (var tries = 0; tries < 50; tries += 1) {
			var p = { a: rand(-15, 15), b: rand(0.02, 1.5) * (Math.random() < 0.5 ? -1 : 1), c: rand(-2, 2) };
			var x = 0, y = 0, minX = 0, maxX = 0, minY = 0, maxY = 0, radii = [];
			for (var i = 0; i < SPREAD; i += 1) {
				var n = hop(p, x, y);
				x = n[0];
				y = n[1];
				minX = Math.min(minX, x); maxX = Math.max(maxX, x);
				minY = Math.min(minY, y); maxY = Math.max(maxY, y);
				if (i % 50 === 0) { radii.push(Math.sqrt(x * x + y * y)); }
			}
			radii.sort(function (u, v) { return u - v; });
			p.reach = radii[Math.floor(radii.length * 0.9)];
			p.box = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
			if (isFinite(p.reach) && p.reach > 0 && p.box.w > 0 && p.box.h > 0) { return p; }
		}
		return { a: 0.4, b: 1, c: 0, reach: 2.2, box: { x: -3, y: -3, w: 6, h: 6 } };
	}

	function Strange() {
		this.duration = 20;
		this.hueRate = HUE[4];
		this.hold = false;
	}

	Strange.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.canvas = document.createElement('canvas');
		this.canvas.width = Math.max(1, Math.round(w));
		this.canvas.height = Math.max(1, Math.round(h));
		this.fresh();
	};

	Strange.prototype.fresh = function () {
		var g = this.canvas.getContext('2d');
		g.fillStyle = '#000';
		g.fillRect(0, 0, this.w, this.h);
		this.p = find();
		/* By the time the spread is down it reaches past the screen's corners. */
		this.scale = Math.hypot(this.w, this.h) / 2 * 0.75 / this.p.reach;
		this.x = 0;
		this.y = 0;
		this.age = 0;
		this.hue = rand(0, 360);
	};

	Strange.prototype.step = function (dt, ctx, w, h) {
		this.age += dt;
		if (this.age > this.duration && !this.hold) { this.fresh(); }
		var p = this.p, g = this.canvas.getContext('2d'), s = this.scale, ox = w / 2, oy = h / 2;
		this.hue = (this.hue + this.hueRate * dt) % 360;
		g.fillStyle = 'hsl(' + this.hue.toFixed(1) + ',60%,70%)';
		var x = this.x, y = this.y;
		for (var i = 0; i < PER_FRAME; i += 1) {
			var nx = y - (x < 0 ? -1 : 1) * Math.sqrt(Math.abs(p.b * x - p.c));
			y = p.a - x;
			x = nx;
			/* y runs down the screen, as it did in the original. */
			g.fillRect(Math.floor(ox + x * s), Math.floor(oy + y * s), 1, 1);
		}
		this.x = x;
		this.y = y;
		ctx.drawImage(this.canvas, 0, 0, w, h);
	};

	AfterDark.define('after-dark-strange-attractors', function (el) {
		var sim = new Strange();
		sim.duration = SECONDS[AfterDark.choice(el, 'duration', DURATIONS, '20 seconds')];
		sim.hueRate = HUE[AfterDark.choice(el, 'color-speed', COLOR_SPEEDS, 'normal')];
		window.addEventListener('keydown', function (e) {
			if (e.getModifierState) { sim.hold = e.getModifierState('CapsLock'); }
		});
		return sim;
	});

	window.AfterDarkStrange = Strange;
	Strange.find = find;
	Strange.hop = hop;
}());
