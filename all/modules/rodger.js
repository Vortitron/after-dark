/**
 * rodger.js - Rodger Dodger, the game.
 *
 * RODGER.AD's own description:
 *
 *   "Once upon a time there was a naughty programmer named Rodger who played
 *    games instead of doing his work. Unbeknownst to this programmer, the
 *    project manager was a witch. One day the project manager became so
 *    angry that he or she (we won't give that away) turned this naughty
 *    programmer into the ball in a game called Rodger Dodger. Will the
 *    programmer have a happy ending? You decide. Check 'Load Saved Level' to
 *    start the game at the beginning of the level that you last saved. You
 *    save a level by pressing 'S' while playing the game. 'Caps-lock' gets
 *    you in and out of interactive mode. Programming by Peter A. Kemmer. Art
 *    by Jarir Maani."
 *
 * Its one control is Load Saved Level. Nearly all of this comes out of the
 * module rather than being made up:
 *
 *  - The 24 levels are in its DATA segment (pointer table at 0x423834): an
 *    18x14 grid of 32-pixel cells stored as a checkerboard of wall bits
 *    (1 top, 2 right, 4 bottom, 8 left), then the items to collect, the
 *    revolving doors (kind, turn) and everything else - Rodger, the enemies,
 *    the exit, mud, teleporters and sparks - as cell, type and heading.
 *  - The 25 thing types (DATA 0x4205cc) say what each does: its class, how
 *    it steers (1 hunts Rodger by distance map, 2 picks a new way when it
 *    is blocked, 3 turns right, 4 turns left), whether it is solid, whether
 *    it can push doors, ticks per cell, how often it moves, its percent of
 *    random turns, its touch radius, the energy it costs (or gives), and its
 *    animations. A touch from most enemies costs all 100 energy.
 *  - Every picture is a frame of its CompoundSequence (TYPE_8100) placed by
 *    its frame script (TYPE_8102): the board tile, the sidebar, the two-pass
 *    walls with their shadow, the energy bar in 101 steps, the lives, the
 *    level number, GET READY / SUCCESS! / GAME OVER, the title and the help
 *    page all sit where the module put them. all/art/rodger/index.json
 *    carries those tables as `frames`, `types`, `doors` and `levels`.
 *  - The rules are read from its code: a tick moves things a quarter of a
 *    cell, energy drains one point every three seconds, Rodger's touches
 *    are tested by distance each tick, the exit only lets him out once
 *    every item is collected, the level after the 24th is the first again.
 *
 * Unattended it does what it did: the title for ten seconds, then Rodger
 * plays the level by himself - wandering, as the module made him - until he
 * is caught; a minute in, it shows the help page for fifteen seconds. Caps
 * Lock starts a game you play with the arrow keys or the keypad's 8 4 6 2;
 * P (or Esc) pauses on the help page and Space carries on; S saves the level
 * and lives, kept in this browser's storage, which is what Load Saved Level
 * then starts from.
 *
 * Filled in, because the code that does it was not followed through: how a
 * revolving door decides to turn (here: pushing an arm turns it a quarter,
 * clockwise or not by which side of the pivot you push, unless another solid
 * thing is in the way of an arm), the hunting enemies' distance map (here a
 * plain flood fill from Rodger), the linked door markers a few levels carry,
 * the tick rate (15 a second, from the capture), and the sounds, as always.
 *
 *   <after-dark-rodger-dodger art="art/rodger" load-saved-level>
 */
