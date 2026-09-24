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
 *   <after-dark-spin-brush art="art/spin" switch-every="1 min." thickness="3" spin="random">
 */
(function () {
	'use strict';

	var SWITCHES = ['15 sec.', '30 sec.', '1 min.', '2 min.', '5 min.', '10 min.', '30 min.', 'never'];
	var SECONDS = [15, 30, 60, 120, 300, 600, 1800, Infinity];
	var THICKNESSES = ['1', '2', '3', '4', 'variable'];
	var SPINS = ['spin', 'spiral', 'star', 'stretch', 'random'];
	/* 103 and 205 are plain noise, which smears to grey; the rest have something to smear. */
	var PATTERNS = ['100', '200', '203', '204'];
	var DABS = 1500;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function SpinBrush() {
		this.every = 60;
		this.thick = 3;
		this.useScreen = false;
		this.spin = 4;
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
	};

	SpinBrush.prototype.step = function (dt, ctx, w, h) {
		this.age += dt;
		if (this.age > this.every) { this.fresh(); }
		var g = this.canvas.getContext('2d'), s = Math.max(1, Math.round(Math.min(w, h) / 400));
		var cx = this.cx, cy = this.cy;
		var dabs = Math.round(DABS * Math.min(3, w * h / 300000));
		for (var i = 0; i < dabs; i += 1) {
			var t = (this.thick || Math.floor(rand(1, 6))) * s;
			var x = rand(0, w), y = rand(0, h), dx = x - cx, dy = y - cy, r = Math.sqrt(dx * dx + dy * dy) || 1;
			var nx, ny;
			if (this.mode === 0) {
				/* Spin: round the centre. */
				nx = x - dy / r * 2 * s;
				ny = y + dx / r * 2 * s;
			} else if (this.mode === 1) {
				/* Spiral: round and in. */
				nx = x - dy / r * 2 * s - dx / r * 0.8 * s;
				ny = y + dx / r * 2 * s - dy / r * 0.8 * s;
			} else if (this.mode === 2) {
				/* Star: straight out. */
				nx = x + dx / r * 2 * s;
				ny = y + dy / r * 2 * s;
			} else {
				/* Stretch: sideways, away from the middle line. */
				nx = x + (dx > 0 ? 2 : -2) * s;
				ny = y;
			}
			g.drawImage(this.canvas, x, y, t, t, nx, ny, t, t);
		}
		ctx.drawImage(this.canvas, 0, 0, w, h);
	};

	AfterDark.define('after-dark-spin-brush', function (el) {
		var sim = new SpinBrush();
		sim.every = SECONDS[AfterDark.choice(el, 'switch-every', SWITCHES, '1 min.')];
		var thick = THICKNESSES[AfterDark.choice(el, 'thickness', THICKNESSES, '3')];
		sim.thick = thick === 'variable' ? 0 : Number(thick);
		sim.useScreen = AfterDark.flag(el, 'use-screen');
		sim.spin = AfterDark.choice(el, 'spin', SPINS, 'random');
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
