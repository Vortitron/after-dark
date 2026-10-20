/**
 * starry-night.js - Starry Night, the one After Dark falls back on.
 *
 * STARRYNI.AD sits in the engine's own folder rather than among the modules,
 * because it is what AFTERDAR.SCR shows when the module it was asked for will
 * not load. Its description is an RTF resource, in five languages:
 *
 *   "Starry Night. Original concept by James J. Eastman.
 *    The number of buildings can be varied from 0 to 100.
 *    The maximum height of the buildings can be varied from 5% to 95% of the
 *    monitor height.
 *    The 'flasher' is a flashing red light which, if enabled, will appear
 *    atop the tallest building.
 *    By Craig Dickson. 1990-96 Berkeley Systems Inc."
 *
 * Its one bitmap, BITMAP 101, is the shooting star: a red and yellow fireball
 * in two 32x32 frames, falling to the right and falling to the left, in
 * all/art/starryni/. Everything else is SetPixel, and this follows the
 * module's own code (a PE32 DLL, read with a disassembler) step by step:
 *
 *   Setup  Black screen. Buildings (default 27) each get a roof at
 *          H - rand(H * Height%) (default 34%, never under 20 px), a width of
 *          roof/16 + min(rand(roof/8), rand(roof/8)) + 8 (at least 16) - so
 *          the short ones are the wide ones - centred on rand(W), and one of
 *          eight window patterns. Nothing outlines them: a building is just
 *          black that stars are not put on.
 *   Frame  One star of a random RGB colour at (rand W, min(rand H, rand H))
 *          unless that is inside a building; fifty black pixels at the same
 *          kind of place and thirty anywhere, which is what makes stars and
 *          windows wink out; and fifteen random spots which, inside a
 *          building, set its 3x3 neighbourhood to its window pattern - an 8x8
 *          bit table in the module's data, tiled from the building's corner.
 *          Window colour is yellow, RGB(v, v, 0), v = 255 - (192 / N) * i: the
 *          first building is the brightest, and where buildings overlap the
 *          first one listed wins.
 *          Every 60 frames, one chance in twelve of a shooting star: from a
 *          random x along the top, 8 px across and 8 down a frame, drawn with
 *          XOR, gone as soon as its head is inside a building.
 *   Flash  Every 500 ms the flasher toggles between RGB(128, 0, 0) and black:
 *          a 4x4 rounded dot 4 px above the middle of the tallest roof.
 *
 * Checked against the 24-bit captures in which the engine fell back on it
 * (Classic/ARTIST.mp4 and others): the dense speckle of coloured stars over
 * the top of the screen and none on the buildings, the cities picked out only
 * by their window grids of dashes and dots, dimmer to the back, the red
 * flasher dot, and the shooting star cut short at a roof. Under Wine it runs
 * as fast as it can - about a thousand frames a second, a shooting star
 * every second or so, across in one video frame - so the rate here, 240
 * frames a second, is a choice: the sky and the city fill in over the first
 * half-minute, the way it would on a 1990s machine. The 0-100 sliders are
 * named steps here, with the module's own defaults in the middle.
 *
 *   <after-dark-starry-night art="art/starryni" buildings="some" height="medium" flasher>
 */
