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
 * Disaster) and # of Lines (1, 5, 10, 20, Fill Screen). Mistakes get rubbed
 * out and written again; each board is wiped with the eraser when it is done,
 * and the dust builds up.
 *
 *   <after-dark-einstein art="art/einstein" errors="seldom" neatness="not very" lines="10">
 */
(function () {
	'use strict';

	var ERRORS = ['never', 'rarely', 'seldom', 'occasionally', 'frequently', 'almost always'];
	var MISTAKE = [0, 0.004, 0.01, 0.025, 0.06, 0.15];
	var NEATNESS = ['very', 'not very', 'pretty bad', 'really bad', 'ugly ugly ugly', 'chalk disaster'];
	var WOBBLE = [0, 0.4, 0.9, 1.6, 2.6, 4];
	var LINES = ['1', '5', '10', '20', 'fill screen'];
	/* Chalk steps a second. */
	var PACE = 420;
	var BOARD = '#1d2e25';

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Einstein() {
		this.mistake = MISTAKE[2];
		this.wobble = WOBBLE[1];
		this.lines = 10;
		this.font = null;
	}

	Einstein.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.s = Math.max(1.2, Math.min(w, h) / 330);
		this.board = document.createElement('canvas');
		this.board.width = Math.max(1, Math.round(w));
		this.board.height = Math.max(1, Math.round(h));
		var g = this.board.getContext('2d');
		g.fillStyle = BOARD;
		g.fillRect(0, 0, w, h);
		/* Old dust, so it is not a new blackboard. */
		for (var i = 0; i < 40; i += 1) {
			g.fillStyle = 'rgba(220,230,220,' + rand(0.01, 0.035).toFixed(3) + ')';
			g.fillRect(rand(-w * 0.2, w), rand(0, h), rand(w * 0.2, w * 0.6), rand(10, 40) * this.s);
		}
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

	/** What goes on the next board: lines to write out, or some physics. */
	Einstein.prototype.plan = function () {
		var s = this.s, room = (this.w * 0.88) / s;
		var gap = 22, rows = Math.max(1, Math.floor((this.h / s - 30) / gap));
		var text = [], self = this;
		/* Equations cannot wrap, so only the ones that fit this board. */
		var eqs = this.font.equations.filter(function (e) { return self.width(e) <= room; })
			.sort(function () { return Math.random() - 0.5; });
		if (Math.random() < 0.7 || !eqs.length) {
			var line = this.font.lines[Math.floor(Math.random() * this.font.lines.length)];
			var wrapped = this.wrap(line, room);
			var times = this.lines === Infinity ? Math.floor(rows / wrapped.length) : this.lines;
			for (var k = 0; k < times; k += 1) { text = text.concat(wrapped); }
		} else {
			eqs.slice(0, Math.max(2, Math.floor(rows / 3))).forEach(function (e) { text.push(e, ''); });
			gap = 26;
		}
		text = text.slice(0, rows);
		this.rows = [];
		for (var r = 0; r < text.length; r += 1) {
			this.rows.push({ text: text[r], x: this.w * 0.06, y: (30 + r * gap) * s + 14 * s,
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
		g.strokeStyle = 'rgba(236,238,228,' + rand(0.7, 0.95).toFixed(2) + ')';
		g.lineWidth = this.s * rand(1.1, 1.5);
		g.lineCap = 'round';
		g.beginPath();
		g.moveTo(a.x, a.y);
		g.lineTo(b.x, b.y);
		g.stroke();
	};

	/** One pass of the eraser along a band, leaving some dust behind. */
	Einstein.prototype.rub = function (x, y, w, h) {
		var g = this.board.getContext('2d');
		g.fillStyle = BOARD;
		g.globalAlpha = 0.88;
		g.fillRect(x, y, w, h);
		g.globalAlpha = 1;
		/* Felt drags the dust into streaks rather than lifting it. */
		for (var i = 0; i < 6; i += 1) {
			g.fillStyle = 'rgba(220,230,220,' + rand(0.005, 0.02).toFixed(3) + ')';
			g.fillRect(x + rand(-w * 0.1, w * 0.3), y + rand(0, h), w * rand(0.3, 0.9), rand(1, 4) * this.s);
		}
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
						this.state = 'admire';
						this.timer = 4;
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
			/* The eraser goes back and forth down the board. */
			var band = 34 * this.s;
			this.sweep += dt * 3.2;
			var done = Math.floor(this.sweep);
			while ((this.swept || 0) < done) {
				var n = this.swept || 0;
				this.rub(0, n * band * 0.8, w, band);
				this.swept = n + 1;
			}
			if (this.swept * band * 0.8 > h) {
				this.swept = 0;
				this.state = 'wait';
				this.timer = 1;
			}
		}
		ctx.drawImage(this.board, 0, 0, w, h);
		if (this.state === 'erase') {
			var y = (this.sweep % 1 + Math.floor(this.sweep)) * 34 * this.s * 0.8;
			var x = (Math.floor(this.sweep) % 2 ? 1 - this.sweep % 1 : this.sweep % 1) * (w - 60 * this.s);
			ctx.fillStyle = '#8a6a44';
			ctx.fillRect(x, y, 60 * this.s, 12 * this.s);
			ctx.fillStyle = '#d8d8d0';
			ctx.fillRect(x, y + 12 * this.s, 60 * this.s, 8 * this.s);
		}
	};

	AfterDark.define('after-dark-einstein', function (el) {
		var sim = new Einstein();
		sim.mistake = MISTAKE[AfterDark.choice(el, 'errors', ERRORS, 'seldom')];
		sim.wobble = WOBBLE[AfterDark.choice(el, 'neatness', NEATNESS, 'not very')];
		var lines = LINES[AfterDark.choice(el, 'lines', LINES, '10')];
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
