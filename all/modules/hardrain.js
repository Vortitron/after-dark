/**
 * hardrain.js - Hard Rain, raindrops rippling on the screen.
 *
 * The classic RAIN.AD (not After Dark 4.0's Rainforest, which is also
 * RAIN.AD) ships no artwork. Its own description:
 *
 *   "HARD RAIN (tm)
 *    Based on original design by James J. Eastman.
 *    See Scientific American, Dec 1987."
 *
 * and its control panel is "# of Drops", "Drop Size" and "Clear Screen
 * First". Each drop is a few rings running outward from where it lands. They
 * are drawn the way screen savers of the day drew anything they meant to take
 * back off again - by XOR, one pixel at a time - so where two sets of ripples
 * cross the colours mix, and whatever was on the screen comes back untouched
 * once they have passed. With Clear Screen First off, that is the desktop.
 *
 *   <after-dark-hard-rain drops="some" drop-size="medium" clear-screen>
 */
(function () {
	'use strict';

	var DROPS = ['few', 'some', 'many', 'lots'];
	var COUNT = [6, 14, 28, 50];
	var SIZES = ['small', 'medium', 'large'];
	var REACH = [25, 50, 100];
	var RINGS = 3;
	var GAP = 5;
	/* Buffer pixels a second. */
	var SPEED = 70;
	var COLOURS = [[255, 85, 85], [85, 255, 85], [85, 85, 255], [255, 255, 85],
		[85, 255, 255], [255, 85, 255], [255, 255, 255], [170, 170, 170]];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	/** Every pixel of a midpoint circle exactly once, so XOR does not cancel itself. */
	function circle(r) {
		var pts = [];
		var x = 0, y = r, d = 1 - r;
		function add(a, b) {
			for (var i = 0; i < pts.length; i += 2) {
				if (pts[i] === a && pts[i + 1] === b) { return; }
			}
			pts.push(a, b);
		}
		var all = [];
		while (x <= y) {
			pts = [];
			add(x, y); add(-x, y); add(x, -y); add(-x, -y);
			add(y, x); add(-y, x); add(y, -x); add(-y, -x);
			Array.prototype.push.apply(all, pts);
			x += 1;
			if (d < 0) {
				d += 2 * x + 1;
			} else {
				y -= 1;
				d += 2 * (x - y) + 1;
			}
		}
		return all;
	}

	var CIRCLES = [];
	function circleOf(r) {
		if (!CIRCLES[r]) { CIRCLES[r] = circle(r); }
		return CIRCLES[r];
	}

	function HardRain() {
		this.count = COUNT[1];
		this.reach = REACH[1];
		this.clearScreen = true;
		this.drops = [];
	}

	HardRain.prototype.resize = function (w, h) {
		this.scale = Math.max(1, Math.floor(Math.min(w, h) / 400));
		this.bw = Math.ceil(w / this.scale);
		this.bh = Math.ceil(h / this.scale);
		this.canvas = document.createElement('canvas');
		this.canvas.width = this.bw;
		this.canvas.height = this.bh;
		var g = this.canvas.getContext('2d');
		if (this.clearScreen) {
			g.fillStyle = '#000';
			g.fillRect(0, 0, this.bw, this.bh);
		} else {
			g.imageSmoothingEnabled = true;
			g.drawImage(AfterDark.desktop(w, h), 0, 0, this.bw, this.bh);
		}
		this.image = g.getImageData(0, 0, this.bw, this.bh);
		this.drops = [];
		this.spawnIn = 0;
	};

	HardRain.prototype.xor = function (cx, cy, r, rgb) {
		var pts = circleOf(r);
		var d = this.image.data, bw = this.bw, bh = this.bh;
		for (var i = 0; i < pts.length; i += 2) {
			var x = cx + pts[i], y = cy + pts[i + 1];
			if (x < 0 || y < 0 || x >= bw || y >= bh) { continue; }
			var o = (y * bw + x) * 4;
			d[o] ^= rgb[0];
			d[o + 1] ^= rgb[1];
			d[o + 2] ^= rgb[2];
		}
	};

	/** Move a drop's rings out by one pixel: take each off, put it back wider. */
	HardRain.prototype.grow = function (drop) {
		for (var k = 0; k < RINGS; k += 1) {
			var old = drop.r - k * GAP;
			if (old >= 1 && old <= drop.max) { this.xor(drop.x, drop.y, old, drop.rgb); }
			if (old + 1 >= 1 && old + 1 <= drop.max) { this.xor(drop.x, drop.y, old + 1, drop.rgb); }
		}
		drop.r += 1;
	};

	HardRain.prototype.step = function (dt, ctx, w, h) {
		this.spawnIn -= dt;
		if (this.drops.length < this.count && this.spawnIn <= 0) {
			this.drops.push({
				x: Math.floor(rand(0, this.bw)), y: Math.floor(rand(0, this.bh)), r: 0,
				max: Math.round(this.reach * rand(0.5, 1.2)),
				rgb: COLOURS[Math.floor(Math.random() * COLOURS.length)], owed: 0
			});
			this.spawnIn = rand(0, 1.5 / this.count);
		}
		for (var i = this.drops.length - 1; i >= 0; i -= 1) {
			var drop = this.drops[i];
			drop.owed += SPEED * dt;
			while (drop.owed >= 1) {
				this.grow(drop);
				drop.owed -= 1;
			}
			if (drop.r - (RINGS - 1) * GAP > drop.max) {
				this.drops.splice(i, 1);
			}
		}
		var g = this.canvas.getContext('2d');
		g.putImageData(this.image, 0, 0);
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(this.canvas, 0, 0, this.bw * this.scale, this.bh * this.scale);
	};

	AfterDark.define('after-dark-hard-rain', function (el) {
		var sim = new HardRain();
		sim.count = COUNT[AfterDark.choice(el, 'drops', DROPS, 'some')];
		sim.reach = REACH[AfterDark.choice(el, 'drop-size', SIZES, 'medium')];
		sim.clearScreen = AfterDark.flag(el, 'clear-screen');
		return sim;
	});

	window.AfterDarkHardRain = HardRain;
	HardRain.circle = circle;
}());
