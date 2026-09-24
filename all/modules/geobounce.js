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
 * Its controls are Shape (Tetrahedron, Cube, Octahedron, Dodecahedron,
 * Icosahedron), Size, Speed and Faces (Shading, Colors, Both). The solid
 * tumbles as it bounces. The triangular ones are built from their vertices;
 * the cube and dodecahedron are the duals of the octahedron and icosahedron.
 *
 *   <after-dark-geobounce shape="icosahedron" size="medium" speed="medium" faces="both">
 */
(function () {
	'use strict';

	var SHAPES = ['tetrahedron', 'cube', 'octahedron', 'dodecahedron', 'icosahedron', 'random'];
	var SIZES = ['small', 'medium', 'large'];
	var RADIUS = [0.12, 0.2, 0.3];
	var SPEEDS = ['slow', 'medium', 'fast'];
	var PACE = [0.15, 0.3, 0.55];
	var FACES = ['shading', 'colors', 'both'];
	var COLOURS = [[255, 85, 85], [85, 255, 85], [85, 85, 255], [255, 255, 85], [85, 255, 255], [255, 85, 255],
		[255, 170, 0], [170, 85, 255], [255, 255, 255], [0, 170, 170], [170, 0, 0], [0, 170, 0],
		[255, 128, 170], [128, 128, 255], [255, 210, 150], [160, 255, 160], [200, 200, 200], [255, 120, 60],
		[120, 200, 255], [230, 230, 120]];
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

	function GeoBounce() {
		this.shape = 'cube';
		this.radius = RADIUS[1];
		this.pace = PACE[1];
		this.faces = 2;
	}

	GeoBounce.prototype.resize = function (w, h) {
		var name = this.shape === 'random' ? SHAPES[Math.floor(Math.random() * 5)] : this.shape;
		this.solid = solid(name);
		this.r = Math.min(w, h) * this.radius;
		this.x = rand(this.r, w - this.r);
		this.y = rand(this.r, h - this.r);
		var a = rand(0, Math.PI * 2), v = Math.min(w, h) * this.pace;
		this.vx = Math.cos(a) * v;
		this.vy = Math.sin(a) * v;
		this.rx = rand(0, 6);
		this.ry = rand(0, 6);
		this.wx = rand(0.4, 1.2);
		this.wy = rand(0.3, 1);
	};

	GeoBounce.prototype.step = function (dt, ctx, w, h) {
		var r = this.r;
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		/* Off the walls - the bump spins it a bit faster for a moment. */
		if (this.x < r) { this.x = r; this.vx = Math.abs(this.vx); this.wy += 0.3; }
		if (this.x > w - r) { this.x = w - r; this.vx = -Math.abs(this.vx); this.wy -= 0.3; }
		if (this.y < r) { this.y = r; this.vy = Math.abs(this.vy); this.wx += 0.3; }
		if (this.y > h - r) { this.y = h - r; this.vy = -Math.abs(this.vy); this.wx -= 0.3; }
		this.wx += (0.7 * Math.sign(this.wx || 1) - this.wx) * dt * 0.3;
		this.wy += (0.6 * Math.sign(this.wy || 1) - this.wy) * dt * 0.3;
		this.rx += this.wx * dt;
		this.ry += this.wy * dt;

		var cx = Math.cos(this.rx), sx = Math.sin(this.rx), cy = Math.cos(this.ry), sy = Math.sin(this.ry);
		var pts = this.solid.v.map(function (p) {
			var y1 = p[1] * cx - p[2] * sx, z1 = p[1] * sx + p[2] * cx;
			var x2 = p[0] * cy + z1 * sy, z2 = -p[0] * sy + z1 * cy;
			return [x2, y1, z2];
		});
		var light = norm([-0.5, -0.7, 1]);
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		var self = this;
		var visible = [];
		this.solid.faces.forEach(function (f, fi) {
			var a = pts[f[0]], n = norm(cross(sub(pts[f[1]], a), sub(pts[f[2]], a)));
			if (n[2] <= 0) { return; }
			visible.push({ f: f, n: n, fi: fi, z: f.reduce(function (s, k) { return s + pts[k][2]; }, 0) / f.length });
		});
		visible.sort(function (a, b) { return a.z - b.z; });
		visible.forEach(function (v) {
			var lum = self.faces === 1 ? 1 : 0.25 + 0.75 * Math.max(0, dot(v.n, light));
			var base = self.faces === 0 ? [200, 200, 200] : COLOURS[v.fi % COLOURS.length];
			ctx.fillStyle = 'rgb(' + Math.round(base[0] * lum) + ',' + Math.round(base[1] * lum) + ',' +
				Math.round(base[2] * lum) + ')';
			ctx.beginPath();
			v.f.forEach(function (k, i) {
				var px = self.x + pts[k][0] * r, py = self.y + pts[k][1] * r;
				if (i) { ctx.lineTo(px, py); } else { ctx.moveTo(px, py); }
			});
			ctx.closePath();
			ctx.fill();
			ctx.strokeStyle = '#000';
			ctx.lineWidth = 1;
			ctx.stroke();
		});
	};

	AfterDark.define('after-dark-geobounce', function (el) {
		var sim = new GeoBounce();
		sim.shape = SHAPES[AfterDark.choice(el, 'shape', SHAPES, 'random')];
		sim.radius = RADIUS[AfterDark.choice(el, 'size', SIZES, 'medium')];
		sim.pace = PACE[AfterDark.choice(el, 'speed', SPEEDS, 'medium')];
		sim.faces = AfterDark.choice(el, 'faces', FACES, 'both');
		return sim;
	});

	window.AfterDarkGeoBounce = GeoBounce;
	GeoBounce.solid = solid;
}());
