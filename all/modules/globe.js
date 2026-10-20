/**
 * globe.js - Globe, a bitmap wrapped round a spinning sphere.
 *
 * GLOBE.AD draws itself, but not from nothing. Its own description:
 *
 *   "GLOBE (tm) takes a bitmap, wraps it around a sphere, and displays the
 *    rotating image. The bitmap must be bigger than 60 by 60 and less than
 *    300 vertical by 500 horizontal. Globe art by Igor Gasowski."
 *
 * The bitmaps it came with sit beside the modules in BITMAPS/: EARTH.BMP, a
 * 322x156 16-colour map of the world with its clouds on, the After Dark logo
 * and a toaster. Those are what `map` picks between, straight out of the
 * install, in all/art/globe/.
 *
 * Checked against the real module under Wine (8-bit). It reads its picture
 * from AD_PREFS.INI, [After Dark] GlobeFile=; with none it says "No picture
 * is selected." Given EARTH.BMP:
 *   - The globe is the map's height across - 150x154 px for the 322x156
 *     Earth - at the same size on any screen, the map stretched round it.
 *   - The axis is upright; nothing is shaded. The panel's "Rotation" is a
 *     spin rate in degrees (at 0 the globe stood still), not a tilt, so the
 *     tilt below is ours and defaults to none.
 *   - It travels only on the diagonals, bouncing off the edges. Under Wine it
 *     did that (unthrottled, several hundred px/s) only with no settings
 *     stored; with the panel's defaults written out it stayed put, and with
 *     Speed 0 it crept at 14 px/s. Which of those a real install showed is
 *     not settled; this keeps the wandering, at a modest pace.
 *   - Mirror (None, Horizontal, Vertical, Both) flips the picture.
 *
 *   <after-dark-globe art="art/globe" map="earth" speed="medium" tilt="0" mirror="none">
 */
