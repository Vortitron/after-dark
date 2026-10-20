/**
 * messages40.js - Messages 4.0, the 1996 rewrite of After Dark's Messages.
 *
 * MESSAGES.AD's own description:
 *
 *   "Foggy Screen concept by After Dark Contest entrant Hajime Sano, Studio
 *    Harz Japan. "Duration" determines how long the message remains on your
 *    screen before it redraws. "Style" allows you to choose funky Fontasia,
 *    far-out Foggy Screen or a random choice of either one. Style changes
 *    after a couple of hours to prevent screen burn-in. "Message" allows you
 *    to use one of ours or choose "Custom" to display your own message."
 *   Programming by Scott Garcia. Art by Craig Foster and Bob Ting.
 *
 * Controls: Duration (Short, Medium, Long), Style (Fontasia, Foggy, Random)
 * and Message (Custom, Out To Lunch, Gone for the day, I Quit!, Be Right
 * Back, Gone for a caffeine fix, Random). The messages themselves are its
 * STRINGLIST 500, the last of them the custom one's default, "your message
 * here". `message` is one of those, or any other text to show your own.
 *
 * Both styles are scripts in the module (TYPE_8100/8102 map canvases, see
 * tools/README.md), decoded into all/art/messages-40/index.json:
 *
 *  - Fontasia: a 32x32 animated glyph per character, A-Z, 0-9 and
 *    punctuation (6500-6509), set one after another in a row at a random
 *    place on one of three dark patterned tiles (6510, 6511), each glyph
 *    looping its animation once a second. Each message moves on to the next
 *    tile.
 *  - Foggy Screen: a grey screen and a finger (6012-6025) that writes the
 *    message in the fog a stroke at a time, lower case, the letters
 *    (6000-6011) uncovered behind it as it goes.
 *
 * Timings are from captures of the module running: Fontasia sets a
 * character every 0.28 s, Foggy writes about twelve script steps a second
 * (two to four seconds a letter). Short holds the finished message about
 * three seconds (Fontasia) or five (Foggy) before it starts again somewhere
 * else.
 *
 * Filled in: Medium and Long are taken as three and ten times Short. Foggy
 * lines that would run off the screen wrap at a space, 100 pixels down, and
 * when the message is done the finger is simply drawn sliding away
 * downwards; the module's own exit was not decoded. Characters a style has
 * no picture for are left as gaps. Random style picks once per start; the
 * two-hour switch is not reproduced.
 *
 *   <after-dark-messages-40 art="art/messages-40" duration="short" style="random" message="random">
 */
