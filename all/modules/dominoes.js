/**
 * dominoes.js - Dominoes, a game played so you don't have to.
 *
 * DOMINOES.AD's own description:
 *
 *   "DOMINOES (tm) Plays a game of dominoes so you don't have to.
 *    Original Mac version by Patrick C. Beard. Artwork by Igor Gasowski."
 *
 * Its controls are Speed (Slow, Medium, Fast) and Type (Wood, Ivory, B&W,
 * Random); the defaults are Medium (the slider sits at 54) and Wood. The
 * tiles are its own, in all/art/dominoes/: for each set a pip, the back, the
 * blank face with its divider and the tile standing on edge, across and
 * upright, cut out by their masks; its DOMINO_METRIC resources say where the
 * face sits on the tile.
 *
 * Checked against the module running (8-bit capture, default settings): the
 * hands are never shown. Each tile in turn flies in face down from off the
 * edge of the screen, slows into its place at an end of the chain and turns
 * face up, about a second and a half a tile. The chain starts anywhere and
 * winds about the screen - it turns a corner now and then, not only at the
 * edges, the new tile tucked against the side of the last one, flush with
 * its end - with doubles laid across. Tiles are drawn at their own size,
 * about 116 px apart along the chain. A horizontal half shows a 2 or 3 as
 * a "\" and a 6 as three across; an upright half is the same turned a
 * quarter. When nobody can go the table is cleared and it deals again. The
 * play behind it (two hands of seven and a boneyard, doubles and heavy tiles
 * first) is this port's; how often it turns is a guess.
 *
 *   <after-dark-dominoes art="art/dominoes" speed="medium" type="wood">
 */
