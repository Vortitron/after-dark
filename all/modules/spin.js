/**
 * spin.js - Spin Brush, smearing the screen like wet paint.
 *
 * SPIN.AD's own description:
 *
 *   "SPIN BRUSH (tm) smears points on the screen like a wet brush on paper.
 *    The 'Switch Every' slider sets when a new pattern is drawn. The
 *    'Thickness' slider sets the brush thickness (in pixels). The 'Use
 *    Screen' checkbox sets whether Spin Brush smears the screen or a pattern.
 *    The 'Spin' menu controls the type of smearing."
 *
 * Spin is Spin, Spiral, Star, Stretch or Random. The patterns it smears are
 * its own ten bitmaps - tiles, noise, a flower, a mossy rock - in
 * all/art/spin/; with Use Screen on it smears the desktop instead. The brush
 * picks up a dab of paint and puts it down a little way round, or out, from
 * where it found it, thousands of times, and the picture runs.
 *
 * Checked against SPIN.AD under Wine (8-bit, 1024x768, defaults): Spin, the
 * default (the menu rests on its first entry), turns the whole pattern round
 * one centre, off the middle of the screen, and the smears are arcs whose
 * length grows with the distance out - the pattern's own tiles still show,
 * barely smeared, at the centre, and the edges are long streaks. So a dab is
 * carried round by a fixed angle, not a fixed distance. The screen is
 * covered in rings within a few seconds. Still inferred: the angle, the
 * dab count, Spiral/Star/Stretch (not captured), and the Switch Every and
 * Thickness defaults read off the panel: a labelled slider's value is the
 * first label whose position is at or above it (18 -> "30 sec.", 30 -> "2"),
 * the rule that gives Artist's Delay and Worms' Wiggle as seen. Colours in the
 * 8-bit capture are not to be trusted; the patterns are the module's DIBs.
 *
 *   <after-dark-spin-brush art="art/spin" switch-every="30 sec." thickness="2" spin="spin">
 */
(function () {
	'use strict';

	var SWITCHES = ['15 sec.', '30 sec.', '1 min.', '2 min.', '5 min.', '10 min.', '30 min.', 'never'];
	var SECONDS = [15, 30, 60, 120, 300, 600, 1800, Infinity];
	var THICKNESSES = ['1', '2', '3', '4', 'variable'];
	var SPINS = ['spin', 'spiral', 'star', 'stretch', 'random'];
	/* 103 and 205 are plain noise, which smears to grey; the rest have something to smear. */
	var PATTERNS = ['100', '200', '203', '204'];
	var DABS = 6000;
	/* Radians a dab is carried round the centre. */
	var TURN = 0.04;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function SpinBrush() {
		this.every = 30;
		this.thick = 2;
		this.useScreen = false;
		this.spin = 0;
		this.art = null;
	}

	SpinBrush.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.canvas = document.createElement('canvas');
		this.canvas.width = Math.max(1, Math.round(w));
		this.canvas.height = Math.max(1, Math.round(h));
		this.fresh();
	};

	SpinBrush.prototype.fresh = function () {
		var g = this.canvas.getContext('2d'), w = this.w, h = this.h;
		if (this.useScreen || !this.art) {
			g.drawImage(AfterDark.desktop(w, h), 0, 0);
		} else {
			var tile = this.art.bitmap(PATTERNS[Math.floor(Math.random() * PATTERNS.length)]).image;
			var s = Math.max(1, Math.round(Math.min(w, h) / 400));
			g.imageSmoothingEnabled = false;
			for (var y = 0; y < h; y += tile.height * s) {
				for (var x = 0; x < w; x += tile.width * s) { g.drawImage(tile, x, y, tile.width * s, tile.height * s); }
			}
		}
		this.mode = this.spin === 4 ? Math.floor(Math.random() * 4) : this.spin;
		this.cx = rand(w * 0.3, w * 0.7);
		this.cy = rand(h * 0.3, h * 0.7);
		this.age = 0;
		this.px = null;
	};

	/* The brush works on the pixels themselves: thousands of dabs a frame. */
	SpinBrush.prototype.grab = function () {
		var g = this.canvas.getContext('2d');
		this.image = g.getImageData(0, 0, this.canvas.width, this.canvas.height);
		this.px = new Uint32Array(this.image.data.buffer);
	};

	SpinBrush.prototype.step = function (dt, ctx, w, h) {
		this.age += dt;
		if (this.age > this.every) { this.fresh(); }
		if (!this.px) { this.grab(); }
		var px = this.px, W = this.image.width, H = this.image.height;
		var s = Math.max(1, Math.round(Math.min(w, h) / 400));
		var cx = this.cx, cy = this.cy, mode = this.mode;
		var cos = Math.cos(TURN), sin = Math.sin(TURN);
		var dabs = Math.round(DABS * Math.min(3, w * h / 300000));
		for (var i = 0; i < dabs; i += 1) {
			var t = (this.thick || Math.floor(rand(1, 6))) * s;
			var x = Math.floor(Math.random() * (W - t)), y = Math.floor(Math.random() * (H - t));
			var dx = x - cx, dy = y - cy, nx, ny;
			if (mode === 0) {
				/* Spin: the dab goes round the centre by a fixed angle, so the
				   smears are short near the middle and long out at the edges. */
				nx = cx + dx * cos - dy * sin;
				ny = cy + dx * sin + dy * cos;
			} else if (mode === 1) {
				/* Spiral: round, and in a little. */
				nx = cx + (dx * cos - dy * sin) * 0.98;
				ny = cy + (dx * sin + dy * cos) * 0.98;
			} else if (mode === 2) {
				/* Star: straight out. */
				nx = cx + dx * 1.03;
				ny = cy + dy * 1.03;
			} else {
				/* Stretch: sideways, away from the middle line. */
				nx = cx + dx * 1.03;
				ny = y;
			}
			nx = Math.round(nx);
			ny = Math.round(ny);
			if (nx < 0 || ny < 0 || nx > W - t || ny > H - t) { continue; }
			for (var r = 0; r < t; r += 1) {
				var from = (y + r) * W + x, to = (ny + r) * W + nx;
				for (var c = 0; c < t; c += 1) { px[to + c] = px[from + c]; }
			}
		}
		this.canvas.getContext('2d').putImageData(this.image, 0, 0);
		ctx.drawImage(this.canvas, 0, 0, w, h);
	};

	AfterDark.define('after-dark-spin-brush', function (el) {
		var sim = new SpinBrush();
		sim.every = SECONDS[AfterDark.choice(el, 'switch-every', SWITCHES, '30 sec.')];
		var thick = THICKNESSES[AfterDark.choice(el, 'thickness', THICKNESSES, '2')];
		sim.thick = thick === 'variable' ? 0 : Number(thick);
		sim.useScreen = AfterDark.flag(el, 'use-screen');
		sim.spin = AfterDark.choice(el, 'spin', SPINS, 'spin');
		AfterDark.load(AfterDark.setting(el, 'art') || 'art/spin').then(function (art) {
			sim.art = art;
			if (!sim.useScreen && sim.w) { sim.fresh(); }
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkSpinBrush = SpinBrush;
}());
