/**
 * baddog-40.js - Bad Dog!, the After Dark 4.0 one (BADDOG.AD, 1996).
 *
 * Its own description:
 *
 *   "Sit . . . sit . . . siiiit . . . sit . . . please sit . . . SIT . . .
 *    sit . . . sit . . . pleeeease sit . . . pretty please sit . . . Bad Dog
 *    SIT! Sit. . . c'mon sit. . .  OK, stand . . . good dog.
 *    Check "Clear Screen First" for a black background.
 *    Background will become black after two hours for better screen saving."
 *
 * Its one control is Clear Screen First. Recorded with it on, the module
 * paints the same icons and folders on black, without the taskbar - so
 * here the gags that need the taskbar are left out then.
 *
 * What is the module's, in all/art/baddog/:
 *   - every picture. 23000-23019 are the dog (a cartoon one, and a 3D one who
 *     lives in the "3D Application" window), the vase, the dirt, the papers,
 *     the squeaky toy, and 23009 is a whole desktop in parts: taskbar, Start
 *     button, folder, computer and recycle bin icons, the two windows, the
 *     zoom rectangles, the Start menu - each once for Windows and once for
 *     the Mac (the Mac ones are skipped here, see MAC).
 *   - the choreography (cues.json, from tools/adchoreo.py). Every tick of
 *     every gag is a cue in TYPE_8102 that points at a composed picture in
 *     TYPE_8100: which frames, where, in what order, which way round. So the
 *     dog's every move inside a gag - and the folder he shakes, the window he
 *     opens - is placed exactly as the module places it.
 *   - the gags' names and first cues, from the module's exported symbols
 *     (Dog::Setup_PeeOnFolder and so on), and which follow which, from the
 *     cue ids each Dog::Execute_ pushes.
 *   - the fifty folder names (STRINGLIST 23010).
 *   - the desktop's layout, measured off the module running under Wine:
 *     taskbar along the top, the computer at (45, 54) and the recycle bin at
 *     (46, 114) with their names under them, folders scattered about, teal.
 *
 * What is filled in, because it lives in code that is not decoded:
 *   - which gag comes next. Here it is a random pick among the gags whose
 *     props are on the desktop, with the sequels the Execute_ functions name
 *     (open a window, later run into it, later close it; jump into a folder,
 *     later come out).
 *   - how the dog gets between gags: he runs in from the edge along the row
 *     the gag needs, at the speed of his own run cycle (cues 91-98, about
 *     96 pixels a second at ten cues a second, which matches the capture),
 *     and runs off the way he is facing when it ends.
 *   - the computer's label. The module shows the real machine's name; this
 *     says "My Computer".
 *   - the recycle bin comes back after he has run off with it.
 *
 * For checking a gag against the original, ?gag=OpenWindow,3DGag plays
 * those first (when their props are there).
 *
 *   <after-dark-bad-dog-40 art="art/baddog"></after-dark-bad-dog-40>
 */
