/**
 * swirling.js - Swirling Magic, thousands of Sea Pixies stirred by whirlpools.
 *
 * SWIRLING.AD's own description:
 *
 *   "Swirling Magic is based on an ancient Norse legend of underwater Sea
 *    Pixies who gathered by the thousands once a year in a massive
 *    reproductive frenzy. It is said that those who witnessed the event use
 *    their eyebrows more often in their facial expressions.
 *    "# of Sea Pixies" determines Pixie density. "Style" determines the
 *    pattern of the Pixies. "Palette" determines the colors of the Pixies.
 *    Press "Caps-lock" to change the colors."
 *
 * Its controls are # of Sea Pixies (a slider: Some, A Few, Plenty, Loads,
 * Tons - and Tons again - at 0, 20, 40 ... 100; default 35), Style (Swirling
 * Magic, Spaghetti Magic, Tiled Magic, Peacock Image, Random) and Palette
 * (BluesReds, Candy, Desert, Reds, Rainbow, Field, Sparkle, Random). Its art
 * is the seven palettes, PAL 2000-2006, 236 colours each, in
 * all/art/swirling/.
 *
 * The rest is the module's code, whose class (Mana) keeps its method names
 * in the exports. What it does:
 *
 *  - 67 x slider + 300 pixies (2645 by default, 7000 at most).
 *  - Three "attractors", each a 256x256 field of pushes built once: a
 *    whirlpool of strength 60-119 that turns one way inside a radius of
 *    20-49 and the other way outside it, falling off as 1/r. The field
 *    repeats every 256 pixels across the screen, so it is a tiling of
 *    whirlpools; each attractor slides its tiling towards a new random
 *    offset every few seconds (6-9 s for Swirling, 15-30 Spaghetti, 18-30
 *    Tiled, 25-26 Peacock), springing there (v += d x 1.5, v x= 0.6).
 *  - Each step a pixie adds the three pushes where it is to its velocity,
 *    times a damping that swings on a slow sine between two values (1.0 and
 *    0.98 for Swirling), and moves a tenth of that.
 *  - Swirling and Spaghetti pour the pixies out of an emitter that drifts
 *    against the field; one that leaves the screen goes back to it with a
 *    random kick. Tiled and Peacock scatter them over the screen and wrap
 *    them round the edges.
 *  - A pixie's colour is its speed (|vx| + |vy| + 1, as a palette index,
 *    mod 256). Swirling and Tiled draw each one as a dot that is wiped the
 *    next step; Spaghetti and Peacock leave the dot behind as a trail with
 *    a white head, and clear the screen every 40 and 60 s.
 *  - Three steps an iteration, each copied to the screen, an iteration every
 *    16 ms at most - in practice about 12 a second, the pace used here.
 *    Random picks one of the first three styles (never Peacock) and changes
 *    every 5 minutes.
 *  - Palette index 0 is replaced with white and 1 with black; 236-255 are
 *    past the end of the palettes and show as black here (the capture has
 *    a few stray greens there, from whatever the original's table held).
 *  - "Style" cannot be the attribute name - it is the element's CSS - so
 *    the control is look="..." here, the module's own word for it.
 *
 *   <after-dark-swirling-magic art="art/swirling" pixies="35" look="random" palette="random">
 */
