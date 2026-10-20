/**
 * einstein.js - Einstein, somebody kept in after class at the blackboard.
 *
 * EINSTEIN.AD ships no pictures, but it does ship its chalk. Its type 32513
 * resources are a handwriting font, one glyph per character code, stored as
 * the pen's path a pixel at a time - so the letters here are drawn stroke by
 * stroke along the original's own strokes. Codes 128 and up are whole pieces
 * of physics: dB/dt, rho over epsilon-nought, the square root of 1 - v^2/c^2.
 * Its string table holds fifty lines to be written out a hundred times ("I
 * will not Xerox my butt.") and fifteen equations built from those pieces -
 * Maxwell's, E=mc^2, the Lorentz transform, a hydrogen wavefunction.
 * tools/adtext.py pulls all of it into all/art/einstein/.
 *
 * Its own description:
 *
 *   "Late one night, in between swigs and swallows of the nectar of the gods
 *    (Yoo-hoo(tm)), I mumbled, 'Who's at the blackboard?' Later, between
 *    bites and nibbles of Mallomars(tm), I muttered, 'How many mistakes? A
 *    steady hand?' And look where it's got me."
 *
 * The controls are Errors (Never to Almost Always), Neatness (Very to Chalk
 * Disaster) and # of Lines (1, 5, 10, 20, Fill Screen); the panel's defaults
 * are 52, 52 and 100 (Seldom, Pretty Bad, Fill Screen).
 *
 * Checked against the real module under Wine (24- and 8-bit, five runs of
 * 25-150 s, defaults and every control at 0 and at 100):
 *   - Black screen, white chalk one pixel wide, the font at its own size.
 *   - It writes equations, one after another along the top row from x 9
 *     (baseline about 46), three spaces apart, at roughly 60 px of row a
 *     second; when the next one will not fit, the whole board is wiped left
 *     to right in a few tenths of a second and it starts again. Once (no
 *     settings stored) it went on to a second row 80 px lower instead.
 *   - Under Wine the controls made no visible difference, and no
 *     written-out lines appeared at all. The lines, the mistakes and the
 *     wobble below are therefore from the module's data and description, not
 *     from a capture, and a board of lines is kept rare.
 *
 *   <after-dark-einstein art="art/einstein" errors="seldom" neatness="pretty bad" lines="fill screen">
 */
