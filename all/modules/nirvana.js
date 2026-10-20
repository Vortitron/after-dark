/**
 * nirvana.js - Nirvana, an end in itself.
 *
 * NIRVANA.AD's own description:
 *
 *   "NIRVANA - An end in itself. 'Color' selects what texture to use.
 *    'Redraw Every:' controls how often the image is redrawn on the screen.
 *    'Activity' determines how frenetic the action is. 'Change Color'
 *    determines the rate of color cycling. Hit Caps Lock for a shot of
 *    flavor. Programming by Andy Karn."
 *
 * Its controls are Color (Smooth, Stripes, Contrast, Rainbow, Metal, Lines,
 * Enamel, Random), Redraw Every (3 to 60 min), Activity (Serene, Calm, Alert,
 * Busy, Frenetic) and Change Color (Never, Rarely, Often, Always); it only
 * ran in 256 colours. Defaults: Random, 10 min, Serene, Never.
 *
 * Checked against the real module under Wine (8-bit display, defaults) and a
 * trace of its GDI calls: it stamps one big filled ellipse after another -
 * 512 x 512 at 1024x768 to begin with - each in the next colour of its
 * palette, the ellipse sliding a pixel or two and changing shape between
 * stamps, so the stamps leave contour stripes behind them: small quatrefoils
 * at first, then eyes and lenses, then striped melons. Only the top-left
 * quarter of the screen is drawn; after each stamp it is copied (BitBlt) to
 * the other three quarters, so the screen is the same picture two by two.
 * The palette is animated (AnimatePalette) between stamps.
 * Still inferred: the colours - the 8-bit grab cannot show them, though the
 * trace shows one texture as a dark magenta ramp - the textures themselves,
 * and the path and shape changes of the ellipse, which here wander smoothly.
 * Caps Lock still changes texture.
 *   <after-dark-nirvana color="random" redraw-every="10 min" activity="serene" change-color="never">
 */
