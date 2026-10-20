/**
 * spheres.js - Spheres, drawn the way the original module drew itself.
 *
 * SPHERES.AD ships no artwork. Its own description:
 *
 *   "SPHERES (tm) makes 3D-looking colorful orbs that fill your screen.
 *    'Max Size' is the maximum size of a sphere.
 *    'Offset' controls the shape of the sphere. The larger the offset, the
 *    more egg-shaped the sphere will be.
 *    'Clear Every' sets the number of spheres drawn before clearing the
 *    screen.
 *    Based on Spheres by Bruce Burkhalter."
 *
 * Checked against the original running under Wine (October 2026), from
 * WINEDEBUG=+relay traces of its GDI calls at several settings (over 700
 * spheres) and an 8-bit capture. A sphere is 34 filled circles, NULL pen,
 * one per tick, each smaller, brighter and nearer the highlight:
 *
 *   R = 30 + random(Max Size)            centre anywhere on the screen
 *   ring k (0..33): radius R * sqrt(1 - k/33) (the last about R/10),
 *     centre moved right and up by R * Offset/20 * sqrt(k/33) each way,
 *     colour level 24 + 7k (24 .. 255) in one of six hues, evenly picked:
 *     red, green, blue, magenta, cyan, and azure (blue at the level, green
 *     at 29 + 3k).
 *
 * So Offset 10 puts the highlight half a radius up and right; past about
 * 20 the rings leave the sphere and it becomes a comet or an egg. (Past
 * about 70 the original's arithmetic overflows and the far rings flip to
 * the other side; that is not copied.) After Clear Every spheres the screen
 * is filled black. Clear Screen First is off by default: the first spheres
 * land on your desktop. Colours are PALETTERGB, so the module got the
 * nearest entries of the engine's palette (a 6x6x6 cube and greys); here
 * they are the exact levels.
 *
 * The defaults are what the module does with no settings stored: Max Size
 * 73, Offset 10, Clear Every 30. Still chosen: the rate (Wine runs it
 * unthrottled, a whole screenful in a fraction of a second).
 *
 *   <after-dark-spheres max-size="73" offset="10" clear-every="30">
 */
(function () {
	'use strict';

	var RINGS = 34;
	var RINGS_PER_FRAME = 4;

	/* Each hue: [r, g, b] as a function of the ring's level v = 24 + 7k. */
	var HUES = [
		function (v) { return [v, 0, 0]; },
		function (v) { return [0, v, 0]; },
		function (v) { return [0, 0, v]; },
		function (v) { return [v, 0, v]; },
		function (v) { return [0, v, v]; },
		function (v, k) { return [0, 29 + 3 * k, v]; }
	];

	function random(n) {
		return Math.floor(Math.random() * n);
	}

	/** Spec for one orb: centre, radius, hue, and the 34 rings it is drawn as. */
	function makeSphere(w, h, maxSize, offset) {
		var scale = w / 1024;
		var r = (30 + random(maxSize)) * scale;
		var x = random(w);
		var y = random(h);
		var hue = HUES[random(HUES.length)];
		var push = r * offset / 20;
		var rings = [];
		for (var k = 0; k < RINGS; k += 1) {
			var t = k / (RINGS - 1);
			var c = hue(24 + 7 * k, k);
			rings.push({
				x: x + push * Math.sqrt(t),
				y: y - push * Math.sqrt(t),
				r: r * Math.max(Math.sqrt(1 - t), 0.095),
				colour: 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'
			});
		}
		return { x: x, y: y, r: r, rings: rings };
	}

	function paintRing(ctx, ring) {
		ctx.fillStyle = ring.colour;
		ctx.beginPath();
		ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
		ctx.fill();
	}

	function paintSphere(ctx, s) {
		for (var i = 0; i < s.rings.length; i += 1) {
			paintRing(ctx, s.rings[i]);
		}
	}

	function Spheres() {
		this.maxSize = 73;
		this.offset = 10;
		this.clearEvery = 30;
		this.clearScreen = false;
		this.drawn = 0;
		this.ready = false;
		this.sphere = null;
		this.ring = 0;
	}

	Spheres.prototype.reset = function () {
		this.drawn = 0;
		this.ready = false;
		this.sphere = null;
	};

	Spheres.prototype.draw = function (ctx, w, h) {
		if (!this.ready) {
			if (this.clearScreen) {
				ctx.fillStyle = '#000';
				ctx.fillRect(0, 0, w, h);
			} else {
				ctx.drawImage(AfterDark.desktop(Math.round(w), Math.round(h)), 0, 0, w, h);
			}
			this.ready = true;
			this.drawn = 0;
		}
		for (var i = 0; i < RINGS_PER_FRAME; i += 1) {
			if (!this.sphere) {
				if (this.clearEvery > 0 && this.drawn >= this.clearEvery) {
					ctx.fillStyle = '#000';
					ctx.fillRect(0, 0, w, h);
					this.drawn = 0;
				}
				this.sphere = makeSphere(w, h, this.maxSize, this.offset);
				this.ring = 0;
			}
			paintRing(ctx, this.sphere.rings[this.ring]);
			this.ring += 1;
			if (this.ring >= this.sphere.rings.length) {
				this.sphere = null;
				this.drawn += 1;
			}
		}
	};

	function SpheresElement() {
		return Reflect.construct(HTMLElement, [], SpheresElement);
	}
	SpheresElement.prototype = Object.create(HTMLElement.prototype);
	SpheresElement.prototype.constructor = SpheresElement;
	Object.setPrototypeOf(SpheresElement, HTMLElement);

	SpheresElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		var self = this;
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		var sim = new Spheres();
		sim.maxSize = Math.max(10, Math.min(100, parseInt(AfterDark.setting(self, 'max-size'), 10) || 73));
		var offset = parseInt(AfterDark.setting(self, 'offset'), 10);
		sim.offset = Math.max(0, Math.min(100, isNaN(offset) ? 10 : offset));
		var every = AfterDark.setting(self, 'clear-every');
		if (every !== null && String(every).toLowerCase() === 'never') {
			sim.clearEvery = 0;
		} else {
			sim.clearEvery = Math.max(0, parseInt(every, 10) || 30);
		}
		sim.clearScreen = AfterDark.flag(self, 'clear-screen');

		var screen = new AfterDark.Screen(self);
		this._screen = screen;
		this.sim = sim;
		screen.onresize = function () {
			sim.reset();
		};
		sim.reset();
		screen.run(function (dt, ctx, width, height) {
			sim.draw(ctx, width, height);
		});
	};

	SpheresElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-spheres', SpheresElement);
	window.AfterDarkSpheres = Spheres;
	Spheres.makeSphere = makeSphere;
	Spheres.paintSphere = paintSphere;
	Spheres.HUES = HUES;
}());