(function () {
	'use strict';

	var BUILDINGS = ['none', 'few', 'some', 'many', 'lots'];
	var COUNT = [0, 12, 27, 60, 100];          // some = the module's default, 27
	var HEIGHTS = ['low', 'medium', 'tall', 'skyscrapers'];
	/* Of the monitor's height; the module's own range is 5% to 95%, default 34%. */
	var TALL = [0.2, 0.34, 0.6, 0.95];
	/* Eight window patterns, eight rows of eight bits each (bit n is x + n). */
	var PATTERNS = [
		0x00, 0x00, 0x00, 0x66, 0x66, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x44, 0x44, 0x00, 0x00, 0x44, 0x44,
		0x88, 0x88, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0xc6, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc6,
		0x00, 0x00, 0x54, 0x54, 0x54, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x48, 0x48, 0x48, 0x48, 0x00,
		0x00, 0x00, 0x00, 0x54, 0x00, 0x00, 0x00, 0x00,
		0x01, 0x01, 0x00, 0x00, 0x01, 0x01, 0x00, 0x00
	];
	var RATE = 240;            // module frames a second (see above)
	var BLACK = 0xff000000;

	function rnd(n) {
		return n > 0 ? Math.floor(Math.random() * n) : 0;
	}

	/** min of two rolls, which is how the module leans things to the top. */
	function low(n) {
		return Math.min(rnd(n), rnd(n));
	}

	function layer(w, h) {
		var c = document.createElement('canvas');
		c.width = Math.max(1, Math.round(w));
		c.height = Math.max(1, Math.round(h));
		return c;
	}

	/** `count` buildings dropped along the bottom, none taller than `tall` of the screen. */
	function skyline(w, h, count, tall) {
		var out = [];
		var most = Math.max(20, Math.floor(h * tall));
		for (var i = 0; i < count; i += 1) {
			var top = h - rnd(most);
			var bw = Math.max(16, (top >> 4) + low(top >> 3) + 8);
			var x = rnd(w) - (bw >> 1);
			out.push({ x: x, y: top, w: bw, h: h - top, style: rnd(8) });
		}
		return out;
	}

	function StarryNight() {
		this.count = COUNT[2];
		this.tall = TALL[1];
		this.flasher = true;
		this.meteorArt = null;
	}

	StarryNight.prototype.resize = function (w, h) {
		this.w = Math.max(1, Math.round(w));
		this.h = Math.max(1, Math.round(h));
		this.canvas = layer(this.w, this.h);
		var g = this.canvas.getContext('2d');
		this.image = g ? g.createImageData(this.w, this.h) : null;
		this.px = this.image ? new Uint32Array(this.image.data.buffer) : new Uint32Array(this.w * this.h);
		this.px.fill(BLACK);
		this.buildings = skyline(this.w, this.h, this.count, this.tall);
		var n = this.buildings.length;
		var step = n ? Math.trunc(-192 / n) : 0;
		this.buildings.forEach(function (b, i) {
			var v = (step * i + 255) & 0xff;
			b.colour = BLACK | (v << 8) | v;           // RGB(v, v, 0)
		});
		/* The flasher: 4 px above the tallest roof, 2 left of its middle. */
		this.light = null;
		if (this.flasher) {
			var best = null;
			this.buildings.forEach(function (b) { if (!best || b.y < best.y) { best = b; } });
			if (best) { this.light = { x: best.x + (best.w >> 1) - 2, y: best.y - 4, on: false, t: 0 }; }
		}
		this.meteor = null;
		this.frames = 0;
		this.owed = 0;
	};

	/** The first building with (x, y) in it, or -1. */
	StarryNight.prototype.inside = function (x, y) {
		var bs = this.buildings;
		for (var i = 0; i < bs.length; i += 1) {
			var b = bs[i];
			if (b.y <= y && b.x <= x && b.x + b.w >= x) { return i; }
		}
		return -1;
	};

	StarryNight.prototype.set = function (x, y, c) {
		if (x >= 0 && y >= 0 && x < this.w && y < this.h) { this.px[y * this.w + x] = c; }
	};

	StarryNight.prototype.window = function (x, y, i) {
		var b = this.buildings[i];
		if (x < b.x || x > b.x + b.w || y < b.y) { return; }
		var row = PATTERNS[b.style * 8 + ((y + b.y) & 7)];
		if ((row >> ((x + b.x) & 7)) & 1) { this.set(x, y, b.colour); }
	};

	/** One frame of the module. */
	StarryNight.prototype.frame = function () {
		var w = this.w, h = this.h, i, x, y;
		x = rnd(w); y = low(h);
		if (this.inside(x, y) < 0) {
			this.set(x, y, BLACK | (rnd(255) << 16) | (rnd(255) << 8) | rnd(255));
		}
		for (i = 0; i < 50; i += 1) { this.set(rnd(w), low(h), BLACK); }
		for (i = 0; i < 30; i += 1) { this.set(rnd(w), rnd(h), BLACK); }
		for (i = 0; i < 15; i += 1) {
			x = rnd(w); y = rnd(h);
			var b = this.inside(x, y);
			if (b < 0) { continue; }
			for (var dy = -1; dy <= 1; dy += 1) {
				for (var dx = -1; dx <= 1; dx += 1) { this.window(x + dx, y + dy, b); }
			}
		}
		this.shootingStar();
	};

	StarryNight.prototype.shootingStar = function () {
		var m = this.meteor;
		if (m) {
			var nx = m.x + (m.right ? 8 : -8), ny = m.y + 8;
			if (this.inside(nx + 16, ny + 8) < 0 && nx >= 0 && nx < this.w && ny < this.h) {
				m.x = nx;
				m.y = ny;
			} else {
				this.meteor = null;
			}
			return;
		}
		this.frames += 1;
		if (this.frames < 60) { return; }
		this.frames = 0;
		if (this.meteorArt && rnd(0x7fff) > 30000) {
			var right = rnd(2) === 1;
			this.meteor = { x: rnd(this.w), y: 0, right: right };
		}
	};

	StarryNight.prototype.flash = function (dt) {
		var f = this.light;
		if (!f) { return; }
		f.t += dt;
		if (f.t < 0.5) { return; }
		f.t = 0;
		f.on = !f.on;
		var c = f.on ? (BLACK | 0x80) : BLACK;
		for (var r = 0; r < 2; r += 1) {
			this.set(f.x + 1, f.y + r * 3, c);
			this.set(f.x + 2, f.y + r * 3, c);
			for (var k = 0; k < 4; k += 1) { this.set(f.x + k, f.y + r + 1, c); }
		}
	};

	StarryNight.prototype.step = function (dt, ctx, w, h) {
		this.owed = Math.min(this.owed + dt * RATE, RATE / 4);
		while (this.owed >= 1) {
			this.frame();
			this.owed -= 1;
		}
		this.flash(dt);

		var g = this.canvas.getContext('2d');
		if (g && this.image) { g.putImageData(this.image, 0, 0); }
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		ctx.drawImage(this.canvas, 0, 0, w, h);
		var m = this.meteor;
		if (m) {
			/* XOR on black is the picture itself; the frame for falling right
			   is the top one. */
			ctx.drawImage(this.meteorArt, 0, m.right ? 0 : 32, 32, 32, m.x, m.y, 32, 32);
		}
	};

	AfterDark.define('after-dark-starry-night', function (el) {
		var sim = new StarryNight();
		var b = AfterDark.setting(el, 'buildings');
		sim.count = /^\d+$/.test(b || '') ? Math.min(100, Number(b)) :
			COUNT[AfterDark.choice(el, 'buildings', BUILDINGS, 'some')];
		var t = AfterDark.setting(el, 'height');
		sim.tall = /^\d+$/.test(t || '') ? Math.max(5, Math.min(95, Number(t))) / 100 :
			TALL[AfterDark.choice(el, 'height', HEIGHTS, 'medium')];
		sim.flasher = AfterDark.flag(el, 'flasher');
		AfterDark.load(AfterDark.setting(el, 'art') || 'art/starryni').then(function (art) {
			var bmp = art.bitmap('meteor');
			if (bmp) { sim.meteorArt = bmp.image; }
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkStarryNight = StarryNight;
	StarryNight.skyline = skyline;
	StarryNight.COUNT = COUNT;
}());
