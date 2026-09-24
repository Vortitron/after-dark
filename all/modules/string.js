/**
 * string.js - String Theory, moire strung round the edge of the screen.
 *
 * STRING.AD ships no artwork. Its own description:
 *
 *   "STRING THEORY (tm) Original idea by James J. Eastman.
 *    Colourful moire patterns that follow the edge of your monitor. For more
 *    variation, select up to 4 strings at the same time."
 *
 * Its controls are String Groups (1-4), Strings (10 to 150, or Infinite),
 * Color Speed and Clear Screen First. Each group is a string whose two ends
 * run round the edge of the screen at their own speeds; the last so-many
 * positions stay drawn, and the fan of one-pixel lines is where the moire
 * comes from. Infinite never takes a line back off.
 *
 *   <after-dark-string-theory groups="2" strings="60" color-speed="medium" clear-screen>
 */
(function () {
	'use strict';

	var GROUPS = ['1', '2', '3', '4'];
	var STRINGS = ['10', '30', '60', '100', '150', 'infinite'];
	var COLOR_SPEEDS = ['slow', 'medium', 'fast'];
	var HUE = [8, 25, 80];
	var STEPS_PER_SECOND = 50;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	/** Distance d round the perimeter of a w x h box, as a point. */
	function edge(d, w, h) {
		var p = 2 * (w + h);
		d = ((d % p) + p) % p;
		if (d < w) { return { x: d, y: 0 }; }
		d -= w;
		if (d < h) { return { x: w - 1, y: d }; }
		d -= h;
		if (d < w) { return { x: w - 1 - d, y: h - 1 }; }
		return { x: 0, y: h - 1 - (d - w) };
	}

	function StringTheory() {
		this.groups = 2;
		this.strings = 60;
		this.hueRate = HUE[1];
		this.clearScreen = true;
	}

	StringTheory.prototype.resize = function (w, h) {
		this.canvas = document.createElement('canvas');
		this.canvas.width = Math.max(1, Math.round(w));
		this.canvas.height = Math.max(1, Math.round(h));
		this.desk = this.clearScreen ? null : AfterDark.desktop(w, h);
		this.wipe(this.canvas.getContext('2d'), w, h);
		var per = 2 * (w + h);
		this.set = [];
		for (var i = 0; i < this.groups; i += 1) {
			this.set.push({
				a: rand(0, per), b: rand(0, per),
				/* Fast enough that successive lines stand a few pixels apart. */
				va: rand(0.6, 1.6) * per / 12 * (Math.random() < 0.5 ? -1 : 1),
				vb: rand(0.6, 1.6) * per / 12 * (Math.random() < 0.5 ? -1 : 1),
				hue: rand(0, 360), lines: []
			});
		}
		this.owed = 0;
	};

	/** Back to where it started: black, or the desktop if Clear Screen is off. */
	StringTheory.prototype.wipe = function (g, w, h) {
		if (this.desk) {
			g.drawImage(this.desk, 0, 0);
		} else {
			g.fillStyle = '#000';
			g.fillRect(0, 0, w, h);
		}
	};

	StringTheory.prototype.step = function (dt, ctx, w, h) {
		var g = this.canvas.getContext('2d');
		var infinite = this.strings === Infinity;
		this.owed += STEPS_PER_SECOND * dt;
		var steps = Math.floor(this.owed);
		this.owed -= steps;
		var self = this;
		this.set.forEach(function (s) {
			for (var n = 0; n < steps; n += 1) {
				s.a += s.va / STEPS_PER_SECOND;
				s.b += s.vb / STEPS_PER_SECOND;
				s.hue = (s.hue + self.hueRate / STEPS_PER_SECOND) % 360;
				/* Now and then an end changes its mind. */
				if (Math.random() < 0.002) { s.va *= -rand(0.7, 1.3); }
				if (Math.random() < 0.002) { s.vb *= -rand(0.7, 1.3); }
				var p = edge(s.a, w, h), q = edge(s.b, w, h);
				var line = { x1: p.x, y1: p.y, x2: q.x, y2: q.y, c: 'hsl(' + s.hue.toFixed(1) + ',100%,55%)' };
				if (infinite) {
					g.strokeStyle = line.c;
					g.lineWidth = 1;
					g.beginPath();
					g.moveTo(line.x1 + 0.5, line.y1 + 0.5);
					g.lineTo(line.x2 + 0.5, line.y2 + 0.5);
					g.stroke();
				} else {
					s.lines.push(line);
					if (s.lines.length > self.strings) { s.lines.shift(); }
				}
			}
		});
		if (infinite) {
			ctx.drawImage(this.canvas, 0, 0, w, h);
			return;
		}
		this.wipe(g, w, h);
		g.lineWidth = 1;
		this.set.forEach(function (s) {
			s.lines.forEach(function (l) {
				g.strokeStyle = l.c;
				g.beginPath();
				g.moveTo(l.x1 + 0.5, l.y1 + 0.5);
				g.lineTo(l.x2 + 0.5, l.y2 + 0.5);
				g.stroke();
			});
		});
		ctx.drawImage(this.canvas, 0, 0, w, h);
	};

	AfterDark.define('after-dark-string-theory', function (el) {
		var sim = new StringTheory();
		sim.groups = Number(GROUPS[AfterDark.choice(el, 'groups', GROUPS, '2')]);
		var strings = STRINGS[AfterDark.choice(el, 'strings', STRINGS, '60')];
		sim.strings = strings === 'infinite' ? Infinity : Number(strings);
		sim.hueRate = HUE[AfterDark.choice(el, 'color-speed', COLOR_SPEEDS, 'medium')];
		sim.clearScreen = AfterDark.flag(el, 'clear-screen');
		return sim;
	});

	window.AfterDarkStringTheory = StringTheory;
	StringTheory.edge = edge;
}());
