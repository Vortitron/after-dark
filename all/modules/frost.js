/**
 * frost.js - Frost and Fire, paint flung off a spinning sheet.
 *
 * FROST.AD's own description:
 *
 *   "Frost and Fire uses a form of video feedback to produce patterns
 *    reminiscent of paint splattering a piece of spinning paper. It works best
 *    in video modes with 256 colors or more.
 *    Size controls the size of the image. Speed varies with the inverse
 *    square of the size.
 *    The Palette selector allows you to choose between several color schemes.
 *    The Maximize Speed option increases performance on most systems, though
 *    some detail is lost.
 *    Original concept by Oliver Steele. Programming by Craig Dickson."
 *
 * The feedback: every frame is the last one turned a little and pushed out
 * from the middle, each pixel one step further along the palette, with new
 * splashes of paint landing on it. The palettes are the module's own PAL
 * resources - Cycloid, iCycloid, Electric, Rainbows, Ramped2, Sine - 252
 * colours each, in all/art/frost/. The module's Palette list is Bright,
 * Stormy, Gray Scale, Ramped, Electric, Rainbows, Sine, Plasma, Cycloid,
 * Bright by default; Bright, Stormy and Plasma were built in code and are
 * not in the resources, so those three are guesses here.
 *
 * Checked against the real module under Wine (8-bit display, defaults: Size
 * 45 of 10-100, Bright): the picture is a square, 320 pixels at 1024x768,
 * in the middle of a black screen, filled right into its corners, and it
 * swirls - spiral arms, rings and two- and four-fold pinwheels - changing
 * from one frame to the next. Its colours cannot be judged from the 8-bit
 * grab. Still inferred: the feedback itself (turn, spread, splashes) and
 * the pinwheels, made here by landing each splash two or four times round.
 *
 *   <after-dark-frost art="art/frost" size="medium" palette="bright">
 */
