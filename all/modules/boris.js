/**
 * boris.js - Boris, a kitten loose on the screen.
 *
 * BORIS.AD's own description:
 *
 *   "BORIS (tm) Boris will leap around, scratch the edges of your screen, and
 *    preen. Boris is a great display to use with MultiModule. Try Boris and
 *    Meadow, for example. Original Mac version by Boris' owner, Rob
 *    Vaterlaus. Artwork by Igor Gasowski."
 *
 * Its controls are Number of Cats, Butterfly (Never, Rarely, Seldom,
 * Occasionally, Frequently, Always) and Color. The art is every move he has,
 * in all/art/boris/: a walk, a run, a leap, turning round to look at you,
 * sitting, four frames of washing his face, rearing up and scratching,
 * crouching and pouncing, springing up after something, lying down - and a
 * butterfly, for him to go after. Each frame is the 256-colour picture cut
 * out by its own mask. The 1-bit set the module drew with when Color was off
 * is not used; here Color off draws him in grey.
 *
 *   <after-dark-boris art="art/boris" cats="1" butterfly="occasionally" color>
 */
(function () {
	'use strict';

	var CATS = ['1', '2', '3', '4'];
	var BUTTERFLIES = ['never', 'rarely', 'seldom', 'occasionally', 'frequently', 'always'];
	/* Chance a second that one turns up. */
	var FLUTTER = [0, 0.01, 0.025, 0.05, 0.12, Infinity];
	var WALK = [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007];
	var RUN = [1350, 1351, 1352, 1353];
	var PREEN = [1250, 1251, 1252, 1253];
	/* The pounce frames face left; everything else side-on faces right. */
	var FACES_LEFT = { 1750: 1, 1751: 1, 1752: 1, 1753: 1 };

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	function Boris() {
		this.count = 1;
		this.flutter = FLUTTER[3];
		this.color = true;
		this.art = null;
	}

	Boris.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.s = Math.max(1, Math.round(Math.min(w, h) / 400));
		this.cats = [];
		for (var i = 0; i < this.count; i += 1) {
			var c = { x: rand(w * 0.1, w * 0.9), y: rand(h * 0.4, h * 0.95), dir: Math.random() < 0.5 ? 1 : -1, plan: [],
				frame: 1000 };
			this.cats.push(c);
			this.next(c);
		}
		this.fly = null;
	};

	/* ------------------------------------------------------------ doing -- */

	/**
	 * A cat's plan is a queue of steps: {frames, fps, time, vx, vy, arc, dir}.
	 * When it runs out, next() decides what he does now.
	 */
	Boris.prototype.next = function (c) {
		var s = this.s, w = this.w, h = this.h, f = this.fly;
		var p = c.plan = [];
		/* A butterfly within reach is all that matters. */
		if (f && !f.leaving && Math.abs(f.x - c.x) < 300 * s && Math.abs(f.y - c.y) < 220 * s) {
			var dx = f.x - c.x;
			c.dir = dx > 0 ? 1 : -1;
			if (Math.abs(dx) > 70 * s) {
				p.push({ frames: RUN, fps: 12, time: Math.min(1.2, (Math.abs(dx) - 50 * s) / (140 * s)), vx: 140 * s,
					vy: Math.max(-60, Math.min(60, (f.y + 40 * s - c.y) * 0.8)) });
				return;
			}
			if (c.y - f.y > 70 * s) {
				/* It is overhead: spring up after it. */
				p.push({ frames: [1800], time: 0.2 }, { frames: [1801, 1802], fps: 6, time: 0.35, arc: 90 * s },
					{ frames: [1803], time: 0.25 });
			} else {
				p.push({ frames: [1750, 1751], fps: 4, time: rand(0.6, 1.2) },
					{ frames: [1752], time: 0.35, vx: 120 * s, arc: 40 * s }, { frames: [1753], time: 0.4 });
			}
			f.startle = 1;
			return;
		}
		var r = Math.random();
		if (r < 0.32) {
			/* Wander somewhere. */
			var tx = rand(w * 0.05, w * 0.95), ty = rand(h * 0.35, h * 0.97);
			c.dir = tx > c.x ? 1 : -1;
			var dist = Math.abs(tx - c.x), t = Math.max(0.8, dist / (45 * s));
			p.push({ frames: WALK, fps: 10, time: t, vx: 45 * s, vy: (ty - c.y) / t });
		} else if (r < 0.44) {
			c.dir = Math.random() < 0.5 ? 1 : -1;
			p.push({ frames: RUN, fps: 12, time: rand(0.8, 1.8), vx: 140 * s, vy: rand(-30, 30) * s });
			if (Math.random() < 0.5) { this.leap(p, s); }
		} else if (r < 0.52) {
			this.leap(p, s);
		} else if (r < 0.78) {
			/* Turn round, sit, and see to himself. */
			p.push({ frames: [1050], time: 0.15 }, { frames: [1100], time: 0.15 });
			var sit = pick([1200, 1600, 1850, 1150]);
			p.push({ frames: [sit], time: rand(0.8, 2.5) });
			var then = Math.random();
			if (then < 0.45) {
				p.push({ frames: PREEN, fps: 6, time: rand(2, 5) }, { frames: [1200], time: rand(0.5, 1.5) });
			} else if (then < 0.65) {
				p.push({ frames: [1900, sit], fps: 2, time: rand(1.5, 3) });
			} else if (then < 0.8) {
				p.push({ frames: [1950], time: rand(4, 10) }, { frames: [sit], time: 0.8 });
			}
			p.push({ frames: [1100], time: 0.15 }, { frames: [1050], time: 0.15 });
		} else {
			/* Off to the nearest side, to scratch it. */
			c.dir = c.x > w / 2 ? 1 : -1;
			var edge = c.dir > 0 ? w - 24 * s : 24 * s;
			var run = Math.abs(edge - c.x) / (45 * s);
			p.push({ frames: WALK, fps: 10, time: run, vx: 45 * s, stopAt: edge });
			p.push({ frames: [1650], time: 0.3 }, { frames: [1651], time: 0.3 },
				{ frames: [1700, 1701], fps: 6, time: rand(1.5, 3.5) }, { frames: [1651], time: 0.3 },
				{ frames: [1650], time: 0.3 }, { turn: true, frames: [1000], time: 0.05 });
		}
	};

	Boris.prototype.leap = function (p, s) {
		p.push({ frames: [1351], time: 0.12, vx: 140 * s }, { frames: [1450], time: 0.55, vx: 220 * s, arc: 60 * s },
			{ frames: [1353], time: 0.15, vx: 100 * s });
	};

	Boris.prototype.move = function (c, dt) {
		var st = c.plan[0];
		if (!st) { this.next(c); st = c.plan[0]; }
		if (st.turn && !st.turned) { c.dir = -c.dir; st.turned = true; }
		st.at = (st.at || 0) + dt;
		var fps = st.fps || 1;
		c.frame = st.frames[Math.floor(st.at * fps) % st.frames.length];
		if (st.vx) {
			var nx = c.x + c.dir * st.vx * dt;
			if (st.stopAt !== undefined && (c.dir > 0 ? nx >= st.stopAt : nx <= st.stopAt)) {
				nx = st.stopAt;
				st.at = st.time;
			}
			c.x = nx;
		}
		if (st.vy) { c.y += st.vy * dt; }
		c.lift = st.arc ? Math.sin(Math.min(1, st.at / st.time) * Math.PI) * st.arc : 0;
		/* Stay on the screen; turn round at the sides. */
		var margin = 30 * this.s;
		if (c.x < margin && c.dir < 0 && !st.stopAt) { c.x = margin; c.dir = 1; }
		if (c.x > this.w - margin && c.dir > 0 && !st.stopAt) { c.x = this.w - margin; c.dir = -1; }
		c.y = Math.max(this.h * 0.3, Math.min(this.h - 2, c.y));
		if (st.at >= st.time) { c.plan.shift(); }
	};

	/* -------------------------------------------------------- butterfly -- */

	Boris.prototype.flutterBy = function (dt) {
		var w = this.w, h = this.h, s = this.s;
		if (!this.fly) {
			if (this.flutter === Infinity || Math.random() < this.flutter * dt) {
				var fromLeft = Math.random() < 0.5;
				this.fly = { x: fromLeft ? -20 : w + 20, y: rand(h * 0.2, h * 0.7), a: fromLeft ? 0 : Math.PI,
					t: 0, life: rand(12, 30), startle: 0 };
			}
			return;
		}
		var f = this.fly;
		f.t += dt;
		if (f.t > f.life) { f.leaving = true; }
		var speed = (f.startle > 0 ? 170 : 55) * s;
		f.startle = Math.max(0, f.startle - dt * 0.5);
		/* Flutter: the heading wanders; startled, it climbs. */
		f.a += rand(-3, 3) * dt;
		if (f.startle > 0) { f.a += (-Math.PI / 2 - f.a) * dt * 2; }
		if (!f.leaving) {
			if (f.x < 40) { f.a = rand(-0.5, 0.5); }
			if (f.x > w - 40) { f.a = Math.PI + rand(-0.5, 0.5); }
			if (f.y < h * 0.12) { f.a = rand(0.3, 2.8); }
			if (f.y > h * 0.8) { f.a = -rand(0.3, 2.8); }
		}
		f.x += Math.cos(f.a) * speed * dt;
		f.y += Math.sin(f.a) * speed * dt + Math.sin(f.t * 9) * 20 * s * dt;
		if (f.leaving && (f.x < -60 || f.x > w + 60 || f.y < -60 || f.y > h + 60)) { this.fly = null; }
	};

	Boris.prototype.flyFrame = function (f) {
		var vx = Math.cos(f.a), vy = Math.sin(f.a);
		var group = Math.abs(vy) > 0.8 ? 152 : Math.abs(vy) > 0.4 ? 151 : Math.abs(vx) > 0.9 ? 153 : 150;
		var flap = Math.floor(f.t * 12) % (group === 152 ? 2 : 3);
		var id = group * 100 + (group === 152 && flap === 1 ? 2 : flap);
		return { id: id, flip: vx < 0 };
	};

	/* ------------------------------------------------------------ drawing -- */

	Boris.prototype.draw = function (ctx, id, x, y, flip, anchor) {
		var bmp = this.art.bitmap(id);
		if (!bmp) { return; }
		var s = this.s, bw = bmp.width * s, bh = bmp.height * s;
		var left = x - bw / 2, top = anchor === 'middle' ? y - bh / 2 : y - bh;
		ctx.save();
		if (flip) {
			ctx.translate(Math.round(x * 2), 0);
			ctx.scale(-1, 1);
		}
		ctx.drawImage(bmp.image, Math.round(left), Math.round(top), bw, bh);
		ctx.restore();
	};

	Boris.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.art) { return; }
		var i;
		for (i = 0; i < this.cats.length; i += 1) { this.move(this.cats[i], dt); }
		this.flutterBy(dt);
		ctx.imageSmoothingEnabled = false;
		if (!this.color) { ctx.filter = 'grayscale(1)'; }
		/* Nearer - lower on the screen - in front. */
		var order = this.cats.slice().sort(function (a, b) { return a.y - b.y; });
		for (i = 0; i < order.length; i += 1) {
			var c = order[i];
			var flip = FACES_LEFT[c.frame] ? c.dir > 0 : c.dir < 0;
			this.draw(ctx, c.frame, c.x, c.y - (c.lift || 0), flip);
		}
		if (this.fly) {
			var ff = this.flyFrame(this.fly);
			this.draw(ctx, ff.id, this.fly.x, this.fly.y, ff.flip, 'middle');
		}
		ctx.filter = 'none';
	};

	AfterDark.define('after-dark-boris', function (el) {
		var sim = new Boris();
		sim.count = Number(CATS[AfterDark.choice(el, 'cats', CATS, '1')]);
		sim.flutter = FLUTTER[AfterDark.choice(el, 'butterfly', BUTTERFLIES, 'occasionally')];
		sim.color = AfterDark.flag(el, 'color');
		AfterDark.load(AfterDark.setting(el, 'art') || 'art/boris').then(function (art) {
			sim.art = art;
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkBoris = Boris;
}());
