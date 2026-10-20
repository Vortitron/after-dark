/**
 * zot.js - Zot!, drawn the way the original module drew itself.
 *
 * ZOT.AD ships no artwork. Its own description:
 *
 *   "ZOT! (tm)
 *    Realistic lightning designed by Jim Stewart.
 *    During the period when this module was being developed, the skies were
 *    filled with thunder and lightning each night."
 *
 * Checked against the original running under Wine (October 2026). A 25 s
 * capture of it is black, and that is faithful: a WINEDEBUG=+relay trace
 * shows the module clears the screen black, waits seconds between strikes,
 * then draws a strike and rubs it straight out again in the same tick - the
 * bolt is on screen only as long as drawing it takes, far less than a
 * video frame under Wine. What the trace shows it drawing (1024x768):
 *
 *   - the main bolt, 1-px white lines (CreatePen PS_SOLID 1, #ffffff): a
 *     polyline from a random point on the top edge down to the bottom
 *     (it stops once below about H - 28), each step 0..18 px down and
 *     0..25 px sideways, always the same way for long runs - most bolts
 *     turn round once or not at all - so it sweeps across in long slants;
 *   - forks, 1-px grey (#808080) polylines that leave from points of the
 *     main bolt and walk downward the same way (see Forkiness);
 *   - then all of it again in black, which is the erase. More often than
 *     not the same strike is flashed twice in a row.
 *
 * Gaps between strikes, traced at each How Often (3 to 22 gaps each):
 * Rarely 11-17 s, Sometimes 4-13 s, Often (the default) 2.6-8.5 s, mean
 * about 5.5 s - and Stormy! 2.6-9.5 s, mean about 6 s: no stormier than
 * Often in the module as it is.
 *
 * No sky flash, glow or thickness: just the lines on black. A strike has 4 to 17
 * forks whatever the setting; Forkiness sets how far they run - Few up to
 * 6 steps, Forky (the default) up to about 23, Max Forky! up to about 54.
 * The module reads its labelled sliders as the label's index (0, 1, 2),
 * not the 0-100 slider value. The Kinkiness record in TYPE_1000 is type 0 -
 * hidden, not on the panel - and its stored 0 is No Kinks.
 *
 * Still chosen: how long a flash stays up (the original's lasted as long as
 * the drawing took on the machine it ran on; here a couple of frames), the
 * exact turning rule (fitted to eight traced strikes), and the gaps are
 * uniform over the traced ranges.
 *
 *   <after-dark-zot forkiness="forky" how-often="often">
 */
