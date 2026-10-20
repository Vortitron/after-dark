/**
 * ratrace.js - Rat Race, a day at the track.
 *
 * RATRACE.AD's own description:
 *
 *   "RAT RACE - Try your luck at the track. Place your bets and cross your
 *    fingers, because you can never tell which rat will win. 'Training'
 *    determines how well the rats will compete. 'Race Track' determines
 *    whether or not the race track will appear. 'Music' determines how often
 *    the music will play. After 90 minutes of uninterrupted racing the track
 *    will disappear, but the tireless rats will continue racing."
 *
 * Training is Drop Out, Grade School, High School, Collegiate or Professional
 * (the slider sits at 77, Collegiate). The art, in all/art/ratrace/, is a rat
 * seen from above - running, turning, standing up, curled up, grooming,
 * chasing its tail - a starting gate, a finish post, grass and dirt, a tote
 * board and the font it writes in (PICT 110, spaced by its STFT table). Its
 * RATN resource names the runners - "Merkle's Mistake", "Nosfer-RAT-u",
 * "Abort, Retry, Fail?" and fifty-odd more - and calls the results: W I N,
 * P L A C E, S H O W, P H O T O F I N I S H. PAL 1051 holds the jackets: the
 * art's purple, and gold, red and green.
 *
 * Checked against the module running (8-bit captures of 120 and 300 s at
 * the defaults, and stills through the installed palette): three rats race
 * one lap of an oval that fills the screen - four white lane lines 35 px
 * apart, 12 px in from the sides and 8 from the top and bottom, round
 * corners, and along the bottom a straight that runs the full width, with a
 * chequered finish line 212 px from the right and a striped post at either
 * end. The rats walk in from the left to gates staggered along it, inner
 * lane furthest back (180, 290, 400 px), and run anticlockwise as seen -
 * right, up, left, down and home - at about 25 px a second: a race takes
 * some two and a half minutes. The tote board sits in the middle, three
 * slots of rat's head over three names; the runners are announced bottom
 * slot first, and as each rat finishes W I N, P L A C E or S H O W goes up
 * under its name. A few seconds later the board clears for the next race.
 * Which way the art turns at a corner is the engine's; here the running rat
 * is turned along the track, and its antics are a guess at the code's.
 * Music is left out, as all sound is here.
 *
 *   <after-dark-rat-race art="art/ratrace" training="collegiate" track>
 */