(function () {
	'use strict';

	var COLORS = ['smooth', 'stripes', 'contrast', 'rainbow', 'metal', 'lines', 'enamel', 'random'];
	var REDRAWS = ['3 min', '5 min', '10 min', '30 min', '60 min'];
	var MINUTES = [3, 5, 10, 30, 60];
	var ACTIVITIES = ['serene', 'calm', 'alert', 'busy', 'frenetic'];
	/* Stamps a second for each Activity. */
	var RATE = [30, 45, 60, 90, 130];
	var CHANGES = ['never', 'rarely', 'often', 'always'];
	/* Seconds between new textures for each Change Color; 0 is never. */
	var CYCLE = [0, 120, 30, 5];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function hsl(h, s, l) {
		s /= 100; l /= 100;
		var k = function (n) { return (n + h / 30) % 12; };
		var a = s * Math.min(l, 1 - l);
		var f = function (n) { return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); };
		return [f(0) * 255, f(8) * 255, f(4) * 255];
	}

	/** 256 colours for a texture. */
	function texture(name) {
		var out = [], base = rand(0, 360);
		for (var i = 0; i < 256; i += 1) {
			var t = i / 256, c;
			switch (name) {
			case 'smooth': c = hsl((base + t * 120) % 360, 70, 30 + 30 * Math.sin(t * Math.PI * 2) + 15); break;
			case 'stripes': c = hsl((base + Math.floor(t * 8) * 45) % 360, 80, (i % 32) < 16 ? 55 : 25); break;
			case 'contrast': c = (i % 32) < 16 ? [255, 255, 255] : [0, 0, 0]; break;
			case 'rainbow': c = hsl((t * 720) % 360, 100, 50); break;
			case 'metal':
				var v = 90 + 110 * Math.pow(Math.abs(Math.sin(t * Math.PI * 4)), 3);
				c = [v, v * 1.02, v * 1.08];
				break;
			case 'lines': c = (i % 24) < 4 ? hsl((base + t * 360) % 360, 100, 65) : [8, 8, 16]; break;
			default: /* enamel: deep glossy colour with a white sheen near the top of each band. */
				var band = i % 64;
				c = band > 56 ? [250, 250, 250] : hsl((base + Math.floor(i / 64) * 90) % 360, 85, 25 + band * 0.5);
			}
			out.push([Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]);
		}
		return out;
	}

	function Nirvana() {
		this.color = 'random';
		this.redraw = MINUTES[2] * 60;
		this.rate = RATE[0];
		this.cycle = CYCLE[0];
	}

	Nirvana.prototype.resize = function (w, h) {
		/* One quarter of the screen is drawn; the other three are copies. */
		this.scale = Math.max(1, Math.floor(Math.min(w, h) / 600));
		this.qw = Math.ceil(w / 2 / this.scale);
		this.qh = Math.ceil(h / 2 / this.scale);
		this.canvas = document.createElement('canvas');
		this.canvas.width = this.qw;
		this.canvas.height = this.qh;
		this.image = this.canvas.getContext('2d').createImageData(this.qw, this.qh);
		this.begin();
	};

	/** A wandering value: where it is, where it is heading, how fast. */
	function wander(lo, hi) {
		return { v: rand(lo, hi), to: rand(lo, hi), lo: lo, hi: hi };
	}

	function drift(o, k) {
		o.v += (o.to - o.v) * k;
		if (Math.abs(o.to - o.v) < (o.hi - o.lo) * 0.02) { o.to = rand(o.lo, o.hi); }
	}

	Nirvana.prototype.begin = function () {
		var qw = this.qw, qh = this.qh;
		this.index = new Uint8Array(qw * qh);
		this.flavour();
		this.offset = 0;
		this.age = 0;
		this.stamp = 0;
		this.due = 0;
		/* The ellipse starts a full screen-height circle at the right edge of the quarter. */
		this.cx = wander(0, qw); this.cx.v = qw;
		this.cy = wander(0, qh); this.cy.v = qh / 2;
		this.rx = wander(qw * 0.05, qw * 0.6); this.rx.v = qw / 2;
		this.ry = wander(qw * 0.05, qw * 0.6); this.ry.v = qw / 2;
	};

	Nirvana.prototype.flavour = function () {
		var name = this.color === 'random' || this.shot ? COLORS[Math.floor(Math.random() * 7)] : this.color;
		this.pal = texture(name);
	};

	/** Fill the ellipse, clipped to the quarter, with the next colour. */
	Nirvana.prototype.ellipse = function () {
		var qw = this.qw, qh = this.qh, idx = this.index;
		var cx = this.cx.v, cy = this.cy.v, rx = Math.max(1, this.rx.v), ry = Math.max(1, this.ry.v);
		var v = this.stamp % 255 + 1;
		this.stamp += 1;
		for (var y = Math.max(0, Math.ceil(cy - ry)); y <= Math.min(qh - 1, Math.floor(cy + ry)); y += 1) {
			var t = (y - cy) / ry, half = rx * Math.sqrt(Math.max(0, 1 - t * t));
			var a = Math.max(0, Math.round(cx - half)), b = Math.min(qw - 1, Math.round(cx + half));
			for (var x = a; x <= b; x += 1) { idx[y * qw + x] = v; }
		}
	};

	Nirvana.prototype.step = function (dt, ctx, w, h) {
		this.age += dt;
		if (this.age > this.redraw) { this.begin(); }
		this.due += this.rate * dt;
		while (this.due >= 1) {
			this.due -= 1;
			this.ellipse();
			/* A pixel or two between stamps, as traced. */
			drift(this.cx, 0.004); drift(this.cy, 0.004); drift(this.rx, 0.006); drift(this.ry, 0.006);
		}
		if (this.cycle) {
			this.since = (this.since || 0) + dt;
			if (this.since > this.cycle) { this.since = 0; this.flavour(); }
		}
		/* The palette turns between stamps. */
		this.offset = (this.offset + this.rate * dt * 0.5) % 255;
		var d = this.image.data, pal = this.pal, off = Math.floor(this.offset), idx = this.index;
		for (var n = 0; n < idx.length; n += 1) {
			var o = n * 4, k = idx[n];
			if (k) {
				var c = pal[(k - 1 + off) % 255 + 1];
				d[o] = c[0];
				d[o + 1] = c[1];
				d[o + 2] = c[2];
			} else {
				d[o] = d[o + 1] = d[o + 2] = 0;
			}
			d[o + 3] = 255;
		}
		this.canvas.getContext('2d').putImageData(this.image, 0, 0);
		ctx.imageSmoothingEnabled = false;
		var sw = this.qw * this.scale, sh = this.qh * this.scale;
		for (var j = 0; j < 2; j += 1) {
			for (var i = 0; i < 2; i += 1) { ctx.drawImage(this.canvas, i * sw, j * sh, sw, sh); }
		}
	};

	AfterDark.define('after-dark-nirvana', function (el) {
		var sim = new Nirvana();
		sim.color = COLORS[AfterDark.choice(el, 'color', COLORS, 'random')];
		sim.redraw = MINUTES[AfterDark.choice(el, 'redraw-every', REDRAWS, '10 min')] * 60;
		sim.rate = RATE[AfterDark.choice(el, 'activity', ACTIVITIES, 'serene')];
		sim.cycle = CYCLE[AfterDark.choice(el, 'change-color', CHANGES, 'never')];
		window.addEventListener('keydown', function (e) {
			if (e.key === 'CapsLock') {
				sim.shot = true;
				sim.flavour();
			}
		});
		return sim;
	});

	window.AfterDarkNirvana = Nirvana;
}());
