/**
 * confetti.js - Confetti Factory, a post-industrial workplace.
 *
 * CONFETTI.AD's own description:
 *
 *   "CONFETTI FACTORY (tm) Confetti Factory is an artist's conception of a
 *    neo-modern, antediluvian, post-industrial workplace. To see ducks, wait
 *    until the end of the workshift. If you don't like the way the ducks are
 *    piling their confetti, use the Caps Lock key to reverse the direction of
 *    the conveyor belts."
 *
 * Its controls are Ducks (None, Seven, Default), Workshift (10 sec. to 2 hrs.)
 * and Type (Metal, Wood). Its art is the factory in pieces, in
 * all/art/confetti/: a hopper with a hatch, belt pulleys turning in four
 * frames with the belt running round them, straight runs of belt, in metal
 * and in wood; a duck waddling in seven frames and a Duck sign. There is no
 * picture of the factory itself, so it is put together here: the hopper
 * across the top, belts in a zigzag down the screen, confetti out of the
 * hatch, along the belts, off the ends and into a heap on the floor. At the
 * end of the shift the Duck sign goes up and the ducks come out and push the
 * heap along the floor, the way the belts last ran; Caps Lock turns the belts.
 *
 *   <after-dark-confetti-factory art="art/confetti" ducks="seven" workshift="1 min." type="metal">
 */
