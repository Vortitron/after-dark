/**
 * turtle.js - Magic Turtle, After Dark 4.0's Logo turtle.
 *
 * TURTLE.AD's own description:
 *
 *   "Magic Turtle makes turtle magic."
 *   "Speed" determines how fast the Turtle draws and redraws.
 *   "Display" determines which of the eight programs will be displayed.
 *   Check "Show Edit Message" to be reminded how to edit or create your
 *   turtle program.
 *   Original concept by Scott Kelley. Programming by Andrew Armstrong.
 *
 * and its help text: "Place icons in the edit window and the Turtle reads
 * them left to right, skipping all blank spaces, and doing its best to obey
 * the icon instructions. When the turtle runs out of instructions, it starts
 * over again from the beginning. If no eraser icon is present, the Turtle
 * will automatically clear the screen every two minutes."
 *
 * The eight programs are not resources. They are initialised data in the
 * DLL, each a grid of up to 100 cells, twelve to a line, every cell an icon
 * (Posi, Move, TrnR, TrnL, PClr, PWid, Sqre, Circ, Loop, Eras, Refl, Cycl)
 * with a modifier (Nm a number, Hi and Lo, Rn random, Cn centre, Nr north,
 * Sv/Rs remember and restore, Co a colour). tools/README.md says how they
 * were found; all/art/turtle/index.json holds them and the module's palette.
 *
 * What each icon does here was read out of the interpreter in TURTLE.AD
 * (CODE 0x413550 and the handlers it dispatches to), not guessed:
 *
 *  - One icon per tick. Speed waits 100/75/50/25/0 ms between them, Snail to
 *    Racehorse; blanks cost nothing.
 *  - The unit is min(screen width / 64, screen height / 48), 16 at 1024x768.
 *    "Rn" on a size is 1-6 units (one roll per icon), on a turn 18-108 degrees.
 *  - Hi and Lo run with the first Loop later on the same line: Hi goes from 1%
 *    to 100% of the range as the loop counts up, Lo the other way, 50% with no
 *    loop. The range is 5 units for steps and sizes, 90 degrees for turns,
 *    6 pixels for the pen. On a colour they step the palette index instead.
 *  - Loop jumps back to the start of its line until it has done x repeats.
 *  - Square and Circle are filled. Pen width 0 is pen up.
 *  - Reflect makes 1, 2, 4, 6, 8, 10, 12, 15, 18 or 20 turtles at the same
 *    spot, headings spread evenly round the circle, all obeying every move.
 *  - Heading 0 is straight up; Move adds sin and subtracts cos.
 *  - Each run starts from the middle in red with a 1-pixel pen and clears the
 *    screen. A program that ends on an icon rather than a blank holds its
 *    picture for two minutes before it runs again.
 *  - Cycle rotates palette entries 33-228 by one, which only shows in 256
 *    colours (the module says "Colors will not cycle in more than 256
 *    colors" otherwise). This draws into a 256-colour buffer so it cycles, as
 *    it would have on the machines it was written for. The reference capture
 *    was made in true colour, so it does not.
 *
 * Filled in: one tick is 27 ms, which is how fast Racehorse ran in the
 * capture (Snail ran at its 100 ms there, so the others are taken as their
 * delays, with Rabbit no faster than a tick). Placing reflected turtles after a Posi is muddled in the original
 * (it reads a heading past the end of the table); none of the eight programs
 * does it, so here they simply gather round the new spot. The Caps Lock
 * editor is not reproduced.
 *
 *   <after-dark-magic-turtle art="art/turtle" speed="racehorse" display="program 1" show-edit-message>
 */
