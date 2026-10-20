/**
 * hardrain.js - Hard Rain, raindrops rippling on the screen.
 *
 * The classic RAIN.AD (not After Dark 4.0's Rainforest, which is also
 * RAIN.AD) ships no artwork. Its own description:
 *
 *   "HARD RAIN (tm)
 *    Based on original design by James J. Eastman.
 *    See Scientific American, Dec 1987."
 *
 * and its control panel is "# of Drops", "Drop Size" and "Clear Screen
 * First" (off by default, so it rains on the desktop).
 *
 * Checked against the original running under Wine (October 2026), from a
 * capture and a +relay trace of its GDI calls. Every drop is one GDI Ellipse
 * filled with the black brush and outlined in a pure colour (red, green,
 * blue, yellow, cyan or magenta), so each ring wipes out what is inside it:
 *
 * - It keeps nine drops going (the default "# of Drops" is a raw 22 on a
 *   1-9 slider) and grows each in turn: a drop starts 8 px across at a
 *   random point and gains 6 px a step, n steps in all with n from 2 to 13
 *   (Drop Size's default raw 43 is about the largest radius, 41). The first
 *   n/2 rings have a 2-px pen, the rest 1 px. Each ring's black fill hides
 *   the one before. Then the drop is wiped out with a black ellipse (black
 *   pen and brush) 2 px wider than its biggest ring, and its slot starts a
 *   new drop at once - so there are never more than nine rings on screen,
 *   and on a desktop each drop leaves a black hole behind it.
 *
 * Under Wine it runs unthrottled (it never reads the clock), so STEPS a
 * second is chosen. The counts for the other "# of Drops" and the sizes for
 * the other Drop Size settings are inferred from the panel's ranges.
 *
 *   <after-dark-hard-rain drops="lots" drop-size="medium">
 */
(function () {
	'use strict';

	var DROPS = ['few', 'some', 'many', 'lots'];
	var COUNT = [2, 4, 6, 9];
	var SIZES = ['small', 'medium', 'large'];
	/* Largest radius, px. Medium is the module's own default. */
	var REACH = [20, 43, 60];
	/* Rounds a second: each drop grows one step a round. */
	var STEPS = 15;
	var COLOURS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	/**
	 * A drop's rings, in order: [diameter, pen width]. `n` growing steps of
	 * 6 px from 8, the first n/2 with a 2-px pen, then the black ellipse 2 px
	 * wider that erases it (pen width 0 here: the stock black pen).
	 */
	function rings(n) {
		var out = [];
		for (var k = 0; k < n; k += 1) {
			out.push([8 + 6 * k, k < Math.floor(n / 2) ? 2 : 1]);
		}
		out.push([8 + 6 * (n - 1) + 2, 0]);
		return out;
	}

	function HardRain() {
		this.count = COUNT[3];
		this.reach = REACH[1];
		this.clearScreen = false;
		this.drops = [];
		this.clock = 0;
	}

	HardRain.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.canvas = document.createElement('canvas');
		this.canvas.width = w;
		this.canvas.height = h;
		var g = this.canvas.getContext('2d');
		if (this.clearScreen) {
			g.fillStyle = '#000';
			g.fillRect(0, 0, w, h);
		} else {
			g.drawImage(AfterDark.desktop(w, h), 0, 0, w, h);
		}
		this.drops = [];
	};

	HardRain.prototype.newDrop = function () {
		var most = Math.max(2, Math.floor((2 * this.reach - 8) / 6));
		return {
			x: Math.floor(rand(0, this.w)), y: Math.floor(rand(0, this.h)),
			rings: rings(2 + Math.floor(Math.random() * (most - 1))), k: 0,
			colour: COLOURS[Math.floor(Math.random() * COLOURS.length)]
		};
	};

	/** One round: each drop draws its next ring; finished ones start again. */
	HardRain.prototype.round = function (g) {
		while (this.drops.length < this.count) { this.drops.push(this.newDrop()); }
		for (var i = 0; i < this.drops.length; i += 1) {
			var d = this.drops[i];
			var ring = d.rings[d.k];
			var r = ring[0] / 2;
			g.beginPath();
			g.ellipse(d.x, d.y, r, r, 0, 0, Math.PI * 2);
			g.fillStyle = '#000';
			g.fill();
			g.lineWidth = ring[1] || 1;
			g.strokeStyle = ring[1] ? d.colour : '#000';
			g.stroke();
			d.k += 1;
			if (d.k >= d.rings.length) { this.drops[i] = this.newDrop(); }
		}
	};

	HardRain.prototype.step = function (dt, ctx) {
		var g = this.canvas.getContext('2d');
		this.clock += dt;
		var n = 0;
		while (this.clock >= 1 / STEPS && n < 5) {
			this.clock -= 1 / STEPS;
			this.round(g);
			n += 1;
		}
		if (n === 5) { this.clock = 0; }
		ctx.drawImage(this.canvas, 0, 0);
	};

	AfterDark.define('after-dark-hard-rain', function (el) {
		var sim = new HardRain();
		sim.count = COUNT[AfterDark.choice(el, 'drops', DROPS, 'lots')];
		sim.reach = REACH[AfterDark.choice(el, 'drop-size', SIZES, 'medium')];
		sim.clearScreen = AfterDark.flag(el, 'clear-screen');
		return sim;
	});

	window.AfterDarkHardRain = HardRain;
	HardRain.rings = rings;
}());
