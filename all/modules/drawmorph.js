/**
 * drawmorph.js - DrawMorph, one line drawing turning into the next.
 *
 * WMORPH.AD's own description:
 *
 *   "DRAWMORPH - DrawMorph will morph one image to another. Draw your own or
 *    check out the ones we've included. The pop-up menu selects a morph to be
 *    displayed or edited. 'Speed' determines the rate of morphing; the faster
 *    your machine, the smoother the morphing. Original concept by E. Inada.
 *    Programming by the Strike Team & J. Dorfman. Morphs by Jan Konopasek."
 *
 * The morphs are the MORPH*.DAT files beside the module, which are text: a
 * list of frames, each a few coloured polylines. Clock, Pipecleaner Man, The
 * Athletes, Underwater, Ribit and All Aboard are Jan Konopasek's; My First
 * Morph is the scribble the three blank slots started with. tools/adtext.py
 * puts them in all/art/wmorph/. Each line is stretched onto its partner in
 * the next frame; a line with no partner shrinks to nothing or grows out of
 * one. Clock is the digits and a colon, and shows the time, each digit
 * morphing into the next as it changes. Speed is Jerky, Stuttered, Fairly
 * Smooth or Smoother - how many steps a morph is drawn in.
 *
 * Checked against the module running (8-bit capture, default settings, and
 * Pipecleaner Man): a morph is drawn at its own size, in one-pixel lines -
 * the clock is h:mm:ss, eight 35x58 cells 40 px apart, about 300 px across -
 * and the drawing bounces about the screen on the diagonals, off every edge.
 * The defaults are Clock and Stuttered (the slider sits at 49). Under Wine it
 * ran unthrottled, so how fast it travels and morphs here is a choice; Random
 * is this port's addition, not one of the module's morphs.
 *
 *   <after-dark-drawmorph art="art/wmorph" morph="clock" speed="stuttered">
 */
