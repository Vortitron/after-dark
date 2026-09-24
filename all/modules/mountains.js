/**
 * mountains.js - Mountains, fractal landscapes of the nine planets.
 *
 * MOUNTAIN.AD ships no artwork. Its own description:
 *
 *   "MOUNTAINS(tm) uses fractal mathematics to provide many and varied
 *    landscapes for your viewing pleasure. 'View' changes the look of the
 *    mountains so that in some cases they don't even look like mountains at
 *    all. 'Planet' provides different planet landscapes. 'Complexity' allows
 *    you to choose how many iterations the mountains will take to draw. The
 *    higher the complexity the longer it takes to draw. Bring the landscape
 *    closer with the 'Zoom' slider. Original design and concept by Ben
 *    Haller, Eli Meir and Mouse Herrell."
 *
 * View is Boundaries, Webs, Mountains, Constructions, Highlands or Random;
 * Water Image is Frame, Shell, Sheet, Surface, Solid or Random; Planet is
 * Mercury to Pluto or Random. The land is midpoint displacement - the
 * "fractal mathematics" - on a square grid, drawn a row at a time from the
 * back, the planet choosing its colours and how much sea it has.
 *
 *   <after-dark-mountains view="mountains" water="surface" planet="earth" complexity="medium" zoom="medium">
 */
