/**
 * modern.js - Modern Art, three painters' manners.
 *
 * MODERN.AD's control panel has one real control, Style: Griddy, Fuzzy,
 * Splotchy or Random. (The rest - Idle Time in kWh, Defrost, Washer Karma -
 * was left over from Om Appliances, which the Windows version was built from,
 * and does nothing.) What is left of its description names two of the
 * painters: "...of Russian-born American Abstract Expressionist painter Mark
 * Rothko (1903 - 1970). POLLOCK-LIKE reminds us ever so slightly of the work
 * of Jackson Pollock (1912 - 1956), the American Abstract Expressionist drip
 * painter. Splotch artwork by Igor Gasowski." Griddy is Mondrian.
 *
 * Checked against MODERN.AD under Wine (8-bit, 1024x768, Style Random): every
 * picture is on a black screen and lasts seven to eleven seconds, and the
 * styles come round in turn.
 *  - Splotchy throws the module's own splotch, shaded in 256 colours and
 *    recoloured through its five palettes (RED8, BLUE8, ORANGE8, PURPLE8,
 *    GREEN8; all/art/modern/), one every second and a half or so, at sizes
 *    from a quarter to about the whole 256-pixel bitmap; now and then one
 *    runs: a single drip creeps straight down from its foot.
 *  - Fuzzy appears all at once: three soft-edged, round-cornered bands
 *    stacked down the screen, nearly its full width, the lower ones taller,
 *    on a dark ground.
 *  - Griddy is a small square canvas, about a third of the screen's height,
 *    somewhere on the black: full-length black lines ruling it into a grid,
 *    a few of their segments left out, and a block or two of colour.
 * The 8-bit capture's colours are not to be trusted, so the colours (the
 * Rothko grounds, the Mondrian primaries) are still chosen here, as are the
 * exact line counts and timings.
 *
 *   <after-dark-modern-art art="art/modern" style="random">
 */