(function () {
	'use strict';

	var MORPHS = ['clock', 'pipecleaner man', 'the athletes', 'underwater', 'ribit', 'all aboard', 'my first morph', 'random'];
	var SPEEDS = ['jerky', 'stuttered', 'fairly smooth', 'smoother'];
	var STEPS = [4, 8, 16, 0];
	var MORPH_TIME = 1.6;
	var HOLD = 1.2;
	/* How fast the drawing travels, along each axis, in px a second. */
	var DRIFT = 90;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	/** A polyline as n points spaced evenly along its length. */
	function resample(flat, n) {
		var pts = [], i;
		for (i = 0; i < flat.length; i += 2) { pts.push([flat[i], flat[i + 1]]); }
		if (pts.length === 1) {
			var one = [];
			for (i = 0; i < n; i += 1) { one.push(pts[0][0], pts[0][1]); }
			return one;
		}
		var lens = [0];
		for (i = 1; i < pts.length; i += 1) {
			lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
		}
		var total = lens[lens.length - 1] || 1, out = [], j = 1;
		for (i = 0; i < n; i += 1) {
			var at = total * i / (n - 1);
			while (j < lens.length - 1 && lens[j] < at) { j += 1; }
			var span = lens[j] - lens[j - 1] || 1, k = (at - lens[j - 1]) / span;
			out.push(pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * k, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * k);
		}
		return out;
	}

	function centre(flat) {
		var x = 0, y = 0, n = flat.length / 2;
		for (var i = 0; i < flat.length; i += 2) { x += flat[i]; y += flat[i + 1]; }
		return [x / n, y / n];
	}

	/** Frame a part-way to frame b: a list of {rgb, pts, dot}. */
	function between(a, b, t) {
		var n = Math.max(a.length, b.length), out = [];
		for (var i = 0; i < n; i += 1) {
			var sa = a[i], sb = b[i];
			var pa = sa ? sa.pts : null, pb = sb ? sb.pts : null;
			if (!pa) { var c = centre(pb); pa = [c[0], c[1]]; }
			if (!pb) { var d = centre(pa); pb = [d[0], d[1]]; }
			var m = Math.max(pa.length, pb.length) / 2, ra = resample(pa, Math.max(2, m)), rb = resample(pb, Math.max(2, m));
			var pts = [];
			for (var k = 0; k < ra.length; k += 1) { pts.push(ra[k] + (rb[k] - ra[k]) * t); }
			var ca = (sa || sb).rgb, cb = (sb || sa).rgb;
			out.push({
				rgb: [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t],
				pts: pts, dot: (sa ? sa.pts.length : 2) <= 2 && (sb ? sb.pts.length : 2) <= 2
			});
		}
		return out;
	}

	function DrawMorph() {
		this.morph = 'clock';
		this.steps = STEPS[1];
		this.data = null;
	}

	DrawMorph.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		/* Drawn at its own size, as on a 1024x768 screen; bigger only on a big one. */
		this.k = Math.max(1, Math.floor(Math.min(w, h) / 768));
		this.x = null;
		this.vx = (Math.random() < 0.5 ? -1 : 1) * DRIFT;
		this.vy = (Math.random() < 0.5 ? -1 : 1) * DRIFT;
		this.start();
	};

	/** Move the drawing's box (bw x bh) on, bouncing off the edges; its top left. */
	DrawMorph.prototype.travel = function (dt, bw, bh) {
		var w = this.w, h = this.h;
		if (this.x === null) {
			this.x = rand(0, Math.max(0, w - bw));
			this.y = rand(0, Math.max(0, h - bh));
		}
		this.x += this.vx * this.k * dt;
		this.y += this.vy * this.k * dt;
		if (this.x < 0) { this.x = 0; this.vx = Math.abs(this.vx); }
		if (this.y < 0) { this.y = 0; this.vy = Math.abs(this.vy); }
		if (this.x + bw > w) { this.x = Math.max(0, w - bw); this.vx = -Math.abs(this.vx); }
		if (this.y + bh > h) { this.y = Math.max(0, h - bh); this.vy = -Math.abs(this.vy); }
		return [Math.round(this.x), Math.round(this.y)];
	};

	DrawMorph.prototype.start = function () {
		this.current = this.morph === 'random' ? MORPHS[1 + Math.floor(Math.random() * 6)] : this.morph;
		this.frame = 0;
		this.t = 0;
		this.shown = 0;
		this.digits = null;
	};

	DrawMorph.prototype.stroke = function (ctx, segs, ox, oy, k) {
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.lineWidth = k;
		for (var i = 0; i < segs.length; i += 1) {
			var s = segs[i], c = 'rgb(' + Math.round(s.rgb[0]) + ',' + Math.round(s.rgb[1]) + ',' + Math.round(s.rgb[2]) + ')';
			if (s.dot) {
				ctx.fillStyle = c;
				ctx.beginPath();
				ctx.arc(ox + s.pts[0] * k, oy + s.pts[1] * k, k, 0, Math.PI * 2);
				ctx.fill();
				continue;
			}
			ctx.strokeStyle = c;
			ctx.beginPath();
			for (var p = 0; p < s.pts.length; p += 2) {
				var x = ox + s.pts[p] * k, y = oy + s.pts[p + 1] * k;
				if (p) { ctx.lineTo(x, y); } else { ctx.moveTo(x, y); }
			}
			ctx.stroke();
		}
	};

	/** How far through a morph, in the steps Speed allows. */
	DrawMorph.prototype.stepped = function (t) {
		return this.steps ? Math.floor(t * this.steps) / this.steps : t;
	};

	DrawMorph.prototype.clock = function (dt, ctx, w, h) {
		var m = this.data.morphs.clock, frames = m.frames;
		var now = new Date(), hr = now.getHours() % 12 || 12;
		var text = (hr < 10 ? ' ' + hr : String(hr)) + ':' + ('0' + now.getMinutes()).slice(-2) +
			':' + ('0' + now.getSeconds()).slice(-2);
		if (!this.digits) { this.digits = text.split('').map(function (c) { return { from: c, to: c, t: 1 }; }); }
		/* The cells are 35 wide and stand 40 apart. */
		var dw = m.size[0] + 5, dh = m.size[1], k = this.k;
		var at = this.travel(dt, (dw * text.length - 5) * k, dh * k), ox = at[0], oy = at[1];
		for (var i = 0; i < text.length; i += 1) {
			var d = this.digits[i], c = text.charAt(i);
			if (d.to !== c) { d.from = d.to; d.to = c; d.t = 0; }
			d.t = Math.min(1, d.t + dt / MORPH_TIME);
			var index = function (ch) { return ch === ':' ? 10 : ch === ' ' ? -1 : Number(ch); };
			var fa = index(d.from) < 0 ? [] : frames[index(d.from)], fb = index(d.to) < 0 ? [] : frames[index(d.to)];
			this.stroke(ctx, between(fa, fb, this.stepped(d.t)), ox + i * dw * k, oy, k);
		}
	};

	DrawMorph.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.data) { return; }
		if (this.current === 'clock') {
			this.clock(dt, ctx, w, h);
			return;
		}
		var m = this.data.morphs[this.current], frames = m.frames, k = this.k;
		var at = this.travel(dt, m.size[0] * k, m.size[1] * k), ox = at[0], oy = at[1];
		if (this.shown < HOLD) {
			this.shown += dt;
			this.stroke(ctx, between(frames[this.frame], frames[this.frame], 0), ox, oy, k);
			return;
		}
		this.t += dt / MORPH_TIME;
		var next = (this.frame + 1) % frames.length;
		if (this.t >= 1) {
			this.frame = next;
			this.t = 0;
			this.shown = 0;
			/* Random moves on to another morph after going once round. */
			if (this.frame === 0 && this.morph === 'random') { this.start(); }
			return;
		}
		this.stroke(ctx, between(frames[this.frame], frames[next], this.stepped(this.t)), ox, oy, k);
	};

	AfterDark.define('after-dark-drawmorph', function (el) {
		var sim = new DrawMorph();
		sim.morph = MORPHS[AfterDark.choice(el, 'morph', MORPHS, 'clock')];
		sim.steps = STEPS[AfterDark.choice(el, 'speed', SPEEDS, 'stuttered')];
		AfterDark.data(AfterDark.setting(el, 'art') || 'art/wmorph').then(function (d) {
			sim.data = d;
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkDrawMorph = DrawMorph;
	DrawMorph.between = between;
	DrawMorph.resample = resample;
}());
