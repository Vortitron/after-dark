/**
 * draino.js - Down the Drain, drawn the way the original module drew itself.
 *
 * DRAINO.AD ships no artwork. Its own description:
 *
 *   "DOWN THE DRAIN (tm)
 *    Original concept by Rob Vaterlaus.
 *    The 'Direction' slider sets the coriolis force for Southern Hemisphere
 *    (Clockwise), Northern Hemisphere (Counter), or on the equator (Inward).
 *    The 'Drops' check box will add drops for draining after most of the
 *    screen is black. The 'Drain' check box starts you draining with a drain
 *    in the middle of the screen."
 *
 * Settings, out of TYPE_1000, with their stored defaults: Speed = Slow /
 * Medium / Fast (Fast), Direction = Clockwise / Inward / Counter (Counter),
 * Drops (on), Show Drain (on).
 *
 * How it works, read off a WINEDEBUG=+relay trace of the original at
 * 1024x768 (October 2026) - under Wine it sees a black desktop, so the
 * trace, not the picture, is the ground truth:
 *  - It drains whatever is on screen (here AfterDark.desktop) one block at a
 *    time. A block is a sixth of the screen wide and a twelfth high (170x64),
 *    taken at a random place, copied into a memory bitmap and blitted back
 *    a little way round and in towards the centre: its top-middle point is
 *    turned 3 degrees about the screen centre (anticlockwise on screen for
 *    Counter) and drawn about 1.8% closer to it. The source is left as it
 *    is, so the picture smears round in streaks; about one move in nine
 *    also blackens what the block left uncovered.
 *  - A block whose source overlaps the 46x46 drain in the middle is not
 *    copied at all - it has gone down the drain.
 *  - Blocks taken from near the left, right or top edge (within about a
 *    tenth of the width, or a 24th of the height) are thrown across to the
 *    far side of the centre instead - the original's own arithmetic does
 *    this to a third of all moves; the exact rule is approximated here.
 *  - The drain is 21 black 6-px dots on a 46-px disc - one in the middle,
 *    8 round it at 10 px, 12 at 20 px - stamped over the picture now and
 *    again (every 100-300 moves) while Show Drain is on.
 *  - Once the screen is mostly black, Drops adds a filled circle 40-115 px
 *    across, without an outline, in pure red, green, blue, yellow, cyan or
 *    magenta, about one per 95 moves; they drain like everything else.
 * Not measured: the speeds. Wine ran it flat out (~3,700 moves a second at
 * every setting, and the turn per move was 3-4 degrees whatever the speed),
 * so the move rates for Slow / Medium / Fast here are chosen. How the
 * original decides the screen is "mostly black" is not known; this samples
 * the picture.
 *
 *   <after-dark-draino speed="fast" direction="counter" drops show-drain>
 */