(function () {
	'use strict';

	var TRAINING = ['drop out', 'grade school', 'high school', 'collegiate', 'professional'];
	/* How often a rat gets distracted, a second; and how much the rats differ. */
	var DISTRACT = [0.12, 0.08, 0.05, 0.03, 0.01];
	var SPREAD = [0.3, 0.22, 0.16, 0.12, 0.08];
	var RUN = [0, 1, 2, 3, 4, 5, 6];
	/* Things a rat might do instead of running: [sequence, frames]. */
	var ANTICS = [[1102, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]], [1102, [17, 18, 19, 20, 21, 22]],
		[1101, [25, 26, 27, 28, 29, 30, 31, 32]], [1102, [0, 1, 2, 3, 2, 1]]];
	var LANES = 3;
	var PACE = 26;
	/* The lane lines, outside in: inset, and corner radius. */
	var LINE_IN = [0, 35, 70, 105], RADII = [126, 114, 100, 85];
	var GATES = [180, 290, 400];
	/* PAL 1051's jackets, and the art's own purple they replace. */
	var JACKETS = ['#7551ab', '#e3b019', '#b53d1c', '#428759'];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function shuffle(list) {
		for (var i = list.length - 1; i > 0; i -= 1) {
			var j = Math.floor(Math.random() * (i + 1));
			var t = list[i]; list[i] = list[j]; list[j] = t;
		}
		return list;
	}

	function hex(c) {
		return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
	}

	/** A copy of an image with the purple jacket dyed `colour`. */
	function dye(image, colour) {
		var c = document.createElement('canvas');
		c.width = image.width;
		c.height = image.height;
		var g = c.getContext('2d');
		g.drawImage(image, 0, 0);
		if (colour === JACKETS[0]) { return c; }
		var px = g.getImageData(0, 0, c.width, c.height), d = px.data, to = hex(colour), ref = 0xab;
		for (var i = 0; i < d.length; i += 4) {
			var r = d[i], gg = d[i + 1], b = d[i + 2];
			if (d[i + 3] && b > r + 18 && b > gg + 30) {
				var f = b / ref;
				d[i] = Math.min(255, to[0] * f);
				d[i + 1] = Math.min(255, to[1] * f);
				d[i + 2] = Math.min(255, to[2] * f);
			}
		}
		g.putImageData(px, 0, 0);
		return c;
	}

	function RatRace() {
		this.distract = DISTRACT[3];
		this.spread = SPREAD[3];
		this.track = true;
		this.art = null;
	}

	RatRace.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.k = Math.max(1, Math.floor(Math.min(w, h) / 768));
		this.finishX = w - 212 * this.k;
		this.ground = null;
		if (this.art) { this.newRace(); }
	};

	RatRace.prototype.setArt = function (art, data) {
		this.art = art;
		this.data = data;
		/* The font strip: black letters on white, as the board shows them. */
		var strip = art.bitmap('font').image, c = document.createElement('canvas');
		c.width = strip.width;
		c.height = strip.height;
		var g = c.getContext('2d');
		g.fillStyle = '#fff';
		g.fillRect(0, 0, c.width, c.height);
		g.drawImage(strip, 0, 0);
		this.font = c;
		/* Each jacket's rats. */
		this.dyed = JACKETS.map(function (colour) {
			var out = {};
			[1100, 1101, 1102, 1150].forEach(function (id) { out[id] = dye(art.sequence(id).image, colour); });
			return out;
		});
		if (this.w) { this.newRace(); }
	};

	/* ------------------------------------------------------------ track -- */

	/** Lane i's centre line (0 is the inside): a rounded rect. */
	RatRace.prototype.lane = function (i) {
		var k = this.k, j = LANES - 1 - i, inset = (LINE_IN[j] + 17.5) * k;
		var x0 = 12 * k + inset, y0 = 8 * k + inset, x1 = this.w - 12 * k - inset, y1 = this.h - 8 * k - inset;
		var r = (RADII[j] + RADII[j + 1]) / 2 * k, sx = x1 - x0 - 2 * r, sy = y1 - y0 - 2 * r, q = Math.PI * r / 2;
		return { x0: x0, y0: y0, x1: x1, y1: y1, r: r, sx: sx, sy: sy, q: q, lap: 2 * sx + 2 * sy + 4 * q };
	};

	/**
	 * Where on lane L a rat is at distance s, and which way it faces. s is 0
	 * where the bottom straight leaves the bottom-left corner, and runs right,
	 * up, left and down; below 0 is the start of the straight, off to the left.
	 */
	RatRace.prototype.at = function (L, s) {
		var r = L.r, a;
		if (s < L.sx) { return [L.x0 + r + s, L.y1, 0]; }
		s -= L.sx;
		if (s < L.q) { a = Math.PI / 2 - s / r; return [L.x1 - r + r * Math.cos(a), L.y1 - r + r * Math.sin(a), a - Math.PI / 2]; }
		s -= L.q;
		if (s < L.sy) { return [L.x1, L.y1 - r - s, -Math.PI / 2]; }
		s -= L.sy;
		if (s < L.q) { a = -s / r; return [L.x1 - r + r * Math.cos(a), L.y0 + r + r * Math.sin(a), a - Math.PI / 2]; }
		s -= L.q;
		if (s < L.sx) { return [L.x1 - r - s, L.y0, Math.PI]; }
		s -= L.sx;
		if (s < L.q) { a = -Math.PI / 2 - s / r; return [L.x0 + r + r * Math.cos(a), L.y0 + r + r * Math.sin(a), a - Math.PI / 2]; }
		s -= L.q;
		if (s < L.sy) { return [L.x0, L.y0 + r + s, Math.PI / 2]; }
		s -= L.sy;
		if (s < L.q) { a = Math.PI - s / r; return [L.x0 + r + r * Math.cos(a), L.y1 - r + r * Math.sin(a), a - Math.PI / 2]; }
		s -= L.q;
		return [L.x0 + r + s, L.y1, 0];
	};

	RatRace.prototype.roundRect = function (g, x0, y0, x1, y1, r, more) {
		if (!more) { g.beginPath(); }
		g.moveTo(x0 + r, y0);
		g.arcTo(x1, y0, x1, y1, r);
		g.arcTo(x1, y1, x0, y1, r);
		g.arcTo(x0, y1, x0, y0, r);
		g.arcTo(x0, y0, x1, y0, r);
		g.closePath();
	};

	/** The grass, the dirt and the lines, drawn once. */
	RatRace.prototype.paintGround = function () {
		var w = this.w, h = this.h, k = this.k, c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		var g = c.getContext('2d');
		if (!this.track) {
			g.fillStyle = '#000';
			g.fillRect(0, 0, w, h);
			return c;
		}
		g.fillStyle = g.createPattern(this.art.bitmap('grass').image, 'repeat');
		g.fillRect(0, 0, w, h);
		var dirt = g.createPattern(this.art.bitmap('dirt').image, 'repeat');
		var out = [12 * k, 8 * k, w - 12 * k, h - 8 * k], inn = 105 * k;
		/* The oval, less its infield, and the home straight the full width. */
		g.save();
		this.roundRect(g, out[0], out[1], out[2], out[3], RADII[0] * k);
		this.roundRect(g, out[0] + inn, out[1] + inn, out[2] - inn, out[3] - inn, RADII[3] * k, true);
		g.fillStyle = dirt;
		g.fill('evenodd');
		g.restore();
		g.fillStyle = dirt;
		g.fillRect(0, out[3] - inn, w, inn);
		g.strokeStyle = '#fff';
		g.lineWidth = k;
		for (var j = 0; j < 4; j += 1) {
			var o = LINE_IN[j] * k + 0.5;
			this.roundRect(g, out[0] + o, out[1] + o, out[2] - o, out[3] - o, RADII[j] * k);
			g.stroke();
			g.beginPath();
			g.moveTo(15 * k, out[3] - o);
			g.lineTo(w - 15 * k, out[3] - o);
			g.stroke();
		}
		/* The finish line: chequered, white at either side. */
		var fx = this.finishX, top = out[3] - inn;
		g.fillStyle = '#fff';
		g.fillRect(fx - 2 * k, top, k, inn);
		g.fillRect(fx + 3 * k, top, k, inn);
		g.fillStyle = '#000';
		g.fillRect(fx - k, top, 4 * k, inn);
		g.fillStyle = '#fff';
		for (var y = 0; y < inn; y += 2 * k) { g.fillRect(fx - k + ((y / k / 2) % 2 ? 2 * k : 0), top + y, 2 * k, k); }
		/* A striped post at either end of the straight. */
		var post = this.art.sequence(1001), pf = post.frames[0];
		g.drawImage(post.image, pf.x, pf.y, pf.w, pf.h, 3 * k, h - (pf.h + 3) * k, pf.w * k, pf.h * k);
		g.drawImage(post.image, pf.x, pf.y, pf.w, pf.h, w - (pf.w + 1) * k, h - (pf.h + 3) * k, pf.w * k, pf.h * k);
		return c;
	};

	/* ------------------------------------------------------------- race -- */

	RatRace.prototype.newRace = function () {
		var names = shuffle(this.data.names.slice()).slice(0, LANES), self = this;
		var jackets = shuffle([0, 1, 2, 3]);
		this.rats = names.map(function (name, i) {
			/* Each waits with its nose at its gate. */
			var L = self.lane(i), gate = (GATES[i] - 52) * self.k - (L.x0 + L.r);
			return { name: name, lane: i, L: L, jacket: jackets[i], gate: gate, s: -(L.x0 + L.r) - rand(80, 200) * self.k,
				speed: rand(1 - self.spread, 1 + self.spread), antic: null, t: rand(0, 1), done: false, call: null,
				finish: L.lap + (self.finishX - (L.x0 + L.r)), surge: 1, surgeIn: rand(2, 6) };
		});
		this.order = [];
		this.announced = 0;
		this.phase = 'saddle';
		this.clock = 0;
		this.photo = false;
	};

	/** Text in the module's font, centred on cx; one white box a word, as the board does. */
	RatRace.prototype.text = function (ctx, str, cx, y) {
		var xs = this.data.font.x, h = this.font.height, k = this.k, words = str.split(' '), i, total = 0, ws = [];
		for (i = 0; i < words.length; i += 1) {
			var ww = 0;
			for (var j = 0; j < words[i].length; j += 1) {
				var c = words[i].charCodeAt(j) - 32;
				ww += c >= 0 && c + 1 < xs.length ? xs[c + 1] - xs[c] : 4;
			}
			ws.push(ww);
			total += ww + (i ? 6 : 0);
		}
		var pen = Math.round(cx - total * k / 2);
		for (i = 0; i < words.length; i += 1) {
			for (var n = 0; n < words[i].length; n += 1) {
				var cc = words[i].charCodeAt(n) - 32;
				if (cc < 0 || cc + 1 >= xs.length) { pen += 4 * k; continue; }
				var gw = xs[cc + 1] - xs[cc];
				ctx.drawImage(this.font, xs[cc], 0, gw, h, pen, Math.round(y), gw * k, h * k);
				pen += gw * k;
			}
			pen += 6 * k;
		}
	};

	RatRace.prototype.board = function (ctx) {
		var k = this.k, q = this.art.sequence(1400), top = q.frames[0], bot = q.frames[1];
		var bx = Math.round(this.w / 2 - top.w * k / 2), by = Math.round(this.h / 2 - (top.h + bot.h) * k / 2);
		ctx.drawImage(q.image, top.x, top.y, top.w, top.h, bx, by, top.w * k, top.h * k);
		ctx.drawImage(q.image, bot.x, bot.y, bot.w, bot.h, bx, by + top.h * k, bot.w * k, bot.h * k);
		var icon = this.art.sequence(1150), head = icon.frames[0], ring = icon.frames[1];
		var lead = this.leader();
		for (var i = 0; i < LANES; i += 1) {
			/* Slot i is lane i's rat; the board fills from the bottom slot up. */
			var r = this.rats[i], slot = LANES - 1 - i, cy = by + (48 + 48 * slot) * k, cx = bx + 45 * k;
			if (slot < LANES - this.announced) { continue; }
			var img = this.dyed[r.jacket][1150];
			ctx.drawImage(img, head.x, head.y, head.w, head.h, cx - head.w * k / 2, cy - head.h * k / 2, head.w * k, head.h * k);
			var lit = this.phase === 'saddle' ? slot === LANES - this.announced : r === lead;
			if (lit) {
				ctx.drawImage(icon.image, ring.x, ring.y, ring.w, ring.h, cx - ring.w * k / 2, cy - ring.h * k / 2, ring.w * k, ring.h * k);
			}
			this.text(ctx, r.name, bx + 139 * k, cy - 8 * k);
			if (r.call) { this.text(ctx, r.call, bx + 139 * k, cy + 8 * k); }
		}
		if (this.photo && this.phase !== 'saddle' && Math.floor(this.clock * 2) % 2 === 0) {
			this.text(ctx, this.data.calls.photo, bx + 139 * k, by + 8 * k);
		}
	};

	/** The rat in front, or the winner. */
	RatRace.prototype.leader = function () {
		if (this.order.length) { return this.order[0]; }
		var best = null;
		this.rats.forEach(function (r) { if (!best || r.s - r.gate > best.s - best.gate) { best = r; } });
		return best;
	};

	RatRace.prototype.drawRat = function (ctx, r, seq, frame, x, y, angle) {
		var q = this.art.sequence(seq), f = q.frames[frame % q.count], k = this.k;
		ctx.save();
		ctx.translate(Math.round(x), Math.round(y));
		ctx.rotate(angle);
		/* The running rat's body is the right end of its frame; its tail trails. */
		var ox = seq === 1100 ? -f.w * 0.62 : -f.w / 2;
		ctx.drawImage(this.dyed[r.jacket][seq], f.x, f.y, f.w, f.h, Math.round(ox * k), Math.round(-f.h * k / 2), f.w * k, f.h * k);
		ctx.restore();
	};

	RatRace.prototype.step = function (dt, ctx, w, h) {
		if (!this.art || !this.rats) {
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);
			return;
		}
		if (!this.ground) { this.ground = this.paintGround(); }
		ctx.drawImage(this.ground, 0, 0);
		ctx.imageSmoothingEnabled = false;
		this.clock += dt;
		var i, r, k = this.k;
		if (this.phase === 'saddle') {
			this.announced = Math.min(LANES, Math.floor(this.clock / 1.8));
			var ready = this.rats.every(function (rr) { return rr.s >= rr.gate; });
			if (ready && this.announced >= LANES && this.clock > 7) {
				this.phase = 'race';
				this.clock = 0;
			}
		}
		/* The gates, in front of each rat's nose; they open at the off. */
		var gate = this.art.sequence(1200), open = this.phase === 'saddle' ? 0 : Math.min(2, Math.floor(this.clock * 6));
		for (i = 0; i < LANES; i += 1) {
			r = this.rats[i];
			r.t += dt;
			if (this.phase === 'saddle') {
				if (r.s < r.gate) { r.s = Math.min(r.gate, r.s + 90 * k * dt); }
			} else if (r.antic) {
				r.antic.t += dt;
				if (r.antic.t > r.antic.len) { r.antic = null; }
			} else {
				r.surgeIn -= dt;
				if (r.surgeIn <= 0) { r.surge = rand(0.75, 1.25); r.surgeIn = rand(2, 6); }
				r.s += PACE * k * r.speed * r.surge * dt;
				if (!r.done && Math.random() < this.distract * dt) {
					var a = ANTICS[Math.floor(Math.random() * ANTICS.length)];
					r.antic = { seq: a[0], frames: a[1], t: 0, len: rand(1, 3.5) };
				}
			}
			if (!r.done && r.s >= r.finish) {
				r.done = true;
				r.when = this.clock;
				r.call = this.data.calls.places[this.order.length];
				this.order.push(r);
				if (this.order.length === 2 && r.when - this.order[0].when < 0.3) { this.photo = true; }
			}
			var p = this.at(r.L, r.done ? r.finish + (r.s - r.finish) : r.s);
			if (r.s > r.L.lap + r.L.sx + 400 * k) { p = [w + 500, 0, 0]; }
			if (r.antic) {
				this.drawRat(ctx, r, r.antic.seq, r.antic.frames[Math.floor(r.antic.t * 8) % r.antic.frames.length], p[0], p[1], 0);
			} else {
				var moving = this.phase !== 'saddle' || r.s < r.gate;
				this.drawRat(ctx, r, 1100, moving ? RUN[Math.floor(r.t * 12) % RUN.length] : 0, p[0], p[1], p[2]);
			}
			if (this.phase === 'saddle' || this.clock < 4) {
				var gf = gate.frames[open], gx = GATES[i] * k, gy = r.L.y1;
				ctx.drawImage(gate.image, gf.x, gf.y, gf.w, gf.h, gx - 4 * k, Math.round(gy - gf.h * k / 2), gf.w * k, gf.h * k);
			}
		}
		if (this.phase === 'race' && this.order.length >= LANES) {
			this.phase = 'results';
			this.clock = 0;
		}
		if (this.phase === 'results' && this.clock > 5) { this.newRace(); }
		this.board(ctx);
	};

	AfterDark.define('after-dark-rat-race', function (el) {
		var sim = new RatRace(), t = AfterDark.choice(el, 'training', TRAINING, 'collegiate');
		sim.distract = DISTRACT[t];
		sim.spread = SPREAD[t];
		sim.track = AfterDark.flag(el, 'track');
		var base = AfterDark.setting(el, 'art') || 'art/ratrace';
		Promise.all([AfterDark.load(base), AfterDark.data(base)]).then(function (both) {
			sim.setArt(both[0], both[1]);
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkRatRace = RatRace;
}());
