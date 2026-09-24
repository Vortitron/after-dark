/**
 * rose.js - Rose, a trigonometric flower drawing itself.
 *
 * ROSE.AD ships no artwork. Its own description:
 *
 *   "ROSE (tm) Original design and concept by Ben Haller.
 *    Rose was first conceived, in a rudimentary way, on an IBM PC in BASIC
 *    many years ago ... It's based on trigonometry, that most hated and most
 *    beautiful of mathematical subjects."
 *
 * Its controls are Speed (Lethargic, Slow, Moving, Fast, Swift, Quick),
 * Trail Length (Shortest to Longest) and Big Dots. The trigonometry is the
 * rose curve, r = cos(k theta): a pen runs round it leaving a trail that
 * fades out behind, while k drifts, so one flower opens into the next.
 *
 *   <after-dark-rose speed="moving" trail-length="medium" big-dots>
 */
(function () {
	'use strict';

	var SPEEDS = ['lethargic', 'slow', 'moving', 'fast', 'swift', 'quick'];
	/* Points a second. */
	var RATE = [50, 100, 180, 300, 450, 700];
	var TRAILS = ['shortest', 'short', 'medium', 'long', 'longest'];
	var LENGTH = [80, 200, 400, 800, 1600];
	var STEP = Math.PI / 90;

	function Rose() {
		this.rate = RATE[2];
		this.length = LENGTH[2];
		this.bigDots = false;
		this.points = [];
		this.theta = 0;
		this.t = 0;
		this.owed = 0;
		this.k0 = 2 + Math.random() * 5;
	}

	Rose.prototype.resize = function (w, h) {
		this.points = [];
	};

	/** k wanders slowly between about 1.5 and 7.5, never quite repeating. */
	Rose.prototype.k = function () {
		return this.k0 + 3 * Math.sin(this.t * 0.013) + 1.2 * Math.sin(this.t * 0.031 + 1);
	};

	Rose.prototype.step = function (dt, ctx, w, h) {
		this.t += dt;
		this.owed += this.rate * dt;
		var cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46;
		var k = this.k();
		while (this.owed >= 1) {
			this.owed -= 1;
			this.theta += STEP;
			var r = R * Math.cos(k * this.theta);
			this.points.push(cx + r * Math.cos(this.theta), cy + r * Math.sin(this.theta),
				(this.theta * 12) % 360);
		}
		var excess = this.points.length - this.length * 3;
		if (excess > 0) { this.points.splice(0, excess); }

		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		var p = this.points, n = p.length / 3, i;
		if (this.bigDots) {
			for (i = 0; i < n; i += 1) {
				ctx.fillStyle = 'hsl(' + p[i * 3 + 2] + ',100%,60%)';
				ctx.fillRect(Math.round(p[i * 3]) - 1, Math.round(p[i * 3 + 1]) - 1, 3, 3);
			}
			return;
		}
		ctx.lineWidth = 1;
		/* Colour changes along the trail, so stroke it in short runs. */
		for (i = 1; i < n; i += 6) {
			ctx.strokeStyle = 'hsl(' + p[i * 3 + 2] + ',100%,60%)';
			ctx.beginPath();
			ctx.moveTo(p[(i - 1) * 3], p[(i - 1) * 3 + 1]);
			for (var j = i; j < Math.min(n, i + 6); j += 1) {
				ctx.lineTo(p[j * 3], p[j * 3 + 1]);
			}
			ctx.stroke();
		}
	};

	AfterDark.define('after-dark-rose', function (el) {
		var sim = new Rose();
		sim.rate = RATE[AfterDark.choice(el, 'speed', SPEEDS, 'moving')];
		sim.length = LENGTH[AfterDark.choice(el, 'trail-length', TRAILS, 'medium')];
		sim.bigDots = AfterDark.flag(el, 'big-dots');
		return sim;
	});

	window.AfterDarkRose = Rose;
}());
