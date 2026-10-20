/**
 * psycho.js - Psycho Deli, pictures made of maths and run on colour cycling.
 *
 * PSYCHO.AD's own description:
 *
 *   "And you thought Satori was trippy . . . .
 *    "Picture" determines the underlying image. "Random" shows a sampling of
 *    all the pictures. "Speed" determines how dizzyingly fast you want the
 *    colors to move. "Knots" indicates the complexity of the image. Pressing
 *    "Caps-lock" at any time chooses a new set of colors."
 *
 * Its controls are Picture (Tie-dye, The Dome, Peacock, The Well, Jagged,
 * Night Train, Splash, Head Cheese, Pinwheel, Gozar, Crop Circles, Random),
 * Speed (a slider: Slow, Fast, Faster, Fastest at 0, 50, 75, 99; default 41)
 * and Knots (a slider: Center, A Few, Some, Many, Lots, Random at 0, 20, 35,
 * 50, 65, 80; default 100). It ships no pictures - its one bitmap is the
 * control-panel thumbnail - so everything here is read from its code:
 *
 *  - Knots are point charges, each a position and a strength of -20000 to
 *    20000. Center puts four just outside the corners, alike on each diagonal; otherwise
 *    A Few is 2, Some 4, Many 8, Lots 16 and Random 2-15, at random places.
 *  - At each pixel the knots' pull adds up to a vector (strength x d / r^2,
 *    times 100 for Peacock, Jagged and Night Train). The log of its squared
 *    length, L, and its angle feed two sine terms, and the pixel's colour is
 *    a palette index:
 *      i1 = sin(f1 x angle) x a1 + k x L
 *      i2 = (sin(f2 x L) + 1) x a2 + k x L + angle x 234 x c / pi
 *    each mod 234, and the colour is (i1 + i2) mod 234. Where the pull is the
 *    plain sum (all but Peacock and Night Train), i1 is mirrored on
 *    alternate pixels - the checkerboard in the control-panel thumbnail. Each picture is a set of k, a1, f1, a2,
 *    f2 and c; Jagged uses i2 alone, twice.
 *  - The palette is 235 hues across a random span of 120-360 degrees from a
 *    random start, at full saturation, with brightness |sin| over 2-4 humps.
 *    It cycles one step every (101 - Speed) frames, and morphs towards a new
 *    random palette over 500 steps, every 500 steps. Caps Lock morphs to a
 *    new one over 30.
 *  - The first picture is drawn straight to the screen, a ring at a time in
 *    each of a 4x4 grid of blocks. Every one after that is drawn off screen,
 *    80 pixels a frame; when it is done the palette fades to black over 250
 *    frames, the new picture is swapped in, and it fades back up. Random
 *    picks a different picture each time, from the first ten (never Crop
 *    Circles); otherwise the same picture comes back with new knots.
 *
 * How fast the original runs depends on the machine. The pace here is the
 * Wine capture's - a new 1024x768 picture every 2.4 seconds - which also
 * sets the colour cycling to about 70 steps a second at the default speed.
 * That capture ran in true colour, where palette animation does nothing, so
 * its colours stand still; this is the 256-colour behaviour the module was
 * written for. The splash line is the module's own string 666.
 *
 *   <after-dark-psycho-deli picture="random" speed="41" knots="random">
 */
