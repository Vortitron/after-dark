/**
 * rainforest.js - Rainforest, on the module's own artwork and choreography.
 *
 * RAIN.AD, After Dark 4.0 - built on Berkeley Systems' Triazzle puzzle engine
 * (its classes are Triazzle, God, Vermin, TriazzleSequence). Description:
 *
 *   "Rainforest:  Deep in the jungle..."
 *   Creatures from STRINGLIST 666: Dragonfly, Peruvian, Lehman's, Beetle,
 *   Butterfly, Turtle (the two frogs are poison-dart frogs).
 *
 * Settings, out of TYPE_1000: Creatures... (any of the six, all by default),
 * Number (a slider, 57 by default; up to 25 / 50 / 75 / 100 gives a quarter,
 * half, three quarters or all of 24 creatures, shared out between the chosen
 * kinds), Background = Desktop / Black / Leaves / Wet Blue / Moss / Lichen /
 * Rock / Mottled / Soft Green / Random (the default), and Foliage (on).
 *
 * Nothing here is invented. The creatures play the module's own compound
 * sequences (TYPE_8100/8102 5400-6700, exported to art/rain/compound.json)
 * through the CompoundSprite engine of fish-world.js / toasters-40.js, and
 * the rest is RAIN.AD's code read out of its disassembly:
 *
 * - Triazzle::DoTileBackground: the background is one of the seven tile
 *   pictures of movie 1000 (Leaves = 1000 frame 0, Wet Blue, Moss, Lichen,
 *   Rock, Mottled, Soft Green), tiled from a random offset; Foliage adds
 *   DrawRandomHorizontals / Verticals / Corner - eight edge pieces and the
 *   four corners, mirrored to fit, pushed up to a quarter of their size off
 *   the screen.
 * - God: creatures are born off screen in slots along the edges (98 px apart
 *   along the sides, 70 px along the top and bottom), each kind kept to its
 *   share, and head into the screen in one of six directions (straight up or
 *   down, or diagonally - the art only has those; mirroring gives the rest).
 *   Every tick God looks for creatures on the ground about to collide: the one
 *   facing away is told to jump (or hop) clear, the other waits 2 s.
 *   Flyers claim the spot they will land on before they take off
 *   (MayIInvokeThee).
 * - Vermin: each kind's weights for its five moves - in-place animation,
 *   another, a hop, a long jump or flight, or a rest of up to 1-2.5 s - from
 *   the sprite_info_recs in ITriazzle. A creature never turns: it crosses the
 *   screen and is reborn elsewhere once it has left. Airborne frames draw the
 *   shadow cel, kept on the same side whichever way the creature faces; the
 *   turtle always draws its first cel (its legs).
 *
 * Ten ticks a second. Checked against a capture of the real module at
 * 1024x768 (Random background came up Leaves): tile and foliage layout, sizes,
 * creature mix and pace. Not ported: the sounds, the 90-minute redraw, the
 * Triazzle sprite "stretch" (a no-op here too). Random numbers are Math.random.
 *
 *   <after-dark-rainforest art="art/rain" number="many" background="random" foliage>
 */