(function () {
	'use strict';

	var SIZES = ['small', 'medium', 'large', 'huge'];
	/* The square's side as a share of the screen's height; medium is the default 45. */
	var SHARE = [0.25, 0.42, 0.65, 0.95];
	var PALETTES = ['bright', 'stormy', 'gray scale', 'ramped', 'electric', 'rainbows', 'sine', 'plasma', 'cycloid',
		'random', 'icycloid'];
	/* The module's list ends at Cycloid; Random and iCycloid are extras of ours. */
	var LISTED = 9;
	var PAL_OF = { ramped: 'ramped2' };

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function gray() {
		var out = [];
		for (var i = 0; i < 252; i += 1) { var v = Math.round(i / 251 * 255); out.push([v, v, v]); }
		return out;
	}

	/** The palettes made in code: guesses at what the names describe. */
	function made(name) {
		var out = [];
		for (var i = 0; i < 252; i += 1) {
			var t = i / 252 * Math.PI * 2, c;
			if (name === 'bright') {
				c = [128 + 127 * Math.cos(t), 128 + 127 * Math.cos(t - 2.09), 128 + 127 * Math.cos(t + 2.09)];
			} else if (name === 'stormy') {
				var v = 0.5 + 0.5 * Math.cos(t * 3);
				c = [40 + 120 * v, 50 + 130 * v, 90 + 150 * v];
			} else {
				c = [128 + 127 * Math.sin(t * 3), 128 + 127 * Math.sin(t * 5 + 1), 128 + 127 * Math.sin(t * 7 + 2)];
			}
			out.push(c.map(Math.round));
		}
		return out;
	}

	function Frost() {
		this.share = SHARE[1];
		this.palette = 'bright';
		this.fast = false;
		this.pals = null;
	}

	Frost.prototype.resize = function (w, h) {
		/* A pixel of feedback per screen pixel, or one per two at Maximize Speed. */
		var n = Math.max(32, Math.round(Math.min(w, h) * this.share / (this.fast ? 2 : 1)));
		this.n = n;
		this.a = new Uint8Array(n * n);
		this.b = new Uint8Array(n * n);
		this.canvas = document.createElement('canvas');
		this.canvas.width = this.canvas.height = n;
		this.image = this.canvas.getContext('2d').createImageData(n, n);
		this.spin = rand(0.02, 0.06) * (Math.random() < 0.5 ? -1 : 1);
		this.grow = rand(1.004, 1.02);
		this.fold = [1, 2, 2, 4][Math.floor(Math.random() * 4)];
		this.t = 0;
		this.choose();
		/* Where the source of each destination pixel is, worked out once. */
		this.map = new Int32Array(n * n);
		var c = (n - 1) / 2, cos = Math.cos(this.spin), sin = Math.sin(this.spin);
		for (var y = 0; y < n; y += 1) {
			for (var x = 0; x < n; x += 1) {
				var dx = (x - c) / this.grow, dy = (y - c) / this.grow;
				var sx = Math.round(c + dx * cos - dy * sin), sy = Math.round(c + dx * sin + dy * cos);
				/* The picture is square, filled into its corners: what turns in from off the edge wraps round. */
				this.map[y * n + x] = ((sy % n + n) % n) * n + ((sx % n + n) % n);
			}
		}
	};

	Frost.prototype.choose = function () {
		var name = this.palette === 'random' ? PALETTES[Math.floor(Math.random() * LISTED)] : this.palette;
		name = PAL_OF[name] || name;
		if (name === 'gray scale') {
			this.colours = gray();
		} else if (name === 'bright' || name === 'stormy' || name === 'plasma') {
			this.colours = made(name);
		} else if (this.pals && this.pals[name]) {
			this.colours = this.pals[name];
		} else {
			this.colours = null;
		}
		this.nextChoice = this.palette === 'random' ? rand(30, 60) : Infinity;
	};

	Frost.prototype.splash = function () {
		var n = this.n, c = n / 2;
		var r = rand(n * 0.006, n * 0.022), d = Math.pow(Math.random(), 1.5) * n * 0.3, ang = rand(0, Math.PI * 2);
		var v = 1 + Math.floor(Math.random() * 250);
		/* The captured pictures were often two- or four-fold pinwheels: the paint lands that many times round. */
		for (var k = 0; k < this.fold; k += 1) {
			var a = ang + k * Math.PI * 2 / this.fold, x0 = c + Math.cos(a) * d, y0 = c + Math.sin(a) * d;
			for (var y = Math.floor(y0 - r); y <= y0 + r; y += 1) {
				for (var x = Math.floor(x0 - r); x <= x0 + r; x += 1) {
					if (x < 0 || y < 0 || x >= n || y >= n) { continue; }
					if ((x - x0) * (x - x0) + (y - y0) * (y - y0) <= r * r) { this.a[y * n + x] = v; }
				}
			}
		}
	};

	Frost.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		this.t += dt;
		this.nextChoice -= dt;
		if (this.nextChoice <= 0 || !this.colours) { this.choose(); }
		if (!this.colours) { return; }
		var n = this.n, a = this.a, b = this.b, map = this.map, i;
		var splashes = 2 + Math.floor(Math.random() * 4);
		for (i = 0; i < splashes; i += 1) { this.splash(); }
		/* Turn, spread, and move every drop on one colour. */
		for (i = 0; i < n * n; i += 1) {
			var src = map[i];
			var v = src < 0 ? 0 : a[src];
			b[i] = v ? (v % 251) + 1 : 0;
		}
		this.a = b;
		this.b = a;
		var d = this.image.data, pal = this.colours, len = pal.length;
		for (i = 0; i < n * n; i += 1) {
			var o = i * 4, k = this.a[i];
			if (!k) {
				d[o] = d[o + 1] = d[o + 2] = 0;
			} else {
				var c = pal[k % len];
				d[o] = c[0];
				d[o + 1] = c[1];
				d[o + 2] = c[2];
			}
			d[o + 3] = 255;
		}
		this.canvas.getContext('2d').putImageData(this.image, 0, 0);
		/* Square, in the middle, its size the Size control's. */
		var side = Math.min(w, h) * this.share;
		ctx.imageSmoothingEnabled = !this.fast;
		ctx.drawImage(this.canvas, Math.round((w - side) / 2), Math.round((h - side) / 2), side, side);
	};

	AfterDark.define('after-dark-frost', function (el) {
		var sim = new Frost();
		sim.share = SHARE[AfterDark.choice(el, 'size', SIZES, 'medium')];
		sim.palette = PALETTES[AfterDark.choice(el, 'palette', PALETTES, 'bright')];
		sim.fast = AfterDark.flag(el, 'maximize-speed');
		AfterDark.data(AfterDark.setting(el, 'art') || 'art/frost').then(function (d) {
			sim.pals = d.palettes;
			sim.choose();
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkFrost = Frost;
}());
