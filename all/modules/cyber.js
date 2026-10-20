/**
 * cyber.js - CYb3r W@t, a hacker's screen full of chatter.
 *
 * CYBER.AD's own description:
 *
 *   "Cyber what? "Color" allows you to select your favorite color or choose
 *    random and see them all."
 *   Programming by Mark Palange and Alan Kaiser. Art by Craig Foster and
 *   Jarir Maani. Sound by P.J. Sonnichsen.
 *
 * Its art, in all/art/cyber/: a man in goggles and a headset, eight poses of
 * three frames each at 320x240, all scan lines (3000-3007); the widgets
 * (3008): "download commencing" in a glowing pill, the digits 0 and 1 and
 * four-digit binary words flipping over, a crosshair, circles, a pentagon,
 * triangles, blinking dots, a barcode and boxes; "download failure", "download
 * success" and "unable to access network" pills (3009), and five black panels
 * (3009 #15-19) the chatter is typed into. 3500-3508 are a font: 180
 * characters, five times over - crisp, then fading, then smeared out.
 *
 * Like Hula Twins and Bad Dog!, it carries its own choreography: TYPE_8100
 * 3000-3002 and TYPE_8102 3000 (all/art/cyber/movie.json) place every widget
 * on a 640x480 stage, the man in the middle, tick by tick, in blocks - one
 * block per widget animation. The chatter is STRINGLIST 3000-3004
 * (all/art/cyber/text.json), 150 lines such as ">I alWays fEEL LikE
 * SomebOdy'S waTCHing Me", "SECURITY OVERRIDE", ">loGGing on 5634645DU566".
 *
 * Everything is drawn in one ramp of one colour; the four colours are the
 * module's PAL resources 3200-3203 (cyan, blue, amber, green), and the art -
 * stored cyan - is recoloured to them by brightness.
 *
 * What the capture shows and this does: the man appears bright behind
 * "download commencing" while the colours change, the pill breaks up and he
 * fades; then three or four widgets at a time play out in their places while
 * a line of chatter is typed into one of the panels and dissolves again.
 * Filled in: which list of chatter goes in which panel (from the capture:
 * the long ones in the tall left and right panels, the short capitals along
 * the bottom), how many widgets run at once, that the round ends after a
 * minute with one of the download pills and starts again, the typing speed,
 * and line breaks (a run of seven spaces or more, or a full panel). With
 * Random, each widget takes its own colour, as in the capture.
 *
 *   <after-dark-cyber art="art/cyber" color="random"></after-dark-cyber>
 */
