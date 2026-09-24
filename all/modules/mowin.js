/**
 * mowin.js - Mowin' Man, the lawn that grows over your screen.
 *
 * MOWIN.AD's own description:
 *
 *   "MOWIN' MAN (tm) is dedicated to the 'weekend warriors' who face the
 *    ongoing struggle of taming their yards. When we called to inform Glenn
 *    that Mowin' Man was an After Dark Contest award winner, his wife had to
 *    call him in from mowing the lawn. No joke."
 *
 * Its controls are Speed (Pokey, Normal, Hurried, Menace), Mow Every (Always,
 * Day, 2 Days ... Week), Clear Screen First and Growth Rate (None, Slow,
 * Medium, Fast). Its art, in all/art/mowin/: the man on his ride-on mower
 * from behind, from in front and from each side, the six flowers Meadow also
 * has, and three bitmaps of grass - each one a single blade at a different
 * height, bright at the tip and dark at the root.
 *
 * So the grass comes up over the screen a blade at a time, flowers and all,
 * and he mows it in stripes, back and forth, a lane at a time down the
 * screen, leaving it bare behind him to grow again at the Growth Rate. Mow
 * Every is how long he leaves it between mowings; a "day" here is fifteen
 * seconds of screen time.
 *
 *   <after-dark-mowin-man art="art/mowin" speed="normal" mow-every="always" growth-rate="medium">
 */