(function () {
	'use strict';

	var DURATIONS = ['short', 'medium', 'long'];
	var HOLD = [1, 3, 10];
	var STYLES = ['fontasia', 'foggy', 'random'];
	var NAMES = ['custom', 'out to lunch', 'gone for the day', 'i quit!', 'be right back',
		'gone for a caffeine fix', 'random'];
	/* As the control panel truncates them. */
	var SHORT = { 'gone for the da': 2, 'gone for a caff': 5 };
	var FOG = '#666666';

	function rand(n) {
		return Math.floor(Math.random() * n);
	}

	function Messages() {
		this.art = null;
		this.data = null;
		this.t = 0;
	}

	Messages.prototype.item = function (ctx, it, x, y) {
		var seq = this.art.sequence(it[0]);
		if (!seq) { return; }
		var f = seq.frames[it[1]];
		if (!f) { return; }
		ctx.drawImage(seq.image, f.x, f.y, f.w, f.h, Math.round(x + it[2]), Math.round(y + it[3]), f.w, f.h);
	};

	Messages.prototype.text = function () {
		var d = this.data;
		if (this.which === 6) { return d.messages[rand(d.messages.length)]; }
		if (this.which === 0) { return this.custom || d.custom; }
		if (this.which > 0) { return d.messages[this.which - 1]; }
		return this.custom || d.custom;
	};

	Messages.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		if (this.data) { this.start(); }
	};

	Messages.prototype.start = function () {
		var msg = this.text();
		this.t = 0;
		this.done = 0;
		if (this.style === 'fontasia') {
			this.tile = ((this.tile === undefined ? -1 : this.tile) + 1) % 3;
			var chars = msg.toUpperCase().split('');
			var width = chars.length * 34;
			this.x = rand(Math.max(1, this.w - width - 20)) + 10;
			this.y = rand(Math.max(1, this.h - 52)) + 10;
			this.glyphs = chars.map(function (c, i) { return { c: c, at: i * 0.28 }; });
			this.finish = chars.length * 0.28;
			this.until = this.finish + 3 * this.hold;
		} else {
			this.paper = document.createElement('canvas');
			this.paper.width = Math.max(1, Math.round(this.w));
			this.paper.height = Math.max(1, Math.round(this.h));
			var g = this.paper.getContext('2d');
			g.fillStyle = FOG;
			g.fillRect(0, 0, this.paper.width, this.paper.height);
			this.layout(msg.toLowerCase());
			this.index = 0;
			this.stepAt = 0;
			this.leaving = null;
		}
	};

	/* Foggy: where each letter goes, wrapping at spaces. */
	Messages.prototype.layout = function (msg) {
		var chars = this.data.foggy.chars;
		var words = msg.split(' ');
		var lines = [[]], widths = [0];
		var max = this.w - 60;
		words.forEach(function (word) {
			var ww = 0;
			word.split('').forEach(function (c) { ww += chars[c] ? chars[c].advance : 30; });
			var line = lines.length - 1;
			if (lines[line].length && widths[line] + 30 + ww > max) {
				lines.push([]);
				widths.push(0);
				line += 1;
			} else if (lines[line].length) {
				widths[line] += 30;
				lines[line].push(' ');
			}
			word.split('').forEach(function (c) { lines[line].push(c); });
			widths[line] += ww;
		});
		var widest = Math.max.apply(null, widths);
		var x0 = rand(Math.max(1, this.w - widest - 40)) + 20;
		var y0 = rand(Math.max(1, this.h - lines.length * 100 - 130)) - 20;
		var queue = [];
		lines.forEach(function (line, li) {
			var x = x0;
			line.forEach(function (c) {
				if (chars[c]) { queue.push({ c: c, x: x, y: y0 + li * 100 }); }
				x += chars[c] ? chars[c].advance : 30;
			});
		});
		this.queue = queue;
	};

	Messages.prototype.fontasia = function (dt, ctx, w, h) {
		var bg = this.data.fontasia.backgrounds[this.tile];
		var seq = this.art.sequence(bg[0]);
		var f = seq.frames[bg[1]];
		for (var ty = 0; ty < h; ty += f.h) {
			for (var tx = 0; tx < w; tx += f.w) {
				ctx.drawImage(seq.image, f.x, f.y, f.w, f.h, tx, ty, f.w, f.h);
			}
		}
		var glyphs = this.data.fontasia.glyphs, self = this;
		this.glyphs.forEach(function (g, i) {
			if (self.t < g.at || !glyphs[g.c]) { return; }
			var frames = glyphs[g.c];
			var k = Math.floor((self.t - g.at) * frames.length) % frames.length;
			frames[k].forEach(function (it) { self.item(ctx, it, self.x + i * 34, self.y); });
		});
		if (this.t > this.until) { this.start(); }
	};

	Messages.prototype.foggy = function (dt, ctx, w, h) {
		var chars = this.data.foggy.chars, self = this;
		ctx.drawImage(this.paper, 0, 0);
		if (this.index < this.queue.length) {
			var q = this.queue[this.index];
			var steps = chars[q.c].steps;
			var k = 1 + Math.floor((this.t - this.stepAt) * 12);
			if (k >= steps.length) {
				/* Done: the letter goes into the fog for good. */
				var g = this.paper.getContext('2d');
				steps[0].forEach(function (it) { self.item(g, it, q.x, q.y); });
				this.last = { q: q, items: steps[steps.length - 1] };
				this.index += 1;
				this.stepAt = this.t;
				if (this.index >= this.queue.length) { this.leaving = this.t; }
				ctx.drawImage(this.paper, 0, 0);
				k = -1;
			}
			if (k >= 0) {
				steps[k].forEach(function (it) { self.item(ctx, it, q.x, q.y); });
			}
		} else if (this.last) {
			var drop = (this.t - this.leaving) * 400;
			this.last.items.forEach(function (it) {
				if (it[4] >= 4) { self.item(ctx, it, self.last.q.x, self.last.q.y + drop); }
			});
			if (this.t - this.leaving > 5 * this.hold) { this.start(); }
		} else if (this.t > 5 * this.hold) {
			this.start();
		}
	};

	Messages.prototype.step = function (dt, ctx, w, h) {
		if (!this.art || !this.data) {
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);
			return;
		}
		if (!this.glyphs && !this.paper) { this.start(); }
		this.t += dt;
		if (this.style === 'fontasia') { this.fontasia(dt, ctx, w, h); } else { this.foggy(dt, ctx, w, h); }
	};

	AfterDark.define('after-dark-messages-40', function (el) {
		var m = new Messages();
		m.hold = HOLD[AfterDark.choice(el, 'duration', DURATIONS, 'short')];
		var s = AfterDark.choice(el, 'style', STYLES, 'random');
		m.style = s === 2 ? (Math.random() < 0.5 ? 'fontasia' : 'foggy') : STYLES[s];
		var msg = AfterDark.setting(el, 'message');
		var key = msg === null ? 'random' : String(msg).toLowerCase().trim();
		m.which = NAMES.indexOf(key);
		if (m.which < 0 && SHORT[key]) { m.which = SHORT[key]; }
		if (m.which < 0) { m.custom = String(msg); m.which = -1; }
		var custom = AfterDark.setting(el, 'custom');
		if (custom) { m.custom = custom; }
		var base = AfterDark.setting(el, 'art') || 'art/messages-40';
		Promise.all([AfterDark.load(base), AfterDark.data(base)]).then(function (r) {
			m.art = r[0];
			m.data = r[1];
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return m;
	});

	window.AfterDarkMessages40 = Messages;
}());
