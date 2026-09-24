/**
 * puzzle.js - Puzzle, the desktop as a sliding-tile puzzle.
 *
 * PUZZLE.AD ships no artwork, and its description is mostly a postal
 * address - "If you like Puzzle, please send John a picture postcard of your
 * home town" - but its controls say what it does: Size (Small, Medium,
 * Large), Speed (Slow, Medium, Fast, Very Fast!), Sound and Invert Screen.
 * The screen is cut into tiles, one goes missing, and the rest slide into
 * the gap one after another, never solving anything.
 *
 *   <after-dark-puzzle size="medium" speed="medium">
 */
(function () {
	'use strict';

	var SIZES = ['small', 'medium', 'large'];
	var SIDE = [48, 80, 128];
	var SPEEDS = ['slow', 'medium', 'fast', 'very fast!'];
	/* Seconds a slide takes. */
	var SLIDE = [0.6, 0.3, 0.15, 0.06];

	function Puzzle() {
		this.side = SIDE[1];
		this.slide = SLIDE[1];
		this.invert = false;
	}

	Puzzle.prototype.resize = function (w, h) {
		var scale = Math.max(1, Math.min(w, h) / 480);
		var side = this.side * scale;
		this.cols = Math.max(2, Math.round(w / side));
		this.rows = Math.max(2, Math.round(h / side));
		this.tw = w / this.cols;
		this.th = h / this.rows;
		var desk = AfterDark.desktop(w, h);
		if (this.invert) {
			var g = desk.getContext('2d');
			g.globalCompositeOperation = 'difference';
			g.fillStyle = '#fff';
			g.fillRect(0, 0, desk.width, desk.height);
		}
		this.desk = desk;
		/* grid[r][c] is which tile sits there: its home, as an index. */
		this.grid = [];
		for (var r = 0; r < this.rows; r += 1) {
			this.grid.push([]);
			for (var c = 0; c < this.cols; c += 1) { this.grid[r].push(r * this.cols + c); }
		}
		this.hole = { c: Math.floor(Math.random() * this.cols), r: Math.floor(Math.random() * this.rows) };
		this.grid[this.hole.r][this.hole.c] = -1;
		this.moving = null;
		this.last = null;
		this.pause = 0.8;
	};

	/** A neighbour of the hole to slide in, never straight back where it came from. */
	Puzzle.prototype.choose = function () {
		var h = this.hole, opts = [];
		[[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(function (d) {
			var c = h.c + d[0], r = h.r + d[1];
			opts.push({ c: c, r: r });
		}, this);
		var self = this;
		opts = opts.filter(function (o) {
			return o.c >= 0 && o.r >= 0 && o.c < self.cols && o.r < self.rows &&
				!(self.last && self.last.c === o.c && self.last.r === o.r);
		});
		return opts[Math.floor(Math.random() * opts.length)];
	};

	Puzzle.prototype.tile = function (ctx, index, x, y) {
		var sc = index % this.cols, sr = Math.floor(index / this.cols);
		var tw = this.tw, th = this.th;
		ctx.drawImage(this.desk, sc * tw, sr * th, tw, th, x, y, tw, th);
		/* A thin bevel, so the tiles read as tiles. */
		ctx.fillStyle = 'rgba(255,255,255,0.35)';
		ctx.fillRect(x, y, tw, 1);
		ctx.fillRect(x, y, 1, th);
		ctx.fillStyle = 'rgba(0,0,0,0.45)';
		ctx.fillRect(x, y + th - 1, tw, 1);
		ctx.fillRect(x + tw - 1, y, 1, th);
	};

	Puzzle.prototype.step = function (dt, ctx, w, h) {
		if (this.pause > 0) {
			this.pause -= dt;
		} else if (!this.moving) {
			var from = this.choose();
			this.moving = { from: from, to: { c: this.hole.c, r: this.hole.r },
				index: this.grid[from.r][from.c], t: 0 };
			this.grid[from.r][from.c] = -1;
		} else {
			var m = this.moving;
			m.t += dt / this.slide;
			if (m.t >= 1) {
				this.grid[m.to.r][m.to.c] = m.index;
				this.last = m.to;
				this.hole = m.from;
				this.moving = null;
			}
		}

		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		for (var r = 0; r < this.rows; r += 1) {
			for (var c = 0; c < this.cols; c += 1) {
				var idx = this.grid[r][c];
				if (idx >= 0) { this.tile(ctx, idx, c * this.tw, r * this.th); }
			}
		}
		if (this.moving) {
			var mv = this.moving, k = Math.min(1, mv.t);
			var x = (mv.from.c + (mv.to.c - mv.from.c) * k) * this.tw;
			var y = (mv.from.r + (mv.to.r - mv.from.r) * k) * this.th;
			this.tile(ctx, mv.index, x, y);
		}
	};

	AfterDark.define('after-dark-puzzle', function (el) {
		var sim = new Puzzle();
		sim.side = SIDE[AfterDark.choice(el, 'size', SIZES, 'medium')];
		sim.slide = SLIDE[AfterDark.choice(el, 'speed', SPEEDS, 'medium')];
		sim.invert = AfterDark.flag(el, 'invert-screen');
		return sim;
	});

	window.AfterDarkPuzzle = Puzzle;
}());
