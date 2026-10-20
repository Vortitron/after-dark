/**
 * life.js - Life & All, which works out the meaning of life on screen.
 *
 * LIFE.AD's own description:
 *
 *   "Take a moment to calculate the meaning of life. "Calculate" determines
 *    which of the complex questions of life you want to figure out. "Years"
 *    determines how many millions of years this calculation will take. These
 *    controls are not real. They have no affect on the actual display.
 *    They're just part of the joke."
 *   Programming by Kendall J. Redburn. Art provided by Image Club Graphics.
 *   Additional art by Craig Foster and Joe Kauffman.
 *
 * Its art, in all/art/life/, is three strips of 64x64 pictures: 71 pieces of
 * clip art (a globe, a mushroom cloud, a martini, a rubber duck, a bull's
 * skull...) and, at the end of 10002, eighteen Greek letters. Everything
 * else - the brackets, root signs, fraction bars and operators the pictures
 * sit in - the module draws, so it is drawn here, after a capture of the
 * real module running.
 *
 * What it does, as the capture shows it: an equation twelve layers deep,
 * nested round brackets in cyan, blue, green and red, root signs, fraction
 * bars and a bracketed "over" with two little triangles, every term a Greek
 * letter. It is solved from the inside out. The terms of the innermost layer
 * spin like a fruit machine, one after the other, about a second each,
 * through the clip art and stop on a picture; a moment later that layer is
 * replaced by its answer, another picture, and the equation shrinks round it.
 * When the last layer goes the answer is left, and a new equation grows back
 * out of it, a layer every fifth of a second. Across the top, "Time
 * Remaining:" counts down a second at a time from 57,788,000,000,000 and
 * creeps right a pixel a second.
 *
 * Filled in rather than seen: the odds of each kind of layer (from the two
 * equations captured), the clock (it started at 57,788,000,000,000 with the
 * default settings and at 84,018,400,000,000 with Calculate on Money and Years
 * near the bottom; the rule behind that is not known, so it always starts at
 * the first), and the final answer. Both captured answers were the
 * martini, so the answer is always the martini - which may be the joke, or
 * may be chance. Calculate and Years are accepted and, as promised, ignored.
 *
 *   <after-dark-life art="art/life" calculate="life" years="5 million"></after-dark-life>
 */
