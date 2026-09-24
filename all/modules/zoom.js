/**
 * zoom.js - Zooommm!, colour tubes rushing at you.
 *
 * ZOOM.AD ships no artwork. Its own description:
 *
 *   "Zooommm! creates colorful 'tubes' which appear to move towards you.
 *    Just sit back, fasten your seat belt, and get propelled into another
 *    space.
 *    'Colors' selects different color schemes to use.
 *    'Speed' changes the rate that the colors and 'tubes' advance towards you.
 *    'Delay' changes the amount of time between the creation of new 'tubes'."
 *
 * Each tube opens as a dot somewhere near the middle and swells as it comes
 * at you until it fills the screen, one inside the next. The colour schemes
 * are the module's own names; like the original on a 256-colour screen, the
 * colour runs down each scheme's ramp as the tubes travel.
 *
 * Zooommm! and Frost and Fire came out of Berkeley Systems the same year with
 * the same list of palette names, and Frost and Fire ships six of them as PAL
 * resources - Cycloid, iCycloid, Electric, Rainbows, Ramped2 and Sine. Those
 * six are the real thing, from all/art/frost/; the rest are made to match.
 *
 *   <after-dark-zoom colors="rainbows" speed="medium" delay="medium" palettes="art/frost">
 */
(function () {
	'use strict';

	var SCHEMES = ['smooth', 'saw', 'ramped', 'ramped2', 'electric', 'crest', 'rainbows', 'sine',
		'cycloid', 'icycloid', 'oscillate', 'banded', 'random'];
	var SPEEDS = ['slowest', 'slow', 'medium', 'fast', 'faster', 'zooommmin'];
	/* How fast a tube opens, as screens a second; it speeds up a little as it
	   comes, which is what makes the bands read as a tube rather than ripples. */
	var VELOCITY = [0.06, 0.1, 0.15, 0.22, 0.32, 0.48];
	var DELAYS = ['shortest', 'short', 'medium', 'long', 'longer', 'longest'];
	var GAP = [0.12, 0.25, 0.45, 0.8, 1.3, 2];

	function clamp(v) {
		return Math.max(0, Math.min(255, Math.round(v)));
	}

	/* Each scheme is a function of 0..1 giving [r, g, b]. */
	var RAMPS = {
		smooth: function (t) {
			var a = t * Math.PI * 2;
			return [128 + 127 * Math.sin(a), 128 + 127 * Math.sin(a + 2.1), 128 + 127 * Math.sin(a + 4.2)];
		},
		saw: function (t) {
			var s = (t * 4) % 1;
			return [255 * s, 80 * s, 255 * (1 - s)];
		},
		ramped: function (t) {
			var s = (t * 3) % 1, k = Math.floor(t * 3) % 3;
			return [k === 0 ? 255 * s : 40, k === 1 ? 255 * s : 40, k === 2 ? 255 * s : 40];
		},
		electric: function (t) {
			var s = Math.pow(Math.abs(Math.sin(t * Math.PI * 3)), 3);
			return [60 + 195 * s, 60 + 195 * s, 255];
		},
		crest: function (t) {
			var s = Math.abs(Math.sin(t * Math.PI * 2));
			return [255 * s * s, 160 * s, 255 * (1 - s) + 60];
		},
		rainbows: function (t) {
			var h = (t * 6) % 6, x = 255 * (1 - Math.abs(h % 2 - 1));
			return [[255, x, 0], [x, 255, 0], [0, 255, x], [0, x, 255], [x, 0, 255], [255, 0, x]][Math.floor(h)];
		},
		sine: function (t) {
			var s = 0.5 + 0.5 * Math.sin(t * Math.PI * 8);
			return [255 * s, 255 * s * 0.6, 60 + 120 * (1 - s)];
		},
		cycloid: function (t) {
			var a = t * Math.PI * 2;
			return [128 + 127 * Math.cos(3 * a), 128 + 127 * Math.sin(2 * a), 128 + 127 * Math.cos(5 * a)];
		},
		oscillate: function (t) {
			var s = Math.sin(t * Math.PI * 16) > 0 ? 1 : 0.2;
			return [255 * s, 200 * s * (1 - t), 255 * s * t];
		},
		banded: function (t) {
			var k = Math.floor(t * 16) % 4;
			return [[255, 85, 85], [255, 255, 85], [85, 255, 85], [85, 85, 255]][k];
		}
	};

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Zoom() {
		this.scheme = 'random';
		this.velocity = VELOCITY[2];
		this.gap = GAP[2];
		this.tubes = [];
		this.count = 0;
		this.t = 0;
		this.nextTube = 0;
		this.nextScheme = 0;
	}

	Zoom.prototype.resize = function () {
		this.tubes = [];
	};

	Zoom.prototype.ramp = function () {
		var real = this.pals && this.pals[this.current];
		if (real) {
			return function (t) { return real[Math.floor(t * real.length) % real.length]; };
		}
		return RAMPS[this.current] || RAMPS.smooth;
	};

	Zoom.prototype.step = function (dt, ctx, w, h) {
		this.t += dt;
		if (this.scheme === 'random') {
			this.nextScheme -= dt;
			if (this.nextScheme <= 0) {
				this.current = SCHEMES[Math.floor(Math.random() * (SCHEMES.length - 1))];
				this.nextScheme = rand(20, 40);
			}
		} else {
			this.current = this.scheme;
		}
		var reach = Math.hypot(w, h);
		this.nextTube -= dt;
		if (this.nextTube <= 0) {
			/* Where the tube starts wanders slowly, so the tunnel bends. */
			var drift = this.t * 0.3;
			this.tubes.push({
				x: w / 2 + Math.sin(drift) * w * 0.07 + Math.sin(drift * 2.3) * w * 0.03,
				y: h / 2 + Math.cos(drift * 0.8) * h * 0.07,
				age: 0, n: this.count
			});
			this.count += 1;
			this.nextTube = this.gap;
		}
		var ramp = this.ramp();
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		/* Biggest - nearest - first; the newer ones sit inside. */
		for (var i = 0; i < this.tubes.length; i += 1) {
			var tube = this.tubes[i];
			tube.age += dt;
			tube.r = reach * this.velocity * tube.age * (1 + 0.35 * tube.age);
			/* The centre slides out from the middle as the tube comes closer. */
			var k = Math.min(1, tube.r / reach);
			var x = tube.x + (tube.x - w / 2) * k * 2;
			var y = tube.y + (tube.y - h / 2) * k * 2;
			var rgb = ramp(((tube.n * 0.083) + this.t * 0.05) % 1);
			var fade = Math.min(1, 0.35 + tube.r / reach);
			ctx.fillStyle = 'rgb(' + clamp(rgb[0] * fade) + ',' + clamp(rgb[1] * fade) + ',' +
				clamp(rgb[2] * fade) + ')';
			ctx.beginPath();
			ctx.arc(x, y, tube.r, 0, Math.PI * 2);
			ctx.fill();
		}
		/* Once a tube fills the screen, everything behind it is out of sight. */
		for (var j = this.tubes.length - 1; j > 0; j -= 1) {
			if (this.tubes[j].r > reach) {
				this.tubes.splice(0, j);
				break;
			}
		}
	};

	AfterDark.define('after-dark-zoom', function (el) {
		var sim = new Zoom();
		sim.scheme = SCHEMES[AfterDark.choice(el, 'colors', SCHEMES, 'random')];
		sim.velocity = VELOCITY[AfterDark.choice(el, 'speed', SPEEDS, 'medium')];
		sim.gap = GAP[AfterDark.choice(el, 'delay', DELAYS, 'medium')];
		AfterDark.data(AfterDark.setting(el, 'palettes') || 'art/frost').then(function (d) {
			sim.pals = d.palettes;
		}).catch(function () {
			/* Without them the made-up ramps stand in. */
		});
		return sim;
	});

	window.AfterDarkZoom = Zoom;
	Zoom.RAMPS = RAMPS;
}());
