/**
 * hula.js - Hula Twins, Beula Hula and her twin Talula.
 *
 * HULA.AD's own description:
 *
 *   "Hula hula, badula lula, banana fanana . . . "Music" determines how long
 *    the music plays while the twins hula."
 *   Programming by Peter A. Kemmer. Concept and art by Stephen Ekstrom.
 *   Backgrounds by Craig Foster. Sound and music by P.J. Sonnichsen.
 *
 * The twins are not moved by code. HULA.AD carries its whole choreography in
 * three resources the RLE artwork sits beside (the same scheme Bad Dog! uses,
 * see tools/adchoreo.py), exported to all/art/hula/movie.json:
 *
 *   TYPE_8100 17000-17002  1090 "steps": finished pictures, each a list of
 *                          sprites (frame, z, flip, left, top) - the girl, her
 *                          hoop, and her eyes, which are separate little
 *                          sprites (17029, the last 28 frames) laid on top.
 *   TYPE_8102 17000        2216 ticks of "cues" (step, dx, dy). Ticks run in
 *                          blocks with gaps between them; a block is one move.
 *
 * The first six blocks are not moves: they are the six ways the five chalk
 * drawings (17028 and 17029's big frames - hopscotch, noughts and crosses, a
 * cat, a sun and a heart with "Hula" in it) are laid out on the pavement, and
 * one is picked as the background. The rest are moves: the hoop dropping out
 * of the sky, walking on, standing about beside the hoop on the ground,
 * picking it up, hula-ing with it at the waist, the knees, round the neck,
 * spinning it on an arm, throwing it to the sky and catching it, cartwheels,
 * hula-hopping across the pavement.
 *
 * Which move follows which is the module's code, and that was not decoded.
 * Here a move may follow another when it starts on exactly the picture the
 * other ends on (same frames), which is how the blocks were cut; the twin is
 * shifted by the difference so that travelling moves carry her along. While
 * the music plays, moves with the hoop up are favoured; after it stops, the
 * ones with it on the ground. Also filled in: the twins' spot (somewhere
 * random, the second 160 pixels right of the first, as in both captures),
 * the walk on at the start and the frame rate, 12 a second, measured off a
 * capture of the real thing.
 *
 *   <after-dark-hula-twins art="art/hula" music="always"></after-dark-hula-twins>
 */