(function () {
	'use strict';

	var TICK = 0.1;                 // one cue per tick
	var BAR = 31;                   // the taskbar's height
	var TEAL = '#008080';
	var UI = '11px "MS Sans Serif", "Microsoft Sans Serif", Tahoma, Arial, sans-serif';
	var TWO_HOURS = 2 * 60 * 60;

	/* Every desktop part ships twice, Windows and Mac, at the same spot. */
	var MAC = {};
	function mac(seq, from, to) { for (var i = from; i <= to; i += 1) { MAC[seq + '#' + i] = true; } }
	mac(23009, 6, 17);
	mac(23017, 65, 69);
	mac(23018, 0, 8);
	mac(23018, 23, 36);
	mac(23019, 0, 15);
	mac(23019, 35, 38);             // 38 is a 1x1 link point, not a picture

	/* The frame in a gag's first picture that stands for the thing it is done to. */
	var LINK = {
		folder: '23009#32', hd: '23009#33', trash: '23009#34', window: '23009#39',
		clip: '23009#40', hole: '23016#0', mound: '23012#35', toy: '23009#5'
	};
	var KIND_OF = {};
	Object.keys(LINK).forEach(function (k) { KIND_OF[LINK[k]] = k; });

	/* What a gag leaves behind: holes, papers, a torn taskbar, an open window. */
	var KEEP = {};
	['23015#27', '23016#0', '23012#34', '23012#35', '23009#5', '23016#39', '23016#42',
	 '23012#51', '23012#52', '23012#53', '23019#30', '23017#5', '23017#6', '23017#8',
	 '23018#13', '23009#39', '23008#2', '23000#14', '23008#1', '23009#40',
	 '23012#13'].forEach(function (k) { KEEP[k] = true; });

	/* Desktop parts, props and the toy: never the dog. */
	var PROP = {};
	function prop(seq, from, to) { for (var i = from; i <= to; i += 1) { PROP[seq + '#' + i] = true; } }
	prop(23009, 0, 5);
	prop(23009, 18, 48);
	prop(23018, 9, 22);

	/* The run cycle, the run with the toy in his mouth, and the turn round. */
	var RUN = [91, 98], RUN_TOY = [118, 125], TURN = [13, 22];
	var BAR_Y = 117;                // where the taskbar is in the bar gags' pictures

	/*
	 * The gags. `at` is what the dog goes to: a desktop thing, `free` for
	 * anywhere there is room, `bar` for along the taskbar, `screen` for the
	 * pictures that are already in screen coordinates, `left` for the left
	 * edge. `then` is the gag the module queues straight after.
	 */
	var GAGS = {
		BadDog: { at: 'free', weight: 2 },
		Cute04: { at: 'free' },
		Cute05: { at: 'free' },
		LeaveSqueakyToy: { at: 'free', need: function (w) { return w.dog.toy; }, toy: false },
		PickToy: { at: 'toy', toy: true },
		PeeOnFolder: { at: 'folder' },
		PeeOnHD: { at: 'hd' },
		PeeOnTrash: { at: 'trash' },
		ShakeFolder: { at: 'folder' },
		ShakeOutPaper: { at: 'folder' },
		FolderTrip: { at: 'folder' },
		FolderTripLowerLevel: { at: 'folder' },
		FolderIn: { at: 'folder', inside: true },
		FightFolder: { at: 'folder', inside: true },
		FolderOut: { at: 'folder', from: 'inside' },
		FightFolderNBreak: { at: 'folder' },
		OpenWindow: { at: 'folder', keep: true, need: function (w) { return !w.find('window'); },
		              then: [1984, 2010], exit: -1 },
		'3DGag': { at: 'window', weight: 3, need: function (w) { var o = w.find('window'); return o && !o.fallen; } },
		CloseWindow: { at: 'window', need: function (w) { var o = w.find('window'); return o && o.fallen; } },
		DigHole: { at: 'free', dig: true },
		ShockDig: { at: 'free', dig: true },
		ToyDig: { at: 'free', dig: true, toy: true },
		PullToyFromHole: { at: 'hole', need: function (w, o) { return o.toy && !w.dog.toy; }, toy: true },
		HideToyInHole: { at: 'hole', need: function (w, o) { return w.dog.toy && !o.toy; }, toy: false },
		PeakNewHole: { at: 'free', dig: true, appear: true, inside: true },
		PeakHole: { at: 'mound', from: 'inside', inside: true },
		JumpsOutOfHole: { at: 'mound', from: 'inside' },
		StuckInHole: { at: 'mound', inside: true },
		Trash: { at: 'trash', then: 'TrashRun', restore: true },
		BarHang: { at: 'bar' },
		BarRip: { at: 'bar', then: 'BarRun' },
		RipDT: { at: 'bar' },
		Menu: { at: 'screen' },
		Clipboard: { at: 'screen', need: function (w) { return !w.find('clip'); } },
		ClipboardBite: { at: 'clip', then: 'PullClipboardOnScreen' },
		CloseClipboard: { at: 'clip' },
		PeaksIn: { at: 'left', appear: true }
	};

	function rand(a, b) { return a + Math.random() * (b - a); }
	function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

	function BadDog() {
		this.art = null;
		this.c = null;
		this.clearScreen = false;
		this.t = 0;
		this.acc = 0;
		this.dirty = true;
		this.objects = [];
		this.dog = { toy: false, inside: null };
		this.ep = null;
		this.rest = 0.6;
	}

	/* ------------------------------------------------------------ pictures */

	BadDog.prototype.frame = function (n) {
		var f = this.c.frames[n];
		if (!f) { return null; }
		var seq = this.art.sequence(f[0]);
		return seq ? { key: f[0] + '#' + f[1], seq: seq, f: seq.frames[f[1]] } : null;
	};

	/** A cue's sprites at stage coordinates, sorted back to front, Mac parts dropped. */
	BadDog.prototype.cue = function (id) {
		var cache = this.cueCache[id];
		if (cache) { return cache; }
		var c = this.c.cues[id];
		if (!c) { return null; }
		var out = [];
		var steps = this.c.steps[c[0]];
		for (var i = 0; i < steps.length; i += 1) {
			var s = steps[i];
			var fr = this.frame(s[0]);
			if (!fr || MAC[fr.key]) { continue; }
			out.push({ key: fr.key, img: fr.seq.image, f: fr.f, z: s[1], flip: !!s[2],
			           x: s[3] + c[1], y: s[4] + c[2], w: fr.f.w, h: fr.f.h });
		}
		out.sort(function (a, b) { return a.z - b.z; });
		this.cueCache[id] = out;
		return out;
	};

	BadDog.prototype.blit = function (g, s, x, y, flip) {
		if (!flip) {
			g.drawImage(s.img, s.f.x, s.f.y, s.f.w, s.f.h, Math.round(x), Math.round(y), s.w, s.h);
			return;
		}
		g.save();
		g.translate(Math.round(x) + s.w, Math.round(y));
		g.scale(-1, 1);
		g.drawImage(s.img, s.f.x, s.f.y, s.f.w, s.f.h, 0, 0, s.w, s.h);
		g.restore();
	};

	/** Draw a cue with its stage origin at (ox, oy); mirrored about ox if asked. */
	BadDog.prototype.drawCue = function (g, id, ox, oy, mirror, skip) {
		var list = this.cue(id) || [];
		for (var i = 0; i < list.length; i += 1) {
			var s = list[i];
			if (skip && skip[s.key]) { continue; }
			if (mirror) {
				this.blit(g, s, ox - s.x - s.w, oy + s.y, !s.flip);
			} else {
				this.blit(g, s, ox + s.x, oy + s.y, s.flip);
			}
		}
	};

	/** The dog in a cue: the backmost sprite that is not a prop or a leftover. */
	BadDog.prototype.dogIn = function (id) {
		var list = this.cue(id) || [];
		for (var i = 0; i < list.length; i += 1) {
			var s = list[i];
			if (!KEEP[s.key] && !PROP[s.key] && !KIND_OF[s.key] && s.w > 1) { return s; }
		}
		return null;
	};

	BadDog.prototype.find = function (kind) {
		for (var i = 0; i < this.objects.length; i += 1) {
			if (this.objects[i].kind === kind) { return this.objects[i]; }
		}
		return null;
	};

	/* ------------------------------------------------------------ the desktop */

	BadDog.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.desk = document.createElement('canvas');
		this.desk.width = Math.max(1, Math.round(w));
		this.desk.height = Math.max(1, Math.round(h));
		this.ep = null;
		this.rest = 0.6;
		this.dog = { toy: false, inside: null };
		if (this.art && this.c) { this.layout(); }
	};

	BadDog.prototype.icon = function (kind, x, y, name) {
		var s = this.sprite(LINK[kind]);
		return { kind: kind, x: x, y: y, w: s.w, h: s.h, name: name, below: kind === 'folder' ? 2 : 4 };
	};

	BadDog.prototype.sprite = function (key) {
		var p = key.split('#');
		var seq = this.art.sequence(p[0]);
		var f = seq.frames[Number(p[1])];
		return { key: key, img: seq.image, f: f, w: f.w, h: f.h };
	};

	BadDog.prototype.layout = function () {
		var w = this.w, h = this.h;
		this.objects = [];
		this.objects.push(this.icon('hd', 45, 54, 'My Computer'));
		this.objects.push(this.icon('trash', 46, 114, 'Recycle Bin'));
		this.home = { x: 46, y: 114 };
		/* About fifteen folders on a 1024x768 screen; fewer on a small one. */
		var n = Math.max(3, Math.min(20, Math.round(15 * w * h / (1024 * 768))));
		var names = this.c.folders.slice();
		var placed = 0, tries = 0;
		while (placed < n && tries < 600 && names.length) {
			tries += 1;
			var x = Math.round(rand(20, w - 60)), y = Math.round(rand(BAR + 12, h - 45));
			var clear = this.objects.every(function (o) {
				return Math.abs(o.x - x) > 70 || Math.abs(o.y - y) > 42;
			});
			if (!clear) { continue; }
			var name = names.splice(Math.floor(Math.random() * names.length), 1)[0];
			this.objects.push(this.icon('folder', x, y, name));
			placed += 1;
		}
		this.dirty = true;
	};

	BadDog.prototype.paintDesk = function () {
		var g = this.desk.getContext('2d');
		var w = this.desk.width, h = this.desk.height;
		g.imageSmoothingEnabled = false;
		g.fillStyle = this.clearScreen || this.t > TWO_HOURS ? '#000' : TEAL;
		g.fillRect(0, 0, w, h);
		/* The taskbar, along the top as the module draws it - unless the
		   screen was cleared first, when it is icons on black and no bar. */
		if (!this.clearScreen) { this.taskbar(g, w); }
		var self = this;
		var busy = this.ep && this.ep.i >= this.ep.start && !this.ep.settled && this.ep.target;
		this.objects.forEach(function (o) {
			if (o === busy || o.gone) { return; }
			if (o.sprites) {
				o.sprites.forEach(function (s) { self.blit(g, s, s.x, s.y, s.flip); });
			} else {
				self.blit(g, self.sprite(LINK[o.kind]), o.x, o.y, false);
			}
		});
		this.objects.forEach(function (o) {
			if (o.name && !o.gone) { self.label(g, o); }
		});
		this.dirty = false;
	};

	BadDog.prototype.taskbar = function (g, w) {
		var left = this.sprite('23009#24'), mid = this.sprite('23009#25'), right = this.sprite('23009#26');
		for (var x = left.w; x < w - right.w; x += mid.w) { this.blit(g, mid, x, 0, false); }
		this.blit(g, left, 0, 0, false);
		this.blit(g, right, w - right.w, 0, false);
	};

	BadDog.prototype.label = function (g, o) {
		g.font = UI;
		g.textBaseline = 'top';
		var tw = Math.ceil(g.measureText(o.name).width) + 6;
		var cx = o.x + o.w / 2;
		var y = o.y + o.h + o.below;
		g.fillStyle = '#fff';
		g.fillRect(Math.round(cx - tw / 2), y, tw, 14);
		g.fillStyle = '#000';
		g.textAlign = 'center';
		g.fillText(o.name, Math.round(cx), y + 1);
		g.textAlign = 'left';
	};

	/* ------------------------------------------------------------ choosing */

	/** The cues a gag plays, with its sequel. */
	BadDog.prototype.cuesOf = function (name) {
		var r = this.c.gags[name];
		return r ? [r[0], r[1]] : null;
	};

	/** Stage-space box of every cue in a range. */
	BadDog.prototype.box = function (a, b) {
		var key = a + '-' + b;
		if (this.boxes[key]) { return this.boxes[key]; }
		var bx = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
		for (var id = a; id <= b; id += 1) {
			(this.cue(id) || []).forEach(function (s) {
				bx.l = Math.min(bx.l, s.x); bx.t = Math.min(bx.t, s.y);
				bx.r = Math.max(bx.r, s.x + s.w); bx.b = Math.max(bx.b, s.y + s.h);
			});
		}
		this.boxes[key] = bx;
		return bx;
	};

	/** Where the first picture of a range has the given frame, or null. */
	BadDog.prototype.linkIn = function (a, b, key) {
		for (var id = a; id <= b; id += 1) {
			var list = this.cue(id) || [];
			for (var i = 0; i < list.length; i += 1) {
				if (list[i].key === key) { return list[i]; }
			}
		}
		return null;
	};

	BadDog.prototype.fits = function (name, ox, oy) {
		var g = GAGS[name], r = this.cuesOf(name);
		var bx = this.box(r[0], r[1]);
		if (g.then && typeof g.then !== 'string') {
			var b2 = this.box(g.then[0], g.then[1]);
			bx = { l: Math.min(bx.l, b2.l), t: Math.min(bx.t, b2.t), r: Math.max(bx.r, b2.r), b: Math.max(bx.b, b2.b) };
		}
		var top = g.at === 'bar' || g.at === 'screen' || this.clearScreen ? 0 : BAR;
		var left = g.at === 'left' ? -200 : 0;
		return bx.l + ox >= left && bx.r + ox <= this.w && bx.t + oy >= top && bx.b + oy <= this.h;
	};

	/** Every way a gag could be done now: [{name, target, ox, oy}]. */
	BadDog.prototype.options = function () {
		var self = this, out = [];
		var dog = this.dog;
		Object.keys(GAGS).forEach(function (name) {
			var g = GAGS[name], r = self.cuesOf(name);
			if (!r) { return; }
			if (dog.inside) {
				if (g.from !== 'inside') { return; }
			} else if (g.from === 'inside') {
				return;
			}
			if (self.clearScreen && (g.at === 'bar' || g.at === 'screen')) { return; }
			var weight = g.weight || 1;
			var add = function (o, ox, oy) {
				for (var k = 0; k < weight; k += 1) { out.push({ name: name, target: o, ox: ox, oy: oy }); }
			};
			if (g.at in LINK) {
				var link = self.linkIn(r[0], r[1], LINK[g.at]);
				self.objects.forEach(function (o) {
					if (o.kind !== g.at || o.gone) { return; }
					if (dog.inside && dog.inside.obj !== o) { return; }
					if (g.need && !g.need(self, o)) { return; }
					var ox, oy;
					if (dog.inside) {
						ox = dog.inside.ox; oy = dog.inside.oy;
					} else if (link) {
						ox = o.x - link.x; oy = o.y - link.y;
					} else {
						return;
					}
					if (self.fits(name, ox, oy)) { add(o, ox, oy); }
				});
			} else if (g.at === 'free') {
				if (g.need && !g.need(self, null)) { return; }
				for (var t = 0; t < 12; t += 1) {
					var bx = self.box(r[0], r[1]);
					var ox = Math.round(rand(-bx.l, self.w - bx.r)), oy = Math.round(rand(BAR - bx.t, self.h - bx.b));
					if (!self.fits(name, ox, oy)) { continue; }
					if (g.dig && self.covers(bx, ox, oy)) { continue; }
					add(null, ox, oy);
					break;
				}
			} else if (g.at === 'bar') {
				var bb = self.box(r[0], r[1]);
				var lo = 300 - bb.l, hi = self.w - 240 - bb.r;
				if (hi >= lo) {
					var bxo = Math.round(rand(lo, hi));
					if (self.fits(name, bxo, -BAR_Y)) { add(null, bxo, -BAR_Y); }
				}
			} else if (g.at === 'screen') {
				if (g.need && !g.need(self, null)) { return; }
				if (self.fits(name, 0, 0)) { add(null, 0, 0); }
			} else if (g.at === 'left') {
				var lb = self.box(r[0], r[1]);
				var loy = Math.round(rand(BAR - lb.t, self.h - lb.b));
				if (self.fits(name, 0, loy)) { add(null, 0, loy); }
			}
		});
		return out;
	};

	/** Does a box at this offset land on anything on the desktop? */
	BadDog.prototype.covers = function (bx, ox, oy) {
		return this.objects.some(function (o) {
			var w = o.w || 40, h = (o.h || 30) + 18;
			return !(bx.r + ox < o.x || bx.l + ox > o.x + w || bx.b + oy < o.y || bx.t + oy > o.y + h);
		});
	};

	/* ------------------------------------------------------------ episodes */

	/*
	 * An episode is: run in, play the gag (and its sequel), run off. Each
	 * phase is a list of ticks; a tick says which cue to draw where.
	 */
	BadDog.prototype.begin = function () {
		var opts = this.options();
		if (!opts.length) { this.rest = 1; return; }
		/* ?gag=OpenWindow,3DGag picks those first, for checking them by eye. */
		var o = null;
		while (this.force && this.force.length && !o) {
			var want = this.force.shift();
			o = opts.filter(function (x) { return x.name === want; })[0] || null;
		}
		o = o || pick(opts);
		var g = GAGS[o.name];
		var r = this.cuesOf(o.name);
		var ticks = [];
		var ep = { name: o.name, gag: g, target: o.target, ox: o.ox, oy: o.oy, ticks: ticks, i: 0 };
		var first = this.dogIn(r[0]);
		if (first && !g.appear && !this.dog.inside) {
			this.runIn(ticks, first, o.ox, o.oy);
		}
		ep.start = ticks.length;
		for (var id = r[0]; id <= r[1]; id += 1) { ticks.push({ cue: id, ox: o.ox, oy: o.oy }); }
		var last = r[1];
		if (g.then && typeof g.then !== 'string') {
			for (id = g.then[0]; id <= g.then[1]; id += 1) { ticks.push({ cue: id, ox: o.ox, oy: o.oy }); }
			last = g.then[1];
		}
		ep.end = ticks.length;
		ep.last = r[1];
		var tail = this.dogIn(last);
		if (g.then && typeof g.then === 'string') {
			this.runLoop(ticks, g.then, tail, o.ox, o.oy);
		} else if (tail && !g.inside) {
			this.runOut(ticks, tail, o.ox, o.oy, g.exit, g.toy === true || (g.toy !== false && this.dog.toy));
		}
		this.ep = ep;
		this.dirty = true;
		if (this.dog.inside) { this.dog.inside = null; }
	};

	/** Where a run cycle's frames sit in the stage, and how far a lap carries him. */
	BadDog.prototype.cycle = function (range) {
		var xs = [], first = null;
		for (var id = range[0]; id <= range[1]; id += 1) {
			var d = this.dogIn(id);
			xs.push(d ? d.x : 0);
			if (!first) { first = d; }
		}
		var n = xs.length;
		var lap = (xs[n - 1] - xs[0]) * n / (n - 1);
		return { a: range[0], n: n, xs: xs, lap: lap };
	};

	/** Run in from the left so the last stride lands on the gag's first frame. */
	BadDog.prototype.runIn = function (ticks, first, ox, oy) {
		var cyc = this.cycle(this.dog.toy ? RUN_TOY : RUN);
		var lastDog = this.dogIn(cyc.a + cyc.n - 1);
		var step = cyc.lap / cyc.n;
		/* Screen x of the last stride's sprite, just behind the gag's dog. */
		var endX = ox + first.x - step;
		var endY = oy + first.y + first.h - (lastDog.y + lastDog.h);
		var laps = Math.max(1, Math.ceil((endX + lastDog.w + 20) / cyc.lap));
		var base = endX - lastDog.x - (laps - 1) * cyc.lap;
		for (var t = 0; t < laps * cyc.n; t += 1) {
			var k = t % cyc.n;
			ticks.push({ cue: cyc.a + k, ox: base + Math.floor(t / cyc.n) * cyc.lap, oy: endY, run: true });
		}
	};

	/** Run off whichever way he ends up facing. */
	BadDog.prototype.runOut = function (ticks, tail, ox, oy, dir, toy) {
		var cyc = this.cycle(toy ? RUN_TOY : RUN);
		var d0 = this.dogIn(cyc.a);
		var face = dir || (tail.flip ? -1 : 1);
		var y = oy + tail.y + tail.h - (d0.y + d0.h);
		var x0 = ox + tail.x;
		var laps = Math.ceil((this.w + 200) / cyc.lap) + 1;
		for (var t = 0; t < laps * cyc.n; t += 1) {
			var k = t % cyc.n, lap = Math.floor(t / cyc.n) * cyc.lap;
			if (face > 0) {
				var bx = x0 - d0.x + lap;
				if (bx + cyc.xs[k] > this.w + 20) { break; }
				ticks.push({ cue: cyc.a + k, ox: bx, oy: y, run: true });
			} else {
				/* Mirrored about mx: a sprite at stage x lands at mx - x - w. */
				var mx = x0 + tail.w + d0.x - lap;
				if (mx - cyc.xs[k] < -20) { break; }
				ticks.push({ cue: cyc.a + k, ox: mx, oy: y, mirror: true, run: true });
			}
		}
	};

	/** A sequel that is a run cycle with something in his mouth: loop it off screen. */
	BadDog.prototype.runLoop = function (ticks, name, tail, ox, oy) {
		var r = this.cuesOf(name);
		if (!r) { return; }
		var cyc = this.cycle(r);
		var d0 = this.dogIn(r[0]);
		var bx = ox + (tail ? tail.x - d0.x : 0);
		for (var t = 0; t < 400; t += 1) {
			var k = t % cyc.n, lap = Math.floor(t / cyc.n) * cyc.lap;
			if (bx + lap + cyc.xs[k] > this.w + 20) { break; }
			ticks.push({ cue: r[0] + k, ox: bx + lap, oy: oy, run: true });
		}
	};

	/** The gag's last picture becomes the desktop: holes stay dug, windows open. */
	BadDog.prototype.settle = function (ep) {
		var g = ep.gag, self = this;
		var list = this.cue(ep.last) || [];
		var kept = [];
		var linkSprite = null;
		list.forEach(function (s) {
			if (KEEP[s.key]) {
				kept.push({ key: s.key, img: s.img, f: s.f, w: s.w, h: s.h, flip: s.flip, x: s.x + ep.ox, y: s.y + ep.oy });
			}
			if (ep.target && LINK[ep.target.kind] === s.key) { linkSprite = s; }
		});
		var t = ep.target;
		if (t && !t.sprites) {
			/* A desktop icon: it may have been knocked along, or be gone. */
			if (linkSprite) {
				t.x = linkSprite.x + ep.ox; t.y = linkSprite.y + ep.oy;
			} else if (g.restore) {
				t.x = this.home.x; t.y = this.home.y;
			} else if (!g.keep && !g.inside) {
				t.gone = true;
			}
		} else if (t && t.sprites) {
			var stays = kept.some(function (s) { return s.key === LINK[t.kind]; });
			if (stays) {
				t.sprites = kept; kept = [];
				var ls = linkSprite || t;
				t.x = ls.x + (linkSprite ? ep.ox : 0); t.y = ls.y + (linkSprite ? ep.oy : 0);
				t.fallen = t.sprites.some(function (s) { return s.key === '23008#1'; });
			} else {
				this.objects.splice(this.objects.indexOf(t), 1);
			}
			if (t.kind === 'hole' && g.toy === false) { t.toy = true; }
			if (t.kind === 'hole' && g.toy === true) { t.toy = false; }
		}
		if (kept.length) {
			var kind = null, at = kept[0];
			kept.forEach(function (s) { if (KIND_OF[s.key] && !kind) { kind = KIND_OF[s.key]; at = s; } });
			this.objects.push({ kind: kind || 'debris', sprites: kept, x: at.x, y: at.y });
			if (kind === 'window') { this.objects[this.objects.length - 1].fallen = false; }
		}
		if (g.toy === true) { this.dog.toy = true; }
		if (g.toy === false) { this.dog.toy = false; }
		if (g.inside) {
			var home = t || this.objects[this.objects.length - 1];
			this.dog.inside = { obj: home, ox: ep.ox, oy: ep.oy };
		}
		/* Keep the desktop tidy: the oldest leftovers go first. */
		var debris = this.objects.filter(function (o) { return o.kind === 'debris' || o.kind === 'hole' || o.kind === 'mound'; });
		while (debris.length > 8) {
			var old = debris.shift();
			if (this.dog.inside && this.dog.inside.obj === old) { continue; }
			self.objects.splice(self.objects.indexOf(old), 1);
		}
		this.dirty = true;
	};

	/* ------------------------------------------------------------ running */

	BadDog.prototype.step = function (dt, ctx, w, h) {
		if (!this.art || !this.c) {
			ctx.fillStyle = this.clearScreen ? '#000' : TEAL;
			ctx.fillRect(0, 0, w, h);
			return;
		}
		if (!this.objects.length) { this.layout(); }
		var wasBlack = this.t > TWO_HOURS;
		this.t += dt;
		if (!wasBlack && this.t > TWO_HOURS) { this.dirty = true; }
		this.acc += dt;
		while (this.acc >= TICK) {
			this.acc -= TICK;
			this.tick();
		}
		if (this.dirty) { this.paintDesk(); }
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(this.desk, 0, 0, w, h);
		var ep = this.ep;
		if (ep && ep.i < ep.ticks.length) {
			var k = ep.ticks[ep.i];
			this.drawCue(ctx, k.cue, k.ox, k.oy, k.mirror, this.skipFor(ep, k));
		}
	};

	/* The window's two vases: the standing one until he knocks it over. */
	BadDog.prototype.skipFor = function (ep, k) {
		if (ep.name === 'CloseWindow' && ep.target) {
			return ep.target.fallen ? { '23000#14': 1 } : { '23008#1': 1 };
		}
		return null;
	};

	BadDog.prototype.tick = function () {
		var ep = this.ep;
		if (!ep) {
			this.rest -= TICK;
			if (this.rest <= 0) { this.begin(); }
			return;
		}
		ep.i += 1;
		if (ep.i === ep.start) { this.dirty = true; }
		if (ep.i === ep.end) { this.settle(ep); ep.settled = true; }
		if (ep.i >= ep.ticks.length) {
			if (!ep.settled) { this.settle(ep); }
			this.ep = null;
			this.rest = this.dog.inside ? rand(1, 3) : rand(0.5, 2);
			/* He took the bin with him; it is back by the time he is. */
			this.objects.forEach(function (o) { if (o.kind === 'trash') { o.gone = false; } });
			this.dirty = true;
		}
	};

	AfterDark.define('after-dark-bad-dog-40', function (el) {
		var sim = new BadDog();
		sim.clearScreen = AfterDark.flag(el, 'clear-screen');
		sim.force = (AfterDark.setting(el, 'gag') || '').split(',').filter(Boolean);
		var base = (AfterDark.setting(el, 'art') || 'art/baddog').replace(/\/$/, '');
		Promise.all([
			AfterDark.load(base),
			fetch(AfterDark.bust(base + '/cues.json'), { cache: 'no-cache' }).then(function (r) { return r.json(); })
		]).then(function (both) {
			sim.art = both[0];
			sim.c = both[1];
			sim.cueCache = {};
			sim.boxes = {};
			if (sim.w) { sim.layout(); }
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkBadDog40 = BadDog;
}());
