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
 * Splotchy throws the module's own splotch, shaded in 256 colours and
 * recoloured through its five palettes (RED8, BLUE8, ORANGE8, PURPLE8,
 * GREEN8), and runs its drips down the canvas under them; all/art/modern/.
 * Griddy and Fuzzy are drawn: black lines dividing the canvas and blocks of
 * primary colour filling some of it, and soft-edged fields of colour stacked
 * on a ground. Each picture is painted a piece at a time, left up to be
 * admired, and then a new canvas.
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
		this.now = this.style === 'random' ? pick(STYLES.slice(0, 3)) : this.style;
		this.steps = [];
		this.at = 0;
		this.rest = 0;
		this.clock = 0;
		if (this.now === 'griddy') {
			g.fillStyle = '#f4f1e8';
			g.fillRect(0, 0, w, h);
			this.plan = this.mondrian(w, h);
		} else if (this.now === 'fuzzy') {
			var set = pick(ROTHKO);
			g.fillStyle = set[3];
			g.fillRect(0, 0, w, h);
			this.plan = this.rothko(w, h, set);
		} else {
			g.fillStyle = '#efe8d6';
			g.fillRect(0, 0, w, h);
			this.plan = this.pollock(w, h);
		}
	};

	/* --------------------------------------------------------- the plans --
	   Each is a list of little jobs, done one after another over a minute. */

	ModernArt.prototype.mondrian = function (w, h) {
		var jobs = [], rects = [{ x: 0, y: 0, w: w, h: h }], lw = Math.max(4, Math.min(w, h) / 55);
		for (var i = 0; i < 9; i += 1) {
			rects.sort(function (a, b) { return b.w * b.h - a.w * a.h; });
			var r = rects.shift(), across = r.w > r.h ? Math.random() < 0.75 : Math.random() < 0.25;
			var k = rand(0.3, 0.7);
			if (across) {
				var x = r.x + r.w * k;
				jobs.push({ line: [x, r.y, x, r.y + r.h] });
				rects.push({ x: r.x, y: r.y, w: x - r.x, h: r.h }, { x: x, y: r.y, w: r.x + r.w - x, h: r.h });
			} else {
				var y = r.y + r.h * k;
				jobs.push({ line: [r.x, y, r.x + r.w, y] });
				rects.push({ x: r.x, y: r.y, w: r.w, h: y - r.y }, { x: r.x, y: y, w: r.w, h: r.y + r.h - y });
			}
		}
		/* A few blocks of colour, painted under the lines already there. */
		rects.forEach(function (r) {
			if (Math.random() < 0.35) { jobs.push({ fill: r, colour: pick(PRIMARY.concat(['#111111'])) }); }
		});
		jobs.lw = lw;
		return jobs;
	};

	ModernArt.prototype.rothko = function (w, h, set) {
		var jobs = [], n = Math.random() < 0.5 ? 2 : 3, mx = w * 0.1, my = h * 0.08;
		var gap = h * 0.05, bh = (h - 2 * my - gap * (n - 1)) / n;
		for (var i = 0; i < n; i += 1) {
			var y = my + i * (bh + gap), colour = set[i % 3];
			/* Built up in thin washes, which is what makes the edges soft. */
			for (var k = 0; k < 14; k += 1) { jobs.push({ wash: { x: mx, y: y, w: w - 2 * mx, h: bh }, colour: colour }); }
		}
		return jobs;
	};

	ModernArt.prototype.pollock = function (w, h) {
		var jobs = [];
		for (var i = 0; i < 16; i += 1) {
			var colour = pick(COLOURS), x = rand(0, w), y = rand(0, h), k = rand(0.35, 1.05) * Math.max(1, Math.min(w, h) / 480);
			jobs.push({ splat: colour, x: x, y: y, k: k, flip: Math.random() < 0.5 });
			/* A run or two of paint down from it. */
			for (var d = 0; d < Math.floor(rand(0, 3)); d += 1) {
				jobs.push({ drip: colour, x: x + rand(-40, 40) * k, y: y + rand(20, 60) * k, len: rand(40, 160) * k, k: k });
			}
			if (Math.random() < 0.5) { jobs.push({ trail: colour, k: k, pts: this.fling(w, h) }); }
		}
		return jobs;
	};

	/** A flung line of paint, the drip painter's other habit. */
	ModernArt.prototype.fling = function (w, h) {
		var pts = [], x = rand(0, w), y = rand(0, h), a = rand(0, Math.PI * 2);
		for (var i = 0; i < 40; i += 1) {
			a += rand(-0.6, 0.6);
			x += Math.cos(a) * rand(8, 20);
			y += Math.sin(a) * rand(8, 20);
			pts.push([x, y]);
		}
		return pts;
	};

	/* ---------------------------------------------------------- painting -- */

	ModernArt.prototype.doJob = function (job) {
		var g = this.canvas.getContext('2d'), art = this.art;
		if (job.line) {
			g.strokeStyle = '#111';
			g.lineWidth = this.plan.lw;
			g.beginPath();
			g.moveTo(job.line[0], job.line[1]);
			g.lineTo(job.line[2], job.line[3]);
			g.stroke();
		} else if (job.fill) {
			var r = job.fill, inset = this.plan.lw / 2;
			g.fillStyle = job.colour;
			g.fillRect(r.x + inset, r.y + inset, r.w - inset * 2, r.h - inset * 2);
		} else if (job.wash) {
			var wr = job.wash, soft = Math.min(wr.w, wr.h) * 0.06;
			g.save();
			g.globalAlpha = 0.12;
			g.filter = 'blur(' + soft.toFixed(1) + 'px)';
			g.fillStyle = job.colour;
			g.fillRect(wr.x + rand(-soft, soft), wr.y + rand(-soft, soft), wr.w, wr.h);
			g.restore();
		} else if (job.splat && art) {
			var bmp = art.bitmap('splotch-' + job.splat);
			g.save();
			g.translate(job.x, job.y);
			g.scale(job.flip ? -job.k : job.k, job.k);
			g.drawImage(bmp.image, -bmp.width / 2, -bmp.height / 2);
			g.restore();
		} else if (job.drip && art) {
			var drop = art.bitmap('drip-' + job.drip);
			for (var d = 0; d < job.len; d += 3 * job.k) {
				g.drawImage(drop.image, job.x, job.y + d, drop.width * job.k, drop.height * job.k);
			}
		} else if (job.trail && art) {
			var c = art.bitmap('splotch-' + job.trail).image, probe = document.createElement('canvas').getContext('2d');
			probe.drawImage(c, 128, 103, 1, 1, 0, 0, 1, 1);
			var px = probe.getImageData(0, 0, 1, 1).data;
			g.strokeStyle = 'rgb(' + px[0] + ',' + px[1] + ',' + px[2] + ')';
			g.lineWidth = Math.max(1.5, 2.5 * job.k);
			g.lineCap = 'round';
			g.beginPath();
			job.pts.forEach(function (p, i) { if (i) { g.lineTo(p[0], p[1]); } else { g.moveTo(p[0], p[1]); } });
			g.stroke();
		}
	};

	ModernArt.prototype.step = function (dt, ctx, w, h) {
		if (this.now === 'splotchy' && !this.art) {
			ctx.drawImage(this.canvas, 0, 0, w, h);
			return;
		}
		if (this.at < this.plan.length) {
			this.clock += dt;
			/* One job every so often: about a minute for a whole picture. */
			var every = 50 / this.plan.length;
			while (this.clock >= every && this.at < this.plan.length) {
				this.doJob(this.plan[this.at]);
				this.at += 1;
				this.clock -= every;
			}
		} else {
			this.rest += dt;
			if (this.rest > 12) { this.begin(); }
		}
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
