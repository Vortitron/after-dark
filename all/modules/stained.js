/**
 * stained.js - Stained Glass, quilts grown from the middle out.
 *
 * STAINED.AD ships no artwork. Its own description:
 *
 *   "STAINED GLASS(tm) produces an infinite variety of beautiful quiltlike
 *    patterns. The 'Complexity' slider increases the appearance of detail in
 *    the image. The 'Duplication' slider controls how often the central image
 *    is duplicated in the periphery. The 'Color' slider controls how colorful
 *    the image gets. On the low end only a few colors are used."
 *
 * Checked against the real module under Wine (8-bit display, defaults:
 * Complexity 10, Duplication and Color 100) and a trace of its GDI calls:
 * - One square block, 146 pixels across at 1024x768, sits in the middle of
 *   the screen. It is drawn a pixel at a time (SetPixel) with eightfold
 *   symmetry - both mirrors and the diagonal - in square rings from its
 *   middle outward, each ring in two colours, one usually black.
 * - The block is built up in layers: a band of rings, a few straight lines
 *   (the diagonals, a diamond, crossing chords), a filled or inverted square;
 *   after each layer the block is copied (BitBlt) onto a 5 x 5 grid of places
 *   round it - 730 pixels square, nearly the screen's height - which is the
 *   Duplication.
 * - The colours are plain RGB ones (black, grey, yellow... the sixteen VGA
 *   colours), not a palette.
 * - It runs unthrottled under Wine, a new quilt every second or so; the pace
 *   here is slower, as a 1992 PC would have been.
 * Still inferred: the rule that picks each ring pixel's colour (the trace
 * shows it depends on the ring before, thinning toward the diagonal; it is
 * an elementary cellular automaton here), how Complexity and Color map onto
 * the drawing, and the exact mix of layers. The 8-bit captures cannot show
 * true colours (the grab reads pixels through the default colormap).
 *
 *   <after-dark-stained-glass complexity="low" duplication="lots" color="lots">
 */
