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
 * ran in 256 colours. Nothing else survives about how it looked, so this is
 * built from those: slow brushes wander the screen laying down palette
 * indices, each stroke lifting whatever is under it a step, so the strokes
 * build up into contoured layers; the texture is the palette those indices
 * run through, and Change Color turns it. Caps Lock still changes texture.
 *
 *   <after-dark-nirvana color="random" redraw-every="5 min" activity="calm" change-color="often">
 */
(function () {
	'use strict';

	var COLORS = ['smooth', 'stripes', 'contrast', 'rainbow', 'metal', 'lines', 'enamel', 'random'];
	var REDRAWS = ['3 min', '5 min', '10 min', '30 min', '60 min'];
	var MINUTES = [3, 5, 10, 30, 60];
	var ACTIVITIES = ['serene', 'calm', 'alert', 'busy', 'frenetic'];
	var BRUSHES = [3, 5, 8, 12, 18];
	var PACE = [15, 30, 55, 90, 150];
	var CHANGES = ['never', 'rarely', 'often', 'always'];
	var CYCLE = [0, 4, 20, 70];

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
		this.redraw = MINUTES[1] * 60;
		this.brushes = BRUSHES[1];
		this.pace = PACE[1];
		this.cycle = CYCLE[2];
	}

	Nirvana.prototype.resize = function (w, h) {
		this.scale = Math.max(2, Math.floor(Math.min(w, h) / 300));
		this.bw = Math.ceil(w / this.scale);
		this.bh = Math.ceil(h / this.scale);
		this.canvas = document.createElement('canvas');
		this.canvas.width = this.bw;
		this.canvas.height = this.bh;
		this.image = this.canvas.getContext('2d').createImageData(this.bw, this.bh);
		this.begin();
	};

	Nirvana.prototype.begin = function () {
		this.index = new Uint8Array(this.bw * this.bh);
		this.flavour();
		this.offset = 0;
		this.age = 0;
		this.painters = [];
		for (var i = 0; i < this.brushes; i += 1) {
			this.painters.push({ x: rand(0, this.bw), y: rand(0, this.bh), a: rand(0, Math.PI * 2), turn: 0,
				r: rand(4, 14), lift: 1 + Math.floor(rand(0, 3)) });
		}
	};

	Nirvana.prototype.flavour = function () {
		var name = this.color === 'random' || this.shot ? COLORS[Math.floor(Math.random() * 7)] : this.color;
		this.pal = texture(name);
	};

	Nirvana.prototype.step = function (dt, ctx, w, h) {
		this.age += dt;
		if (this.age > this.redraw) { this.begin(); }
		var bw = this.bw, bh = this.bh, idx = this.index;
		for (var i = 0; i < this.painters.length; i += 1) {
			var p = this.painters[i];
			p.turn += rand(-2, 2) * dt;
			p.turn *= Math.pow(0.5, dt);
			p.a += p.turn * dt;
			p.x += Math.cos(p.a) * this.pace * dt;
			p.y += Math.sin(p.a) * this.pace * dt;
			/* Round the edges, like the screen was a bowl. */
			p.x = (p.x + bw) % bw;
			p.y = (p.y + bh) % bh;
			var r = p.r, r2 = r * r;
			for (var dy = -r; dy <= r; dy += 1) {
				for (var dx = -r; dx <= r; dx += 1) {
					if (dx * dx + dy * dy > r2) { continue; }
					var x = Math.floor(p.x + dx), y = Math.floor(p.y + dy);
					x = (x + bw) % bw;
					y = (y + bh) % bh;
					var k = y * bw + x;
					idx[k] = (idx[k] + p.lift) & 255;
				}
			}
		}
		this.offset = (this.offset + this.cycle * dt) % 256;
		var d = this.image.data, pal = this.pal, off = Math.floor(this.offset);
		for (var n = 0; n < idx.length; n += 1) {
			var c = pal[(idx[n] + off) & 255], o = n * 4;
			d[o] = c[0];
			d[o + 1] = c[1];
			d[o + 2] = c[2];
			d[o + 3] = 255;
		}
		this.canvas.getContext('2d').putImageData(this.image, 0, 0);
		ctx.imageSmoothingEnabled = true;
		ctx.drawImage(this.canvas, 0, 0, bw * this.scale, bh * this.scale);
	};

	AfterDark.define('after-dark-nirvana', function (el) {
		var sim = new Nirvana();
		sim.color = COLORS[AfterDark.choice(el, 'color', COLORS, 'random')];
		sim.redraw = MINUTES[AfterDark.choice(el, 'redraw-every', REDRAWS, '5 min')] * 60;
		var act = AfterDark.choice(el, 'activity', ACTIVITIES, 'calm');
		sim.brushes = BRUSHES[act];
		sim.pace = PACE[act];
		sim.cycle = CYCLE[AfterDark.choice(el, 'change-color', CHANGES, 'often')];
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