(function () {
	'use strict';

	var SPEEDS = ['snail', 'turtle', 'mule', 'rabbit', 'racehorse'];
	var DELAY = [100, 75, 50, 25, 0];
	var TICK = 27;
	var DISPLAYS = ['program 1', 'program 2', 'program 3', 'program 4', 'program 5',
		'program 6', 'program 7', 'program 8', 'random'];
	var REFLECT = [1, 2, 4, 6, 8, 10, 12, 15, 18, 20];
	var HOLD = 120000;

	function rand(n) {
		return Math.floor(Math.random() * n);
	}

	function Turtle() {
		this.w = 0;
		this.h = 0;
		this.data = null;
		this.which = 0;
		this.delay = 0;
		this.message = true;
		this.clock = 0;
		this.next = 0;
		this.clearAt = HOLD;
	}

	Turtle.prototype.resize = function (w, h) {
		this.w = Math.max(1, Math.round(w));
		this.h = Math.max(1, Math.round(h));
		this.unit = Math.max(1, Math.min(Math.floor(this.w / 64), Math.floor(this.h / 48)));
		this.pix = new Uint8Array(this.w * this.h);
		this.off = document.createElement('canvas');
		this.off.width = this.w;
		this.off.height = this.h;
		this.og = this.off.getContext('2d');
		this.img = this.og.createImageData(this.w, this.h);
		this.dirty = true;
		if (this.data) { this.start(); }
	};

	Turtle.prototype.setData = function (data) {
		this.data = data;
		this.base = data.palette.map(function (hex) {
			var v = parseInt(hex, 16);
			return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
		});
		if (this.w) { this.start(); }
	};

	Turtle.prototype.nearest = function (r, g, b) {
		var best = 0, bd = Infinity;
		for (var i = 0; i < this.base.length; i += 1) {
			var c = this.base[i];
			var d = (c[0] - r) * (c[0] - r) + (c[1] - g) * (c[1] - g) + (c[2] - b) * (c[2] - b);
			if (d < bd) { bd = d; best = i; }
		}
		return best;
	};

	Turtle.prototype.start = function () {
		this.pal = this.base.map(function (c) { return c.slice(); });
		this.palette();
		var n = this.which >= 8 ? rand(8) : this.which;
		/* Cells are copied: Loop counters and Sv positions live in them. */
		this.prog = this.data.programs[n].map(function (c) {
			return c ? { op: c[0], mod: c[1], x: c[2], val: c[3] } : null;
		});
		this.red = this.nearest(255, 0, 0);
		this.blue = this.nearest(0, 0, 255);
		this.statusH = this.message ? 20 : 0;
		this.reset();
		this.clearAt = this.clock + HOLD;
		this.next = this.clock;
	};

	/* 0x413300: back to the start of the program. */
	Turtle.prototype.reset = function () {
		this.pc = 0;
		this.turtles = [{ x: this.w >> 1, y: this.h >> 1, h: 0 }];
		this.centre = { x: this.turtles[0].x, y: this.turtles[0].y };
		this.pen = 1;
		this.colour = this.red;
		this.prog.forEach(function (c) {
			if (!c || c.op !== 'Loop') { return; }
			c.val = 0;
			if (c.mod === 'Rn') { c.x = rand(20) * 5; }
			if (c.mod === 'S1' || c.mod === 'S2') { c.x = 80; }
		});
		this.clearPending = true;
	};

	/* Hi and Lo: how far through the first Loop later on this line, 1-100. */
	Turtle.prototype.pct = function (mod) {
		var p = 50;
		for (var i = this.pc + 1; i % 12 !== 0 && i < this.prog.length; i += 1) {
			var c = this.prog[i];
			if (c && c.op === 'Loop') {
				p = c.x ? Math.trunc(c.val * 100 / c.x) : 100;
				break;
			}
		}
		p = Math.min(100, Math.max(1, p));
		return mod === 'Lo' ? 101 - p : p;
	};

	/* A size in pixels: steps, square and circle radius. */
	Turtle.prototype.size = function (c, min) {
		switch (c.mod) {
		case 'Nm': return c.val;
		case 'Hi': case 'Lo': return Math.max(min, Math.trunc(this.unit * this.pct(c.mod) * 5 / 100));
		case 'S1': case 'S2': return this.unit * 4;
		default: return this.roll * this.unit;
		}
	};

	Turtle.prototype.angle = function (c) {
		switch (c.mod) {
		case 'Nm': return c.val;
		case 'Hi': case 'Lo': return Math.max(1, Math.trunc(this.pct(c.mod) * 90 / 100));
		case 'S1': case 'S2': return 72;
		default: return this.roll * 18;
		}
	};

	Turtle.prototype.turn = function (t, c, sign) {
		if (c.mod === 'Nr') { t.h = 0; return; }
		t.h += sign * this.angle(c);
		if (t.h >= 360) { t.h -= 360; } else if (t.h < 0) { t.h += 360; }
	};

	Turtle.prototype.fill = function (x0, y0, x1, y1) {
		x0 = Math.max(0, x0); y0 = Math.max(0, y0);
		x1 = Math.min(this.w, x1); y1 = Math.min(this.h, y1);
		for (var y = y0; y < y1; y += 1) {
			this.pix.fill(this.colour, y * this.w + x0, y * this.w + Math.max(x0, x1));
		}
	};

	/* PaintOval in the rectangle l,t,r,b. */
	Turtle.prototype.oval = function (l, t, r, b) {
		var cx = (l + r) / 2, cy = (t + b) / 2, rx = (r - l) / 2, ry = (b - t) / 2;
		if (rx <= 0 || ry <= 0) { return; }
		for (var y = t; y < b; y += 1) {
			var dy = (y + 0.5 - cy) / ry;
			if (dy * dy > 1) { continue; }
			var dx = rx * Math.sqrt(1 - dy * dy);
			this.fill(Math.round(cx - dx), y, Math.round(cx + dx), y + 1);
		}
	};

	/* A QuickDraw line: the pen is a w x w square hanging below and right. */
	Turtle.prototype.line = function (x0, y0, x1, y1) {
		var w = this.pen;
		var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
		var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
		for (;;) {
			this.fill(x0, y0, x0 + w, y0 + w);
			if (x0 === x1 && y0 === y1) { break; }
			var e2 = 2 * err;
			if (e2 >= dy) { err += dy; x0 += sx; }
			if (e2 <= dx) { err += dx; y0 += sy; }
		}
	};

	Turtle.prototype.draw = function (t, c) {
		var a, d;
		switch (c.op) {
		case 'Move':
			d = this.size(c, 1);
			var r = t.h / 57.295779513;
			var nx = t.x + Math.trunc(Math.sin(r) * d);
			var ny = t.y - Math.trunc(Math.cos(r) * d);
			if (this.pen) { this.line(t.x, t.y, nx, ny); }
			t.x = nx; t.y = ny;
			break;
		case 'TrnR': this.turn(t, c, 1); break;
		case 'TrnL': this.turn(t, c, -1); break;
		case 'Sqre':
			a = this.size(c, 8);
			this.fill(t.x - a, t.y - a, t.x + a, t.y + a);
			break;
		case 'Circ':
			a = this.size(c, 8);
			this.oval(t.x - a, t.y - a, t.x + a + 1, t.y + a);
			break;
		}
	};

	Turtle.prototype.reflect = function (n) {
		var t0 = this.turtles[0];
		var step = Math.trunc(360 / n);
		this.centre = { x: t0.x, y: t0.y };
		this.turtles = [t0];
		for (var i = 1; i < n; i += 1) {
			this.turtles.push({ x: t0.x, y: t0.y, h: (i * step) % 360 + t0.h });
		}
	};

	Turtle.prototype.other = function (c) {
		var t0 = this.turtles[0];
		var n;
		switch (c.op) {
		case 'Posi':
			if (c.mod === 'Cn') {
				t0.x = this.w >> 1; t0.y = this.h >> 1;
			} else if (c.mod === 'Sv') {
				c.saved = { x: t0.x, y: t0.y, h: t0.h };
				return;
			} else if (c.mod === 'Rs') {
				var depth = 1;
				for (var i = this.pc - 1; i >= 0 && depth; i -= 1) {
					var s = this.prog[i];
					if (!s || s.op !== 'Posi') { continue; }
					if (s.mod === 'Sv') {
						depth -= 1;
						if (!depth && s.saved) { t0.x = s.saved.x; t0.y = s.saved.y; t0.h = s.saved.h; }
					} else if (s.mod === 'Rs') {
						depth += 1;
					}
				}
				return;
			} else {
				t0.x = rand(Math.max(1, this.w - 64)) + 32;
				t0.y = rand(Math.max(1, this.h - this.statusH - 64)) + this.statusH + 32;
				t0.h = 0;
			}
			if (this.turtles.length > 1) { this.reflect(this.turtles.length); }
			break;
		case 'Eras':
			this.pix.fill(0);
			this.erased = true;
			break;
		case 'PClr':
			if (c.mod === 'Hi') {
				this.colour += 1;
				if (this.colour >= 194) { this.colour = 33; }
			} else if (c.mod === 'Lo') {
				this.colour -= 1;
				if (this.colour < 33) { this.colour = 228; }
			} else if (c.mod === 'Co') {
				this.colour = c.val & 255;
			} else if (c.mod === 'S1' || c.mod === 'S2') {
				this.colour = this.blue;
			} else {
				this.colour = rand(194) + 33;
			}
			break;
		case 'PWid':
			if (c.mod === 'Nm') { this.pen = c.val; }
			else if (c.mod === 'Hi' || c.mod === 'Lo') { this.pen = Math.max(1, Math.trunc(this.pct(c.mod) * 6 / 100)); }
			else if (c.mod === 'S1' || c.mod === 'S2') { this.pen = 4; }
			else { this.pen = this.roll - 1; }
			break;
		case 'Loop':
			if (c.x === c.val || this.pc === 0) {
				c.val = 0;
			} else {
				c.val += 1;
				this.pc = Math.floor(this.pc / 12) * 12 - 1;
			}
			break;
		case 'Refl':
			if (c.mod === 'Nm') { n = Math.max(1, c.val); }
			else if (c.mod === 'Hi' || c.mod === 'Lo') { n = REFLECT[Math.min(9, Math.floor(this.pct(c.mod) / 11))]; }
			else if (c.mod === 'S1' || c.mod === 'S2') { n = REFLECT[3]; }
			else { n = REFLECT[this.roll]; }
			this.reflect(n);
			break;
		case 'Cycl':
			var first = this.pal[33];
			for (var k = 33; k < 228; k += 1) { this.pal[k] = this.pal[k + 1]; }
			this.pal[228] = first;
			this.palette();
			break;
		}
	};

	/* 0x413550: one icon. */
	Turtle.prototype.step = function () {
		var prog = this.prog;
		while (!prog[this.pc]) {
			this.pc += 1;
			if (this.pc >= prog.length) {
				/* Ran off the end on a blank: go round again on top, but
				   clear every two minutes unless the program erases. */
				var erased = this.erased;
				this.reset();
				this.clearPending = false;
				if (!erased && this.clearAt < this.clock) {
					this.clearPending = true;
					this.clearAt = this.clock + HOLD;
				}
				return;
			}
		}
		this.erased = false;
		this.roll = rand(6) + 1;
		var c = prog[this.pc];
		if (c.op === 'Move' || c.op === 'TrnR' || c.op === 'TrnL' || c.op === 'Sqre' || c.op === 'Circ') {
			for (var i = 0; i < this.turtles.length; i += 1) { this.draw(this.turtles[i], c); }
		} else {
			this.other(c);
		}
		this.dirty = true;
		this.pc += 1;
		if (this.pc >= prog.length) {
			/* Ran off the end on an icon: hold the picture two minutes. */
			var held = !this.erased;
			this.reset();
			if (held) { this.next = this.clock + HOLD; }
		}
	};

	Turtle.prototype.palette = function () {
		var p = this.pal;
		this.lut = new Uint32Array(256);
		var little = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
		for (var i = 0; i < 256; i += 1) {
			var c = p[i] || [0, 0, 0];
			this.lut[i] = little ? (0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0
				: ((c[0] << 24) | (c[1] << 16) | (c[2] << 8) | 0xff) >>> 0;
		}
		this.lut[0] = little ? 0xff000000 : 0x000000ff;
		this.dirty = true;
	};

	Turtle.prototype.render = function () {
		var out = new Uint32Array(this.img.data.buffer);
		var pix = this.pix, lut = this.lut;
		for (var i = 0, n = pix.length; i < n; i += 1) { out[i] = lut[pix[i]]; }
		this.og.putImageData(this.img, 0, 0);
	};

	Turtle.prototype.tick = function (dt, ctx, w, h) {
		if (!this.data || !this.pix) {
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);
			return;
		}
		this.clock += dt * 1000;
		var budget = 400;
		while (this.clock >= this.next && budget > 0) {
			budget -= 1;
			if (this.clearPending) {
				this.pix.fill(0);
				this.clearPending = false;
				this.dirty = true;
			}
			var at = this.next;
			this.step();
			if (this.next <= at) {
				this.next = at + Math.max(TICK, this.delay);
			}
		}
		if (budget <= 0) { this.next = this.clock; }
		if (this.dirty) {
			this.render();
			this.dirty = false;
		}
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(this.off, 0, 0, w, h);
		if (this.message) {
			ctx.font = '13px Arial, Helvetica, sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'top';
			ctx.fillStyle = '#fff';
			ctx.fillText(this.data.editMessage, Math.round(w / 2), 3);
			ctx.textAlign = 'left';
		}
	};

	AfterDark.define('after-dark-magic-turtle', function (el) {
		var t = new Turtle();
		t.delay = DELAY[AfterDark.choice(el, 'speed', SPEEDS, 'racehorse')];
		t.which = AfterDark.choice(el, 'display', DISPLAYS, 'program 1');
		t.message = AfterDark.flag(el, 'show-edit-message');
		AfterDark.data(AfterDark.setting(el, 'art') || 'art/turtle').then(function (data) {
			t.setData(data);
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return {
			resize: function (w, h) { t.resize(w, h); },
			step: function (dt, ctx, w, h) { t.tick(dt, ctx, w, h); }
		};
	});

	window.AfterDarkMagicTurtle = Turtle;
}());
