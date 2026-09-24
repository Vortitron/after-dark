/**
 * nocturne.js - Nocturnes, eyes in the dark.
 *
 * NOCTURNE.AD's own description is all it needs:
 *
 *   "NOCTURNES (tm) Lions and tigers and bears, oh my!
 *    To hear the crickets, use the sound control."
 *
 * Its one bitmap is a sheet of eyes, 32x16 a pair: five kinds of creature
 * down the side and three stages of a blink across - open, half shut, all
 * but shut. Pairs of them open somewhere in the dark, look out for a while,
 * blink now and then, and close again. The control panel's Density is how
 * many are out there; Color tints them. (The panel also has Flying Objects
 * and Toast in it, left over from the Flying Toasters module it was built
 * from; they do nothing.) The crickets are left out, as all sound is here.
 *
 *   <after-dark-nocturnes art="art/nocturne" density="a bunch" color>
 */
(function () {
	'use strict';

	var DENSITIES = ['sparse', 'a few', 'a bunch', 'lots'];
	var PAIRS = [3, 6, 12, 22];
	var CELL_W = 32;
	var CELL_H = 16;
	var KINDS = 5;
	/* Cat, tiger, owl, something small, something smaller. */
	var TINTS = ['#ffff55', '#ffaa00', '#ffffaa', '#55ff55', '#ff5555'];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function tint(image, colour) {
		var c = document.createElement('canvas');
		c.width = image.width;
		c.height = image.height;
		var g = c.getContext('2d');
		g.drawImage(image, 0, 0);
		g.globalCompositeOperation = 'source-in';
		g.fillStyle = colour;
		g.fillRect(0, 0, c.width, c.height);
		return c;
	}

	function Nocturnes() {
		this.count = PAIRS[2];
		this.color = true;
		this.sheets = null;
		this.eyes = [];
	}

	Nocturnes.prototype.setArt = function (image) {
		var self = this;
		this.sheets = TINTS.map(function (c) { return tint(image, self.color ? c : '#ffffff'); });
	};

	Nocturnes.prototype.resize = function (w, h) {
		this.scale = Math.max(1, Math.round(Math.min(w, h) / 400));
		this.eyes = [];
		for (var i = 0; i < this.count; i += 1) { this.eyes.push(this.spawn(w, h, rand(0, 6))); }
	};

	Nocturnes.prototype.spawn = function (w, h, delay) {
		var s = this.scale;
		return {
			x: rand(0, w - CELL_W * s), y: rand(0, h - CELL_H * s), kind: Math.floor(Math.random() * KINDS),
			life: rand(4, 14), wait: delay || rand(0.5, 4), age: 0, blink: rand(1, 4)
		};
	};

	/** Which of the three blink stages to show, or -1 for nothing. */
	Nocturnes.prototype.stage = function (e) {
		if (e.wait > 0) { return -1; }
		var open = 0.25;
		if (e.age < open) { return 2 - Math.floor(e.age / open * 3); }
		if (e.age > e.life - open) { return Math.min(2, Math.floor((e.age - (e.life - open)) / open * 3)); }
		/* A blink: shut and open again in a fifth of a second. */
		if (e.blinkAt !== undefined && e.age - e.blinkAt < 0.2) {
			return [1, 2, 2, 1][Math.floor((e.age - e.blinkAt) / 0.05)] || 0;
		}
		return 0;
	};

	Nocturnes.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.sheets) { return; }
		var s = this.scale;
		for (var i = 0; i < this.eyes.length; i += 1) {
			var e = this.eyes[i];
			if (e.wait > 0) {
				e.wait -= dt;
				continue;
			}
			e.age += dt;
			e.blink -= dt;
			if (e.blink <= 0) {
				e.blinkAt = e.age;
				e.blink = rand(1.5, 5);
			}
			if (e.age >= e.life) {
				this.eyes[i] = this.spawn(w, h);
				continue;
			}
			var st = this.stage(e);
			if (st < 0) { continue; }
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(this.sheets[e.kind], st * CELL_W, e.kind * CELL_H, CELL_W, CELL_H,
				Math.round(e.x), Math.round(e.y), CELL_W * s, CELL_H * s);
		}
	};

	AfterDark.define('after-dark-nocturnes', function (el) {
		var sim = new Nocturnes();
		sim.count = PAIRS[AfterDark.choice(el, 'density', DENSITIES, 'a bunch')];
		sim.color = AfterDark.flag(el, 'color');
		AfterDark.load(AfterDark.setting(el, 'art') || 'art/nocturne').then(function (art) {
			sim.setArt(art.bitmap('eyes').image);
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkNocturnes = Nocturnes;
}());