(function () {
	'use strict';

	/* the longest fork, in steps: Forkiness sets how far forks run */
	var FORKS = { few: 6, forky: 23, 'max forky!': 54 };
	/* seconds between strikes, as a range (traced; see the header) */
	var OFTEN = {
		rarely: [10, 17],
		sometimes: [4, 13.5],
		often: [2.5, 8.5],
		'stormy!': [2.5, 9.5]
	};
	var TURN = 1 / 60;  // chance a step turns the bolt round
	var FLASH = 0.05;   // a flash stays up this long
	var DARK = 0.06;    // between the two flashes of a double strike

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function random(n) {
		return Math.floor(Math.random() * n);
	}

	function clamp(v, lo, hi) {
		return Math.max(lo, Math.min(hi, v));
	}

	/**
	 * Walk down from (x, y): each step 0..18 px down and 0..25 px across in
	 * the current direction, which now and then turns round (and does at the
	 * screen's sides). Stops below `bottom` or after `steps`. Step sizes are
	 * for 1024x768 and multiplied by `k`.
	 */
	function walk(x, y, dir, bottom, steps, k, w) {
		var pts = [{ x: x, y: y }];
		for (var i = 0; i < steps && y < bottom; i += 1) {
			if (Math.random() < TURN) {
				dir = -dir;
			}
			x += dir * random(26) * k;
			if (x < 0 || x > w - 1) {
				x = clamp(x, 0, w - 1);
				dir = -dir;
			}
			y += random(19) * k;
			pts.push({ x: x, y: y });
		}
		return pts;
	}

	/**
	 * One strike on a w x h screen: [main bolt, fork, fork, ...], each an
	 * array of {x, y}. `forks` is the longest a fork may run, in steps.
	 */
	function strike(w, h, forks) {
		var k = w / 1024;
		forks = forks || FORKS.forky;
		var bottom = h - 28 * k;
		var main = walk(random(w), 0, Math.random() < 0.5 ? -1 : 1, bottom, 400, k, w);
		var bolts = [main];
		var n = 4 + random(14);
		for (var i = 0; i < n && main.length > 2; i += 1) {
			var from = main[1 + random(main.length - 2)];
			var len = 1 + Math.floor(Math.pow(Math.random(), 3) * forks);
			bolts.push(walk(from.x, from.y, Math.random() < 0.5 ? -1 : 1, h, len, k, w));
		}
		return bolts;
	}

	function Zot() {
		this.forks = FORKS.forky;
		this.gap = OFTEN.often;
		this.wait = rand(this.gap[0], this.gap[1]);
		this.bolts = [];
		this.flashes = [];   // times (from now) at which the strike shows
		this.clock = 0;
	}

	Zot.prototype.fire = function (w, h) {
		this.bolts = strike(w, h, this.forks);
		this.clock = 0;
		this.flashes = Math.random() < 0.6 ? [0, FLASH + DARK] : [0];
		this.wait = rand(this.gap[0], this.gap[1]);
	};

	/** Is the current strike on screen? */
	Zot.prototype.lit = function () {
		for (var i = 0; i < this.flashes.length; i += 1) {
			if (this.clock >= this.flashes[i] && this.clock < this.flashes[i] + FLASH) {
				return true;
			}
		}
		return false;
	};

	Zot.prototype.step = function (dt, w, h) {
		this.clock += dt;
		this.wait -= dt;
		if (this.wait <= 0) {
			this.fire(w, h);
		}
	};

	Zot.prototype.stroke = function (ctx, points, colour) {
		if (points.length < 2) {
			return;
		}
		ctx.strokeStyle = colour;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(Math.round(points[0].x) + 0.5, Math.round(points[0].y) + 0.5);
		for (var i = 1; i < points.length; i += 1) {
			ctx.lineTo(Math.round(points[i].x) + 0.5, Math.round(points[i].y) + 0.5);
		}
		ctx.stroke();
	};

	Zot.prototype.draw = function (ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.lit()) {
			return;
		}
		this.stroke(ctx, this.bolts[0], '#ffffff');
		for (var i = 1; i < this.bolts.length; i += 1) {
			this.stroke(ctx, this.bolts[i], '#808080');
		}
	};

	function ZotElement() {
		return Reflect.construct(HTMLElement, [], ZotElement);
	}
	ZotElement.prototype = Object.create(HTMLElement.prototype);
	ZotElement.prototype.constructor = ZotElement;
	Object.setPrototypeOf(ZotElement, HTMLElement);

	ZotElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		var sim = new Zot();
		var forks = (AfterDark.setting(this, 'forkiness') || 'forky').toLowerCase();
		var often = (AfterDark.setting(this, 'how-often') || 'often').toLowerCase();
		sim.forks = FORKS[forks] || FORKS.forky;
		sim.gap = OFTEN[often] || OFTEN.often;
		sim.wait = rand(sim.gap[0], sim.gap[1]);

		var screen = new AfterDark.Screen(this);
		this._screen = screen;
		this.sim = sim;
		screen.onresize = function () {};
		screen.run(function (dt, ctx, width, height) {
			sim.step(dt, width, height);
			sim.draw(ctx, width, height);
		});
	};

	ZotElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-zot', ZotElement);
	window.AfterDarkZot = Zot;
	Zot.strike = strike;
	Zot.walk = walk;
	Zot.FORKS = FORKS;
	Zot.OFTEN = OFTEN;
}());