(function () {
	'use strict';

	var SPEEDS = ['slow', 'medium', 'fast'];
	/* How fast a tile flies in (px a second), and the rest between tiles. */
	var FLY = [330, 550, 950];
	var REST = [0.9, 0.45, 0.2];
	var TYPES = ['wood', 'ivory', 'b&w', 'random'];
	var SETS = ['wood', 'ivory', 'bw'];
	/* DOMINO_METRIC: across, a tile is 119x61 with its face 113x55 inset 3. */
	var LONG = 119, SHORT = 61, INSET = 3, FACE_L = 113, FACE_S = 55;
	/* Where tiles sit, which leaves their shadow edges showing between them. */
	var STEP_L = 116, STEP_S = 58;
	var TURN = 0.3;
	/* Pips on a half of a tile lying across: u along the tile, v across it. */
	var PIPS = [[], [[0.5, 0.5]], [[0.22, 0.22], [0.78, 0.78]], [[0.22, 0.22], [0.5, 0.5], [0.78, 0.78]],
		[[0.22, 0.22], [0.78, 0.22], [0.22, 0.78], [0.78, 0.78]],
		[[0.22, 0.22], [0.78, 0.22], [0.5, 0.5], [0.22, 0.78], [0.78, 0.78]],
		[[0.22, 0.25], [0.5, 0.25], [0.78, 0.25], [0.22, 0.75], [0.5, 0.75], [0.78, 0.75]]];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function shuffle(list) {
		for (var i = list.length - 1; i > 0; i -= 1) {
			var j = Math.floor(Math.random() * (i + 1));
			var t = list[i];
			list[i] = list[j];
			list[j] = t;
		}
		return list;
	}

	function Dominoes() {
		this.speed = 1;
		this.type = 'wood';
		this.art = null;
	}

	Dominoes.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		/* Their own size at 1024x768; bigger only on a big screen. */
		this.sc = Math.max(1, Math.floor(Math.min(w, h) / 768));
		this.deal();
	};

	Dominoes.prototype.deal = function () {
		this.set = this.type === 'random' ? SETS[Math.floor(Math.random() * 3)] : SETS[TYPES.indexOf(this.type)] || 'wood';
		var tiles = [];
		for (var a = 0; a <= 6; a += 1) {
			for (var b = a; b <= 6; b += 1) { tiles.push({ a: a, b: b }); }
		}
		shuffle(tiles);
		this.hands = [tiles.slice(0, 7), tiles.slice(7, 14)];
		this.bone = tiles.slice(14);
		this.chain = [];
		this.ends = null;
		this.turn = Math.random() < 0.5 ? 0 : 1;
		this.passes = 0;
		this.anim = null;
		this.pause = 0.6;
		this.over = false;
	};

	/* ---------------------------------------------------------- layout -- */

	/** The rect a tile takes running along `dir` from point (x, y) on a line. */
	function along(x, y, dir, len, wid) {
		var dx = dir[0], dy = dir[1];
		if (dx) { return { x: dx > 0 ? x : x - len, y: y - wid / 2, w: len, h: wid }; }
		return { x: x - wid / 2, y: dy > 0 ? y : y - len, w: wid, h: len };
	}

	Dominoes.prototype.free = function (r) {
		var m = 4 * this.sc;
		if (r.x < m || r.y < m || r.x + r.w > this.w - m || r.y + r.h > this.h - m) { return false; }
		for (var i = 0; i < this.chain.length; i += 1) {
			var c = this.chain[i];
			if (r.x < c.x + c.w - 2 && c.x < r.x + r.w - 2 && r.y < c.y + c.h - 2 && c.y < r.y + r.h - 2) { return false; }
		}
		return true;
	};

	/**
	 * Every way a tile can go on an end: straight on, or (not for a double)
	 * round a corner either way, tucked against the side of the end tile and
	 * flush with its end. Each is {rect, end} - where the end is afterwards.
	 */
	Dominoes.prototype.spots = function (end, dbl) {
		var L = STEP_L * this.sc, S = STEP_S * this.sc, out = [], d = end.dir;
		var r = dbl ? along(end.x, end.y, d, S, L) : along(end.x, end.y, d, L, S);
		out.push({ rect: r, turn: false, end: { x: end.x + d[0] * r.w, y: end.y + d[1] * r.h, dir: d, last: r } });
		if (!dbl) {
			var last = end.last;
			[[d[1], d[0]], [-d[1], -d[0]]].forEach(function (d2) {
				/* Along d: the S nearest the end. Along d2: from the side of the last tile. */
				var lineX, lineY, sx, sy;
				if (d[0]) {
					lineX = end.x - d[0] * S / 2;
					sy = d2[1] > 0 ? last.y + last.h : last.y;
					out.push({ rect: along(lineX, sy, d2, L, S), turn: true,
						end: { x: lineX, y: sy + d2[1] * L, dir: d2, last: along(lineX, sy, d2, L, S) } });
				} else {
					lineY = end.y - d[1] * S / 2;
					sx = d2[0] > 0 ? last.x + last.w : last.x;
					out.push({ rect: along(sx, lineY, d2, L, S), turn: true,
						end: { x: sx + d2[0] * L, y: lineY, dir: d2, last: along(sx, lineY, d2, L, S) } });
				}
			});
		}
		var self = this;
		return out.filter(function (o) { return self.free(o.rect); });
	};

	/** Pick where a tile goes on an end, or null if it cannot go there. */
	Dominoes.prototype.where = function (end, dbl) {
		var ok = this.spots(end, dbl);
		if (!ok.length) { return null; }
		var straight = ok.filter(function (o) { return !o.turn; }), turns = ok.filter(function (o) { return o.turn; });
		if (straight.length && (!turns.length || Math.random() > TURN)) { return straight[0]; }
		return turns[Math.floor(Math.random() * turns.length)];
	};

	/* ------------------------------------------------------------- play -- */

	/** The plays a hand has: [{i, side, spot}], side null for the first tile. */
	Dominoes.prototype.options = function (hand) {
		var out = [], self = this;
		hand.forEach(function (t, i) {
			var dbl = t.a === t.b;
			if (!self.ends) {
				out.push({ i: i, side: null });
				return;
			}
			[0, 1].forEach(function (side) {
				var v = self.ends[side].value;
				if (t.a !== v && t.b !== v) { return; }
				var spot = self.where(self.ends[side], dbl);
				if (spot) { out.push({ i: i, side: side, spot: spot }); }
			});
		});
		return out;
	};

	Dominoes.prototype.nextMove = function () {
		var p = this.turn, hand = this.hands[p];
		var opts = this.options(hand);
		while (!opts.length && this.bone.length) {
			/* Draw from the boneyard - out of sight - until it plays. */
			hand.push(this.bone.pop());
			opts = this.options(hand);
		}
		if (!opts.length) {
			this.passes += 1;
			if (this.passes >= 2) { this.finish(); return; }
			this.turn = 1 - p;
			return;
		}
		this.passes = 0;
		/* Doubles first, then the heaviest - a simple player. */
		opts.sort(function (x, y) {
			var tx = hand[x.i], ty = hand[y.i];
			return ((ty.a === ty.b) * 20 + ty.a + ty.b) - ((tx.a === tx.b) * 20 + tx.a + tx.b);
		});
		var choice = opts[0], tile = hand[choice.i];
		hand.splice(choice.i, 1);
		var sc = this.sc, L = STEP_L * sc, S = STEP_S * sc, dbl = tile.a === tile.b, spot, rect;
		if (!this.ends) {
			/* The first tile goes down anywhere, across, with room round it. */
			var cx = rand(this.w * 0.25, this.w * 0.75), cy = rand(this.h * 0.2, this.h * 0.8);
			rect = dbl ? { x: cx - S / 2, y: cy - L / 2, w: S, h: L } : { x: cx - L / 2, y: cy - S / 2, w: L, h: S };
			var half = rect.w / 2;
			this.ends = [{ x: cx - half, y: cy, dir: [-1, 0], value: tile.a, last: rect },
				{ x: cx + half, y: cy, dir: [1, 0], value: tile.b, last: rect }];
			spot = { x: rect.x, y: rect.y, w: rect.w, h: rect.h, up: dbl, a: tile.a, b: tile.b };
		} else {
			var end = this.ends[choice.side], match = end.value, other = tile.a === match ? tile.b : tile.a;
			var at = choice.spot;
			rect = at.rect;
			var d = at.end.dir, up = rect.h > rect.w;
			/* The matching half goes next to the chain: first along the way it runs. */
			var first = dbl || (d[0] + d[1] > 0);
			spot = { x: rect.x, y: rect.y, w: rect.w, h: rect.h, up: up, a: first ? match : other, b: first ? other : match };
			this.ends[choice.side] = { x: at.end.x, y: at.end.y, dir: d, value: other, last: rect };
		}
		/* It flies in face down from somewhere off the edge of the screen. */
		var edge = Math.floor(Math.random() * 4), fx, fy;
		if (edge === 0) { fx = -spot.w; fy = rand(-spot.h, this.h); } else if (edge === 1) { fx = this.w; fy = rand(-spot.h, this.h); } else if (edge === 2) { fx = rand(-spot.w, this.w); fy = -spot.h; } else { fx = rand(-spot.w, this.w); fy = this.h; }
		var dist = Math.hypot(spot.x - fx, spot.y - fy);
		this.anim = { tile: tile, spot: spot, from: { x: fx, y: fy }, t: 0, time: Math.max(0.5, dist / (FLY[this.speed] * sc)) };
	};

	Dominoes.prototype.finish = function () {
		this.over = true;
		this.pause = 3;
	};

	/* ---------------------------------------------------------- drawing -- */

	Dominoes.prototype.img = function (part) {
		return this.art.bitmap(this.set + '-' + part).image;
	};

	Dominoes.prototype.face = function (ctx, spot, x, y) {
		var sc = this.sc, up = spot.up;
		var w = (up ? SHORT : LONG) * sc, h = (up ? LONG : SHORT) * sc;
		ctx.drawImage(this.img(up ? 'facev' : 'faceh'), x, y, w, h);
		var pip = this.img('pip'), ps = pip.width * sc;
		var fx = x + INSET * sc, fy = y + INSET * sc;
		var hw = (up ? FACE_S : FACE_L / 2) * sc, hh = (up ? FACE_L / 2 : FACE_S) * sc;
		[spot.a, spot.b].forEach(function (n, half) {
			var ox = up ? fx : fx + half * hw, oy = up ? fy + half * hh : fy;
			PIPS[n].forEach(function (p) {
				/* Upright, the pattern is turned a quarter. */
				var px = up ? 1 - p[1] : p[0], py = up ? p[0] : p[1];
				ctx.drawImage(pip, Math.round(ox + px * hw - ps / 2), Math.round(oy + py * hh - ps / 2), ps, ps);
			});
		});
	};

	Dominoes.prototype.back = function (ctx, spot, x, y) {
		var im = this.img(spot.up ? 'backv' : 'backh');
		ctx.drawImage(im, Math.round(x), Math.round(y), im.width * this.sc, im.height * this.sc);
	};

	Dominoes.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.art) { return; }
		var i;
		if (this.anim) {
			var a = this.anim;
			a.t += dt / a.time;
			if (a.t >= 1) {
				this.chain.push(a.spot);
				if (!this.hands[this.turn].length) { this.finish(); } else { this.turn = 1 - this.turn; }
				this.anim = null;
				this.pause = REST[this.speed];
			}
		} else {
			this.pause -= dt;
			if (this.pause <= 0) {
				if (this.over) { this.deal(); } else { this.nextMove(); }
			}
		}
		ctx.imageSmoothingEnabled = false;
		for (i = 0; i < this.chain.length; i += 1) { this.face(ctx, this.chain[i], this.chain[i].x, this.chain[i].y); }
		if (this.anim) {
			/* Steady, then slowing into place. */
			var an = this.anim, k = 1 - Math.pow(1 - Math.min(1, an.t), 2);
			this.back(ctx, an.spot, an.from.x + (an.spot.x - an.from.x) * k, an.from.y + (an.spot.y - an.from.y) * k);
		}
	};

	AfterDark.define('after-dark-dominoes', function (el) {
		var sim = new Dominoes();
		sim.speed = AfterDark.choice(el, 'speed', SPEEDS, 'medium');
		sim.type = TYPES[AfterDark.choice(el, 'type', TYPES, 'wood')];
		AfterDark.load(AfterDark.setting(el, 'art') || 'art/dominoes').then(function (art) {
			sim.art = art;
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkDominoes = Dominoes;
}());
