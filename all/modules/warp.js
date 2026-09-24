/**
 * warp.js - Warp!, flying through the stars.
 *
 * WARP.AD ships no artwork. Its own description:
 *
 *   "WARP! (tm)
 *    'Speed' controls the speed and direction of travel through the stars.
 *    'Size' controls the size of the stars.
 *    'Number of Stars' controls the number of stars displayed.
 *    'Color' allows color stars for those with color monitors.
 *    Rotational stellar effects and black hole designed by Bill Stewart and
 *    Jack Eastman."
 *
 * Speed runs Fast In, Medium In, Slow In, Impulse In, Impulse Out, Slow Out,
 * Medium Out, Fast Out; Size is Small, Big or Both. The rotational effect is
 * the ship rolling now and then; going Out, the stars pour into the middle
 * of the screen, which is the black hole. Number of Stars was a slider.
 *
 *   <after-dark-warp speed="medium in" stars="some" size="both" color>
 */
(function () {
	'use strict';

	var SPEEDS = ['fast in', 'medium in', 'slow in', 'impulse in',
		'impulse out', 'slow out', 'medium out', 'fast out'];
	/* Depth units a second; a star is born at depth 1 and passes you at 0. */
	var VELOCITY = [1.1, 0.55, 0.25, 0.08, -0.08, -0.25, -0.55, -1.1];
	var NUMBERS = ['few', 'some', 'many', 'lots'];
	var COUNT = [120, 250, 450, 800];
	var SIZES = ['small', 'big', 'both'];
	/* The EGA colours that read as stars. */
	var COLOURS = [[255, 255, 255], [255, 255, 85], [85, 255, 255], [255, 85, 85],
		[85, 85, 255], [255, 85, 255], [85, 255, 85]];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Warp() {
		this.velocity = VELOCITY[1];
		this.count = COUNT[1];
		this.size = 2;
		this.color = true;
		this.stars = [];
		this.roll = 0;
		this.rollRate = 0;
		this.rollTarget = 0;
		this.nextRoll = rand(6, 12);
	}

	/** A star somewhere in the view at depth z. */
	Warp.prototype.place = function (s, z) {
		var reach = this.reach;
		s.z = z;
		s.x = rand(-reach.x, reach.x) * z;
		s.y = rand(-reach.y, reach.y) * z;
		s.px = null;
		s.big = this.size === 1 || (this.size === 2 && Math.random() < 0.35);
		s.rgb = this.color ? COLOURS[Math.floor(Math.random() * COLOURS.length)] : COLOURS[0];
		return s;
	};

	Warp.prototype.resize = function (w, h) {
		this.focal = Math.min(w, h) * 0.5;
		/* How far off-axis a star at depth 1 can be and still be on screen. */
		this.reach = { x: (w / 2) / this.focal * 1.15, y: (h / 2) / this.focal * 1.15 };
		this.stars = [];
		for (var i = 0; i < this.count; i += 1) {
			this.stars.push(this.place({}, rand(0.05, 1)));
		}
	};

	Warp.prototype.step = function (dt, ctx, w, h) {
		/* Every so often the ship starts, or stops, rolling. */
		this.nextRoll -= dt;
		if (this.nextRoll <= 0) {
			this.rollTarget = Math.random() < 0.4 ? 0 : rand(-0.9, 0.9);
			this.nextRoll = rand(6, 14);
		}
		this.rollRate += (this.rollTarget - this.rollRate) * Math.min(1, dt * 0.8);
		this.roll += this.rollRate * dt;

		var cos = Math.cos(this.roll), sin = Math.sin(this.roll);
		var cx = w / 2, cy = h / 2, f = this.focal;
		var v = this.velocity;

		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);

		for (var i = 0; i < this.stars.length; i += 1) {
			var s = this.stars[i];
			s.z -= v * dt;
			if (s.z <= 0.02 || s.z > 1.02) {
				this.place(s, v > 0 ? 1 : rand(0.03, 0.12));
				continue;
			}
			var rx = s.x * cos - s.y * sin;
			var ry = s.x * sin + s.y * cos;
			var sx = cx + rx / s.z * f;
			var sy = cy + ry / s.z * f;
			if (v > 0 && (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20)) {
				this.place(s, 1);
				continue;
			}
			/* Nearer is brighter; far away is a grey speck. */
			var lum = Math.min(1, 0.25 + (1 - s.z) * 1.1);
			var c = 'rgb(' + Math.round(s.rgb[0] * lum) + ',' + Math.round(s.rgb[1] * lum) + ',' +
				Math.round(s.rgb[2] * lum) + ')';
			var size = s.big ? (s.z < 0.3 ? 3 : 2) : 1;
			if (s.px !== null && Math.abs(v) > 0.2) {
				ctx.strokeStyle = c;
				ctx.lineWidth = size;
				ctx.beginPath();
				ctx.moveTo(s.px, s.py);
				ctx.lineTo(sx, sy);
				ctx.stroke();
			} else {
				ctx.fillStyle = c;
				ctx.fillRect(Math.round(sx), Math.round(sy), size, size);
			}
			s.px = sx;
			s.py = sy;
		}
	};

	AfterDark.define('after-dark-warp', function (el) {
		var sim = new Warp();
		sim.velocity = VELOCITY[AfterDark.choice(el, 'speed', SPEEDS, 'medium in')];
		sim.count = COUNT[AfterDark.choice(el, 'stars', NUMBERS, 'some')];
		sim.size = AfterDark.choice(el, 'size', SIZES, 'both');
		sim.color = AfterDark.flag(el, 'color');
		return sim;
	});

	window.AfterDarkWarp = Warp;
	Warp.SPEEDS = SPEEDS;
	Warp.VELOCITY = VELOCITY;
}());
