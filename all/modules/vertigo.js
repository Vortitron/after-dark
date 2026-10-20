/**
 * vertigo.js - Vertigo, tunnels set turning by colour alone.
 *
 * VERTIGO.AD ships no artwork. Its own description:
 *
 *   "VERTIGO (tm) 'Spiral Pitch' sets the tightness with which the spirals
 *    are drawn. 'Palette' sets the colors that are used to draw the shapes.
 *    'Delay' determines how long the color animation continues before a new
 *    figure is drawn for those with 256 color machines.
 *    Stingray Palette by Bill Stewart. Thanks to Jim Stewart for the shapes.
 *    Original concept by Jack Eastman."
 *
 * Its controls are Palette (Smooth, Random, Stingray), Spiral Pitch and Color
 * Speed (sliders, both at the top by default) and Delay (0 secs to 1 minute,
 * 5 secs by default).
 *
 * Checked against the real module under Wine (8-bit display, defaults): the
 * screen starts black and a figure appears at a random place every Delay -
 * a disc or a square, from about a twelfth to nearly half the screen's
 * height across, drawn in an instant as rings nested inside each other, the
 * inner rings drifting off-centre in one direction so the figure looks like
 * a tunnel seen slightly from the side. Figures pile up over each other and
 * the screen is not cleared (in 45 seconds of capture). The rings run
 * through the palette, smooth on the discs, in bands on the squares.
 * Still inferred: the colours. The 8-bit captures cannot show them (the
 * grab reads the pixels through the default colormap, not the module's
 * palette, and Wine does not animate it), so the palettes, and the colour
 * cycling that sets the tunnels moving, are from the description; Spiral
 * Pitch is taken as how many palette steps each ring moves on.
 *
 *   <after-dark-vertigo palette="stingray" pitch="tight" color-speed="fast" delay="5 secs">
 */
(function () {
	'use strict';

	var PALETTES = ['smooth', 'random', 'stingray'];
	var PITCHES = ['loose', 'medium', 'tight'];
	var PITCH = [1, 2, 3];
	var COLOR_SPEEDS = ['slow', 'medium', 'fast'];
	var CYCLE = [40, 110, 260];
	var DELAYS = ['0 secs', '1 second', '2 secs', '5 secs', '10 secs', '20 secs', '30 secs', '40 secs',
		'50 secs', '1 minute'];
	var WAIT = [0.25, 1, 2, 5, 10, 20, 30, 40, 50, 60];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function ramp(stops) {
		var out = [];
		for (var i = 0; i < 256; i += 1) {
			var f = i / 256 * stops.length, a = stops[Math.floor(f)], b = stops[(Math.floor(f) + 1) % stops.length];
			var k = f - Math.floor(f);
			out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);
		}
		return out;
	}

	/** 256 colours for a palette name. */
	function palette(name) {
		var out = [], i;
		if (name === 'stingray') {
			/* Dark and light bands, blue running through them. */
			for (i = 0; i < 256; i += 1) {
				var band = Math.floor(i / 16) % 2, t = (i % 16) / 16;
				var v = band ? 255 * Math.sin(t * Math.PI) : 40 * Math.sin(t * Math.PI);
				out.push([v * 0.55, v * 0.75, 90 + v * 0.65]);
			}
			return out;
		}
		if (name === 'random') {
			var stops = [];
			for (i = 0; i < 8; i += 1) { stops.push([rand(0, 255), rand(0, 255), rand(0, 255)]); }
			return ramp(stops);
		}
		for (i = 0; i < 256; i += 1) {
			var ang = i / 256 * Math.PI * 2;
			out.push([128 + 127 * Math.sin(ang), 128 + 127 * Math.sin(ang + 2.09), 128 + 127 * Math.sin(ang + 4.19)]);
		}
		return out;
	}

	function Vertigo() {
		this.palette = 'stingray';
		this.pitch = PITCH[2];
		this.cycle = CYCLE[2];
		this.wait = WAIT[3];
	}

	Vertigo.prototype.resize = function (w, h) {
		this.scale = Math.max(1, Math.floor(Math.min(w, h) / 600));
		this.bw = Math.ceil(w / this.scale);
		this.bh = Math.ceil(h / this.scale);
		this.canvas = document.createElement('canvas');
		this.canvas.width = this.bw;
		this.canvas.height = this.bh;
		this.image = this.canvas.getContext('2d').createImageData(this.bw, this.bh);
		/* Palette index per pixel; 0 stays black, the figures use 1-255. */
		this.index = new Uint8Array(this.bw * this.bh);
		this.colours = palette(this.palette);
		this.offset = 0;
		this.age = 0;
		this.figure();
	};

	/** A new figure: a disc or a square of nested rings, drifting off-centre. */
	Vertigo.prototype.figure = function () {
		var bw = this.bw, bh = this.bh, idx = this.index;
		var R = bh * rand(0.04, 0.22), cx = rand(0, bw), cy = rand(0, bh);
		var square = Math.random() < 0.35;
		var ang = rand(0, Math.PI * 2), drift = Math.random() < 0.3 ? 0 : rand(0.2, 0.7);
		/* Rings two pixels apart (at 768 lines); the squares' bands are wider. */
		var gap = Math.max(1, bh / 384) * (square ? 3 : 1);
		var step = this.pitch * (square ? 4 : 1), base = Math.floor(rand(0, 256));
		for (var k = 0, r = R; r > 0; k += 1, r -= gap) {
			var t = 1 - r / R, x0 = cx + Math.cos(ang) * drift * R * t, y0 = cy + Math.sin(ang) * drift * R * t;
			var v = (base + k * step) % 255 + 1;
			var top = Math.max(0, Math.floor(y0 - r)), bottom = Math.min(bh - 1, Math.ceil(y0 + r));
			for (var y = top; y <= bottom; y += 1) {
				var half = square ? r : Math.sqrt(Math.max(0, r * r - (y - y0) * (y - y0)));
				var left = Math.max(0, Math.round(x0 - half)), right = Math.min(bw - 1, Math.round(x0 + half));
				for (var x = left; x <= right; x += 1) { idx[y * bw + x] = v; }
			}
		}
		if (this.palette === 'random') { this.colours = palette('random'); }
		this.age = 0;
	};

	Vertigo.prototype.step = function (dt, ctx, w, h) {
		this.age += dt;
		if (this.age > this.wait) { this.figure(); }
		this.offset = (this.offset + this.cycle * dt) % 255;
		var d = this.image.data, idx = this.index, pal = this.colours, off = Math.floor(this.offset);
		for (var i = 0; i < idx.length; i += 1) {
			var o = i * 4, v = idx[i];
			if (v) {
				var c = pal[(v - 1 + off) % 255 + 1];
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
		ctx.drawImage(this.canvas, 0, 0, this.bw * this.scale, this.bh * this.scale);
	};

	AfterDark.define('after-dark-vertigo', function (el) {
		var sim = new Vertigo();
		sim.palette = PALETTES[AfterDark.choice(el, 'palette', PALETTES, 'stingray')];
		sim.pitch = PITCH[AfterDark.choice(el, 'pitch', PITCHES, 'tight')];
		sim.cycle = CYCLE[AfterDark.choice(el, 'color-speed', COLOR_SPEEDS, 'fast')];
		sim.wait = WAIT[AfterDark.choice(el, 'delay', DELAYS, '5 secs')];
		return sim;
	});

	window.AfterDarkVertigo = Vertigo;
	Vertigo.palette = palette;
}());
