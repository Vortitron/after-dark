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
 * colours each, in all/art/frost/. The rest of the palette list was built in
 * code and is not here.
 *
 *   <after-dark-frost art="art/frost" size="medium" palette="random">
 */
(function () {
	'use strict';

	var SIZES = ['small', 'medium', 'large', 'huge'];
	var SIDE = [128, 192, 256, 360];
	var PALETTES = ['random', 'cycloid', 'icycloid', 'electric', 'rainbows', 'ramped2', 'sine', 'gray scale'];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function gray() {
		var out = [];
		for (var i = 0; i < 252; i += 1) { var v = Math.round(i / 251 * 255); out.push([v, v, v]); }
		return out;
	}

	function Frost() {
		this.side = SIDE[1];
		this.palette = 'random';
		this.fast = false;
		this.pals = null;
	}

	Frost.prototype.resize = function (w, h) {
		var n = this.fast ? Math.round(this.side / 2) : this.side;
		this.n = n;
		this.a = new Uint8Array(n * n);
		this.b = new Uint8Array(n * n);
		this.canvas = document.createElement('canvas');
		this.canvas.width = this.canvas.height = n;
		this.image = this.canvas.getContext('2d').createImageData(n, n);
		this.spin = rand(0.02, 0.06) * (Math.random() < 0.5 ? -1 : 1);
		this.grow = rand(1.004, 1.02);
		this.t = 0;
		this.choose();
		/* Where the source of each destination pixel is, worked out once. */
		this.map = new Int32Array(n * n);
		var c = (n - 1) / 2, cos = Math.cos(this.spin), sin = Math.sin(this.spin);
		for (var y = 0; y < n; y += 1) {
			for (var x = 0; x < n; x += 1) {
				var dx = (x - c) / this.grow, dy = (y - c) / this.grow;
				var sx = Math.round(c + dx * cos - dy * sin), sy = Math.round(c + dx * sin + dy * cos);
				/* The paper is round. */
				var off = (x - c) * (x - c) + (y - c) * (y - c) > c * c;
				this.map[y * n + x] = off || sx < 0 || sy < 0 || sx >= n || sy >= n ? -1 : sy * n + sx;
			}
		}
	};

	Frost.prototype.choose = function () {
		var name = this.palette === 'random' ? PALETTES[1 + Math.floor(Math.random() * (PALETTES.length - 1))]
			: this.palette;
		if (name === 'gray scale') {
			this.colours = gray();
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
		var x0 = c + Math.cos(ang) * d, y0 = c + Math.sin(ang) * d;
		var v = 1 + Math.floor(Math.random() * 250);
		for (var y = Math.floor(y0 - r); y <= y0 + r; y += 1) {
			for (var x = Math.floor(x0 - r); x <= x0 + r; x += 1) {
				if (x < 0 || y < 0 || x >= n || y >= n) { continue; }
				if ((x - x0) * (x - x0) + (y - y0) * (y - y0) <= r * r) { this.a[y * n + x] = v; }
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
		/* As big as the screen allows, square, in the middle. */
		var side = Math.min(w, h) * 0.96;
		ctx.imageSmoothingEnabled = !this.fast;
		ctx.drawImage(this.canvas, Math.round((w - side) / 2), Math.round((h - side) / 2), side, side);
	};

	AfterDark.define('after-dark-frost', function (el) {
		var sim = new Frost();
		sim.side = SIDE[AfterDark.choice(el, 'size', SIZES, 'medium')];
		sim.palette = PALETTES[AfterDark.choice(el, 'palette', PALETTES, 'random')];
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
