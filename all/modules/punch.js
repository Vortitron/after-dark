/**
 * punch.js - Punch Out, the desktop punched full of holes.
 *
 * PUNCH.AD ships no artwork. Its own description:
 *
 *   "PUNCH OUT (tm) punches holes in your monitor and slides the pieces off
 *    the screen in random directions.
 *    Original concept by Bob Schumaker & Chip Morningstar.
 *    Use the 'Shape' drop down list box to select different shapes to be
 *    punched. Use the 'Size' slider to vary the size of pieces and the
 *    'Speed' slider to vary the speed the punched pieces move."
 *
 * Shape is Circle, Oval, Square, Rectangle or Random. When there is nothing
 * left to punch it puts the desktop back and starts again.
 *
 *   <after-dark-punch-out shape="random" size="medium" speed="medium">
 */
(function () {
	'use strict';

	var SHAPES = ['circle', 'oval', 'square', 'rectangle', 'random'];
	var SIZES = ['small', 'medium', 'large'];
	var SIDE = [36, 64, 110];
	var SPEEDS = ['slow', 'medium', 'fast'];
	var PACE = [120, 260, 520];
	/* Punches a second. */
	var RATE = 4;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function outline(g, shape, w, h) {
		g.beginPath();
		if (shape === 0 || shape === 1) {
			g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
		} else {
			g.rect(0, 0, w, h);
		}
	}

	function PunchOut() {
		this.shape = 4;
		this.side = SIDE[1];
		this.pace = PACE[1];
	}

	PunchOut.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.fresh();
	};

	PunchOut.prototype.fresh = function () {
		var w = this.w, h = this.h;
		this.screen = document.createElement('canvas');
		this.screen.width = Math.max(1, Math.round(w));
		this.screen.height = Math.max(1, Math.round(h));
		this.screen.getContext('2d').drawImage(AfterDark.desktop(w, h), 0, 0);
		this.pieces = [];
		this.owed = 0;
		this.punched = 0;
		var scale = Math.max(1, Math.min(w, h) / 480);
		this.unit = this.side * scale;
		/* Enough punches to have been everywhere a couple of times over. */
		this.budget = Math.round(w * h / (this.unit * this.unit) * 2.2);
		this.rest = 0;
	};

	PunchOut.prototype.punch = function () {
		var shape = this.shape === 4 ? Math.floor(Math.random() * 4) : this.shape;
		var u = this.unit * rand(0.8, 1.2);
		var pw = u, ph = u;
		if (shape === 1 || shape === 3) {
			if (Math.random() < 0.5) { pw *= 1.7; } else { ph *= 1.7; }
		}
		pw = Math.round(pw);
		ph = Math.round(ph);
		var x = Math.round(rand(-pw / 3, this.w - pw * 2 / 3));
		var y = Math.round(rand(-ph / 3, this.h - ph * 2 / 3));
		var piece = document.createElement('canvas');
		piece.width = pw;
		piece.height = ph;
		var g = piece.getContext('2d');
		outline(g, shape, pw, ph);
		g.clip();
		g.drawImage(this.screen, -x, -y);
		/* And out of the screen it came. */
		var s = this.screen.getContext('2d');
		s.save();
		s.translate(x, y);
		outline(s, shape, pw, ph);
		s.fillStyle = '#000';
		s.fill();
		s.restore();
		var a = rand(0, Math.PI * 2);
		var v = this.pace * rand(0.7, 1.3);
		this.pieces.push({ c: piece, x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, delay: 0.25 });
		this.punched += 1;
	};

	PunchOut.prototype.step = function (dt, ctx, w, h) {
		if (this.punched < this.budget) {
			this.owed += RATE * dt * Math.max(1, Math.sqrt(w * h) / 700);
			while (this.owed >= 1) {
				this.punch();
				this.owed -= 1;
			}
		} else if (!this.pieces.length) {
			this.rest += dt;
			if (this.rest > 1.5) { this.fresh(); }
		}
		ctx.drawImage(this.screen, 0, 0, w, h);
		for (var i = this.pieces.length - 1; i >= 0; i -= 1) {
			var p = this.pieces[i];
			/* A moment's pause in the hole, then away. */
			if (p.delay > 0) {
				p.delay -= dt;
			} else {
				p.x += p.vx * dt;
				p.y += p.vy * dt;
			}
			if (p.x > w || p.y > h || p.x + p.c.width < 0 || p.y + p.c.height < 0) {
				this.pieces.splice(i, 1);
				continue;
			}
			ctx.drawImage(p.c, Math.round(p.x), Math.round(p.y));
		}
	};

	AfterDark.define('after-dark-punch-out', function (el) {
		var sim = new PunchOut();
		sim.shape = AfterDark.choice(el, 'shape', SHAPES, 'random');
		sim.side = SIDE[AfterDark.choice(el, 'size', SIZES, 'medium')];
		sim.pace = PACE[AfterDark.choice(el, 'speed', SPEEDS, 'medium')];
		return sim;
	});

	window.AfterDarkPunchOut = PunchOut;
}());
