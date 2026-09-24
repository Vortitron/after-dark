/**
 * satori.js - Satori, a light show run on colour animation.
 *
 * SATORI.AD ships no artwork. Its own description:
 *
 *   "SATORI (tm) uses a technique called 'color animation' which changes the
 *    colors of an image without having to redraw the image. This happens only
 *    if your system has 256 colors. ... Pressing CAPS LOCK key will change
 *    your palette, so that you can flip through different palettes without
 *    waking After Dark. Try the 'Mix' display option -- it is well worth the
 *    wait. Original design and concept by Ben Haller."
 *
 * Its controls are Display (Fields, Pools, Rays, Waves, Leaves, Mix, Random),
 * Colors (Arizona, Siberia, Tijuana, Pacific, Hawaii, Nile, Louisiana,
 * Camelot, Colorado, Atlantis, Outback, Ithaca, Oz, Random), End Clarity
 * (1X1 to 16X16) and Knots. An image of palette indices is built up coarse to
 * fine - 16-pixel blocks first, down to End Clarity - and then only the
 * palette moves. The colour schemes are the module's names; what colours
 * they held is not in the resources, so these are what the names suggest.
 *
 *   <after-dark-satori display="mix" colors="random" end-clarity="2x2" knots="4">
 */
(function () {
	'use strict';

	var DISPLAYS = ['fields', 'pools', 'rays', 'waves', 'leaves', 'mix', 'random'];
	var COLORS = ['arizona', 'siberia', 'tijuana', 'pacific', 'hawaii', 'nile', 'louisiana', 'camelot',
		'colorado', 'atlantis', 'outback', 'ithaca', 'oz', 'random'];
	var SCHEMES = {
		arizona: [[120, 30, 10], [230, 110, 40], [255, 200, 120], [160, 60, 90], [60, 20, 60]],
		siberia: [[10, 20, 60], [120, 170, 230], [250, 250, 255], [160, 200, 220], [30, 60, 120]],
		tijuana: [[255, 40, 140], [255, 220, 0], [0, 200, 120], [255, 110, 0], [120, 0, 160]],
		pacific: [[0, 30, 80], [0, 120, 170], [100, 220, 220], [0, 80, 60], [200, 240, 255]],
		hawaii: [[255, 90, 90], [255, 200, 60], [60, 200, 90], [0, 150, 200], [255, 150, 200]],
		nile: [[20, 40, 110], [60, 130, 190], [230, 190, 90], [140, 100, 40], [240, 230, 190]],
		louisiana: [[20, 60, 30], [90, 140, 40], [170, 60, 160], [240, 200, 60], [30, 30, 60]],
		camelot: [[60, 0, 100], [150, 40, 190], [240, 200, 60], [180, 20, 40], [20, 20, 80]],
		colorado: [[40, 70, 140], [240, 240, 250], [60, 110, 50], [180, 120, 60], [220, 90, 30]],
		atlantis: [[0, 50, 60], [0, 160, 150], [180, 255, 220], [30, 90, 140], [0, 20, 30]],
		outback: [[140, 40, 10], [220, 110, 40], [250, 200, 120], [90, 60, 40], [30, 20, 10]],
		ithaca: [[90, 90, 100], [180, 180, 190], [240, 240, 240], [120, 30, 30], [40, 40, 60]],
		oz: [[0, 90, 30], [60, 220, 80], [220, 255, 160], [250, 220, 0], [0, 40, 20]]
	};
	var CLARITIES = ['1x1', '2x2', '4x4', '8x8', '16x16'];
	var KNOTS = ['1', '2', '3', '4', '5', '6', '8'];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function ramp(name) {
		var stops = SCHEMES[name], out = [];
		for (var i = 0; i < 256; i += 1) {
			var f = i / 256 * stops.length, a = stops[Math.floor(f)], b = stops[(Math.floor(f) + 1) % stops.length];
			var t = f - Math.floor(f);
			out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
		}
		return out;
	}

	/** The index at (x, y) for one of the displays, built round a few knots. */
	function field(kind, x, y, knots) {
		var v = 0, i, k;
		switch (kind) {
		case 0: /* Fields: interference of waves from each knot. */
			for (i = 0; i < knots.length; i += 1) {
				k = knots[i];
				v += Math.sin(Math.hypot(x - k.x, y - k.y) * k.f);
			}
			return v / knots.length * 128;
		case 1: /* Pools: rings round each knot, nearest wins. */
			var best = Infinity;
			for (i = 0; i < knots.length; i += 1) { best = Math.min(best, Math.hypot(x - knots[i].x, y - knots[i].y)); }
			return best * 3;
		case 2: /* Rays: angle round each knot. */
			for (i = 0; i < knots.length; i += 1) {
				k = knots[i];
				v += Math.atan2(y - k.y, x - k.x) * k.n;
			}
			return v / Math.PI * 128;
		case 3: /* Waves: travelling sines, crossing. */
			for (i = 0; i < knots.length; i += 1) {
				k = knots[i];
				v += Math.sin((x * Math.cos(k.a) + y * Math.sin(k.a)) * k.f * 0.7 + k.p);
			}
			return v * 64 + y * 0.5;
		default: /* Leaves: angle and distance mixed, a spiral round each knot. */
			for (i = 0; i < knots.length; i += 1) {
				k = knots[i];
				var d = Math.hypot(x - k.x, y - k.y);
				v += Math.sin(Math.atan2(y - k.y, x - k.x) * k.n + d * k.f * 0.5);
			}
			return v * 90;
		}
	}

	function Satori() {
		this.display = 5;
		this.colors = 'random';
		this.clarity = 2;
		this.knotCount = 4;
	}

	Satori.prototype.resize = function (w, h) {
		this.bw = Math.ceil(w / 2);
		this.bh = Math.ceil(h / 2);
		this.canvas = document.createElement('canvas');
		this.canvas.width = this.bw;
		this.canvas.height = this.bh;
		this.image = this.canvas.getContext('2d').createImageData(this.bw, this.bh);
		this.index = new Uint8Array(this.bw * this.bh);
		this.start();
	};

	Satori.prototype.start = function () {
		var bw = this.bw, bh = this.bh;
		this.kind = this.display === 6 ? Math.floor(Math.random() * 6) : this.display;
		this.knots = [];
		for (var i = 0; i < this.knotCount; i += 1) {
			this.knots.push({ x: rand(0, bw), y: rand(0, bh), f: rand(0.04, 0.14), n: 1 + Math.floor(rand(0, 4)),
				a: rand(0, Math.PI * 2), p: rand(0, 6) });
		}
		this.mixWith = Math.floor(Math.random() * 5);
		this.block = 16;
		this.row = 0;
		this.pickColours();
		this.offset = 0;
		this.age = 0;
	};

	Satori.prototype.pickColours = function () {
		var names = Object.keys(SCHEMES);
		this.current = this.colors === 'random' ? names[Math.floor(Math.random() * names.length)] : this.colors;
		this.pal = ramp(this.current);
	};

	Satori.prototype.value = function (x, y) {
		if (this.kind === 5) {
			/* Mix: two of the others laid over each other. */
			return field(this.mixWith, x, y, this.knots) + field((this.mixWith + 2) % 5, x, y, this.knots);
		}
		return field(this.kind, x, y, this.knots);
	};

	Satori.prototype.step = function (dt, ctx, w, h) {
		var bw = this.bw, bh = this.bh, b = this.block, end = this.clarity;
		/* Build: a band of rows a frame at this block size, then finer. */
		var budget = 5, t0 = (window.performance || Date).now();
		while (b >= end && (window.performance || Date).now() - t0 < budget) {
			for (var x = 0; x < bw; x += b) {
				var v = ((Math.round(this.value(x + b / 2, this.row + b / 2)) % 256) + 256) % 256;
				for (var yy = this.row; yy < Math.min(bh, this.row + b); yy += 1) {
					for (var xx = x; xx < Math.min(bw, x + b); xx += 1) { this.index[yy * bw + xx] = v; }
				}
			}
			this.row += b;
			if (this.row >= bh) {
				this.row = 0;
				b = this.block = b / 2;
			}
		}
		this.age += dt;
		if (this.age > 90) { this.start(); }
		this.offset = (this.offset + dt * 60) % 256;
		var d = this.image.data, pal = this.pal, off = Math.floor(this.offset), idx = this.index;
		for (var i = 0; i < idx.length; i += 1) {
			var c = pal[(idx[i] + off) & 255], o = i * 4;
			d[o] = c[0];
			d[o + 1] = c[1];
			d[o + 2] = c[2];
			d[o + 3] = 255;
		}
		this.canvas.getContext('2d').putImageData(this.image, 0, 0);
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(this.canvas, 0, 0, bw * 2, bh * 2);
	};

	AfterDark.define('after-dark-satori', function (el) {
		var sim = new Satori();
		sim.display = AfterDark.choice(el, 'display', DISPLAYS, 'mix');
		sim.colors = COLORS[AfterDark.choice(el, 'colors', COLORS, 'random')];
		sim.clarity = Math.max(1, Math.pow(2, AfterDark.choice(el, 'end-clarity', CLARITIES, '2x2')) / 2);
		sim.knotCount = Number(KNOTS[AfterDark.choice(el, 'knots', KNOTS, '4')]);
		window.addEventListener('keydown', function (e) {
			if (e.key === 'CapsLock') { sim.pickColours(); }
		});
		return sim;
	});

	window.AfterDarkSatori = Satori;
}());
