/**
 * zoom.js - Zooommm!, colour tubes rushing at you.
 *
 * ZOOM.AD's own description:
 *
 *   "Zooommm! creates colorful 'tubes' which appear to move towards you.
 *    Just sit back, fasten your seat belt, and get propelled into another
 *    space.
 *    'Colors' selects different color schemes to use.
 *    'Speed' changes the rate that the colors and 'tubes' advance towards you.
 *    'Delay' changes the amount of time between the creation of new 'tubes'."
 *
 * It refuses to run on anything but a 256-colour screen ("Sorry, Zooommm only
 * runs in 256 colors." / "Sorry, couldn't animate palettes!"), because the
 * movement is palette animation. Checked against the real module running
 * under Wine (8-bit, 1024x768, several Speed/Delay settings):
 *
 *  - A tube is a regular polygon - 3 to 8 sides, a new shape each tube - at
 *    the middle of the screen, drawn as nested filled rings, each ring turned
 *    a little further than the last so the tube twists (some hardly twist).
 *  - The rings are evenly spaced in depth, so ring n out has radius A/n:
 *    at 1024 wide A is about 286 px (rings measured at 175, 110, 80, 62, 50).
 *  - A tube is drawn from the middle outwards, one ring at a time, until it
 *    covers the screen; its outline grows as r = K/(T - t). At the default
 *    speed that takes about 17.6 s from a 3 px dot; at Zooommin about 0.65 s.
 *  - Then the next tube starts in the middle, over the old one, after Delay:
 *    none at all on Shortest (the default); over 36 s on Medium.
 *  - Once drawn, the pixels never move; the rush towards you is the palette
 *    rotating under them.
 *
 * Colors lists 21 schemes and Zoom ships every one as a 252-entry PAL
 * resource (all PC_RESERVED, for animating), in all/art/zoom/index.json.
 * "Random" is one of them - a palette of random colours - not a random choice
 * of scheme. Still inferred: which palette entry each ring takes and how fast
 * the palette turns (the 8-bit captures only show the shapes), and the speeds
 * and delays between the settings that were measured.
 *
 *   <after-dark-zoom colors="smooth" speed="medium" delay="shortest" palettes="art/zoom">
 */
