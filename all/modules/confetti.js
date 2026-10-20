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
 * Its controls (TYPE_1000) are Ducks (None, Seven; default Seven), Workshift
 * (10 sec., 30 sec., 1 min., 2 min., 5 min., 10 min.; default 30 sec.) and
 * Type (Metal, Wood, Both; default Wood). Its art, in all/art/confetti/, is
 * the factory in pieces, in metal and in wood: girder ends, girder, a strut,
 * belt pulleys turning in four frames, a length of belt; a duck waddling in
 * seven frames and a Duck sign.
 *
 * The staging was checked against the module running under Wine at 1024x768
 * (2026-10-15), which is where these numbers come from:
 *
 *   - Five rows of girders, their tops a seventh of the screen apart (109,
 *     218, 327, 436, 545), each running from 16 px in from the left to 16 px
 *     in from the right in lengths of 80 to 140 px with 16 px gaps and two
 *     struts apiece. In each row one stretch is a conveyor instead: a pulley
 *     at each end and belt between, anywhere from 60 to 330 px long. Now and
 *     then a row has an open gap instead of a conveyor. The layout is new
 *     every shift. Everything is drawn at its own size.
 *   - Confetti drifts down from the top of the screen in a band about 180 px
 *     wide that moves somewhere else every 13 seconds or so. It lands on the
 *     belts and rides them off the end, and piles up wherever it lands on a
 *     girder, in little 45-degree heaps. What misses everything heaps up on
 *     the floor, 50 px above the bottom of the screen.
 *   - At the end of the shift the screen goes black and the Duck sign stands
 *     in the middle for four seconds. Then seven ducks come in from the right
 *     in a loose formation down the whole height of the screen and waddle off
 *     to the left at about 115 px a second. Two seconds of black, and the next
 *     shift starts with a new factory.
 *
 * The capture's colours are not to be trusted (the 8-bit display mapped the
 * module's palette wrongly), so the confetti's colours are a guess, as are its
 * falling and belt speeds and how often a row has a gap instead of a belt.
 *
 *   <after-dark-confetti-factory art="art/confetti" ducks="seven" workshift="30 sec." type="wood">
 */