(function () {
	'use strict';

	var CALCULATE = ['life', 'universe', 'everything', 'nothing', 'love', 'money'];
	var YEARS = ['1 million', '3 million', '5 million', '7 million', '9 million'];

	var COLOURS = ['#00ffff', '#0000ff', '#00ff00', '#ff0000'];
	var OPS = ['+', '-', 'x'];
	var DEPTH = 12;
	var BUILD_STEP = 0.2;     // a layer every fifth of a second as it grows
	var SPIN = 1.0;           // how long a term spins
	var SPIN_TICK = 0.1;      // a new picture this often while it does
	var HOLD = 1.6;           // looking at the answer before it is put in
	var START = 57788000000000;

	/* What each layer adds, in pixels at 1024x768: brackets, root signs and
	   bars stand this far off what they hold. */
	var PAD = 16;
	var PAREN = 14;
	var OP_GAP = 22;
	var ROOT_V = 19;
	var ROOT_OVER = 10;

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	function leaf(pic) {
		return { t: 'leaf', pic: pic };
	}

	function Life() {
		this.art = null;
		this.pictures = [];
		this.greek = [];
		this.answer = null;
		this.tree = null;
		this.time = START;
		this.clock = 0;
		this.textX = 0;
		this.textDir = 1;
	}

	Life.prototype.setArt = function (art) {
		this.art = art;
		var self = this;
		[10000, 10001, 10002].forEach(function (id) {
			var seq = art.sequence(id);
			for (var i = 0; seq && i < seq.count; i += 1) {
				var p = { seq: seq, i: i };
				if (id === 10002 && i >= 12) {
					self.greek.push(p);
				} else {
					self.pictures.push(p);
				}
				if (id === 10000 && i === 11) { self.answer = p; }
			}
		});
		this.answer = this.answer || this.pictures[0];
		this.tree = this.grow(leaf(pick(this.greek)), DEPTH);
		this.reduce();
	};

	/* ------------------------------------------------------------ growing ---
	   The equation grows round one term at a time. The term in focus is
	   wrapped in a new layer: a root sign over it, or a bracket, a fraction or
	   an "over" in which it becomes the right-hand or lower term and a new
	   Greek letter takes the focus. So the innermost layer is always on the
	   left, which is where the solving starts. */
	Life.prototype.expand = function () {
		var f = this.focus;
		var col = pick(COLOURS);
		var r = Math.random();
		var copy = { t: f.t, pic: f.pic };
		var fresh = leaf(pick(this.greek));
		if (r < 0.25) {
			f.t = 'root'; f.a = copy; f.col = col;
			this.focus = copy;
		} else if (r < 0.80) {
			f.t = 'bin'; f.op = pick(OPS); f.col = col;
			if (this.depth === 0) {
				f.a = copy; f.b = fresh; this.focus = copy;
			} else {
				f.a = fresh; f.b = copy; this.focus = fresh;
			}
		} else if (r < 0.92) {
			f.t = 'frac'; f.a = fresh; f.b = copy; f.col = col;
			this.focus = fresh;
		} else {
			f.t = 'over'; f.a = fresh; f.b = copy; f.col = col;
			this.focus = fresh;
		}
		delete f.pic;
		this.depth += 1;
	};

	Life.prototype.grow = function (seed, layers) {
		this.focus = seed;
		this.depth = 0;
		for (var i = 0; i < layers; i += 1) { this.expand(); }
		return seed;
	};

	/* ------------------------------------------------------------ solving --- */

	/* The deepest layer - the one whose terms are all plain terms. */
	function innermost(n, parent) {
		if (n.t === 'leaf') { return null; }
		var kids = n.t === 'root' ? [n.a] : [n.a, n.b];
		for (var i = 0; i < kids.length; i += 1) {
			var hit = innermost(kids[i], n);
			if (hit) { return hit; }
		}
		return n;
	}

	Life.prototype.reduce = function () {
		var n = innermost(this.tree, null);
		if (!n) {
			this.phase = 'blank';
			this.wait = BUILD_STEP;
			return;
		}
		this.node = n;
		this.queue = n.t === 'root' ? [n.a] : [n.a, n.b];
		this.phase = 'spin';
		this.nextSpin();
	};

	Life.prototype.nextSpin = function () {
		this.spinning = this.queue.shift();
		this.wait = SPIN;
		this.tick = 0;
	};

	Life.prototype.update = function (dt) {
		this.wait -= dt;
		if (this.phase === 'spin') {
			this.tick -= dt;
			if (this.tick <= 0) {
				this.tick += SPIN_TICK;
				this.spinning.pic = pick(this.pictures);
			}
			if (this.wait <= 0) {
				/* The last term of the last layer stops on the answer. */
				if (this.node === this.tree && this.spinning === this.node.a) {
					this.spinning.pic = this.answer;
				}
				this.spinning = null;
				if (this.queue.length) {
					this.nextSpin();
				} else {
					this.phase = 'hold';
					this.wait = HOLD;
				}
			}
		} else if (this.phase === 'hold') {
			if (this.wait <= 0) {
				var n = this.node;
				var last = n === this.tree;
				var pic = last ? n.a.pic : pick(this.pictures);
				n.t = 'leaf'; n.pic = pic;
				delete n.a; delete n.b; delete n.op; delete n.col;
				if (last) {
					this.phase = 'blank';
					this.wait = BUILD_STEP / 2;
				} else {
					this.reduce();
				}
			}
		} else if (this.phase === 'blank') {
			if (this.wait <= 0) {
				this.focus = this.tree;
				this.depth = 0;
				this.phase = 'build';
				this.wait = BUILD_STEP;
			}
		} else if (this.phase === 'build') {
			if (this.wait <= 0) {
				this.expand();
				this.wait += BUILD_STEP;
				if (this.depth >= DEPTH) { this.reduce(); }
			}
		}
	};

	/* ------------------------------------------------------------- layout --- */

	function measure(n) {
		var a, b;
		if (n.t === 'leaf') {
			n.w = 64; n.h = 64;
		} else if (n.t === 'root') {
			a = measure(n.a);
			n.w = ROOT_V + a.w + ROOT_OVER;
			n.h = PAD + a.h + 5;
		} else if (n.t === 'bin') {
			a = measure(n.a); b = measure(n.b);
			n.w = PAREN + a.w + OP_GAP + b.w + PAREN;
			n.h = Math.max(a.h, b.h) + 2 * PAD;
		} else if (n.t === 'frac') {
			a = measure(n.a); b = measure(n.b);
			n.w = Math.max(a.w, b.w) + 8;
			n.h = PAD + a.h + 16 + b.h + PAD;
		} else {
			a = measure(n.a); b = measure(n.b);
			n.w = Math.max(a.w, b.w) + 42;
			n.h = 15 + a.h + 23 + b.h + 14;
		}
		return n;
	}

	Life.prototype.drawPic = function (ctx, p, x, y) {
		if (p) { p.seq.draw(ctx, p.i, x + 32, y + 32); }
	};

	function line(ctx, x0, y0, x1, y1) {
		ctx.beginPath();
		ctx.moveTo(x0, y0);
		ctx.lineTo(x1, y1);
		ctx.stroke();
	}

	/* A tall round bracket: straight up the middle, curling in at the ends. */
	function paren(ctx, x, top, bottom, dir) {
		var r = 10;
		ctx.beginPath();
		ctx.moveTo(x + dir * r, top);
		ctx.arcTo(x, top, x, top + r, r);
		ctx.lineTo(x, bottom - r);
		ctx.arcTo(x, bottom, x + dir * r, bottom, r);
		ctx.stroke();
	}

	function operator(ctx, op, cx, cy) {
		if (op === '+') {
			line(ctx, cx - 4, cy, cx + 5, cy);
			line(ctx, cx + 0.5, cy - 4.5, cx + 0.5, cy + 4.5);
		} else if (op === '-') {
			line(ctx, cx - 4, cy, cx + 5, cy);
		} else {
			line(ctx, cx - 3.5, cy - 3.5, cx + 3.5, cy + 3.5);
			line(ctx, cx - 3.5, cy + 3.5, cx + 3.5, cy - 3.5);
		}
	}

	function triangle(ctx, cx, cy, up) {
		var s = up ? -1 : 1;
		ctx.beginPath();
		ctx.moveTo(cx - 5, cy - s * 4);
		ctx.lineTo(cx + 5, cy - s * 4);
		ctx.lineTo(cx, cy + s * 5);
		ctx.closePath();
		ctx.stroke();
	}

	/* Each node's box is laid out round its middle line, so the right-hand
	   term of a bracket sits level with the middle of the left. */
	Life.prototype.paint = function (ctx, n, x, y) {
		var a = n.a, b = n.b, mid = y + n.h / 2;
		if (n.t === 'leaf') {
			this.drawPic(ctx, n.pic, x, y);
			return;
		}
		ctx.strokeStyle = n.col;
		ctx.lineWidth = 2;
		if (n.t === 'root') {
			var top = y + 1, bottom = y + n.h - 1;
			line(ctx, x + 1, top, x + 7, bottom);
			line(ctx, x + 7, bottom, x + 11, top);
			line(ctx, x + 11, top, x + n.w, top);
			this.paint(ctx, a, x + ROOT_V, y + PAD);
		} else if (n.t === 'bin') {
			paren(ctx, x + 1, y + 1, y + n.h - 1, 1);
			paren(ctx, x + n.w - 1, y + 1, y + n.h - 1, -1);
			var ax = x + PAREN;
			ctx.strokeStyle = n.col;
			operator(ctx, n.op, ax + a.w + OP_GAP / 2, mid);
			this.paint(ctx, a, ax, mid - a.h / 2);
			this.paint(ctx, b, ax + a.w + OP_GAP, mid - b.h / 2);
		} else if (n.t === 'frac') {
			var ly = y + PAD + a.h + 8;
			line(ctx, x, ly, x + n.w, ly);
			this.paint(ctx, a, x + (n.w - a.w) / 2, y + PAD);
			this.paint(ctx, b, x + (n.w - b.w) / 2, ly + 8);
		} else {
			var t = y + 1, bt = y + n.h - 1, l = x + 1, r = x + n.w - 1;
			line(ctx, l, t + 10, l, t); line(ctx, l, t, r, t); line(ctx, r, t, r, t + 10);
			line(ctx, l, bt - 10, l, bt); line(ctx, l, bt, r, bt); line(ctx, r, bt, r, bt - 10);
			var ty = y + 15 + a.h + 14;
			triangle(ctx, x + n.w / 2 - 16, ty, true);
			triangle(ctx, x + n.w / 2 + 16, ty, false);
			this.paint(ctx, a, x + 20 + (n.w - 42 - a.w) / 2, y + 15);
			this.paint(ctx, b, x + (n.w - b.w) / 2, y + 15 + a.h + 23);
		}
	};

	Life.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.textX = Math.round(w * (0.05 + Math.random() * 0.1));
	};

	Life.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.tree) { return; }
		this.update(dt);

		/* The clock: a second a second, and a pixel a second to the side. */
		this.clock += dt;
		while (this.clock >= 1) {
			this.clock -= 1;
			this.time = Math.max(0, this.time - 1);
			this.textX += this.textDir;
		}
		ctx.font = 'bold 12px "MS Sans Serif", "Microsoft Sans Serif", Arial, sans-serif';
		ctx.textBaseline = 'top';
		ctx.fillStyle = '#fff';
		var text = 'Time Remaining: ' + this.time;
		var tw = ctx.measureText(text).width;
		if (this.textX + tw > w - 4) { this.textDir = -1; }
		if (this.textX < 4) { this.textDir = 1; }
		ctx.fillText(text, Math.round(this.textX), 7);

		if (this.phase === 'blank') { return; }
		var t = measure(this.tree);
		var s = Math.min(1, (w - 8) / t.w, (h - 40) / t.h);
		ctx.save();
		ctx.translate(Math.round(w / 2), Math.round(h / 2));
		ctx.scale(s, s);
		ctx.imageSmoothingEnabled = s < 1;
		ctx.lineCap = 'butt';
		this.paint(ctx, t, -Math.round(t.w / 2), -Math.round(t.h / 2));
		ctx.restore();
	};

	AfterDark.define('after-dark-life', function (el) {
		var sim = new Life();
		/* Accepted, and - as the module says - not real. */
		sim.calculate = CALCULATE[AfterDark.choice(el, 'calculate', CALCULATE, 'life')];
		sim.years = YEARS[AfterDark.choice(el, 'years', YEARS, '5 million')];
		AfterDark.load(AfterDark.setting(el, 'art') || 'art/life').then(function (art) {
			sim.setArt(art);
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkLife = Life;
}());
