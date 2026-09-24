/**
 * fractal.js - Fractal Forest, trees grown round the year.
 *
 * FRACTAL.AD's own description:
 *
 *   "FRACTAL FOREST (tm) Use Fractal Forest to grow your own desktop forest.
 *    Try Fractal Forest and Meadow together in Multimodule for a very calming
 *    effect! Concept and original Mac version by Scott Armitage."
 *
 * Its controls are Num. of Trees, Type (Maple, Elm, Pine, Poplar, Sapling,
 * Random), Season (Spring, Summer, Fall, Winter) and Seasons Last (10 sec. to
 * Forever). Each kind of tree is a TREEDATA resource, 24 numbers, in
 * all/art/fractal/. How the module used them was not decompiled; they are
 * read here as branching - how many branches, how deep, how wide they fan,
 * how hard they reach up, how much shorter each generation is - because
 * that is where the numbers differ the way the trees do: the pine and the
 * poplar reach straight up, the elm fans out, the sapling is small. Each tree
 * grows a generation at a time, and the seasons turn the leaves: blossom,
 * green, gold and falling, bare and snowed on.
 *
 *   <after-dark-fractal-forest art="art/fractal" trees="some" type="random" season="spring" seasons-last="1 min.">
 */
(function () {
	'use strict';

	var COUNTS = ['one', 'few', 'some', 'many'];
	var HOW_MANY = [1, 3, 6, 11];
	var TYPES = ['maple', 'elm', 'pine', 'poplar', 'sapling', 'random'];
	var SEASONS = ['spring', 'summer', 'fall', 'winter'];
	var LASTS = ['10 sec.', '30 sec.', '1 min.', '5 min.', '10 min.', '30 min.', '1 hour', '1 day', '1 week', 'forever'];
	var LENGTH = [10, 30, 60, 300, 600, 1800, 3600, 86400, 604800, Infinity];
	var LEAVES = {
		spring: ['#8ad05a', '#a8e070', '#f4c0d8', '#ffffff'],
		summer: ['#2e7a24', '#3c9030', '#1e5a18'],
		fall: ['#e0701c', '#c8341a', '#f0b82a', '#9a5a1a'],
		winter: []
	};

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function vary(v, spread) {
		return v + rand(-spread, spread);
	}

	/** Branches for one tree, from its TREEDATA numbers; each knows its generation. */
	function grow(d, x, y, height) {
		var most = d[0], fewest = Math.max(1, d[1]), leafFrom = d[2], depth = Math.max(3, d[3] || 5);
		var spread = d[4] * Math.PI / 180, up = d[5] / 100;
		var ratio = d[8] / 100, trunk = d[10] / 100;
		var out = [];
		function branch(x0, y0, ang, len, gen, width) {
			var x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
			out.push({ x0: x0, y0: y0, x1: x1, y1: y1, gen: gen, w: width, leaf: gen >= leafFrom });
			if (gen >= depth) { return; }
			var n = fewest + Math.floor(Math.random() * (most - fewest + 1));
			for (var i = 0; i < n; i += 1) {
				var off = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread;
				/* Pull back toward straight up by the tree's upward reach. */
				var a = ang + off + rand(-0.15, 0.15);
				a = a + (-Math.PI / 2 - a) * up * 0.35;
				branch(x1, y1, a, len * vary(ratio, d[9] / 100), gen + 1, width * 0.68);
			}
			/* The strong-leadered trees carry the trunk on up the middle. */
			if (up > 0.8 && gen < depth - 1) { branch(x1, y1, -Math.PI / 2 + rand(-0.05, 0.05), len * 0.85, gen + 1, width * 0.8); }
		}
		branch(x, y, -Math.PI / 2, height * trunk * 0.32, 0, Math.max(2, height * (d[6] || 15) / 900));
		return out;
	}

	function FractalForest() {
		this.count = HOW_MANY[2];
		this.type = 'random';
		this.season = 0;
		this.length = LENGTH[2];
		this.data = null;
	}

	FractalForest.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.planted = false;
		this.t = 0;
		this.falling = [];
	};

	FractalForest.prototype.plant = function () {
		var w = this.w, h = this.h, names = ['maple', 'elm', 'pine', 'poplar', 'sapling'];
		this.trees = [];
		for (var i = 0; i < this.count; i += 1) {
			var kind = this.type === 'random' ? names[Math.floor(Math.random() * 5)] : this.type;
			var back = this.count === 1 ? 1 : rand(0.55, 1);
			var height = h * (kind === 'sapling' ? 0.45 : 0.85) * back;
			var ground = h * 0.93 - (1 - back) * h * 0.2;
			var x = this.count === 1 ? w / 2 : rand(w * 0.06, w * 0.94);
			var parts = grow(this.data.trees[kind], x, ground, height);
			/* Keep the crown on the screen: shrink it about its foot if it grew too tall. */
			var top = Math.min.apply(null, parts.map(function (q) { return Math.min(q.y0, q.y1); }));
			if (top < h * 0.04) {
				var fit = (ground - h * 0.04) / (ground - top);
				parts.forEach(function (q) {
					q.x0 = x + (q.x0 - x) * fit; q.x1 = x + (q.x1 - x) * fit;
					q.y0 = ground + (q.y0 - ground) * fit; q.y1 = ground + (q.y1 - ground) * fit;
					q.w *= fit;
				});
			}
			this.trees.push({ kind: kind, parts: parts, back: back, leaves: this.leafy(parts, kind, back) });
		}
		/* Back ones first. */
		this.trees.sort(function (a, b) { return a.back - b.back; });
		this.planted = true;
		this.growth = 0;
	};

	/** Where the leaves go: clusters at the ends of the leafy branches. */
	FractalForest.prototype.leafy = function (parts, kind, back) {
		var d = this.data.trees[kind], size = Math.min(8, d[12] || 6) * 0.6 * back * Math.max(1, this.h / 480), out = [];
		parts.forEach(function (p) {
			if (!p.leaf) { return; }
			for (var i = 0; i < 3; i += 1) {
				out.push({ x: p.x1 + rand(-size, size) * 1.5, y: p.y1 + rand(-size, size) * 1.5, r: size * rand(0.6, 1.2),
					pick: Math.random(), gen: p.gen });
			}
		});
		return out;
	};

	FractalForest.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.data) { return; }
		if (!this.planted) { this.plant(); }
		this.t += dt;
		if (this.t >= this.length) {
			this.t = 0;
			this.season = (this.season + 1) % 4;
		}
		/* A generation of growth every second and a half, up to full size. */
		this.growth = Math.min(20, this.growth + dt / 1.5);
		var season = SEASONS[this.season], p = Math.min(1, this.t / Math.min(this.length, 20));
		var colours = LEAVES[season], i;
		ctx.fillStyle = season === 'winter' ? '#d8dce8' : '#1c2a14';
		ctx.fillRect(0, h * 0.93, w, h * 0.07);
		ctx.lineCap = 'round';
		for (var t = 0; t < this.trees.length; t += 1) {
			var tree = this.trees[t], shade = 0.45 + 0.55 * tree.back;
			ctx.strokeStyle = 'rgb(' + Math.round(96 * shade) + ',' + Math.round(70 * shade) + ',' + Math.round(48 * shade) + ')';
			for (i = 0; i < tree.parts.length; i += 1) {
				var b = tree.parts[i];
				if (b.gen > this.growth) { continue; }
				var k = Math.min(1, this.growth - b.gen);
				ctx.lineWidth = b.w * tree.back;
				ctx.beginPath();
				ctx.moveTo(b.x0, b.y0);
				ctx.lineTo(b.x0 + (b.x1 - b.x0) * k, b.y0 + (b.y1 - b.y0) * k);
				ctx.stroke();
			}
			/* Leaves: all of them in summer, coming in spring, going in fall. */
			var show = season === 'spring' ? p : season === 'summer' ? 1 : season === 'fall' ? 1 - p * 0.9 : 0;
			for (i = 0; i < tree.leaves.length; i += 1) {
				var lf = tree.leaves[i];
				if (lf.gen > this.growth || lf.pick > show) { continue; }
				ctx.fillStyle = colours[Math.floor(lf.pick * 997) % colours.length];
				ctx.globalAlpha = shade;
				ctx.beginPath();
				ctx.arc(lf.x, lf.y, lf.r, 0, Math.PI * 2);
				ctx.fill();
				ctx.globalAlpha = 1;
				if (season === 'fall' && Math.random() < dt * 0.02) {
					this.falling.push({ x: lf.x, y: lf.y, c: ctx.fillStyle, r: lf.r * 0.6, v: rand(20, 50), s: rand(0, 6) });
				}
			}
			if (season === 'winter' && this.growth >= 1) {
				/* Snow along the tops of the branches. */
				ctx.fillStyle = 'rgba(240,244,255,' + (0.9 * p).toFixed(2) + ')';
				for (i = 0; i < tree.parts.length; i += 1) {
					var s = tree.parts[i];
					if (s.gen <= this.growth && s.gen > 0) { ctx.fillRect(s.x1 - s.w, s.y1 - 2, s.w * 2 + 2, 2); }
				}
			}
		}
		for (i = this.falling.length - 1; i >= 0; i -= 1) {
			var f = this.falling[i];
			f.y += f.v * dt;
			f.x += Math.sin(this.t * 2 + f.s) * 25 * dt;
			if (f.y > h * 0.95) { this.falling.splice(i, 1); continue; }
			ctx.fillStyle = f.c;
			ctx.fillRect(f.x, f.y, f.r * 2, f.r);
		}
		if (season === 'winter') {
			ctx.fillStyle = '#fff';
			for (i = 0; i < 60; i += 1) {
				var sx = ((i * 97.3 + this.t * 13 * (1 + i % 3)) % w), sy = ((i * 53.1 + this.t * 40 * (1 + i % 2)) % h);
				ctx.fillRect(sx, sy, 2, 2);
			}
		}
	};

	AfterDark.define('after-dark-fractal-forest', function (el) {
		var sim = new FractalForest();
		sim.count = HOW_MANY[AfterDark.choice(el, 'trees', COUNTS, 'some')];
		sim.type = TYPES[AfterDark.choice(el, 'type', TYPES, 'random')];
		sim.season = AfterDark.choice(el, 'season', SEASONS, 'spring');
		sim.length = LENGTH[AfterDark.choice(el, 'seasons-last', LASTS, '1 min.')];
		AfterDark.data(AfterDark.setting(el, 'art') || 'art/fractal').then(function (d) {
			sim.data = d;
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkFractalForest = FractalForest;
	FractalForest.grow = grow;
}());
