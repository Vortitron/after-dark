/**
 * spot.js - Spotlight, a torch played over the desktop.
 *
 * SPOT.AD ships no artwork. Its own description:
 *
 *   "SPOTLIGHT (tm) shines a moving spotlight on your Windows desktop.
 *    Use the 'Size' slider to change the size of the spotlight.
 *    The 'Speed' slider controls how fast it moves around the screen.
 *    Original concept by Bob Schumaker and Chip Morningstar."
 *
 * Size runs 30 to 200 pixels, or Random; there is a Spots slider too. The
 * screen goes dark except where the light falls, and the desktop under it is
 * the one ad.js paints, since a page cannot see what is behind it.
 *
 *   <after-dark-spotlight size="100" speed="medium" spots="1">
 */
(function () {
	'use strict';

	var SIZES = ['random', '30', '50', '80', '100', '150', '200'];
	var SPEEDS = ['slow', 'medium', 'fast'];
	var PACE = [70, 140, 260];
	var SPOTS = ['1', '2', '3', '4'];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Spotlight() {
		this.size = 100;
		this.pace = PACE[1];
		this.count = 1;
	}

	Spotlight.prototype.resize = function (w, h) {
		this.desk = AfterDark.desktop(w, h);
		this.spots = [];
		for (var i = 0; i < this.count; i += 1) {
			var r = (this.size || rand(30, 200)) / 2 * Math.max(1, Math.min(w, h) / 480);
			var a = rand(0, Math.PI * 2);
			this.spots.push({ x: rand(r, w - r), y: rand(r, h - r), r: r, a: a, turn: 0,
				random: !this.size });
		}
	};

	Spotlight.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		for (var i = 0; i < this.spots.length; i += 1) {
			var s = this.spots[i];
			/* Wander: the heading drifts, and the edges turn it back. */
			s.turn += rand(-3, 3) * dt;
			s.turn *= Math.pow(0.4, dt);
			s.a += s.turn * dt;
			s.x += Math.cos(s.a) * this.pace * dt;
			s.y += Math.sin(s.a) * this.pace * dt;
			if (s.x < s.r) { s.x = s.r; s.a = Math.PI - s.a; }
			if (s.x > w - s.r) { s.x = w - s.r; s.a = Math.PI - s.a; }
			if (s.y < s.r) { s.y = s.r; s.a = -s.a; }
			if (s.y > h - s.r) { s.y = h - s.r; s.a = -s.a; }
			if (s.random && Math.random() < dt * 0.1) {
				s.r = rand(15, 100) * Math.max(1, Math.min(w, h) / 480);
			}
			ctx.save();
			ctx.beginPath();
			ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
			ctx.clip();
			ctx.drawImage(this.desk, 0, 0, w, h);
			ctx.restore();
		}
	};

	AfterDark.define('after-dark-spotlight', function (el) {
		var sim = new Spotlight();
		var size = SIZES[AfterDark.choice(el, 'size', SIZES, '100')];
		sim.size = size === 'random' ? 0 : Number(size);
		sim.pace = PACE[AfterDark.choice(el, 'speed', SPEEDS, 'medium')];
		sim.count = Number(SPOTS[AfterDark.choice(el, 'spots', SPOTS, '1')]);
		return sim;
	});

	window.AfterDarkSpotlight = Spotlight;
}());
