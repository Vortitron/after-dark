/**
 * geobounce.js - GeoBounce, a Platonic solid loose on the screen.
 *
 * GEOBOUNC.AD ships no artwork. Its own description:
 *
 *   "GEOBOUNCE(tm) distorts the space-time continuum, permitting glimpses
 *    through the fourth dimension to the other side of the universe, which is
 *    populated by an intelligent and happy community of Platonic solids.
 *    If you listen carefully (by using the sound control), you can hear them
 *    exclaim as they bounce off the walls."
 *
 * Its controls, out of TYPE_1000, with their stored defaults: Shape
 * (Tetrahedron, Cube, Octahedron, Dodecahedron, Icosahedron - no random;
 * Tetrahedron), Size (slider 10-100; 54), Speed (slider 0-100; 28) and
 * Faces (Shading, Colors, Both; Both).
 *
 * Checked against the original under Wine at 1024x768 (October 2026), from
 * true-colour grabs of the 8-bit screen:
 *  - One small solid tumbling and bouncing round a black screen. Its
 *    circumradius is 0.4 x Size px: about 22 px at the default 54 (a
 *    tetrahedron 30-35 px across), 60 px across at 100, 8 px at 10. Here
 *    that is scaled with the screen height (768 = 1:1).
 *  - Faces are flat polygons with a 1-px black outline. Colors: each face
 *    one bright VGA colour, unshaded - red, green, blue, yellow, cyan,
 *    magenta in turn (a tetrahedron is red, green, blue, yellow). Shading:
 *    white and grey. Both: the face's colour lit by a 2x2 ordered dither
 *    ladder black -> dark (#800000 ...) -> bright (#ff0000 ...), e.g. teal
 *    dotted with cyan, blue with black holes.
 * Not measured: speed and spin - Wine ran it flat out, so how fast it moves
 * and turns at each Speed setting is chosen; the light direction is guessed.
 *
 *   <after-dark-geobounce shape="tetrahedron" size="54" speed="28" faces="both">
 */
