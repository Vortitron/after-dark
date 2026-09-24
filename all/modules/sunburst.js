/**
 * sunburst.js - Sunburst, rays swept round a point.
 *
 * SUNBURST.AD ships no artwork and hardly a description: "SUNBURST(TM).
 * Dedicated to Anna Bensen, with contributions from Jon Benton and Ellen
 * Lewis and Connie Barker." Its one control is Delay, Slowest to Fastest.
 * Jean Tantra also wrote Stained Glass, and this is its cousin: a line from
 * a centre point to each pixel round the edge of the screen in turn, the
 * colour stepping on with every one, so the one-pixel rays interfere into
 * moire as they go round. Each burst starts from a new centre, over the last.
 *
 *   <after-dark-sunburst delay="medium">
 */
(function () {
	'use strict';

	var DELAYS = ['slowest', 'slow', 'medium', 'fast', 'fastest'];
	/* Rays a second. */
	var RATE = [60, 150, 400, 900, 2000];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Sunburst() {
		this.rate = RATE[2];
	}

	Sunburst.prototype.resize = function (w, h) {
		this.canvas = document.createElement('canvas');
		this.canvas.width = Math.max(1, Math.round(w));
		this.canvas.height = Math.max(1, Math.round(h));
		var g = this.canvas.getContext('2d');
		g.fillStyle = '#000';
		g.fillRect(0, 0, w, h);
		this.fresh(w, h);
	};

	Sunburst.prototype.fresh = function (w, h) {
		this.cx = rand(w * 0.15, w * 0.85);
		this.cy = rand(h * 0.15, h * 0.85);
		this.at = 0;
		this.owed = 0;
		this.hue = rand(0, 360);
		/* How far the colour moves per ray: slow for bands, fast for stripes. */
		this.hueStep = Math.random() < 0.5 ? rand(0.3, 1.2) : rand(6, 20);
		this.per = 2 * (w + h);
	};

	/** The i'th pixel round the edge, clockwise from the top left. */
	Sunburst.prototype.edge = function (i, w, h) {
		if (i < w) { return [i, 0]; }
		i -= w;
		if (i < h) { return [w - 1, i]; }
		i -= h;
		if (i < w) { return [w - 1 - i, h - 1]; }
		return [0, h - 1 - (i - w)];
	};

	Sunburst.prototype.step = function (dt, ctx, w, h) {
		var g = this.canvas.getContext('2d');
		this.owed += this.rate * dt * Math.max(1, (w + h) / 1100);
		g.lineWidth = 1;
		while (this.owed >= 1) {
			this.owed -= 1;
			if (this.at >= this.per) { this.fresh(w, h); }
			var e = this.edge(this.at, w, h);
			this.hue = (this.hue + this.hueStep) % 360;
			g.strokeStyle = 'hsl(' + this.hue.toFixed(1) + ',100%,55%)';
			g.beginPath();
			g.moveTo(this.cx, this.cy);
			g.lineTo(e[0] + 0.5, e[1] + 0.5);
			g.stroke();
			this.at += 1;
		}
		ctx.drawImage(this.canvas, 0, 0, w, h);
	};

	AfterDark.define('after-dark-sunburst', function (el) {
		var sim = new Sunburst();
		sim.rate = RATE[AfterDark.choice(el, 'delay', DELAYS, 'medium')];
		return sim;
	});

	window.AfterDarkSunburst = Sunburst;
}());
