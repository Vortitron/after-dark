/**
 * time.js - Time Flies, the 1996 entry in After Dark's Clocks series.
 *
 * TIME.AD's own description:
 *
 *   "Here's the latest in our Clocks series. Enjoy and don't be late!"
 *   "Type" determines which type of clock displays.
 *   "Drift Speed" selects how quickly the image will drift around your
 *   screen. "Caps-lock" changes the type of clock.
 *   Programming by Mark Palange and Brock Wagenaar. Art by Tony Gascon of
 *   Digital Delirium and Stuart Gold of Shadow and Light.
 *
 * Its controls are Type (Liquid, Transformer, Random), Sounds (Ticks,
 * Chimes, Both, Neither - not used here, the site is silent) and Drift Speed
 * (Still, Very Slow, Slow, Moderate, Fast).
 *
 * Both faces are "map canvases" in the module: a script of steps, each a list
 * of frames at positions (TYPE_8100), with some steps labelled (TYPE_8102).
 * tools/README.md has the format; all/art/time/index.json carries the
 * decoded scripts under "clock". The art was decoded with tools/adrle.py:
 * the housing and several digits repeat rows with the 0x30 row copy that
 * adart.py does not know. Many frames only repaint what changed since the
 * one before, so the face is one canvas that is drawn on and never
 * cleared, as the engine's is. The art:
 *
 *   9000-9004  Liquid digits, 0 to 9 and round, each change a splash
 *   9005-9010  Liquid digits wobbling in place, 5 to 0, and the colon
 *   9100-9116  Transformer robot parts that fold into each digit
 *   9106-9107  the Transformer's seconds display
 *   9117       its housing      9118  the circuit-board plates behind
 *
 * What it does was read out of TIME.AD's code (0x410be8 and 0x411140):
 * every digit slot always has an animation playing, and every animation
 * lasts one second. When a digit changes its slot gets a transition (labels
 * 350-710: 0>1, 1>2 ... 9>0, 5>0 for tens, 2>1 and 1>0 for 12-hour hours),
 * otherwise, as each one finishes, the hold for its digit again (labels 50 +
 * 30 x digit), started at a random frame the first time. The colons wobble
 * the same way (label 20). The Transformer shows hours and minutes with its
 * robots and the seconds on its little display (labels 741-964). The clock
 * is a 12-hour one; its tables are indexed by hour mod 12. One thing in them
 * looks like a slip and is kept: when the hours' tens digit changes it plays
 * the opposite morph (1>0 for 10 o'clock), then settles on the right digit.
 *
 * Drift moves it one pixel diagonally at a time at 2^(slider/20 - 1)
 * pixels a second (0.001 x that per millisecond in the code): Very Slow 1,
 * Slow 2, Moderate 4, Fast 16. It turns round 50 pixels past an edge, and
 * every ten minutes jumps somewhere new. Caps Lock flips Liquid and
 * Transformer, as the description says.
 *
 * Filled in: on a screen narrower than the Transformer (511 pixels) the
 * clock is scaled down to fit, which the original never needed.
 *
 *   <after-dark-time-flies art="art/time" type="liquid" drift-speed="slow">
 */
