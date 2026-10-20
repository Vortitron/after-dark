/**
 * daredevil.js - Daredevil Dan, stunts and the ambulance.
 *
 * DAREDEVI.AD's own description:
 *
 *   "DAREDEVIL Dan - Watch Daredevil Dan perform death-defying acts of
 *    incredible bravery (or stupidity) as he jumps school buses, rings of
 *    fire and even a tank of hungry piranhas. This module was originally
 *    inspired by an After Dark Module Contest winner. 'Insurance Risk'
 *    determines the skill of Daredevil Dan."
 *
 * Insurance Risk is $500 to $100,000 (default $5,000); the higher the
 * premium, the more often it goes wrong. Its art, in all/art/daredevi/, is
 * the whole act: the bike (riding, in a wheelie, in pieces) and Dan on his
 * own (riding, arms out, flat on his back), a ramp, a school bus seen from
 * the front, flaming pillars, a rocket's exhaust, a tank's glass, piranhas
 * and a splash, an OW!, an ambulance with its light, and a monster truck.
 *
 * The show was checked against four minutes of the module running under Wine
 * at 1024x768 (2026-10-15); everything is drawn at its own size there:
 *
 *   - Each stunt is set up somewhere new: the ground anywhere from a third to
 *     two thirds of the way down a black screen, a ramp each side - the high
 *     ends facing in, about 28 px from the obstacle - and between them a row
 *     of buses side by side (53 px apiece), a piranha tank, or flaming pillars
 *     54 px apart.
 *   - "Warming up the motorcycle" (its string 128): Dan first rides the width
 *     of the screen, left to right, 63 px in front of the stage. Then he comes
 *     back from the right at ground level, up the right-hand ramp in a
 *     wheelie, over, onto the top of the left-hand ramp and down it and away.
 *     He rides at about 430 px a second.
 *   - Every jump made adds to the next one of its kind: one bus, two, ... up to
 *     nine and back to one; the tank gets wider; another pillar. A miss
 *     leaves it as it was.
 *   - A miss: he comes down short, the bike in pieces, Dan flat out (in the
 *     tank, a splash), an OW!, and the ambulance comes in from the left with
 *     its light going, stops for him and drives off to the right.
 *   - Now and then the monster truck comes in behind him on the approach and
 *     flattens everything; now and then, between stunts, he rides across and
 *     takes off up and to the right on a rocket.
 *
 * Still guessed: the odds of each stunt, of the truck and the rocket, the
 * crash odds at each premium, and how high the jump arcs.
 *
 *   <after-dark-daredevil-dan art="art/daredevi" risk="$5,000">
 */
