/**
 * gravity.js - Gravity, drawn the way the original module drew itself.
 *
 * GRAVITY.AD ships no artwork: it is one of the 45 modules that paint in
 * code. Its own description:
 *
 *   "GRAVITY (tm) demonstrates Newtonian gravity with bouncing balls.
 *    Choose 1-7 balls with the "Number Balls" slider.
 *    Use the "Size" slider to set the size of the balls.
 *    Check "Clear Screen" to clear the screen between each set of balls."
 *   Original idea by Bryce Fowler. Gravity by Bill Stewart & Tracy Elmore.
 *
 * Its controls (TYPE_1000) are Number Balls (slider, 1-7), Size (slider,
 * 10-30), Clear Screen (checkbox) and Sound. There is no Colors control.
 *
 * Checked against the real module running under Wine (8-bit, 1024x768,
 * colours grabbed through the saver window's own colormap):
 *  - The balls are flat circles in the 16 VGA colours, outlined in black,
 *    and they are never erased: every step stamps the ball again, so each
 *    one leaves a dotted trail of parabola-ish arcs. Size is the diameter
 *    in pixels (Size 10 -> 10 px, the capture with no settings -> 30 px).
 *  - A set of balls is dropped in together from the top edge, each with
 *    its own colour (no two alike) and a steady sideways drift of up to
 *    8 px a step that bounces off the side walls without loss.
 *  - The fall is not textbook: the step grows by about 27% each step away
 *    from the top of the arc (plus a pixel), and shrinks the same way on
 *    the way up, so the tops of the arcs are flat and the drops steep.
 *    Each bounce comes back to about 0.88 of the height.
 *  - When the bounces have died away (~900 steps for one ball) the screen
 *    is cleared (if Clear Screen is on) and a new set falls with new colours.
 *  - With no settings stored the module ran 7 balls of 30 px.
 * Inferred: the step rate. Under Wine it ran unthrottled (a set in under
 * three seconds); 30 steps a second is a guess at a 1992 PC. Sound omitted.
 *
 *   <after-dark-gravity balls="7" size="large" clear-screen>
 */
(function () {
	'use strict';

	var MIN_BALLS = 1;
	var MAX_BALLS = 7;
	/* Diameters. The slider ran 10-30; the list names its ends and middle. */
	var SIZES = { small: 10, medium: 20, large: 30 };
	/* The VGA colours the balls came in (no black; silver never turned up). */
	var PALETTE = [
		'#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#808080',
		'#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'
	];
	var STEPS_PER_SEC = 30;
	var GROW = 1.27;      /* each step falls this much further than the last... */
	var NUDGE = 1;        /* ...plus this many pixels */
	var KEEP = 0.88;      /* height kept at each bounce */
	var MAX_DRIFT = 8;    /* sideways pixels per step */
	var DONE = 3;         /* a bounce lower than this ends the ball */

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Gravity() {
		this.count = MAX_BALLS;
		this.size = SIZES.large;
		this.clearScreen = true;
		this.balls = [];
		this.clock = 0;
		this.fresh = true;
	}

	Gravity.prototype.reset = function (w) {
		var n = Math.max(MIN_BALLS, Math.min(MAX_BALLS, this.count));
		var colours = PALETTE.slice();
		var r = this.size / 2;
		this.balls = [];
		for (var i = 0; i < n; i += 1) {
			var c = colours.splice(Math.floor(Math.random() * colours.length), 1)[0];
			this.balls.push({
				x: rand(r, Math.max(r + 1, w - r)),
				y: 0,
				apex: 0,      /* top of the current arc */
				fall: 0,      /* how far below the apex the ball is */
				rising: false,
				vx: Math.round(rand(-MAX_DRIFT, MAX_DRIFT)),
				colour: c,
				done: false
			});
		}
		this.fresh = true;
	};

	/** One step of one ball; h is the screen height, w its width. */
	Gravity.prototype.move = function (b, w, h) {
		var r = this.size / 2;
		var floor = h - r;
		if (b.done) {
			return;
		}
		b.x += b.vx;
		if (b.x < r) {
			b.x = 2 * r - b.x;
			b.vx = -b.vx;
		} else if (b.x > w - r) {
			b.x = 2 * (w - r) - b.x;
			b.vx = -b.vx;
		}
		if (b.rising) {
			b.fall = (b.fall - NUDGE) / GROW;
			if (b.fall <= NUDGE) {
				b.fall = 0;
				b.rising = false;
			}
		} else {
			b.fall = b.fall * GROW + NUDGE;
		}
		b.y = b.apex + b.fall;
		if (!b.rising && b.y >= floor) {
			var height = (floor - b.apex) * KEEP;
			if (height < DONE) {
				b.y = floor;
				b.done = true;
				return;
			}
			b.apex = floor - height;
			b.fall = height;
			b.y = floor;
			b.rising = true;
		}
	};

	Gravity.prototype.stamp = function (ctx, b) {
		var r = this.size / 2;
		ctx.fillStyle = b.colour;
		ctx.strokeStyle = '#000';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.arc(Math.round(b.x), Math.round(b.y), r - 0.5, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
	};

	/** Advance whole steps for dt seconds, stamping as it goes. */
	Gravity.prototype.run = function (dt, ctx, w, h) {
		var i, b, live;
		if (this.fresh) {
			if (this.clearScreen || !this.started) {
				ctx.fillStyle = '#000';
				ctx.fillRect(0, 0, w, h);
			}
			this.started = true;
			this.fresh = false;
			for (i = 0; i < this.balls.length; i += 1) {
				this.stamp(ctx, this.balls[i]);
			}
		}
		this.clock += dt * STEPS_PER_SEC;
		while (this.clock >= 1) {
			this.clock -= 1;
			live = false;
			for (i = 0; i < this.balls.length; i += 1) {
				b = this.balls[i];
				if (!b.done) {
					this.move(b, w, h);
					this.stamp(ctx, b);
					live = true;
				}
			}
			if (!live) {
				this.reset(w);
				return;
			}
		}
	};

	function GravityElement() {
		return Reflect.construct(HTMLElement, [], GravityElement);
	}
	GravityElement.prototype = Object.create(HTMLElement.prototype);
	GravityElement.prototype.constructor = GravityElement;
	Object.setPrototypeOf(GravityElement, HTMLElement);

	GravityElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		var self = this;
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		var sim = new Gravity();
		var balls = AfterDark.setting(self, 'balls');
		var size = (AfterDark.setting(self, 'size') || 'large').toLowerCase();
		sim.count = Math.max(MIN_BALLS, Math.min(MAX_BALLS, parseInt(balls, 10) || MAX_BALLS));
		sim.size = SIZES[size] || parseInt(size, 10) || SIZES.large;
		sim.size = Math.max(10, Math.min(30, sim.size));
		sim.clearScreen = AfterDark.flag(self, 'clear-screen');

		var screen = new AfterDark.Screen(self);
		this._screen = screen;
		this.sim = sim;
		screen.onresize = function (width) {
			sim.started = false;
			sim.reset(width);
		};
		sim.reset(screen.width);
		screen.run(function (dt, ctx, width, height) {
			sim.run(dt, ctx, width, height);
		});
	};

	GravityElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-gravity', GravityElement);
	window.AfterDarkGravity = Gravity;
	Gravity.SIZES = SIZES;
	Gravity.PALETTE = PALETTE;
	Gravity.MIN_BALLS = MIN_BALLS;
	Gravity.MAX_BALLS = MAX_BALLS;
}());