(function () {
	'use strict';

	var COLORS = ['cyan', 'blue', 'amber', 'green', 'random'];
	var BASE = [[0, 255, 224], [0, 159, 255], [255, 205, 0], [0, 255, 82]];
	var TICK = 1 / 12;
	var FONT = [3500, 3501, 3502, 3503, 3504, 3505, 3506, 3507, 3508];
	var GLYPHS = 180;
	var LINE = 37;
	/* Blocks of the movie by what they are, by their first tick. */
	var FACE = [2, 17, 24, 33, 49, 61, 74, 88];
	var DOWNLOAD = 1965, BREAKUP = 1981, RESULTS = [1991, 2029, 2067];
	var PANELS = { 675: '3000', 887: '3002', 1845: '3001', 778: '3003', 1318: '3004' };
	var NOT_WIDGETS = [675, 778, 887, 1318, 1845, 1500, 1951, 1965, 1981, 1991, 2029, 2067].concat(FACE);

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	function recolour(image, rgb) {
		var c = document.createElement('canvas');
		c.width = image.width;
		c.height = image.height;
		var g = c.getContext('2d');
		g.drawImage(image, 0, 0);
		var d = g.getImageData(0, 0, c.width, c.height), p = d.data;
		for (var i = 0; i < p.length; i += 4) {
			if (!p[i + 3]) { continue; }
			var t = Math.max(p[i], p[i + 1], p[i + 2] * 255 / 224) / 255;
			p[i] = Math.round(t * rgb[0]);
			p[i + 1] = Math.round(t * rgb[1]);
			p[i + 2] = Math.round(t * rgb[2]);
		}
		g.putImageData(d, 0, 0);
		return c;
	}

	function Cyber() {
		this.colour = 4;
		this.movie = null;
		this.acc = 0;
	}

	Cyber.prototype.setArt = function (art, movie, text) {
		this.art = art;
		this.movie = movie;
		this.text = text;
		var self = this;
		/* Each strip in the four colours. */
		this.tints = {};
		Object.keys(art.sequences).forEach(function (id) {
			var img = art.sequences[id].image;
			self.tints[id] = BASE.map(function (rgb, k) { return k === 0 ? img : recolour(img, rgb); });
		});
		this.font = [];
		FONT.forEach(function (id) {
			var s = art.sequence(id);
			for (var i = 0; s && i < s.count; i += 1) { self.font.push({ id: String(id), f: s.frames[i] }); }
		});
		var ticks = Object.keys(movie.cues).map(Number).sort(function (a, b) { return a - b; });
		this.blocks = {};
		var start = ticks[0], prev = ticks[0];
		for (var i = 1; i <= ticks.length; i += 1) {
			if (i === ticks.length || ticks[i] !== prev + 1) {
				this.blocks[start] = { from: start, to: prev };
				start = ticks[i];
			}
			prev = ticks[i];
		}
		this.widgets = Object.keys(this.blocks).map(Number).filter(function (b) {
			return NOT_WIDGETS.indexOf(b) < 0;
		});
		this.round();
	};

	Cyber.prototype.tint = function () {
		return this.colour < 4 ? this.colour : Math.floor(Math.random() * 4);
	};

	/* A round: the man and "download commencing", the widgets and the
	   chatter, then how the download went. */
	Cyber.prototype.round = function () {
		this.phase = 'intro';
		this.time = 0;
		this.face = { b: 2, t: 2, alpha: 1, col: this.tint() };
		this.pill = { b: DOWNLOAD, t: DOWNLOAD, col: this.face.col, loops: 10 };
		this.channels = [];
		this.panel = null;
		this.panelWait = 2;
	};

	Cyber.prototype.play = function (b) {
		return { b: b, t: b, col: this.tint(), wait: 0 };
	};

	Cyber.prototype.tickFace = function () {
		var f = this.face, blk = this.blocks[f.b];
		if (f.t < blk.to) { f.t += 1; return; }
		/* The poses run into one another, 2 round to 88 and back to 2. */
		var i = FACE.indexOf(f.b);
		f.b = FACE[(i + 1) % FACE.length];
		f.t = f.b;
	};

	Cyber.prototype.tick = function () {
		var self = this;
		if (this.face) { this.tickFace(); }
		this.time += TICK;
		if (this.phase === 'intro') {
			var p = this.pill;
			if (p.t < this.blocks[p.b].to) { p.t += 1; } else if (p.b === DOWNLOAD && --p.loops > 0) {
				p.t = p.b;
				/* The colours go round while it waits. */
				if (this.colour === 4) { this.face.col = p.col = (p.col + 1 + Math.floor(Math.random() * 3)) % 4; }
			} else if (p.b === DOWNLOAD) {
				p.b = p.t = BREAKUP;
			} else {
				this.pill = null;
				this.phase = 'chatter';
				this.time = 0;
				this.channels = [0, 1, 2, 3].map(function (n) { return { wait: n * 0.8 + Math.random() }; });
			}
			return;
		}
		if (this.face && this.face.alpha > 0) {
			this.face.alpha = Math.max(0, this.face.alpha - TICK / 12);
			if (!this.face.alpha) { this.face = null; }
		}
		if (this.phase === 'chatter') {
			this.channels.forEach(function (c) {
				if (c.b === undefined) {
					c.wait -= TICK;
					if (c.wait <= 0) {
						var busy = self.channels.map(function (o) { return o.b; });
						var b = pick(self.widgets.filter(function (w) { return busy.indexOf(w) < 0; }));
						var n = self.play(b);
						c.b = n.b; c.t = n.t; c.col = n.col;
					}
				} else if (c.t < self.blocks[c.b].to) {
					c.t += 1;
				} else {
					c.b = undefined;
					c.wait = 0.3 + Math.random() * 1.5;
				}
			});
			this.tickPanel();
			if (this.time > 60 && !this.panel) {
				this.phase = 'result';
				this.channels = [];
				this.pill = this.play(pick(RESULTS));
			}
		} else if (this.phase === 'result') {
			var r = this.pill;
			if (r.t < this.blocks[r.b].to) { r.t += 1; } else { this.round(); }
		}
	};

	/* ------------------------------------------------------------- chatter --- */

	Cyber.prototype.tickPanel = function () {
		var p = this.panel;
		if (!p) {
			this.panelWait -= TICK;
			if (this.panelWait > 0 || this.time > 55) { return; }
			var b = Number(pick(Object.keys(PANELS)));
			var line = pick(this.text[PANELS[b]]);
			p = this.panel = this.play(b);
			p.lines = this.lay(line, b);
			p.typed = 0;
			p.total = p.lines.reduce(function (n, l) { return n + l.length; }, 0);
			return;
		}
		p.typed += 1;
		if (p.t < this.blocks[p.b].to) {
			p.t += 1;
		} else {
			this.panel = null;
			this.panelWait = 0.5 + Math.random() * 2;
		}
	};

	Cyber.prototype.width = function (s) {
		var w = 0;
		for (var i = 0; i < s.length; i += 1) {
			var g = this.font[s.charCodeAt(i) - 32];
			w += g ? g.f.w : 9;
		}
		return w;
	};

	/* Words run on with one space; a run of seven or more spaces, or the
	   edge of the panel, starts a new line. */
	Cyber.prototype.lay = function (text, b) {
		var c = this.movie.cues[b], s = this.movie.steps[c[0]][0];
		var fr = this.movie.frames[s[0]], seq = this.art.sequence(fr[0]);
		var pw = seq ? seq.frames[fr[1]].w : 600;
		var parts = text.split(/( +)/), lines = [''];
		for (var i = 0; i < parts.length; i += 1) {
			var part = parts[i];
			if (!part) { continue; }
			if (part[0] === ' ') {
				if (part.length >= 7) { lines.push(''); } else if (lines[lines.length - 1]) { lines[lines.length - 1] += ' '; }
				continue;
			}
			var cur = lines[lines.length - 1];
			if (cur && this.width(cur + part) > pw) { lines.push(cur = ''); }
			lines[lines.length - 1] = cur + part;
		}
		return lines.map(function (l) { return l.replace(/ +$/, ''); }).filter(Boolean);
	};

	Cyber.prototype.drawText = function (ctx, ox, oy) {
		var p = this.panel;
		if (!p) { return; }
		var c = this.movie.cues[p.b], s = this.movie.steps[c[0]][0];
		var x0 = ox + s[3] + c[1], y0 = oy + s[4] + c[2];
		var left = this.blocks[p.b].to - p.t, n = 0;
		for (var l = 0; l < p.lines.length; l += 1) {
			var x = x0, line = p.lines[l];
			for (var i = 0; i < line.length; i += 1, n += 1) {
				var code = line.charCodeAt(i) - 32;
				var g = this.font[code];
				if (!g) { continue; }
				/* Typed in through the smears, and smeared out again at the end. */
				var age = (p.typed * 3) - n;
				if (age < 0) { break; }
				var set = Math.max(0, 4 - age);
				if (left < 5) { set = Math.max(set, 4 - left); }
				var gl = this.font[set * GLYPHS + code] || g;
				ctx.drawImage(this.tints[gl.id][p.col], gl.f.x, gl.f.y, gl.f.w, gl.f.h, x, y0 + l * LINE, gl.f.w, gl.f.h);
				x += g.f.w;
			}
		}
	};

	/* ---------------------------------------------------------------- draw --- */

	Cyber.prototype.drawTick = function (ctx, t, col, ox, oy) {
		var c = this.movie.cues[t];
		if (!c) { return; }
		var st = this.movie.steps[c[0]];
		for (var i = 0; i < st.length; i += 1) {
			var fr = this.movie.frames[st[i][0]];
			var seq = fr && this.art.sequence(fr[0]);
			if (!seq) { continue; }
			var f = seq.frames[fr[1]];
			ctx.drawImage(this.tints[String(fr[0])][col], f.x, f.y, f.w, f.h,
				Math.round(ox + st[i][3] + c[1]), Math.round(oy + st[i][4] + c[2]), f.w, f.h);
		}
	};

	Cyber.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
	};

	Cyber.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.movie) { return; }
		this.acc += dt;
		while (this.acc >= TICK) {
			this.acc -= TICK;
			this.tick();
		}
		var s = Math.min(1, w / 640, h / 480);
		ctx.save();
		ctx.translate(Math.round(w / 2), Math.round(h / 2));
		ctx.scale(s, s);
		ctx.imageSmoothingEnabled = false;
		var ox = -320, oy = -240, self = this;
		if (this.face) {
			ctx.globalAlpha = this.face.alpha;
			this.drawTick(ctx, this.face.t, this.face.col, ox, oy);
			ctx.globalAlpha = 1;
		}
		this.channels.forEach(function (c) {
			if (c.b !== undefined) { self.drawTick(ctx, c.t, c.col, ox, oy); }
		});
		if (this.panel) {
			/* The panel is black: it clears its patch, then the words go on it. */
			this.drawTick(ctx, this.panel.t, this.panel.col, ox, oy);
			this.drawText(ctx, ox, oy);
		}
		if (this.pill) { this.drawTick(ctx, this.pill.t, this.pill.col, ox, oy); }
		ctx.restore();
	};

	AfterDark.define('after-dark-cyber', function (el) {
		var sim = new Cyber();
		sim.colour = AfterDark.choice(el, 'color', COLORS, 'random');
		var base = (AfterDark.setting(el, 'art') || 'art/cyber').replace(/\/$/, '');
		function json(name) {
			return fetch(base + '/' + name).then(function (r) { return r.json(); });
		}
		Promise.all([AfterDark.load(base), json('movie.json'), json('text.json')]).then(function (got) {
			sim.setArt(got[0], got[1], got[2]);
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkCyber = Cyber;
}());
