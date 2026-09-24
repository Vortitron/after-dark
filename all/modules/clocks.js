/**
 * clocks.js - Clocks 3.0, the time, drifting about.
 *
 * CLOCKS3.AD's own description:
 *
 *   "CLOCKS 3.0 - Tick, tock, tick, tock... You get the idea.
 *    'Type' chooses the style of clock displayed.
 *    'Drift Speed' controls how fast the clock moves around.
 *    'Sounds' chooses how often sounds are played: a tick per second; a chime
 *    per hour; both; or neither.
 *    'Mutation Rate' adjusts how often the Mutating Analog clock changes
 *    background."
 *
 * Type is Melting Digital, Classic, Modern, Art Deco or Mutating, and the
 * faces are the module's own, in all/art/clocks/: a wooden Roman-numeral
 * clock, a malachite Art Deco one, a slate one, and for Mutating a ring of
 * numerals laid over a bagel, a light bulb, a pepper, a tortilla chip, a
 * cookie, a daisy, a kiwi, a leaf, a bow of pasta or a peanut. The hands are
 * drawn. Melting Digital is 75 frames of digits: the ten of them and then
 * each one melting into the next. Sounds are left out, as all sound is here.
 *
 *   <after-dark-clocks art="art/clocks" type="classic" drift-speed="slow" mutation-rate="10 secs.">
 */
