/**
 * fish-world.js - Fish World, on the module's own artwork and choreography.
 *
 * FISH.AD, After Dark 4.0. Its own description (STRINGLIST 16000):
 *
 *   "Fish World:  Have you changed their water lately?"
 *   Species from STRINGLIST 666: Blue Bird Wrasse, Boxfish, Sea Horse,
 *   Filefish, Mandarin, Pajama Cardinal, Picasso, Pufferfish, Tamarin.
 *
 * Settings, out of TYPE_1000 and dialog 100: "Select Fish..." (any of the nine,
 * plus Bubbles; all of them by default) and "Show Background" (on).
 *
 * Nothing here is invented. Every movement is the module's own score: the
 * compound sequences in TYPE_8100/8102 16000 (fish, bubbles, the water surface)
 * and 16500 (seven composed reefs), exported to art/fish/compound.json. The
 * engine half is ADXPL510.DLL's CompoundSprite (as in toasters-40.js) with its
 * draw opcode, which mirrors a sprite and its movement; moving through a cel
 * that is flipped the other way in the next sequence turns the sprite round.
 * The module half is FISH.AD's code read out of its disassembly:
 *
 * - Fish::IFish: the tank holds H/100 + H/100/3 + 2 (+1 when H/100 is not a
 *   multiple of 3) sprites, at most 16 - 12 at 1024x768. Sprite 0 is the
 *   water-surface shimmer when the background shows, sprites up to
 *   (H/100)/3 (+1) are small fish far away, the next one the bubble stream,
 *   the rest the fish proper. Each runs ten ticks a second.
 * - Floor::DrawBackground: one of the seven reefs at random, its bottom
 *   6-26 px (per reef) below the screen, plus the surface (cue 5) in the top
 *   left (mirrored) or top right corner. Floor::DoWaveEffect sways the top
 *   rows of one coral +-2 px, one row after another, every 200 ms.
 * - FishSprite::SetUpEntry: a selected species at random, from the left or
 *   the right just off screen, at a height that does not overlap a fish already
 *   there (SetYLocation), after 0-6 s the first time.
 * - FishSprite::do<Species>: what each species does next when a sequence ends -
 *   swim, glide, hover, turn, the boxfish's and pufferfish's moods, the wrasse
 *   that swims into the distance and back. Near the reef (bottom within 10 px
 *   of its top line) fish pick the moves that rise.
 * - Every 30 minutes a flying toaster (sequence 16026) swims across in place
 *   of a fish.
 *
 * Checked against a capture of the real module at 1024x768: the reef (cue 20,
 * placed to the pixel), the surface top right, the slow entries from the edges,
 * ten ticks a second and the per-tick distances. Not ported: the sounds, the
 * start-up message, Caps Lock (which sends every fish fleeing), redrawing the
 * reef every two hours. The wrasse's trip into the distance moves it behind
 * the other fish as the module does, but the module also renumbers sprites
 * while doing so; that is left out. Random numbers are Math.random.
 *
 *   <after-dark-fish-world art="art/fish" show-background bubbles></after-dark-fish-world>
 */