(function () {
	'use strict';

	var SEQS = [2000, 2001, 2002, 2003, 2004];
	var TICK = 1 / 15;
	var COLS = 18, ROWS = 14, CELL = 32;
	/* Directions 1..4 are up, right, down, left; their wall bits and steps. */
	var BIT = [0, 1, 2, 4, 8];
	var DX = [0, 0, 1, 0, -1];
	var DY = [0, -1, 0, 1, 0];
	var BACK = [0, 3, 4, 1, 2];
	var RIGHT = [1, 2, 3, 4, 1];
	var LEFT = [1, 4, 1, 2, 3];
	/* Rides round a turning door (DATA 0x420be4 / 0x420bf8), by heading. */
	var ARC_CW = [7, 76, 52, 60, 68];
	var ARC_CCW = [7, 44, 84, 92, 100];
	/* A door's four cells round its pivot, and what each arm closes. */
	var QUAD = [[0, 0], [1, 0], [1, 1], [0, 1]];
	var ARM_A = [2, 4, 8, 1];
	var ARM_B = [8, 1, 2, 4];
	var LIVES = { 5: 1557, 4: 1591, 3: 1625, 2: 1659 };
	var L = {
		tile: 852, sidebar: 1499, wallShade: 1032, wall: 921, level: 1503, energy: 1681,
		ready: 1786, success: 1833, gameOver: 1913, saved: 1965,
		title: 1987, ball: 2006, help: 2025, legend: 2043, death: 143
	};
	var STORE = 'afterdark.rodger';

	function rnd(n) {
		return Math.floor(Math.random() * n);
	}

	function Rodger() {
		this.art = null;
		this.data = null;
		this.loadSaved = false;
		this.interactive = false;
		this.keys = [];
		this.acc = 0;
		this.t = 0;
		this.state = null;
	}

	/* ------------------------------------------------------------ drawing */

	/** The run of frames that a label starts. */
	Rodger.prototype.run = function (label) {
		var F = this.data.frames, n = 0;
		while (F[label + n]) { n += 1; }
		return n;
	};

	Rodger.prototype.frame = function (ctx, n, x, y) {
		var f = this.data.frames[n];
		if (!f) { return; }
		var s = this.s, ox = this.ox, oy = this.oy;
		for (var i = 0; i < f[2].length; i += 1) {
			var ly = f[2][i];
			var seq = this.art.sequence(SEQS[ly[0]]);
			var r = seq && seq.frames[ly[1]];
			if (!r) { continue; }
			var px = ox + (x + ly[3] + f[0]) * s, py = oy + (y + ly[4] + f[1]) * s;
			if (!ly[2]) {
				var x0 = Math.round(px), y0 = Math.round(py);
				ctx.drawImage(seq.image, r.x, r.y, r.w, r.h, x0, y0, Math.round(px + r.w * s) - x0, Math.round(py + r.h * s) - y0);
			} else {
				ctx.save();
				ctx.translate(Math.round(px + r.w * s / 2), Math.round(py + r.h * s / 2));
				ctx.scale(ly[2] & 1 ? -1 : 1, ly[2] & 2 ? -1 : 1);
				ctx.drawImage(seq.image, r.x, r.y, r.w, r.h, -r.w * s / 2, -r.h * s / 2, r.w * s, r.h * s);
				ctx.restore();
			}
		}
	};

	/** An animation: a label, how far through it, and whether it loops. */
	function Anim(label, count, loop, start) {
		this.label = label;
		this.count = Math.max(1, count);
		this.loop = loop;
		this.i = start || 0;
		this.done = false;
	}

	Anim.prototype.step = function () {
		if (this.done) { return; }
		this.i += 1;
		if (this.i >= this.count) {
			if (this.loop) { this.i = 0; } else { this.i = this.count - 1; this.done = true; }
		}
	};

	Anim.prototype.n = function () {
		return this.label + this.i;
	};

	Rodger.prototype.anim = function (label, loop, random) {
		var c = this.run(label);
		return new Anim(label, c, loop, random ? rnd(c) : 0);
	};

	Rodger.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		var s = Math.min(w / 640, h / 480);
		this.s = s >= 1 ? Math.floor(s) : s;
		/* Where the module's (0, 0) falls: its layout is a 640x480 screen. */
		this.ox = Math.round(w / 2 - 320 * this.s);
		this.oy = Math.round(h / 2 - 240 * this.s);
	};

	/* --------------------------------------------------------------- level */

	Rodger.prototype.buildLevel = function () {
		var lv = this.data.levels[this.level], self = this, x, y;
		this.walls = [];
		this.gates = [];
		this.doorAt = [];
		for (y = 0; y < ROWS; y += 1) {
			this.walls.push(lv.grid[y].slice());
			this.gates.push([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
			this.doorAt.push([-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]);
		}
		for (x = 0; x < COLS; x += 1) { this.walls[0][x] |= 1; this.walls[ROWS - 1][x] |= 4; }
		for (y = 0; y < ROWS; y += 1) { this.walls[y][0] |= 8; this.walls[y][COLS - 1] |= 2; }
		/* The level only stores every other cell, checkerboard fashion, so
		   the cells between take their walls from their neighbours. */
		this.solid = this.walls.map(function (row) { return row.slice(); });
		for (y = 0; y < ROWS; y += 1) {
			for (x = 0; x < COLS; x += 1) {
				var v = this.walls[y][x];
				if (v & 1 && y > 0) { this.solid[y - 1][x] |= 4; }
				if (v & 2 && x < COLS - 1) { this.solid[y][x + 1] |= 8; }
				if (v & 4 && y < ROWS - 1) { this.solid[y + 1][x] |= 1; }
				if (v & 8 && x > 0) { this.solid[y][x - 1] |= 2; }
			}
		}

		this.doors = lv.doors.map(function (d, i) {
			var door = { kind: d[2], turn: d[3] & 3, x: d[0], y: d[1], anim: null };
			door.idle = self.anim(self.data.doors[door.kind][door.turn][0], false);
			QUAD.forEach(function (q) {
				var cx = door.x + q[0], cy = door.y + q[1];
				if (cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS) { self.doorAt[cy][cx] = i; }
			});
			return door;
		});
		this.gateUp();

		this.things = [];
		this.items = lv.items.length;
		lv.items.forEach(function (r) { self.things.push(self.thing(r)); });
		lv.things.forEach(function (r) {
			if (!r[2]) { return; }
			var t = self.thing(r);
			if (t.cls === 1) { self.player = t; } else { self.things.push(t); }
		});
		if (!this.player) { this.player = this.thing([8, 6, 1, 0]); }
		this.energy = 100;
		this.drain = 0;
	};

	Rodger.prototype.thing = function (r) {
		var rec = this.data.types[r[2]];
		var t = {
			type: r[2], rec: rec, cls: rec[0], x: r[0], y: r[1], dir: r[3] || 0,
			ox: 0, oy: 0, st: 'appear', left: 0, total: 0, mdir: 0, cool: 0,
			arc: null, from: null, live: this.anim(rec[12], true, true), slow: false
		};
		if (r.length > 5) { t.to = [r[4], r[5]]; }
		t.show = rec[13] && this.run(rec[13]) ? this.anim(rec[13], false) : null;
		if (!t.show) { t.st = 'wait'; }
		return t;
	};

	/** The edges a door's arms close, for things that cannot push it. */
	Rodger.prototype.gateUp = function () {
		var y, x, self = this;
		for (y = 0; y < ROWS; y += 1) { for (x = 0; x < COLS; x += 1) { this.gates[y][x] = 0; } }
		this.doors.forEach(function (d) {
			for (var k = 0; k < 4; k += 1) {
				if (!self.arm(d, k)) { continue; }
				var a = QUAD[k], b = QUAD[(k + 1) % 4];
				self.gate(d.x + a[0], d.y + a[1], ARM_A[k]);
				self.gate(d.x + b[0], d.y + b[1], ARM_B[k]);
			}
		});
	};

	Rodger.prototype.gate = function (x, y, bit) {
		if (x >= 0 && y >= 0 && x < COLS && y < ROWS) { this.gates[y][x] |= bit; }
	};

	/** Arm k (0 up, 1 right, 2 down, 3 left from the pivot) of door d. */
	Rodger.prototype.arm = function (d, k) {
		return !!this.data.doors[d.kind][((k - d.turn) % 4 + 4) % 4][3];
	};

	/* ---------------------------------------------------------- movement */

	Rodger.prototype.blocked = function (t, d) {
		if (!d) { return false; }
		var bit = BIT[d];
		if (this.solid[t.y][t.x] & bit) { return true; }
		return !!(this.gates[t.y][t.x] & bit) && !t.rec[3];
	};

	Rodger.prototype.occupied = function (t, x, y) {
		if (!t.rec[2]) { return false; }
		var all = this.things.concat([this.player]);
		for (var i = 0; i < all.length; i += 1) {
			var o = all[i];
			if (o !== t && o.rec[2] && o.st !== 'gone' && o.x === x && o.y === y) { return true; }
		}
		return false;
	};

	Rodger.prototype.open = function (t) {
		var out = [];
		for (var d = 1; d <= 4; d += 1) {
			if (!this.blocked(t, d) && !this.occupied(t, t.x + DX[d], t.y + DY[d])) { out.push(d); }
		}
		return out;
	};

	/** A random way that is open, staying put included (0x4118e4). */
	Rodger.prototype.anyWay = function (t) {
		var ways = [];
		if (!this.occupied(t, t.x, t.y)) { ways.push(0); }
		ways = ways.concat(this.open(t));
		return ways.length ? ways[rnd(ways.length)] : 0;
	};

	/** A random open way but back (0x4119dc). */
	Rodger.prototype.newWay = function (t) {
		var self = this;
		var ways = this.open(t).filter(function (d) { return d !== BACK[t.dir]; });
		t.dir = ways.length ? ways[rnd(ways.length)] : 0;
		return self;
	};

	/** Flood fill from Rodger over the cells a thing could walk. */
	Rodger.prototype.distances = function (t) {
		var dist = [], y, x, self = this;
		for (y = 0; y < ROWS; y += 1) { dist.push([]); for (x = 0; x < COLS; x += 1) { dist[y].push(49); } }
		var q = [[this.player.x, this.player.y]];
		dist[this.player.y][this.player.x] = 0;
		while (q.length) {
			var c = q.shift(), cd = dist[c[1]][c[0]];
			if (cd >= 48) { continue; }
			for (var d = 1; d <= 4; d += 1) {
				var w = self.solid[c[1]][c[0]] | (t.rec[3] ? 0 : self.gates[c[1]][c[0]]);
				if (w & BIT[d]) { continue; }
				var nx = c[0] + DX[d], ny = c[1] + DY[d];
				if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || dist[ny][nx] <= cd + 1) { continue; }
				dist[ny][nx] = cd + 1;
				q.push([nx, ny]);
			}
		}
		return dist;
	};

	/** Which way to try next, chosen as a move starts (0x411728). */
	Rodger.prototype.steer = function (t) {
		var mode = t.rec[1];
		if (mode === 1) {
			var dist = this.distances(t), best = 49, ways = [];
			for (var d = 1; d <= 4; d += 1) {
				if (this.blocked(t, d)) { continue; }
				var v = dist[t.y + DY[d]] && dist[t.y + DY[d]][t.x + DX[d]];
				if (v === undefined) { continue; }
				if (v < best) { best = v; ways = [d]; } else if (v === best && best < 49) { ways.push(d); }
			}
			if (best >= 49) { this.newWay(t); } else { t.dir = ways[rnd(ways.length)]; }
		} else if (t.mdir) {
			t.dir = t.mdir;
		} else if (mode === 2) {
			this.newWay(t);
		} else if (mode === 3) {
			t.dir = RIGHT[t.dir];
		} else if (mode === 4) {
			t.dir = LEFT[t.dir];
		}
	};

	Rodger.prototype.decide = function (t) {
		var d = t.dir;
		if (t.cls === 1 && this.interactive) {
			d = this.held();
			if (!d) { return; }
		} else if (rnd(100) < t.rec[7]) {
			d = this.anyWay(t);
		}
		if (d && !this.blocked(t, d)) {
			var nx = t.x + DX[d], ny = t.y + DY[d];
			var di = this.doorAt[ny] && this.doorAt[ny][nx];
			if (di >= 0 && this.doorAt[t.y][t.x] === di && this.push(this.doors[di], t, d)) { return; }
			if (!this.occupied(t, nx, ny)) { this.go(t, d); return; }
		}
		this.go(t, 0);
	};

	Rodger.prototype.go = function (t, d) {
		t.mdir = d;
		this.steer(t);
		if (!d) { return; }
		t.from = [t.x, t.y];
		t.x += DX[d];
		t.y += DY[d];
		t.total = t.left = t.rec[5] * (t.slow ? 3 : 1);
		t.st = 'move';
		this.slide(t);
	};

	Rodger.prototype.slide = function (t) {
		t.left -= 1;
		var off = Math.round(t.left * CELL / t.total);
		t.ox = -DX[t.mdir] * off;
		t.oy = -DY[t.mdir] * off;
		if (t.left <= 0) { t.ox = t.oy = 0; t.st = 'wait'; }
	};

	/**
	 * Pushing an arm of a revolving door turns it a quarter, so long as no
	 * other solid thing sits where an arm has to sweep; the pusher rides
	 * round with it on the module's own curved paths.
	 */
	Rodger.prototype.push = function (door, t, d) {
		if (door.anim) { return true; }
		var ax = t.x - door.x, ay = t.y - door.y, k = -1, cw = false;
		/* The arm on the edge being crossed, and which way it turns. */
		if (ay === 0 && (d === 2 || d === 4)) { k = 0; cw = d === 2; }
		if (ax === 1 && (d === 1 || d === 3)) { k = 1; cw = d === 3; }
		if (ay === 1 && (d === 2 || d === 4)) { k = 2; cw = d === 4; }
		if (ax === 0 && (d === 1 || d === 3)) { k = 3; cw = d === 1; }
		if (k < 0 || !this.arm(door, k)) { return false; }
		if (!t.rec[3]) { this.go(t, 0); return true; }
		for (var j = 0; j < 4; j += 1) {
			if (!this.arm(door, j)) { continue; }
			var q = QUAD[cw ? (j + 1) % 4 : j];
			var cx = door.x + q[0], cy = door.y + q[1];
			if ((cx !== t.x + DX[d] || cy !== t.y + DY[d]) && this.solidAt(cx, cy, t)) { this.go(t, 0); return true; }
		}
		var rec = this.data.doors[door.kind][door.turn];
		door.anim = this.anim(cw ? rec[1] : rec[2], false);
		door.next = (door.turn + (cw ? 1 : 3)) % 4;
		t.mdir = d;
		this.steer(t);
		t.from = [t.x, t.y];
		t.x += DX[d];
		t.y += DY[d];
		t.arc = this.anim((cw ? ARC_CW : ARC_CCW)[d], false);
		t.st = 'arc';
		return true;
	};

	Rodger.prototype.solidAt = function (x, y, but) {
		var all = this.things.concat([this.player]);
		for (var i = 0; i < all.length; i += 1) {
			var o = all[i];
			if (o !== but && o.st !== 'gone' && o.cls !== 3 && o.cls !== 7 && o.x === x && o.y === y) { return true; }
		}
		return false;
	};

	Rodger.prototype.held = function () {
		for (var i = this.keys.length - 1; i >= 0; i -= 1) {
			var d = KEYS[this.keys[i]];
			if (d) { return d; }
		}
		return 0;
	};

	var KEYS = {
		ArrowUp: 1, ArrowRight: 2, ArrowDown: 3, ArrowLeft: 4,
		Numpad8: 1, Numpad6: 2, Numpad2: 3, Numpad4: 4
	};

	/* ------------------------------------------------------------- things */

	Rodger.prototype.update = function (t, playing) {
		if (t.cool > 0) { t.cool -= 1; }
		if (t.st !== 'gone') { t.live.step(); }
		switch (t.st) {
		case 'appear':
			t.show.step();
			if (t.show.done) { t.st = 'wait'; t.show = null; }
			break;
		case 'wait':
			if (playing && this.t % Math.max(1, t.rec[6]) === 0 && t.cls <= 2) { this.decide(t); }
			break;
		case 'move':
			this.slide(t);
			break;
		case 'arc':
			var f = this.data.frames[t.arc.n()];
			var p = f ? [f[0], f[1]] : [0, 0];
			t.ox = (t.from[0] - t.x) * CELL + p[0];
			t.oy = (t.from[1] - t.y) * CELL + p[1];
			t.arc.step();
			if (t.arc.done) { t.ox = t.oy = 0; t.arc = null; t.st = 'wait'; }
			break;
		case 'vanish':
			t.hide.step();
			if (t.hide.done) {
				if (t.then) { var to = t.then; t.then = null; t.x = to[0]; t.y = to[1]; t.ox = t.oy = 0; t.st = 'appear'; t.show = this.anim(t.rec[13], false); } else { t.st = 'gone'; }
			}
			break;
		}
	};

	Rodger.prototype.vanish = function (t, label, then) {
		if (t.st === 'gone') { return; }
		t.hide = this.anim(label || t.rec[14], false);
		if (!t.hide.count || !this.data.frames[t.hide.label]) { t.st = 'gone'; return; }
		t.st = 'vanish';
		t.then = then || null;
	};

	/** Rodger and a thing within its reach (0x410e2c). */
	Rodger.prototype.touch = function (t) {
		if (t.cool > 0 || t.st === 'gone' || t.st === 'vanish') { return; }
		t.cool = t.rec[10];
		this.energy = Math.max(0, Math.min(100, this.energy - t.rec[9]));
		if (t.cls === 3) {
			if (t.type === 20) { this.lives = Math.min(5, this.lives + 1); }
			this.items -= 1;
			this.vanish(t);
		} else if (t.cls === 4) {
			this.player.slow = true;
		} else if (t.cls === 5 && t.to && this.player.st !== 'vanish') {
			this.vanish(this.player, null, t.to);
		}
	};

	/* -------------------------------------------------------------- states */

	Rodger.prototype.go2 = function (name) {
		this.state = name;
		this.since = 0;
		var self = this;
		if (name === 'title') {
			this.titleText = this.anim(L.title, true);
			this.ball = this.anim(L.ball, true);
		} else if (name === 'ready') {
			this.buildLevel();
			this.panel = this.anim(L.ready, false);
		} else if (name === 'play') {
			this.panel = null;
			if (this.playTime === undefined || this.playTime <= 0) { this.playTime = 60; }
		} else if (name === 'dead') {
			this.lives -= 1;
			this.vanish(this.player, L.death);
			this.things.forEach(function (t) { self.vanish(t); });
		} else if (name === 'success') {
			this.panel = this.anim(L.success, false);
			this.things.forEach(function (t) { self.vanish(t); });
			this.vanish(this.player);
		} else if (name === 'gameover') {
			this.panel = this.anim(L.gameOver, false);
		} else if (name === 'help') {
			this.legend = this.anim(L.legend, true);
		}
	};

	Rodger.prototype.reset = function () {
		this.level = 0;
		this.lives = 5;
		this.playTime = 60;
		if (this.loadSaved) {
			try {
				var s = JSON.parse(window.localStorage.getItem(STORE) || 'null');
				if (s) { this.level = Math.max(0, Math.min(23, s.level | 0)); this.lives = Math.max(1, Math.min(5, s.lives | 0)); }
			} catch (e) { /* no storage */ }
		}
		this.go2(this.interactive ? 'ready' : 'title');
	};

	Rodger.prototype.save = function () {
		try { window.localStorage.setItem(STORE, JSON.stringify({ level: this.level, lives: this.lives })); } catch (e) { /* no storage */ }
		this.savedFlash = this.anim(L.saved, false);
	};

	Rodger.prototype.key = function (e, down) {
		var caps = e.getModifierState ? e.getModifierState('CapsLock') : this.interactive;
		var code = e.code || e.key;
		if (down) {
			if (this.keys.indexOf(code) < 0) { this.keys.push(code); }
		} else {
			this.keys = this.keys.filter(function (k) { return k !== code; });
		}
		if (caps !== this.interactive) {
			this.interactive = caps;
			if (this.data) { this.reset(); }
			return;
		}
		if (!down || !this.interactive) { return; }
		if (KEYS[code] || code === 'Space') { e.preventDefault(); }
		if (this.state === 'play' && (code === 'KeyP' || code === 'Escape' || code === 'Pause')) { this.go2('help'); }
		else if (this.state === 'play' && code === 'KeyS') { this.save(); }
		else if (this.state === 'help' && code === 'Space') { this.state = 'play'; }
	};

	Rodger.prototype.tick = function () {
		this.t += 1;
		this.since += TICK;
		var self = this, playing = this.state === 'play';
		if (this.savedFlash) { this.savedFlash.step(); if (this.savedFlash.done) { this.savedFlash = null; } }

		switch (this.state) {
		case 'title':
			this.titleText.step();
			this.ball.step();
			if (this.since >= 10) { this.go2('ready'); }
			return;
		case 'help':
			this.legend.step();
			if (!this.interactive && this.since >= 15) { this.state = 'play'; this.playTime = 60; }
			return;
		case 'ready':
		case 'success':
		case 'gameover':
			if (this.panel) { this.panel.step(); }
			break;
		}

		this.doors.forEach(function (d) {
			if (!d.anim) { return; }
			d.anim.step();
			if (d.anim.done) {
				d.turn = d.next;
				d.anim = null;
				d.idle = self.anim(self.data.doors[d.kind][d.turn][0], false);
				self.gateUp();
			}
		});
		var p = this.player;
		this.update(p, playing);
		this.things.forEach(function (t) { self.update(t, playing); });

		if (playing) {
			p.slow = false;
			var px = p.x * CELL + p.ox, py = p.y * CELL + p.oy;
			this.things.forEach(function (t) {
				if (t.st === 'gone' || self.state !== 'play') { return; }
				var dx = t.x * CELL + t.ox - px, dy = t.y * CELL + t.oy - py;
				if (Math.sqrt(dx * dx + dy * dy) > t.rec[8]) { return; }
				if (t.cls >= 2 && t.cls <= 6) {
					self.touch(t);
					if (self.energy <= 0) { self.go2('dead'); }
				} else if (t.cls === 7 && self.items <= 0) {
					self.go2('success');
				}
			});
			if (this.state !== 'play') { return; }
			this.drain += TICK;
			if (this.drain >= 3) {
				this.drain -= 3;
				this.energy -= 1;
				if (this.energy <= 0) { this.energy = 0; this.go2('dead'); return; }
			}
			if (!this.interactive) {
				this.playTime -= TICK;
				if (this.playTime <= 0) { this.go2('help'); }
			}
			return;
		}

		if (this.state === 'ready' && this.panel.done) { this.go2('play'); }
		if (this.state === 'success' && this.panel.done) {
			this.level = (this.level + 1) % 24;
			this.go2('ready');
		}
		if (this.state === 'gameover' && this.panel.done) { this.reset(); }
		if (this.state === 'dead') {
			var busy = [p].concat(this.things).some(function (t) { return t.st === 'vanish'; });
			if (!busy && this.since > 1) {
				if (this.lives <= 0) { this.go2('gameover'); }
				else { this.go2(this.interactive ? 'ready' : 'title'); }
			}
		}
	};

	/* --------------------------------------------------------------- paint */

	Rodger.prototype.paint = function (ctx) {
		var self = this, x, y, v;
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, this.w, this.h);
		if (this.state === 'title') {
			this.frame(ctx, this.titleText.n(), 0, 0);
			this.frame(ctx, this.ball.n(), 0, 0);
			return;
		}
		if (this.state === 'help') {
			this.frame(ctx, L.help, 0, 0);
			this.frame(ctx, this.legend.n(), 0, 0);
			return;
		}
		for (y = 0; y < ROWS; y += 1) { for (x = 0; x < COLS; x += 1) { this.frame(ctx, L.tile, x * CELL, y * CELL); } }
		this.frame(ctx, L.sidebar, 0, 0);
		for (y = 0; y < ROWS; y += 1) {
			for (x = 0; x < COLS; x += 1) {
				v = this.walls[y][x] & 15;
				if (v) { this.frame(ctx, L.wallShade + 7 * v, x * CELL, y * CELL); }
			}
		}
		for (y = 0; y < ROWS; y += 1) {
			for (x = 0; x < COLS; x += 1) {
				v = this.walls[y][x] & 15;
				if (v) { this.frame(ctx, L.wall + 7 * v, x * CELL, y * CELL); }
			}
		}
		this.frame(ctx, L.level + this.level + 1, 0, 0);
		this.frame(ctx, L.energy + Math.max(0, Math.min(100, Math.round(this.energy))), 0, 0);
		if (LIVES[this.lives]) { this.frame(ctx, LIVES[this.lives], 0, 0); }
		if (this.savedFlash) { this.frame(ctx, this.savedFlash.n(), 0, 0); }

		this.doors.forEach(function (d) {
			self.frame(ctx, (d.anim || d.idle).n(), d.x * CELL, d.y * CELL);
		});
		var list = this.things.slice().sort(function (a, b) { return a.cls === 3 ? -1 : b.cls === 3 ? 1 : 0; });
		list.push(this.player);
		list.forEach(function (t) {
			if (t.st === 'gone') { return; }
			var a = t.st === 'vanish' ? t.hide : t.st === 'appear' ? t.show : t.live;
			self.frame(ctx, a.n(), t.x * CELL + t.ox, t.y * CELL + t.oy);
		});
		if (this.panel) { this.frame(ctx, this.panel.n(), 0, 0); }
	};

	Rodger.prototype.step = function (dt, ctx) {
		if (!this.art || !this.data) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.w, this.h); return; }
		if (!this.state) { this.reset(); }
		this.acc = Math.min(this.acc + dt, 0.5);
		while (this.acc >= TICK) { this.acc -= TICK; this.tick(); }
		ctx.imageSmoothingEnabled = false;
		this.paint(ctx);
	};

	AfterDark.define('after-dark-rodger-dodger', function (el) {
		var sim = new Rodger();
		sim.loadSaved = AfterDark.flag(el, 'load-saved-level');
		var base = AfterDark.setting(el, 'art') || 'art/rodger';
		Promise.all([AfterDark.load(base), AfterDark.data(base)]).then(function (both) {
			sim.art = both[0];
			sim.data = both[1];
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		window.addEventListener('keydown', function (e) { sim.key(e, true); });
		window.addEventListener('keyup', function (e) { sim.key(e, false); });
		return sim;
	});

	window.AfterDarkRodgerDodger = Rodger;
}());
