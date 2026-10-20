/**
 * rps.js - Rock Paper Scissors, the brawl.
 *
 * RPS.AD's own description:
 *
 *   "Rock people are steady and show little emotion. Paper people are smooth
 *    and striking. Scissor people have a cutting personality.
 *    "Stars to Win" dictates how many rounds a fighter must win to be
 *    victorious. "Display Score" toggles the scoreboard on and off.
 *    Press "Caps-lock" to choose your fighter. Then, you play the computer
 *    traditional Rock Paper Scissors.
 *    Programming by Brock Wagenaar. Art by Stephen Ekstrom. Additional art by
 *    Bob Ting. Sound by P.J. Sonnichsen."
 *
 * Its controls are Stars to Win (1, 2, 3, 4) and Display Score (a checkbox).
 *
 * Art, in all/art/rps/, from tools/adweb.py: 54 RLE sequences - the rock,
 * paper and scissors in every pose (21004-21023 walking, 21500-21528
 * fighting, dying and the "choose your fighter" screen), three 258x258
 * background tiles (21001-21003), the star and the ROCK / PAPER / SCISSORS
 * WINS! banners (21000) and the scoreboard pieces (21900). None of it is
 * placed by code: the module's TYPE_8100 / TYPE_8102 resources are a score of
 * compound frames - which sprites, where, flipped or not, on which channel -
 * and that score is exported as all/art/rps/script.json and played as is.
 *
 * What plays when is in the module's code, which still has its class and
 * method names (ArenaControl, RockFighter::AttackHeavyKILL, ...), and has
 * been read for this port:
 *
 * - The three wander the screen on a 60x36 diagonal grid, each heading one of
 *   the four diagonals, choosing Move, Stop, Turn and quick-turn sequences to
 *   reach a destination; a new destination every ten seconds. One frame of
 *   the score every 83 ms. Health is 16 and creeps back a point every three
 *   seconds while walking.
 * - Any fighter will pick a fight with either of the others - there is no
 *   advantage in the matchup. The pair walk to two diagonally adjacent grid
 *   points either side of the spot between them, turn to face, play their
 *   fight intros and take a stance. If the other has not turned up in ten
 *   seconds they give up and walk off.
 * - The attacker then plays whole exchanges, both fighters in one compound,
 *   the defender hidden meanwhile: quick or heavy, miss or hit (a quick hit
 *   costs 1 health, a heavy 4); a hit that empties the bar becomes the kill.
 *   The first attack is drawn from a shuffled bag of six, the rest from a bag
 *   of ten that also holds a circling "rotate" and three turns at swapping
 *   attacker and defender. Paper cannot land a heavy hit facing down, nor
 *   scissors facing up: there it is turned into a 1-in-10 outright kill or a
 *   miss, as the code does. A losing, weak attacker (4 or less) may flee.
 * - The killed one lies where it fell. When two are down the survivor takes
 *   a star and its name flashes for four seconds; with enough stars it plays
 *   its "WINS!" in the middle of the screen and the stars are cleared; then
 *   one second of black, and everyone is back for the next round.
 * - Caps Lock: "YOU vs. COMPUTER". R, P or S picks; the computer picks
 *   something else; the winner's kill sequence plays and then YOU WIN! or
 *   YOU LOSE. Any other key, or 30 seconds, leaves. Caps Lock twice quickly
 *   changes the background tile, five times takes the 83 ms brake off. On a
 *   touch screen, a tap starts a game and a tap on the R, P or S box picks.
 *
 * Filled in here: how the module lines each new sequence up with the last
 * (it matches the same picture, or the fighter's colour-tagged channel, the
 * way its CompoundSequence::NewCenterAlign calls are named; small slides
 * hide where the result is a few pixels off), the exact rule for when a
 * third fighter is "in the way" of a fight, and the order fighters are
 * tried in. Sound is left out, as everywhere on this site.
 *
 *   <after-dark-rock-paper-scissors art="art/rps" stars-to-win="2" display-score>
 */