(function () {
	'use strict';

	var SCHEMES = ['smooth', 'saw', 'saw2', 'saw3', 'saw4', 'ramped', 'ramped2', 'ramped3',
		'electric', 'crest', 'rainbows', 'sine', 'sine2', 'sine3', 'cycloid', 'icycloid',
		'icycloid2', 'oscillate', 'oscillate2', 'random', 'banded'];
	var SPEEDS = ['slowest', 'slow', 'medium', 'fast', 'faster', 'zooommmin'];
	/* Seconds to draw one tube from a dot until it fills the screen. Medium and
	   Zooommin are measured; the rest are spaced between and beyond them. */
	var DURATION = [45, 30, 17.6, 7, 2.5, 0.65];
	var DELAYS = ['shortest', 'short', 'medium', 'long', 'longer', 'longest'];
	/* Seconds between one tube filling the screen and the next starting. */
	var GAP = [0, 12, 40, 60, 80, 100];
	var ENTRIES = 252;
	/* Ring radius is A / n, A as a fraction of the screen width. */
	var A = 286 / 1024;
	/* The dot a tube starts as, also as a fraction of the width. */
	var START = 3 / 1024;
	/* Palette entries a second the colours advance, at Medium. */
	var CYCLE = 24;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	/** A stand-in ramp for when the palettes cannot be loaded: a hue wheel. */
	function wheel() {
		var out = [];
		for (var i = 0; i < ENTRIES; i += 1) {
			var h = i / ENTRIES * 6, x = Math.round(255 * (1 - Math.abs(h % 2 - 1)));
			out.push([[255, x, 0], [x, 255, 0], [0, 255, x], [0, x, 255], [x, 0, 255], [255, 0, x]][Math.floor(h)]);
		}
		return out;
	}

	/** Fill a convex polygon into an index buffer with value v. */
	function fillPolygon(buf, w, h, pts, v) {
		var ymin = Infinity, ymax = -Infinity, i;
		for (i = 0; i < pts.length; i += 2) {
			ymin = Math.min(ymin, pts[i + 1]);
			ymax = Math.max(ymax, pts[i + 1]);
		}
		var y0 = Math.max(0, Math.ceil(ymin - 0.5)), y1 = Math.min(h - 1, Math.floor(ymax - 0.5));
		var n = pts.length / 2;
		for (var y = y0; y <= y1; y += 1) {
			var sy = y + 0.5, xl = Infinity, xr = -Infinity;
			for (i = 0; i < n; i += 1) {
				var ax = pts[i * 2], ay = pts[i * 2 + 1];
				var bx = pts[((i + 1) % n) * 2], by = pts[((i + 1) % n) * 2 + 1];
				if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) {
					var x = ax + (sy - ay) / (by - ay) * (bx - ax);
					if (x < xl) { xl = x; }
					if (x > xr) { xr = x; }
				}
			}
			if (xl > xr) { continue; }
			var a = Math.max(0, Math.ceil(xl - 0.5)), b = Math.min(w - 1, Math.floor(xr - 0.5));
			if (a <= b) { buf.fill(v, y * w + a, y * w + b + 1); }
		}
	}

	function Zoom() {
		this.scheme = 'smooth';
		this.duration = DURATION[2];
		this.cycle = CYCLE;
		this.gap = GAP[0];
		this.pals = null;
		this.offset = 0;
		this.tube = null;
		this.wait = 0;
		this.next = 0;
	}

	Zoom.prototype.resize = function (w, h) {
		this.w = Math.max(1, Math.round(w));
		this.h = Math.max(1, Math.round(h));
		this.canvas = document.createElement('canvas');
		this.canvas.width = this.w;
		this.canvas.height = this.h;
		this.g = this.canvas.getContext('2d');
		this.image = this.g.createImageData(this.w, this.h);
		this.pixels = new Uint32Array(this.image.data.buffer);
		/* Index 0 is black, the screen before the first tube; 1..252 the palette. */
		this.index = new Uint8Array(this.w * this.h);
		this.tube = null;
		this.wait = 0;
	};

	/** A new tube: its shape, its twist and where in the palette it begins. */
	Zoom.prototype.newTube = function () {
		var w = this.w, h = this.h;
		var sides = 3 + Math.floor(Math.random() * 6);
		var a = A * w;
		/* Done once the ring's inscribed circle clears the corners. */
		var reach = Math.hypot(w, h) / 2 / Math.cos(Math.PI / sides);
		var first = a / Math.max(1, START * w), last = a / reach;
		this.tube = {
			sides: sides, a: a, first: first, last: last,
			angle: rand(0, Math.PI * 2),
			twist: Math.random() < 0.25 ? 0 : rand(0.01, 0.06) * (Math.random() < 0.5 ? -1 : 1),
			base: this.next, rings: 0,
			/* Rings a second, so that the whole tube takes Duration. */
			rate: (first - last) / this.duration,
			/* The first tube is already well on its way: in the capture it
			   fills the screen about 2 s in, whatever the speed. */
			time: this.started ? 0 : Math.max(0, this.duration - 2)
		};
		this.started = true;
		this.next = (this.next + Math.round(first - last)) % ENTRIES;
	};

	/** Redraw the current tube, outermost ring first, over what is there. */
	Zoom.prototype.paint = function () {
		var t = this.tube, cx = this.w / 2, cy = this.h / 2;
		for (var k = t.rings - 1; k >= 0; k -= 1) {
			var n = t.first - k;
			var r = n <= t.last ? t.a / t.last : t.a / n;
			var turn = t.angle + t.twist * k, pts = [];
			for (var s = 0; s < t.sides; s += 1) {
				var ang = turn + s / t.sides * Math.PI * 2;
				pts.push(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
			}
			fillPolygon(this.index, this.w, this.h, pts, 1 + (t.base + k) % ENTRIES);
		}
	};

	Zoom.prototype.palette = function () {
		return (this.pals && this.pals[this.scheme]) || this.fallback || (this.fallback = wheel());
	};

	Zoom.prototype.step = function (dt, ctx, w, h) {
		if (!this.tube) {
			this.wait -= dt;
			if (this.wait <= 0) { this.newTube(); }
		}
		var t = this.tube;
		if (t) {
			var want = Math.min(Math.ceil(t.first - t.last) + 1, Math.floor((t.time += dt) * t.rate) + 1);
			if (want > t.rings) {
				t.rings = want;
				this.paint();
			}
			if (t.first - (t.rings - 1) <= t.last) {
				this.tube = null;
				this.wait = this.gap;
			}
		}

		/* The palette turns so the colours run outwards, towards you. */
		this.offset = (this.offset + this.cycle * dt) % ENTRIES;
		var pal = this.palette(), lut = new Uint32Array(ENTRIES + 1), off = Math.floor(this.offset);
		lut[0] = 0xff000000;
		for (var i = 0; i < ENTRIES; i += 1) {
			var c = pal[((i - off) % ENTRIES + ENTRIES) % ENTRIES] || [0, 0, 0];
			lut[i + 1] = 0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0];
		}
		var idx = this.index, px = this.pixels;
		for (var p = 0; p < idx.length; p += 1) { px[p] = lut[idx[p]]; }
		this.g.putImageData(this.image, 0, 0);
		ctx.drawImage(this.canvas, 0, 0, w, h);
	};

	AfterDark.define('after-dark-zoom', function (el) {
		var sim = new Zoom();
		sim.scheme = SCHEMES[AfterDark.choice(el, 'colors', SCHEMES, 'smooth')];
		var speed = AfterDark.choice(el, 'speed', SPEEDS, 'medium');
		sim.duration = DURATION[speed];
		/* The colours speed up with the tubes. */
		sim.cycle = CYCLE * DURATION[2] / DURATION[speed];
		sim.gap = GAP[AfterDark.choice(el, 'delay', DELAYS, 'shortest')];
		AfterDark.data(AfterDark.setting(el, 'palettes') || 'art/zoom').then(function (d) {
			sim.pals = d.palettes;
		}).catch(function () {
			/* Without them a plain colour wheel stands in. */
		});
		return sim;
	});

	window.AfterDarkZoom = Zoom;
	Zoom.fillPolygon = fillPolygon;
}());