(function () {
	'use strict';

	var DUCKS = ['none', 'seven'];
	var HOW_MANY = [0, 7];
	var SHIFTS = ['10 sec.', '30 sec.', '1 min.', '2 min.', '5 min.', '10 min.'];
	var SECONDS = [10, 30, 60, 120, 300, 600];
	var TYPES = ['metal', 'wood', 'both'];
	/* Girder end, girder, strut, other end, the first of four pulley frames, belt. */
	var PIECES = {
		metal: { left: 2111, mid: 2112, strut: 2113, right: 2114, wheel: 2121, belt: 2125 },
		wood: { left: 2211, mid: 2212, strut: 2213, right: 2214, wheel: 2221, belt: 2225 }
	};
	var PAPER = ['#ff5555', '#55ff55', '#5555ff', '#ffff55', '#ff55ff', '#55ffff', '#ffffff', '#ffaa00'];
	/* Where the seven ducks are in their formation, at 1024x768: x behind the
	   leader, and y. */
	var FLOCK = [[200, 27], [50, 219], [250, 316], [0, 412], [300, 412], [150, 506], [100, 603]];
	var BELT_SPEED = 60, FALL = 80, DUCK_SPEED = 115, SIGN = 4, GAP = 2;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Confetti() {
		this.ducks = 7;
		this.shift = 30;
		this.type = 'wood';
		this.dir = 1;
		this.art = null;
	}

	Confetti.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.s = Math.max(1, Math.round(Math.min(w, h) / 768));
		this.heap = document.createElement('canvas');
		this.heap.width = Math.max(1, Math.round(w));
		this.heap.height = Math.max(1, Math.round(h));
		this.work();
	};

	/** A new shift: a new factory, no confetti yet. */
	Confetti.prototype.work = function () {
		var w = this.w, h = this.h, s = this.s;
		this.phase = 'work';
		this.clock = 0;
		this.bits = [];
		this.emit = 0;
		this.floorPile = null;
		this.spin = 0;
		this.heap.getContext('2d').clearRect(0, 0, this.heap.width, this.heap.height);
		this.floor = Math.round(h * 718 / 768);
		this.rows = [];
		for (var i = 0; i < 5; i += 1) {
			var y = Math.round(h * (i + 1) / 7), kind = this.type === 'both' ? (Math.random() < 0.5 ? 'metal' : 'wood') : this.type;
			var row = { y: y, kind: kind, girders: [], belt: null, pile: new Float32Array(Math.ceil(w)) };
			var left = 16 * s, right = w - 16 * s, from, to;
			if (Math.random() < 0.85) {
				var len = rand(60, 330) * s;
				from = rand(left + 40 * s, right - len - 72 * s);
				to = from + len;
				row.belt = { x0: from, x1: to + 32 * s, dir: Math.random() < 0.5 ? 1 : -1 };
				to += 32 * s;
			} else {
				var gap = rand(150, 300) * s;
				from = Math.random() < 0.5 ? right - gap : rand(left + 100 * s, right - gap - 100 * s);
				to = from + gap;
			}
			this.lay(row, left, from - 8 * s);
			this.lay(row, to + 8 * s, right);
			this.rows.push(row);
		}
		this.moveSpray();
	};

	/** Girders from x0 to x1, 80 to 140 px at a time with 16 px between. */
	Confetti.prototype.lay = function (row, x0, x1) {
		var s = this.s, x = x0;
		while (x1 - x >= 40 * s) {
			var len = Math.min(x1 - x, rand(80, 140) * s);
			if (x1 - x - len < 56 * s) { len = x1 - x; }
			row.girders.push({ x0: Math.round(x), x1: Math.round(x + len) });
			x += len + 16 * s;
		}
	};

	Confetti.prototype.moveSpray = function () {
		this.spray = { x: rand(0, this.w - 180 * this.s), t: rand(11, 15) };
	};

	Confetti.prototype.img = function (id) {
		var b = this.art.bitmap(id);
		return b ? b.image : null;
	};

	/** Where something falling at x comes to rest on a row: a belt, a girder or nothing. */
	Confetti.prototype.under = function (row, x) {
		var b = row.belt;
		if (b && x >= b.x0 + 16 * this.s && x <= b.x1 - 16 * this.s) { return 'belt'; }
		for (var i = 0; i < row.girders.length; i += 1) {
			if (x >= row.girders[i].x0 && x < row.girders[i].x1) { return 'girder'; }
		}
		return null;
	};

	/**
	 * A grain comes to rest on a heap (a row's girders or the floor). It rolls
	 * down whichever side is lower until both sides are no more than a pixel
	 * below it, which makes the 45-degree heaps the module has.
	 */
	Confetti.prototype.settle = function (pile, base, x, c, row) {
		var w = this.w, n;
		x = Math.max(0, Math.min(w - 1, Math.floor(x)));
		for (n = 0; n < 200; n += 1) {
			var l = x - 1, r = x + 1;
			var lowL = l >= 0 && pile[l] + 1 < pile[x] && (!row || this.under(row, l) === 'girder');
			var lowR = r < w && pile[r] + 1 < pile[x] && (!row || this.under(row, r) === 'girder');
			if (lowL && lowR) { x = Math.random() < 0.5 ? l : r; } else if (lowL) { x = l; } else if (lowR) { x = r; } else { break; }
		}
		if (pile[x] > 60 * this.s) { return; }
		pile[x] += 1;
		var g = this.heap.getContext('2d');
		g.fillStyle = c;
		g.fillRect(x, base - pile[x], 1, 1);
	};

	Confetti.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.art) { return; }
		ctx.imageSmoothingEnabled = false;
		this.clock += dt;
		if (this.phase === 'work') {
			this.working(dt, ctx);
			if (this.clock > this.shift) {
				this.phase = 'sign';
				this.clock = 0;
			}
			return;
		}
		var s = this.s;
		if (this.phase === 'sign') {
			ctx.drawImage(this.img(217), Math.round(w / 2 - 23 * s), Math.round(h / 2 - 23 * s), 46 * s, 46 * s);
			if (this.clock > SIGN) {
				this.phase = this.ducks ? 'ducks' : 'gap';
				this.clock = 0;
			}
		} else if (this.phase === 'ducks') {
			if (this.parade(ctx)) {
				this.phase = 'gap';
				this.clock = 0;
			}
		} else if (this.clock > GAP) {
			this.work();
		}
	};

	Confetti.prototype.working = function (dt, ctx) {
		var s = this.s, w = this.w, h = this.h, i, j;
		this.spin += dt * 8;
		this.spray.t -= dt;
		if (this.spray.t <= 0) { this.moveSpray(); }
		/* Out of the sky, in the spray's band. */
		for (this.emit += dt * 40; this.emit >= 1; this.emit -= 1) {
			this.bits.push({ x: this.spray.x + rand(0, 180 * s), y: 0, row: 0, ride: null,
				c: PAPER[Math.floor(Math.random() * PAPER.length)] });
		}
		for (i = this.bits.length - 1; i >= 0; i -= 1) {
			var b = this.bits[i];
			if (b.ride) {
				b.x += b.ride.dir * this.dir * BELT_SPEED * s * dt;
				if (b.x < b.ride.x0 + 8 * s || b.x > b.ride.x1 - 8 * s) {
					/* Off the end of the belt, over the pulley. */
					b.x = b.x < b.ride0 ? b.ride.x0 - 1 : b.ride.x1 + 1;
					b.ride = null;
				}
				continue;
			}
			var ny = b.y + FALL * s * dt;
			b.x += Math.sin(ny * 0.07 + i) * 6 * s * dt;
			var done = false;
			for (j = b.row; j < this.rows.length; j += 1) {
				var row = this.rows[j], top = row.y - row.pile[Math.max(0, Math.min(w - 1, Math.floor(b.x)))];
				if (b.y > row.y) { b.row = j + 1; continue; }
				if (ny < top) { break; }
				var on = this.under(row, b.x);
				if (on === 'belt') {
					b.ride = row.belt;
					b.ride0 = (row.belt.x0 + row.belt.x1) / 2;
					b.y = row.y - 1;
					b.row = j + 1;
					done = true;
				} else if (on === 'girder') {
					this.settle(row.pile, row.y, b.x, b.c, row);
					this.bits.splice(i, 1);
					done = true;
				}
				break;
			}
			if (done) { continue; }
			b.y = ny;
			var fx = Math.max(0, Math.min(w - 1, Math.floor(b.x)));
			if (b.y >= this.floor - (this.floorPile ? this.floorPile[fx] : 0)) {
				this.floorPile = this.floorPile || new Float32Array(Math.ceil(w));
				this.settle(this.floorPile, this.floor, b.x, b.c, null);
				this.bits.splice(i, 1);
			} else if (b.x < -4 || b.x > w + 4) {
				this.bits.splice(i, 1);
			}
		}
		this.rows.forEach(function (row) { this.drawRow(ctx, row); }, this);
		ctx.drawImage(this.heap, 0, 0, w, h);
		for (i = 0; i < this.bits.length; i += 1) {
			ctx.fillStyle = this.bits[i].c;
			ctx.fillRect(Math.round(this.bits[i].x), Math.round(this.bits[i].y), s, s);
		}
	};

	Confetti.prototype.drawRow = function (ctx, row) {
		var s = this.s, set = PIECES[row.kind], y = row.y, i, x;
		var put = function (img, px, py) {
			if (img) { ctx.drawImage(img, Math.round(px), Math.round(py), img.width * s, img.height * s); }
		};
		for (i = 0; i < row.girders.length; i += 1) {
			var g = row.girders[i], len = g.x1 - g.x0;
			for (x = g.x0 + 10 * s; x < g.x1 - 10 * s; x += 10 * s) { put(this.img(set.mid), Math.min(x, g.x1 - 20 * s), y); }
			put(this.img(set.left), g.x0, y);
			put(this.img(set.right), g.x1 - 10 * s, y);
			put(this.img(set.strut), g.x0 + 10 * s, y);
			put(this.img(set.strut), g.x0 + Math.round(len * 0.62), y);
		}
		var b = row.belt;
		if (b) {
			for (x = b.x0 + 16 * s; x < b.x1 - 16 * s; x += 10 * s) { put(this.img(set.belt), Math.min(x, b.x1 - 26 * s), y); }
			var turn = Math.floor(this.spin) * b.dir * this.dir, f = ((turn % 4) + 4) % 4;
			put(this.img(set.wheel + f), b.x0, y);
			put(this.img(set.wheel + f), b.x1 - 32 * s, y);
		}
	};

	/* ------------------------------------------------------------ ducks -- */

	/** The ducks waddle across; true once the last one is off the screen. */
	Confetti.prototype.parade = function (ctx) {
		var s = this.s, w = this.w, h = this.h, lead = w - this.clock * DUCK_SPEED * s, gone = true;
		for (var i = 0; i < Math.min(this.ducks, FLOCK.length); i += 1) {
			var x = lead + FLOCK[i][0] * s, y = FLOCK[i][1] * h / 768;
			if (x > -46 * s) { gone = false; }
			/* The duck is drawn facing left, the way they go. */
			var img = this.img(210 + (Math.floor(this.clock * 8) + i) % 7);
			if (img) { ctx.drawImage(img, Math.round(x), Math.round(y), 46 * s, 46 * s); }
		}
		return gone;
	};

	AfterDark.define('after-dark-confetti-factory', function (el) {
		var sim = new Confetti();
		sim.ducks = HOW_MANY[AfterDark.choice(el, 'ducks', DUCKS, 'seven')];
		sim.shift = SECONDS[AfterDark.choice(el, 'workshift', SHIFTS, '30 sec.')];
		sim.type = TYPES[AfterDark.choice(el, 'type', TYPES, 'wood')];
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