(function () {
	'use strict';

	var TICK = 100;
	var WAVE_TICK = 200;
	var TOASTER_EVERY = 1800000;

	/* STRINGLIST 666, in the order of the module's species numbers. `normal`
	   and `small` are the entry sequences from SetUpEntry; `flee` is the one
	   Caps Lock would send them off on. */
	var SPECIES = [
		{ name: 'Blue Bird Wrasse', normal: [0x2a1, 0x2c1], small: 0x2fc },
		{ name: 'Boxfish',          normal: [0x49c], small: 0x553 },
		{ name: 'Sea Horse',        normal: [0x134], small: 0x17e },
		{ name: 'Filefish',         normal: [0x5e4], small: 0x660 },
		{ name: 'Mandarin',         normal: [0x3f9], small: 0x47e },
		{ name: 'Pajama Cardinal',  normal: [0x57b], small: 0x5c7 },
		{ name: 'Picasso',          normal: [0x1ae], small: 0x238 },
		{ name: 'Pufferfish',       normal: [0x3ac, 0x33c], small: 0x3dd },
		{ name: 'Tamarin',          normal: [0x256], small: 0x27c }
	];
	var BUBBLES = 9, SHIMMER = 10, TOASTER = 11;

	/* Floor::DrawBackground: reef cue, x and y offsets. */
	var REEFS = [[2, 0, -9], [8, 0, -26], [14, 0, -12], [20, 0, -6], [26, 0, -20], [32, 0, -15], [38, -13, -19]];
	/* Floor::SetUpWaveEffect: which coral cel sways, and the part of it. */
	var WAVE_CEL = [2, 3, 4, 6, 7, 8];
	var WAVE_LEFT = [44, 37, 22, 31, 33, 47];
	var WAVE_RIGHT = [27, 20, 22, 26, 16, 25];
	var WAVE_ROWS = [55, 52, 51, 37, 49, 55];

	function rnd(n) { return n > 0 ? Math.floor(Math.random() * n) : 0; }
	function half(n) { return n < 0 ? -((-n) >> 1) : n >> 1; }   // sar with jns/adc

	/* Fish::IFish */
	function schoolSize(w, h) {
		var hh = Math.max(250, h), c = hh / 100 | 0;
		var n = c % 3 ? (c / 3 | 0) + c + 3 : c + (c / 3 | 0) + 2;
		return Math.min(16, n);
	}

	/* ------------------------------------------------------ CompoundSequence */

	function Movie(data, art) {
		this.f = data.frames;
		this.cels = data.cels;
		this.art = art;
	}
	Movie.prototype.valid = function (t) { return t > 0 && t < this.f.length && !!this.f[t]; };
	Movie.prototype.labelRange = function (t) { var s = t; while (this.valid(s)) { s += 1; } return s - t; };
	Movie.prototype.size = function (t) { var f = this.f[t]; return [f[2] - f[0], f[3] - f[1]]; };
	Movie.prototype.cel = function (id) {
		var c = this.cels[id], seq = this.art.sequence(String(c[0]));
		return { seq: seq, fr: seq.frames[c[1]] };
	};
	/* GetFrameData with a draw opcode: cels mirrored inside the frame's rect. */
	Movie.prototype.data = function (t, op) {
		var f = this.f[t], out = [], i, it, c, x, y;
		for (i = 4; i < f.length; i += 1) {
			it = f[i];
			c = this.cel(it[0]).fr;
			x = op & 1 ? f[0] + f[2] - (it[3] + c.w) : it[3];
			y = op & 2 ? f[1] + f[3] - (it[4] + c.h) : it[4];
			out.push([it[0], it[1], it[2] ^ (op & 3), x, y, c.w, c.h]);
		}
		return out;
	};
	/* DrawFrame: the frame's rect top-left at (x, y). */
	Movie.prototype.draw = function (ctx, t, op, x, y) {
		var f = this.f[t], cels = this.data(t, op), i, it, c, px, py;
		for (i = 0; i < cels.length; i += 1) {
			it = cels[i];
			c = this.cel(it[0]);
			px = it[3] - f[0] + x;
			py = it[4] - f[1] + y;
			if (!(it[2] & 3)) {
				ctx.drawImage(c.seq.image, c.fr.x, c.fr.y, c.fr.w, c.fr.h, px, py, c.fr.w, c.fr.h);
			} else {
				ctx.save();
				ctx.translate(px + (it[2] & 1 ? c.fr.w : 0), py + (it[2] & 2 ? c.fr.h : 0));
				ctx.scale(it[2] & 1 ? -1 : 1, it[2] & 2 ? -1 : 1);
				ctx.drawImage(c.seq.image, c.fr.x, c.fr.y, c.fr.w, c.fr.h, 0, 0, c.fr.w, c.fr.h);
				ctx.restore();
			}
		}
	};

	/* ------------------------------------------------------ CompoundSprite */

	function Sprite(movie) {
		this.s = movie;
		this.frame = 0; this.seq = 0; this.cx = 0; this.cy = 0; this.op = 0;
		this.loops = 0; this.queued = -1; this.just = 0; this.q = [];
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
	SP.count = function (s) { return s === 0 ? 1 : this.s.labelRange(s); };
	SP.within = function () {
		if (this.seq > 0 && this.frame >= this.seq && this.frame <= this.last(this.seq)) {
			return this.frame - this.seq;
		}
		return -1;
	};
	/* MoveThroughRelativeFrame: GetCenterDistance, negated when mirrored. */
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
	/* MoveThroughCommonArtFrame: the first cel the two frames share stays put;
	   if it is flipped the other way in the new frame, the sprite turns. */
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
				var d1 = this.s.data(from, this.op)[i];
				this.cx += d1[3] - (((a[2] - a[0]) >> 1) + a[0]);
				this.cy += d1[4] - (((a[3] - a[1]) >> 1) + a[1]);
				this.op ^= (a[i + 4][2] ^ b[j + 4][2]) & 3;
				var d2 = this.s.data(to, this.op)[j];
				this.cx += (((b[2] - b[0]) >> 1) + b[0]) - d2[3];
				this.cy += (((b[3] - b[1]) >> 1) + b[1]) - d2[4];
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
		this.q = [];
	};
	SP.setCenter = function (x, y) { this.cx = x; this.cy = y; this.upd(); };
	SP.play = function () {
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
			this.loops -= 1;
			this.queued = this.seq;
		} else if (this.q.length) {
			this.queued = this.q.shift();
		}
	};
	SP.draw = function (ctx) {
		if (!this.s.valid(this.frame)) { return; }
		this.s.draw(ctx, this.frame, this.op, this.rect[0], this.rect[1]);
	};

	/* ------------------------------------------------------ FishWorld */

	function FishWorld(art, compound) {
		this.art = art;
		this.fishMovie = compound ? new Movie(compound.fish, art) : null;
		this.floorMovie = compound ? new Movie(compound.floor, art) : null;
		this.showBackground = true;
		this.bubbles = true;
		this.chosen = null;          // species names, lower case, or null for all
		this.fish = [];
		this.now = 0;
	}

	FishWorld.prototype.selected = function (i) {
		if (i === BUBBLES) { return this.bubbles; }
		if (!this.chosen) { return true; }
		return this.chosen.indexOf(SPECIES[i].name.toLowerCase()) >= 0;
	};

	FishWorld.prototype.reset = function (w, h) {
		this.w = Math.max(250, w);
		this.h = Math.max(250, h);
		this.now = 0;
		/* FishSprite::LoadStatics */
		this.toasterTime = this.now + TOASTER_EVERY;
		this.toasterOn = false;
		this.blueInBack = false;
		var c = this.h / 100 | 0, i;
		this.smallMax = c % 3 ? (c / 3 | 0) + 1 : c / 3 | 0;
		this.valid = [];
		for (i = 0; i < 9; i += 1) {
			if (this.selected(i)) { this.valid.push(i); }
		}
		this.bubbleIndex = -1;
		if (this.selected(BUBBLES)) { this.bubbleIndex = this.smallMax + 1; } else { this.smallMax += 1; }
		/* Floor::IFloor */
		this.floorTop = this.h;
		this.surface = [0, 0, 0, 0];
		this.side = 0;
		this.shimmerIndex = -1;
		this.drawn = false;
		this.bg = null;
		this.wave = null;
		if (this.showBackground && this.floorMovie) {
			var right = rnd(2);
			this.side = right + 1;
			var sz = this.fishMovie.size(5);
			this.surface = right ? [this.w - sz[0], 0, this.w, sz[1]] : [0, 0, sz[0], sz[1]];
			this.shimmerIndex = 0;
			var top = Infinity, bottom = -Infinity, f, t;
			for (t = 1; t < this.floorMovie.f.length; t += 1) {
				f = this.floorMovie.f[t];
				if (f) { top = Math.min(top, f[1]); bottom = Math.max(bottom, f[3]); }
			}
			this.floorTop = this.h - (bottom - top);
		}
		/* the sprites, in the order the module makes them */
		this.fish = [];
		this.order = [];
		var n = schoolSize(this.w, this.h);
		for (i = 0; i < n && this.fishMovie; i += 1) {
			var s = new Sprite(this.fishMovie);
			s.index = i;
			s.next = this.now;
			s.fresh = true;
			s.cls = 0;
			s.timer = 0;
			s.factor = 0;
			this.fish.push(s);
			this.setVariables(s);
			this.order.push(s);
		}
	};

	FishWorld.prototype.small = function (s) { return s.index <= this.smallMax; };

	/* FishSprite::SetVariables */
	FishWorld.prototype.setVariables = function (s) {
		s.fresh = true;
		if (this.side && s.index === this.shimmerIndex) {
			this.setUpShimmer(s);
		} else if (s.index === this.bubbleIndex) {
			this.setUpBubbles(s);
		} else {
			this.setUpEntry(s);
		}
	};

	FishWorld.prototype.setUpShimmer = function (s) {
		s.species = SHIMMER;
		s.cls = 2;
		s.label = [0x0e, 0x32, 0x56][rnd(3)];
		var sz = this.fishMovie.size(s.label);
		var x;
		if (this.side === 1) { s.op = 1; x = half(sz[0]); } else { s.op = 0; x = this.w - half(sz[0]); }
		s.nextSequence(s.label);
		s.setCenter(x, half(sz[1]));
		s.decide = s.count(s.label) - 2;
	};

	FishWorld.prototype.setUpBubbles = function (s) {
		s.species = BUBBLES;
		s.cls = 3;
		s.label = 0x7a;
		var sz = this.fishMovie.size(s.label);
		var sw = this.surface[2] - this.surface[0];
		var x = rnd(this.w - sz[0] - sw) + half(sz[0]);
		if (this.side === 1) { x += sw; }
		s.op = 0;
		s.setCenter(x, this.floorTop - half(sz[1]));
		s.nextSequence(s.label);
		s.decide = s.count(s.label) - 2;
	};

	/* FishSprite::SetUpEntry */
	FishWorld.prototype.setUpEntry = function (s) {
		if (s.inBack) { s.inBack = false; this.blueInBack = false; this.restoreOrder(s); }
		if (s.species === TOASTER) { this.toasterOn = false; }
		s.species = this.valid.length ? this.valid[rnd(this.valid.length)] : 1;
		var isSmall = this.small(s);
		if (this.now >= this.toasterTime && !isSmall) {
			if (!this.toasterOn) { s.species = TOASTER; this.toasterOn = true; }
			this.toasterTime = this.now + TOASTER_EVERY;
		}
		if (s.species === TOASTER) {
			s.label = 0x67f;
		} else {
			var sp = SPECIES[s.species];
			s.label = isSmall ? sp.small : sp.normal[rnd(sp.normal.length)];
		}
		s.cls = isSmall ? 1 : 0;
		var sz = this.fishMovie.size(s.label);
		var x;
		if (rnd(2)) { s.op = 1; x = half(sz[0]) + this.w + 10; } else { s.op = 0; x = -half(sz[0]) - 10; }
		if (!this.valid.length) { x = s.op ? -1500 : 1500; }
		s.nextSequence(s.label);
		this.setYLocation(s, x, sz);
		if (s.fresh || isSmall) {
			s.next = this.now + rnd(7) * 1000;
			s.fresh = false;
		} else {
			s.next = this.now;
		}
		s.timer = s.next + rnd(10) * 1000;
		s.decide = s.count(s.label) - 2;
	};

	/* FishSprite::SetYLocation: up to 50 tries for a height clear of the fish
	   already in the tank (small fish only mind rows, fish mind rows and
	   columns), between the surface and the reef. */
	FishWorld.prototype.setYLocation = function (s, x, sz) {
		var surf = this.surface[3] - this.surface[1], tries = 0, ok = false, y, i, o, r, m;
		function rows(a, b) {
			return (a[1] > b[1] && a[1] < b[3]) || (a[3] > b[1] && a[3] < b[3]) ||
				(a[1] < b[1] && a[3] > b[1]) || (a[1] < b[3] && a[3] > b[3]) ||
				(a[1] === b[1] && a[3] === b[3]);
		}
		function cols(a, b) {
			return (a[0] > b[0] && a[0] < b[2]) || (a[2] > b[0] && a[2] < b[2]) ||
				(a[0] < b[0] && a[2] > b[0]) || (a[0] < b[2] && a[2] > b[2]) ||
				(a[0] === b[0] && a[2] === b[2]);
		}
		while (!ok) {
			if (this.floorTop - sz[1] - surf > 0) {
				y = rnd(this.floorTop - sz[1] - surf) + half(sz[1]) + surf;
			} else {
				y = rnd(this.floorTop - sz[1]) + half(sz[1]);
			}
			ok = true;
			tries += 1;
			s.setCenter(x, y);
			m = s.rect;
			for (i = 0; i < this.order.length; i += 1) {
				o = this.order[i];
				if (o === s || o.cls === 3) { continue; }
				if (o.cls === 0 && s.cls === 1) { continue; }
				if (o.cls === 1 && s.cls === 0) { continue; }
				r = o.rect;
				if (s.cls === 1) {
					if (rows(r, m)) { ok = false; }
				} else if (cols(r, m) && rows(r, m)) {
					ok = false;
				}
			}
			if (tries >= 50) { ok = true; }
		}
	};

	FishWorld.prototype.offScreen = function (s) {
		var r = s.rect;
		return (r[2] < -10 && s.op === 1) || (r[0] > this.w + 10 && s.op === 0) ||
			r[3] < -10 || r[1] > this.h + 10;
	};

	FishWorld.prototype.low = function (s) {
		return s.rect[3] + 10 > this.floorTop && this.drawn;
	};

	FishWorld.prototype.overlap = function (s) {
		for (var i = 0; i < this.order.length; i += 1) {
			var o = this.order[i], a = o.rect, b = s.rect;
			if (o === s || o.cls !== 0) { continue; }
			if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) { return true; }
		}
		return false;
	};

	/* ReorderThisSprite: behind every fish but the small ones and the bubbles. */
	FishWorld.prototype.sendBack = function (s) {
		var i = this.order.indexOf(s), at = 0, j;
		this.order.splice(i, 1);
		for (j = 0; j < this.order.length; j += 1) {
			if (this.order[j].cls !== 0) { at = j + 1; }
		}
		this.order.splice(at, 0, s);
	};
	FishWorld.prototype.restoreOrder = function (s) {
		this.order.splice(this.order.indexOf(s), 1);
		var j = 0;
		while (j < this.order.length && this.order[j].index < s.index) { j += 1; }
		this.order.splice(j, 0, s);
	};

	/* FishSprite::do<Species>: the next sequence when one ends. */
	FishWorld.prototype.wrasse = function (s) {
		s.timer = this.now;
		switch (s.label) {
		case 0x2a1:
			if (rnd(2) || this.low(s)) { s.label = 0x2b0; } else { s.factor = 4; }
			break;
		case 0x2b0: s.label = 0x2c1; s.factor = 4; break;
		case 0x2c1:
			if (!this.blueInBack && !this.overlap(s)) {
				this.blueInBack = true; s.inBack = true; s.label = 0x2e0; s.factor = 0;
				this.sendBack(s);
			} else if (rnd(2)) {
				s.factor = 4;
			} else {
				s.label = 0x2d0;
			}
			break;
		case 0x2d0: s.label = 0x2a1; s.factor = 4; break;
		case 0x2e0: s.label = 0x2fc; s.factor = 0; break;
		case 0x2fc: s.label = 0x308; s.factor = 0; break;
		case 0x308:
			this.blueInBack = false; s.inBack = false; s.label = 0x2a1; s.factor = 4;
			this.restoreOrder(s);
			break;
		}
	};

	FishWorld.prototype.boxfish = function (s) {
		var l = s.label, r;
		if (this.now >= s.timer || (this.low(s) && l === 0x4f9)) {
			s.timer = this.now;
			if (l === 0x49c || l === 0x4a8 || l === 0x4b4 || l === 0x4c1 || l === 0x53a) {
				r = rnd(5);
				if (r < 3) { s.label = [0x49c, 0x4a8, 0x4b4][r]; s.factor = 2; } else { s.label = r === 3 ? 0x4c1 : 0x4dd; }
			} else if (l === 0x4dd || l === 0x52b) {
				s.label = 0x4f9; s.factor = 4;
			} else if (l === 0x4f9) {
				r = this.low(s) ? 2 : rnd(3);
				if (r === 0) { s.factor = 4; } else { s.label = r === 1 ? 0x53a : 0x506; }
			} else if (l === 0x506) {
				s.label = 0x51e; s.factor = 4;
			} else if (l === 0x51e) {
				if (rnd(2)) { s.label = 0x52b; } else { s.factor = 4; }
			}
		} else if (l === 0x49c || l === 0x4a8 || l === 0x4b4 || l === 0x4c1) {
			s.label = [0x49c, 0x4a8, 0x4b4][rnd(3)];
		}
	};

	FishWorld.prototype.seaHorse = function (s) {
		var r = this.low(s) ? rnd(3) : rnd(4);
		s.label = [0x134, 0x167, 0x11d, 0x14e][r];
		s.factor = [5, 2, 1, 2][r];
	};

	FishWorld.prototype.filefish = function (s) {
		var l = s.label;
		s.timer = this.now;
		if (l === 0x5f2) { s.label = 0x62e; s.factor = 3; return; }
		if (l === 0x609) { s.label = 0x620; s.factor = 3; return; }
		if (l === 0x63c) { s.label = 0x5e4; s.factor = 4; return; }
		if (rnd(2) || (this.low(s) && l === 0x620)) {
			if (l === 0x62e || l === 0x620) { s.label = 0x63c; } else { s.factor = 4; }
			return;
		}
		if (l === 0x5e4) { s.label = rnd(2) ? 0x5f2 : 0x609; return; }
		s.factor = 3;
	};

	FishWorld.prototype.mandarin = function (s) {
		var l = s.label;
		if (this.now >= s.timer) {
			if (l === 0x42a || l === 0x457) { s.label = 0x43c; s.factor = 3; return; }
			if (l === 0x44a) { s.label = 0x3f9; s.factor = 7; return; }
			if (rnd(2)) {
				if (l === 0x43c) { s.label = 0x44a; } else { s.factor = 7; }
				return;
			}
			if (l === 0x3f9 || l === 0x406 || l === 0x412 || l === 0x41e) {
				s.label = rnd(2) ? 0x42a : 0x457;
				return;
			}
			s.factor = 3;
			return;
		}
		if (l === 0x406 || l === 0x412 || l === 0x41e || l === 0x3f9) {
			s.label = [0x406, 0x412, 0x41e, 0x3f9][rnd(4)];
		}
	};

	FishWorld.prototype.pajama = function (s) {
		var l = s.label, r;
		if (l === 0x587) {
			if (rnd(2)) { s.label = 0x596; s.factor = 3; } else { s.label = 0x5a6; s.factor = 2; }
			return;
		}
		if (l === 0x5b5) {
			if (rnd(2)) { s.label = 0x56f; s.factor = 3; } else { s.label = 0x57b; s.factor = 2; }
			return;
		}
		r = rnd(3);
		if (r === 0) {
			if (l === 0x56f) { s.label = 0x57b; } else if (l === 0x596) { s.label = 0x5a6; }
			s.factor = 2;
		} else if (r === 1) {
			if (l === 0x57b) { s.label = 0x56f; } else if (l === 0x5a6) { s.label = 0x596; }
			s.factor = 3;
		} else {
			s.label = l === 0x57b || l === 0x56f ? 0x587 : 0x5b5;
		}
	};

	FishWorld.prototype.picasso = function (s) {
		var l = s.label, r;
		if (this.now >= s.timer) {
			if (l === 0x1ae || l === 0x1bc || l === 0x1ca || l === 0x1d6 || l === 0x21f) {
				r = rnd(5);
				s.label = [0x1ae, 0x1bc, 0x1ca, 0x1d6, 0x1ef][r];
				if (r < 3) { s.factor = 6; }
			} else if (l === 0x1ef) {
				s.label = rnd(2) ? 0x207 : 0x212;
				s.factor = 4;
			} else if (l === 0x207 || l === 0x212) {
				r = rnd(3);
				if (r === 0) { s.label = 0x21f; } else { s.label = r === 1 ? 0x207 : 0x212; s.factor = 4; }
			}
			return;
		}
		if (l === 0x1ae || l === 0x1bc || l === 0x1ca) {
			s.label = rnd(4) ? 0x1ae : (rnd(2) ? 0x1bc : 0x1ca);
		} else if (l === 0x207 || l === 0x212) {
			s.label = rnd(2) ? 0x207 : 0x212;
		}
	};

	FishWorld.prototype.puffer = function (s) {
		var l = s.label, r;
		s.timer = this.now;
		s.factor = 10;
		if (l === 0x33c || l === 0x34c || l === 0x35c || l === 0x36a || l === 0x3b8 || l === 0x3d1) {
			r = rnd(5);
			if (this.low(s) && (l === 0x33c || l === 0x34c || l === 0x35c)) { r = 4; }
			s.label = [0x33c, 0x34c, 0x35c, 0x36a, 0x379][r];
			if (r === 4) { s.factor = 0; }
		} else if (l === 0x379 || l === 0x388 || l === 0x394 || l === 0x3a0 || l === 0x3ac) {
			r = rnd(6);
			s.label = [0x3ac, 0x3a0, 0x388, 0x394, 0x3d1, 0x3b8][r];
			if (r >= 4) { s.factor = 0; }
		}
	};

	FishWorld.prototype.tamarin = function (s) {
		if (rnd(2)) { s.label = 0x256; s.factor = 9; } else { s.label = 0x263; s.factor = 1; }
	};

	/* FishSprite::DoDrawFish, ten times a second per sprite. */
	FishWorld.prototype.tick = function (s) {
		s.play();
		if (s.within() === s.decide) {
			var big = !this.small(s), due = this.now >= s.timer, low = this.low(s);
			s.factor = 0;
			switch (s.species) {
			case 0: if ((due || (low && s.label === 0x2a1)) && big) { this.wrasse(s); } break;
			case 1: if (big) { this.boxfish(s); } break;
			case 2: if ((due || (low && s.label === 0x14e)) && big) { this.seaHorse(s); } break;
			case 3: if ((due || (low && s.label === 0x620)) && big) { this.filefish(s); } break;
			case 4: if (big) { this.mandarin(s); } break;
			case 5: if (due && big) { this.pajama(s); } break;
			case 6: if (big) { this.picasso(s); } break;
			case 7:
				if (due || (low && big && (s.label === 0x33c || s.label === 0x34c || s.label === 0x35c))) {
					this.puffer(s);
				}
				break;
			case 8: if (due && big) { this.tamarin(s); } break;
			case BUBBLES: s.label = [0x8d, 0xbe, 0xf2][rnd(3)]; break;
			case SHIMMER: s.label = [0x0e, 0x32, 0x56][rnd(3)]; break;
			}
			s.q = [s.label];
			if (this.now >= s.timer) { s.timer = this.now + s.factor * 1300; }
			s.decide = s.count(s.label) - 2;
		}
		s.next = this.now + TICK;
		if (this.offScreen(s)) {
			if (s.species === BUBBLES) { this.setUpBubbles(s); } else { this.setUpEntry(s); }
		}
	};

	/* ------------------------------------------------------ Floor */

	FishWorld.prototype.drawBackground = function () {
		var w = this.w, h = this.h;
		var bg = document.createElement('canvas');
		bg.width = w;
		bg.height = h;
		var g = bg.getContext('2d');
		this.bg = bg;
		if (!g) { return; }
		this.g = g;
		g.fillStyle = '#000';
		g.fillRect(0, 0, w, h);
		var reef = REEFS[rnd(7)], f = this.floorMovie.f[reef[0]];
		var top = h - (f[3] - f[1] + reef[2]);
		this.reef = { cue: reef[0], x: reef[1], y: top };
		this.floorMovie.draw(g, reef[0], 0, reef[1], top);
		this.floorTop = top;
		this.fishMovie.draw(g, 5, this.side === 1 ? 1 : 0, this.surface[0], this.surface[1]);
		this.drawn = true;
		this.setUpWave();
	};

	FishWorld.prototype.setUpWave = function () {
		var g = this.g, wv = this.wave, i, f, cels, c, k;
		if (wv && wv.l < this.w && this.pristine) {
			/* put the coral back as it was */
			g.drawImage(this.pristine, wv.l - 3, wv.t, wv.r - wv.l + 6, wv.b - wv.t,
				wv.l - 3, wv.t, wv.r - wv.l + 6, wv.b - wv.t);
		}
		if (!this.pristine) {
			this.pristine = document.createElement('canvas');
			this.pristine.width = this.w;
			this.pristine.height = this.h;
			var pg = this.pristine.getContext('2d');
			if (pg) { pg.drawImage(this.bg, 0, 0); }
		}
		i = rnd(6);
		f = this.floorMovie.f[this.reef.cue];
		cels = this.floorMovie.data(this.reef.cue, 0);
		wv = { l: this.w + 10, t: 0, r: this.w + 20, b: 10 };
		for (k = 0; k < cels.length; k += 1) {
			c = cels[k];
			if (c[0] === WAVE_CEL[i]) {
				var x = c[3] - f[0] + this.reef.x, y = c[4] - f[1] + this.reef.y;
				wv = { l: x + WAVE_LEFT[i], t: y, r: x + c[5] - WAVE_RIGHT[i], b: y + WAVE_ROWS[i] };
				break;
			}
		}
		wv.n = WAVE_ROWS[i];
		wv.active = 1;
		wv.rows = [];
		for (k = 0; k < wv.n; k += 1) { wv.rows.push({ x0: wv.l, x: wv.l, dir: 1, count: 3 }); }
		this.wave = wv;
		this.waveNext = this.now;
	};

	FishWorld.prototype.doWave = function () {
		var wv = this.wave, g = this.g, moved = 0, i, row, w;
		if (wv.l < this.w) {
			w = wv.r - wv.l;
			for (i = 0; i < wv.active; i += 1) {
				row = wv.rows[i];
				if (row.dir === 1 && row.x === row.x0 + 2) { row.dir = 0; }
				if (row.dir === 0 && row.x === row.x0 - 2) { row.dir = 1; }
				if (row.count % 3 === 0 && row.count !== 0) {
					if (row.dir === 1) {
						row.x += 1;
						g.drawImage(this.bg, row.x - 1, wv.t + i, w, 1, row.x, wv.t + i, w, 1);
						if (row.x === row.x0) { row.count = 0; }
					} else {
						row.x -= 1;
						g.drawImage(this.bg, row.x + 1, wv.t + i, w, 1, row.x, wv.t + i, w, 1);
					}
					moved += 1;
				}
				if (row.count !== 0) { row.count += 1; }
			}
			if (wv.active < wv.n) { wv.active += 1; }
			if (!moved) { this.setUpWave(); }
		} else {
			this.setUpWave();
		}
		this.waveNext = this.now + WAVE_TICK;
	};

	/* ------------------------------------------------------ frame */

	FishWorld.prototype.step = function (dt) {
		this.now += dt * 1000;
		if (this.showBackground && this.floorMovie && !this.drawn) { this.drawBackground(); }
		if (this.drawn && this.g && this.now >= this.waveNext) { this.doWave(); }
		for (var i = 0; i < this.fish.length; i += 1) {
			var guard = 0;
			while (this.now >= this.fish[i].next && guard < 4) {
				this.tick(this.fish[i]);
				guard += 1;
			}
		}
	};

	FishWorld.prototype.draw = function (ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (this.bg && this.g) { ctx.drawImage(this.bg, 0, 0); }
		for (var i = 0; i < this.order.length; i += 1) {
			var s = this.order[i];
			if (s.s.valid(s.frame)) { s.draw(ctx); }
		}
	};

	/* ------------------------------------------------------ element */

	function FishWorldElement() {
		return Reflect.construct(HTMLElement, [], FishWorldElement);
	}
	FishWorldElement.prototype = Object.create(HTMLElement.prototype);
	FishWorldElement.prototype.constructor = FishWorldElement;
	Object.setPrototypeOf(FishWorldElement, HTMLElement);

	FishWorldElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		var self = this;
		var base = (this.getAttribute('art') || 'art/fish').replace(/\/$/, '');
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
			var sim = new FishWorld(got[0], got[1]);
			if (AD.setting(self, 'show-background') !== null) {
				sim.showBackground = AD.flag(self, 'show-background');
			}
			if (AD.setting(self, 'bubbles') !== null) {
				sim.bubbles = AD.flag(self, 'bubbles');
			}
			var only = AD.setting(self, 'select-fish');
			if (only && only.toLowerCase() !== 'all') {
				sim.chosen = only.toLowerCase().split(',').map(function (s) {
					return s.trim();
				});
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

	FishWorldElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-fish-world', FishWorldElement);
	window.AfterDarkFishWorld = FishWorld;
	FishWorld.SPECIES = SPECIES;
	FishWorld.schoolSize = schoolSize;
	FishWorld.Sprite = Sprite;
	FishWorld.Movie = Movie;
}());