(function () {
	'use strict';

	var ERRORS = ['never', 'rarely', 'seldom', 'occasionally', 'frequently', 'almost always'];
	var MISTAKE = [0, 0.004, 0.01, 0.025, 0.06, 0.15];
	var NEATNESS = ['very', 'not very', 'pretty bad', 'really bad', 'ugly ugly ugly', 'chalk disaster'];
	var WOBBLE = [0, 0.4, 0.9, 1.6, 2.6, 4];
	var LINES = ['1', '5', '10', '20', 'fill screen'];
	/* Chalk steps a second: a row of equations ~950 px across took 13-15 s. */
	var PACE = 240;
	/* Black, with white chalk a pixel wide, as the captures show it. */
	var BOARD = '#000000';
	/* Where the first row's pen starts, the gap between equations, and how
	   far down the next row would be (measured off 1024x768 captures). */
	var LEFT = 9;
	var BASE = 46;
	var ROW = 80;
	var GAP = '   ';
	/* How often a board is lines rather than equations. Every capture (five
	   runs, about seven minutes) wrote equations; the lines are in the module
	   but when it writes them is not known, so they are kept rare. */
	var LINES_CHANCE = 0.2;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Einstein() {
		this.mistake = MISTAKE[2];
		this.wobble = WOBBLE[2];
		this.lines = Infinity;
		this.font = null;
	}

	Einstein.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		/* The font's own pixels, on any screen. */
		this.s = 1;
		this.board = document.createElement('canvas');
		this.board.width = Math.max(1, Math.round(w));
		this.board.height = Math.max(1, Math.round(h));
		var g = this.board.getContext('2d');
		g.fillStyle = BOARD;
		g.fillRect(0, 0, w, h);
		this.queue = [];
		this.state = 'wait';
		this.timer = 0.6;
	};

	/** The glyph for a character code; '$' is not in the font, so it is an S with a bar. */
	Einstein.prototype.glyph = function (code) {
		var f = this.font.glyphs;
		if (f[code]) { return f[code]; }
		if (code === 36 && f[83]) {
			var s = f[83], ex = 0, ey = 0, i;
			for (i = 0; i < s.steps.length; i += 2) { ex += s.steps[i]; ey += s.steps[i + 1]; }
			var bar = [Math.round(s.advance / 2) - ex, s.top - 2 - ey];
			for (i = s.top - 2; i < 2; i += 1) { bar.push(0, 1); }
			f[36] = { top: s.top - 2, advance: s.advance, steps: s.steps.concat(bar) };
			return f[36];
		}
		return f[32] || { top: 0, advance: 8, steps: [] };
	};

	Einstein.prototype.width = function (text) {
		var n = 0;
		for (var i = 0; i < text.length; i += 1) { n += this.glyph(text.charCodeAt(i)).advance; }
		return n;
	};

	/** Break a line where it would run off the board. */
	Einstein.prototype.wrap = function (text, room) {
		var out = [], line = '';
		text.split(' ').forEach(function (word) {
			var next = line ? line + ' ' + word : word;
			if (line && this.width(next) > room) {
				out.push(line);
				line = word;
			} else {
				line = next;
			}
		}, this);
		if (line) { out.push(line); }
		return out;
	};

	/**
	 * What goes on the next board. Usually physics: equations one after
	 * another along the top, three spaces apart, until the next will not fit;
	 * then the board is wiped and it starts again. Now and then a line to be
	 * written out the chosen number of times.
	 */
	Einstein.prototype.plan = function () {
		var s = this.s, room = (this.w - LEFT * 2) / s, self = this;
		var text = [], gap = 22;
		var eqs = this.font.equations.filter(function (e) { return self.width(e) <= room; });
		if (Math.random() >= LINES_CHANCE && eqs.length) {
			var row = '';
			for (var tries = 0; tries < 40; tries += 1) {
				var e = eqs[Math.floor(Math.random() * eqs.length)];
				var next = row ? row + GAP + e : e;
				if (this.width(next) > room) { break; }
				row = next;
			}
			text.push(row);
			gap = ROW;
		} else {
			var rows = Math.max(1, Math.floor((this.h / s - BASE) / gap) + 1);
			var line = this.font.lines[Math.floor(Math.random() * this.font.lines.length)];
			var wrapped = this.wrap(line, room);
			var times = this.lines === Infinity ? Math.floor(rows / wrapped.length) : this.lines;
			for (var k = 0; k < times; k += 1) { text = text.concat(wrapped); }
			text = text.slice(0, rows);
		}
		this.rows = [];
		for (var r = 0; r < text.length; r += 1) {
			this.rows.push({ text: text[r], x: LEFT, y: (BASE + r * gap) * s,
				slope: rand(-1, 1) * this.wobble * 0.006 });
		}
		this.row = 0;
		this.col = 0;
		this.pen = null;
	};

	/** Chalk for one character: the steps to draw, placed on the board. */
	Einstein.prototype.chalk = function (code, x, y) {
		var gl = this.glyph(code), s = this.s * rand(1 - this.wobble * 0.02, 1 + this.wobble * 0.02);
		var jx = rand(-1, 1) * this.wobble * 0.4 * this.s, jy = rand(-1, 1) * this.wobble * 0.5 * this.s;
		var pts = [], px = 0, py = 0;
		for (var i = 0; i < gl.steps.length; i += 2) {
			var dx = gl.steps[i], dy = gl.steps[i + 1];
			var lift = i === 0 || Math.abs(dx) > 1 || Math.abs(dy) > 1;
			px += dx;
			py += dy;
			pts.push({ x: x + jx + px * s, y: y + jy + py * s, lift: lift });
		}
		return { pts: pts, at: 0, advance: gl.advance * this.s, x: x, y: y, code: code };
	};

	Einstein.prototype.nextChar = function () {
		while (this.row < this.rows.length) {
			var r = this.rows[this.row];
			if (this.col < r.text.length) {
				var x = this.pen === null ? r.x : this.pen;
				var y = r.y + (x - r.x) * r.slope;
				var code = r.text.charCodeAt(this.col);
				/* Now and then the wrong letter, noticed straight away. */
				if (code > 64 && code < 123 && Math.random() < this.mistake) {
					var wrong = 97 + Math.floor(Math.random() * 26);
					var bad = this.chalk(wrong, x, y);
					bad.wrong = true;
					return bad;
				}
				this.col += 1;
				var c = this.chalk(code, x, y);
				this.pen = x + c.advance;
				return c;
			}
			this.row += 1;
			this.col = 0;
			this.pen = null;
		}
		return null;
	};

	Einstein.prototype.stroke = function (g, a, b) {
		g.strokeStyle = '#ffffff';
		g.lineWidth = 1;
		g.lineCap = 'square';
		g.beginPath();
		g.moveTo(a.x, a.y);
		g.lineTo(b.x, b.y);
		g.stroke();
	};

	/** Rub out a patch: the board is plain black, so it is simply gone. */
	Einstein.prototype.rub = function (x, y, w, h) {
		var g = this.board.getContext('2d');
		g.fillStyle = BOARD;
		g.fillRect(x, y, w, h);
	};

	Einstein.prototype.step = function (dt, ctx, w, h) {
		if (!this.font) {
			ctx.fillStyle = BOARD;
			ctx.fillRect(0, 0, w, h);
			return;
		}
		var g = this.board.getContext('2d');
		if (this.state === 'wait') {
			this.timer -= dt;
			if (this.timer <= 0) {
				this.plan();
				this.state = 'write';
				this.budget = 0;
			}
		} else if (this.state === 'write') {
			this.budget += PACE * dt;
			while (this.budget >= 1 && this.state === 'write') {
				if (!this.current) {
					this.current = this.nextChar();
					if (!this.current) {
						/* A full board is wiped almost at once. */
						this.state = 'admire';
						this.timer = 0.3;
						break;
					}
				}
				var c = this.current;
				if (c.at >= c.pts.length) {
					if (c.wrong) {
						/* Rub it out and try again. */
						this.state = 'oops';
						this.timer = 0.5;
						this.oops = c;
					}
					this.current = null;
					continue;
				}
				var p = c.pts[c.at];
				if (!p.lift && c.at > 0) { this.stroke(g, c.pts[c.at - 1], p); }
				c.at += 1;
				this.budget -= 1;
			}
		} else if (this.state === 'oops') {
			this.timer -= dt;
			if (this.timer <= 0) {
				var o = this.oops;
				for (var k = 0; k < 3; k += 1) {
					this.rub(o.x + this.s, o.y - 16 * this.s, Math.max(this.s, o.advance - this.s), 20 * this.s);
				}
				this.state = 'write';
			}
		} else if (this.state === 'admire') {
			this.timer -= dt;
			if (this.timer <= 0) {
				this.state = 'erase';
				this.sweep = 0;
			}
		} else if (this.state === 'erase') {
			/* The wipe runs left to right across the board in a few tenths of a second. */
			var from = this.sweep * w;
			this.sweep = Math.min(1, this.sweep + dt / 0.3);
			this.rub(Math.floor(from), 0, Math.ceil(this.sweep * w - from) + 1, h);
			if (this.sweep >= 1) {
				this.state = 'wait';
				this.timer = 0.2;
			}
		}
		ctx.drawImage(this.board, 0, 0, w, h);
	};

	AfterDark.define('after-dark-einstein', function (el) {
		var sim = new Einstein();
		sim.mistake = MISTAKE[AfterDark.choice(el, 'errors', ERRORS, 'seldom')];
		sim.wobble = WOBBLE[AfterDark.choice(el, 'neatness', NEATNESS, 'pretty bad')];
		var lines = LINES[AfterDark.choice(el, 'lines', LINES, 'fill screen')];
		sim.lines = lines === 'fill screen' ? Infinity : Number(lines);
		AfterDark.data(AfterDark.setting(el, 'art') || 'art/einstein').then(function (font) {
			sim.font = font;
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkEinstein = Einstein;
}());