(function () {
	'use strict';

	var MAPS = ['earth', 'after dark', 'toaster'];
	var SPEEDS = ['slowest', 'slow', 'medium', 'fast', 'fastest'];
	/* Turns a minute. */
	var TURNS = [1.5, 3, 6, 12, 24];
	var TILTS = ['0', '23', '45', '90'];
	/* The control panel's Mirror: which way the picture is flipped on the globe. */
	var MIRRORS = ['none', 'horizontal', 'vertical', 'both'];
	/* Pixels a second along each axis. Under Wine it ran unthrottled, several
	   hundred a second; this is a guess at a machine of its day. */
	var DRIFT = 60;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	/**
	 * For every pixel of a disc of radius r, where it lands on the map: u is
	 * longitude as a fraction of a turn, v latitude from the north pole down.
	 * Tilt leans the axis toward the viewer by that many degrees.
	 */
	function project(r, tiltDeg) {
		var size = r * 2;
		var u = new Float32Array(size * size);
		var v = new Float32Array(size * size);
		var inside = new Uint8Array(size * size);
		var t = tiltDeg * Math.PI / 180;
		var ct = Math.cos(t), st = Math.sin(t);
		for (var j = 0; j < size; j += 1) {
			for (var i = 0; i < size; i += 1) {
				var nx = (i + 0.5 - r) / r;
				var ny = (j + 0.5 - r) / r;
				var d = nx * nx + ny * ny;
				if (d > 1) { continue; }
				var nz = Math.sqrt(1 - d);
				/* Tip the sphere forward about the screen's x axis. */
				var y = ny * ct - nz * st;
				var z = ny * st + nz * ct;
				var k = j * size + i;
				inside[k] = 1;
				u[k] = Math.atan2(nx, z) / (2 * Math.PI) + 0.5;
				v[k] = Math.acos(Math.max(-1, Math.min(1, -y))) / Math.PI;
			}
		}
		return { r: r, size: size, u: u, v: v, inside: inside };
	}

	function Globe() {
		this.turns = TURNS[2];
		this.tilt = 0;
		this.mirror = 0;
		this.map = null;
		this.spin = 0;
	}

	Globe.prototype.setMap = function (image) {
		var c = document.createElement('canvas');
		c.width = image.width;
		c.height = image.height;
		var g = c.getContext('2d');
		g.drawImage(image, 0, 0);
		this.map = { w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
		/* Pole to pole down the middle of the disc is the map's height (the
		   156-row Earth came out 150x154 on a 1024x768 screen), so the map is
		   stretched round the equator rather than drawn at its own width. */
		this.proj = project(Math.max(30, Math.round(c.height / 2)), this.tilt);
		this.canvas = document.createElement('canvas');
		this.canvas.width = this.canvas.height = this.proj.size;
		this.out = this.canvas.getContext('2d').createImageData(this.proj.size, this.proj.size);
		if (this.w) { this.resize(this.w, this.h); }
	};

	Globe.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		/* Drawn at its own pixel size, as the original was on any screen. */
		this.scale = 1;
		if (!this.proj) { return; }
		var d = this.proj.size * this.scale;
		this.x = rand(0, Math.max(0, w - d));
		this.y = rand(0, Math.max(0, h - d));
		/* It only ever travels on the diagonals, bouncing off the edges. */
		this.vx = (Math.random() < 0.5 ? -1 : 1) * DRIFT;
		this.vy = (Math.random() < 0.5 ? -1 : 1) * DRIFT;
	};

	Globe.prototype.paint = function () {
		var p = this.proj, m = this.map, out = this.out.data;
		var shift = this.spin;
		for (var k = 0; k < p.inside.length; k += 1) {
			var o = k * 4;
			if (!p.inside[k]) {
				out[o + 3] = 0;
				continue;
			}
			var mu = p.u[k] - shift;
			mu -= Math.floor(mu);
			var mx = Math.min(m.w - 1, Math.floor(mu * m.w));
			var my = Math.min(m.h - 1, Math.floor(p.v[k] * m.h));
			if (this.mirror & 1) { mx = m.w - 1 - mx; }
			if (this.mirror & 2) { my = m.h - 1 - my; }
			var s = (my * m.w + mx) * 4;
			out[o] = m.data[s];
			out[o + 1] = m.data[s + 1];
			out[o + 2] = m.data[s + 2];
			out[o + 3] = 255;
		}
		this.canvas.getContext('2d').putImageData(this.out, 0, 0);
	};

	Globe.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.map) { return; }
		this.spin = (this.spin + this.turns / 60 * dt) % 1;
		var d = this.proj.size * this.scale;
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		if (this.x < 0) { this.x = 0; this.vx = Math.abs(this.vx); }
		if (this.y < 0) { this.y = 0; this.vy = Math.abs(this.vy); }
		if (this.x + d > w) { this.x = Math.max(0, w - d); this.vx = -Math.abs(this.vx); }
		if (this.y + d > h) { this.y = Math.max(0, h - d); this.vy = -Math.abs(this.vy); }
		this.paint();
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(this.canvas, Math.round(this.x), Math.round(this.y), d, d);
	};

	AfterDark.define('after-dark-globe', function (el) {
		var sim = new Globe();
		sim.turns = TURNS[AfterDark.choice(el, 'speed', SPEEDS, 'medium')];
		sim.tilt = Number(TILTS[AfterDark.choice(el, 'tilt', TILTS, '0')]);
		sim.mirror = AfterDark.choice(el, 'mirror', MIRRORS, 'none');
		var which = MAPS[AfterDark.choice(el, 'map', MAPS, 'earth')];
		AfterDark.load(AfterDark.setting(el, 'art') || 'art/globe').then(function (art) {
			var bmp = art.bitmap(which) || art.bitmap('earth');
			sim.setMap(bmp.image);
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkGlobe = Globe;
	Globe.project = project;
}());