(function () {
	'use strict';

	var STYLES = ['swirling magic', 'spaghetti magic', 'tiled magic', 'peacock image', 'random'];
	var PALETTES = ['bluesreds', 'candy', 'desert', 'reds', 'rainbow', 'field', 'sparkle', 'random'];
	var PIXIES = { 'some': 0, 'a few': 20, 'plenty': 40, 'loads': 60, 'tons': 100 };
	var N = 256;
	/* Iterate is allowed every 16 ms, but three full-screen copies an
	   iteration hold it to about 12 a second - the rate that matches how fast
	   the Wine capture's trails fill the screen. */
	var STEP = 1 / 12;
	var SUBSTEPS = 3;
	/* ConfigureLook, per style: bounds (0 emitter, 2 wrap), damping from and
	   to, trails, attractor retarget range (s), clear-screen period (s). */
	var LOOKS = [
		{ bounds: 0, d0: 1.0, d1: 0.98, trails: false, lo: 6, hi: 9, clear: 0 },
		{ bounds: 0, d0: 1.0, d1: 0.95, trails: true, lo: 15, hi: 30, clear: 40 },
		{ bounds: 2, d0: 0.9, d1: 0.96, trails: false, lo: 18, hi: 30, clear: 0 },
		{ bounds: 2, d0: 0.85, d1: 0.95, trails: true, lo: 25, hi: 26, clear: 60 }
	];
	var f32 = Math.fround;

	function randInt(n) {
		return Math.floor(Math.random() * n);
	}

	function coin() {
		return Math.random() < 0.5;
	}

	/** CacheDistanceMatrix: two near-identical 1/r terms per cell. */
	function distances() {
		var d = new Float32Array(N * N * 2), c = N / 2, k = 0.01 / (N * 0.5 * 25.132741228);
		for (var i = 0; i < N; i += 1) {
			for (var j = 0; j < N; j += 1) {
				var a = i - c || 1, b = j - c || 1;
				var r2 = a * a + b * b, r = Math.sqrt(r2), inv = 1 / r, t = r * k;
				var o = (i * N + j) * 2;
				d[o + 1] = inv;
				d[o] = 5 / r2 * Math.sin(t) + inv * Math.cos(t);
			}
		}
		return d;
	}

	/** FillMatrix: one whirlpool, centred in a 256x256 tile. Row is x, column y. */
	function whirlpool(dist) {
		var m = new Float32Array(N * N * 2), c = N / 2;
		var edge = 1 / (randInt(30) + 20), strength = randInt(60) + 60, flip = coin();
		for (var i = 0; i < N; i += 1) {
			for (var j = 0; j < N; j += 1) {
				var x = i - c || 1, y = j - c || 1, o = (i * N + j) * 2;
				var d1 = dist[o + 1];
				var s = (d1 < edge ? -strength : strength) * dist[o] * d1;
				if (!flip) {
					m[o] += s * y;
					m[o + 1] -= s * x;
				} else {
					m[o] -= s * y;
					m[o + 1] += s * x;
				}
			}
		}
		return m;
	}

	function Swirling() {
		this.count = 67 * 35 + 300;
		this.style = 4;
		this.palette = 7;
		this.palettes = null;
		this.w = 0;
		this.h = 0;
		this.acc = 0;
		this.t = 0;
	}

	Swirling.prototype.ready = function (pals) {
		this.palettes = pals;
		var dist = distances();
		/* SetUpAttractors: three, each at offset 0, sliding towards a random one. */
		this.attractors = [];
		for (var i = 0; i < 3; i += 1) {
			this.attractors.push({ field: whirlpool(dist), x: 0, y: 0, tx: randInt(this.w), ty: randInt(this.h),
				vx: f32((Math.random() * 4) * (coin() ? -1 : 1)), vy: f32((Math.random() * 4) * (coin() ? -1 : 1)) });
		}
		this.look = this.style;
		this.paletteIndex = -1;
		this.configure();
		this.pickPalette();
		this.blank();
		this.setUpParticles();
		this.dampFrom = this.t;
		this.dampFor = 5 + randInt(30);
	};

	Swirling.prototype.resize = function (w, h) {
		w = Math.max(2, Math.floor(w));
		h = Math.max(2, Math.floor(h));
		if (w === this.w && h === this.h) { return; }
		this.w = w;
		this.h = h;
		this.screen = document.createElement('canvas');
		this.screen.width = w;
		this.screen.height = h;
		this.image = this.screen.getContext('2d').createImageData(w, h);
		this.rgba = new Uint32Array(this.image.data.buffer);
		this.pix = new Uint8Array(w * h);
		this.ex = w / 2;
		this.ey = h / 2;
		this.evx = 0;
		this.evy = 0;
		if (this.palettes) {
			this.blank();
			this.setUpParticles();
		}
	};

	/** ConfigureLook (with PickRandomLook for Random). */
	Swirling.prototype.configure = function () {
		if (this.style >= 4) {
			var prev = this.look, next;
			do { next = randInt(3); } while (next === prev);
			this.look = next;
			this.lookUntil = this.t + 300;
		} else {
			this.look = this.style;
			this.lookUntil = Infinity;
		}
		var l = LOOKS[this.look];
		this.retargetAt = this.t + l.lo + randInt(l.hi - l.lo);
		this.clearAt = l.clear ? this.t + l.clear : Infinity;
	};

	/** SetUpCandyPalette: the chosen one, or a random one different from the last. */
	Swirling.prototype.pickPalette = function () {
		var prev = this.paletteIndex, next;
		if (prev < 0 && this.palette < 7) {
			next = this.palette;
		} else {
			do { next = randInt(7); } while (next === prev);
		}
		this.paletteIndex = next;
		var pal = this.palettes[String(2000 + next)];
		var little = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
		var lut = new Uint32Array(257);
		function rgb(r, g, b) {
			return little ? (0xff000000 | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0;
		}
		for (var i = 0; i < 256; i += 1) {
			var c = pal[i];
			lut[i] = c ? rgb(c[0], c[1], c[2]) : rgb(0, 0, 0);
		}
		lut[0] = rgb(253, 253, 253);
		lut[1] = rgb(0, 0, 0);
		this.lut = lut;
	};

	Swirling.prototype.blank = function () {
		if (this.pix) { this.pix.fill(1); }
	};

	/** SetUpParticles: at the emitter with a kick, or scattered and still. */
	Swirling.prototype.setUpParticles = function () {
		var n = this.count, l = LOOKS[this.look];
		this.px = new Float32Array(n);
		this.py = new Float32Array(n);
		this.vx = new Float32Array(n);
		this.vy = new Float32Array(n);
		this.prev = new Int32Array(n).fill(-1);
		for (var i = 0; i < n; i += 1) {
			if (l.bounds === 0) {
				this.px[i] = this.ex;
				this.py[i] = this.ey;
				this.vx[i] = (coin() ? 1 : -1) * randInt(25) / (randInt(25) + 1);
				this.vy[i] = (coin() ? 1 : -1) * randInt(25) / (randInt(25) + 1);
			} else {
				this.px[i] = randInt(this.w);
				this.py[i] = randInt(this.h);
				this.vx[i] = 0;
				this.vy[i] = 0;
			}
		}
	};

	/** UpdateAttractors: new targets now and then; spring towards them. */
	Swirling.prototype.moveAttractors = function () {
		var i, a, l = LOOKS[this.look];
		if (this.t > this.retargetAt) {
			for (i = 0; i < 3; i += 1) {
				this.attractors[i].tx = randInt(this.w);
				this.attractors[i].ty = randInt(this.h);
			}
			this.retargetAt = this.t + l.lo + randInt(l.hi - l.lo);
		}
		for (i = 0; i < 3; i += 1) {
			a = this.attractors[i];
			a.vx = f32(f32(a.vx + (a.tx - a.x) * 1.5) * 0.6);
			a.vy = f32(f32(a.vy + (a.ty - a.y) * 1.5) * 0.6);
			a.x = Math.trunc(a.x + a.vx * 0.02);
			a.y = Math.trunc(a.y + a.vy * 0.02);
		}
	};

	Swirling.prototype.substep = function () {
		var a0 = this.attractors[0], a1 = this.attractors[1], a2 = this.attractors[2];
		var m0 = a0.field, m1 = a1.field, m2 = a2.field;
		var w = this.w, h = this.h, look = LOOKS[this.look], damp = this.damp;
		var ix, iy, o0, o1, o2;

		/* UpdateEmitter: it drifts against the field and wraps. */
		ix = Math.trunc(this.ex);
		iy = Math.trunc(this.ey);
		o0 = ((((a0.x + ix) & 255) << 8) + ((a0.y + iy) & 255)) * 2;
		o1 = ((((a1.x + ix) & 255) << 8) + ((a1.y + iy) & 255)) * 2;
		o2 = ((((a2.x + ix) & 255) << 8) + ((a2.y + iy) & 255)) * 2;
		this.evx = f32((m0[o0] + m1[o1] + m2[o2] + this.evx) * 0.98);
		this.evy = f32((m0[o0 + 1] + m1[o1 + 1] + m2[o2 + 1] + this.evy) * 0.98);
		this.ex = f32(this.ex - this.evx * 0.1);
		this.ey = f32(this.ey - this.evy * 0.1);
		if (this.ex < 0) { this.ex += w; } else if (this.ex > w) { this.ex -= w; }
		if (this.ey > h) { this.ey -= h; } else if (this.ey < 0) { this.ey += h; }

		var px = this.px, py = this.py, vx = this.vx, vy = this.vy, prev = this.prev, pix = this.pix;
		var n = px.length, i, x, y;
		for (i = 0; i < n; i += 1) {
			/* MoveParticles. */
			ix = Math.trunc(px[i]);
			iy = Math.trunc(py[i]);
			o0 = ((((a0.x + ix) & 255) << 8) + ((a0.y + iy) & 255)) * 2;
			o1 = ((((a1.x + ix) & 255) << 8) + ((a1.y + iy) & 255)) * 2;
			o2 = ((((a2.x + ix) & 255) << 8) + ((a2.y + iy) & 255)) * 2;
			vx[i] = (m0[o0] + m1[o1] + m2[o2] + vx[i]) * damp;
			px[i] += vx[i] * 0.1;
			vy[i] = (m0[o0 + 1] + m1[o1 + 1] + m2[o2 + 1] + vy[i]) * damp;
			py[i] += vy[i] * 0.1;

			/* HandleBoundaries. */
			x = px[i];
			y = py[i];
			if (look.bounds === 2) {
				if (x < 0) { px[i] = x + w; } else if (x > w) { px[i] = x - w; }
				if (y > h) { py[i] = y - h; } else if (y < 0) { py[i] = y + h; }
			} else if (x > w || x < 0 || y > h || y < 0) {
				px[i] = this.ex;
				py[i] = this.ey;
				vx[i] = (coin() ? 1 : -1) * randInt(100) / (randInt(25) + 1);
				vy[i] = (coin() ? 1 : -1) * randInt(100) / (randInt(25) + 1);
			}

			/* Blit8: wipe the last dot (or just its white head), draw the new. */
			var p = prev[i];
			if (p >= 0) {
				if (look.trails) {
					pix[p + 1] = 1;
				} else {
					pix[p] = 1;
					pix[p + 1] = 1;
				}
			}
			ix = Math.trunc(px[i]);
			iy = Math.trunc(py[i]);
			if (ix >= 0 && ix < w - 1 && iy >= 0 && iy < h - 1) {
				p = iy * w + ix;
				var c = Math.trunc(Math.abs(vx[i]) + Math.abs(vy[i]) + 1) & 255;
				pix[p] = c;
				if (look.trails) { pix[p + 1] = 0; }
				prev[i] = p;
			} else {
				prev[i] = -1;
			}
		}
	};

	Swirling.prototype.iterate = function () {
		var l = LOOKS[this.look];
		if (this.t > this.lookUntil) {
			this.configure();
			this.blank();
			this.setUpParticles();
			l = LOOKS[this.look];
		}
		this.moveAttractors();
		/* The damping swings on half a sine, then picks a new period. */
		var since = this.t - this.dampFrom;
		if (since > this.dampFor) {
			this.dampFor = 10 + randInt(20);
			this.dampFrom = this.t;
			since = 0;
		}
		this.damp = f32(l.d0 + (l.d1 - l.d0) * Math.sin(since / this.dampFor * Math.PI));
		if (this.t > this.clearAt) {
			this.blank();
			this.clearAt = this.t + l.clear;
		}
	};

	Swirling.prototype.step = function (dt, ctx, w, h) {
		if (!this.palettes || !this.pix) {
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);
			return;
		}
		/* Each of an iteration's three steps reaches the screen on its own. */
		var sub = STEP / SUBSTEPS;
		this.acc = Math.min(this.acc + dt, STEP * 2);
		var any = false;
		while (this.acc >= sub) {
			this.acc -= sub;
			this.t += sub;
			this.phase = this.phase || 0;
			if (this.phase === 0) { this.iterate(); }
			this.substep();
			this.phase = (this.phase + 1) % SUBSTEPS;
			any = true;
		}
		if (any || !this.drawn) {
			var pix = this.pix, rgba = this.rgba, lut = this.lut;
			for (var i = 0; i < pix.length; i += 1) { rgba[i] = lut[pix[i]]; }
			this.screen.getContext('2d').putImageData(this.image, 0, 0);
			this.drawn = true;
		}
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(this.screen, 0, 0, w, h);
	};

	AfterDark.define('after-dark-swirling-magic', function (el) {
		var sim = new Swirling();
		var p = AfterDark.setting(el, 'pixies');
		var key = p === null ? '' : String(p).toLowerCase().trim();
		var v = key === '' ? 35 : (Object.prototype.hasOwnProperty.call(PIXIES, key) ? PIXIES[key] : Number(key));
		if (!isFinite(v)) { v = 35; }
		sim.count = 67 * Math.max(0, Math.min(100, Math.round(v))) + 300;
		/* "Style" cannot be the attribute: it is the element's CSS. The module calls it the look. */
		sim.style = AfterDark.choice(el, 'look', STYLES, 'random');
		sim.palette = AfterDark.choice(el, 'palette', PALETTES, 'random');
		window.addEventListener('keydown', function (e) {
			if (e.key === 'CapsLock' && sim.palettes) { sim.pickPalette(); }
		});
		AfterDark.data(AfterDark.setting(el, 'art') || 'art/swirling').then(function (d) {
			sim.ready(d.palettes);
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkSwirling = Swirling;
}());
