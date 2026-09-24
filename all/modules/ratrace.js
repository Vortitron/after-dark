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
 * Training is Drop Out, Grade School, High School, Collegiate or Professional.
 * The art, in all/art/ratrace/, is a rat seen from above - running, turning,
 * standing up, curled up, grooming, chasing its tail - a starting gate, a
 * finish post, grass and dirt, a tote board and the font it writes in (PICT
 * 110, spaced by its STFT table). Its RATN resource names the runners -
 * "Merkle's Mistake", "Nosfer-RAT-u", "Abort, Retry, Fail?" and fifty-odd
 * more - and calls the results: W I N, P L A C E, S H O W, P H O T O F I N I S H.
 * The race itself is staged here as a straight six-lane sprint; the worse
 * their training, the more the rats stop to wash, sit up or chase their
 * tails on the way. Music is left out, as all sound is here.
 *
 *   <after-dark-rat-race art="art/ratrace" training="high school" track>
 */
(function () {
	'use strict';

	var TRAINING = ['drop out', 'grade school', 'high school', 'collegiate', 'professional'];
	/* How often a rat gets distracted, a second; and how much the rats differ. */
	var DISTRACT = [0.45, 0.28, 0.14, 0.06, 0];
	var SPREAD = [0.4, 0.3, 0.22, 0.15, 0.1];
	var RUN = [0, 1, 2, 3, 4, 5, 6];
	/* Things a rat might do instead of running: [sequence, frames]. */
	var ANTICS = [[1102, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]], [1101, [19, 20, 21, 22, 23, 22, 21, 20]],
		[1102, [17, 18, 19, 20, 21, 22, 21, 20, 19, 18]], [1101, [25, 26, 27, 28, 29, 30, 31, 32]]];
	var LANES = 6;
	var AMBER = '#ffcc33';

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

	function RatRace() {
		this.distract = DISTRACT[2];
		this.spread = SPREAD[2];
		this.track = true;
		this.art = null;
	}

	RatRace.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.s = Math.min(w, h) / 480;
		this.top = h * 0.4;
		this.lane = (h * 0.96 - this.top) / LANES;
		this.startX = w * 0.1;
		this.finishX = w * 0.86;
		if (this.art) { this.newRace(); }
	};

	RatRace.prototype.setArt = function (art, data) {
		this.art = art;
		this.data = data;
		/* The font strip, in the tote board's colour. */
		var strip = art.bitmap('font').image, c = document.createElement('canvas');
		c.width = strip.width;
		c.height = strip.height;
		var g = c.getContext('2d');
		g.drawImage(strip, 0, 0);
		g.globalCompositeOperation = 'source-in';
		g.fillStyle = AMBER;
		g.fillRect(0, 0, c.width, c.height);
		this.font = c;
		if (this.w) { this.newRace(); }
	};

	RatRace.prototype.newRace = function () {
		var names = shuffle(this.data.names.slice()).slice(0, LANES), self = this;
		this.rats = names.map(function (name, i) {
			var odds = 1 + Math.floor(Math.random() * 9);
			return { name: name, n: i + 1, odds: odds, x: self.startX, speed: rand(1 - self.spread, 1 + self.spread),
				antic: null, t: rand(0, 1), done: false };
		});
		this.order = [];
		this.phase = 'post';
		this.clock = 0;
	};

	/** Text in the module's font, in amber; returns its width. */
	RatRace.prototype.text = function (ctx, str, x, y, k) {
		var xs = this.data.font.x, h = this.font.height, pen = x;
		for (var i = 0; i < str.length; i += 1) {
			var c = str.charCodeAt(i) - 32;
			if (c < 0 || c + 1 >= xs.length) { pen += 4 * k; continue; }
			var gw = xs[c + 1] - xs[c];
			ctx.drawImage(this.font, xs[c], 0, gw, h, pen, y, gw * k, h * k);
			pen += gw * k;
		}
		return pen - x;
	};

	RatRace.prototype.board = function (ctx) {
		var q = this.art.sequence(1400), f = q.frames[0], k = Math.max(1, this.s * 1.25);
		var bw = f.w * k, bh = f.h * k, bx = this.w / 2 - bw / 2, by = this.h * 0.03;
		ctx.drawImage(q.image, f.x, f.y, f.w, f.h, bx, by, bw, bh);
		/* The big window on the right of the board. */
		var tx = bx + 78 * k, ty = by + 24 * k, lh = 12 * k * 0.8, fk = k * 0.8;
		var lines;
		if (this.phase === 'post' || this.phase === 'race') {
			lines = this.rats.map(function (r) { return r.n + ' ' + r.name.slice(0, 18) + ' ' + r.odds + '-1'; });
		} else {
			var calls = this.data.calls.places, self = this;
			lines = this.order.slice(0, 3).map(function (r, i) { return calls[i] + '  ' + r.n + ' ' + r.name.slice(0, 16); });
			if (this.photo && Math.floor(this.clock * 2) % 2 === 0) { lines.unshift(this.data.calls.photo); }
			void self;
		}
		for (var i = 0; i < lines.length && i < 7; i += 1) { this.text(ctx, lines[i], tx, ty + i * lh, fk); }
	};

	RatRace.prototype.ground = function (ctx, w, h) {
		if (!this.track) {
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);
			return;
		}
		var grass = this.art.bitmap('grass').image, dirt = this.art.bitmap('dirt').image, x, y;
		for (y = 0; y < h; y += grass.height) { for (x = 0; x < w; x += grass.width) { ctx.drawImage(grass, x, y); } }
		ctx.save();
		ctx.beginPath();
		ctx.rect(0, this.top, w, this.lane * LANES);
		ctx.clip();
		for (y = this.top; y < this.top + this.lane * LANES; y += dirt.height) {
			for (x = 0; x < w; x += dirt.width) { ctx.drawImage(dirt, x, y); }
		}
		ctx.restore();
		ctx.fillStyle = 'rgba(255,255,255,0.85)';
		for (var l = 0; l <= LANES; l += 1) { ctx.fillRect(0, this.top + l * this.lane - 1, w, 2); }
		ctx.fillRect(this.finishX, this.top, 3, this.lane * LANES);
		/* The finish post. */
		var post = this.art.sequence(1001), pf = post.frames[Math.floor(this.clock * 4) % post.count];
		ctx.drawImage(post.image, pf.x, pf.y, pf.w, pf.h, this.finishX - 6, this.top - pf.h * this.s, pf.w * this.s, pf.h * this.s);
	};

	RatRace.prototype.rat = function (ctx, seq, frame, x, y) {
		var q = this.art.sequence(seq), f = q.frames[frame % q.count], k = this.lane / 30;
		ctx.drawImage(q.image, f.x, f.y, f.w, f.h, Math.round(x - f.w * k * 0.7), Math.round(y - f.h * k / 2), f.w * k, f.h * k);
	};

	RatRace.prototype.step = function (dt, ctx, w, h) {
		if (!this.art || !this.rats) {
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);
			return;
		}
		this.clock += dt;
		ctx.imageSmoothingEnabled = true;
		this.ground(ctx, w, h);
		var i, pace = w * 0.1;
		if (this.phase === 'post' && this.clock > 3) {
			this.phase = 'race';
			this.clock = 0;
		}
		var gate = this.art.sequence(1200), open = this.phase === 'post' ? 0 : Math.min(2, Math.floor(this.clock * 6));
		for (i = 0; i < this.rats.length; i += 1) {
			var r = this.rats[i], y = this.top + (i + 0.5) * this.lane;
			if (this.phase === 'race' || this.phase === 'results') {
				r.t += dt;
				if (r.antic) {
					r.antic.t += dt;
					if (r.antic.t > r.antic.len) { r.antic = null; }
				} else {
					r.x += pace * r.speed * rand(0.8, 1.2) * dt;
					if (this.phase === 'race' && Math.random() < this.distract * dt && r.x < this.finishX) {
						var a = ANTICS[Math.floor(Math.random() * ANTICS.length)];
						r.antic = { seq: a[0], frames: a[1], t: 0, len: rand(0.8, 2.5) };
					}
				}
				if (!r.done && r.x >= this.finishX) {
					r.done = true;
					r.when = this.clock;
					this.order.push(r);
				}
			}
			if (r.antic) {
				this.rat(ctx, r.antic.seq, r.antic.frames[Math.floor(r.antic.t * 8) % r.antic.frames.length], r.x, y);
			} else {
				this.rat(ctx, 1100, this.phase === 'post' ? 0 : RUN[Math.floor(r.t * 14) % RUN.length], r.x, y);
			}
			var gf = gate.frames[open];
			ctx.drawImage(gate.image, gf.x, gf.y, gf.w, gf.h, this.startX + 6, y - this.lane / 2, gf.w * this.lane / gf.h * 0.6, this.lane);
		}
		if (this.phase === 'race' && this.order.length >= 3) {
			this.phase = 'results';
			this.clock = 0;
			this.photo = this.order[1].when - this.order[0].when < 0.08;
		}
		if (this.phase === 'results' && this.clock > 7) { this.newRace(); }
		this.board(ctx);
	};

	AfterDark.define('after-dark-rat-race', function (el) {
		var sim = new RatRace(), t = AfterDark.choice(el, 'training', TRAINING, 'high school');
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