(function () {
	'use strict';

	/* Moves per second for a 1024x768 screen; scaled with area. */
	var SPEED = { slow: 60, medium: 150, fast: 300 };
	var TURN = 3 * Math.PI / 180;
	var SHRINK = 0.982;
	var DRAIN = 46;
	var FILL_CHANCE = 1 / 9;
	var DROP_EVERY = 95;
	var DROP_COLOURS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'];
	/* Drain holes: centre, 8 at radius 10, 12 at radius 20 (dx, dy). */
	var HOLES = [[0, 0], [0, 10], [7, 7], [10, 0], [7, -7], [0, -10], [-7, -7],
		[-10, 0], [-7, 7], [0, 20], [10, 17], [17, 10], [20, 0], [17, -10],
		[10, -17], [0, -20], [-10, -17], [-17, -10], [-20, 0], [-17, 10], [-10, 17]];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function overlaps(a, b) {
		return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
	}

	function Draino() {
		this.rate = SPEED.fast;
		this.spin = -1;
		this.drops = true;
		this.showDrain = true;
		this.screen = null;
		this.block = null;
		this.owed = 0;
		this.moves = 0;
		this.nextDrain = 0;
		this.dropping = false;
		this.nextCheck = 0;
	}

	Draino.prototype.reset = function (w, h, picture) {
		this.w = w;
		this.h = h;
		this.screen = document.createElement('canvas');
		this.screen.width = Math.max(1, Math.round(w));
		this.screen.height = Math.max(1, Math.round(h));
		this.g = this.screen.getContext('2d');
		if (picture) {
			this.g.drawImage(picture, 0, 0);
		} else {
			this.g.fillStyle = '#000';
			this.g.fillRect(0, 0, w, h);
		}
		this.bw = Math.max(8, Math.round(w / 6));
		this.bh = Math.max(4, Math.round(h / 12));
		this.block = document.createElement('canvas');
		this.block.width = this.bw;
		this.block.height = this.bh;
		this.drain = { x: Math.round(w / 2 - DRAIN / 2), y: Math.round(h / 2 - DRAIN / 2), w: DRAIN, h: DRAIN };
		this.owed = 0;
		this.moves = 0;
		this.dropping = false;
		this.nextCheck = 0;
		this.nextDrain = 0;
		this.stampDrain();
	};

	/** Where a block taken at (x, y) is put back. */
	Draino.prototype.target = function (x, y) {
		var w = this.w, h = this.h, bw = this.bw;
		var cx = w / 2, cy = h / 2;
		var dx = x + bw / 2 - cx;
		var dy = y - cy;
		var a = this.spin * TURN;
		var c = Math.cos(a) * SHRINK, s = Math.sin(a) * SHRINK;
		var nx = dx * c - dy * s;
		var ny = dx * s + dy * c;
		if (x < w * 0.1 || x > w - bw - w * 0.1 || y < h / 24) {
			/* Thrown across the centre, as the original's edge blocks are. */
			nx = -nx * 0.8;
			ny = -ny * 0.8;
		}
		return {
			x: Math.max(0, Math.min(w - bw, Math.floor(cx + nx - bw / 2))),
			y: Math.max(0, Math.min(this.h - this.bh, Math.floor(cy + ny)))
		};
	};

	Draino.prototype.move = function () {
		var g = this.g, bw = this.bw, bh = this.bh;
		var src = {
			x: Math.floor(rand(3, Math.max(4, this.w - bw - 3))),
			y: Math.floor(rand(3, Math.max(4, this.h - bh - 3))),
			w: bw,
			h: bh
		};
		var dst, b;
		this.moves += 1;
		if (overlaps(src, this.drain)) {
			return;
		}
		dst = this.target(src.x, src.y);
		b = this.block.getContext('2d');
		b.clearRect(0, 0, bw, bh);
		b.drawImage(this.screen, src.x, src.y, bw, bh, 0, 0, bw, bh);
		if (Math.random() < FILL_CHANCE) {
			g.fillStyle = '#000';
			g.fillRect(src.x, src.y, bw, bh);
		}
		g.drawImage(this.block, dst.x, dst.y);
	};

	Draino.prototype.stampDrain = function () {
		var g = this.g, cx = Math.round(this.w / 2), cy = Math.round(this.h / 2), i;
		if (!this.showDrain) {
			return;
		}
		g.fillStyle = '#000';
		for (i = 0; i < HOLES.length; i += 1) {
			g.beginPath();
			g.arc(cx + HOLES[i][0], cy + HOLES[i][1], 3, 0, Math.PI * 2);
			g.fill();
		}
		this.nextDrain = this.moves + Math.floor(rand(100, 300));
	};

	Draino.prototype.drop = function () {
		var d = rand(40, 115);
		this.g.fillStyle = DROP_COLOURS[Math.floor(Math.random() * DROP_COLOURS.length)];
		this.g.beginPath();
		this.g.arc(rand(0, this.w), rand(0, this.h), d / 2, 0, Math.PI * 2);
		this.g.fill();
	};

	/** Fraction of the picture that is black, from a coarse sample. */
	Draino.prototype.blackness = function () {
		var s = document.createElement('canvas'), g, px, i, dark = 0;
		s.width = 64;
		s.height = 48;
		g = s.getContext('2d');
		g.drawImage(this.screen, 0, 0, 64, 48);
		px = g.getImageData(0, 0, 64, 48).data;
		for (i = 0; i < px.length; i += 4) {
			if (px[i] + px[i + 1] + px[i + 2] < 48) {
				dark += 1;
			}
		}
		return dark / (64 * 48);
	};

	Draino.prototype.step = function (dt) {
		var area = (this.w * this.h) / (1024 * 768);
		this.owed += dt * this.rate * Math.max(0.1, area);
		while (this.owed >= 1) {
			this.owed -= 1;
			this.move();
			if (this.moves >= this.nextDrain) {
				this.stampDrain();
			}
			if (this.dropping && Math.random() < 1 / DROP_EVERY) {
				this.drop();
			}
		}
		if (this.drops && !this.dropping && this.moves >= this.nextCheck) {
			this.nextCheck = this.moves + 200;
			this.dropping = this.blackness() > 0.9;
		}
	};

	Draino.prototype.draw = function (ctx, w, h) {
		ctx.drawImage(this.screen, 0, 0, w, h);
	};

	function DrainoElement() {
		return Reflect.construct(HTMLElement, [], DrainoElement);
	}
	DrainoElement.prototype = Object.create(HTMLElement.prototype);
	DrainoElement.prototype.constructor = DrainoElement;
	Object.setPrototypeOf(DrainoElement, HTMLElement);

	DrainoElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		var self = this;
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		var sim = new Draino();
		var speed = (AfterDark.setting(self, 'speed') || 'fast').toLowerCase();
		sim.rate = SPEED[speed] || SPEED.fast;
		var dir = (AfterDark.setting(self, 'direction') || 'counter').toLowerCase();
		if (dir === 'inward') {
			sim.spin = 0;
		} else if (dir.indexOf('counter') === 0) {
			sim.spin = -1;
		} else {
			sim.spin = 1;
		}
		sim.drops = AfterDark.flag(self, 'drops');
		sim.showDrain = AfterDark.flag(self, 'show-drain');

		var screen = new AfterDark.Screen(self);
		this._screen = screen;
		this.sim = sim;
		screen.onresize = function (width, height) {
			sim.reset(width, height, AfterDark.desktop(width, height));
		};
		sim.reset(screen.width, screen.height, AfterDark.desktop(screen.width, screen.height));
		screen.run(function (dt, ctx, width, height) {
			sim.step(dt);
			sim.draw(ctx, width, height);
		});
	};

	DrainoElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-draino', DrainoElement);
	window.AfterDarkDraino = Draino;
	Draino.SPEED = SPEED;
}());