(function () {
	'use strict';

	var TYPES = ['melting digital', 'classic', 'modern', 'art deco', 'mutating'];
	var DRIFTS = ['glacial', 'slow', 'medium', 'fast'];
	var DRIFT = [6, 16, 36, 80];
	var RATES = ['1 min.', '30 secs.', '15 secs.', '10 secs.', '5 secs.', '1 sec.', 'genx'];
	var EVERY = [60, 30, 15, 10, 5, 1, 0.25];
	/* Where each face's hands turn, and how long they may be. */
	var FACES = {
		classic: { cx: 100, cy: 101, r: 58, ink: '#141008', second: '#8a1010' },
		'art deco': { name: 'deco', cx: 96, cy: 88, r: 29, ink: '#101010', second: '#b08a20' },
		modern: { cx: 91.5, cy: 91.5, r: 62, ink: '#f4f4f4', second: '#ff8a20' },
		mutating: { cx: 71.5, cy: 72, r: 52, ink: '#000000', edge: '#ffffff', second: '#d01010' }
	};
	var DIGIT_W = 47;
	var DIGIT_H = 70;
	var MELT = 0.45;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	/** The frames of the digit strip that take a digit from a to b (' ' is blank). */
	function melt(a, b) {
		var col = -1;
		if (a === ' ' && b === '1') { col = 12; } else if (a === '1' && b === ' ') { col = 13; } else if (a === '5' && b === '0') { col = 14; } else if (a !== ' ' && b !== ' ' && (Number(a) + 1) % 10 === Number(b)) {
			col = a === '9' ? 2 : Number(a) + 3;
		}
		if (col < 0) { return null; }
		return [col * 5, col * 5 + 1, col * 5 + 2, col * 5 + 3, col * 5 + 4];
	}

	function Clocks() {
		this.type = 'classic';
		this.drift = DRIFT[1];
		this.every = EVERY[3];
		this.art = null;
	}

	Clocks.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.k = Math.max(1, Math.round(Math.min(w, h) / 480));
		var a = rand(0, Math.PI * 2);
		this.vx = Math.cos(a);
		this.vy = Math.sin(a);
		this.x = null;
		this.shownText = null;
		this.melts = [];
		this.nextMutation = 0;
	};

	Clocks.prototype.size = function () {
		var k = this.k;
		if (this.type === 'melting digital') {
			return { w: (6 * DIGIT_W + 2 * 20) * k, h: DIGIT_H * k };
		}
		var face = this.faceImage();
		return face ? { w: face.width * k, h: face.height * k } : { w: 200 * k, h: 200 * k };
	};

	Clocks.prototype.faceImage = function () {
		if (!this.art) { return null; }
		if (this.type === 'mutating') { return this.art.bitmap(this.object || 'object5000'); }
		return this.art.bitmap(FACES[this.type].name || this.type);
	};

	Clocks.prototype.hand = function (ctx, cx, cy, angle, length, width, ink, edge) {
		var dx = Math.sin(angle), dy = -Math.cos(angle);
		ctx.beginPath();
		ctx.moveTo(cx - dx * length * 0.15 - dy * width, cy - dy * length * 0.15 + dx * width);
		ctx.lineTo(cx + dx * length, cy + dy * length);
		ctx.lineTo(cx - dx * length * 0.15 + dy * width, cy - dy * length * 0.15 - dx * width);
		ctx.closePath();
		if (edge) {
			ctx.lineWidth = Math.max(1, width * 0.6);
			ctx.strokeStyle = edge;
			ctx.stroke();
		}
		ctx.fillStyle = ink;
		ctx.fill();
	};

	Clocks.prototype.analog = function (ctx, x, y, now) {
		var k = this.k, face = this.faceImage(), spec = FACES[this.type];
		if (!face) { return; }
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(face.image, Math.round(x), Math.round(y), face.width * k, face.height * k);
		var cx = x + spec.cx * k, cy = y + spec.cy * k, r = spec.r * k;
		if (this.type === 'mutating') {
			/* The numerals ring goes over the middle of whatever it is today. */
			var ring = this.art.bitmap('numerals');
			cx = x + face.width * k / 2;
			cy = y + face.height * k / 2;
			ctx.drawImage(ring.image, Math.round(cx - ring.width * k / 2), Math.round(cy - ring.height * k / 2),
				ring.width * k, ring.height * k);
		}
		var s = now.getSeconds() + now.getMilliseconds() / 1000;
		var m = now.getMinutes() + s / 60, hr = (now.getHours() % 12) + m / 60;
		var TAU = Math.PI * 2;
		this.hand(ctx, cx, cy, hr / 12 * TAU, r * 0.55, Math.max(1.5, r * 0.07), spec.ink, spec.edge);
		this.hand(ctx, cx, cy, m / 60 * TAU, r * 0.85, Math.max(1.2, r * 0.05), spec.ink, spec.edge);
		/* The second hand ticks, as the module's own tick did. */
		var tick = Math.floor(s) / 60 * TAU;
		ctx.strokeStyle = spec.second;
		ctx.lineWidth = Math.max(1, k);
		ctx.beginPath();
		ctx.moveTo(cx - Math.sin(tick) * r * 0.2, cy + Math.cos(tick) * r * 0.2);
		ctx.lineTo(cx + Math.sin(tick) * r * 0.92, cy - Math.cos(tick) * r * 0.92);
		ctx.stroke();
		ctx.fillStyle = spec.ink;
		ctx.beginPath();
		ctx.arc(cx, cy, Math.max(2, r * 0.05), 0, TAU);
		ctx.fill();
	};

	Clocks.prototype.digital = function (ctx, x, y, now, dt) {
		var k = this.k, strip = this.art.bitmap('digits').image;
		var hr = now.getHours() % 12 || 12;
		var text = (hr < 10 ? ' ' + hr : String(hr)) + ('0' + now.getMinutes()).slice(-2) + ('0' + now.getSeconds()).slice(-2);
		if (this.shownText !== text) {
			var old = this.shownText;
			for (var i = 0; i < 6; i += 1) {
				if (old && old.charAt(i) !== text.charAt(i)) {
					this.melts[i] = { frames: melt(old.charAt(i), text.charAt(i)), t: 0 };
				}
			}
			this.shownText = text;
		}
		ctx.imageSmoothingEnabled = false;
		var px = x;
		for (var d = 0; d < 6; d += 1) {
			var ch = text.charAt(d), frame = ch === ' ' ? -1 : Number(ch), mt = this.melts[d];
			if (mt && mt.frames) {
				mt.t += dt;
				if (mt.t < MELT) { frame = mt.frames[Math.floor(mt.t / MELT * 5)]; } else { this.melts[d] = null; }
			}
			if (frame >= 0) {
				ctx.drawImage(strip, 0, frame * DIGIT_H, DIGIT_W, DIGIT_H, Math.round(px), Math.round(y), DIGIT_W * k, DIGIT_H * k);
			}
			px += DIGIT_W * k;
			if (d === 1 || d === 3) {
				ctx.fillStyle = '#fff';
				ctx.fillRect(px + 6 * k, y + DIGIT_H * k * 0.3, 7 * k, 7 * k);
				ctx.fillRect(px + 6 * k, y + DIGIT_H * k * 0.62, 7 * k, 7 * k);
				px += 20 * k;
			}
		}
	};

	Clocks.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.art) { return; }
		if (this.type === 'mutating') {
			this.nextMutation -= dt;
			if (this.nextMutation <= 0) {
				this.object = 'object' + (5000 + 10 * Math.floor(Math.random() * 10));
				this.nextMutation = this.every;
			}
		}
		var size = this.size();
		if (this.x === null) {
			this.x = rand(0, Math.max(0, w - size.w));
			this.y = rand(0, Math.max(0, h - size.h));
		}
		var speed = this.drift * this.k;
		this.x += this.vx * speed * dt;
		this.y += this.vy * speed * dt;
		if (this.x < 0) { this.x = 0; this.vx = Math.abs(this.vx); }
		if (this.y < 0) { this.y = 0; this.vy = Math.abs(this.vy); }
		if (this.x + size.w > w) { this.x = Math.max(0, w - size.w); this.vx = -Math.abs(this.vx); }
		if (this.y + size.h > h) { this.y = Math.max(0, h - size.h); this.vy = -Math.abs(this.vy); }
		var now = new Date();
		if (this.type === 'melting digital') {
			this.digital(ctx, this.x, this.y, now, dt);
		} else {
			this.analog(ctx, this.x, this.y, now);
		}
	};

	AfterDark.define('after-dark-clocks', function (el) {
		var sim = new Clocks();
		sim.type = TYPES[AfterDark.choice(el, 'type', TYPES, 'classic')];
		sim.drift = DRIFT[AfterDark.choice(el, 'drift-speed', DRIFTS, 'slow')];
		sim.every = EVERY[AfterDark.choice(el, 'mutation-rate', RATES, '10 secs.')];
		AfterDark.load(AfterDark.setting(el, 'art') || 'art/clocks').then(function (art) {
			sim.art = art;
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkClocks = Clocks;
	Clocks.melt = melt;
}());