(function () {
	'use strict';

	var RISKS = ['$500', '$1,000', '$5,000', '$10,000', '$100,000'];
	/* The chance a jump goes wrong, for one obstacle; bigger ones are worse. */
	var CRASH = [0.04, 0.08, 0.14, 0.22, 0.35];
	var SPEED = 430, BUS = 53, PILLAR = 54, RAMP = 70, LANE = 63;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function DaredevilDan() {
		this.crash = CRASH[2];
		this.art = null;
		this.buses = 1;
		this.tank = 4;
		this.pillars = 2;
	}

	DaredevilDan.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.s = Math.max(1, Math.round(Math.min(w, h) / 768));
		this.stage();
	};

	/** Set up the next stunt, somewhere new on the screen. */
	DaredevilDan.prototype.stage = function () {
		var w = this.w, s = this.s, r = Math.random();
		this.stunt = r < 0.6 ? 'buses' : r < 0.8 ? 'tank' : 'fire';
		this.ground = Math.round(rand(0.36, 0.64) * this.h);
		this.size = this.stunt === 'buses' ? this.buses * BUS * s :
			this.stunt === 'tank' ? this.tank * 50 * s : (this.pillars - 1) * PILLAR * s + 15 * s;
		this.x0 = Math.round(w / 2 - this.size / 2);
		this.x1 = this.x0 + this.size;
		this.rampL = this.x0 - 28 * s - RAMP * s;
		this.rampR = this.x1 + 28 * s;
		var n = this.stunt === 'buses' ? this.buses : this.stunt === 'tank' ? this.tank - 2 : this.pillars;
		this.fails = Math.random() < Math.min(0.8, this.crash * (0.6 + n * 0.25));
		this.truck = !this.fails && this.stunt === 'buses' && Math.random() < 0.15 ? { x: 0, on: false } : null;
		this.flat = false;
		this.dan = { mode: 'warm', x: -40 * s, t: 0 };
		this.wreck = null;
		this.ambulance = null;
		this.fish = [0, 1.3, 2.6];
	};

	DaredevilDan.prototype.seq = function (id) {
		return this.art.sequence(id);
	};

	/** Frame i of a sequence with its bottom middle at (x, y), optionally mirrored or flattened. */
	DaredevilDan.prototype.put = function (ctx, id, i, x, y, flip, squash) {
		var q = this.seq(id);
		if (!q) { return; }
		var f = q.frames[((i % q.count) + q.count) % q.count], k = this.s, fh = squash ? Math.max(2, 4 * k) : f.h * k;
		ctx.save();
		ctx.translate(Math.round(x), Math.round(y));
		if (flip) { ctx.scale(-1, 1); }
		ctx.drawImage(q.image, f.x, f.y, f.w, f.h, Math.round(-f.w * k / 2), -fh, f.w * k, fh);
		ctx.restore();
	};

	/** Dan on his bike, facing the way he is going (the art faces left). */
	DaredevilDan.prototype.rider = function (ctx, x, y, dir, wheelie) {
		var s = this.s, flip = dir > 0, side = flip ? -1 : 1;
		if (wheelie) {
			this.put(ctx, 1000, 1, x, y, flip);
			this.put(ctx, 1003, 0, x + side * 6 * s, y - 10 * s, flip);
		} else {
			this.put(ctx, 1000, 0, x, y, flip);
			this.put(ctx, 1003, Math.floor(this.t * 6) % 4, x + side * 6 * s, y - 4 * s, flip);
		}
	};

	DaredevilDan.prototype.scenery = function (ctx) {
		var s = this.s, g = this.ground, i, flat = this.flat;
		/* The ramps' high ends face in: the art's is on its left. */
		this.put(ctx, 1050, 0, this.rampL + RAMP * s / 2, g, true, flat);
		this.put(ctx, 1050, 0, this.rampR + RAMP * s / 2, g, false, flat);
		if (this.stunt === 'buses') {
			for (i = 0; i < this.buses; i += 1) { this.put(ctx, 1010, 0, this.x0 + (i + 0.5) * BUS * s, g, false, flat); }
		} else if (this.stunt === 'fire') {
			for (i = 0; i < this.pillars; i += 1) {
				var px = this.x0 + 7 * s + i * PILLAR * s;
				this.put(ctx, 1041, 0, px, g);
				this.put(ctx, 1040, Math.floor(this.t * 8) + i, px, g - 44 * s);
			}
		} else {
			/* The tank: its glass in strips, darker at the ends. */
			var glass = this.seq(1070);
			for (var x = this.x0; x < this.x1; x += 5 * s) {
				var u = (x - this.x0) / Math.max(1, this.size), k = Math.round((1 - Math.abs(u * 2 - 1)) * (glass.count - 1));
				var f = glass.frames[k];
				ctx.drawImage(glass.image, f.x, f.y, f.w, f.h, Math.round(x), g - 24 * s, 5 * s, 24 * s);
			}
			/* Piranhas jump out and fall back in with a splash. */
			for (i = 0; i < this.fish.length; i += 1) {
				var ph = (this.t + this.fish[i]) % 3.2;
				var fx = this.x0 + this.size * (0.2 + 0.3 * i);
				if (ph < 0.8) {
					this.put(ctx, 1060, Math.floor(ph * 6), fx, g - 24 * s - Math.sin(ph / 0.8 * Math.PI) * 50 * s, i % 2 === 1);
				} else if (ph < 1.1) {
					this.put(ctx, 1080, Math.floor((ph - 0.8) * 10), fx, g - 20 * s);
				}
			}
		}
	};

	DaredevilDan.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.art) { return; }
		ctx.imageSmoothingEnabled = false;
		var s = this.s, g = this.ground, d = this.dan, v = SPEED * s;
		this.t += dt;
		d.t += dt;
		if (d.mode === 'rocket') { this.rocket(ctx, dt); return; }
		this.scenery(ctx);
		if (d.mode === 'warm') {
			/* Warming up the motorcycle, in front of the stage. */
			d.x += v * dt;
			this.rider(ctx, d.x, g + LANE * s, 1);
			if (d.x > w + 40 * s) { d.mode = 'approach'; d.x = w + 40 * s; d.t = 0; }
		} else if (d.mode === 'approach') {
			d.x -= v * dt;
			var top = this.rampR + RAMP * s, onRamp = d.x < top;
			var y = onRamp ? g - (top - d.x) / (RAMP * s) * 35 * s : g;
			this.rider(ctx, d.x, y, -1, onRamp);
			if (d.x <= this.rampR) {
				d.mode = 'air';
				d.t = 0;
				d.from = d.x;
				d.to = this.fails ? this.x0 + this.size * rand(0.25, 0.75) : this.rampL + RAMP * s;
			}
		} else if (d.mode === 'air') {
			var span = d.from - d.to, k = Math.min(1, d.t * v / span);
			d.x = d.from - span * k;
			var lift = Math.sin(k * Math.PI) * (50 + span / s * 0.15) * s;
			var base = g - 35 * s + (this.fails ? k * 35 * s : 0);
			this.rider(ctx, d.x, base - lift, -1, true);
			if (k >= 1) {
				d.t = 0;
				if (this.fails) {
					d.mode = 'crash';
					this.wreck = { x: d.x, y: base };
				} else {
					d.mode = 'away';
					this.grow();
				}
			}
		} else if (d.mode === 'away') {
			/* Down the left ramp and off. */
			d.x -= v * dt;
			var down = this.rampL + RAMP * s - d.x;
			this.rider(ctx, d.x, down < RAMP * s ? g - 35 * s + down / (RAMP * s) * 35 * s : g, -1);
			if (d.x < -60 * s && (!this.truck || this.truck.x < -120 * s)) { this.next(); }
		} else if (d.mode === 'crash') {
			this.aftermath(ctx, dt);
		}
		if (this.truck) { this.monster(ctx, dt); }
	};

	/** The jump was made: the next of its kind is bigger. */
	DaredevilDan.prototype.grow = function () {
		if (this.stunt === 'buses') { this.buses = this.buses >= 9 ? 1 : this.buses + 1; }
		if (this.stunt === 'tank') { this.tank = this.tank >= 8 ? 4 : this.tank + 1; }
		if (this.stunt === 'fire') { this.pillars = this.pillars >= 5 ? 2 : this.pillars + 1; }
	};

	/** The next stunt - or first, sometimes, a ride on a rocket. */
	DaredevilDan.prototype.next = function () {
		if (Math.random() < 0.12) {
			this.dan = { mode: 'rocket', x: -40 * this.s, y: rand(0.4, 0.8) * this.h, t: 0, up: false };
			return;
		}
		this.stage();
	};

	/** The monster truck, in behind him on the approach, flattening the lot. */
	DaredevilDan.prototype.monster = function (ctx, dt) {
		var s = this.s, tr = this.truck, d = this.dan;
		if (!tr.on) {
			if (d.mode !== 'approach' || d.x > this.rampR + RAMP * s + 150 * s) { return; }
			tr.on = true;
			tr.x = this.w + 60 * s;
		}
		tr.x -= SPEED * 0.9 * s * dt;
		if (tr.x < this.rampR + RAMP * s) { this.flat = true; }
		this.put(ctx, 1100, 0, tr.x, this.ground - 40 * s);
		this.put(ctx, 1101, Math.floor(this.t * 12), tr.x - 26 * s, this.ground);
		this.put(ctx, 1101, Math.floor(this.t * 12), tr.x + 26 * s, this.ground);
	};

	DaredevilDan.prototype.aftermath = function (ctx, dt) {
		var s = this.s, g = this.ground, d = this.dan, wr = this.wreck;
		var top = this.stunt === 'tank' ? g - 24 * s : this.stunt === 'buses' ? g - 44 * s : g;
		var inTank = this.stunt === 'tank';
		if (inTank) {
			if (d.t < 0.6) { this.put(ctx, 1080, Math.floor(d.t * 5), wr.x, top + 4 * s); }
		} else {
			/* The bike in pieces, a wheel off it, Dan flat on his back. */
			this.put(ctx, 1000, 2 + Math.floor(d.t * 6) % 3, wr.x - 20 * s, top);
			this.put(ctx, 1001, Math.floor(d.t * 12), wr.x + 30 * s + Math.min(d.t, 1) * 40 * s, top);
			if (!this.ambulance || !this.ambulance.loaded) { this.put(ctx, 1003, 6, wr.x + 10 * s, top); }
			if (this.stunt === 'fire' && d.t < 3) { this.put(ctx, 1006, Math.floor(d.t * 8), wr.x + 10 * s, top - 4 * s); }
		}
		if (d.t > 0.6 && d.t < 4 && !(this.ambulance && this.ambulance.loaded)) {
			this.put(ctx, 1030, 0, wr.x + 10 * s, top - 22 * s);
		}
		/* Here comes the ambulance, from the left, and away to the right. */
		if (d.t > 2 && !this.ambulance) { this.ambulance = { x: -40 * s, wait: 0, loaded: false }; }
		var a = this.ambulance;
		if (a) {
			var stop = this.rampL - 40 * s;
			if (!a.loaded) {
				a.x = Math.min(stop, a.x + 300 * s * dt);
				if (a.x === stop) {
					a.wait += dt;
					if (a.wait > 1.5) { a.loaded = true; }
				}
			} else {
				a.x += 300 * s * dt;
			}
			this.put(ctx, 1020, Math.floor(d.t * 4), a.x, g, true);
			if (Math.floor(d.t * 6) % 2) { this.put(ctx, 1021, 0, a.x + 10 * s, g - 50 * s); }
			if (a.loaded && a.x > this.w + 60 * s) { this.next(); }
		}
	};

	/** Across on the bike, then up and away to the right on a rocket. */
	DaredevilDan.prototype.rocket = function (ctx, dt) {
		var s = this.s, d = this.dan, v = SPEED * s;
		if (!d.up) {
			d.x += v * dt;
			this.rider(ctx, d.x, d.y, 1);
			if (d.x > this.w / 2) { d.up = true; }
			return;
		}
		d.x += v * 0.75 * dt;
		d.y -= v * 0.75 * dt;
		this.put(ctx, 1005, Math.floor(d.t * 10), d.x - 24 * s, d.y + 12 * s);
		this.rider(ctx, d.x, d.y, 1, true);
		if (d.y < -60 * s || d.x > this.w + 60 * s) { this.stage(); }
	};

	AfterDark.define('after-dark-daredevil-dan', function (el) {
		var sim = new DaredevilDan();
		sim.crash = CRASH[AfterDark.choice(el, 'risk', RISKS, '$5,000')];
		sim.t = 0;
		AfterDark.load(AfterDark.setting(el, 'art') || 'art/daredevi').then(function (art) {
			sim.art = art;
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkDaredevilDan = DaredevilDan;
}());
