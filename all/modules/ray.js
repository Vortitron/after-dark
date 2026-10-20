/**
 * ray.js - Ray, the ray-traced shapes that sit on your desktop.
 *
 * RAY.AD's own description (Dan Michaeloff, 1994):
 *
 *   "Select a shape as decoration for your desktop. On a very fast computer,
 *    it took approximately 20 hours to calculate one scene. Aren't you glad
 *    we traced them ahead of time?"
 *   "Objects" selects the number of traces on the screen. "Shadows"
 *   determines the color of the shadows, if any, that appear beneath the
 *   traces. "Backdrop" selects the background for the traces. "Shape"
 *   selects the shape to use.
 *
 * The traces are TRACES/*.TRC, decoded by tools/adray.py into all/art/ray/.
 * They are not pictures. Each pixel says which of 64 rows of a colour table
 * to use and where in the backdrop to look, so a glass torus bends whatever
 * is behind it. That is done here as the module did it, worked out from its
 * code: the backdrop is reduced to Ray's 256-colour palette, the 64 x 256
 * table is built from the trace's own tint and colour ramps, and each pixel
 * is table[row][backdrop colour at (x + dx, y + dy)], the nearest palette
 * colour. See tools/adray.py for the format and the arithmetic.
 *
 * What is not the module's, because Ray would not draw under Wine to be
 * watched (it loads its trace, then dies of a 16-bit stack overflow) and its
 * drawing goes through
 * ADXPL300 by unnamed ordinal:
 *   - placement: the traces get non-overlapping places at random, which is
 *     what "Not enough room on screen for number of objects selected" says
 *     the module did; where they will not all fit, fewer are shown.
 *   - eight frames a second, and the bouncing scenes' rest height.
 *   - Backdrop "pattern" and "boxes" are drawn by code that was not found, so
 *     they show the desktop too; Shadows is accepted but not drawn - the 16
 *     grey rows the colour table builds for it are never read by the
 *     compositor that was decoded.
 *   - the cat (PICT 1000, four running frames and an explosion) is in
 *     all/art/ray/ but what sets it off is not known, so it never appears.
 *
 *   <after-dark-ray art="art/ray" objects="3" shadows="black" backdrop="desktop" shape="torus">
 */
