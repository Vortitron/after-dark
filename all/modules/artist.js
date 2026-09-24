/**
 * artist.js - The Artist, repainting a picture stroke by stroke.
 *
 * ARTIST.AD's own description:
 *
 *   "ARTIST - Ever aspire to be a Van Gogh or a Matisse? Watch the Artist at
 *    work as it applies a variety of interesting effects to pictures. But
 *    remember you must be patient, a true masterpiece takes time and so does
 *    the Artist. 'Medium' allows you to choose what effect to apply. 'Detail'
 *    determines the detail level of the final image. 'Delay' chooses how long
 *    the image lasts before it's redrawn. 'Select Image' enables you to
 *    select which images to use. Enjoy the ones provided or load your
 *    favorite image."
 *
 * Medium is Aquarelle, Chalk, Pastel, Felt-Tip in four directions (/ \ -- |)
 * or Random; Detail is Abstract, Coarse or Fine. The images it provided -
 * Control Panel, Window, Trash, Inside Desk, Icons and so on, by their names
 * in its string table - did not survive in this install, so it paints what
 * the rest of the site has: the Windows 95 desktop ad.js draws, or a part of
 * it, or the pictures from Slide Show's PICTURES folder.
 *
 *   <after-dark-artist medium="random" detail="coarse" delay="10 seconds" image="desktop" pictures="art/slide">
 */