(function () {
	'use strict';

	var TYPES = ['liquid', 'transformer', 'random'];
	var SOUNDS = ['ticks', 'chimes', 'both', 'neither'];
	var DRIFTS = ['still', 'very slow', 'slow', 'moderate', 'fast'];
	var PACE = [0, 1, 2, 4, 16];
	var MARGIN = 50;
	var JUMP = 600000;

	function rand(n) {
		return Math.floor(Math.random() * n);
	}

	function TimeFlies() {
		this.art = null;
		this.clock = null;
		this.kind = 'liquid';
		this.pace = 2;
		this.now = 0;
		this.acc = 0;
		this.dx = 1;
		this.dy = 1;
		this.x = null;
	}

	TimeFlies.prototype.face = function () {
		return this.clock[this.kind];
	};

	TimeFlies.prototype.reset = function () {
		this.slots = [];
		for (var i = 0; i < 8; i += 1) {
			this.slots.push({ id: 0, start: 0, offset: 0, last: -1, done: true });
		}
		this.prev = null;
		this.canvas = null;
		this.place();
	};

	TimeFlies.prototype.place = function () {
		var f = this.face();
		if (!this.w) { return; }
		this.x = rand(Math.max(1, this.w - f.w + 2 * MARGIN)) - MARGIN;
		this.y = rand(Math.max(1, this.h - f.h + 2 * MARGIN)) - MARGIN;
		this.jumpAt = this.now + JUMP;
	};

	TimeFlies.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		if (this.clock) { this.place(); }
	};

	/* 0x41103c: give a slot an animation. */
	TimeFlies.prototype.set = function (slot, id, transition) {
		var a = this.face().anims[id];
		var s = this.slots[slot];
		if (!a) { return; }
		s.id = id;
		s.start = this.now;
		s.done = false;
		if (transition || slot === 7) {
			s.offset = 0;
		} else if (s.last !== id) {
			s.offset = rand(a.frames.length);
		}
		s.last = id;
	};

	/* 0x410be8: what each slot should be doing at this time. */
	TimeFlies.prototype.update = function (d) {
		var t = this.clock.tables;
		var lcd = this.kind === 'transformer';
		var h = d.getHours() % 12 || 12, m = d.getMinutes(), s = d.getSeconds();
		var now = [Math.floor(h / 10), h % 10, -1, Math.floor(m / 10), m % 10, -1, Math.floor(s / 10), s % 10];
		var was = this.prev || now;
		var self = this;
		function digit(slot, change, hold) {
			if (now[slot] !== was[slot]) {
				self.set(slot, change, true);
			} else if (self.slots[slot].done) {
				self.set(slot, hold, false);
			}
		}
		digit(7, (lcd ? t.lcdUnits : t.units)[now[7]], (lcd ? t.lcdHold : t.hold)[now[7]]);
		digit(6, (lcd ? t.lcdTens : t.tens)[now[6]], (lcd ? t.lcdHold : t.hold)[now[6]]);
		digit(4, t.units[now[4]], t.hold[now[4]]);
		digit(3, t.tens[now[3]], t.hold[now[3]]);
		digit(1, t.hourUnits[h % 12], t.hold[now[1]]);
		digit(0, t.hourTens[now[0]], t.hold[now[0]]);
		[2, 5].forEach(function (slot) {
			if (self.slots[slot].done) { self.set(slot, t.colon, false); }
		});
		this.prev = now;
	};

	/* 0x411140: which frame, the animation spread over one second. */
	TimeFlies.prototype.frame = function (slot) {
		var s = this.slots[slot];
		var a = this.face().anims[s.id];
		if (!a) { return null; }
		var n = a.frames.length;
		var i = Math.floor((this.now - s.start) / Math.floor(1000 / n));
		if (i >= n) {
			i = n - 1;
			s.done = true;
		}
		return { anim: a, index: (i + s.offset) % n };
	};

	TimeFlies.prototype.item = function (g, it, x, y) {
		var seq = this.art.sequence(it[0]);
		if (!seq) { return; }
		var f = seq.frames[it[1]];
		g.drawImage(seq.image, f.x, f.y, f.w, f.h, x + it[2], y + it[3], f.w, f.h);
	};

	/* The face is one canvas that is drawn on and never cleared, as the
	   engine's is: many frames only repaint what changed since the one
	   before, so each slot draws over what it last left there. */
	TimeFlies.prototype.paint = function () {
		var f = this.face();
		var self = this;
		if (!this.canvas || this.canvasKind !== this.kind) {
			this.canvas = document.createElement('canvas');
			this.canvas.width = f.w;
			this.canvas.height = f.h;
			this.canvasKind = this.kind;
			this.g = this.canvas.getContext('2d');
			this.g.fillStyle = '#000';
			this.g.fillRect(0, 0, f.w, f.h);
			f.base.concat(f.layout).forEach(function (it) { self.item(self.g, it, 0, 0); });
			this.shown = [];
		}
		var g = this.g, changed = false;
		for (var slot = 0; slot < 8; slot += 1) {
			var at = f.slots[slot];
			if (!at) { continue; }
			var fr = this.frame(slot);
			if (!fr) { continue; }
			var key = this.slots[slot].id + ':' + fr.index;
			if (this.shown[slot] === key) { continue; }
			this.shown[slot] = key;
			changed = true;
			if (fr.anim.bg) {
				fr.anim.bg.forEach(function (it) { self.item(g, it, at[0], at[1]); });
			}
			fr.anim.frames[fr.index].forEach(function (it) { self.item(g, it, at[0], at[1]); });
		}
		/* The housing stays in front of the robots. */
		if (changed) {
			f.layout.forEach(function (it) { if (it[0] === 9117) { self.item(g, it, 0, 0); } });
		}
	};

TimeFlies.prototype.drift = function (dt, W, H, fw, fh) {
		if (this.now > this.jumpAt) { this.place(); }
		if (!this.pace) { return; }
		this.acc += this.pace * dt;
		var steps = Math.floor(this.acc);
		this.acc -= steps;
		while (steps > 0) {
			steps -= 1;
			if (this.dx > 0 && this.x + fw + 1 - MARGIN > W) { this.dx = -1; }
			if (this.dx < 0 && this.x - 1 + MARGIN < 0) { this.dx = 1; }
			if (this.dy > 0 && this.y + fh + 1 - MARGIN > H) { this.dy = -1; }
			if (this.dy < 0 && this.y - 1 + MARGIN < 0) { this.dy = 1; }
			this.x += this.dx;
			this.y += this.dy;
		}
	};

	TimeFlies.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.art || !this.clock) { return; }
		this.now += dt * 1000;
		var f = this.face();
		var scale = Math.min(1, (w - 8) / f.w);
		var W = w / scale, H = h / scale;
		if (this.x === null) { this.w = W; this.h = H; this.place(); }
		this.drift(dt, W, H, f.w, f.h);
		this.update(new Date());

		this.paint();
		ctx.save();
		ctx.scale(scale, scale);
		ctx.imageSmoothingEnabled = scale < 1;
		ctx.drawImage(this.canvas, Math.round(this.x), Math.round(this.y));
		ctx.restore();
	};

	AfterDark.define('after-dark-time-flies', function (el) {
		var t = new TimeFlies();
		var type = AfterDark.choice(el, 'type', TYPES, 'random');
		t.kind = type === 2 ? (Math.random() < 0.5 ? 'liquid' : 'transformer') : TYPES[type];
		t.sounds = SOUNDS[AfterDark.choice(el, 'sounds', SOUNDS, 'both')];
		t.pace = PACE[AfterDark.choice(el, 'drift-speed', DRIFTS, 'slow')];
		var base = AfterDark.setting(el, 'art') || 'art/time';
		Promise.all([AfterDark.load(base), AfterDark.data(base)]).then(function (r) {
			t.art = r[0];
			t.clock = r[1].clock;
			t.reset();
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		window.addEventListener('keydown', function (e) {
			if (e.key !== 'CapsLock' || !t.clock) { return; }
			t.kind = t.kind === 'liquid' ? 'transformer' : 'liquid';
			t.reset();
		});
		return t;
	});

	window.AfterDarkTimeFlies = TimeFlies;
}());