(function () {
	'use strict';

	var TICK = 100;

	/* ITriazzle's sprite_info_recs: movie, can fly, move weights (in place,
	   in place 2, hop, jump/fly, rest), z when airborne, longest rest in
	   ticks, airborne frames of the 250 and 650 sequences. */
	var CREATURES = [
		{ name: 'dragonfly', movie: 'dragonfly', fly: 1, w: [0, 0, 15, 50, 35], z: 4, rest: 25, a250: [1, 34], a650: [1, 13] },
		{ name: 'peruvian',  movie: 'peruvian',  fly: 1, w: [15, 5, 25, 25, 30], z: 3, rest: 10, a250: [3, 7], a650: [3, 4] },
		{ name: 'lehman',    movie: 'lehman',    fly: 1, w: [20, 5, 30, 30, 15], z: 2, rest: 20, a250: [3, 7], a650: [3, 4] },
		{ name: 'beetle',    movie: 'beetle',    fly: 0, w: [10, 20, 50, 0, 20], z: 1, rest: 20, a250: [0, 0], a650: [0, 0] },
		{ name: 'butterfly', movie: 'butterfly', fly: 1, w: [25, 0, 25, 15, 10], z: 6, rest: 10, a250: [6, 33], a650: [6, 33] },
		{ name: 'turtle',    movie: 'turtle',    fly: 0, w: [10, 10, 60, 0, 20], z: 0, rest: 20, a250: [0, 0], a650: [0, 0], turtle: true }
	];

	/* Number: the slider's value up to 25 / 50 / 75 / 100 is this share of 24. */
	var COUNTS = { few: 6, some: 12, many: 18, hordes: 24 };
	var BACKGROUNDS = ['desktop', 'black', 'leaves', 'wet blue', 'moss', 'lichen', 'rock', 'mottled', 'soft green', 'random'];
	var CORNERS = [10, 11, 12, 13, 14];
	var HORIZONTALS = [18, 15, 16, 17];
	var VERTICALS = [23, 20, 21, 22];
	var SLOT = 70;

	function rnd(n) { return n > 0 ? Math.floor(Math.random() * n) : 0; }
	function quarter(n) { return n < 0 ? -((-n) >> 2) : n >> 2; }
	function hit(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }
	function empty(r) { return !(r[2] > r[0] && r[3] > r[1]); }

	/* ------------------------------------------------------ TriazzleSequence */

	function Movie(data, art) {
		this.f = data.frames;
		this.cels = data.cels;
		this.art = art;
		this.shadow = false;     // ShadowState: airborne
		this.always = false;     // ShadowState: the turtle draws its first cel
	}
	Movie.prototype.valid = function (t) { return t > 0 && t < this.f.length && !!this.f[t]; };
	Movie.prototype.labelRange = function (t) { var s = t; while (this.valid(s)) { s += 1; } return s - t; };
	Movie.prototype.size = function (t) { var f = this.f[t]; return [f[2] - f[0], f[3] - f[1]]; };
	Movie.prototype.cel = function (id) {
		var c = this.cels[id];
		if (!c) { return null; }
		var seq = this.art.sequence(String(c[0]));
		return seq ? { seq: seq, fr: seq.frames[c[1]] } : null;
	};
	/* GetFrameData: [cel, flip, l, t, r, b] mirrored inside the frame's rect,
	   and, when airborne, the shadow put back on its own side. */
	Movie.prototype.data = function (t, op, shadow) {
		var f = this.f[t], out = [], i, it, w, h, l, tp;
		for (i = 4; i < f.length; i += 1) {
			it = f[i];
			var c = this.cel(it[0]);
			w = c ? c.fr.w : 0;
			h = c ? c.fr.h : 0;
			l = op & 1 ? f[0] + f[2] - (it[3] + w) : it[3];
			tp = op & 2 ? f[1] + f[3] - (it[4] + h) : it[4];
			out.push([it[0], it[2] ^ (op & 3), l, tp, l + w, tp + h]);
		}
		if (shadow && out.length > 1) {
			var c0 = out[0], c1 = out[1], k, m, s;
			var sx = (c1[4] - c1[2]) + (c0[4] - c0[2]) + 2 * (c1[2] - c0[4]);
			var sy = (c1[5] - c1[3]) + (c0[5] - c0[3]) + 2 * (c1[3] - c0[5]);
			if (op & 1) {
				c0[2] += sx; c0[4] += sx;
				m = f[0]; k = 0;
				for (i = 0; i < out.length; i += 1) { if (m < out[i][4]) { m = out[i][4]; k = i; } }
				s = f[2] - out[k][4];
				for (i = 0; i < out.length; i += 1) { out[i][2] += s; out[i][4] += s; }
			}
			if (op & 2) {
				c0[3] += sy; c0[5] += sy;
				m = f[1]; k = 0;
				for (i = 0; i < out.length; i += 1) { if (m < out[i][5]) { m = out[i][5]; k = i; } }
				s = f[3] - out[k][5];
				for (i = 0; i < out.length; i += 1) { out[i][3] += s; out[i][5] += s; }
			}
		}
		return out;
	};
	/* DrawFrame: the first cel (the shadow) only in ShadowState. */
	Movie.prototype.draw = function (ctx, t, op, x, y) {
		var f = this.f[t], cels = this.data(t, op, this.shadow), i, it, c, px, py;
		for (i = 0; i < cels.length; i += 1) {
			if (i === 0 && !this.shadow && !this.always) { continue; }
			it = cels[i];
			c = this.cel(it[0]);
			if (!c) { continue; }
			px = it[2] - f[0] + x;
			py = it[3] - f[1] + y;
			if (!(it[1] & 3)) {
				ctx.drawImage(c.seq.image, c.fr.x, c.fr.y, c.fr.w, c.fr.h, px, py, c.fr.w, c.fr.h);
			} else {
				ctx.save();
				ctx.translate(px + (it[1] & 1 ? c.fr.w : 0), py + (it[1] & 2 ? c.fr.h : 0));
				ctx.scale(it[1] & 1 ? -1 : 1, it[1] & 2 ? -1 : 1);
				ctx.drawImage(c.seq.image, c.fr.x, c.fr.y, c.fr.w, c.fr.h, 0, 0, c.fr.w, c.fr.h);
				ctx.restore();
			}
		}
	};

	/* ------------------------------------------------------ CompoundSprite */

	function Sprite(movie) {
		this.s = movie;
		this.frame = 0; this.seq = 0; this.cx = -1; this.cy = -1; this.op = 0;
		this.hold = 0; this.loops = 0; this.queued = -1; this.just = 0; this.q = [];
		this.done = 0; this.shown = false; this.z = 0;
		this.rect = [0, 0, 0, 0];
	}
	var SP = Sprite.prototype;
	SP.upd = function () {
		if (!this.s.valid(this.frame)) { return; }
		var sz = this.s.size(this.frame), l = this.cx - (sz[0] >> 1), t = this.cy - (sz[1] >> 1);
		this.rect = [l, t, l + sz[0], t + sz[1]];
	};
	SP.first = function (s) { return this.s.valid(s) ? s : 0; };
	SP.last = function (s) {
		if (!this.s.valid(s)) { return 0; }
		while (this.s.valid(s + 1)) { s += 1; }
		return s;
	};
	SP.link = function (s) {
		if (!this.s.valid(s)) { return 0; }
		return this.s.valid(s - 1) ? s - 1 : s;
	};
	SP.within = function () {
		if (this.seq > 0 && this.frame >= this.seq && this.frame <= this.last(this.seq)) {
			return this.frame - this.seq;
		}
		return -1;
	};
	SP.moveRel = function (to) {
		if (this.s.valid(this.frame) && this.s.valid(to)) {
			var a = this.s.f[this.frame], b = this.s.f[to], fx = this.op & 1, fy = (this.op & 2) >> 1;
			var dx = ((b[0] + b[2] + fx) >> 1) - ((a[0] + a[2] + fx) >> 1);
			var dy = ((b[1] + b[3] + fy) >> 1) - ((a[1] + a[3] + fy) >> 1);
			this.cx += fx ? -dx : dx;
			this.cy += fy ? -dy : dy;
		}
		this.frame = to;
		this.upd();
	};
	SP.moveCommon = function (to) {
		var from = this.frame;
		if (this.s.valid(from) && this.s.valid(to)) {
			var a = this.s.f[from], b = this.s.f[to], i, j, found = false;
			for (i = 4; i < a.length && !found; i += 1) {
				for (j = 4; j < b.length; j += 1) {
					if (a[i][0] === b[j][0]) { found = true; break; }
				}
			}
			if (found) {
				i -= 5;
				j -= 4;
				var d1 = this.s.data(from, this.op, false)[i];
				this.cx += d1[2] - (((a[2] - a[0]) >> 1) + a[0]);
				this.cy += d1[3] - (((a[3] - a[1]) >> 1) + a[1]);
				this.op ^= (a[i + 4][2] ^ b[j + 4][2]) & 3;
				var d2 = this.s.data(to, this.op, false)[j];
				this.cx += (((b[2] - b[0]) >> 1) + b[0]) - d2[2];
				this.cy += (((b[3] - b[1]) >> 1) + b[1]) - d2[3];
			}
		}
		this.frame = to;
		this.upd();
	};
	SP.nextSub = function (s) {
		if (this.frame !== 0) { this.moveCommon(this.link(s)); }
		this.moveRel(this.first(s));
		this.seq = s;
		this.just = 1;
		this.queued = -1;
	};
	SP.nextSequence = function (s) {
		this.nextSub(s);
		this.loops = 0;
		this.hold = 0;
		this.q = [];
		this.done = 0;
	};
	SP.setFrame = function (t) { this.frame = t; this.upd(); };
	SP.setCenter = function (x, y) { this.cx = x; this.cy = y; this.upd(); };
	/* PlaySequence, with the hold counter Rainforest rests on. */
	SP.play = function () {
		this.done = 0;
		if (this.hold > 0) {
			if (this.hold !== 0x7fff) { this.hold -= 1; }
			this.upd();
			return;
		}
		if (this.queued !== -1) { this.nextSub(this.queued); }
		var first = this.first(this.seq), last = this.last(this.seq);
		if (this.just) {
			this.just = 0;
		} else if (last > this.frame && first <= this.frame) {
			this.moveRel(this.frame + 1);
		} else {
			this.upd();
		}
		if (last > this.frame && first <= this.frame) { return; }
		if (this.loops > 0) {
			if (this.loops !== 0x7fff) { this.loops -= 1; }
			this.queued = this.seq;
		} else if (this.q.length) {
			this.queued = this.q.shift();
		} else {
			this.done = 1;
		}
	};
	/* GetSequenceDelta: how far a sequence carries the sprite. */
	SP.delta = function (s) {
		var keep = [this.frame, this.seq, this.cx, this.cy, this.op, this.rect];
		this.cx = 0; this.cy = 0;
		this.frame = this.seq = this.first(s);
		this.moveRel(this.last(s));
		this.moveCommon(this.link(s));
		this.moveRel(this.first(s));
		var d = [this.cx, this.cy];
		this.frame = keep[0]; this.seq = keep[1]; this.cx = keep[2]; this.cy = keep[3];
		this.op = keep[4]; this.rect = keep[5];
		return d;
	};
	SP.draw = function (ctx) {
		if (!this.shown || !this.s.valid(this.frame)) { return; }
		this.s.draw(ctx, this.frame, this.op, this.rect[0], this.rect[1]);
	};

	/* ------------------------------------------------------ God */

	function God(w, h, n, kinds) {
		this.w = w; this.h = h; this.n = n; this.kinds = kinds;
		var d = Math.floor(Math.sqrt(SLOT * SLOT * 2));
		var c0 = Math.floor(w / d) + Math.floor(h / d);
		this.groups = [
			{ count: c0, used: 0, sp: d, split: Math.floor(h / d) },
			{ count: c0, used: 0, sp: d, split: Math.floor(w / d) },
			{ count: Math.floor(w / SLOT), used: 0, sp: SLOT, split: 0 }
		];
		this.groups.forEach(function (g) {
			g.slots = [];
			for (var i = 0; i < g.count; i += 1) { g.slots.push(0); }
		});
		this.total = this.groups[0].count + this.groups[1].count + this.groups[2].count - 1;
		this.born = [0, 0, 0, 0, 0, 0];
		this.claims = [];
		this.rec = [];
		for (var i = 0; i < n; i += 1) {
			this.rec.push({ rect: [0, 0, 0, 0], air: 0, flying: 0, angle: 0, state: 0, count: 0 });
		}
		this.desired = 1;
	}

	God.prototype.desiredPopulation = function (p) {
		this.desired = p;
		if (p * this.kinds > this.total) {
			this.desired = Math.max(1, Math.floor(this.total / this.kinds));
		}
	};

	God.prototype.releaseSlot = function (id) {
		for (var g = 0; g < 3; g += 1) {
			var grp = this.groups[g];
			for (var i = 0; i < grp.count; i += 1) {
				if (grp.slots[i] === id) { grp.slots[i] = 0; grp.used -= 1; return; }
			}
		}
	};

	/* FindRandomEmptySlot: a free slot, its heading and where to start. */
	God.prototype.findSlot = function (id, rect) {
		var b, s, found = false, tries = 10, grp;
		while (tries && !found) {
			b = rnd(3);
			grp = this.groups[b];
			if (grp.used < grp.count) {
				s = rnd(grp.count);
				if (grp.slots[s] === 0) { grp.slots[s] = id; grp.used += 1; found = true; }
			}
			tries -= 1;
		}
		for (b = found ? b : 0; !found && b < 3; b += 1) {
			grp = this.groups[b];
			if (grp.used < grp.count) {
				for (s = 0; s < grp.count; s += 1) {
					if (grp.slots[s] === 0) { grp.slots[s] = id; grp.used += 1; found = true; break; }
				}
			}
			if (found) { break; }
		}
		if (!found) { b = 2; s = 0; }
		grp = this.groups[b];
		var dir = [1, 3, 0][b];
		if (rnd(2)) { dir = (dir + 4) % 8; }
		var rw = rect[2] - rect[0], rh = rect[3] - rect[1], x = 0, y = 0;
		if (dir === 4) {
			y = rh + this.h; x = grp.sp * (s + 1);
		} else if (dir === 0) {
			y = -rh; x = grp.sp * (s + 1);
		} else if (dir === 5 || dir === 7) {
			if (s < grp.split) { x = -rw; y = grp.sp * (s + 1); } else {
				y = dir === 5 ? rh + this.h : -rh;
				x = (s + 1 - grp.split) * grp.sp;
			}
		} else if (dir === 1 || dir === 3) {
			if (s < grp.split) {
				y = dir === 3 ? rh + this.h : -rh;
				x = grp.sp * (s + 1);
			} else {
				x = rw + this.w; y = (s + 1 - grp.split) * grp.sp;
			}
		}
		return { dir: dir, x: x, y: y };
	};

	God.prototype.requestBirth = function (kind, state) {
		if (state === 0) { this.born[kind] -= 1; }
		if (this.born[kind] < this.desired) { this.born[kind] += 1; return true; }
		return false;
	};

	/* MayIInvokeThee: may a flyer land there? */
	God.prototype.mayLand = function (id, rect) {
		var i, r;
		for (i = 0; i < this.n; i += 1) {
			r = this.rec[i];
			if (empty(r.rect) || r.air || i === id) { continue; }
			if (hit(rect, r.rect)) { return false; }
		}
		for (i = 0; i < this.claims.length; i += 1) {
			if (i === id || !this.claims[i] || empty(this.claims[i])) { continue; }
			if (hit(rect, this.claims[i])) { return false; }
		}
		this.claims[id] = rect.slice();
		return true;
	};
	God.prototype.landed = function (id) { this.claims[id] = null; };

	/* AmIAJustlyChristian: told to wait? */
	God.prototype.mustWait = function (id) {
		var r = this.rec[id];
		return r.state === 2 && !r.air;
	};

	God.angle = function (a, b) {
		var dx = ((b[0] + b[2]) / 2 | 0) - ((a[0] + a[2]) / 2 | 0);
		var dy = ((b[1] + b[3]) / 2 | 0) - ((a[1] + a[3]) / 2 | 0);
		if (dy < 1 && dy > -1) { return dx >= 0 ? 0 : 180; }
		var r = Math.atan(dx / dy) * 180 / Math.PI + 90;
		return dy > 0 ? r + 180 : r;
	};

	/* God::Command, after everybody has moved. */
	God.prototype.command = function (vermin) {
		var i, j, r, o, a1, a2;
		for (i = 0; i < this.n; i += 1) {
			r = this.rec[i];
			var v = vermin[i];
			r.rect = v ? v.occ.slice() : [0, 0, 0, 0];
			r.air = v ? v.airborne : 0;
			r.flying = v && v.move >= 250 ? 1 : 0;
			r.angle = v ? ((8 - v.dir) * 45 + 270) % 360 : 0;
			r.state = 0;
		}
		for (i = 0; i < this.n; i += 1) {
			r = this.rec[i];
			if (empty(r.rect) || r.air) { continue; }
			for (j = i + 1; j < this.n; j += 1) {
				o = this.rec[j];
				if (empty(o.rect) || o.air || !hit(r.rect, o.rect)) { continue; }
				a1 = Math.abs(God.angle(r.rect, o.rect) - r.angle);
				a2 = Math.abs(God.angle(o.rect, r.rect) - o.angle);
				if (a1 > a2) {
					if (!r.state) { r.state = 1; }
					if (!o.state) { o.state = 2; }
				} else {
					if (!o.state) { o.state = 1; }
					if (!r.state) { r.state = 2; }
				}
			}
		}
		for (i = 0; i < this.n; i += 1) {
			r = this.rec[i];
			r.count = r.state === 2 ? r.count + 1 : 0;
			if (r.count > 100) { r.state = 1; }
		}
		for (i = 0; i < this.n; i += 1) {
			r = this.rec[i];
			if (!vermin[i]) { continue; }
			if (r.state === 1) { vermin[i].guide(650); }
			if (r.state === 2 && r.flying) { vermin[i].guide(50); }
		}
	};

	/* ------------------------------------------------------ Vermin */

	function Vermin(world, kind, id, movie) {
		this.world = world;
		this.kind = kind;
		this.spec = CREATURES[kind];
		this.id = id;
		this.sprite = new Sprite(movie);
		this.state = 3;
		this.move = 0;
		this.dir = 0;
		this.guidance = 0;
		this.waiting = false;
		this.wait = 0;
		this.airborne = 0;
		this.occ = [0, 0, 0, 0];
		this.land = [0, 0, 0, 0];
	}
	var VP = Vermin.prototype;

	VP.guide = function (move) {
		this.guidance = move;
		if (this.spec.w[3] === 0 && move === 650) { this.guidance = 250; }
		if (this.kind === 0) {
			if (this.guidance === 650) { this.guidance = 250; }
			if (this.guidance === 50) { this.guidance = 650; }
		}
	};

	VP.visible = function () {
		return this.sprite.shown && hit(this.sprite.rect, [0, 0, this.world.w, this.world.h]);
	};

	/* IsAliveOrBeingBorn */
	VP.alive = function () {
		if (this.state === 3 || this.state === 2) { return this.state; }
		if (this.visible()) { return 1; }
		var x = this.sprite.cx, y = this.sprite.cy, w = this.world.w, h = this.world.h, d = this.dir;
		if (x < 0 && (d === 5 || d === 7) && y >= 0 && y <= h) { return 1; }
		if (x > w && (d === 3 || d === 1) && y >= 0 && y <= h) { return 1; }
		if (y < 0 && (d === 0 || d === 1 || d === 7) && x >= 0 && x <= w) { return 1; }
		if (y > h && (d === 4 || d === 3 || d === 5) && x >= 0 && x <= w) { return 1; }
		return 0;
	};

	VP.setZ = function () {
		this.sprite.z = this.move >= 250 ? this.spec.z : 1;
		this.world.reorder(this.sprite);
	};

	VP.weighted = function () {
		var w = this.spec.w, r = rnd(w[0] + w[1] + w[2] + w[3] + w[4]);
		if (r < w[0]) { this.move = 50; } else if (r < w[0] + w[1]) { this.move = 150; } else if (r < w[0] + w[1] + w[2]) {
			this.move = 250; this.flag = 0;
		} else if (r < w[0] + w[1] + w[2] + w[3]) {
			this.move = 650; this.flag = 0;
		} else {
			this.move = -1; this.pause = rnd(this.spec.rest);
		}
		this.setZ();
	};

	VP.weightedNoFly = function () {
		var w = this.spec.w, sum = w[0] + w[1], r = sum ? rnd(sum) : 1;
		if (r < w[0]) { this.move = 50; } else if (r < sum) { this.move = 150; } else {
			this.move = -1; this.pause = rnd(this.spec.rest);
		}
		this.setZ();
	};

	/* Modify_NextMove_For_Direction: the diagonal sequences for odd headings. */
	VP.modify = function () {
		if ((this.move === 50 || this.move === 150) && this.dir % 2) { this.move += 50; }
		if ((this.move === 250 || this.move === 650) && this.dir % 2) { this.move += 200; }
	};

	VP.landingRect = function () {
		var d = this.sprite.delta(this.move), r = this.sprite.rect;
		return [r[0] + d[0], r[1] + d[1], r[2] + d[0], r[3] + d[1]];
	};

	/* GetClearance: flyers book where they will come down. */
	VP.clearance = function () {
		var god = this.world.god, rect;
		this.flag = 0;
		if (this.move < 250 || !this.spec.fly) { return; }
		this.modify();
		rect = this.landingRect();
		if (god.mayLand(this.id, rect)) { this.flag = 1; this.land = rect; return; }
		if (this.state !== 1) { this.weightedNoFly(); this.modify(); return; }
		if (this.move === 250 && this.spec.w[3]) {
			this.move = 650;
		} else if (this.move === 250) {
			this.weightedNoFly();
			this.modify();
			return;
		} else if (this.move === 650) {
			this.move = 250;
		}
		this.modify();
		rect = this.landingRect();
		if (god.mayLand(this.id, rect)) { this.flag = 1; this.land = rect; return; }
		this.weightedNoFly();
		this.modify();
	};

	/* Awaken_A_Babe_Vermin: born off screen, heading in. */
	VP.awaken = function () {
		var sp = this.sprite;
		this.move = this.spec.w[3] ? 650 : 250;
		sp.shown = false;
		sp.setFrame(this.move);
		var slot = this.world.god.findSlot(this.id, sp.rect);
		this.dir = slot.dir;
		sp.shown = true;
		sp.setCenter(slot.x, slot.y);
		this.modify();
		sp.op = (sp.op & ~2) | 1;
		sp.z = this.move >= 250 ? this.spec.z : 1;
		this.world.reorder(sp);
		if (this.dir > 2 && this.dir < 6) { sp.op ^= 2; }
		if (this.dir > 4) { sp.op ^= 1; }
		sp.nextSequence(this.move);
		sp.hold = rnd(40);
		if (sp.hold > 0) { sp.done = 0; }
		this.state = 1;
		this.flag = 0;
	};

	/* Vermin::Go: the next move, when the last one is done. */
	VP.go = function () {
		var sp = this.sprite, god = this.world.god;
		if (!(sp.done || this.state === 2)) { return; }
		this.state = this.alive();
		if (this.state === 0) {
			god.releaseSlot(this.id);
			if (god.requestBirth(this.kind, 0)) {
				this.awaken();
			} else {
				this.state = 2;
				sp.hold = 0x7fff;
				sp.done = 0;
			}
			this.occ = [0, 0, 0, 0];
			return;
		}
		if (this.state === 2 || this.state === 3) {
			if (god.requestBirth(this.kind, this.state)) { this.awaken(); }
			return;
		}
		if (this.guidance) {
			this.move = this.guidance;
			this.guidance = 0;
			this.setZ();
		} else {
			this.weighted();
			this.clearance();
		}
		this.modify();
		if (this.move === -1) {
			sp.hold = this.pause;
			if (sp.hold > 0) { sp.done = 0; }
			this.occ = sp.rect.slice();
		} else if (this.move) {
			sp.nextSequence(this.move);
		}
	};

	VP.isAirborne = function () {
		var sp = this.sprite, k = sp.within(), air = false;
		if (this.spec.fly) {
			if (sp.frame >= 650) {
				air = k >= this.spec.a650[0] && k <= this.spec.a650[1];
			} else if (sp.frame >= 250) {
				air = k >= this.spec.a250[0] && k <= this.spec.a250[1];
			}
		}
		if (air) { this.occ = this.land.slice(); }
		return air ? 1 : 0;
	};

	VP.justLanded = function () {
		var sp = this.sprite, k = sp.within();
		if (!this.spec.fly) { return false; }
		if (sp.frame >= 650) { return k === this.spec.a650[1] + 1; }
		if (sp.frame >= 250) { return k === this.spec.a250[1] + 1; }
		return false;
	};

	/* Vermin::Play */
	VP.play = function () {
		var sp = this.sprite, god = this.world.god;
		this.airborne = this.isAirborne();
		if (!this.airborne) {
			if (!this.waiting) {
				if (god.mustWait(this.id)) {
					this.waiting = true;
					this.wait = 20;
					sp.hold = 20;
					sp.done = 0;
				}
			} else {
				this.wait -= 1;
				if (this.wait === 0) { this.waiting = false; }
			}
		}
		sp.play();
		var vis = this.visible();
		if (!this.airborne) { this.occ = sp.rect.slice(); }
		if (this.justLanded()) { god.landed(this.id); }
		if (!vis) { this.occ = [0, 0, 0, 0]; }
	};

	/* ------------------------------------------------------ Rainforest */

	function Rainforest(art, compound) {
		this.art = art;
		this.compound = compound || null;
		this.chosen = CREATURES.map(function (c) { return c.name; });
		this.count = COUNTS.many;
		this.background = 'random';
		this.foliage = true;
		this.critters = [];
		this.order = [];
		this.now = 0;
	}

	Rainforest.prototype.setType = function (name) {
		var raw = (name || 'all').toLowerCase().trim();
		var all = CREATURES.map(function (c) { return c.name; });
		if (raw === 'all' || raw === '') { this.chosen = all; return; }
		var picked = raw.split(',').map(function (s) {
			var k = s.trim().replace(/['’]s$/, '');
			return k === 'lehmans' ? 'lehman' : k;
		}).filter(function (k) { return all.indexOf(k) >= 0; });
		this.chosen = picked.length ? picked : all;
	};

	Rainforest.prototype.reorder = function (s) {
		var list = this.order, i, j;
		for (i = 0; i < list.length; i += 1) { list[i]._rank = i; }
		i = list.indexOf(s);
		if (i >= 0) { list.splice(i, 1); } else { i = list.length; s._rank = i; }
		function lower(a, b) {
			if (hit(a.rect, b.rect)) { return a._rank < b._rank; }
			return a.z < b.z || (a.z === b.z && a._rank < b._rank);
		}
		j = Math.min(i, list.length);
		while (j > 0 && lower(s, list[j - 1])) { j -= 1; }
		while (j < list.length && lower(list[j], s)) { j += 1; }
		list.splice(j, 0, s);
	};

	Rainforest.prototype.reset = function (w, h) {
		this.w = w;
		this.h = h;
		this.now = 0;
		this.next = 0;
		this.critters = [];
		this.order = [];
		var kinds = [], i, j;
		for (i = 0; i < CREATURES.length; i += 1) {
			if (this.chosen.indexOf(CREATURES[i].name) >= 0) { kinds.push(i); }
		}
		if (!kinds.length) { kinds = [0]; }
		var each = this.count / kinds.length;
		this.god = new God(w, h, this.count, kinds.length);
		this.god.desiredPopulation(Math.floor(each));
		for (i = 0; i < kinds.length; i += 1) {
			var spec = CREATURES[kinds[i]];
			var data = this.compound && this.compound[spec.movie];
			for (j = 0; j < each && this.critters.length < 24; j += 1) {
				var movie = new Movie(data || { frames: [], cels: {} }, this.art);
				var v = new Vermin(this, kinds[i], this.critters.length, movie);
				this.critters.push(v);
				this.order.push(v.sprite);
			}
		}
		this.paintBackground();
	};

	/* Triazzle::DoTileBackground and the foliage, onto the background. */
	Rainforest.prototype.paintBackground = function () {
		this.bg = null;
		if (typeof document === 'undefined') { return; }
		var c = document.createElement('canvas');
		c.width = this.w;
		c.height = this.h;
		var g = c.getContext('2d');
		if (!g) { return; }
		this.bg = c;
		var b = BACKGROUNDS.indexOf(this.background);
		if (b < 0) { b = 9; }
		var plants = this.compound && new Movie(this.compound.plants, this.art);
		if (plants) { plants.always = true; }
		if (b === 0) {
			var desk = window.AfterDark.desktop && window.AfterDark.desktop(this.w, this.h);
			if (desk) { g.drawImage(desk, 0, 0); }
		} else {
			g.fillStyle = '#000';
			g.fillRect(0, 0, this.w, this.h);
		}
		if (!plants) { return; }
		if (b >= 2) {
			var tile = b === 9 ? 1 + rnd(7) : b - 1;
			var sz = plants.size(tile), ox = rnd(sz[0]), oy = rnd(sz[1]);
			var cols = (this.w / sz[0] | 0) + 2, rows = (this.h / sz[1] | 0) + 2, x, y;
			for (x = 0; x < cols; x += 1) {
				for (y = 0; y < rows; y += 1) {
					plants.draw(g, tile, 0, x * sz[0] - ox, y * sz[1] - oy);
				}
			}
		}
		if (this.foliage) { this.drawFoliage(g, plants); }
	};

	Rainforest.prototype.drawFoliage = function (g, plants) {
		var W = this.w, H = this.h, i, p, sz, n, k, x, y, op;
		for (i = 0; i < 4; i += 1) {
			p = HORIZONTALS[i];
			sz = plants.size(p);
			n = W / sz[0] | 0;
			k = n > 1 ? rnd(n - 1) + 1 : rnd(n);
			plants.draw(g, p, 0, k * sz[0], -rnd(quarter(sz[1])));
			k = n > 1 ? rnd(n - 1) + 1 : rnd(n);
			plants.draw(g, p, 2, k * sz[0], rnd(quarter(sz[1])) + H - sz[1]);
		}
		for (i = 0; i < 4; i += 1) {
			p = VERTICALS[i];
			sz = plants.size(p);
			n = H / sz[1] | 0;
			k = n > 1 ? rnd(n - 1) + 1 : rnd(n);
			plants.draw(g, p, 1, -rnd(quarter(sz[0])), k * sz[1]);
			k = n > 1 ? rnd(n - 1) + 1 : rnd(n);
			plants.draw(g, p, 0, rnd(quarter(sz[0])) + W - sz[0], k * sz[1]);
		}
		var corners = CORNERS.slice(0, 4);
		corners[rnd(4)] = CORNERS[4];
		for (i = 0; i < 4; i += 1) {
			p = corners[i];
			sz = plants.size(p);
			op = 0;
			if (i <= 1) { y = rnd(quarter(sz[1])) + H - sz[1]; } else { op = 2; y = -rnd(quarter(sz[1])); }
			if (i === 0 || i === 2) { x = rnd(quarter(sz[0])) + W - sz[0]; } else { op |= 1; x = -rnd(quarter(sz[0])); }
			plants.draw(g, p, op, x, y);
		}
	};

	/* Triazzle::DoDrawFrame: ten times a second, Go for all, Play for all,
	   then God's look round. */
	Rainforest.prototype.tick = function () {
		var i, v;
		for (i = 0; i < this.critters.length; i += 1) { this.critters[i].go(); }
		for (i = 0; i < this.critters.length; i += 1) {
			v = this.critters[i];
			v.play();
			v.sprite.s.shadow = !!v.airborne;
			v.sprite.s.always = !!v.spec.turtle;
		}
		this.god.command(this.critters);
	};

	Rainforest.prototype.step = function (dt) {
		this.now += dt * 1000;
		var guard = 0;
		while (this.now >= this.next && guard < 5) {
			this.tick();
			this.next += TICK;
			guard += 1;
		}
		if (this.now > this.next + 1000) { this.next = this.now; }
	};

	Rainforest.prototype.draw = function (ctx, w, h) {
		if (this.bg) {
			ctx.drawImage(this.bg, 0, 0);
		} else {
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);
		}
		for (var i = 0; i < this.order.length; i += 1) {
			this.order[i].draw(ctx);
		}
	};

	/* ------------------------------------------------------ element */

	function RainforestElement() {
		return Reflect.construct(HTMLElement, [], RainforestElement);
	}
	RainforestElement.prototype = Object.create(HTMLElement.prototype);
	RainforestElement.prototype.constructor = RainforestElement;
	Object.setPrototypeOf(RainforestElement, HTMLElement);

	RainforestElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		var self = this;
		var base = (this.getAttribute('art') || 'art/rain').replace(/\/$/, '');
		var AD = window.AfterDark;
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		Promise.all([
			AD.load(base),
			fetch(AD.bust(base + '/compound.json')).then(function (r) {
				if (!r.ok) { throw new Error('no compound.json at ' + base); }
				return r.json();
			})
		]).then(function (got) {
			var sim = new Rainforest(got[0], got[1]);
			var number = (AD.setting(self, 'number') || 'many').toLowerCase();
			var v = parseInt(number, 10);
			if (COUNTS[number]) {
				sim.count = COUNTS[number];
			} else if (!isNaN(v)) {
				sim.count = v <= 25 ? 6 : v <= 50 ? 12 : v <= 75 ? 18 : 24;
			}
			sim.setType(AD.setting(self, 'creatures') || AD.setting(self, 'type') || 'all');
			var bg = AD.setting(self, 'background');
			if (bg !== null && bg !== '') {
				sim.background = bg.toLowerCase();
			}
			if (AD.setting(self, 'foliage') !== null) {
				sim.foliage = AD.flag(self, 'foliage');
			}
			var screen = new AD.Screen(self);
			self._screen = screen;
			self.sim = sim;
			screen.onresize = function (width, height) {
				sim.reset(width, height);
			};
			sim.reset(screen.width, screen.height);
			screen.run(function (dt, ctx, width, height) {
				sim.step(dt);
				sim.draw(ctx, width, height);
			});
		}).catch(function (err) {
			self.textContent = err.message;
		});
	};

	RainforestElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-rainforest', RainforestElement);
	window.AfterDarkRainforest = Rainforest;
	Rainforest.CREATURES = CREATURES;
	Rainforest.COUNTS = COUNTS;
	Rainforest.God = God;
	Rainforest.Sprite = Sprite;
}());