(function () {
	'use strict';

	var MUSIC = ['never', '1 min.', '2 min.', '5 min.', '30 min.', 'always'];
	var MUSIC_SECS = [0, 60, 120, 300, 1800, Infinity];
	var TICK = 1 / 12;
	var LAYOUTS = [1, 6, 11, 16, 21, 26];
	var APART = 160;
	/* Sequences in which the hoop is up and going. */
	var HULA = [17000, 17001, 17002, 17003, 17004, 17008, 17009, 17010, 17012, 17013, 17014,
		17016, 17017, 17018, 17024, 17025, 17026, 17027, 17030, 17031];

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	function Hula() {
		this.art = null;
		this.movie = null;
		this.musicFor = Infinity;
		this.clock = 0;
		this.acc = 0;
	}

	Hula.prototype.setArt = function (art, movie) {
		this.art = art;
		this.movie = movie;
		var cues = movie.cues, ticks = Object.keys(cues).map(Number).sort(function (a, b) { return a - b; });
		var blocks = [], start = ticks[0], prev = ticks[0];
		for (var i = 1; i <= ticks.length; i += 1) {
			if (i === ticks.length || ticks[i] !== prev + 1) {
				blocks.push({ from: start, to: prev });
				start = ticks[i];
			}
			prev = ticks[i];
		}
		var self = this;
		this.byStart = {};
		blocks.forEach(function (b) {
			b.first = self.pose(b.from);
			b.last = self.pose(b.to);
			b.hula = false;
			for (var t = b.from; t <= b.to && !b.hula; t += 1) {
				var st = movie.steps[cues[t][0]];
				for (var k = 0; k < st.length; k += 1) {
					var fr = movie.frames[st[k][0]];
					if (fr && HULA.indexOf(fr[0]) >= 0 && st[k][1] < 10) { b.hula = true; }
				}
			}
			self.byStart[b.from] = b;
		});
		/* A move may follow one that ends on its first picture. */
		blocks.forEach(function (b) {
			b.next = blocks.filter(function (c) {
				return c.from > 26 && c.first.key === b.last.key;
			});
		});
		this.blocks = blocks.filter(function (b) { return b.from > 26; });
		this.layout = pick(LAYOUTS);
		this.started = false;
	};

	/* The sprites of a tick that are the twin and her hoop, as one key, and
	   where the first of them is. */
	Hula.prototype.pose = function (t) {
		var c = this.movie.cues[t], st = this.movie.steps[c[0]];
		var body = st.filter(function (s) { return s[1] < 10; });
		return {
			key: body.map(function (s) { return s[0]; }).join(','),
			x: body.length ? body[0][3] + c[1] : 0,
			y: body.length ? body[0][4] + c[2] : 0
		};
	};

	Hula.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		/* Scenes were made for 640x480 and up; smaller screens see it scaled. */
		this.s = Math.min(1, w / 760, h / 520);
		this.started = false;
	};

	/* --------------------------------------------------------------- twins --- */

	Hula.prototype.start = function () {
		var vw = this.w / this.s, vh = this.h / this.s;
		/* Where the first twin hulas: her picture's top left is at stage
		   (287, 204), so this is the shift that puts her there. */
		var sx = vw * (0.25 + Math.random() * 0.3) - (APART / 2), sy = vh * (0.45 + Math.random() * 0.25);
		var self = this;
		this.twins = [0, 1].map(function (n) {
			var bx = sx + n * APART - 320, by = sy - 281;
			var tw = { bx: bx, by: by, queue: [], hoop: null, flip: n === 1 };
			/* The hoop drops in (or rolls in), and she walks on to it. */
			tw.hoop = { from: n ? 60 : 30, to: n ? 88 : 56, t: n ? 60 : 30, delay: n * 3.5 };
			tw.walk = [92, 108, 231];
			tw.wait = n * 3.5;
			return tw;
		});
		this.started = true;
		this.clock = 0;
	};

	Hula.prototype.chooseNext = function (tw, b) {
		var music = this.clock < this.musicFor;
		var opts = b.next;
		if (!opts.length) {
			/* No move starts where this one ends: put the hoop down and stand. */
			opts = [this.byStart[1091]];
		}
		var vw = this.w / this.s;
		var good = opts.filter(function (c) {
			var x = tw.bx + (b.last.x - c.first.x) + c.last.x;
			return x > 20 && x < vw - 100;
		});
		if (good.length) { opts = good; }
		var pref = opts.filter(function (c) { return c.hula === music; });
		var c = pick(pref.length && Math.random() < 0.9 ? pref : opts);
		if (b.next.indexOf(c) >= 0) {
			tw.bx += b.last.x - c.first.x;
			tw.by += b.last.y - c.first.y;
		}
		return c;
	};

	Hula.prototype.advance = function (tw) {
		if (tw.walk) {
			/* The walk on, shifted so that it ends where she stands. */
			if (!tw.block) {
				tw.block = this.byStart[tw.walk.shift()];
				tw.t = tw.block.from;
				tw.wx = 287 - 261;
				return;
			}
			if (tw.t < tw.block.to) { tw.t += 1; return; }
			if (tw.walk.length) {
				var nb = this.byStart[tw.walk.shift()];
				tw.wx += tw.block.last.x - nb.first.x;
				tw.block = nb;
				tw.t = nb.from;
				return;
			}
			tw.walk = null;
			tw.hoop = null;
			tw.block = this.byStart[1091];
			tw.t = tw.block.from;
			return;
		}
		if (tw.t < tw.block.to) { tw.t += 1; return; }
		tw.block = this.chooseNext(tw, tw.block);
		tw.t = tw.block.from;
	};

	Hula.prototype.drawStep = function (ctx, t, ox, oy, mirror, mx) {
		var c = this.movie.cues[t];
		if (!c) { return; }
		var st = this.movie.steps[c[0]].slice().sort(function (a, b) { return a[1] - b[1]; });
		for (var i = 0; i < st.length; i += 1) {
			var fr = this.movie.frames[st[i][0]];
			if (!fr) { continue; }
			var seq = this.art.sequence(fr[0]);
			if (!seq) { continue; }
			var f = seq.frames[fr[1]];
			var x = st[i][3] + c[1], y = st[i][4] + c[2];
			var flip = !!st[i][2] !== !!mirror;
			if (mirror) { x = 2 * mx - x - f.w; }
			ctx.save();
			ctx.translate(Math.round(ox + x + f.w / 2), Math.round(oy + y + f.h / 2));
			if (flip) { ctx.scale(-1, 1); }
			ctx.drawImage(seq.image, f.x, f.y, f.w, f.h, -f.w / 2, -f.h / 2, f.w, f.h);
			ctx.restore();
		}
	};

	Hula.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.movie) { return; }
		if (!this.started) { this.start(); }
		this.clock += dt;
		this.acc += dt;
		var self = this;
		while (this.acc >= TICK) {
			this.acc -= TICK;
			this.twins.forEach(function (tw) {
				if (tw.wait > 0) { tw.wait -= TICK; }
				if (tw.hoop) {
					if (tw.hoop.delay > 0) { tw.hoop.delay -= TICK; } else if (tw.hoop.t < tw.hoop.to) {
						tw.hoop.t += 1;
						while (!self.movie.cues[tw.hoop.t] && tw.hoop.t < tw.hoop.to) { tw.hoop.t += 1; }
					}
				}
				if (tw.wait <= 0) { self.advance(tw); }
			});
		}

		ctx.save();
		ctx.scale(this.s, this.s);
		ctx.imageSmoothingEnabled = false;
		var vw = w / this.s, vh = h / this.s;
		/* The chalk drawings, centred on the screen as a group. */
		var lc = this.movie.cues[this.layout], ls = this.movie.steps[lc[0]];
		var l = Infinity, tp = Infinity, r = -Infinity, b = -Infinity;
		ls.forEach(function (s) {
			var fr = self.movie.frames[s[0]], seq = fr && self.art.sequence(fr[0]);
			if (!seq) { return; }
			var f = seq.frames[fr[1]];
			l = Math.min(l, s[3]); tp = Math.min(tp, s[4]);
			r = Math.max(r, s[3] + f.w); b = Math.max(b, s[4] + f.h);
		});
		this.drawStep(ctx, this.layout, Math.round((vw - (r - l)) / 2 - l), Math.round((vh - (b - tp)) / 2 - tp));

		/* Nearer twin drawn last. */
		var order = this.twins.slice().sort(function (a, c) { return a.by - c.by; });
		order.forEach(function (tw) {
			if (tw.hoop && tw.hoop.delay <= 0) {
				self.drawStep(ctx, tw.hoop.t, tw.bx, tw.by, tw.flip, 320);
			}
			if (tw.block && tw.wait <= 0) {
				self.drawStep(ctx, tw.t, tw.bx + (tw.walk ? (tw.flip ? -tw.wx : tw.wx) : 0), tw.by,
					tw.walk ? tw.flip : false, 320);
			}
		});
		ctx.restore();
	};

	AfterDark.define('after-dark-hula-twins', function (el) {
		var sim = new Hula();
		sim.musicFor = MUSIC_SECS[AfterDark.choice(el, 'music', MUSIC, 'always')];
		var base = (AfterDark.setting(el, 'art') || 'art/hula').replace(/\/$/, '');
		Promise.all([
			AfterDark.load(base),
			fetch(base + '/movie.json').then(function (r) { return r.json(); })
		]).then(function (got) {
			sim.setArt(got[0], got[1]);
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkHula = Hula;
}());