(function () {
	'use strict';

	var COMPLEXITIES = ['low', 'medium', 'high'];
	var LAYERS = [6, 10, 16];
	var DUPLICATIONS = ['none', 'some', 'lots'];
	var REACH = [0, 1, 2];
	var COLORS = ['few', 'medium', 'lots'];
	var SHADES = [3, 8, 15];
	/* The sixteen VGA colours, black first. */
	var VGA = [[0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0], [0, 0, 128], [128, 0, 128], [0, 128, 128],
		[192, 192, 192], [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0], [0, 0, 255], [255, 0, 255],
		[0, 255, 255], [255, 255, 255]];
	/* Elementary cellular automaton rules that make lace rather than noise or nothing. */
	var RULES = [18, 22, 26, 30, 45, 54, 57, 60, 73, 90, 105, 110, 126, 150, 182];
	/* Seconds a quilt takes to build, and stays up when done. */
	var BUILD = 5, HOLD = 4;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	function StainedGlass() {
		this.layers = LAYERS[0];
		this.reach = REACH[2];
		this.shades = SHADES[2];
	}

	StainedGlass.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		/* 146 pixels at 768 lines: a half-width of 73. */
		this.r = Math.max(8, Math.round(h * 73 / 768));
		this.n = this.r * 2 + 1;
		this.tile = document.createElement('canvas');
		this.tile.width = this.tile.height = this.n;
		/* Each place round the middle keeps its own copy: not every copy is redone each time. */
		this.copies = {};
		for (var j = -2; j <= 2; j += 1) {
			for (var i = -2; i <= 2; i += 1) {
				var c = document.createElement('canvas');
				c.width = c.height = this.n;
				this.copies[i + ',' + j] = c;
			}
		}
		this.design();
	};

	/** A new quilt: its colours and its list of layers. */
	StainedGlass.prototype.design = function () {
		var r = this.r, i;
		this.colours = [VGA[0]];
		var others = VGA.slice(1).sort(function () { return Math.random() - 0.5; });
		for (i = 0; i < this.shades; i += 1) { this.colours.push(others[i]); }
		this.plan = [];
		for (i = 0; i < this.layers; i += 1) {
			var kind = Math.random();
			if (kind < 0.6) {
				var d0 = Math.floor(rand(0, r * 0.8)), d1 = Math.min(r, d0 + Math.floor(rand(r * 0.2, r)));
				this.plan.push({ kind: 'rings', d0: d0, d1: d1, rule: pick(RULES), on: this.colour(), off: Math.random() < 0.7 ? VGA[0] : this.colour() });
			} else if (kind < 0.85) {
				this.plan.push({ kind: 'lines', shape: Math.floor(rand(0, 3)), a: rand(0.1, 1), b: rand(0, 1), c: this.colour() });
			} else {
				this.plan.push({ kind: 'square', d: Math.floor(rand(2, r * 0.6)), invert: Math.random() < 0.5, c: this.colour() });
			}
		}
		this.image = this.tile.getContext('2d').createImageData(this.n, this.n);
		var px = this.image.data;
		for (i = 3; i < px.length; i += 4) { px[i] = 255; }
		for (var k in this.copies) { this.copies[k].getContext('2d').clearRect(0, 0, this.n, this.n); }
		this.layer = 0;
		this.ring = -1;
		this.work = 0;
		this.rest = 0;
	};

	StainedGlass.prototype.colour = function () {
		return this.colours[1 + Math.floor(Math.random() * (this.colours.length - 1))];
	};

	/** Set a tile pixel and its seven mirror images; (x, y) from the middle. */
	StainedGlass.prototype.plot8 = function (x, y, c) {
		var r = this.r, n = this.n, d = this.image.data;
		var pts = [x, y, -x, y, x, -y, -x, -y, y, x, -y, x, y, -x, -y, -x];
		for (var i = 0; i < 16; i += 2) {
			var px = pts[i] + r, py = pts[i + 1] + r;
			if (px < 0 || py < 0 || px >= n || py >= n) { continue; }
			var o = (py * n + px) * 4;
			d[o] = c[0];
			d[o + 1] = c[1];
			d[o + 2] = c[2];
		}
	};

	/** One ring of a ring layer: each cell from its three neighbours on the ring inside. */
	StainedGlass.prototype.ringStep = function (L, d) {
		var prev = this.state || [], next = [];
		for (var y = 0; y <= d; y += 1) {
			var v;
			if (d === L.d0 || !prev.length) {
				v = Math.random() < 0.5 ? 1 : 0;
			} else {
				/* Reflect at the axis and at the diagonal, as the symmetry does. */
				var at = function (k) { return prev[Math.max(0, Math.min(prev.length - 1, Math.abs(k)))]; };
				var idx = (at(y - 1) << 2) | (at(y) << 1) | at(y + 1);
				v = (L.rule >> idx) & 1;
			}
			next.push(v);
			this.plot8(d, y, v ? L.on : L.off);
		}
		this.state = next;
	};

	StainedGlass.prototype.line = function (x0, y0, x1, y1, c) {
		var steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
		for (var i = 0; i <= steps; i += 1) {
			this.plot8(Math.round(x0 + (x1 - x0) * i / steps), Math.round(y0 + (y1 - y0) * i / steps), c);
		}
	};

	/** Do one layer whole, or one ring of a ring layer; true when the layer is done. */
	StainedGlass.prototype.advance = function () {
		var L = this.plan[this.layer], r = this.r, d;
		if (L.kind === 'rings') {
			if (this.ring < 0) { this.ring = L.d0; this.state = null; }
			this.ringStep(L, this.ring);
			this.ring += 1;
			return this.ring > L.d1;
		}
		if (L.kind === 'lines') {
			var a = Math.round(L.a * r), b = Math.round(L.b * r);
			if (L.shape === 0) { this.line(0, 0, r, r, L.c); }
			if (L.shape === 1) { this.line(a, 0, 0, a, L.c); }
			if (L.shape === 2) { this.line(a, b, r, Math.round(r * L.a * L.b), L.c); }
			return true;
		}
		var px = this.image.data, n = this.n;
		d = L.d;
		for (var y = r - d; y <= r + d; y += 1) {
			for (var x = r - d; x <= r + d; x += 1) {
				var o = (y * n + x) * 4;
				for (var k = 0; k < 3; k += 1) { px[o + k] = L.invert ? 255 - px[o + k] : L.c[k]; }
			}
		}
		return true;
	};

	/**
	 * After a layer the block is copied round: the trace shows all the places,
	 * or the eight next to it, or the four two away on the axes, or the rest.
	 */
	StainedGlass.prototype.spread = function () {
		var k = this.reach, which = Math.floor(Math.random() * 4), tile = this.tile;
		tile.getContext('2d').putImageData(this.image, 0, 0);
		for (var j = -k; j <= k; j += 1) {
			for (var i = -k; i <= k; i += 1) {
				var m = Math.max(Math.abs(i), Math.abs(j));
				var go = which === 0 || (which === 1 && m === 1) || (which === 2 && m === 2 && (i === 0 || j === 0)) ||
					(which === 3 && m === 2);
				if (m && go) { this.copies[i + ',' + j].getContext('2d').drawImage(tile, 0, 0); }
			}
		}
	};

	StainedGlass.prototype.step = function (dt, ctx, w, h) {
		if (this.layer < this.plan.length) {
			/* Spread the work - rings and whole layers - over the build time. */
			var total = 0;
			this.plan.forEach(function (L) { total += L.kind === 'rings' ? L.d1 - L.d0 + 1 : 1; });
			this.work += total * dt / BUILD;
			while (this.work >= 1 && this.layer < this.plan.length) {
				this.work -= 1;
				if (this.advance()) {
					this.layer += 1;
					this.ring = -1;
					this.spread();
				}
			}
		} else {
			this.rest += dt;
			if (this.rest > HOLD) { this.design(); }
		}
		this.tile.getContext('2d').putImageData(this.image, 0, 0);
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		ctx.imageSmoothingEnabled = false;
		var n = this.n, x0 = Math.round(w / 2 - n / 2), y0 = Math.round(h / 2 - n / 2), k = this.reach;
		for (var j = -k; j <= k; j += 1) {
			for (var i = -k; i <= k; i += 1) {
				if (i === 0 && j === 0) { continue; }
				ctx.drawImage(this.copies[i + ',' + j], x0 + i * n, y0 + j * n);
			}
		}
		ctx.drawImage(this.tile, x0, y0);
	};

	AfterDark.define('after-dark-stained-glass', function (el) {
		var sim = new StainedGlass();
		sim.layers = LAYERS[AfterDark.choice(el, 'complexity', COMPLEXITIES, 'low')];
		sim.reach = REACH[AfterDark.choice(el, 'duplication', DUPLICATIONS, 'lots')];
		sim.shades = SHADES[AfterDark.choice(el, 'color', COLORS, 'lots')];
		return sim;
	});

	window.AfterDarkStainedGlass = StainedGlass;
}());