(function () {
	'use strict';

	var VIEWS = ['boundaries', 'webs', 'mountains', 'constructions', 'highlands', 'random'];
	var WATERS = ['frame', 'shell', 'sheet', 'surface', 'solid', 'random'];
	var PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'random'];
	var COMPLEXITIES = ['low', 'medium', 'high'];
	var SIZE = [5, 6, 7];
	var ZOOMS = ['far', 'medium', 'near'];
	var DISTANCE = [1.5, 1.15, 0.85];
	/* Low ground, high ground, peaks, sea, sky, and how much of it is under water. */
	var WORLDS = {
		mercury: { land: ['#4a4644', '#8a847c', '#d6d0c4'], sea: null, sky: '#000000', level: 0 },
		venus: { land: ['#6a4a10', '#c89a3a', '#f2dc90'], sea: '#a8541a', sky: '#40280c', level: 0.3 },
		earth: { land: ['#2e6a24', '#7a6a3c', '#f4f4f4'], sea: '#1c4ca0', sky: '#0a0a28', level: 0.42 },
		mars: { land: ['#6a200e', '#b44a22', '#e8a070'], sea: null, sky: '#1a0806', level: 0 },
		jupiter: { land: ['#7a4a2a', '#d8a870', '#f4e8d0'], sea: '#a86a3a', sky: '#1c1008', level: 0.5 },
		saturn: { land: ['#6a5a3a', '#c8b07a', '#f4ead0'], sea: '#9a8a5a', sky: '#14100a', level: 0.35 },
		uranus: { land: ['#2a6a70', '#6ac0c4', '#d0f4f4'], sea: '#1a8a9a', sky: '#04141a', level: 0.45 },
		neptune: { land: ['#101c6a', '#3a5ac8', '#a8c0f4'], sea: '#1a2aa0', sky: '#02041a', level: 0.5 },
		pluto: { land: ['#5a5a6a', '#a8aab8', '#f4f6ff'], sea: '#8890a8', sky: '#000000', level: 0.2 }
	};

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	function hex(c) {
		return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
	}

	/** Midpoint displacement - diamond-square - on a (2^n + 1) grid, 0..1. */
	function terrain(n, rough) {
		var size = (1 << n) + 1, h = [], x, y, step, half, scale = 1;
		for (y = 0; y < size; y += 1) { h.push(new Float32Array(size)); }
		h[0][0] = Math.random(); h[0][size - 1] = Math.random();
		h[size - 1][0] = Math.random(); h[size - 1][size - 1] = Math.random();
		for (step = size - 1; step > 1; step /= 2) {
			half = step / 2;
			for (y = half; y < size; y += step) {
				for (x = half; x < size; x += step) {
					h[y][x] = (h[y - half][x - half] + h[y - half][x + half] + h[y + half][x - half] +
						h[y + half][x + half]) / 4 + rand(-1, 1) * scale;
				}
			}
			for (y = 0; y < size; y += half) {
				for (x = (y / half) % 2 ? 0 : half; x < size; x += step) {
					var sum = 0, cnt = 0;
					if (y >= half) { sum += h[y - half][x]; cnt += 1; }
					if (y + half < size) { sum += h[y + half][x]; cnt += 1; }
					if (x >= half) { sum += h[y][x - half]; cnt += 1; }
					if (x + half < size) { sum += h[y][x + half]; cnt += 1; }
					h[y][x] = sum / cnt + rand(-1, 1) * scale;
				}
			}
			scale *= rough;
		}
		var lo = Infinity, hi = -Infinity;
		for (y = 0; y < size; y += 1) {
			for (x = 0; x < size; x += 1) { lo = Math.min(lo, h[y][x]); hi = Math.max(hi, h[y][x]); }
		}
		for (y = 0; y < size; y += 1) {
			for (x = 0; x < size; x += 1) { h[y][x] = (h[y][x] - lo) / (hi - lo); }
		}
		return h;
	}

	function Mountains() {
		this.view = 'mountains';
		this.water = 'surface';
		this.planet = 'earth';
		this.n = SIZE[1];
		this.distance = DISTANCE[1];
	}

	Mountains.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.canvas = document.createElement('canvas');
		this.canvas.width = Math.max(1, Math.round(w));
		this.canvas.height = Math.max(1, Math.round(h));
		this.begin();
	};

	Mountains.prototype.begin = function () {
		this.v = this.view === 'random' ? pick(VIEWS.slice(0, 5)) : this.view;
		this.wv = this.water === 'random' ? pick(WATERS.slice(0, 5)) : this.water;
		this.world = WORLDS[this.planet === 'random' ? pick(PLANETS.slice(0, 9)) : this.planet];
		this.map = terrain(this.n, rand(0.45, 0.6));
		this.row = 0;
		this.rest = 0;
		var g = this.canvas.getContext('2d'), w = this.w, h = this.h;
		var sky = g.createLinearGradient(0, 0, 0, h);
		sky.addColorStop(0, '#000');
		sky.addColorStop(1, this.world.sky);
		g.fillStyle = this.v === 'webs' || this.v === 'boundaries' ? '#000' : sky;
		g.fillRect(0, 0, w, h);
	};

	/** Grid point to screen: the grid lies flat, seen from above the near edge. */
	Mountains.prototype.project = function (gx, gy, z) {
		var size = this.map.length - 1, w = this.w, h = this.h;
		var X = gx / size - 0.5, Y = 1 - gy / size;
		/* The eye is above the near edge; Zoom moves it in or out. */
		var depth = this.distance + Y * 1.6;
		return { x: w / 2 + X * w * 1.3 / depth, y: h * 0.2 + (0.9 - z * 0.8) * h * 0.9 / depth };
	};

	Mountains.prototype.colour = function (z, light) {
		var land = this.world.land, c;
		var t = Math.min(1, Math.max(0, z));
		if (t < 0.5) {
			var a = hex(land[0]), b = hex(land[1]), k = t / 0.5;
			c = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
		} else {
			var p = hex(land[1]), q = hex(land[2]), m = Math.max(0, (t - 0.5) / 0.5);
			m = m * m;
			c = [p[0] + (q[0] - p[0]) * m, p[1] + (q[1] - p[1]) * m, p[2] + (q[2] - p[2]) * m];
		}
		return 'rgb(' + Math.round(c[0] * light) + ',' + Math.round(c[1] * light) + ',' + Math.round(c[2] * light) + ')';
	};

	/** One row of the grid, from the back forward. */
	Mountains.prototype.drawRow = function (gy) {
		var g = this.canvas.getContext('2d'), m = this.map, size = m.length - 1, lvl = this.world.sea ? this.world.level : -1;
		var self = this;
		function z(x, y) { return Math.max(m[y][x], lvl); }
		for (var gx = 0; gx < size; gx += 1) {
			var zs = [z(gx, gy), z(gx + 1, gy), z(gx + 1, gy + 1), z(gx, gy + 1)];
			var pts = [this.project(gx, gy, zs[0]), this.project(gx + 1, gy, zs[1]),
				this.project(gx + 1, gy + 1, zs[2]), this.project(gx, gy + 1, zs[3])];
			var wet = lvl >= 0 && m[gy][gx] <= lvl && m[gy + 1][gx + 1] <= lvl;
			var avg = (zs[0] + zs[1] + zs[2] + zs[3]) / 4;
			/* Light from the left and behind: brighter where the ground faces it. */
			var slope = (zs[0] + zs[3] - zs[1] - zs[2]) * 3 + (zs[0] + zs[1] - zs[2] - zs[3]) * 2;
			var light = Math.max(0.35, Math.min(1.3, 0.85 + slope));
			if (wet) {
				this.sea(g, pts);
				continue;
			}
			if (this.v === 'mountains') {
				g.fillStyle = this.colour(avg, light);
				g.strokeStyle = g.fillStyle;
				g.lineWidth = 1;
				this.quad(g, pts, true);
			} else if (this.v === 'webs') {
				g.strokeStyle = this.colour(avg, 1.1);
				g.lineWidth = 1;
				this.quad(g, pts, false);
			} else if (this.v === 'boundaries') {
				/* Only where the height crosses a contour. */
				var band = Math.floor(zs[0] * 10);
				if (band !== Math.floor(zs[1] * 10) || band !== Math.floor(zs[3] * 10)) {
					g.fillStyle = this.colour(band / 10, 1.2);
					g.fillRect(pts[0].x, pts[0].y, 2, 2);
					g.fillRect((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2, 2, 2);
				}
			} else if (this.v === 'constructions') {
				/* Columns standing on the plain, each as high as its ground. */
				var base = this.project(gx, gy, lvl < 0 ? 0 : lvl), top = pts[0], wide = pts[1].x - pts[0].x;
				g.fillStyle = this.colour(zs[0], light * 0.8);
				g.fillRect(top.x, top.y, wide * 0.8, base.y - top.y);
				g.fillStyle = this.colour(zs[0], 1.25);
				g.fillRect(top.x, top.y - 2, wide * 0.8, 3);
			} else {
				/* Highlands: the ground as points, thicker where it is high. */
				g.fillStyle = self.colour(avg, light);
				var r = 1 + avg * 2.5;
				g.fillRect(pts[0].x, pts[0].y, r, r);
			}
		}
	};

	Mountains.prototype.quad = function (g, pts, fill) {
		g.beginPath();
		g.moveTo(pts[0].x, pts[0].y);
		for (var i = 1; i < 4; i += 1) { g.lineTo(pts[i].x, pts[i].y); }
		g.closePath();
		if (fill) { g.fill(); }
		g.stroke();
	};

	Mountains.prototype.sea = function (g, pts) {
		var c = this.world.sea, wv = this.wv;
		if (wv === 'frame') { return; }
		g.lineWidth = 1;
		if (wv === 'shell') {
			g.strokeStyle = c;
			this.quad(g, pts, false);
		} else if (wv === 'sheet') {
			g.globalAlpha = 0.45;
			g.fillStyle = c;
			g.strokeStyle = c;
			this.quad(g, pts, true);
			g.globalAlpha = 1;
		} else {
			g.fillStyle = c;
			g.strokeStyle = wv === 'solid' ? c : 'rgba(255,255,255,0.08)';
			this.quad(g, pts, true);
		}
	};

	/** Frame and Solid water draw round the edge of the sea once the land is done. */
	Mountains.prototype.finish = function () {
		var lvl = this.world.level, size = this.map.length - 1, g = this.canvas.getContext('2d');
		if (!this.world.sea) { return; }
		var a = this.project(0, 0, lvl), b = this.project(size, 0, lvl), c = this.project(size, size, lvl), d = this.project(0, size, lvl);
		if (this.wv === 'frame') {
			g.strokeStyle = this.world.sea;
			g.lineWidth = 2;
			g.beginPath();
			g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y);
			g.closePath();
			g.stroke();
		} else if (this.wv === 'solid') {
			/* The front of the slab of water. */
			var down = this.project(0, size, 0), rgb = hex(this.world.sea);
			g.fillStyle = 'rgb(' + Math.round(rgb[0] * 0.55) + ',' + Math.round(rgb[1] * 0.55) + ',' + Math.round(rgb[2] * 0.55) + ')';
			g.fillRect(d.x, d.y, c.x - d.x, Math.max(4, down.y - d.y));
		}
	};

	Mountains.prototype.step = function (dt, ctx, w, h) {
		var size = this.map.length - 1;
		if (this.row < size) {
			/* The higher the complexity, the longer it takes - as it said. */
			var rows = Math.max(1, Math.round(size * dt / 6));
			for (var i = 0; i < rows && this.row < size; i += 1) {
				this.drawRow(this.row);
				this.row += 1;
			}
			if (this.row >= size) { this.finish(); }
		} else {
			this.rest += dt;
			if (this.rest > 14) { this.begin(); }
		}
		ctx.drawImage(this.canvas, 0, 0, w, h);
	};

	AfterDark.define('after-dark-mountains', function (el) {
		var sim = new Mountains();
		sim.view = VIEWS[AfterDark.choice(el, 'view', VIEWS, 'mountains')];
		sim.water = WATERS[AfterDark.choice(el, 'water', WATERS, 'surface')];
		sim.planet = PLANETS[AfterDark.choice(el, 'planet', PLANETS, 'earth')];
		sim.n = SIZE[AfterDark.choice(el, 'complexity', COMPLEXITIES, 'medium')];
		sim.distance = DISTANCE[AfterDark.choice(el, 'zoom', ZOOMS, 'medium')];
		return sim;
	});

	window.AfterDarkMountains = Mountains;
	Mountains.terrain = terrain;
}());