(function () {
	'use strict';

	var STARS = ['1', '2', '3', '4'];
	var FRAME = 0.083;
	var GX = 60;
	var GY = 36;
	/* High byte of a channel number: whose layer it is. */
	var COLOR = [3, 1, 4];
	var LEFT = { 5: 6, 6: 7, 7: 8, 8: 5 };
	var RIGHT = { 5: 8, 8: 7, 7: 6, 6: 5 };
	var BACK = { 5: 7, 6: 8, 7: 5, 8: 6 };

	/* Labels, as score frame numbers. Walking ones are per heading [frame, flip]; fight ones are
	   [facing up (5, 6), facing down (7, 8)], flipped for 6 and 7. Read out of RockFighter::Move etc. */
	var FIGHTERS = [
		{
			move: { 5: [289, 0], 6: [289, 1], 7: [146, 1], 8: [146, 0] },
			stop: { 5: [333, 0], 6: [333, 1], 7: [190, 1], 8: [190, 0] },
			left: { 5: [514, 0], 6: [345, 1], 7: [442, 1], 8: [202, 0] },
			right: { 5: [345, 0], 6: [514, 1], 7: [202, 1], 8: [442, 0] },
			leftQ: { 5: [574, 0], 6: [429, 1], 7: [501, 1], 8: [276, 0] },
			rightQ: { 5: [429, 0], 6: [574, 1], 7: [276, 1], 8: [501, 0] },
			stance: [226, 178], intro: [599, 587], exit: [726, 642], flee: [693, 609], winner: 18,
			rotate: { 1: [254, 206], 2: [238, 190] },
			attack: [
				{ 1: [640, 332], 2: [617, 309] }, { 1: [597, 289], 2: [577, 269] }, { 1: [684, 376], 2: [664, 356] },
				{ 1: [813, 524], 2: [784, 440] }, { 1: [750, 495], 2: [708, 400] }, { 1: [871, 549], 2: [843, 466] }
			]
		},
		{
			move: { 5: [1401, 0], 6: [1401, 1], 7: [1335, 1], 8: [1335, 0] },
			stop: { 5: [1417, 0], 6: [1417, 1], 7: [1351, 1], 8: [1351, 0] },
			left: { 5: [1502, 0], 6: [1433, 1], 7: [1468, 1], 8: [1367, 0] },
			right: { 5: [1433, 0], 6: [1502, 1], 7: [1367, 1], 8: [1468, 0] },
			leftQ: { 5: [1517, 0], 6: [1449, 1], 7: [1483, 1], 8: [1383, 0] },
			rightQ: { 5: [1449, 0], 6: [1517, 1], 7: [1383, 1], 8: [1483, 0] },
			uturnQ: { 5: [1550, 0], 6: [1550, 1], 7: [1536, 1], 8: [1536, 0] },
			stance: [1783, 1705], intro: [1576, 1564], exit: [1637, 1602], flee: [1622, 1586], winner: 94,
			rotate: { 0: [1810, 1734], 2: [1825, 1750] },
			attack: [
				{ 0: [2126, 1872], 2: [2144, 1889] }, { 0: [2096, 1841], 2: [2110, 1855] }, { 0: [2165, 1909], 2: [2179, 1924] },
				{ 0: [2273, 1938], 2: [2306, 1961] }, { 0: [2195, 0], 2: [2230, 0] }, { 0: [2338, 2000], 2: [2373, 2040] }
			]
		},
		{
			move: { 5: [903, 0], 6: [903, 1], 7: [778, 1], 8: [778, 0] },
			stop: { 5: [934, 0], 6: [934, 1], 7: [809, 1], 8: [809, 0] },
			left: { 5: [1110, 0], 6: [947, 1], 7: [1029, 1], 8: [822, 0] },
			right: { 5: [947, 0], 6: [1110, 1], 7: [822, 1], 8: [1029, 0] },
			leftQ: { 5: [1173, 0], 6: [1010, 1], 7: [1092, 1], 8: [885, 0] },
			rightQ: { 5: [1010, 0], 6: [1173, 1], 7: [885, 1], 8: [1092, 0] },
			stance: [1013, 939], intro: [1203, 1191], exit: [1293, 1233], flee: [1276, 1214], winner: 54,
			rotate: { 0: [1036, 964], 1: [1052, 980] },
			attack: [
				{ 0: [1390, 1102], 1: [1409, 1121] }, { 0: [1355, 1068], 1: [1372, 1085] }, { 0: [1433, 1145], 1: [1450, 1162] },
				{ 0: [1473, 1237], 1: [0, 1266] }, { 0: [0, 1185], 1: [0, 1214] }, { 0: [1501, 1295], 1: [1579, 1326] }
			]
		}
	];
	var Q_MISS = 0, Q_HIT = 1, Q_KILL = 2, H_MISS = 3, H_HIT = 4, H_KILL = 5;

	/* "You vs. computer", from ArenaControl::PlayInteractiveMode and the tables after it. */
	var PICK = [10, 17, 24, 31, 38, 45];
	var DUEL = [[0, 53, 60], [67, 0, 74], [81, 88, 0]];
	var KILL_HEAVY = [[0, 2338, 466], [2338, 0, 1326], [466, 1579, 0]];
	var KILL_QUICK = [[0, 2165, 356], [2165, 0, 1162], [356, 1450, 0]];
	var KILL_FLIP = [[0, 1, 0], [0, 0, 1], [1, 0, 0]];
	var YOU_WIN = [[0, 0, 1], [1, 0, 0], [0, 1, 0]];

	function rand(n) {
		return Math.floor(Math.random() * n);
	}

	/** The module's shuffled bag: each of 0..n-1 once, in random order, then again. */
	function Bag(n) {
		this.n = n;
		this.left = [];
	}

	Bag.prototype.next = function () {
		if (!this.left.length) {
			for (var i = 0; i < this.n; i += 1) { this.left.push(i); }
		}
		return this.left.splice(rand(this.left.length), 1)[0];
	};

	function heading(dx, dy) {
		return dy <= 0 ? (dx >= 0 ? 5 : 6) : (dx >= 0 ? 8 : 7);
	}

	function pairLabel(pair, h) {
		if (!pair) { return null; }
		var f = h === 5 || h === 6 ? pair[0] : pair[1];
		return f ? [f, h === 6 || h === 7 ? 1 : 0] : null;
	}

	function center(l) {
		return { x: l.x + l.w / 2, y: l.y + l.h / 2 };
	}

	/* ------------------------------------------------------------ score --- */

	/** The decoded TYPE_8100/8102 score: frame number -> layers. */
	function Score(json, art) {
		this.art = art;
		this.groups = {};
		for (var g in json.groups) {
			var src = json.groups[g], frames = {}, runs = [];
			for (var r = 0; r < src.runs.length; r += 1) {
				var start = src.runs[r][0], list = src.runs[r][1];
				runs.push([start, list.length]);
				for (var i = 0; i < list.length; i += 1) {
					var e = list[i];
					frames[start + i] = typeof e === 'number' ? { rec: src.records[e], dx: 0, dy: 0 } : { rec: src.records[e[0]], dx: e[1], dy: e[2] };
				}
			}
			this.groups[g] = { frames: frames, runs: runs };
		}
	}

	/** Frame numbers from `from` to the end of its run (or the next run, if `from` falls in a gap). */
	Score.prototype.run = function (g, from) {
		var runs = this.groups[g].runs;
		for (var i = 0; i < runs.length; i += 1) {
			var s = runs[i][0], n = runs[i][1];
			if (from < s + n) {
				var out = [];
				for (var f = Math.max(from, s); f < s + n; f += 1) { out.push(f); }
				return out;
			}
		}
		return [from];
	};

	/** One frame's layers in group coordinates, mirrored for a flipped label. */
	Score.prototype.layers = function (g, f, flip) {
		var fr = this.groups[g].frames[f], out = [];
		if (!fr) { return out; }
		for (var i = 0; i < fr.rec.length; i += 1) {
			var l = fr.rec[i], seq = this.art.sequence(l[0]);
			if (!seq) { continue; }
			var a = seq.frames[l[1]], x = l[3] + fr.dx;
			if (flip) { x = -(l[3] + a.w) - fr.dx; }
			out.push({ sid: l[0], fr: l[1], x: x, y: l[4] + fr.dy, w: a.w, h: a.h, fx: ((l[2] & 1) ? 1 : 0) ^ flip, fy: l[2] & 2, ch: l[5] });
		}
		return out;
	};

	Score.prototype.draw = function (ctx, l, ox, oy) {
		var seq = this.art.sequence(l.sid), a = seq.frames[l.fr];
		var x = Math.round(l.x + ox), y = Math.round(l.y + oy);
		if (!l.fx && !l.fy) {
			ctx.drawImage(seq.image, a.x, a.y, a.w, a.h, x, y, a.w, a.h);
			return;
		}
		ctx.save();
		ctx.translate(x + (l.fx ? a.w : 0), y + (l.fy ? a.h : 0));
		ctx.scale(l.fx ? -1 : 1, l.fy ? -1 : 1);
		ctx.drawImage(seq.image, a.x, a.y, a.w, a.h, 0, 0, a.w, a.h);
		ctx.restore();
	};

	/* ---------------------------------------------------------- fighter --- */

	function Fighter(game, type) {
		this.game = game;
		this.type = type;
		this.t = FIGHTERS[type];
		this.color = COLOR[type];
		this.h = 8;
		this.ox = 0;
		this.oy = 0;
		this.g = null;
		this.frames = null;
		this.fi = 0;
		this.flip = 0;
		this.chan = {};
		this.cur = [];
		this.mode = 'walk';
		this.queue = [];
		this.slide = null;
		this.health = 16;
		this.dead = false;
		this.hidden = false;
	}

	/** This fighter's layer in a frame: its colour-tagged channel, or the only one. */
	Fighter.prototype.own = function (layers, chan) {
		var c = chan[this.color], i;
		for (i = 0; i < layers.length; i += 1) {
			if ((layers[i].ch >> 8) === this.color) { return layers[i]; }
		}
		if (c !== undefined) {
			for (i = 0; i < layers.length; i += 1) {
				if ((layers[i].ch & 255) === c) { return layers[i]; }
			}
		}
		return layers.length === 1 || c === undefined ? layers[0] : null;
	};

	/** Where this fighter stands: the middle of its own sprite. */
	Fighter.prototype.pos = function () {
		var l = this.own(this.cur, this.chan) || this.cur[0];
		return l ? center(l) : { x: this.ox, y: this.oy };
	};

	/**
	 * Starts a label. `ref` is what to line the first frame up with - by
	 * default what this fighter showed last - as {layers, chan, ox, oy}.
	 */
	Fighter.prototype.play = function (g, from, flip, ref) {
		var sc = this.game.score, frames = sc.run(g, from), first = sc.layers(g, frames[0], flip), chan = {};
		for (var i = 0; i < first.length; i += 1) {
			if (first[i].ch >> 8) { chan[first[i].ch >> 8] = first[i].ch & 255; }
		}
		if (chan[this.color] === undefined && first.length) { chan[this.color] = first[0].ch & 255; }
		var mine = !ref;
		ref = ref || { layers: this.cur, chan: this.chan, g: this.g };
		var a = this.own(ref.layers, ref.chan), b = this.own(first, chan);
		if (!this.cur.length && !ref.layers.length) {
			b = b || first[0];
		} else if (a && b) {
			if (a.sid === b.sid && a.fr === b.fr) {
				this.ox = a.x - b.x;
				this.oy = a.y - b.y;
			} else if (!(mine && ref.g === g && g === '21500')) {
				var ca = center(a), cb = center(b);
				this.ox = ca.x - cb.x;
				this.oy = ca.y - cb.y;
			}
		}
		this.g = g;
		this.frames = frames;
		this.fi = 0;
		this.flip = flip;
		this.chan = chan;
		this.layers();
	};

	/** Screen-space layers of the current frame. */
	Fighter.prototype.layers = function () {
		var ls = this.game.score.layers(this.g, this.frames[this.fi], this.flip);
		for (var i = 0; i < ls.length; i += 1) {
			ls[i].x += this.ox;
			ls[i].y += this.oy;
		}
		this.cur = ls;
	};

	/** Puts the fighter's own sprite centre at (x, y) without playing anything. */
	Fighter.prototype.placeAt = function (x, y) {
		var p = this.pos();
		this.ox += x - p.x;
		this.oy += y - p.y;
		this.layers();
	};

	/** One 83 ms tick. Returns true when the label has just ended. */
	Fighter.prototype.tick = function () {
		if (this.slide) {
			var s = this.slide, k = 1 / s.n;
			this.ox += s.dx * k;
			this.oy += s.dy * k;
			s.n -= 1;
			s.dx -= s.dx * k;
			s.dy -= s.dy * k;
			if (s.n <= 0) { this.slide = null; }
		}
		if (!this.frames) { return false; }
		if (this.fi < this.frames.length - 1) {
			this.fi += 1;
			this.layers();
			return false;
		}
		this.layers();
		return true;
	};

	Fighter.prototype.walkLabel = function (kind) {
		var e = this.t[kind][this.h];
		if (kind === 'left' || kind === 'leftQ') { this.h = LEFT[this.h]; }
		if (kind === 'right' || kind === 'rightQ') { this.h = RIGHT[this.h]; }
		if (kind === 'uturnQ') { this.h = BACK[this.h]; }
		this.play('21000', e[0], e[1]);
	};

	/** Turns on the spot to face `h`: quick turns, or paper's own about-face. */
	Fighter.prototype.turnTo = function (h) {
		if (h === this.h) { return false; }
		if (LEFT[this.h] === h) {
			this.walkLabel('leftQ');
		} else if (RIGHT[this.h] === h) {
			this.walkLabel('rightQ');
		} else if (this.t.uturnQ) {
			this.walkLabel('uturnQ');
		} else {
			var k = Math.random() < 0.5 ? 'leftQ' : 'rightQ';
			this.walkLabel(k);
			this.queue.push(k);
		}
		return true;
	};

	/** Fighter::ChooseWalkBehavior, more or less: the next label on the way to `dest`. */
	Fighter.prototype.walk = function () {
		if (this.queue.length) {
			this.walkLabel(this.queue.shift());
			return;
		}
		var p = this.pos(), d = this.dest, ar = this.game.arena();
		/* Never off the edge: anyone getting close turns back towards the middle. */
		if (!this.fightPoint && (p.x < 110 || p.x > ar.x1 - 110 || p.y < 90 || p.y > ar.y1 - 80)) {
			d = this.dest = this.game.gridPoint();
			this.destAt = this.game.clock;
		}
		if (!d) {
			this.still();
			return;
		}
		var dx = d.x - p.x, dy = d.y - p.y;
		var close = this.fightPoint ? Math.abs(dx) <= GX && Math.abs(dy) <= GY : Math.abs(dx) < GX * 0.75 && Math.abs(dy) < GY * 0.75;
		if (close) {
			this.dest = null;
			this.arrived = true;
			if (!this.stopped) {
				this.stopped = true;
				this.walkLabel('stop');
			} else {
				this.still();
			}
			return;
		}
		this.stopped = false;
		this.arrived = false;
		var cur = this.h, sx = cur === 5 || cur === 8 ? 1 : -1, sy = cur === 7 || cur === 8 ? 1 : -1;
		if (Math.abs(dx) >= GX * 0.75) { sx = dx > 0 ? 1 : -1; }
		if (Math.abs(dy) >= GY * 0.75) { sy = dy > 0 ? 1 : -1; }
		var want = heading(sx, sy), near = Math.sqrt(dx * dx + dy * dy) < 140;
		if (want === cur) {
			this.walkLabel('move');
		} else if (LEFT[cur] === want) {
			this.walkLabel(near ? 'leftQ' : 'left');
		} else if (RIGHT[cur] === want) {
			this.walkLabel(near ? 'rightQ' : 'right');
		} else if (near && this.t.uturnQ) {
			this.walkLabel('uturnQ');
		} else {
			/* About-face: two quick turns, so it does not wander off sideways. */
			var k = Math.random() < 0.5 ? 'leftQ' : 'rightQ';
			this.walkLabel(k);
			this.queue.push(k);
		}
	};

	/** Standing still: hold the last frame. */
	Fighter.prototype.still = function () {
		this.idle = true;
	};

	Fighter.prototype.goTo = function (pt) {
		this.dest = pt;
		this.arrived = false;
		if (this.idle) {
			this.idle = false;
			this.walk();
		}
	};

	/* ------------------------------------------------------------- game --- */

	function RockPaperScissors() {
		this.stars = 2;
		this.showScore = true;
		this.score = null;
		this.art = null;
		this.acc = 0;
		this.turbo = false;
		this.background = 0;
		this.bgBag = new Bag(3);
		this.bags = { first: new Bag(6), next: new Bag(10), lucky: new Bag(10), order: new Bag(3) };
		this.caps = { n: 0, at: 0 };
		this.clock = 0;
		this.wins = [0, 0, 0];
		this.play = null;
	}

	RockPaperScissors.prototype.resize = function (w, h) {
		this.k = Math.max(0.5, Math.min(w, h) / 768);
		this.W = w / this.k;
		this.H = h / this.k;
		if (this.score && !this.fighters) { this.newRound(); }
	};

	/** The ground they walk on, above the scoreboard. */
	RockPaperScissors.prototype.arena = function () {
		return { x0: 0, y0: 0, x1: this.W, y1: this.H - (this.showScore ? 40 : 0) };
	};

	RockPaperScissors.prototype.gridPoint = function (margin) {
		var a = this.arena(), mx = margin || 170, my = margin ? margin * 0.8 : 120;
		var x = mx + Math.random() * Math.max(1, a.x1 - 2 * mx), y = my + Math.random() * Math.max(1, a.y1 - 2 * my);
		return { x: Math.round(x / GX) * GX, y: Math.round(y / GY) * GY };
	};

	RockPaperScissors.prototype.newRound = function () {
		var i, f;
		if (!this.fighters) {
			this.fighters = [new Fighter(this, 0), new Fighter(this, 1), new Fighter(this, 2)];
		}
		var taken = [];
		for (i = 0; i < 3; i += 1) {
			f = this.fighters[i];
			var p, tries = 0;
			do {
				p = this.gridPoint(110);
				tries += 1;
			} while (tries < 40 && taken.some(function (q) { return Math.abs(q.x - p.x) < 200 && Math.abs(q.y - p.y) < 140; }));
			taken.push(p);
			f.cur = [];
			f.frames = null;
			f.h = 5 + rand(4);
			f.dead = false;
			f.hidden = false;
			f.health = 16;
			f.queue = [];
			f.slide = null;
			f.mode = 'walk';
			f.stopped = true;
			f.idle = false;
			f.walkLabel('stop');
			f.placeAt(p.x, p.y);
			f.fi = f.frames.length - 1;
			f.layers();
			f.dest = this.gridPoint();
			f.destAt = this.clock;
			f.healAt = this.clock;
			f.idle = true;
			f.goTo(f.dest);
		}
		this.fight = null;
		this.lastFight = null;
		this.lastAttackAt = this.clock;
		this.roundOver = null;
		this.flash = null;
	};

	/* One tick of ArenaControl::Play: every fighter, then ArenaControl::ChooseBehavior. */
	RockPaperScissors.prototype.tick = function () {
		this.clock += FRAME;
		if (this.play) {
			this.tickPlay();
			return;
		}
		if (this.blackout) {
			this.blackout -= FRAME;
			if (this.blackout <= 0) {
				this.blackout = 0;
				this.newRound();
			}
			return;
		}
		var fs = this.fighters, i;
		for (i = 0; i < fs.length; i += 1) {
			var f = fs[i];
			if (f.hidden && f.mode !== 'winner') { continue; }
			var ended = f.tick();
			if (ended) { this.labelEnded(f); }
			if (f.mode === 'walk' && !f.dead) {
				if (f.health < 16 && this.clock - f.healAt > 3) {
					f.health += 1;
					f.healAt = this.clock;
				}
				if (!f.fightPoint && this.clock - f.destAt > 10) {
					f.destAt = this.clock;
					f.goTo(this.gridPoint());
				}
			} else {
				f.healAt = this.clock;
			}
		}
		this.referee();
	};

	RockPaperScissors.prototype.labelEnded = function (f) {
		var fight = this.fight;
		switch (f.mode) {
			case 'walk':
				if (f.idle) { return; }
				f.walk();
				if (f.fightPoint && f.arrived) { this.atFightPoint(f); }
				break;
			case 'intro':
				if (f.queue.length) {
					f.walkLabel(f.queue.shift());
				} else if (!f.introDone) {
					f.introDone = true;
					var e = pairLabel(f.t.intro, f.h);
					f.play('21000', e[0], e[1]);
				} else {
					this.stance(f);
				}
				break;
			case 'stance':
				var s = pairLabel(f.t.stance, f.h);
				f.play('21500', s[0], s[1]);
				break;
			case 'attack':
				this.attackEnded(f);
				break;
			case 'exit':
				f.mode = 'walk';
				f.idle = true;
				f.stopped = false;
				f.destAt = this.clock;
				f.goTo(this.gridPoint());
				break;
			case 'winner':
				if (this.roundOver) { this.roundOver.winnerDone = true; }
				break;
			default:
				break;
		}
		if (fight && fight.done) { this.fight = null; }
	};

	/* --------------------------------------------------------- fighting --- */

	RockPaperScissors.prototype.referee = function () {
		var fs = this.fighters, i;
		var deaths = fs.filter(function (f) { return f.dead; }).length;
		if (deaths >= 2 || this.roundOver) {
			this.endOfRound();
			return;
		}
		var fight = this.fight;
		if (!fight) {
			var first = this.bags.order.next();
			for (i = 0; i < 3; i += 1) {
				var a = fs[(first + i) % 3];
				if (a.mode === 'walk' && !a.dead && this.tryAttack(a)) { break; }
			}
			return;
		}
		if (fight.phase === 'meet') {
			var ready = fight.a.mode === 'stance' && fight.d.mode === 'stance';
			var waiting = fight.a.mode === 'stance' || fight.d.mode === 'stance';
			if (waiting && fight.waitFrom === undefined) { fight.waitFrom = this.clock; }
			if (ready && !fight.a.slide && !fight.d.slide) {
				fight.phase = 'fight';
				this.attack(true);
			} else if (fight.waitFrom !== undefined && this.clock - fight.waitFrom > 10) {
				/* ArenaControl::FightOrDefendWait: ten seconds and they give up. */
				this.giveUp(fight.a);
				this.giveUp(fight.d);
				this.fight = null;
			}
		}
	};

	/** The one left waiting plays its fight exit; one still on its way just walks somewhere else. */
	RockPaperScissors.prototype.giveUp = function (f) {
		if (f.mode === 'walk') {
			f.fightPoint = null;
			f.destAt = this.clock;
			f.goTo(this.gridPoint());
		} else {
			this.exitFight(f, 'exit');
		}
	};

	/** ArenaControl::Try{Rock,Paper,Scissors}Attack and GetFightDestinationPoints. */
	RockPaperScissors.prototype.tryAttack = function (a) {
		var others = [0, 1, 2].filter(function (t) { return t !== a.type; }), order;
		order = rand(2) === 0 ? others : [others[1]];
		for (var i = 0; i < order.length; i += 1) {
			var d = this.fighters[order[i]];
			if (d.mode !== 'walk' || d.dead) { continue; }
			var pts = this.fightPoints(a, d, 240, 144) ||
				(this.clock - this.lastAttackAt > 15 ? this.fightPoints(a, d, 120, 72, true) : null) ||
				(this.clock - this.lastAttackAt > 30 ? this.fightPoints(a, d, 0, 0, true) : null);
			if (pts) {
				this.startFight(a, d, pts);
				return true;
			}
		}
		return false;
	};

	RockPaperScissors.prototype.fightPoints = function (a, d, insetX, insetY, nextToDefender) {
		var pa = a.pos(), pd = d.pos(), ar = this.arena(), p8, pc;
		if (nextToDefender) {
			p8 = { x: Math.round(pd.x / GX) * GX, y: Math.round(pd.y / GY) * GY };
			pc = { x: p8.x + (pa.x < p8.x ? -GX : GX), y: p8.y + (pa.y < p8.y ? -GY : GY) };
		} else {
			var mid = { x: (pa.x + pd.x) / 2, y: (pa.y + pd.y) / 2 };
			p8 = { x: Math.round(mid.x / GX) * GX, y: Math.round(mid.y / GY) * GY };
			pc = { x: p8.x + (mid.x < p8.x ? -GX : GX), y: p8.y + (mid.y < p8.y ? -GY : GY) };
		}
		var ok = function (p) {
			return p.x >= ar.x0 + Math.max(insetX, 150) && p.x <= ar.x1 - Math.max(insetX, 150) &&
				p.y >= ar.y0 + Math.max(insetY, 110) && p.y <= ar.y1 - Math.max(insetY, 90);
		};
		if (!ok(p8) || !ok(pc)) { return null; }
		var da = Math.hypot(pa.x - p8.x, pa.y - p8.y), dc = Math.hypot(pa.x - pc.x, pa.y - pc.y);
		var at = da <= dc ? p8 : pc, dt = at === p8 ? pc : p8;
		if (nextToDefender) {
			at = pc;
			dt = p8;
		}
		/* The third one must not be standing (or lying) in the way. */
		var third = this.fighters[3 - a.type - d.type];
		var t = third.pos();
		if ([at, dt].some(function (p) { return Math.abs(t.x - p.x) < 100 && Math.abs(t.y - p.y) < 60; })) { return null; }
		if (this.lastFight && this.lastFight.a.x === at.x && this.lastFight.a.y === at.y &&
			this.lastFight.d.x === dt.x && this.lastFight.d.y === dt.y) { return null; }
		return { a: at, d: dt, h: heading(dt.x - at.x, dt.y - at.y) };
	};

	RockPaperScissors.prototype.startFight = function (a, d, pts) {
		this.fight = { a: a, d: d, ha: pts.h, hd: BACK[pts.h], phase: 'meet', first: true, noSwitch: false };
		this.lastFight = { a: pts.a, d: pts.d };
		a.fightPoint = pts.a;
		d.fightPoint = pts.d;
		a.fightHeading = pts.h;
		d.fightHeading = BACK[pts.h];
		a.destAt = d.destAt = this.clock;
		a.goTo(pts.a);
		d.goTo(pts.d);
		if (a.arrived) { this.atFightPoint(a); }
		if (d.arrived) { this.atFightPoint(d); }
	};

	/* Arrived: turn on the spot to face the other, then the fight intro. */
	RockPaperScissors.prototype.atFightPoint = function (f) {
		if (f.mode !== 'walk' || !this.fight) { return; }
		var p = f.pos();
		f.slide = { dx: f.fightPoint.x - p.x, dy: f.fightPoint.y - p.y, n: 10 };
		f.fightPoint = null;
		f.mode = 'intro';
		f.idle = false;
		f.introDone = false;
		f.queue = [];
		if (!f.turnTo(f.fightHeading)) {
			f.introDone = true;
			var e = pairLabel(f.t.intro, f.h);
			f.play('21000', e[0], e[1]);
		}
	};

	RockPaperScissors.prototype.stance = function (f) {
		var fight = this.fight;
		f.mode = 'stance';
		var s = pairLabel(f.t.stance, f.h);
		f.play('21500', s[0], s[1]);
		if (!fight) { return; }
		/* Stand where the attacker's sequences have the defender. */
		var a = fight.a, d = fight.d;
		if (a.mode === 'stance' && d.mode === 'stance') {
			var e = pairLabel(a.t.attack[Q_HIT][d.type], a.h), sc = this.score;
			var first = sc.layers('21500', sc.run('21500', e[0])[0], e[1]), chan = {};
			first.forEach(function (l) { if (l.ch >> 8) { chan[l.ch >> 8] = l.ch & 255; } });
			var la = a.own(first, chan), ld = d.own(first, chan), pa = a.pos();
			if (la && ld) {
				var ca = center(la), cd = center(ld), pd = d.pos();
				var tx = pa.x + (cd.x - ca.x), ty = pa.y + (cd.y - ca.y);
				d.slide = { dx: tx - pd.x, dy: ty - pd.y, n: 6 };
			}
		}
	};

	/** ArenaControl::FighterAttack. */
	RockPaperScissors.prototype.attack = function (first) {
		var fight = this.fight, a = fight.a, d = fight.d, kind;
		this.lastAttackAt = this.clock;
		if (first) {
			kind = [Q_MISS, Q_HIT, Q_HIT, H_MISS, H_HIT, H_HIT][this.bags.first.next()];
		} else {
			var r = this.bags.next.next();
			if (r === 6) {
				this.rotate();
				return;
			}
			if (r > 6) {
				if (!fight.noSwitch) {
					this.switchAttackers();
					return;
				}
				kind = Q_MISS;
			} else {
				kind = [Q_MISS, Q_HIT, Q_HIT, H_MISS, H_HIT, H_HIT][r];
			}
		}
		var down = a.h === 7 || a.h === 8;
		if (kind === H_HIT && ((a.type === 1 && down) || (a.type === 2 && !down))) {
			kind = this.bags.lucky.next() === 0 ? H_KILL : (rand(2) === 0 ? H_MISS : Q_MISS);
		}
		if (kind === H_MISS && a.type === 2 && !down && d.type === 1) { kind = Q_MISS; }
		if (kind === Q_HIT) { d.health -= 1; }
		if (kind === H_HIT) { d.health -= 4; }
		if (kind === Q_KILL || kind === H_KILL) { d.health = 0; }
		if (d.health <= 0) {
			d.health = 0;
			if (kind === Q_HIT) { kind = Q_KILL; }
			if (kind === H_HIT) { kind = H_KILL; }
		}
		fight.noSwitch = false;
		fight.kind = kind;
		var e = pairLabel(a.t.attack[kind][d.type], a.h) || pairLabel(a.t.attack[Q_MISS][d.type], a.h);
		this.attackLabel(a, d, e);
	};

	RockPaperScissors.prototype.attackLabel = function (a, d, e) {
		a.mode = 'attack';
		a.hidden = false;
		a.play('21500', e[0], e[1]);
		d.mode = 'hidden';
		d.hidden = true;
	};

	RockPaperScissors.prototype.rotate = function () {
		var fight = this.fight, a = fight.a, d = fight.d;
		fight.kind = 'rotate';
		fight.noSwitch = true;
		var e = pairLabel(a.t.rotate[d.type], a.h);
		this.attackLabel(a, d, e);
	};

	/** ArenaControl::SwitchAttackers: the defender picks up where it was drawn and attacks. */
	RockPaperScissors.prototype.switchAttackers = function () {
		var fight = this.fight, a = fight.a, d = fight.d;
		fight.a = d;
		fight.d = a;
		d.h = d.fightHeading || BACK[a.h];
		d.cur = a.cur;
		d.chan = a.chan;
		d.g = a.g;
		d.ox = a.ox;
		d.oy = a.oy;
		this.attack(false);
	};

	RockPaperScissors.prototype.attackEnded = function (a) {
		var fight = this.fight;
		if (!fight || fight.a !== a) {
			this.exitFight(a, 'exit');
			return;
		}
		var d = fight.d, ref = { layers: a.cur, chan: a.chan };
		if (fight.kind === Q_KILL || fight.kind === H_KILL) {
			/* The loser lies as the kill left it (its PlayDead pose is the same picture). */
			var ac = a.chan[a.color];
			d.cur = a.cur.filter(function (l) { return (l.ch & 255) !== ac && (l.ch >> 8) !== a.color; });
			d.frames = null;
			d.dead = true;
			d.hidden = false;
			d.mode = 'dead';
			this.exitFight(a, 'exit');
			this.fight = null;
			return;
		}
		if (fight.kind !== 'rotate' && !this.attackAgain(a, d)) {
			this.exitFight(a, 'flee', ref);
			this.exitFight(d, 'exit', ref);
			this.fight = null;
			return;
		}
		this.attack(false);
	};

	/** ArenaControl::IsAttackAgain. */
	RockPaperScissors.prototype.attackAgain = function (a, d) {
		return a.health > 4 || a.health >= d.health || rand(10) !== 0;
	};

	RockPaperScissors.prototype.exitFight = function (f, how, ref) {
		f.hidden = false;
		f.fightPoint = null;
		f.queue = [];
		f.slide = null;
		var e = pairLabel(f.t[how], f.h);
		f.mode = 'exit';
		f.play('21000', e[0], e[1], ref ? { layers: ref.layers, chan: ref.chan } : null);
	};

	/* ----------------------------------------------------- end of round --- */

	RockPaperScissors.prototype.endOfRound = function () {
		var ro = this.roundOver, fs = this.fighters;
		if (!ro) {
			var w = fs.filter(function (f) { return !f.dead; })[0];
			ro = this.roundOver = { winner: w, at: this.clock };
			if (w) {
				this.wins[w.type] += 1;
				this.flash = { type: w.type, until: this.clock + 4 };
			}
			if (this.fight) {
				this.exitFight(this.fight.a, 'exit');
				this.fight = null;
			}
			return;
		}
		if (this.clock - ro.at < 4) { return; }
		var w2 = ro.winner;
		if (w2 && this.wins[w2.type] >= this.stars && !ro.shown) {
			/* ...Fighter::Winner: "ROCK WINS!" in the middle, everything else gone. */
			ro.shown = true;
			fs.forEach(function (f) { f.hidden = f !== w2; });
			w2.mode = 'winner';
			w2.hidden = false;
			w2.frames = null;
			w2.cur = [];
			w2.play('21000', w2.t.winner, 0);
			/* Measured on the real thing: the star sits in the middle of the arena, 6 px high. */
			var ar = this.arena(), ls = this.score.layers('21000', w2.frames[1], 0);
			var star = ls.filter(function (l) { return l.sid === 21000 && l.fr === 0; })[0] || ls[0];
			w2.ox = ar.x1 / 2 - (star.x + star.w / 2);
			w2.oy = ar.y1 / 2 - 6 - (star.y + star.h / 2);
			w2.layers();
			return;
		}
		if (ro.shown && !ro.winnerDone) { return; }
		if (ro.shown) { this.wins = [0, 0, 0]; }
		this.blackout = 1;
		this.roundOver = null;
		fs.forEach(function (f) { f.hidden = true; });
	};

	/* ------------------------------------------------- you vs. computer --- */

	RockPaperScissors.prototype.startPlay = function () {
		if (this.play || !this.score) { return; }
		var c = rand(3);
		this.play = { phase: 'pick', at: this.clock, computer: c, i: 0, ox: 0, oy: 0 };
		this.playLabel('21500', PICK[0], 0, true);
	};

	RockPaperScissors.prototype.playLabel = function (g, from, flip, centre, at) {
		var p = this.play, sc = this.score;
		p.g = g;
		p.frames = sc.run(g, from);
		p.fi = 0;
		p.flip = flip;
		if (centre) {
			var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
			var runs = centre === true ? PICK : [from];
			runs.forEach(function (r) {
				sc.run(g, r).forEach(function (f) {
					sc.layers(g, f, flip).forEach(function (l) {
						b.x0 = Math.min(b.x0, l.x); b.y0 = Math.min(b.y0, l.y);
						b.x1 = Math.max(b.x1, l.x + l.w); b.y1 = Math.max(b.y1, l.y + l.h);
					});
				});
			});
			var pt = at || { x: this.W / 2, y: this.H / 2 };
			p.ox = pt.x - (b.x0 + b.x1) / 2;
			p.oy = pt.y - (b.y0 + b.y1) / 2;
		}
	};

	RockPaperScissors.prototype.choose = function (you) {
		var p = this.play;
		if (!p || p.phase !== 'pick') { return; }
		p.you = you;
		/* The computer never picks the same as you. */
		while (p.computer === you) { p.computer = rand(3); }
		p.phase = 'duel';
		this.playLabel('21500', DUEL[you][p.computer], 0, false);
	};

	RockPaperScissors.prototype.tickPlay = function () {
		var p = this.play;
		if (p.fi < p.frames.length - 1) {
			p.fi += 1;
			return;
		}
		if (p.phase === 'pick') {
			if (this.clock - p.at > 30) {
				this.play = null;
				return;
			}
			/* Each of these opens on a bare key frame (the three fighters, no boxes); cycling
			   through them, that would blink the whole screen, so it is stepped over. */
			p.i = (p.i + 1) % PICK.length;
			this.playLabel('21500', PICK[p.i] + 1, 0, false);
		} else if (p.phase === 'duel') {
			p.phase = 'kill';
			var tbl = rand(2) ? KILL_HEAVY : KILL_QUICK, sc = this.score;
			var last = sc.layers(p.g, p.frames[p.fi], p.flip), ox = p.ox, oy = p.oy;
			this.playLabel('21500', tbl[p.you][p.computer], KILL_FLIP[p.you][p.computer], false);
			/* It carries on from where the duel left the two of them: line up the same pictures. */
			var first = sc.layers(p.g, p.frames[0], p.flip);
			p.ox = ox;
			p.oy = oy;
			for (var i = 0; i < first.length; i += 1) {
				var m = last.filter(function (l) { return l.sid === first[i].sid && l.fr === first[i].fr; })[0];
				if (m) {
					p.ox = ox + m.x - first[i].x;
					p.oy = oy + m.y - first[i].y;
					break;
				}
			}
		} else if (p.phase === 'kill') {
			p.phase = 'result';
			p.keep = p.frames[p.frames.length - 1];
			p.keepO = { ox: p.ox, oy: p.oy, flip: p.flip, g: p.g };
			this.playLabel('21500', YOU_WIN[p.you][p.computer] ? 95 : 133, 0, true, { x: this.W / 2, y: this.H * 0.75 });
		} else {
			this.play = null;
		}
	};

	RockPaperScissors.prototype.drawPlay = function (ctx) {
		var p = this.play, sc = this.score, i, ls;
		if (p.keep !== undefined) {
			ls = sc.layers(p.keepO.g, p.keep, p.keepO.flip);
			for (i = 0; i < ls.length; i += 1) { sc.draw(ctx, ls[i], p.keepO.ox, p.keepO.oy); }
		}
		ls = sc.layers(p.g, p.frames[p.fi], p.flip);
		for (i = 0; i < ls.length; i += 1) { sc.draw(ctx, ls[i], p.ox, p.oy); }
	};

	/** Which of the R / P / S boxes a tap at (x, y) landed in, or -1. */
	RockPaperScissors.prototype.boxAt = function (x, y) {
		var p = this.play;
		if (!p || p.phase !== 'pick') { return -1; }
		var ls = this.score.layers('21500', PICK[0] + 1, 0), boxes = [];
		for (var i = 0; i < ls.length; i += 1) {
			if (ls[i].sid === 21527 && ls[i].fr === 23) { boxes.push(ls[i]); }
		}
		boxes.sort(function (a, b) { return a.y - b.y; });
		var wx = x / this.k - p.ox, wy = y / this.k - p.oy;
		for (i = 0; i < boxes.length; i += 1) {
			var b = boxes[i];
			if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) { return [0, 1, 2][i]; }
		}
		return -1;
	};

	/** Caps Lock presses, counted in bursts as GetCapsLockPressCount does (333 ms apart at most). */
	RockPaperScissors.prototype.capsLock = function () {
		this.caps.n += 1;
		this.caps.at = this.clock;
	};

	RockPaperScissors.prototype.capsBurst = function () {
		var c = this.caps;
		if (!c.n || this.clock - c.at < 0.333) { return; }
		var n = c.n;
		c.n = 0;
		if (n === 1) {
			if (this.play) { this.play = null; } else { this.startPlay(); }
		} else if (n === 2) {
			var b;
			do { b = this.bgBag.next(); } while (b === this.background && this.bgBag.left.length);
			this.background = b;
		} else if (n === 5) {
			this.turbo = !this.turbo;
		}
	};

	/* ------------------------------------------------------------ draw --- */

	RockPaperScissors.prototype.drawBackground = function (ctx) {
		var seq = this.art.sequence(21001 + this.background), a = seq.frames[0];
		for (var y = 0; y < this.H; y += a.h) {
			for (var x = 0; x < this.W; x += a.w) {
				ctx.drawImage(seq.image, a.x, a.y, a.w, a.h, x, y, a.w, a.h);
			}
		}
	};

	/** The scoreboard: the module's own three compound frames, 21900. */
	RockPaperScissors.prototype.drawScore = function (ctx) {
		var W = this.W, H = this.H, sc = this.score, panels = [3, 7, 11];
		ctx.fillStyle = '#000';
		ctx.fillRect(0, H - 40, W, 40);
		var xs = [8, Math.round((W - 157) / 2), W - 157 - 9];
		for (var t = 0; t < 3; t += 1) {
			var ls = sc.layers('21900', panels[t], 0), f = this.fighters ? this.fighters[t] : null;
			var health = f ? f.health : 16, wins = this.wins[t];
			var x0 = ls[0].x, y0 = ls[0].y, ox = xs[t] - x0, oy = H - 32 - y0;
			for (var i = 0; i < ls.length; i += 1) {
				var l = ls[i], ch = l.ch & 255;
				if (ch === 1 && this.flash && this.flash.type === t && this.clock < this.flash.until &&
					Math.floor((this.flash.until - this.clock) / 0.25) % 2 === 0) { continue; }
				if (ch >= 3 && ch <= 18 && 19 - ch > health) { continue; }
				if (ch >= 20 && ch <= 23 && ch - 19 <= 4 - this.stars) { continue; }
				if (ch >= 24 && ch <= 27 && ch - 23 > wins) { continue; }
				sc.draw(ctx, l, ox, oy);
			}
		}
	};

	RockPaperScissors.prototype.step = function (dt, ctx, w, h) {
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		if (!this.score) { return; }
		if (!this.fighters) { this.newRound(); }
		var dpr = ctx.canvas.width / Math.max(1, w);
		this.acc += dt;
		var n = 0, step = this.turbo ? FRAME / 3 : FRAME;
		while (this.acc >= step && n < 8) {
			this.acc -= step;
			this.capsBurst();
			this.tick();
			n += 1;
		}
		if (n >= 8) { this.acc = 0; }
		ctx.setTransform(dpr * this.k, 0, 0, dpr * this.k, 0, 0);
		ctx.imageSmoothingEnabled = this.k < 1;
		if (this.blackout) {
			if (this.showScore) { this.drawScore(ctx); }
			return;
		}
		this.drawBackground(ctx);
		if (this.play) {
			this.drawPlay(ctx);
			return;
		}
		var sc = this.score, fs = this.fighters.filter(function (f) { return !f.hidden && f.cur.length; });
		fs.sort(function (a, b) {
			if (a.dead !== b.dead) { return a.dead ? -1 : 1; }
			var pa = a.own(a.cur, a.chan) || a.cur[0], pb = b.own(b.cur, b.chan) || b.cur[0];
			return (pa.y + pa.h) - (pb.y + pb.h);
		});
		for (var i = 0; i < fs.length; i += 1) {
			for (var j = 0; j < fs[i].cur.length; j += 1) { sc.draw(ctx, fs[i].cur[j], 0, 0); }
		}
		if (this.showScore) { this.drawScore(ctx); }
	};

	AfterDark.define('after-dark-rock-paper-scissors', function (el) {
		var sim = new RockPaperScissors();
		sim.stars = Number(STARS[AfterDark.choice(el, 'stars-to-win', STARS, '2')]);
		sim.showScore = AfterDark.flag(el, 'display-score');
		window.addEventListener('keydown', function (e) {
			if (e.key === 'CapsLock') {
				sim.capsLock();
				return;
			}
			if (sim.play && sim.play.phase === 'pick') {
				var k = e.key.toLowerCase(), i = 'rps'.indexOf(k);
				if (i >= 0 && k.length === 1) { sim.choose(i); } else { sim.play = null; }
			}
		});
		el.addEventListener('pointerdown', function (e) {
			if (!sim.score) { return; }
			var r = el.getBoundingClientRect();
			if (!sim.play) {
				sim.startPlay();
				return;
			}
			var b = sim.boxAt(e.clientX - r.left, e.clientY - r.top);
			if (b >= 0) { sim.choose(b); }
		});
		var base = AfterDark.setting(el, 'art') || 'art/rps';
		Promise.all([
			AfterDark.load(base),
			fetch(AfterDark.bust(base + '/script.json'), { cache: 'no-cache' }).then(function (r) { return r.json(); })
		]).then(function (both) {
			sim.art = both[0];
			sim.score = new Score(both[1], both[0]);
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	RockPaperScissors.Score = Score;
	window.AfterDarkRockPaperScissors = RockPaperScissors;
}());