(function () {
	'use strict';

	var DUCKS = ['none', 'seven', 'default'];
	var HOW_MANY = [0, 7, 3];
	var SHIFTS = ['10 sec.', '30 sec.', '1 min.', '2 min.', '5 min.', '10 min.', '90 min.', '2 hrs.'];
	var SECONDS = [10, 30, 60, 120, 300, 600, 5400, 7200];
	var TYPES = ['metal', 'wood'];
	var PIECES = { metal: { hopper: 211, belt: 212, wheels: [212, 213] }, wood: { hopper: 221, belt: 222, wheels: [222, 223] } };
	var PAPER = ['#ff5555', '#55ff55', '#5555ff', '#ffff55', '#ff55ff', '#55ffff', '#ffffff', '#ffaa00'];
	var BELT_SPEED = 45;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Confetti() {
		this.ducks = 3;
		this.shift = 60;
		this.type = 'metal';
		this.dir = 1;
		this.art = null;
	}

	Confetti.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.s = Math.max(1, Math.min(w, h) / 300);
		var s = this.s;
		this.floor = h - 2 * s;
		this.pile = new Float32Array(Math.ceil(w));
		this.heap = document.createElement('canvas');
		this.heap.width = Math.max(1, Math.round(w));
		this.heap.height = Math.max(1, Math.round(h));
		this.bits = [];
		this.clock = 0;
		this.phase = 'work';
		this.spin = 0;
		this.sign = 0;
		this.parade = [];
		/* Belts zigzag down, each overhanging the one below at its end. */
		this.belts = [];
		var top = 70 * s, rows = Math.max(3, Math.floor((h - top - 90 * s) / (48 * s)));
		for (var i = 0; i < rows; i += 1) {
			var left = i % 2 === 0;
			var bw = w * rand(0.5, 0.65);
			var x0 = left ? w * rand(0.04, 0.12) : w - bw - w * rand(0.04, 0.12);
			this.belts.push({ x0: x0, x1: x0 + bw, y: top + (i + 1) * ((h - top - 90 * s) / rows) });
		}
		this.hatch = this.belts.length ? (this.belts[0].x0 + this.belts[0].x1) / 2 : w / 2;
	};

	Confetti.prototype.img = function (id) {
		var b = this.art.bitmap(id);
		return b ? b.image : null;
	};

	/** The belt a falling bit lands on, if any, between y0 and y1. */
	Confetti.prototype.landing = function (x, y0, y1) {
		for (var i = 0; i < this.belts.length; i += 1) {
			var b = this.belts[i];
			if (x >= b.x0 && x <= b.x1 && y0 <= b.y && y1 >= b.y) { return b; }
		}
		return null;
	};

	Confetti.prototype.drop = function (bit) {
		var g = this.heap.getContext('2d'), x = Math.max(0, Math.min(this.w - 1, Math.floor(bit.x)));
		var step = Math.max(1, Math.round(this.s)), grain = this.s * 0.8;
		/* It rolls downhill until it finds somewhere it can rest, so the heap slumps. */
		for (var n = 0; n < 400; n += 1) {
			var l = x - step, r = x + step;
			var lowL = l >= 0 && this.pile[l] + grain * 2 < this.pile[x];
			var lowR = r < this.w && this.pile[r] + grain * 2 < this.pile[x];
			if (lowL && lowR) { x = Math.random() < 0.5 ? l : r; } else if (lowL) { x = l; } else if (lowR) { x = r; } else { break; }
		}
		/* A long shift's heap stops short of the belts; the rest blows away. */
		if (this.pile[x] > this.h * 0.3) { return; }
		this.pile[x] += grain;
		g.fillStyle = bit.c;
		g.fillRect(x - this.s, this.floor - this.pile[x], this.s * 2, this.s * 1.5);
	};

	Confetti.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.art) { return; }
		var s = this.s, set = PIECES[this.type], i;
		this.clock += dt;
		var working = this.phase === 'work';
		if (working) {
			this.spin += dt * 8 * this.dir;
			/* Out of the hatch. */
			for (i = 0; i < Math.ceil(dt * 90); i += 1) {
				this.bits.push({ x: this.hatch + rand(-6, 6) * s, y: 52 * s, vx: 0, vy: rand(10, 40), c: PAPER[Math.floor(Math.random() * PAPER.length)], on: null });
			}
			if (this.clock > this.shift) {
				this.phase = this.ducks ? 'ducks' : 'work';
				this.clock = 0;
				this.startParade();
			}
		}
		/* Confetti: falls, rides a belt, falls off its end. */
		for (i = this.bits.length - 1; i >= 0; i -= 1) {
			var b = this.bits[i];
			if (b.on) {
				if (working) { b.x += this.dir * BELT_SPEED * s * dt * (this.belts.indexOf(b.on) % 2 ? -1 : 1); }
				if (b.x < b.on.x0 || b.x > b.on.x1) {
					/* Thrown off the end at the belt's speed. */
					b.vx = (b.x > b.on.x1 ? 1 : -1) * BELT_SPEED * s * rand(0.4, 1.3);
					b.on = null;
					b.vy = 10;
				}
				continue;
			}
			b.vy += 300 * dt;
			var ny = b.y + b.vy * dt, land = this.landing(b.x, b.y, ny);
			if (land) {
				b.on = land;
				b.y = land.y - 1 * s;
				continue;
			}
			b.y = ny;
			b.x += (b.vx + Math.sin(b.y * 0.05 + i) * 10) * dt;
			if (b.y >= this.floor - this.pile[Math.max(0, Math.min(w - 1, Math.floor(b.x)))]) {
				this.drop(b);
				this.bits.splice(i, 1);
			}
		}
		ctx.drawImage(this.heap, 0, 0, w, h);
		ctx.imageSmoothingEnabled = false;
		/* The belts. */
		var frame = ((Math.floor(this.spin) % 4) + 4) % 4;
		this.belts.forEach(function (bt, n) {
			var wheel = this.img(set.wheels[n % 2] * 10 + 1 + frame), run = this.img(set.belt * 10 + 5);
			var ww = 32 * s, y = bt.y - 2 * s;
			for (var x = bt.x0 + ww / 2; x < bt.x1 - ww / 2; x += 10 * s) {
				ctx.drawImage(run, Math.round(x), Math.round(y), 10 * s, 32 * s);
			}
			ctx.drawImage(wheel, Math.round(bt.x0 - ww / 2), Math.round(y), ww, ww);
			ctx.drawImage(wheel, Math.round(bt.x1 - ww / 2), Math.round(y), ww, ww);
		}, this);
		/* The hopper across the top, with its hatch over the first belt. */
		var cap = this.img(set.hopper * 10 + 1), mid = this.img(set.hopper * 10 + 2), port = this.img(set.hopper * 10 + 3),
			end = this.img(set.hopper * 10 + 4), hh = (this.type === 'wood' ? 24 : 20) * s, hy = 30 * s;
		ctx.drawImage(cap, 0, hy, 10 * s, hh);
		for (var x = 10 * s; x < w - 10 * s; x += 10 * s) { ctx.drawImage(mid, x, hy, 10 * s, hh); }
		ctx.drawImage(end, w - 10 * s, hy, 10 * s, hh);
		ctx.drawImage(port, Math.round(this.hatch - 12 * s), hy, 24 * s, hh);
		for (i = 0; i < this.bits.length; i += 1) {
			ctx.fillStyle = this.bits[i].c;
			ctx.fillRect(this.bits[i].x, this.bits[i].y, s * 2, s * 1.5);
		}
		if (this.phase === 'ducks') { this.paradeStep(dt, ctx); }
	};

	/* ------------------------------------------------------------ ducks -- */

	Confetti.prototype.startParade = function () {
		this.parade = [];
		var from = this.dir > 0 ? -60 * this.s : this.w + 60 * this.s;
		for (var i = 0; i < this.ducks; i += 1) {
			this.parade.push({ x: from - this.dir * i * 56 * this.s, t: rand(0, 1) });
		}
		this.sign = 0;
	};

	Confetti.prototype.paradeStep = function (dt, ctx) {
		var s = this.s, w = this.w, g = this.heap.getContext('2d');
		this.sign += dt;
		/* The sign first, flashing, then the ducks. */
		if (Math.floor(this.sign * 2) % 2 === 0 || this.sign > 3) {
			ctx.drawImage(this.img(217), Math.round(w / 2 - 23 * s), Math.round(this.h * 0.45 - 23 * s), 46 * s, 46 * s);
		}
		if (this.sign < 2) { return; }
		var gone = 0;
		for (var i = 0; i < this.parade.length; i += 1) {
			var d = this.parade[i];
			d.x += this.dir * 55 * s * dt;
			d.t += dt;
			/* Each one pushes the heap on ahead of it. */
			var front = Math.floor(d.x + this.dir * 20 * s);
			if (front >= 0 && front < w) {
				var moved = this.pile[front], ahead = Math.max(0, Math.min(w - 1, front + this.dir * Math.round(2 * s)));
				this.pile[ahead] += moved;
				this.pile[front] = 0;
				g.clearRect(front, 0, 1, this.floor + 4 * s);
			}
			var frame = 210 + Math.floor(d.t * 10) % 7, img = this.img(frame);
			ctx.save();
			ctx.translate(Math.round(d.x), 0);
			/* The duck is drawn facing left. */
			if (this.dir > 0) { ctx.scale(-1, 1); }
			ctx.drawImage(img, -23 * s, Math.round(this.floor - 46 * s), 46 * s, 46 * s);
			ctx.restore();
			if ((this.dir > 0 && d.x > w + 40 * s) || (this.dir < 0 && d.x < -40 * s)) { gone += 1; }
		}
		if (gone === this.parade.length) {
			/* The heap goes out with the last duck; back to work. */
			this.pile.fill(0);
			g.clearRect(0, 0, w, this.h);
			this.phase = 'work';
			this.clock = 0;
		}
	};

	AfterDark.define('after-dark-confetti-factory', function (el) {
		var sim = new Confetti();
		sim.ducks = HOW_MANY[AfterDark.choice(el, 'ducks', DUCKS, 'default')];
		sim.shift = SECONDS[AfterDark.choice(el, 'workshift', SHIFTS, '1 min.')];
		sim.type = TYPES[AfterDark.choice(el, 'type', TYPES, 'metal')];
		window.addEventListener('keydown', function (e) {
			if (e.key === 'CapsLock') { sim.dir = -sim.dir; }
		});
		AfterDark.load(AfterDark.setting(el, 'art') || 'art/confetti').then(function (art) {
			sim.art = art;
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkConfetti = Confetti;
}());
