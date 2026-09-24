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
 * Each picture is one map, x' = sin(a y) + c cos(a x), y' = sin(b x) +
 * d cos(b y), iterated a few thousand times a frame, with parameters kept
 * only if the points neither settle nor repeat. The colour moves on as it
 * draws, so the order it was drawn in shows. Caps Lock still holds it.
 *
 *   <after-dark-strange-attractors duration="1 minute" color-speed="normal">
 */
(function () {
	'use strict';

	var DURATIONS = ['5 seconds', '10 seconds', '15 seconds', '30 seconds', '1 minute', '2 minutes',
		'5 minutes', '10 minutes', '30 minutes', '1 hour'];
	var SECONDS = [5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
	var COLOR_SPEEDS = ['none', 'slowest', 'slower', 'slow', 'normal', 'fast', 'faster', 'fastest'];
	var HUE = [0, 2, 5, 10, 20, 40, 80, 160];
	var PER_FRAME = 6000;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	/** Parameters whose points fill a good area without settling down. */
	function find() {
		for (var tries = 0; tries < 200; tries += 1) {
			var p = { a: rand(-3, 3), b: rand(-3, 3), c: rand(-2, 2), d: rand(-2, 2) };
			var x = 0.1, y = 0.1, seen = {}, cells = 0, minX = 9, maxX = -9, minY = 9, maxY = -9;
			for (var i = 0; i < 3000; i += 1) {
				var nx = Math.sin(p.a * y) + p.c * Math.cos(p.a * x);
				var ny = Math.sin(p.b * x) + p.d * Math.cos(p.b * y);
				x = nx;
				y = ny;
				if (i < 100) { continue; }
				minX = Math.min(minX, x); maxX = Math.max(maxX, x);
				minY = Math.min(minY, y); maxY = Math.max(maxY, y);
				var key = Math.floor(x * 20) + ',' + Math.floor(y * 20);
				if (!seen[key]) { seen[key] = 1; cells += 1; }
			}
			if (cells > 700) {
				p.box = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
				return p;
			}
		}
		return { a: -1.4, b: 1.6, c: 1.0, d: 0.7, box: { x: -2, y: -2, w: 4, h: 4 } };
	}

	function Strange() {
		this.duration = 60;
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
		this.x = 0.1;
		this.y = 0.1;
		this.age = 0;
		this.hue = rand(0, 360);
	};

	Strange.prototype.step = function (dt, ctx, w, h) {
		this.age += dt;
		if (this.age > this.duration && !this.hold) { this.fresh(); }
		var p = this.p, g = this.canvas.getContext('2d');
		var fit = Math.min(w * 0.9 / p.box.w, h * 0.9 / p.box.h);
		var ox = (w - p.box.w * fit) / 2 - p.box.x * fit, oy = (h - p.box.h * fit) / 2 - p.box.y * fit;
		this.hue = (this.hue + this.hueRate * dt) % 360;
		/* Faint dots, so where it keeps coming back to gets brighter. */
		g.fillStyle = 'hsla(' + this.hue.toFixed(1) + ',100%,60%,0.35)';
		var x = this.x, y = this.y;
		for (var i = 0; i < PER_FRAME; i += 1) {
			var nx = Math.sin(p.a * y) + p.c * Math.cos(p.a * x);
			y = Math.sin(p.b * x) + p.d * Math.cos(p.b * y);
			x = nx;
			g.fillRect(ox + x * fit, oy + y * fit, 1, 1);
		}
		this.x = x;
		this.y = y;
		ctx.drawImage(this.canvas, 0, 0, w, h);
	};

	AfterDark.define('after-dark-strange-attractors', function (el) {
		var sim = new Strange();
		sim.duration = SECONDS[AfterDark.choice(el, 'duration', DURATIONS, '1 minute')];
		sim.hueRate = HUE[AfterDark.choice(el, 'color-speed', COLOR_SPEEDS, 'normal')];
		window.addEventListener('keydown', function (e) {
			if (e.getModifierState) { sim.hold = e.getModifierState('CapsLock'); }
		});
		return sim;
	});

	window.AfterDarkStrange = Strange;
	Strange.find = find;
}());