(function () {
	'use strict';

	var STYLES = ['griddy', 'fuzzy', 'splotchy', 'random'];
	var COLOURS = ['red', 'blue', 'orange', 'purple', 'green'];
	var PRIMARY = ['#d42020', '#1c3fa8', '#f2d21e'];
	var ROTHKO = [['#6e1a14', '#c43c1c', '#e8862a', '#3a0e10'], ['#1a2440', '#3c5a8c', '#8aa6c4', '#101828'],
		['#c46a1c', '#f2c040', '#e8e2c8', '#8a3a10'], ['#3a1030', '#7c2450', '#d86a54', '#1c0a18'],
		['#28341c', '#5c7c3c', '#b4b46c', '#141a0c']];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	function ModernArt() {
		this.style = 'random';
		this.art = null;
	}

	ModernArt.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.canvas = document.createElement('canvas');
		this.canvas.width = Math.max(1, Math.round(w));
		this.canvas.height = Math.max(1, Math.round(h));
		this.begin();
	};

	ModernArt.prototype.begin = function () {
		var w = this.w, h = this.h, g = this.canvas.getContext('2d');
		if (this.style === 'random') {
			/* Round the three in turn, starting anywhere. */
			this.turn = this.turn === undefined ? Math.floor(Math.random() * 3) : (this.turn + 1) % 3;
			this.now = STYLES[this.turn];
		} else {
			this.now = this.style;
		}
		this.at = 0;
		this.clock = 0;
		this.age = 0;
		g.fillStyle = '#000';
		g.fillRect(0, 0, w, h);
		if (this.now === 'griddy') {
			this.plan = this.mondrian(w, h);
			this.life = 8;
		} else if (this.now === 'fuzzy') {
			this.plan = this.rothko(w, h, pick(ROTHKO));
			this.life = 11;
		} else {
			this.plan = this.pollock(w, h);
			this.life = 8;
		}
	};

	/* --------------------------------------------------------- the plans --
	   Each is a list of jobs, each with the second it is done at. */

	ModernArt.prototype.mondrian = function (w, h) {
		var side = Math.round(Math.min(w, h) * 0.35), x0 = Math.round(rand(0, w - side)), y0 = Math.round(rand(0, h - side));
		var lw = Math.max(2, Math.round(side / 80)), jobs = [{ at: 0, canvas: [x0, y0, side] }];
		function cuts() {
			var n = 4 + Math.floor(Math.random() * 3), out = [0];
			for (var i = 1; i <= n; i += 1) { out.push(Math.round(side * (i + rand(-0.3, 0.3)) / (n + 1))); }
			out.push(side);
			return out;
		}
		var xs = cuts(), ys = cuts(), i, k;
		/* A block or two of colour, filling a cell. */
		var blocks = 1 + Math.floor(Math.random() * 2);
		for (k = 0; k < blocks; k += 1) {
			var c = 1 + Math.floor(Math.random() * (xs.length - 2)), r = 1 + Math.floor(Math.random() * (ys.length - 2));
			jobs.push({ at: 0, fill: { x: x0 + xs[c - 1], y: y0 + ys[r - 1], w: xs[c] - xs[c - 1], h: ys[r] - ys[r - 1] },
				colour: pick(PRIMARY) });
		}
		/* The rules, cell edge by cell edge, some segments left out. */
		for (i = 1; i < xs.length - 1; i += 1) {
			for (k = 0; k < ys.length - 1; k += 1) {
				if (Math.random() < 0.85) { jobs.push({ at: 0, line: [x0 + xs[i], y0 + ys[k], x0 + xs[i], y0 + ys[k + 1]] }); }
			}
		}
		for (i = 1; i < ys.length - 1; i += 1) {
			for (k = 0; k < xs.length - 1; k += 1) {
				if (Math.random() < 0.85) { jobs.push({ at: 0, line: [x0 + xs[k], y0 + ys[i], x0 + xs[k + 1], y0 + ys[i]] }); }
			}
		}
		jobs.push({ at: 0, frame: [x0, y0, side] });
		jobs.lw = lw;
		return jobs;
	};

	ModernArt.prototype.rothko = function (w, h, set) {
		var jobs = [{ at: 0, ground: set[3] }], mx = w * 0.04, gap = h * 0.06, my = h * 0.05;
		var parts = [0.2, 0.3, 0.38], total = h - 2 * my - 2 * gap, y = my;
		for (var i = 0; i < 3; i += 1) {
			var bh = total * parts[i] / 0.88;
			jobs.push({ at: 0, band: { x: mx + rand(-0.5, 0.5) * mx, y: y, w: w - 2 * mx, h: bh }, colour: set[i] });
			y += bh + gap;
		}
		return jobs;
	};

	ModernArt.prototype.pollock = function (w, h) {
		var jobs = [];
		for (var t = 0.2; t < 7.5; t += rand(1.2, 1.9)) {
			var colour = pick(COLOURS), k = rand(0.25, 1) * Math.max(1, Math.min(w, h) / 768);
			var x = rand(0, w), y = rand(0, h);
			jobs.push({ at: t, splat: colour, x: x, y: y, k: k, flip: Math.random() < 0.5 });
			if (Math.random() < 0.4) {
				/* The run: a drip that creeps down from the splotch's foot over a second or two. */
				jobs.push({ at: t + 0.3, drip: colour, x: x + rand(-10, 10) * k, y: y + 40 * k, len: rand(40, 100) * k, k: k });
			}
		}
		return jobs;
	};

	/* ---------------------------------------------------------- painting -- */

	ModernArt.prototype.doJob = function (job) {
		var g = this.canvas.getContext('2d'), art = this.art;
		if (job.canvas) {
			g.fillStyle = '#f4f1e8';
			g.fillRect(job.canvas[0], job.canvas[1], job.canvas[2], job.canvas[2]);
		} else if (job.line) {
			g.fillStyle = '#111';
			var lw = this.plan.lw, l = job.line;
			g.fillRect(Math.min(l[0], l[2]) - lw / 2, Math.min(l[1], l[3]) - lw / 2,
				Math.abs(l[2] - l[0]) + lw, Math.abs(l[3] - l[1]) + lw);
		} else if (job.frame) {
			g.strokeStyle = '#111';
			g.lineWidth = this.plan.lw;
			g.strokeRect(job.frame[0] + this.plan.lw / 2, job.frame[1] + this.plan.lw / 2,
				job.frame[2] - this.plan.lw, job.frame[2] - this.plan.lw);
		} else if (job.fill) {
			g.fillStyle = job.colour;
			g.fillRect(job.fill.x, job.fill.y, job.fill.w, job.fill.h);
		} else if (job.ground) {
			g.fillStyle = job.ground;
			g.fillRect(0, 0, this.w, this.h);
		} else if (job.band) {
			var b = job.band, soft = Math.max(2, Math.min(b.w, b.h) * 0.04);
			g.save();
			g.filter = 'blur(' + soft.toFixed(1) + 'px)';
			g.fillStyle = job.colour;
			g.beginPath();
			if (g.roundRect) { g.roundRect(b.x, b.y, b.w, b.h, soft * 2); } else { g.rect(b.x, b.y, b.w, b.h); }
			g.fill();
			g.restore();
		} else if (job.splat && art) {
			var bmp = art.bitmap('splotch-' + job.splat);
			g.save();
			g.translate(job.x, job.y);
			g.scale(job.flip ? -job.k : job.k, job.k);
			g.drawImage(bmp.image, -bmp.width / 2, -bmp.height / 2);
			g.restore();
		}
	};

	/** A drip, as far down as it has got by `t` seconds after it started. */
	ModernArt.prototype.drip = function (g, job, t) {
		var drop = this.art.bitmap('drip-' + job.drip), len = job.len * Math.min(1, Math.max(0, t) / 1.5);
		for (var d = 0; d <= len; d += 2 * job.k) {
			g.drawImage(drop.image, job.x, job.y + d, drop.width * job.k, drop.height * job.k);
		}
	};

	ModernArt.prototype.step = function (dt, ctx, w, h) {
		if (this.now === 'splotchy' && !this.art) {
			ctx.drawImage(this.canvas, 0, 0, w, h);
			return;
		}
		this.age += dt;
		while (this.at < this.plan.length && this.plan[this.at].at <= this.age) {
			var job = this.plan[this.at];
			if (job.drip) { (this.drips = this.drips || []).push(job); } else { this.doJob(job); }
			this.at += 1;
		}
		var g = this.canvas.getContext('2d');
		for (var i = (this.drips || []).length - 1; i >= 0; i -= 1) {
			var dj = this.drips[i];
			this.drip(g, dj, this.age - dj.at);
			if (this.age - dj.at > 1.5) { this.drips.splice(i, 1); }
		}
		if (this.age > this.life) { this.drips = []; this.begin(); }
		ctx.drawImage(this.canvas, 0, 0, w, h);
	};

	AfterDark.define('after-dark-modern-art', function (el) {
		var sim = new ModernArt();
		sim.style = STYLES[AfterDark.choice(el, 'style', STYLES, 'random')];
		AfterDark.load(AfterDark.setting(el, 'art') || 'art/modern').then(function (art) {
			sim.art = art;
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkModernArt = ModernArt;
}());
