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
 * all/art/starryni/. The rest is drawn: buildings in silhouette along the
 * bottom, their windows coming on one at a time, under a sky that slowly
 * fills with stars. The two sliders become four steps each here.
 *
 *   <after-dark-starry-night art="art/starryni" buildings="some" height="medium" flasher>
 */
(function () {
	'use strict';

	var BUILDINGS = ['none', 'few', 'some', 'many', 'lots'];
	var COUNT = [0, 12, 30, 60, 100];
	var HEIGHTS = ['low', 'medium', 'tall', 'skyscrapers'];
	/* Of the monitor's height; the module's own range is 5% to 95%. */
	var TALL = [0.2, 0.4, 0.65, 0.95];
	/* VGA's yellow, mostly, some white, and the dimmer yellow. */
	var LIT = ['#ffff55', '#ffff55', '#ffff55', '#ffffff', '#aaaa55'];
	var STARS = ['#ffffff', '#aaaaaa', '#aaaaaa', '#555555', '#555555', '#aaaaff'];
	var BUILDING = '#0c0c16';

	function rand(a, b) {
		return a + Math.random() * (b - a);
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
		for (var i = 0; i < count; i += 1) {
			var bw = Math.round(rand(18, 60));
			var bh = Math.max(8, Math.round(h * tall * Math.pow(Math.random(), 0.7)));
			out.push({ x: Math.round(rand(-bw / 2, w - bw / 2)), y: h - bh, w: bw, h: bh });
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
		this.t = 0;
		this.sky = layer(w, h);
		this.city = layer(w, h);
		this.buildings = skyline(w, h, this.count, this.tall);
		this.windows = [];
		this.starsLeft = Math.round(w * h / 700);
		this.meteor = null;
		this.nextMeteor = rand(3, 8);
		this.owed = 0;

		var g = this.city.getContext('2d');
		g.fillStyle = BUILDING;
		var self = this;
		this.buildings.forEach(function (b) {
			g.fillRect(b.x, b.y, b.w, b.h);
		});
		/* Windows are laid out per building, but only where no building in
		   front covers them - they are all one colour, so "in front" is
		   simply whichever was placed later. */
		this.buildings.forEach(function (b, n) {
			for (var wy = b.y + 4; wy < h - 4; wy += 6) {
				for (var wx = b.x + 3; wx < b.x + b.w - 4; wx += 4) {
					var hidden = false;
					for (var k = n + 1; k < self.buildings.length && !hidden; k += 1) {
						var o = self.buildings[k];
						hidden = wx + 2 > o.x && wx < o.x + o.w && wy + 3 > o.y;
					}
					if (!hidden) { self.windows.push({ x: wx, y: wy, lit: false }); }
				}
			}
		});
		/* The flasher sits on the tallest roof, on a short aerial. */
		this.tallest = this.buildings.reduce(function (best, b) {
			return !best || b.y < best.y ? b : best;
		}, null);
		if (this.tallest) {
			var t = this.tallest;
			t.mast = Math.round(rand(8, 16));
			g.fillRect(t.x + Math.round(t.w / 2), t.y - t.mast, 1, t.mast);
		}
		/* Light them in a random order rather than row by row. */
		for (var i = this.windows.length - 1; i > 0; i -= 1) {
			var j = Math.floor(Math.random() * (i + 1));
			var tmp = this.windows[i];
			this.windows[i] = this.windows[j];
			this.windows[j] = tmp;
		}
		this.nextWindow = 0;
	};

	StarryNight.prototype.window = function (win, on) {
		var g = this.city.getContext('2d');
		win.lit = on;
		g.fillStyle = on ? LIT[Math.floor(Math.random() * LIT.length)] : BUILDING;
		g.fillRect(win.x, win.y, 2, 3);
	};

	StarryNight.prototype.step = function (dt, ctx, w, h) {
		this.t += dt;
		var i;

		/* Stars come out a few at a time until the sky is full. */
		var sky = this.sky.getContext('2d');
		for (i = 0; i < 3 && this.starsLeft > 0; i += 1) {
			sky.fillStyle = STARS[Math.floor(Math.random() * STARS.length)];
			var size = Math.random() < 0.06 ? 2 : 1;
			sky.fillRect(Math.floor(rand(0, w)), Math.floor(rand(0, h)), size, size);
			this.starsLeft -= 1;
		}

		/* Windows come on over about a minute, then the city just lives:
		   now and then somebody goes to bed and somebody else gets up. */
		var total = this.windows.length;
		var target = Math.floor(total * 0.7);
		this.owed += Math.max(1, total / 60) * dt;
		while (this.owed >= 1 && this.nextWindow < target) {
			this.window(this.windows[this.nextWindow], true);
			this.nextWindow += 1;
			this.owed -= 1;
		}
		if (this.nextWindow >= target && total) {
			this.owed = Math.min(this.owed, 2);
			if (Math.random() < dt * 3) {
				var win = this.windows[Math.floor(Math.random() * total)];
				this.window(win, !win.lit);
			}
		}

		if (!this.meteor && this.meteorArt) {
			this.nextMeteor -= dt;
			if (this.nextMeteor <= 0) {
				var right = Math.random() < 0.5;
				var speed = rand(160, 260);
				this.meteor = {
					x: right ? rand(-32, w * 0.6) : rand(w * 0.4, w + 32), y: -32,
					vx: (right ? 1 : -1) * speed * 0.85, vy: speed, frame: right ? 0 : 1
				};
			}
		}

		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		ctx.drawImage(this.sky, 0, 0, w, h);

		/* It falls behind the city. */
		var m = this.meteor;
		if (m) {
			m.x += m.vx * dt;
			m.y += m.vy * dt;
			ctx.drawImage(this.meteorArt, 0, m.frame * 32, 32, 32, Math.round(m.x - 16), Math.round(m.y - 16), 32, 32);
			if (m.y > h + 32 || m.x < -64 || m.x > w + 64) {
				this.meteor = null;
				this.nextMeteor = rand(6, 20);
			}
		}

		ctx.drawImage(this.city, 0, 0, w, h);

		var top = this.tallest;
		if (this.flasher && top && (this.t / 1.4) % 1 < 0.3) {
			ctx.fillStyle = '#ff0000';
			ctx.fillRect(top.x + Math.round(top.w / 2) - 1, top.y - top.mast - 2, 3, 3);
		}
	};

	AfterDark.define('after-dark-starry-night', function (el) {
		var sim = new StarryNight();
		sim.count = COUNT[AfterDark.choice(el, 'buildings', BUILDINGS, 'some')];
		sim.tall = TALL[AfterDark.choice(el, 'height', HEIGHTS, 'medium')];
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