(function () {
	'use strict';

	var PICTURES = ['tie-dye', 'the dome', 'peacock', 'the well', 'jagged', 'night train', 'splash',
		'head cheese', 'pinwheel', 'gozar', 'crop circles', 'random'];
	var SPEEDS = { 'slow': 0, 'fast': 50, 'faster': 75, 'fastest': 99 };
	var KNOTS = { 'center': 0, 'a few': 20, 'some': 35, 'many': 50, 'lots': 65, 'random': 80 };
	/* 0x410c0c, per picture: c (a00), k (a04), a1 (a08), a2 (a0c), f1 (a10), f2 (a14), function. */
	var PARAMS = [
		[0.5, 30, 20, 10, 25, 15, 'b'],
		[0.5, 40, 25, 85, 15, 2, 'b'],
		[0.5, 20, 45, 55, 30, 10, 'a'],
		[0.5, 30, 12, 20, 10, 5, 'b'],
		[0.5, 30, 10, 10, 20, 20, 'c'],
		[0.5, 50, 25, 15, 12, 12, 'a'],
		[0.5, 50, 55, 15, 12, 12, 'b'],
		[0.5, 20, 45, 45, 25, 10, 'b'],
		[4, 170, 25, 85, 15, 2, 'b'],
		[3, 90, 20, 20, 5, 5, 'b'],
		[3, 180, 2, 2, 5, 5, 'b']
	];
	var COUNT = 235;        /* palette entries, 0..234 */
	var MOD = 234;          /* what the pixel indices wrap at */
	var CALLS_PER_SECOND = 355000;
	var SPLASH = 'Psycho Deli:  Nutritious and delicious.';

	var f32 = Math.fround;

	function rand() {
		return Math.floor(Math.random() * 0x80000000);
	}

	function cmod(a, n) {
		return a - Math.trunc(a / n) * n;
	}

	/** 0x410990: HSV to RGB, h in degrees, s and v 0-1. */
	function hsv(h, s, v) {
		if (s === 0) { return [0, 0, 0]; }
		if (h === 360) { h = 0; }
		h /= 60;
		var i = Math.floor(h), f = h - i;
		var p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
		var c;
		switch (i) {
		case 0: c = [v, t, p]; break;
		case 1: c = [q, v, p]; break;
		case 2: c = [p, v, t]; break;
		case 3: c = [p, q, v]; break;
		case 4: c = [t, p, v]; break;
		default: c = [v, p, q];
		}
		return [Math.trunc(c[0] * 255), Math.trunc(c[1] * 255), Math.trunc(c[2] * 255)];
	}

	function Psycho() {
		this.picture = 11;
		this.speed = 41;
		this.knotSetting = 100;
		this.w = 0;
		this.h = 0;
		/* Palette state: bytes shown, current colour and per-step change (floats). */
		this.bytes = new Uint8Array(COUNT * 3);
		this.cur = new Float32Array(COUNT * 3);
		this.delta = new Float32Array(COUNT * 3);
		this.target = new Int32Array(COUNT * 3);
	}

	/** 0x411040: a new random palette to morph to over `steps`. */
	Psycho.prototype.newPalette = function (steps) {
		var humps = rand() % 3 + 2, span = (rand() % 5 + 2) * 60, base = rand() % 360;
		for (var i = 0; i < COUNT; i += 1) {
			var hue = cmod(Math.trunc(base + i / COUNT * span), 360);
			var val = Math.abs(Math.sin(i / COUNT * Math.PI * humps));
			var c = hsv(hue, 1, val);
			for (var k = 0; k < 3; k += 1) {
				this.target[i * 3 + k] = c[k];
				this.delta[i * 3 + k] = (c[k] - this.cur[i * 3 + k]) / steps;
			}
		}
		this.morphSteps = steps;
		this.morphAt = 0;
	};

	Psycho.prototype.setPicture = function (p) {
		var q = PARAMS[p];
		this.pic = p;
		this.c = q[0];
		this.k = q[1];
		this.a1 = q[2];
		this.a2 = q[3];
		this.f1 = q[4];
		this.f2 = q[5];
		this.fn = q[6];
		this.angScale = MOD / (Math.PI / this.c);
	};

	/** The Knots setting, as the module reads its slider. */
	Psycho.prototype.setKnots = function () {
		var v = this.knotSetting;
		if (v < 20) { this.center = true; this.knotCount = 4; }
		else if (v < 35) { this.center = false; this.knotCount = 2; }
		else if (v < 40) { this.center = false; this.knotCount = 4; }
		else if (v < 55) { this.center = false; this.knotCount = 8; }
		else if (v < 70) { this.center = false; this.knotCount = 16; }
		else if (v >= 80) { this.center = false; this.knotCount = rand() % 14 + 2; }
	};

	/** 0x410878. */
	Psycho.prototype.placeKnots = function () {
		var w = this.w, h = this.h, k = [];
		if (this.center) {
			var x0 = Math.trunc(-w / 16), y0 = Math.trunc(-h / 16), x1 = Math.trunc(w / 16) + w, y1 = Math.trunc(h / 16) + h;
			k = [[x0, y0, -20000], [x1, y1, -20000], [x1, y0, 20000], [x0, y1, 20000]];
		} else {
			for (var i = 0; i < this.knotCount; i += 1) {
				var s = rand() % 40000 - 20000;
				k.push([w ? rand() % w : 0, h ? rand() % h : 0, s]);
			}
		}
		this.knots = k;
	};

	/** The picture's palette index at (x, y); the last one again where the original returns early. */
	Psycho.prototype.pixel = function (x, y) {
		var knots = this.knots, fx = 0, fy = 0, mul = this.fn === 'b' ? 1 : 100;
		for (var i = 0; i < knots.length; i += 1) {
			/* Single-precision, as the module keeps them. */
			var dx = knots[i][0] - x, dy = knots[i][1] - y, r2 = f32(dx * dx + dy * dy);
			if (r2 === 0) { return this.last; }
			fx = f32(fx + dx * mul * knots[i][2] / r2);
			fy = f32(fy + dy * mul * knots[i][2] / r2);
		}
		if (fx === 0 && fy === 0) { return this.last; }
		/* 0x4159bc is the runtime's log, not a square root: the "length" is ln |v|^2. */
		var len = f32(Math.log(f32(fx * fx + fy * fy)));
		var ang = fy === 0 ? 0 : Math.atan2(fx, fy) + Math.PI;
		var i2 = cmod(Math.trunc((Math.sin(this.f2 * len) + 1) * this.a2 + this.k * len + ang * this.angScale), MOD);
		var i1;
		if (this.fn === 'c') {
			i1 = i2;
		} else {
			i1 = cmod(Math.trunc(Math.sin(this.f1 * ang) * this.a1 + this.k * len), MOD);
			/* Only the plain-sum pictures mirror i1 on alternate pixels. */
			if (this.fn === 'b' && (x + y) & 1) { i1 = MOD - i1; }
		}
		var c = cmod(i1 + i2, MOD);
		if (c < 0) { c += MOD; }
		this.last = c;
		return c;
	};

	Psycho.prototype.resize = function (w, h) {
		w = Math.max(8, Math.floor(w));
		h = Math.max(8, Math.floor(h));
		if (w === this.w && h === this.h) { return; }
		this.w = w;
		this.h = h;
		this.canvas = document.createElement('canvas');
		this.canvas.width = w;
		this.canvas.height = h;
		this.image = this.canvas.getContext('2d').createImageData(w, h);
		this.rgba = new Uint32Array(this.image.data.buffer);
		this.screen = new Uint8Array(w * h).fill(255);
		this.back = new Uint8Array(w * h);
		this.start();
	};

	/** Initialise and Blank. */
	Psycho.prototype.start = function () {
		var w = this.w, h = this.h;
		this.setKnots();
		var p = this.picture === 11 ? rand() % 10 : this.picture;
		this.setPicture(p);
		this.placeKnots();
		this.last = 0;
		this.newPalette(500);
		for (var i = 0; i < COUNT * 3; i += 1) {
			this.bytes[i] = this.target[i];
			this.cur[i] = this.target[i];
		}
		this.morphSteps = 0;
		this.animFrames = 0;
		this.cycles = 0;
		this.ring = 0;
		this.firstDone = false;
		this.rendering = false;
		this.ready = false;
		this.rx = 0;
		this.ry = 0;
		this.bw = Math.trunc(w / 4);
		this.bh = Math.trunc(h / 4);
		/* Blank paints palette colours before the first picture: rows out to
		   x = height, then for every other column an X and a vertical line. */
		var s = this.screen, x, y;
		s.fill(255);
		for (y = 0; y < h; y += 1) {
			var c = (2 * y) % MOD;
			for (x = 0; x <= Math.min(h, w - 1); x += 1) { s[y * w + x] = c; }
		}
		for (var b = 0; b < 2 * w; b += 2) {
			var col = (2 * b) % MOD;
			this.line(b, 0, 0, b, col);
			this.line(w - b, 0, w, b, col);
			this.line(b, 0, b, h, col);
		}
		this.splash = 2.5;
	};

	Psycho.prototype.put = function (x, y) {
		if (x >= 0 && x < this.w && y >= 0 && y < this.h) { this.screen[y * this.w + x] = this.pixel(x, y); }
	};

	Psycho.prototype.line = function (x0, y0, x1, y1, c) {
		var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)), w = this.w, h = this.h;
		for (var i = 0; i < n; i += 1) {
			var x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
			if (x >= 0 && x < w && y >= 0 && y < h) { this.screen[y * w + x] = c; }
		}
	};

	/** One DrawFrame. Returns how many pixel calls it cost. */
	Psycho.prototype.frame = function () {
		var w = this.w, h = this.h, s = this.screen, cost = 1, x, y, i, j;
		if (!this.firstDone) {
			/* The first picture, straight to the screen: ring `r` of every block. */
			var r = this.ring, bw = this.bw, bh = this.bh;
			for (i = 0; i < 4; i += 1) {
				for (j = 0; j < 4; j += 1) {
					var left = i * bw + r, right = (i + 1) * bw - r - 1, top = j * bh + r, bottom = (j + 1) * bh - r - 1;
					for (y = top; y < bottom; y += 1) { s[y * w + left] = this.pixel(left, y); cost += 1; }
					for (y = top; y <= bottom; y += 1) { this.put(right, y); cost += 1; }
					for (x = left; x < right; x += 1) { s[top * w + x] = this.pixel(x, top); cost += 1; }
					for (x = left; x < right; x += 1) { this.put(x, bottom); cost += 1; }
				}
			}
		}
		this.ring += 1;
		if (this.ring === Math.trunc(this.bh / 2) || this.swapped) {
			this.swapped = false;
			this.firstDone = true;
			this.rendering = true;
			this.ready = false;
			this.rx = 0;
			this.ry = 0;
			if (this.picture === 11) {
				var next;
				do { next = rand() % 10; } while (next === this.pic);
				this.setPicture(next);
			}
			this.placeKnots();
		}
		if (this.rendering && !this.ready) {
			/* 80 pixels along the row, running off its end; the row only
			   wraps between batches. */
			for (i = 0; i < 80; i += 1) {
				if (this.ry < h && this.rx < w) { this.back[this.ry * w + this.rx] = this.pixel(this.rx, this.ry); }
				this.rx += 1;
			}
			if (this.rx >= w) {
				this.rx = 0;
				this.ry += 1;
				if (this.ry - 1 === h) { this.ready = true; }
			}
			cost += 80;
			if (this.ready) {
				this.fadeLeft = 500;
				this.bright = 1;
			}
		}
		/* Colour animation every (101 - Speed) frames. */
		if (this.ring % (101 - this.speed) === 0) { this.animate(); }
		if (this.ready) {
			cost += 160;
			this.transition();
		}
		return cost;
	};

	Psycho.prototype.animate = function () {
		var n = COUNT * 3, k;
		if (this.cycles % 500 === 0) { this.newPalette(500); }
		this.cycles += 1;
		if (this.morphSteps) {
			this.morphAt += 1;
			if (this.morphAt < this.morphSteps) {
				for (k = 0; k < n; k += 1) {
					this.cur[k] += this.delta[k];
					this.bytes[k] = Math.trunc(this.cur[k]) & 255;
				}
			} else {
				this.morphSteps = 0;
			}
		}
		/* Rotate entries 0..234 up by one, the last coming round to the front. */
		this.rotate(this.bytes);
		this.rotate(this.cur);
		this.rotate(this.delta);
	};

	Psycho.prototype.rotate = function (a) {
		var last = (COUNT - 1) * 3, r = a[last], g = a[last + 1], b = a[last + 2];
		a.copyWithin(3, 0, last);
		a[0] = r;
		a[1] = g;
		a[2] = b;
	};

	/** Fade out, swap at the bottom, fade in - 500 frames. */
	Psycho.prototype.transition = function () {
		var k, n = COUNT * 3;
		this.fadeLeft -= 1;
		if (this.fadeLeft === 250) {
			this.bright = 0;
			this.bytes.fill(0);
			this.screen.set(this.back);
		} else {
			this.bright = Math.max(0, Math.min(1, this.bright));
			for (k = 0; k < n; k += 1) { this.bytes[k] = Math.trunc(this.bytes[k] * this.bright); }
			this.bright += this.fadeLeft > 250 ? -1 / 250 : 1 / 250;
		}
		if (this.fadeLeft === 0) {
			this.swapped = true;
			this.ready = false;
			this.rendering = false;
		}
	};

	Psycho.prototype.capsLock = function () {
		if (this.ready) { return; }
		this.newPalette(30);
	};

	Psycho.prototype.step = function (dt, ctx, w, h) {
		if (!this.screen) { return; }
		var little = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
		if (this.splash > 0) {
			this.splash -= dt;
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);
			ctx.fillStyle = '#fff';
			ctx.font = 'bold 13px "MS Sans Serif", "Microsoft Sans Serif", Tahoma, Arial, sans-serif';
			ctx.textBaseline = 'top';
			ctx.fillText(SPLASH, 15, 22);
			return;
		}
		this.budget = Math.min((this.budget || 0) + dt * CALLS_PER_SECOND, CALLS_PER_SECOND / 10);
		while (this.budget > 0) { this.budget -= this.frame(); }
		/* What AnimatePalette shows: entries 0..233. */
		var lut = this.lut || (this.lut = new Uint32Array(256)), b = this.bytes;
		for (var i = 0; i < 256; i += 1) {
			var r = 0, g = 0, bl = 0;
			if (i < MOD) { r = b[i * 3]; g = b[i * 3 + 1]; bl = b[i * 3 + 2]; }
			lut[i] = little ? (0xff000000 | (bl << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (bl << 8) | 0xff) >>> 0;
		}
		var s = this.screen, rgba = this.rgba;
		for (var p = 0; p < s.length; p += 1) { rgba[p] = lut[s[p]]; }
		this.canvas.getContext('2d').putImageData(this.image, 0, 0);
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(this.canvas, 0, 0, w, h);
	};

	function slider(el, name, named, fallback) {
		var v = AfterDark.setting(el, name);
		if (v === null) { return fallback; }
		v = String(v).toLowerCase().trim();
		if (Object.prototype.hasOwnProperty.call(named, v)) { return named[v]; }
		var n = Number(v);
		return isFinite(n) && v !== '' ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
	}

	AfterDark.define('after-dark-psycho-deli', function (el) {
		var sim = new Psycho();
		sim.picture = AfterDark.choice(el, 'picture', PICTURES, 'random');
		sim.speed = Math.min(99, slider(el, 'speed', SPEEDS, 41));
		sim.knotSetting = slider(el, 'knots', KNOTS, 100);
		window.addEventListener('keydown', function (e) {
			if (e.key === 'CapsLock') { sim.capsLock(); }
		});
		return sim;
	});

	window.AfterDarkPsycho = Psycho;
}());
