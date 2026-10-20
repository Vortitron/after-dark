/**
 * slowburn.js - Slow Burn, fire spreading over the screen and dying back.
 *
 * SLOWBURN.AD's own description:
 *
 *   "In 1666, in plague-ravaged London, a fire started that consumed the
 *    entire city. This fire, which came to be known as The Great Fire, was a
 *    blessing in disguise. It ended over 200 years of Black Death by burning
 *    away the filth and disease-ridden grime that covered the city. This
 *    screen saver is dedicated to that fire.
 *    "Burn" determines the type of burn."
 *
 * Its one control is Burn (Sizzling, Crackling, Searing, Scorching, Scalding,
 * Inferno), a six-stop slider whose default (47) lands on Searing. Its art is
 * eight palettes, in all/art/slowburn/: PAL 200-203 and PAL 300-303, 64
 * colours each.
 *
 * Everything else here is read from the module's code, whose class names
 * survive in its exports (BogModule, BogSim, PaletteMusher). It is an
 * infection model on a 224x224 board that wraps at the edges:
 *
 *  - A cell is 0 (clear), positive (burning, by how much) or negative
 *    (burnt, counting back up to 0). Four random cells catch to start with,
 *    and again whenever the whole board has gone out.
 *  - Each step every burning cell sets fire to as many neighbours as its
 *    value, picked from a 5x5 kernel weighted out of 1024 (104 for itself,
 *    80 for the cells beside it, 10 in the corners), through a table of
 *    16384 random picks that it walks round.
 *  - A clear or burning cell then adds what it caught; past the Burn's
 *    "infect" limit it is burnt out at minus the "revive" count, and a burnt
 *    cell counts back up by one a step.
 *  - Burn picks the pair: Sizzling 1/40, Crackling 1/60, Searing 10/10,
 *    Scorching 20/10, Scalding 10/20, Inferno 60/60.
 *  - Burning cells take palette 65-127 by value over the limit, from one of
 *    PAL 300-303; burnt ones 1-64 by how burnt, from one of PAL 200-203;
 *    clear is black. Every 40 seconds each set steps to a neighbouring one
 *    and the palette fades across in 20 one-second steps.
 *  - One step every 16 ms at most, and the board is BitBlt'd over the
 *    screen as a grid of 224-pixel tiles from the top left.
 *
 * The screen is blanked first and the fire starts three seconds later. The
 * real thing, captured under Wine, runs the board at 60 steps a second -
 * its rings travel the same distance per frame as this does.
 *
 *   <after-dark-slow-burn art="art/slowburn" burn="searing">
 */
