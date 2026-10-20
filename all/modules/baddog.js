/**
 * baddog.js - Bad Dog!, the 1994 one (BADDOG3.AD, After Dark 3.0).
 *
 * Its own description:
 *
 *   "Watch out! There's a precocious puppy loose on your desktop. Don't
 *    worry, he's had all his shots and he doesn't really trash anything on
 *    your computer. Or at least, we don't think he does...
 *    "Discipline" enables you to determine the type of dog owner you want
 *    to be."
 *   Programming by Paul Meyer. Art and Dog concept by Laurence Arcadias.
 *
 * Its controls: Discipline (Lax, Easygoing, Moderate, Strict, Dictatorial),
 * FREEZE MOTION, Shuffle behaviors, and Debug (All, Control Panel, Window,
 * Trash, Inside Desk, Icons, Other Desktop, Non-desktop, Black Screen) -
 * the last being how its programmer made one kind of mischief happen on
 * demand.
 *
 * The art, in all/art/baddog3/ (RLEP/RDAT - the same RLID container as the
 * 4.0 modules, which tools/adart.py reads as it is):
 *   1000-1003  the dog: sniffing, running, sitting, scratching, standing up,
 *              shaking, digging, diving in
 *   2000-2003  his head, peeking up out of a hole, with and without a cable
 *              in his teeth; 2200 his eyes, blinking in the dark
 *   3000       a heap of rubbish and a puff of dust
 *   3001       dirt flying, dirt piling up, the hole he claws in the screen,
 *              a chip and a cable from inside the computer
 *   3002       a folder, bitten and shredded
 *   4000       Boris the cat; 5000 the After Dark 3.0 control panel switching
 *              to Boris; 5001 the After Dark and Program Manager icons;
 *              6000 the waste basket, upright and knocked over
 *
 * This module has no choreography resource; all of it was code. The code's
 * own names say what it does - PerformCables, PerformAppearInHole,
 * PerformPeekaboo, PerformBiteFolder, DecideRunAway, ScramblePalette - and
 * the module was recorded running under Wine, on a bare (black) screen, for
 * ninety seconds and for each Debug setting. What is here is what those
 * recordings show, at their pace (about fourteen frames a second, running at
 * nine or ten pixels a frame):
 *   - he runs on, stops, shakes himself, sniffs about and runs off;
 *   - he digs, and the dirt piles up behind him and stays;
 *   - he stands up and claws a dark hole in the screen, dives into it, and
 *     comes up again with a cable in his teeth; the hole stays, and later his
 *     eyes blink out of it;
 *   - he noses the waste basket on from the edge of the screen, and later
 *     knocks it over.
 * Filled in: the order (random, or in turn with Shuffle behaviors off), how
 * Discipline weighs mischief against good behaviour and how much mess he is
 * allowed to leave (the stricter, the less), and the knocking over of the
 * basket, which the recordings never reached. Not reconstructed: the control
 * panel and Boris, the windows and the icons, which work on the real
 * desktop's windows and Program Manager and so never ran under Wine.
 * The desktop is black, as in the recordings: the module drew on whatever
 * was on the screen.
 *
 *   <after-dark-bad-dog art="art/baddog3" discipline="moderate" shuffle-behaviors></after-dark-bad-dog>
 */