(function () {
	'use strict';

	var MEDIA = ['aquarelle', 'chalk', 'pastel', 'felt-tip /', 'felt-tip \\', 'felt-tip --', 'felt-tip |', 'random'];
	var DETAILS = ['abstract', 'coarse', 'fine'];
	var STROKE = [26, 12, 6];
	var DELAYS = ['no delay', '5 seconds', '10 seconds', '15 seconds', '30 seconds', '1 minute', '5 minutes'];
	var WAIT = [0.5, 5, 10, 15, 30, 60, 300];
	var IMAGES = ['desktop', 'window', 'icons', 'pictures', 'all'];
	var PAPER = { aquarelle: '#f4f0e6', chalk: '#262a2c', pastel: '#d8c8a8' };

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Artist() {
		this.medium = 'random';
		this.stroke = STROKE[1];
		this.wait = WAIT[2];
		this.image = 'desktop';
		this.pictures = null;
	}

	Artist.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.canvas = document.createElement('canvas');
		this.canvas.width = Math.max(1, Math.round(w));
		this.canvas.height = Math.max(1, Math.round(h));
		this.begin();
	};

	/** The picture to paint, as pixels the size of the screen. */
	Artist.prototype.subject = function () {
		var w = this.w, h = this.h, desk = AfterDark.desktop(w, h);
		var kind = this.image === 'all' ? IMAGES[Math.floor(Math.random() * 4)] : this.image;
		if (kind === 'pictures' && !this.pictures) { kind = 'desktop'; }
		var src = desk, sx = 0, sy = 0, sw = w, sh = h;
		if (kind === 'window') {
			/* The Notepad window, filling the screen. */
			sx = w * 0.2; sy = h * 0.3; sw = Math.min(400, w * 0.5); sh = Math.min(260, h * 0.5);
		} else if (kind === 'icons') {
			sx = 0; sy = 0; sw = 80; sh = Math.min(h - 28, 430);
		} else if (kind === 'pictures') {
			var names = this.pictures.catalog, bmp = this.pictures.art.bitmap(names[Math.floor(Math.random() * names.length)]);
			src = bmp.image; sw = bmp.width; sh = bmp.height;
		}
		var c = document.createElement('canvas');
		c.width = Math.max(1, Math.round(w));
		c.height = Math.max(1, Math.round(h));
		var g = c.getContext('2d', { willReadFrequently: true });
		var k = Math.min(w / sw, h / sh);
		g.fillStyle = '#008080';
		g.fillRect(0, 0, w, h);
		g.drawImage(src, sx, sy, sw, sh, (w - sw * k) / 2, (h - sh * k) / 2, sw * k, sh * k);
		return g.getImageData(0, 0, c.width, c.height);
	};

	Artist.prototype.begin = function () {
		this.pixels = this.subject();
		this.now = this.medium === 'random' ? MEDIA[Math.floor(Math.random() * 7)] : this.medium;
		var g = this.canvas.getContext('2d');
		g.fillStyle = PAPER[this.now] || '#ffffff';
		g.fillRect(0, 0, this.w, this.h);
		var s = this.stroke * Math.max(1, Math.min(this.w, this.h) / 480);
		this.size = s;
		/* Enough strokes to cover the paper a few times over, big ones first. */
		this.total = Math.round(this.w * this.h / (s * s) * (this.now === 'aquarelle' ? 6 : 4));
		this.done = 0;
		this.rest = 0;
	};

	Artist.prototype.colourAt = function (x, y) {
		var p = this.pixels, i = (Math.min(p.height - 1, Math.max(0, Math.round(y))) * p.width +
			Math.min(p.width - 1, Math.max(0, Math.round(x)))) * 4;
		return [p.data[i], p.data[i + 1], p.data[i + 2]];
	};

	Artist.prototype.dab = function (g) {
		var x = rand(0, this.w), y = rand(0, this.h), c = this.colourAt(x, y);
		/* The first strokes are broad; later ones fine in the detail. */
		var s = this.size * (this.done < this.total * 0.3 ? 2 : 1) * rand(0.6, 1.2);
		var rgb = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
		var m = this.now, ang;
		if (m === 'aquarelle') {
			var grad = g.createRadialGradient(x, y, 0, x, y, s);
			grad.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.35)');
			grad.addColorStop(0.7, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.18)');
			grad.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
			g.fillStyle = grad;
			g.beginPath();
			g.ellipse(x, y, s, s * rand(0.6, 1), rand(0, Math.PI), 0, Math.PI * 2);
			g.fill();
		} else if (m === 'chalk') {
			/* Short grainy strokes: a line broken up by the paper. */
			ang = rand(-0.4, 0.4) - 0.8;
			g.fillStyle = rgb;
			for (var i = 0; i < s * 5; i += 1) {
				var t = rand(-1, 1) * s, o = rand(-0.25, 0.25) * s;
				if (Math.random() < 0.25) { continue; }
				g.fillRect(x + Math.cos(ang) * t - Math.sin(ang) * o, y + Math.sin(ang) * t + Math.cos(ang) * o, 2, 2);
			}
		} else if (m === 'pastel') {
			ang = rand(0, Math.PI);
			g.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.6)';
			g.lineWidth = s * 0.45;
			g.lineCap = 'round';
			g.beginPath();
			g.moveTo(x - Math.cos(ang) * s, y - Math.sin(ang) * s);
			g.quadraticCurveTo(x + rand(-0.4, 0.4) * s, y + rand(-0.4, 0.4) * s, x + Math.cos(ang) * s, y + Math.sin(ang) * s);
			g.stroke();
		} else {
			ang = { 'felt-tip /': -Math.PI / 4, 'felt-tip \\': Math.PI / 4, 'felt-tip --': 0, 'felt-tip |': Math.PI / 2 }[m];
			g.strokeStyle = rgb;
			g.lineWidth = Math.max(1.5, s * 0.22);
			g.lineCap = 'round';
			g.beginPath();
			g.moveTo(x - Math.cos(ang) * s, y - Math.sin(ang) * s);
			g.lineTo(x + Math.cos(ang) * s, y + Math.sin(ang) * s);
			g.stroke();
		}
	};

	Artist.prototype.step = function (dt, ctx, w, h) {
		var g = this.canvas.getContext('2d');
		if (this.done < this.total) {
			/* A masterpiece takes time: about forty seconds of it. */
			var n = Math.ceil(this.total * dt / 40);
			for (var i = 0; i < n && this.done < this.total; i += 1) {
				this.dab(g);
				this.done += 1;
			}
		} else {
			this.rest += dt;
			if (this.rest > this.wait) { this.begin(); }
		}
		ctx.drawImage(this.canvas, 0, 0, w, h);
	};

	AfterDark.define('after-dark-artist', function (el) {
		var sim = new Artist();
		sim.medium = MEDIA[AfterDark.choice(el, 'medium', MEDIA, 'random')];
		sim.stroke = STROKE[AfterDark.choice(el, 'detail', DETAILS, 'coarse')];
		sim.wait = WAIT[AfterDark.choice(el, 'delay', DELAYS, '10 seconds')];
		sim.image = IMAGES[AfterDark.choice(el, 'image', IMAGES, 'desktop')];
		var base = AfterDark.setting(el, 'pictures') || 'art/slide';
		Promise.all([AfterDark.load(base), AfterDark.data(base)]).then(function (both) {
			sim.pictures = { art: both[0], catalog: both[1].catalogs.pictures };
			if (sim.image === 'pictures' && sim.w) { sim.begin(); }
		}).catch(function () {
			/* Then it paints the desktop. */
		});
		return sim;
	});

	window.AfterDarkArtist = Artist;
}());