(function () {
	'use strict';

	var BURNS = ['sizzling', 'crackling', 'searing', 'scorching', 'scalding', 'inferno'];
	/* [infect, revive] for each Burn, from BogModule::IModule's switch. */
	var PARAMS = [[1, 40], [1, 60], [10, 10], [20, 10], [10, 20], [60, 60]];
	var N = 224;
	/* SetupProbArray(2): the neighbourhood weights, dy -2..2 by dx -2..2. */
	var KERNEL = [10, 20, 30, 20, 10, 20, 70, 80, 70, 20, 30, 80, 104, 80, 30, 20, 70, 80, 70, 20, 10, 20, 30, 20, 10];
	var STEP = 1 / 60;
	var TWIDDLE = 40, FADE_STEPS = 20;

	function randInt(n) {
		return Math.floor(Math.random() * n);
	}

	/* 1024 (dx, dy) picks in the kernel's proportions. As in the original the
	   fill stops as soon as the running total reaches 1024, so the last
	   corner's ten slots are left at (0, 0) - the cell itself. */
	function kernelPairs() {
		var dx = new Int32Array(1024), dy = new Int32Array(1024);
		var total = 0, filled = 0, k = 0;
		for (var y = -2; y <= 2; y += 1) {
			for (var x = -2; x <= 2; x += 1) {
				total += KERNEL[k];
				k += 1;
				if (total >= 1024) { return { dx: dx, dy: dy }; }
				for (; filled < total; filled += 1) {
					dx[filled] = x;
					dy[filled] = y;
				}
			}
		}
		return { dx: dx, dy: dy };
	}

	function SlowBurn() {
		this.burn = 2;
		this.palettes = null;
		this.pairs = kernelPairs();
		this.cur = new Int32Array(N * N);
		this.acc = new Int32Array(N * N);
		/* RandFill: 16384 picks into the pair table. */
		this.picks = new Int32Array(0x4000);
		for (var i = 0; i < this.picks.length; i += 1) { this.picks[i] = randInt(1024); }
		this.pick = 0;
		this.restart = true;
		this.tile = document.createElement('canvas');
		this.tile.width = N;
		this.tile.height = N;
		this.image = null;
		this.colour = new Uint8Array(129 * 3);
		this.lut = new Uint32Array(511);
		this.setBurn(2);
		this.wait = 3;
		this.acc_t = 0;
		this.t = 0;
	}

	SlowBurn.prototype.setBurn = function (i) {
		this.burn = i;
		this.max = PARAMS[i][0];
		this.revive = -PARAMS[i][1];
	};

	SlowBurn.prototype.usePalettes = function (pals) {
		this.palettes = pals;
		/* IModule: a random set of each to start; TwiddlePalette walks them. */
		this.hot = randInt(4);
		this.cold = randInt(4);
		this.fadeFrom = this.combo(this.hot, this.cold);
		this.fadeTo = this.fadeFrom;
		this.fade = FADE_STEPS;
		this.nextTwiddle = this.t + TWIDDLE;
		this.setColours(this.fadeTo);
	};

	SlowBurn.prototype.combo = function (hot, cold) {
		var out = new Uint8Array(129 * 3), i, c;
		out[0] = out[1] = out[2] = 1;
		for (i = 0; i < 64; i += 1) {
			c = this.palettes[String(200 + cold)][i];
			out[(1 + i) * 3] = c[0]; out[(1 + i) * 3 + 1] = c[1]; out[(1 + i) * 3 + 2] = c[2];
			c = this.palettes[String(300 + hot)][i];
			out[(65 + i) * 3] = c[0]; out[(65 + i) * 3 + 1] = c[1]; out[(65 + i) * 3 + 2] = c[2];
		}
		return out;
	};

	SlowBurn.prototype.setColours = function (pal) {
		this.colour = pal;
		/* CalcColorCache: a pixel for every cell value from -255 to 255. */
		var little = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
		for (var v = -255; v <= 255; v += 1) {
			var idx = 0;
			if (v > 0) {
				idx = Math.min(Math.trunc(v * 64 / this.max) + 65, 127);
			} else if (v < 0) {
				idx = Math.min(Math.trunc(v * 64 / this.revive) + 1, 64);
			}
			var r = pal[idx * 3], g = pal[idx * 3 + 1], b = pal[idx * 3 + 2];
			this.lut[v + 255] = little ? (0xff000000 | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0;
		}
	};

	SlowBurn.prototype.twiddle = function () {
		if (!this.palettes) { return; }
		if (this.t >= this.nextTwiddle) {
			this.fadeFrom = this.colour;
			this.cold = (this.cold + randInt(3) + 3) % 4;
			this.hot = (this.hot + randInt(3) + 3) % 4;
			this.fadeTo = this.combo(this.hot, this.cold);
			this.fade = 0;
			this.nextFade = this.t + 1;
			this.nextTwiddle = this.t + TWIDDLE;
		} else if (this.fade < FADE_STEPS && this.t >= this.nextFade) {
			this.fade += 1;
			var pal = new Uint8Array(129 * 3), k = this.fade;
			for (var i = 0; i < pal.length; i += 1) {
				pal[i] = Math.floor((this.fadeFrom[i] * (FADE_STEPS - k) + this.fadeTo[i] * k) / FADE_STEPS);
			}
			this.setColours(pal);
			this.nextFade = this.t + 1;
		}
	};

	SlowBurn.prototype.seed = function () {
		this.cur.fill(0);
		this.acc.fill(0);
		for (var i = 0; i < 4; i += 1) { this.cur[randInt(N) + randInt(N) * N] += 1; }
	};

	/** One generation: DoInfect, then UpdateBoard. */
	SlowBurn.prototype.generation = function () {
		var cur = this.cur, acc = this.acc, picks = this.picks, dxs = this.pairs.dx, dys = this.pairs.dy;
		var p = this.pick, x, y, i, d, j, nx, ny;
		for (y = N - 1; y >= 0; y -= 1) {
			for (x = N - 1; x >= 0; x -= 1) {
				d = cur[y * N + x];
				if (d <= 0) { continue; }
				/* The pick table is walked d at a time, from the top of each run. */
				if (p > 0x3f01) {
					p = d;
					j = d;
				} else {
					p += d;
					j = p + d;
				}
				for (; d > 0; d -= 1, j -= 1) {
					var r = picks[j & 0x3fff];
					nx = x + dxs[r];
					ny = y + dys[r];
					if (nx < 0) { nx += N; } else if (nx >= N) { nx -= N; }
					if (ny < 0) { ny += N; } else if (ny >= N) { ny -= N; }
					acc[ny * N + nx] += 1;
				}
			}
		}
		this.pick = p;
		var any = false, max = this.max, revive = this.revive;
		for (i = 0; i < cur.length; i += 1) {
			var v = cur[i];
			if (v >= 0) {
				v += acc[i];
				if (v > max) { v = revive; }
			} else {
				v += 1;
			}
			acc[i] = 0;
			cur[i] = v;
			if (v !== 0) { any = true; }
		}
		return any;
	};

	SlowBurn.prototype.paint = function () {
		var g = this.tile.getContext('2d');
		if (!this.image) {
			this.image = g.createImageData(N, N);
			this.pixels = new Uint32Array(this.image.data.buffer);
		}
		var px = this.pixels, cur = this.cur, lut = this.lut;
		for (var i = 0; i < cur.length; i += 1) {
			var v = cur[i];
			px[i] = lut[(v > 255 ? 255 : v < -255 ? -255 : v) + 255];
		}
		g.putImageData(this.image, 0, 0);
	};

	SlowBurn.prototype.resize = function () {};

	SlowBurn.prototype.step = function (dt, ctx, w, h) {
		this.t += dt;
		if (this.wait > 0) {
			this.wait -= dt;
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);
			return;
		}
		if (!this.palettes) { return; }
		this.twiddle();
		this.acc_t = Math.min(this.acc_t + dt, STEP * 4);
		var stepped = false;
		while (this.acc_t >= STEP) {
			this.acc_t -= STEP;
			if (this.restart) {
				this.seed();
				this.restart = false;
			} else {
				this.restart = !this.generation();
			}
			stepped = true;
		}
		if (!stepped && this.drawn) { return; }
		this.paint();
		this.drawn = true;
		ctx.imageSmoothingEnabled = false;
		for (var y = 0; y < h; y += N) {
			for (var x = 0; x < w; x += N) { ctx.drawImage(this.tile, x, y); }
		}
	};

	AfterDark.define('after-dark-slow-burn', function (el) {
		var sim = new SlowBurn();
		sim.setBurn(AfterDark.choice(el, 'burn', BURNS, 'searing'));
		AfterDark.data(AfterDark.setting(el, 'art') || 'art/slowburn').then(function (d) {
			sim.usePalettes(d.palettes);
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkSlowBurn = SlowBurn;
}());