(function () {
	'use strict';

	var SHADOWS = ['none', 'black', 'grey'];
	var BACKDROPS = ['desktop', 'pattern', 'boxes'];
	var SHAPES = ['bouncsph', 'multisph', 'rotcube', 'rotpyra', 'diamond', 'diabounc', 'torus'];
	var TINT = [0.8, 1.0, 0.9];
	/* Windows' twenty static colours, round the module's own 234. */
	var LOW = [[0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0], [0, 0, 128], [128, 0, 128],
		[0, 128, 128], [192, 192, 192], [192, 220, 192], [166, 202, 240]];
	var HIGH = [[255, 251, 240], [160, 160, 164], [128, 128, 128], [255, 0, 0], [0, 255, 0],
		[255, 255, 0], [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]];

	function buildPalette(own) {
		var pal = LOW.concat(own);
		while (pal.length < 246) { pal.push([0, 0, 0]); }
		return pal.concat(HIGH);
	}

	/** Nearest palette index to (r, g, b), remembered. */
	function Nearest(pal) {
		this.pal = pal;
		this.memo = new Map();
	}
	Nearest.prototype.find = function (r, g, b) {
		var key = (r << 16) | (g << 8) | b;
		var hit = this.memo.get(key);
		if (hit !== undefined) { return hit; }
		var best = 0, bestD = Infinity, pal = this.pal;
		for (var i = 0; i < pal.length; i += 1) {
			var dr = pal[i][0] - r, dg = pal[i][1] - g, db = pal[i][2] - b;
			var d = dr * dr + dg * dg + db * db;
			if (d < bestD) { bestD = d; best = i; }
		}
		this.memo.set(key, best);
		return best;
	};

	/** The 64 x 256 colour table for one trace: row i*8+j, column = backdrop index. */
	function colourTable(trace, near) {
		var pal = near.pal, out = new Uint8Array(64 * 256);
		var a0 = trace.a[0], a1 = trace.a[1], b0 = trace.b[0], b1 = trace.b[1], obj = trace.colour;
		for (var i = 0; i < 8; i += 1) {
			var s = a0 + (a1 - a0) * i / 7;
			var f = TINT.map(function (t) { return (1 - s) + t * s; });
			for (var j = 0; j < 8; j += 1) {
				var t = b1 === 0 ? 0 : b0 + (b1 - b0) * j / 7;
				for (var k = 0; k < 256; k += 1) {
					var c = pal[k];
					out[(i * 8 + j) * 256 + k] = near.find(
						Math.max(0, Math.min(255, Math.floor(c[0] * f[0] * (1 - t) + obj[0] * t))),
						Math.max(0, Math.min(255, Math.floor(c[1] * f[1] * (1 - t) + obj[1] * t))),
						Math.max(0, Math.min(255, Math.floor(c[2] * f[2] * (1 - t) + obj[2] * t))));
				}
			}
		}
		return out;
	}

	function Ray() {
		this.count = 3;
		this.shadows = 1;
		this.backdrop = 0;
		this.shape = 'random';
		this.meta = null;
	}

	Ray.prototype.setArt = function (meta, strips) {
		this.meta = meta;
		this.near = new Nearest(buildPalette(meta.palette));
		this.strips = strips;
		this.tables = {};
		if (this.w) { this.resize(this.w, this.h); }
	};

	/** The trace's codes as {w, h, count, codes: Uint8ClampedArray rgba strip}. */
	Ray.prototype.trace = function (name) {
		if (!this.tables[name]) {
			var t = this.meta.traces[name];
			this.tables[name] = { meta: t, table: colourTable(t, this.near), codes: this.strips[name] };
		}
		return this.tables[name];
	};

	Ray.prototype.resize = function (w, h) {
		this.w = Math.max(1, Math.round(w));
		this.h = Math.max(1, Math.round(h));
		if (!this.meta) { return; }
		this.paintBackdrop();
		this.place();
	};

	/** The backdrop as a canvas and as palette indices, which is what Ray samples. */
	Ray.prototype.paintBackdrop = function () {
		var w = this.w, h = this.h, c;
		/* Pattern and Boxes were drawn by code that was not found: see above. */
		c = AfterDark.desktop(w, h);
		var data = c.getContext('2d').getImageData(0, 0, w, h).data;
		var idx = new Uint8Array(w * h);
		for (var p = 0, q = 0; p < idx.length; p += 1, q += 4) {
			idx[p] = this.near.find(data[q], data[q + 1], data[q + 2]);
		}
		this.ground = c;
		this.groundIdx = idx;
		this.frame = null;
	};

	Ray.prototype.place = function () {
		var names = Object.keys(this.meta.traces), taken = [];
		this.objects = [];
		for (var i = 0; i < this.count; i += 1) {
			var name = this.shape === 'random' || !this.meta.traces[this.shape] ?
				names[Math.floor(Math.random() * names.length)] : this.shape;
			var t = this.trace(name), m = t.meta;
			var lift = m.y ? -Math.min.apply(null, m.y) : 0;
			var w = m.w, h = m.h + lift;
			for (var tries = 0; tries < 200; tries += 1) {
				var x = Math.floor(Math.random() * Math.max(1, this.w - w));
				var y = Math.floor(Math.random() * Math.max(1, this.h - h)) + lift;
				var clear = taken.every(function (r) {
					return x + w <= r.x || r.x + r.w <= x || y - lift + h <= r.y || r.y + r.h <= y - lift;
				});
				if (clear) {
					taken.push({ x: x, y: y - lift, w: w, h: h });
					this.objects.push({ t: t, x: x, y: y, frame: Math.floor(Math.random() * m.count), clock: 0 });
					break;
				}
			}
		}
	};

	/** Composite one trace frame onto `out` (ImageData of the whole screen). */
	Ray.prototype.composite = function (o, out) {
		var t = o.t, m = t.meta, W = this.w, H = this.h;
		var codes = t.codes, stripW = m.w * m.count;
		var pal = this.near.pal, table = t.table, ground = this.groundIdx, px = out.data;
		var fx = (o.frame % m.count) * m.w;
		var oy = o.y + (m.y ? m.y[o.frame % m.count] : 0);
		for (var y = 0; y < m.h; y += 1) {
			var sy = oy + y;
			if (sy < 0 || sy >= H) { continue; }
			for (var x = 0; x < m.w; x += 1) {
				var sx = o.x + x;
				if (sx < 0 || sx >= W) { continue; }
				var c = ((y * stripW) + fx + x) * 4;
				var code = codes[c];
				if (code === 255) { continue; }
				var bg;
				if (code & 0x80) {
					bg = 255;
				} else {
					var bx = Math.min(W - 1, Math.max(0, sx + codes[c + 1] - 128));
					var by = Math.min(H - 1, Math.max(0, sy + codes[c + 2] - 128));
					bg = ground[by * W + bx];
				}
				var colour = pal[table[(code & 0x3f) * 256 + bg]];
				var d = (sy * W + sx) * 4;
				px[d] = colour[0]; px[d + 1] = colour[1]; px[d + 2] = colour[2]; px[d + 3] = 255;
			}
		}
	};

	Ray.prototype.step = function (dt, ctx, w, h) {
		if (!this.meta) { return; }
		if (!this.frame) {
			ctx.drawImage(this.ground, 0, 0);
			this.frame = ctx.getImageData(0, 0, this.w, this.h);
			this.clean = new Uint8ClampedArray(this.frame.data);
		}
		var out = this.frame, i;
		/* Put back what each trace covered, then draw them all at their next frame. */
		for (i = 0; i < this.objects.length; i += 1) {
			this.restore(this.objects[i], out);
		}
		for (i = 0; i < this.objects.length; i += 1) {
			var o = this.objects[i];
			o.clock += dt;
			if (o.clock >= 0.125) { o.clock = 0; o.frame = (o.frame + 1) % o.t.meta.count; }
			this.composite(o, out);
		}
		ctx.putImageData(out, 0, 0);
	};

	Ray.prototype.restore = function (o, out) {
		var m = o.t.meta, W = this.w, H = this.h, lift = m.y ? -Math.min.apply(null, m.y) : 0;
		for (var y = o.y - lift; y < o.y + m.h; y += 1) {
			if (y < 0 || y >= H) { continue; }
			var a = (y * W + Math.max(0, o.x)) * 4, b = (y * W + Math.min(W, o.x + m.w)) * 4;
			out.data.set(this.clean.subarray(a, b), a);
		}
	};

	AfterDark.define('after-dark-ray', function (el) {
		var sim = new Ray();
		sim.count = Math.max(1, Math.min(5, parseInt(AfterDark.setting(el, 'objects'), 10) || 3));
		sim.shadows = AfterDark.choice(el, 'shadows', SHADOWS, 'black');
		sim.backdrop = AfterDark.choice(el, 'backdrop', BACKDROPS, 'desktop');
		var shape = String(AfterDark.setting(el, 'shape') || 'random').toLowerCase().replace(/\.trc$/, '');
		sim.shape = SHAPES.indexOf(shape) >= 0 ? shape : 'random';
		var base = (AfterDark.setting(el, 'art') || 'art/ray').replace(/\/$/, '');
		AfterDark.data(base).then(function (meta) {
			var names = Object.keys(meta.traces);
			return Promise.all(names.map(function (n) {
				return new Promise(function (resolve, reject) {
					var img = new Image();
					img.onload = function () {
						var c = document.createElement('canvas');
						c.width = img.width; c.height = img.height;
						var g = c.getContext('2d');
						g.drawImage(img, 0, 0);
						resolve(g.getImageData(0, 0, img.width, img.height).data);
					};
					img.onerror = reject;
					img.src = AfterDark.bust(base + '/' + n + '.png');
				});
			})).then(function (datas) {
				var strips = {};
				names.forEach(function (n, i) { strips[n] = datas[i]; });
				sim.setArt(meta, strips);
			});
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkRay = Ray;
}());
