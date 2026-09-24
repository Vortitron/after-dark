/**
 * meadow.js - Meadow, a strip of grass going round the year.
 *
 * MEADOW.AD's own description: "MEADOW (tm) Just a calm little thing." Its
 * controls are Season (Spring, Summer, Fall, Winter) and Seasons Last (10
 * seconds to 1 week, or Forever); the Fractal Forest module says to run the
 * two together in MultiModule "for a very calming effect", and Boris's says
 * the same of Boris and Meadow, so it keeps to the bottom of the screen.
 *
 * Its two bitmaps are six flowers and their mask, 196x37. The grass, the
 * turning of the year and the snow are drawn: in spring the grass comes up
 * and the flowers open one by one, summer is full, in fall the grass goes to
 * straw and the flowers drop, and winter snows on it until spring melts it.
 *
 *   <after-dark-meadow art="art/meadow" season="spring" seasons-last="1 minute">
 */
(function () {
	'use strict';

	var SEASONS = ['spring', 'summer', 'fall', 'winter'];
	var LASTS = ['10 seconds', '30 seconds', '1 minute', '5 minutes', '10 minutes', '30 minutes',
		'1 hour', '1 day', '1 week', 'forever'];
	var LENGTH = [10, 30, 60, 300, 600, 1800, 3600, 86400, 604800, Infinity];
	/* The six flowers' columns in the strip. */
	var FLOWERS = [[4, 30], [37, 30], [66, 28], [97, 31], [132, 24], [158, 26]];
	var GREEN = [70, 170, 50];
	var DEEP = [30, 120, 30];
	var STRAW = [175, 150, 70];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function mix(a, b, t) {
		return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
	}

	function rgb(c, k) {
		k = k === undefined ? 1 : k;
		return 'rgb(' + Math.round(c[0] * k) + ',' + Math.round(c[1] * k) + ',' + Math.round(c[2] * k) + ')';
	}

	function Meadow() {
		this.season = 0;
		this.length = LENGTH[2];
		this.art = null;
	}

	Meadow.prototype.resize = function (w, h) {
		this.s = Math.max(1, Math.round(Math.min(w, h) / 400));
		var s = this.s, tall = Math.min(h * 0.28, 70 * s);
		this.blades = [];
		for (var x = 0; x < w; x += rand(1.5, 3.5) * s) {
			this.blades.push({ x: x, h: rand(0.35, 1) * tall, lean: rand(-0.35, 0.35), shade: rand(0.7, 1.15),
				phase: rand(0, 6) });
		}
		this.flowers = [];
		var n = Math.round(w / (38 * s));
		for (var i = 0; i < n; i += 1) {
			this.flowers.push({ x: rand(0, w - 30 * s), sink: rand(0, tall * 0.5), kind: Math.floor(Math.random() * 6),
				at: rand(0.1, 0.9), fall: rand(0.1, 0.9) });
		}
		this.flowers.sort(function (a, b) { return a.sink - b.sink; });
		this.snow = [];
		this.drift = 0;
		this.t = 0;
	};

	/** 0..1 through the current season; the change itself takes at most 30 seconds. */
	Meadow.prototype.progress = function () {
		var span = Math.min(this.length, 30);
		return Math.min(1, this.t / span);
	};

	Meadow.prototype.step = function (dt, ctx, w, h) {
		this.t += dt;
		if (this.t >= this.length) {
			this.t = 0;
			this.season = (this.season + 1) % 4;
		}
		var p = this.progress(), s = this.s, season = this.season, i;
		/* How grown, how green and how snowed on, for this moment of the year. */
		var grown = [p, 1, 1, 1 - p * 0.4][season];
		var colour = season === 0 ? mix(STRAW, GREEN, p) : season === 1 ? mix(GREEN, DEEP, p)
			: season === 2 ? mix(DEEP, STRAW, p) : STRAW;
		var snowing = season === 3 && p < 0.85;
		this.drift = season === 3 ? Math.min(1, this.drift + dt / 25) : Math.max(0, this.drift - dt / 12);

		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		ctx.lineCap = 'round';
		ctx.lineWidth = Math.max(1, s);
		for (i = 0; i < this.blades.length; i += 1) {
			var b = this.blades[i], bh = b.h * (season === 0 ? 0.15 + 0.85 * grown : grown);
			var sway = Math.sin(this.t * 1.3 + b.phase + b.x * 0.01) * 2 * s;
			ctx.strokeStyle = rgb(colour, b.shade);
			ctx.beginPath();
			ctx.moveTo(b.x, h);
			ctx.quadraticCurveTo(b.x + b.lean * bh * 0.3, h - bh * 0.6, b.x + b.lean * bh + sway, h - bh);
			ctx.stroke();
		}
		if (this.art) {
			ctx.imageSmoothingEnabled = false;
			for (i = 0; i < this.flowers.length; i += 1) {
				var f = this.flowers[i], cell = FLOWERS[f.kind];
				/* Spring opens them one by one, fall drops them one by one. */
				var show = season === 0 ? (p > f.at ? Math.min(1, (p - f.at) * 6) : 0)
					: season === 1 ? 1 : season === 2 ? (p < f.fall ? 1 : Math.max(0, 1 - (p - f.fall) * 6)) : 0;
				if (show <= 0) { continue; }
				var fh = 37 * s * show, fw = cell[1] * s;
				ctx.globalAlpha = season === 2 ? 0.5 + 0.5 * show : 1;
				ctx.drawImage(this.art, cell[0], 0, cell[1], 37, Math.round(f.x), Math.round(h - f.sink * grown - fh),
					fw, Math.round(fh));
			}
			ctx.globalAlpha = 1;
		}
		/* Snow: falling while winter lasts, lying until spring has melted it. */
		if (snowing && this.snow.length < w / 3) {
			for (i = 0; i < 3; i += 1) {
				this.snow.push({ x: rand(0, w), y: rand(-h * 0.6, -4), v: rand(20, 45) * s, sway: rand(0, 6) });
			}
		}
		ctx.fillStyle = '#fff';
		for (i = this.snow.length - 1; i >= 0; i -= 1) {
			var fl = this.snow[i];
			fl.y += fl.v * dt;
			fl.x += Math.sin(this.t + fl.sway) * 10 * s * dt;
			if (fl.y > h - this.drift * 18 * s) {
				if (!snowing) { this.snow.splice(i, 1); continue; }
				fl.y = -4;
				fl.x = rand(0, w);
			}
			ctx.fillRect(Math.round(fl.x), Math.round(fl.y), 2 * s, 2 * s);
		}
		if (this.drift > 0) {
			ctx.fillStyle = 'rgba(240,244,255,' + Math.min(1, this.drift * 1.2).toFixed(2) + ')';
			var depth = this.drift * 18 * s;
			ctx.beginPath();
			ctx.moveTo(0, h);
			for (var x = 0; x <= w; x += 8 * s) {
				ctx.lineTo(x, h - depth - Math.sin(x * 0.02) * 4 * s * this.drift);
			}
			ctx.lineTo(w, h);
			ctx.fill();
		}
	};

	AfterDark.define('after-dark-meadow', function (el) {
		var sim = new Meadow();
		sim.season = AfterDark.choice(el, 'season', SEASONS, 'spring');
		sim.length = LENGTH[AfterDark.choice(el, 'seasons-last', LASTS, '1 minute')];
		AfterDark.load(AfterDark.setting(el, 'art') || 'art/meadow').then(function (art) {
			sim.art = art.bitmap('flowers').image;
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkMeadow = Meadow;
}());
