/**
 * spiral.js - Spiral Gyra, lines strung between two spirographs.
 *
 * SPIRAL.AD ships no artwork, and says only:
 *
 *   "SPIRAL GYRA(tm) is another line drawing module with an interesting
 *    twist or two."
 *
 * Its controls are Max Lines, Min Lines and Color Cycling. Both ends of the
 * line trace spirograph paths - one wheel turning on another - and the last
 * so-many lines stay on screen. The twist: how many stay breathes between
 * Min Lines and Max Lines, so the ribbon gathers into a single thread and
 * fans back out again. The sliders are four steps each here.
 *
 *   <after-dark-spiral-gyra max-lines="100" min-lines="10" color-cycling="medium">
 */
(function () {
	'use strict';

	var MAXES = ['25', '50', '100', '200'];
	var MINS = ['1', '10', '25', '50'];
	var CYCLES = ['none', 'slow', 'medium', 'fast'];
	/* Degrees of hue a second. */
	var HUE = [0, 10, 30, 90];
	var LINES_PER_SECOND = 60;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	/** A point on one wheel rolling round another; t in radians. */
	function wheel() {
		return {
			a: rand(0.35, 0.6), b: rand(0.15, 0.4),
			f: rand(0.4, 1.1) * (Math.random() < 0.5 ? -1 : 1),
			g: rand(1.5, 4.5) * (Math.random() < 0.5 ? -1 : 1),
			p: rand(0, Math.PI * 2)
		};
	}

	function at(wh, t) {
		return {
			x: wh.a * Math.cos(wh.f * t + wh.p) + wh.b * Math.cos(wh.g * t),
			y: wh.a * Math.sin(wh.f * t + wh.p) + wh.b * Math.sin(wh.g * t)
		};
	}

	function SpiralGyra() {
		this.maxLines = 100;
		this.minLines = 10;
		this.hueRate = HUE[2];
		this.lines = [];
		this.t = 0;
		this.owed = 0;
		this.hue = rand(0, 360);
		this.fresh();
	}

	SpiralGyra.prototype.fresh = function () {
		this.p = wheel();
		this.q = wheel();
		this.nextFresh = rand(25, 45);
	};

	SpiralGyra.prototype.resize = function () {
		this.lines = [];
	};

	SpiralGyra.prototype.step = function (dt, ctx, w, h) {
		this.t += dt;
		this.nextFresh -= dt;
		if (this.nextFresh <= 0) { this.fresh(); }
		this.hue = (this.hue + this.hueRate * dt) % 360;
		var cx = w / 2, cy = h / 2, s = Math.min(w, h) * 0.5;
		this.owed += LINES_PER_SECOND * dt;
		while (this.owed >= 1) {
			this.owed -= 1;
			this.clock = (this.clock || 0) + 1 / LINES_PER_SECOND;
			var a = at(this.p, this.clock * 1.3), b = at(this.q, this.clock * 1.3);
			this.lines.push({ x1: cx + a.x * s, y1: cy + a.y * s, x2: cx + b.x * s, y2: cy + b.y * s,
				hue: this.hue });
		}
		/* The number of lines kept breathes between the two limits. */
		var lo = Math.min(this.minLines, this.maxLines), hi = Math.max(this.minLines, this.maxLines);
		var keep = Math.round(lo + (hi - lo) * (0.5 - 0.5 * Math.cos(this.t * 0.35)));
		if (this.lines.length > keep) { this.lines.splice(0, this.lines.length - keep); }

		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		ctx.lineWidth = 1;
		for (var i = 0; i < this.lines.length; i += 1) {
			var l = this.lines[i];
			ctx.strokeStyle = this.hueRate ? 'hsl(' + l.hue.toFixed(1) + ',100%,55%)' : '#ffffff';
			ctx.beginPath();
			ctx.moveTo(l.x1, l.y1);
			ctx.lineTo(l.x2, l.y2);
			ctx.stroke();
		}
	};

	AfterDark.define('after-dark-spiral-gyra', function (el) {
		var sim = new SpiralGyra();
		sim.maxLines = Number(MAXES[AfterDark.choice(el, 'max-lines', MAXES, '100')]);
		sim.minLines = Number(MINS[AfterDark.choice(el, 'min-lines', MINS, '10')]);
		sim.hueRate = HUE[AfterDark.choice(el, 'color-cycling', CYCLES, 'medium')];
		return sim;
	});

	window.AfterDarkSpiralGyra = SpiralGyra;
}());
