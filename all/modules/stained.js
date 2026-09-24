/**
 * stained.js - Stained Glass, quilts of coloured panes.
 *
 * STAINED.AD ships no artwork. Its own description:
 *
 *   "STAINED GLASS(tm) produces an infinite variety of beautiful quiltlike
 *    patterns. The 'Complexity' slider increases the appearance of detail in
 *    the image. The 'Duplication' slider controls how often the central image
 *    is duplicated in the periphery. The 'Color' slider controls how colorful
 *    the image gets. On the low end only a few colors are used."
 *
 * One block is cut up by straight lines, mirrored four ways so it is
 * symmetrical like a quilt square, and the panes between the lead are filled
 * in one at a time. The block is then repeated, mirrored, across the screen;
 * Duplication is how many times. When the window is done it is left up for a
 * while and a new one started. The sliders are steps here.
 *
 *   <after-dark-stained-glass complexity="medium" duplication="some" color="medium">
 */
(function () {
	'use strict';

	var COMPLEXITIES = ['low', 'medium', 'high'];
	var CUTS = [3, 6, 11];
	var DUPLICATIONS = ['none', 'some', 'lots'];
	var REPEAT = [1, 2, 4];
	var COLORS = ['few', 'medium', 'lots'];
	var SHADES = [3, 7, 16];
	var TILE = 160;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function StainedGlass() {
		this.cuts = CUTS[1];
		this.repeat = REPEAT[1];
		this.shades = SHADES[1];
	}

	StainedGlass.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.design();
	};

	/** Cut the block, find its panes, pick their colours. */
	StainedGlass.prototype.design = function () {
		var n = TILE, lead = new Uint8Array(n * n), i;
		var c = document.createElement('canvas');
		c.width = c.height = n;
		var g = c.getContext('2d', { willReadFrequently: true });
		g.fillStyle = '#fff';
		g.fillRect(0, 0, n, n);
		g.strokeStyle = '#000';
		g.lineWidth = 2;
		/* Cut lines in one quarter, mirrored into the other three. */
		for (i = 0; i < this.cuts; i += 1) {
			var x1 = rand(0, n / 2), y1 = rand(0, n / 2), ang = rand(0, Math.PI), len = n;
			var x2 = x1 + Math.cos(ang) * len, y2 = y1 + Math.sin(ang) * len;
			x1 -= Math.cos(ang) * len;
			y1 -= Math.sin(ang) * len;
			/* Eight ways: each mirror, and each of those across the diagonal. */
			[false, true].forEach(function (swap) {
				[[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (m) {
					var ax = swap ? y1 : x1, ay = swap ? x1 : y1, bx = swap ? y2 : x2, by = swap ? x2 : y2;
					var ox = m[0] < 0 ? n : 0, oy = m[1] < 0 ? n : 0;
					g.beginPath();
					g.moveTo(ox + m[0] * ax, oy + m[1] * ay);
					g.lineTo(ox + m[0] * bx, oy + m[1] * by);
					g.stroke();
				});
			});
		}
		g.strokeRect(1, 1, n - 2, n - 2);
		var px = g.getImageData(0, 0, n, n).data;
		for (i = 0; i < n * n; i += 1) { lead[i] = px[i * 4] < 128 ? 1 : 0; }
		/* Flood-fill the panes. */
		var label = new Int32Array(n * n).fill(-1), panes = [], stack = [];
		for (i = 0; i < n * n; i += 1) {
			if (lead[i] || label[i] >= 0) { continue; }
			var id = panes.length, cells = [];
			stack.push(i);
			label[i] = id;
			while (stack.length) {
				var k = stack.pop();
				cells.push(k);
				var x = k % n, y = (k - x) / n;
				var nb = [x > 0 ? k - 1 : -1, x < n - 1 ? k + 1 : -1, y > 0 ? k - n : -1, y < n - 1 ? k + n : -1];
				for (var j = 0; j < 4; j += 1) {
					var q = nb[j];
					if (q >= 0 && !lead[q] && label[q] < 0) {
						label[q] = id;
						stack.push(q);
					}
				}
			}
			panes.push(cells);
		}
		/* Mirror-image panes get the same colour: key each by its centre folded into one eighth. */
		var palette = [];
		var base = rand(0, 360);
		for (i = 0; i < this.shades; i += 1) {
			palette.push('hsl(' + ((base + i * rand(25, 360 / this.shades + 20)) % 360).toFixed(0) + ',' +
				rand(55, 95).toFixed(0) + '%,' + rand(35, 60).toFixed(0) + '%)');
		}
		var keyed = {};
		this.panes = panes.map(function (cells) {
			var sx = 0, sy = 0;
			cells.forEach(function (k) { sx += k % n; sy += Math.floor(k / n); });
			var fx = Math.abs(sx / cells.length - n / 2), fy = Math.abs(sy / cells.length - n / 2);
			var key = Math.round(Math.min(fx, fy) / 6) + ',' + Math.round(Math.max(fx, fy) / 6);
			if (!keyed[key]) { keyed[key] = palette[Math.floor(Math.random() * palette.length)]; }
			return { cells: cells, colour: keyed[key] };
		});
		this.panes.sort(function () { return Math.random() - 0.5; });
		this.block = document.createElement('canvas');
		this.block.width = this.block.height = n;
		var bg = this.block.getContext('2d');
		bg.fillStyle = '#000';
		bg.fillRect(0, 0, n, n);
		this.blockImage = bg.getImageData(0, 0, n, n);
		this.filled = 0;
		this.rest = 0;
	};

	/** A CSS colour as [r, g, b], by letting a one-pixel canvas work it out. */
	var probe = null;
	function rgbOf(css) {
		if (!probe) { probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true }); }
		probe.fillStyle = css;
		probe.fillRect(0, 0, 1, 1);
		return probe.getImageData(0, 0, 1, 1).data;
	}

	StainedGlass.prototype.fill = function (pane) {
		var g = this.block.getContext('2d');
		var c = rgbOf(pane.colour), d = this.blockImage.data;
		pane.cells.forEach(function (k) {
			d[k * 4] = c[0];
			d[k * 4 + 1] = c[1];
			d[k * 4 + 2] = c[2];
			d[k * 4 + 3] = 255;
		});
		g.putImageData(this.blockImage, 0, 0);
	};

	StainedGlass.prototype.step = function (dt, ctx, w, h) {
		if (this.filled < this.panes.length) {
			var per = Math.max(1, Math.round(this.panes.length * dt / 6));
			for (var i = 0; i < per && this.filled < this.panes.length; i += 1) {
				this.fill(this.panes[this.filled]);
				this.filled += 1;
			}
		} else {
			this.rest += dt;
			if (this.rest > 8) { this.design(); }
		}
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		/* The block, repeated and mirrored so the edges meet. */
		var side = Math.min(w, h) / this.repeat;
		var cols = Math.ceil(w / side / 2) * 2 + 1, rows = Math.ceil(h / side / 2) * 2 + 1;
		var ox = w / 2 - side * cols / 2, oy = h / 2 - side * rows / 2;
		ctx.imageSmoothingEnabled = false;
		for (var r = 0; r < rows; r += 1) {
			for (var c = 0; c < cols; c += 1) {
				ctx.save();
				ctx.translate(ox + c * side + (c % 2 ? side : 0), oy + r * side + (r % 2 ? side : 0));
				ctx.scale(c % 2 ? -1 : 1, r % 2 ? -1 : 1);
				ctx.drawImage(this.block, 0, 0, side, side);
				ctx.restore();
			}
		}
	};

	AfterDark.define('after-dark-stained-glass', function (el) {
		var sim = new StainedGlass();
		sim.cuts = CUTS[AfterDark.choice(el, 'complexity', COMPLEXITIES, 'medium')];
		sim.repeat = REPEAT[AfterDark.choice(el, 'duplication', DUPLICATIONS, 'some')];
		sim.shades = SHADES[AfterDark.choice(el, 'color', COLORS, 'medium')];
		return sim;
	});

	window.AfterDarkStainedGlass = StainedGlass;
}());
