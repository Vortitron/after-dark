/**
 * vertigo.js - Vertigo, spirals set turning by colour alone.
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
 * Its controls are Palette (Smooth, Random, Stingray), Spiral Pitch, Color
 * Speed and Delay. The figure is drawn once, every pixel given a palette
 * index by its angle and distance from the middle, and never drawn again:
 * all the movement is the palette rotating under it, the way a 256-colour
 * card did it. The shapes vary in how many arms they have and whether they
 * go round in circles, squares or diamonds.
 *
 *   <after-dark-vertigo palette="smooth" pitch="medium" color-speed="medium" delay="20 secs">
 */
(function () {
	'use strict';

	var PALETTES = ['smooth', 'random', 'stingray'];
	var PITCHES = ['loose', 'medium', 'tight'];
	var PITCH = [0.6, 1.2, 2.4];
	var COLOR_SPEEDS = ['slow', 'medium', 'fast'];
	var CYCLE = [40, 110, 260];
	var DELAYS = ['5 secs', '10 secs', '20 secs', '30 secs', '1 minute'];
	var WAIT = [5, 10, 20, 30, 60];

	function rand(a, b) {
		return a + Math.random() * (b - a);
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
			for (i = 0; i < 6; i += 1) { stops.push([rand(0, 255), rand(0, 255), rand(0, 255)]); }
			for (i = 0; i < 256; i += 1) {
				var f = i / 256 * stops.length, a = stops[Math.floor(f)], b = stops[(Math.floor(f) + 1) % stops.length];
				var k = f - Math.floor(f);
				out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);
			}
			return out;
		}
		for (i = 0; i < 256; i += 1) {
			var ang = i / 256 * Math.PI * 2;
			out.push([128 + 127 * Math.sin(ang), 128 + 127 * Math.sin(ang + 2.09), 128 + 127 * Math.sin(ang + 4.19)]);
		}
		return out;
	}

	function Vertigo() {
		this.palette = 'smooth';
		this.pitch = PITCH[1];
		this.cycle = CYCLE[1];
		this.wait = WAIT[2];
	}

	Vertigo.prototype.resize = function (w, h) {
		this.scale = Math.max(1, Math.floor(Math.min(w, h) / 300));
		this.bw = Math.ceil(w / this.scale);
		this.bh = Math.ceil(h / this.scale);
		this.canvas = document.createElement('canvas');
		this.canvas.width = this.bw;
		this.canvas.height = this.bh;
		this.image = this.canvas.getContext('2d').createImageData(this.bw, this.bh);
		this.index = new Uint8Array(this.bw * this.bh);
		this.figure();
	};

	/** A new shape: arms, which way round, and what "round" means. */
	Vertigo.prototype.figure = function () {
		var bw = this.bw, bh = this.bh;
		var arms = 1 + Math.floor(Math.random() * 6);
		var metric = Math.floor(Math.random() * 3);
		var dir = Math.random() < 0.5 ? -1 : 1;
		var cx = bw / 2 + rand(-0.1, 0.1) * bw, cy = bh / 2 + rand(-0.1, 0.1) * bh;
		var pitch = this.pitch * rand(0.8, 1.25) * 256 / Math.log(2) / 3;
		for (var y = 0; y < bh; y += 1) {
			for (var x = 0; x < bw; x += 1) {
				var dx = x - cx, dy = y - cy;
				var r = metric === 0 ? Math.sqrt(dx * dx + dy * dy)
					: metric === 1 ? Math.max(Math.abs(dx), Math.abs(dy)) : (Math.abs(dx) + Math.abs(dy)) * 0.7;
				var a = Math.atan2(dy, dx) / (Math.PI * 2) * 256 * arms * dir;
				this.index[y * bw + x] = (Math.round(a + pitch * Math.log(r + 1)) % 256 + 256) % 256;
			}
		}
		this.colours = palette(this.palette);
		this.offset = 0;
		this.age = 0;
	};

	Vertigo.prototype.step = function (dt, ctx, w, h) {
		this.age += dt;
		if (this.age > this.wait) { this.figure(); }
		this.offset = (this.offset + this.cycle * dt) % 256;
		var d = this.image.data, idx = this.index, pal = this.colours, off = Math.floor(this.offset);
		for (var i = 0; i < idx.length; i += 1) {
			var c = pal[(idx[i] + off) & 255], o = i * 4;
			d[o] = c[0];
			d[o + 1] = c[1];
			d[o + 2] = c[2];
			d[o + 3] = 255;
		}
		this.canvas.getContext('2d').putImageData(this.image, 0, 0);
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(this.canvas, 0, 0, this.bw * this.scale, this.bh * this.scale);
	};

	AfterDark.define('after-dark-vertigo', function (el) {
		var sim = new Vertigo();
		sim.palette = PALETTES[AfterDark.choice(el, 'palette', PALETTES, 'smooth')];
		sim.pitch = PITCH[AfterDark.choice(el, 'pitch', PITCHES, 'medium')];
		sim.cycle = CYCLE[AfterDark.choice(el, 'color-speed', COLOR_SPEEDS, 'medium')];
		sim.wait = WAIT[AfterDark.choice(el, 'delay', DELAYS, '20 secs')];
		return sim;
	});

	window.AfterDarkVertigo = Vertigo;
	Vertigo.palette = palette;
}());