(function () {
	'use strict';

	var FPS = 14;
	var RUN = 9.5;                  // pixels a frame at a run
	var DISCIPLINE = ['lax', 'easygoing', 'moderate', 'strict', 'dictatorial'];
	var MISCHIEF = [0.8, 0.65, 0.5, 0.35, 0.2];
	var MESS = [14, 10, 7, 4, 2];
	var DEBUG = ['all', 'control panel', 'window', 'trash', 'inside desk', 'icons',
	             'other desktop', 'non-desktop', 'black screen'];
	/* What each Debug choice narrows the dog down to. */
	var CATEGORY = { 3: 'trash', 4: 'inside', 6: 'dig', 7: 'good', 8: 'inside' };

	function rand(a, b) { return a + Math.random() * (b - a); }
	function irand(a, b) { return Math.floor(rand(a, b + 1)); }

	function BadDog() {
		this.art = null;
		this.mischief = MISCHIEF[2];
		this.mess = MESS[2];
		this.freeze = false;
		this.shuffle = true;
		this.only = null;
		this.marks = [];            // holes and dirt, drawn under him
		this.basket = null;
		this.frames = [];
		this.f = 0;
		this.acc = 0;
		this.turn = 0;
		this.inside = null;
		this.rest = 1;
	}

	BadDog.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.marks = [];
		this.basket = null;
		this.frames = [];
		this.inside = null;
		this.rest = 1;
	};

	/* ------------------------------------------------------------ building acts */

	/** One frame of an act: sprites to draw, back to front. */
	function frame(list) { return list; }
	function spr(seq, i, x, y, flip) { return [seq, i, x, y, !!flip]; }

	/** Run from x0 to x1 along y; the dog faces the way he runs. */
	BadDog.prototype.run = function (out, x0, x1, y, extra) {
		var dir = x1 >= x0 ? 1 : -1;
		var n = Math.max(1, Math.round(Math.abs(x1 - x0) / RUN));
		for (var k = 0; k <= n; k += 1) {
			var x = this.freeze ? x0 : x0 + (x1 - x0) * k / n;
			var f = [spr(1001, 14 + (k % 8), x, y, dir < 0)];
			out.push(frame(extra ? extra.concat(f) : f));
		}
		return dir;
	};

	BadDog.prototype.hold = function (out, seq, frames, x, y, flip, times, under) {
		for (var t = 0; t < times; t += 1) {
			for (var i = 0; i < frames.length; i += 1) {
				var f = [spr(seq, frames[i], x, y, flip)];
				out.push(frame(under ? under.concat(f) : f));
			}
		}
	};

	/** Off the nearer side. */
	BadDog.prototype.leave = function (out, x, y) {
		var right = x > this.w / 2;
		this.run(out, x, right ? this.w + 60 : -60, y);
	};

	BadDog.prototype.enter = function (out, x, y) {
		var fromLeft = Math.random() < 0.5;
		return this.run(out, fromLeft ? -60 : this.w + 60, x, y);
	};

	/** Somewhere on screen for him to stand. */
	BadDog.prototype.spot = function () {
		return { x: Math.round(rand(90, this.w - 90)), y: Math.round(rand(70, this.h - 70)) };
	};

	BadDog.prototype.acts = {
		/* Runs on, shakes himself, sniffs about, runs off. */
		shake: function (out) {
			var p = this.spot();
			var dir = this.enter(out, p.x, p.y);
			this.hold(out, 1002, [5, 5, 6, 6], p.x, p.y, dir < 0, irand(6, 12));
			this.leave(out, p.x, p.y);
		},
		sniff: function (out) {
			var p = this.spot();
			var dir = this.enter(out, p.x, p.y);
			var x = p.x;
			for (var k = 0; k < irand(20, 40); k += 1) {
				out.push(frame([spr(1000, Math.floor(k / 2) % 4, x, p.y, dir < 0)]));
				if (!this.freeze) { x += dir * 2.5; }
			}
			this.hold(out, 1000, [21, 21, 22, 22], x, p.y, dir < 0, irand(3, 6));
			this.leave(out, x, p.y);
		},
		bounce: function (out) {
			var p = this.spot();
			this.enter(out, p.x, p.y);
			this.hold(out, 1000, [16, 16, 17, 17, 18, 18, 19, 19], p.x, p.y, false, irand(3, 6));
			this.hold(out, 1001, [0, 1, 2, 3, 4, 5, 6, 7], p.x, p.y, false, 2);
			this.leave(out, p.x, p.y);
		},
		/* Digs: the dirt flies out behind him and piles up there. */
		dig: function (out) {
			var p = this.spot();
			var dir = this.enter(out, p.x, p.y);
			var behind = p.x - dir * 52, base = p.y + 22;
			var pile = [];
			for (var k = 0; k < 60; k += 1) {
				var m = Math.min(8, 3 + Math.floor(k / 10));
				pile = [spr(3001, m, behind, base, dir < 0)];
				if (k > 20) { pile.unshift(spr(3001, Math.min(5, 3 + Math.floor((k - 20) / 12)), behind - dir * 38, base + 2, dir < 0)); }
				var spray = k % 6 < 3 ? [spr(3001, 9 + (k % 3), behind - dir * 20, base - 22, dir < 0)] : [];
				out.push(frame(pile.concat(spray, [spr(1002, [0, 1, 2, 3, 4][Math.floor(k / 2) % 5], p.x, p.y, dir < 0)])));
			}
			out.mark = pile;
			this.hold(out, 1000, [16, 16, 17, 17, 18, 18, 19, 19], p.x, p.y - 8, false, irand(2, 4), pile);
			this.leave(out, p.x, p.y);
		},
		/* Stands up, claws a hole in the screen, dives in. */
		claw: function (out) {
			var p = this.spot();
			p.y = Math.max(p.y, 110);
			var dir = this.enter(out, p.x, p.y);
			var hx = p.x + dir * 6, hy = p.y - 40;
			this.hold(out, 1002, [7, 7, 8, 8], p.x, p.y - 4, dir < 0, 2);
			var hole = [];
			for (var k = 0; k < 20; k += 1) {
				hole = [spr(3001, 13 + Math.min(3, Math.floor(k / 5)), hx, hy + Math.min(3, Math.floor(k / 5)) * 6, false)];
				out.push(frame(hole.concat([spr(1002, 12, p.x, p.y - 18, dir < 0)])));
			}
			this.hold(out, 1001, [8, 9], p.x, p.y, dir < 0, 3, hole);
			this.hold(out, 1002, [13, 13, 14, 14], hx, hy + 30, dir < 0, 1, hole);
			out.mark = hole;
			out.inside = { x: hx, y: hy };
		},
		/* Comes up out of his hole: peeks, has a cable in his teeth, goes back. */
		peek: function (out) {
			var h = this.inside;
			var at = [];
			var hx = h.x, hy = h.y + 30;
			this.hold(out, 2200, [0, 0, 0, 0, 1, 2, 3, 2, 1, 0, 0, 0], hx, hy - 6, false, irand(2, 4), at);
			this.hold(out, 2003, [0, 1, 2, 3, 4], hx, hy, false, 1, at);
			this.hold(out, 2002, [0, 1, 2, 3, 3, 2, 1, 0], hx, hy, false, irand(3, 5), at);
			this.hold(out, 2000, [0, 1, 2, 3, 2, 1], hx, hy, false, 2, at);
			if (Math.random() < 0.5) {
				this.hold(out, 2003, [4, 3, 2, 1, 0], hx, hy, false, 1, at);
				out.inside = h;
			} else {
				this.hold(out, 1002, [14, 14, 13, 13], hx, hy, false, 1, at);
				this.leave(out, hx, hy + 20);
			}
		},
		/* Noses the waste basket on from the edge of the screen. */
		basket: function (out) {
			var y = Math.round(rand(this.h * 0.55, this.h - 50));
			var stop = Math.round(rand(this.w * 0.55, this.w - 90));
			var x = this.w + 50;
			while (x > stop) {
				var k = out.length;
				out.push(frame([spr(6000, 5, x - 40, y + 6, false), spr(1000, Math.floor(k / 2) % 4, x + 10, y, true)]));
				if (!this.freeze) { x -= 3; }
			}
			out.basket = { x: x - 40, y: y + 6 };
			var b = [spr(6000, 5, x - 40, y + 6, false)];
			this.hold(out, 1000, [20, 20, 20, 21, 21, 21], x + 10, y, true, irand(3, 5), b);
			this.run(out, x + 10, this.w + 60, y - 10, b);
		},
		/* Knocks it over: the lid rolls off and the rubbish spills. */
		knock: function (out) {
			var b = this.basket;
			out.hidesBasket = true;
			var dir = this.run(out, -60, b.x - 50, b.y, [spr(6000, 5, b.x, b.y, false)]);
			var spill = [];
			var seqs = [[0, 0, 0], [1, 2, 0], [1, 3, 1], [1, 4, 1]];
			for (var k = 0; k < 24; k += 1) {
				var s = seqs[Math.min(3, Math.floor(k / 4))];
				spill = [spr(6000, 1, b.x + 4, b.y + 8, false)];
				if (k < 4) { spill = [spr(6000, 0, b.x, b.y, false)]; }
				if (s[1] && k >= 4) { spill.push(spr(6000, s[1], b.x + 20 + k * 2, b.y + 10, false)); }
				if (k >= 8) { spill.unshift(spr(3000, k >= 14 ? 1 : 0, b.x + 50, b.y + 14, false)); }
				var dust = k < 10 ? [spr(3000, 2 + Math.min(3, Math.floor(k / 3)), b.x, b.y - 6, false)] : [];
				out.push(frame(spill.concat(dust, [spr(1002, 10 + (k % 2), b.x - 40, b.y, dir < 0)])));
			}
			out.mark = spill;
			out.basket = null;
			this.leave(out, b.x - 40, b.y);
		}
	};

	/** What he could do now, by category. */
	BadDog.prototype.choices = function () {
		if (this.inside) { return ['peek']; }
		var good = ['shake', 'sniff', 'bounce'];
		var bad = ['dig', 'claw'];
		if (!this.basket) { bad.push('basket'); } else { bad.push('knock'); }
		var only = this.only;
		if (only === 'trash') { return [this.basket ? 'knock' : 'basket']; }
		if (only === 'inside') { return ['claw']; }
		if (only === 'dig') { return ['dig']; }
		if (only === 'good') { return good; }
		return Math.random() < this.mischief ? bad : good;
	};

	BadDog.prototype.next = function () {
		var list = this.choices();
		var name;
		if (this.shuffle || list.length === 1) {
			name = list[Math.floor(Math.random() * list.length)];
		} else {
			name = list[this.turn % list.length];
			this.turn += 1;
		}
		var out = [];
		this.acts[name].call(this, out);
		this.frames = out;
		this.f = 0;
		this.inside = null;
	};

	BadDog.prototype.finish = function () {
		var out = this.frames;
		if (out.mark && out.mark.length) {
			this.marks.push(out.mark);
			while (this.marks.length > this.mess) { this.marks.shift(); }
		}
		if ('basket' in out) { this.basket = out.basket; }
		if (out.inside) { this.inside = out.inside; }
		this.frames = [];
		this.rest = rand(0.5, 2.5);
	};

	BadDog.prototype.draw = function (ctx, s) {
		var seq = this.art.sequence(s[0]);
		if (seq) { seq.draw(ctx, s[1], s[2], s[3], { flipX: s[4] }); }
	};

	BadDog.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.art) { return; }
		this.acc += dt;
		while (this.acc >= 1 / FPS) {
			this.acc -= 1 / FPS;
			if (this.frames.length) {
				this.f += 1;
				if (this.f >= this.frames.length) { this.finish(); }
			} else {
				this.rest -= 1 / FPS;
				if (this.rest <= 0) { this.next(); }
			}
		}
		ctx.imageSmoothingEnabled = false;
		var self = this;
		this.marks.forEach(function (m) { m.forEach(function (s) { self.draw(ctx, s); }); });
		if (this.basket && !(this.frames.length && this.frames.hidesBasket)) {
			this.draw(ctx, [6000, 5, this.basket.x, this.basket.y, false]);
		}
		var fr = this.frames[this.f];
		if (fr) { fr.forEach(function (s) { self.draw(ctx, s); }); }
	};

	AfterDark.define('after-dark-bad-dog', function (el) {
		var sim = new BadDog();
		var d = AfterDark.choice(el, 'discipline', DISCIPLINE, 'moderate');
		sim.mischief = MISCHIEF[d];
		sim.mess = MESS[d];
		sim.freeze = AfterDark.flag(el, 'freeze-motion');
		var sh = AfterDark.setting(el, 'shuffle-behaviors');
		sim.shuffle = sh === null ? true : AfterDark.flag(el, 'shuffle-behaviors');
		sim.only = CATEGORY[AfterDark.choice(el, 'debug', DEBUG, 'all')] || null;
		AfterDark.load(AfterDark.setting(el, 'art') || 'art/baddog3').then(function (art) {
			sim.art = art;
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkBadDog = BadDog;
}());
