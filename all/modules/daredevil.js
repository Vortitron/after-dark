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
 * Insurance Risk is $500 to $100,000; the higher the premium, the more
 * often it goes wrong. Its art, in all/art/daredevi/, is the whole act: Dan
 * on his bike and the bike in pieces, a wheel rolling away, Dan on foot -
 * waving, arms out, flat on his back - a ramp, a school bus that tips over,
 * posts and flames, fireballs, a tank's glass, piranhas and a splash, an OW!
 * and an ambulance with its light going. The show itself is staged here: a
 * ramp each side, the stunt between, a run-up and a jump. Land it and he
 * takes a bow; don't and the ambulance comes.
 *
 *   <after-dark-daredevil-dan art="art/daredevi" risk="$5,000">
 */
(function () {
	'use strict';

	var RISKS = ['$500', '$1,000', '$5,000', '$10,000', '$100,000'];
	var CRASH = [0.12, 0.22, 0.35, 0.5, 0.7];
	var STUNTS = ['buses', 'fire', 'piranhas'];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function DaredevilDan() {
		this.crash = CRASH[2];
		this.art = null;
	}

	DaredevilDan.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.s = Math.max(1, Math.min(w, h) / 380);
		this.stage();
	};

	/** Set up the next stunt. */
	DaredevilDan.prototype.stage = function () {
		var w = this.w, s = this.s;
		this.stunt = STUNTS[Math.floor(Math.random() * 3)];
		this.ground = this.h * 0.82;
		var ramp = 70 * s;
		if (this.stunt === 'buses') {
			this.buses = Math.max(2, Math.min(6, Math.floor((w - 2 * ramp - 120 * s) / (132 * s * 0.62))));
			this.gap = this.buses * 132 * s * 0.62;
		} else {
			this.gap = this.stunt === 'fire' ? 120 * s : 170 * s;
		}
		this.rampL = w / 2 - this.gap / 2 - ramp;
		this.rampR = w / 2 + this.gap / 2;
		this.dan = { x: -60 * s, y: this.ground, mode: 'ride', t: 0 };
		this.wreck = null;
		this.ambulance = null;
		this.fails = Math.random() < this.crash;
		this.t = 0;
		this.tipped = 0;
	};

	DaredevilDan.prototype.seq = function (id) {
		return this.art.sequence(id);
	};

	/** Draw frame i of a sequence standing on (x, y), scaled, optionally mirrored. */
	DaredevilDan.prototype.put = function (ctx, id, i, x, y, flip, scale) {
		var q = this.seq(id);
		if (!q) { return; }
		var f = q.frames[((i % q.count) + q.count) % q.count], k = this.s * (scale || 1);
		ctx.save();
		ctx.translate(Math.round(x), Math.round(y));
		if (flip) { ctx.scale(-1, 1); }
		ctx.drawImage(q.image, f.x, f.y, f.w, f.h, Math.round(-f.w * k / 2), Math.round(-f.h * k), f.w * k, f.h * k);
		ctx.restore();
	};

	DaredevilDan.prototype.scenery = function (ctx, t) {
		var s = this.s, g = this.ground, i;
		/* Ramps: up on the left, down on the right. The art's high end is on its left. */
		this.put(ctx, 1050, 0, this.rampL + 35 * s, g, true);
		this.put(ctx, 1050, 0, this.rampR + 35 * s, g, false);
		if (this.stunt === 'buses') {
			var bw = 132 * s * 0.62, x0 = this.w / 2 - this.gap / 2 + bw / 2;
			for (i = 0; i < this.buses; i += 1) {
				var tip = i === Math.floor(this.buses / 2) ? this.tipped : 0;
				this.put(ctx, 1090, tip, x0 + i * bw, g, false, 0.62);
			}
		} else if (this.stunt === 'fire') {
			/* The ring: flames round a hoop on a post. */
			var cx = this.w / 2, cy = g - 95 * s, r = 34 * s;
			this.put(ctx, 1041, 0, cx, g, false);
			for (i = 0; i < 14; i += 1) {
				var a = i / 14 * Math.PI * 2;
				this.put(ctx, 1006, Math.floor(t * 8) + i, cx + Math.cos(a) * r, cy + Math.sin(a) * r + 19 * s * 0.5, false, 0.5);
			}
		} else {
			/* The tank: glass sides, water, and what lives in it. */
			var tx = this.w / 2 - this.gap / 2 + 10 * s, tw = this.gap - 20 * s, top = g - 60 * s;
			ctx.fillStyle = '#1a3aa8';
			ctx.fillRect(tx, top + 10 * s, tw, g - top - 10 * s);
			var glass = this.seq(1070);
			for (var x = tx; x < tx + tw; x += 5 * s) {
				var f = glass.frames[Math.min(glass.count - 1, Math.floor((x - tx) / tw * glass.count * 2) % glass.count)];
				ctx.globalAlpha = 0.25;
				ctx.drawImage(glass.image, f.x, f.y, f.w, f.h, x, top, 5 * s, g - top);
				ctx.globalAlpha = 1;
			}
			for (i = 0; i < 3; i += 1) {
				var ph = (t * 0.6 + i / 3) % 1, jump = Math.sin(ph * Math.PI) * 40 * s;
				this.put(ctx, 1060, Math.floor(t * 6) + i, tx + tw * (0.25 + i * 0.25), top + 30 * s - jump, i % 2 === 1);
			}
		}
	};

	DaredevilDan.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.art) { return; }
		var s = this.s, g = this.ground, d = this.dan;
		this.t += dt;
		ctx.imageSmoothingEnabled = false;
		ctx.fillStyle = '#2a2018';
		ctx.fillRect(0, g, w, h - g);
		this.scenery(ctx, this.t);
		d.t += dt;
		var speed = 220 * s;
		if (d.mode === 'ride') {
			d.x += speed * dt;
			var onRamp = d.x > this.rampL;
			this.put(ctx, 1000, onRamp ? 1 : 0, d.x, onRamp ? g - (d.x - this.rampL) * 0.5 : g, false);
			if (d.x > this.rampL + 70 * s) {
				d.mode = 'air';
				d.t = 0;
				d.x0 = d.x;
				/* Where he comes down: across, or short. */
				d.land = this.fails ? this.w / 2 + rand(-this.gap * 0.25, this.gap * 0.15) : this.rampR + 20 * s;
			}
		} else if (d.mode === 'air') {
			var span = d.land - d.x0, k = Math.min(1, d.t / (span / speed));
			d.x = d.x0 + span * k;
			var arc = Math.sin(k * Math.PI) * (80 + this.gap * 0.25 / s) * s;
			d.y = g - 35 * s - arc + (this.fails ? k * 20 * s : 0);
			this.put(ctx, 1000, 1, d.x, d.y, false);
			if (this.stunt === 'fire' && this.fails) { this.put(ctx, 1005, Math.floor(d.t * 10), d.x - 20 * s, d.y, false); }
			if (k >= 1) {
				d.t = 0;
				if (this.fails) {
					d.mode = 'crash';
					if (this.stunt === 'buses') { this.tipped = 1; }
					this.wreck = { bike: d.x, wheel: d.x, parts: d.x, lift: 0 };
				} else {
					d.mode = 'landed';
				}
			}
		} else if (d.mode === 'landed') {
			/* Down the far ramp and to a stop, then the bow. */
			if (d.t < 0.8) {
				d.x += speed * 0.6 * dt;
				this.put(ctx, 1000, 0, d.x, Math.min(g, g - 35 * s + (d.x - this.rampR) * 0.5), false);
			} else if (d.t < 4) {
				this.put(ctx, 1000, 0, d.x + 25 * s, g, false);
				this.put(ctx, 1003, d.t < 1.4 ? 3 : 4 + Math.floor(d.t * 2) % 2, d.x - 10 * s, g, false);
			} else {
				this.stage();
			}
		} else if (d.mode === 'crash') {
			this.aftermath(ctx, dt);
		}
	};

	DaredevilDan.prototype.aftermath = function (ctx, dt) {
		var s = this.s, g = this.ground, d = this.dan, wr = this.wreck;
		if (this.stunt === 'buses' && d.t > 0.3) { this.tipped = 2; }
		/* The bike slides, a wheel rolls off, bits bounce. */
		wr.bike += Math.max(0, 120 - d.t * 150) * s * dt;
		wr.wheel += 110 * s * dt;
		wr.parts += 70 * s * dt;
		var bounce = Math.abs(Math.sin(d.t * 7)) * Math.max(0, 1 - d.t / 2) * 30 * s;
		var landed = this.stunt === 'piranhas' ? g - 12 * s : g;
		if (this.stunt === 'piranhas' && d.t < 1.2) { this.put(ctx, 1080, Math.floor(d.t * 5), d.x, g - 50 * s, false); }
		this.put(ctx, 1000, 2 + Math.floor(d.t * 6) % 3, wr.bike, g, false);
		this.put(ctx, 1001, Math.floor(d.t * 12), wr.wheel, g - bounce, false);
		this.put(ctx, 1002, Math.floor(d.t * 8), wr.parts, g - bounce * 0.6, false);
		/* Dan, flat out - and on fire, if it was the ring. */
		var danX = this.stunt === 'piranhas' ? this.rampR + 60 * s : d.x - 20 * s;
		if (!this.ambulance || !this.ambulance.loaded) {
			this.put(ctx, 1003, 6, danX, landed, false);
			if (this.stunt === 'fire' && d.t < 3) { this.put(ctx, 1006, Math.floor(d.t * 8), danX, landed - 6 * s, false, 0.6); }
			if (d.t > 0.6 && d.t < 3) { this.put(ctx, 1030, Math.floor(d.t * 3), danX + 20 * s, landed - 30 * s, false); }
		}
		/* Here comes the ambulance. */
		if (d.t > 2.5 && !this.ambulance) { this.ambulance = { x: this.w + 70 * s, stop: danX + 40 * s, wait: 0, loaded: false }; }
		var a = this.ambulance;
		if (a) {
			if (!a.loaded) {
				a.x = Math.max(a.stop, a.x - 160 * s * dt);
				if (a.x === a.stop) {
					a.wait += dt;
					if (a.wait > 1) { a.loaded = true; }
				}
			} else {
				a.x += 180 * s * dt;
			}
			this.put(ctx, 1020, Math.floor(d.t * 4), a.x, g, true);
			if (Math.floor(d.t * 6) % 2) { this.put(ctx, 1021, 0, a.x, g - 50 * s, false); }
			if (a.loaded && a.x > this.w + 80 * s) { this.stage(); }
		}
	};

	AfterDark.define('after-dark-daredevil-dan', function (el) {
		var sim = new DaredevilDan();
		sim.crash = CRASH[AfterDark.choice(el, 'risk', RISKS, '$5,000')];
		AfterDark.load(AfterDark.setting(el, 'art') || 'art/daredevi').then(function (art) {
			sim.art = art;
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkDaredevilDan = DaredevilDan;
}());
