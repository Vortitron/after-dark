/**
 * dominoes.js - Dominoes, a game played so you don't have to.
 *
 * DOMINOES.AD's own description:
 *
 *   "DOMINOES (tm) Plays a game of dominoes so you don't have to.
 *    Original Mac version by Patrick C. Beard. Artwork by Igor Gasowski."
 *
 * Its controls are Speed (Slow, Medium, Fast) and Type (Wood, Ivory, B&W,
 * Random). The tiles are its own, in all/art/dominoes/: for each set a pip,
 * the back, the blank face with its divider and the tile standing on edge,
 * across and upright, cut out by their masks; its DOMINO_METRIC resources say
 * where the face sits on the tile, and the pips go on in the usual pattern.
 *
 * Two hands of seven, standing on edge, top and bottom; the rest face down
 * in the boneyard. The chain grows from the first tile at both ends, doubles
 * laid across, and turns a corner at the side of the screen. Whoever cannot
 * play draws; when a hand is empty or nobody can go, the tiles are cleared
 * and it deals again.
 *
 *   <after-dark-dominoes art="art/dominoes" speed="medium" type="random">
 */
(function () {
	'use strict';

	var SPEEDS = ['slow', 'medium', 'fast'];
	var MOVE = [1.0, 0.55, 0.28];
	var TYPES = ['wood', 'ivory', 'b&w', 'random'];
	var SETS = ['wood', 'ivory', 'bw'];
	/* DOMINO_METRIC: across, a tile is 119x61 with its face 113x55 inset 3. */
	var LONG = 119, SHORT = 61, INSET = 3, FACE_L = 113, FACE_S = 55;
	var PIPS = [[], [[0.5, 0.5]], [[0.22, 0.22], [0.78, 0.78]], [[0.22, 0.22], [0.5, 0.5], [0.78, 0.78]],
		[[0.22, 0.22], [0.78, 0.22], [0.22, 0.78], [0.78, 0.78]],
		[[0.22, 0.22], [0.78, 0.22], [0.5, 0.5], [0.22, 0.78], [0.78, 0.78]],
		[[0.25, 0.2], [0.25, 0.5], [0.25, 0.8], [0.75, 0.2], [0.75, 0.5], [0.75, 0.8]]];

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
		this.move = MOVE[1];
		this.type = 'random';
		this.art = null;
	}

	Dominoes.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.sc = Math.max(0.3, Math.min(w, h) / 720);
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
		this.turn = 0;
		this.passes = 0;
		this.anim = null;
		this.pause = 1;
		this.over = false;
	};

	/* ---------------------------------------------------------- layout -- */

	/** Where a hand's i'th tile stands: top row for player 1, bottom for player 0. */
	Dominoes.prototype.handSlot = function (p, i, n) {
		/* Stood up side by side, a little smaller than on the table. */
		var sc = this.sc * 0.62, ew = 41 * sc, eh = 135 * sc;
		var step = Math.min(ew * 1.15, (this.w - ew - 20) / Math.max(1, n - 1));
		var x0 = (this.w - (step * (n - 1) + ew)) / 2;
		return { x: x0 + step * i, y: p === 0 ? this.h - eh - 6 : 6, w: ew, h: eh };
	};

	Dominoes.prototype.boneSlot = function (i) {
		var sc = this.sc;
		return { x: 10 + (i % 2) * 20 * sc, y: this.h / 2 - 90 * sc + i * 9 * sc, w: SHORT * sc, h: LONG * sc };
	};

	/**
	 * Where a tile goes on one end of the chain, and the end afterwards.
	 * Ends run sideways. At the edge of the table the chain turns: two tiles
	 * upright, down (or up), which leaves room for doubles laid across in both
	 * rows, then back the other way. It only turns once each way; by then the
	 * boneyard has usually run out.
	 */
	Dominoes.prototype.place = function (end, tile, match) {
		var sc = this.sc, L = LONG * sc, S = SHORT * sc, m = 12 * sc;
		/* Keep clear of the boneyard on the left. */
		var left = this.boneSlot(0).x + 20 * sc + S + m;
		var dbl = tile.a === tile.b, other = tile.a === match ? tile.b : tile.a;
		var e = { x: end.x, y: end.y, dir: end.dir, vdir: end.vdir, value: other, turned: end.turned, down: 0 };
		var spot, top;
		if (end.down) {
			/* Going round the corner: upright, in the same column. */
			top = end.vdir > 0 ? end.y : end.y - L;
			spot = { x: end.x, y: top, up: true, a: end.vdir > 0 ? match : other, b: end.vdir > 0 ? other : match };
			if (end.down > 1) {
				e.x = end.x;
				e.y = end.vdir > 0 ? top + L : top;
				e.down = end.down - 1;
			} else {
				e.x = end.dir > 0 ? end.x + S : end.x;
				e.y = end.vdir > 0 ? top + L * 0.75 : top + L * 0.25;
			}
			return { spot: spot, end: e };
		}
		var need = dbl ? S : L;
		var room = end.dir > 0 ? this.w - m - end.x : end.x - left;
		if (need <= room || end.turned) {
			if (dbl) {
				spot = { x: end.dir > 0 ? end.x : end.x - S, y: end.y - L / 2, up: true, a: match, b: match };
				e.x = end.dir > 0 ? end.x + S : end.x - S;
			} else {
				spot = { x: end.dir > 0 ? end.x : end.x - L, y: end.y - S / 2, up: false,
					a: end.dir > 0 ? match : other, b: end.dir > 0 ? other : match };
				e.x = end.dir > 0 ? end.x + L : end.x - L;
			}
			return { spot: spot, end: e };
		}
		/* The first tile of the corner, just past the end of the row. */
		top = end.vdir > 0 ? end.y - S / 2 : end.y + S / 2 - L;
		spot = { x: end.dir > 0 ? end.x : end.x - S, y: top, up: true,
			a: end.vdir > 0 ? match : other, b: end.vdir > 0 ? other : match };
		e.dir = -end.dir;
		e.x = spot.x;
		e.y = end.vdir > 0 ? top + L : top;
		e.down = 1;
		e.turned = 1;
		return { spot: spot, end: e };
	};

	/* ------------------------------------------------------------- play -- */

	Dominoes.prototype.options = function (hand) {
		var out = [];
		if (!this.ends) {
			hand.forEach(function (t, i) { out.push({ i: i, side: 0 }); });
			return out;
		}
		var ends = this.ends;
		hand.forEach(function (t, i) {
			[0, 1].forEach(function (side) {
				var v = ends[side].value;
				if (t.a === v || t.b === v) { out.push({ i: i, side: side }); }
			});
		});
		return out;
	};

	Dominoes.prototype.nextMove = function () {
		var p = this.turn, hand = this.hands[p];
		var opts = this.options(hand);
		if (!opts.length) {
			if (this.bone.length) {
				/* Draw one and think again. */
				var t = this.bone.pop(), from = this.boneSlot(this.bone.length);
				hand.push(t);
				this.anim = { kind: 'draw', tile: t, from: from, to: this.handSlot(p, hand.length - 1, hand.length), t: 0 };
				return;
			}
			this.passes += 1;
			if (this.passes >= 2) { this.finish(); return; }
			this.turn = 1 - p;
			this.pause = this.move;
			return;
		}
		this.passes = 0;
		/* Doubles first, then the heaviest - a simple player. */
		opts.sort(function (x, y) {
			var tx = hand[x.i], ty = hand[y.i];
			return ((ty.a === ty.b) * 20 + ty.a + ty.b) - ((tx.a === tx.b) * 20 + tx.a + tx.b);
		});
		var choice = opts[0], tile = hand[choice.i], from = this.handSlot(p, choice.i, hand.length);
		hand.splice(choice.i, 1);
		var placed;
		if (!this.ends) {
			var sc = this.sc, cx = this.w / 2, cy = this.h / 2;
			var dbl = tile.a === tile.b;
			var spot = dbl ? { x: cx - SHORT * sc / 2, y: cy - LONG * sc / 2, up: true, a: tile.a, b: tile.b }
				: { x: cx - LONG * sc / 2, y: cy - SHORT * sc / 2, up: false, a: tile.a, b: tile.b };
			var half = (dbl ? SHORT : LONG) * sc / 2;
			this.ends = [{ x: cx - half, y: cy, dir: -1, vdir: -1, value: tile.a, turned: 0 },
				{ x: cx + half, y: cy, dir: 1, vdir: 1, value: tile.b, turned: 0 }];
			placed = spot;
		} else {
			var end = this.ends[choice.side];
			var res = this.place(end, tile, end.value);
			this.ends[choice.side] = res.end;
			placed = res.spot;
		}
		this.anim = { kind: 'play', tile: tile, spot: placed, from: from, t: 0 };
	};

	Dominoes.prototype.finish = function () {
		this.over = true;
		this.pause = 3.5;
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
				ctx.drawImage(pip, ox + p[0] * hw - ps / 2, oy + p[1] * hh - ps / 2, ps, ps);
			});
		});
	};

	Dominoes.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.art) { return; }
		var i, sc = this.sc;
		if (this.anim) {
			var a = this.anim;
			a.t += dt / this.move;
			if (a.t >= 1) {
				if (a.kind === 'play') {
					this.chain.push(a.spot);
					if (!this.hands[this.turn].length) { this.finish(); } else { this.turn = 1 - this.turn; }
				}
				this.anim = null;
				this.pause = this.move * 0.4;
			}
		} else {
			this.pause -= dt;
			if (this.pause <= 0) {
				if (this.over) { this.deal(); } else { this.nextMove(); }
			}
		}
		ctx.imageSmoothingEnabled = true;
		/* The boneyard. */
		for (i = 0; i < this.bone.length; i += 1) {
			var bs = this.boneSlot(i);
			ctx.drawImage(this.img('backv'), bs.x, bs.y, bs.w, bs.h);
		}
		/* The hands, on edge. */
		for (var p = 0; p < 2; p += 1) {
			var hand = this.hands[p];
			for (i = 0; i < hand.length; i += 1) {
				if (this.anim && this.anim.kind === 'draw' && this.anim.tile === hand[i]) { continue; }
				var hs = this.handSlot(p, i, hand.length);
				ctx.drawImage(this.img('edgev'), hs.x, hs.y, hs.w, hs.h);
			}
		}
		/* The chain. When the game is over it fades before the next deal. */
		if (this.over) { ctx.globalAlpha = Math.max(0, Math.min(1, this.pause / 1.5)); }
		for (i = 0; i < this.chain.length; i += 1) { this.face(ctx, this.chain[i], this.chain[i].x, this.chain[i].y); }
		ctx.globalAlpha = 1;
		if (this.anim) {
			var an = this.anim, k = an.t * an.t * (3 - 2 * an.t);
			if (an.kind === 'play') {
				this.face(ctx, an.spot, an.from.x + (an.spot.x - an.from.x) * k, an.from.y + (an.spot.y - an.from.y) * k);
			} else {
				ctx.drawImage(this.img('backv'), an.from.x + (an.to.x - an.from.x) * k,
					an.from.y + (an.to.y - an.from.y) * k, SHORT * sc, LONG * sc);
			}
		}
	};

	AfterDark.define('after-dark-dominoes', function (el) {
		var sim = new Dominoes();
		sim.move = MOVE[AfterDark.choice(el, 'speed', SPEEDS, 'medium')];
		sim.type = TYPES[AfterDark.choice(el, 'type', TYPES, 'random')];
		AfterDark.load(AfterDark.setting(el, 'art') || 'art/dominoes').then(function (art) {
			sim.art = art;
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkDominoes = Dominoes;
}());