(function () {
	'use strict';

	var SHAPES = ['tetrahedron', 'cube', 'octahedron', 'dodecahedron', 'icosahedron'];
	var SIZE_NAMES = { small: 25, medium: 54, large: 90 };
	var SPEED_NAMES = { slow: 10, medium: 28, fast: 60 };
	var FACES = ['shading', 'colors', 'both'];
	/* Bright and dark of each face colour, in face order; then the greys. */
	var HUES = [['#ff0000', '#800000'], ['#00ff00', '#008000'], ['#0000ff', '#000080'],
		['#ffff00', '#808000'], ['#00ffff', '#008080'], ['#ff00ff', '#800080']];
	var GREYS = ['#ffffff', '#808080'];
	/* 2x2 ordered dither: which quarter-steps light which pixel. */
	var BAYER = [[0, 2], [3, 1]];
	var PHI = (1 + Math.sqrt(5)) / 2;

	function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
	function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
	function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
	function norm(a) { var l = Math.sqrt(dot(a, a)); return [a[0] / l, a[1] / l, a[2] / l]; }
	function dist(a, b) { var d = sub(a, b); return Math.sqrt(dot(d, d)); }

	/** Triangles of mutually nearest vertices: the faces of the deltahedra. */
	function triangles(v) {
		var edge = Infinity, i, j, k;
		for (i = 0; i < v.length; i += 1) {
			for (j = i + 1; j < v.length; j += 1) { edge = Math.min(edge, dist(v[i], v[j])); }
		}
		var near = function (a, b) { return Math.abs(dist(v[a], v[b]) - edge) < edge * 0.01; };
		var faces = [];
		for (i = 0; i < v.length; i += 1) {
			for (j = i + 1; j < v.length; j += 1) {
				for (k = j + 1; k < v.length; k += 1) {
					if (near(i, j) && near(j, k) && near(i, k)) { faces.push([i, j, k]); }
				}
			}
		}
		return faces;
	}

	/** The dual: a vertex at each face's centre, a face round each old vertex. */
	function dual(solid) {
		var verts = solid.faces.map(function (f) {
			var c = [0, 0, 0];
			f.forEach(function (k) { c[0] += solid.v[k][0]; c[1] += solid.v[k][1]; c[2] += solid.v[k][2]; });
			return norm(c);
		});
		var faces = solid.v.map(function (p, vi) {
			var ring = [];
			solid.faces.forEach(function (f, fi) { if (f.indexOf(vi) >= 0) { ring.push(fi); } });
			/* Round the vertex in order. */
			var n = norm(p), ref = sub(verts[ring[0]], p);
			var up = cross(n, ref);
			ring.sort(function (a, b) {
				var da = sub(verts[a], p), db = sub(verts[b], p);
				return Math.atan2(dot(da, up), dot(da, ref)) - Math.atan2(dot(db, up), dot(db, ref));
			});
			return ring;
		});
		return { v: verts, faces: faces };
	}

	function solid(name) {
		var v;
		if (name === 'tetrahedron') { v = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]; }
		if (name === 'octahedron' || name === 'cube') {
			v = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
		}
		if (name === 'icosahedron' || name === 'dodecahedron') {
			v = [];
			[-1, 1].forEach(function (a) {
				[-PHI, PHI].forEach(function (b) { v.push([0, a, b], [a, b, 0], [b, 0, a]); });
			});
		}
		v = v.map(norm);
		var s = { v: v, faces: triangles(v) };
		if (name === 'cube' || name === 'dodecahedron') { s = dual(s); }
		/* Wind every face outward. */
		s.faces = s.faces.map(function (f) {
			var a = s.v[f[0]], n = cross(sub(s.v[f[1]], a), sub(s.v[f[2]], a));
			return dot(n, a) < 0 ? f.slice().reverse() : f;
		});
		return s;
	}

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	var patterns = {};

	/**
	 * Fill for brightness step 0..8 of a face: 0 black, 4 the dark colour,
	 * 8 the bright one, and dithered mixes between.
	 */
	function ditherFill(ctx, pair, step) {
		var key = pair[0] + pair[1] + step, c, g, x, y, lo, hi, k;
		if (step >= 8) {
			return pair[0];
		}
		if (step === 4) {
			return pair[1];
		}
		if (step <= 0) {
			return '#000';
		}
		if (!patterns[key]) {
			lo = step < 4 ? '#000' : pair[1];
			hi = step < 4 ? pair[1] : pair[0];
			k = step % 4;
			c = document.createElement('canvas');
			c.width = 2;
			c.height = 2;
			g = c.getContext('2d');
			for (y = 0; y < 2; y += 1) {
				for (x = 0; x < 2; x += 1) {
					g.fillStyle = BAYER[y][x] < k ? hi : lo;
					g.fillRect(x, y, 1, 1);
				}
			}
			patterns[key] = c;
		}
		return ctx.createPattern(patterns[key], 'repeat');
	}

	function GeoBounce() {
		this.shape = 'tetrahedron';
		this.size = 54;
		this.speed = 28;
		this.faces = 2;
	}

	GeoBounce.prototype.resize = function (w, h) {
		this.solid = solid(this.shape);
		this.r = Math.max(2, 0.4 * this.size * h / 768);
		this.x = rand(this.r, w - this.r);
		this.y = rand(this.r, h - this.r);
		var a = rand(0, Math.PI * 2), v = (40 + this.speed * 6) * h / 768;
		this.vx = Math.cos(a) * v;
		this.vy = Math.sin(a) * v;
		this.rx = rand(0, 6);
		this.ry = rand(0, 6);
		this.wx = rand(0.6, 1.4) * (0.5 + this.speed / 40);
		this.wy = rand(0.5, 1.2) * (0.5 + this.speed / 40);
	};

	GeoBounce.prototype.step = function (dt, ctx, w, h) {
		var r = this.r;
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		if (this.x < r) { this.x = r; this.vx = Math.abs(this.vx); }
		if (this.x > w - r) { this.x = w - r; this.vx = -Math.abs(this.vx); }
		if (this.y < r) { this.y = r; this.vy = Math.abs(this.vy); }
		if (this.y > h - r) { this.y = h - r; this.vy = -Math.abs(this.vy); }
		this.rx += this.wx * dt;
		this.ry += this.wy * dt;

		var cx = Math.cos(this.rx), sx = Math.sin(this.rx), cy = Math.cos(this.ry), sy = Math.sin(this.ry);
		var pts = this.solid.v.map(function (p) {
			var y1 = p[1] * cx - p[2] * sx, z1 = p[1] * sx + p[2] * cx;
			var x2 = p[0] * cy + z1 * sy, z2 = -p[0] * sy + z1 * cy;
			return [x2, y1, z2];
		});
		var light = norm([-0.4, -0.5, 1]);
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		var self = this;
		var visible = [];
		this.solid.faces.forEach(function (f, fi) {
			var a = pts[f[0]], n = norm(cross(sub(pts[f[1]], a), sub(pts[f[2]], a)));
			if (n[2] <= 0) { return; }
			visible.push({ f: f, n: n, fi: fi });
		});
		visible.forEach(function (v) {
			var pair = self.faces === 0 ? GREYS : HUES[v.fi % HUES.length];
			var lit = Math.max(0, dot(v.n, light));
			ctx.fillStyle = self.faces === 1 ? pair[0] : ditherFill(ctx, pair, Math.round(1 + lit * 7));
			ctx.beginPath();
			v.f.forEach(function (k, i) {
				var px = Math.round(self.x + pts[k][0] * r), py = Math.round(self.y + pts[k][1] * r);
				if (i) { ctx.lineTo(px, py); } else { ctx.moveTo(px, py); }
			});
			ctx.closePath();
			ctx.fill();
			ctx.strokeStyle = '#000';
			ctx.lineWidth = 1;
			ctx.stroke();
		});
	};

	function amount(el, name, names, fallback, lo, hi) {
		var v = AfterDark.setting(el, name);
		if (v === null || v === undefined) { return fallback; }
		v = String(v).toLowerCase().trim();
		if (names[v] !== undefined) { return names[v]; }
		v = parseFloat(v);
		return isNaN(v) ? fallback : Math.max(lo, Math.min(hi, v));
	}

	AfterDark.define('after-dark-geobounce', function (el) {
		var sim = new GeoBounce();
		sim.shape = SHAPES[AfterDark.choice(el, 'shape', SHAPES, 'tetrahedron')];
		sim.size = amount(el, 'size', SIZE_NAMES, 54, 10, 100);
		sim.speed = amount(el, 'speed', SPEED_NAMES, 28, 0, 100);
		sim.faces = AfterDark.choice(el, 'faces', FACES, 'both');
		return sim;
	});

	window.AfterDarkGeoBounce = GeoBounce;
	GeoBounce.solid = solid;
}());
