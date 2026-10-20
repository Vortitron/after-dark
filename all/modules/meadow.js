/**
 * meadow.js - Meadow, a field that grows a blade at a time.
 *
 * MEADOW.AD's own description: "MEADOW (tm) Just a calm little thing." Its
 * controls are Season (Spring, Summer, Fall, Winter) and Seasons Last (10
 * seconds to 1 week, or Forever); the defaults are Spring and 30 seconds.
 * Its two bitmaps are six flowers and their mask, 196x37.
 *
 * Checked against the original running under Wine (October 2026), from
 * captures up to 160 s long and a +relay trace of its GDI calls. (It had
 * been listed as refusing to load; it runs fine in the sandbox now.)
 *
 * - The meadow is the whole screen below a horizon that differs every run
 *   (a region built from four polygons; seen running from y = 260 on the
 *   left down to 370 on the right, and in another run as high as 72).
 * - Nothing moves. It picks random points, and each one inside the meadow
 *   gets a blade of grass: a vertical line 9 px long (sometimes 10) set one
 *   pixel at a time, from a base colour at the top fading to a fifth of it
 *   at the bottom (traced bases: (30,114,32), (0,176,8), (41,157,29),
 *   (132,145,19), (152,175,0)). The field fills up over minutes and is never
 *   cleared.
 * - From the second season (about 30 s in) flowers from the strip are
 *   stamped in among the grass, smaller towards the horizon (it sets
 *   StretchBlt mode before drawing), and keep piling up.
 * - Later blades turn greyer (grey appears around 110 s), taken here as fall
 *   going to straw and winter to snow; that part, the rate (it does not
 *   read the clock under Wine) and the horizon's exact shape are inferred.
 *
 *   <after-dark-meadow art="art/meadow" season="spring" seasons-last="30 seconds">
 */
(function () {
	'use strict';

	var SEASONS = ['spring', 'summer', 'fall', 'winter'];
	var LASTS = ['10 seconds', '30 seconds', '1 minute', '5 minutes', '10 minutes', '30 minutes',
		'1 hour', '1 day', '1 week', 'forever'];
	var LENGTH = [10, 30, 60, 300, 600, 1800, 3600, 86400, 604800, Infinity];
	/* The six flowers' columns in the strip. */
	var FLOWERS = [[4, 30], [37, 30], [66, 28], [97, 31], [132, 24], [158, 26]];
	/* Blade colours each season starts from. Spring and summer are the traced
	   ones; fall and winter are inferred. */
	var GRASS = [
		[[30, 114, 32], [0, 176, 8], [41, 157, 29], [132, 145, 19], [152, 175, 0]],
		[[30, 114, 32], [0, 176, 8], [41, 157, 29], [132, 145, 19], [152, 175, 0]],
		[[132, 145, 19], [175, 150, 70], [150, 110, 40], [152, 175, 0]],
		[[200, 200, 200], [160, 160, 170], [235, 235, 245]]
	];
	/* Blades a second, and flowers a second once they are out. */
	var BLADES = 80;
	var BLOOMS = 3;
	var BLADE = 9;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Meadow() {
		this.season = 0;
		this.length = LENGTH[1];
		this.art = null;
		this.t = 0;
		this.age = 0;
	}

	Meadow.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.canvas = document.createElement('canvas');
		this.canvas.width = w;
		this.canvas.height = h;
		var g = this.canvas.getContext('2d');
		g.fillStyle = '#000';
		g.fillRect(0, 0, w, h);
		/* A new horizon: a few random points joined up, somewhere in the top half. */
		var pts = [], n = 3;
		for (var i = 0; i <= n; i += 1) { pts.push(rand(0.1, 0.5) * h); }
		this.horizon = function (x) {
			var f = x / w * n, k = Math.min(n - 1, Math.floor(f)), t = f - k;
			return pts[k] + (pts[k + 1] - pts[k]) * (0.5 - Math.cos(t * Math.PI) / 2);
		};
		this.blades = 0;
		this.blooms = 0;
	};

	Meadow.prototype.blade = function (g) {
		var x = Math.floor(rand(0, this.w)), y = Math.floor(rand(0, this.h));
		if (y < this.horizon(x)) { return; }
		var set = GRASS[this.season], c = set[Math.floor(Math.random() * set.length)];
		for (var k = 0; k < BLADE; k += 1) {
			var f = 1 - 0.8 * k / (BLADE - 1);
			g.fillStyle = 'rgb(' + Math.round(c[0] * f) + ',' + Math.round(c[1] * f) + ',' + Math.round(c[2] * f) + ')';
			g.fillRect(x, y - 4 + k, 1, 1);
		}
	};

	Meadow.prototype.bloom = function (g) {
		if (!this.art) { return; }
		var x = rand(0, this.w), y = rand(0, this.h), top = this.horizon(x);
		if (y < top) { return; }
		var cell = FLOWERS[Math.floor(Math.random() * FLOWERS.length)];
		var k = 0.4 + 0.6 * (y - top) / Math.max(1, this.h - top);
		var fw = Math.max(1, Math.round(cell[1] * k)), fh = Math.max(1, Math.round(37 * k));
		g.imageSmoothingEnabled = false;
		g.drawImage(this.art, cell[0], 0, cell[1], 37, Math.round(x - fw / 2), Math.round(y - fh), fw, fh);
	};

	Meadow.prototype.step = function (dt, ctx) {
		this.t += dt;
		this.age += dt;
		if (this.t >= this.length) {
			this.t = 0;
			this.season = (this.season + 1) % 4;
		}
		var g = this.canvas.getContext('2d');
		this.blades += BLADES * dt;
		while (this.blades >= 1) { this.blade(g); this.blades -= 1; }
		/* Flowers from the second season on, while it is not winter. */
		if ((this.season === 1 || this.season === 2 || this.age >= this.length) && this.season !== 3) {
			this.blooms += BLOOMS * dt;
			while (this.blooms >= 1) { this.bloom(g); this.blooms -= 1; }
		}
		ctx.drawImage(this.canvas, 0, 0);
	};

	AfterDark.define('after-dark-meadow', function (el) {
		var sim = new Meadow();
		sim.season = AfterDark.choice(el, 'season', SEASONS, 'spring');
		sim.length = LENGTH[AfterDark.choice(el, 'seasons-last', LASTS, '30 seconds')];
		AfterDark.load(AfterDark.setting(el, 'art') || 'art/meadow').then(function (art) {
			sim.art = art.bitmap('flowers').image;
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkMeadow = Meadow;
}());