(function () {
	'use strict';

	var SPEEDS = ['pokey', 'normal', 'hurried', 'menace'];
	var PACE = [45, 85, 150, 280];
	var EVERY = ['always', 'day', '2 days', '3 days', '4 days', '5 days', '6 days', 'week'];
	var DAY = 15;
	var GROWTH = ['none', 'slow', 'medium', 'fast'];
	/* Seconds a blade takes to grow a stage. */
	var GROW = [Infinity, 30, 12, 5];
	var FLOWERS = [[4, 30], [37, 30], [66, 28], [97, 31], [132, 24], [158, 26]];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function MowinMan() {
		this.pace = PACE[1];
		this.every = 0;
		this.grow = GROW[2];
		this.clearScreen = true;
		this.art = null;
	}

	MowinMan.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.s = Math.max(1, Math.round(Math.min(w, h) / 480));
		this.lawn = document.createElement('canvas');
		this.lawn.width = Math.max(1, Math.round(w));
		this.lawn.height = Math.max(1, Math.round(h));
		this.ground = this.clearScreen ? null : AfterDark.desktop(w, h);
		var g = this.lawn.getContext('2d');
		this.bare(g, 0, 0, w, h);
		/* Blades live in bands, so a pass of the mower only looks at its own. */
		this.band = 16 * this.s;
		this.bands = [];
		for (var b = 0; b < Math.ceil(h / this.band) + 1; b += 1) { this.bands.push([]); }
		this.target = Math.round(w * h / (14 * this.s * this.s));
		this.count = 0;
		this.flowers = [];
		this.mower = null;
		/* Give the lawn a chance to come up before the first mowing. */
		this.rest = 18 + this.every;
		this.t = 0;
	};

	/** What is under the grass: black, or the desktop if Clear Screen First is off. */
	MowinMan.prototype.bare = function (g, x, y, w, h) {
		if (this.ground) {
			g.drawImage(this.ground, x, y, w, h, x, y, w, h);
		} else {
			g.fillStyle = '#000';
			g.fillRect(x, y, w, h);
		}
	};

	MowinMan.prototype.blade = function (g, b) {
		if (b.stage < 0) { return; }
		var img = this.art.bitmap('blade' + b.stage).image, s = this.s;
		g.drawImage(img, 0, 0, 1, img.height, b.x, b.y - img.height * s, s, img.height * s);
	};

	MowinMan.prototype.sprout = function () {
		var s = this.s, b = { x: Math.floor(rand(0, this.w / s)) * s, y: Math.floor(rand(4, this.h)), stage: 0,
			next: this.grow * rand(0.5, 1.5) };
		this.bands[Math.floor(b.y / this.band)].push(b);
		this.count += 1;
		this.blade(this.lawn.getContext('2d'), b);
		/* Now and then a flower comes up with the grass. */
		if (Math.random() < 0.0015) {
			var f = { x: b.x, y: b.y, kind: Math.floor(Math.random() * 6) };
			this.flowers.push(f);
			var c = FLOWERS[f.kind], fl = this.art.bitmap('flowers').image;
			this.lawn.getContext('2d').drawImage(fl, c[0], 0, c[1], 37, f.x - c[1] * s / 2, f.y - 37 * s, c[1] * s, 37 * s);
		}
	};

	/** Cut everything under the deck: bare it, put back short blades, and lose the flowers. */
	MowinMan.prototype.mow = function (x, y, w, h) {
		var g = this.lawn.getContext('2d'), self = this;
		x = Math.max(0, x);
		this.bare(g, x, y, w, h);
		var top = Math.floor(y / this.band), bottom = Math.floor((y + h + 8 * this.s) / this.band);
		for (var k = Math.max(0, top); k <= Math.min(this.bands.length - 1, bottom); k += 1) {
			this.bands[k].forEach(function (b) {
				if (b.x >= x && b.x < x + w && b.y >= y && b.y - 8 * self.s < y + h) {
					/* Cut to nothing; it comes back through all three heights. */
					b.stage = -1;
					b.next = self.grow * rand(0.5, 1.5);
				}
				if (b.x >= x - 1 && b.x < x + w + 1 && b.y >= y - 1 && b.y - 8 * self.s < y + h + 8 * self.s) {
					self.blade(g, b);
				}
			});
		}
		this.flowers = this.flowers.filter(function (f) {
			return !(f.x >= x && f.x < x + w && f.y >= y && f.y - 20 * self.s < y + h);
		});
	};

	/** A new mowing: from the top left, lane by lane. */
	MowinMan.prototype.start = function () {
		var side = this.art.bitmap('left');
		this.lane = Math.round(side.height * this.s * 0.45);
		/* Placed so the first strip he cuts is the top of the screen. */
		this.mower = { x: -side.width * this.s, y: this.lane - side.height * this.s, dir: 1, turning: 0 };
	};

	MowinMan.prototype.step = function (dt, ctx, w, h) {
		ctx.drawImage(this.lawn, 0, 0, w, h);
		if (!this.art) { return; }
		this.t += dt;
		var i, s = this.s;
		/* The lawn fills in; after that the mown blades grow back. */
		var sprouts = Math.min(this.target - this.count, Math.ceil(this.target * dt / 25));
		for (i = 0; i < sprouts; i += 1) { this.sprout(); }
		if (this.grow < Infinity) {
			var g = this.lawn.getContext('2d');
			var band = this.bands[Math.floor(Math.random() * this.bands.length)];
			for (i = 0; i < band.length; i += 1) {
				var b = band[i];
				b.next -= dt * this.bands.length;
				if (b.next <= 0 && b.stage < 2) {
					b.stage += 1;
					b.next = this.grow * rand(0.5, 1.5);
					this.blade(g, b);
				}
			}
		}

		if (!this.mower) {
			this.rest -= dt;
			if (this.rest <= 0) { this.start(); }
			return;
		}
		var m = this.mower, pace = this.pace * s;
		var img = m.turning ? this.art.bitmap('down') : this.art.bitmap(m.dir > 0 ? 'right' : 'left');
		var mw = img.width * s, mh = img.height * s;
		if (m.turning) {
			m.y += pace * dt;
			m.turning -= pace * dt;
			if (m.turning <= 0) {
				m.turning = 0;
				m.dir = -m.dir;
			}
			this.mow(m.x + mw * 0.1, m.y + mh * 0.5, mw * 0.8, mh * 0.5);
		} else {
			m.x += m.dir * pace * dt;
			/* The deck is under the middle of him; it cuts a lane's worth. */
			this.mow(m.x + mw * 0.15, m.y + mh - this.lane - 2 * s, mw * 0.7, this.lane + 2 * s);
			var off = m.dir > 0 ? m.x > w : m.x + mw < 0;
			var atEnd = m.dir > 0 ? m.x + mw * 0.85 >= w : m.x + mw * 0.15 <= 0;
			if (atEnd && m.y + mh + this.lane < h + this.lane * 0.6) {
				/* Turn at the end of the lane: face the camera, come down one lane. */
				m.turning = this.lane;
				var down = this.art.bitmap('down');
				m.x = m.dir > 0 ? w - down.width * s : 0;
			} else if (off) {
				this.mower = null;
				this.rest = Math.max(this.every, 1.5);
				return;
			}
		}
		img = m.turning ? this.art.bitmap('down') : this.art.bitmap(m.dir > 0 ? 'right' : 'left');
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(img.image, Math.round(m.x), Math.round(m.y), img.width * s, img.height * s);
	};

	AfterDark.define('after-dark-mowin-man', function (el) {
		var sim = new MowinMan();
		sim.pace = PACE[AfterDark.choice(el, 'speed', SPEEDS, 'normal')];
		sim.every = AfterDark.choice(el, 'mow-every', EVERY, 'always') * DAY;
		sim.grow = GROW[AfterDark.choice(el, 'growth-rate', GROWTH, 'medium')];
		sim.clearScreen = AfterDark.flag(el, 'clear-screen');
		AfterDark.load(AfterDark.setting(el, 'art') || 'art/mowin').then(function (art) {
			sim.art = art;
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkMowinMan = MowinMan;
}());
