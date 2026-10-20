/**
 * tunnel.js - Tunnel, down a winding tube of colour.
 *
 * TUNNEL.AD ships no artwork. Its own description:
 *
 *   "TUNNEL (tm) was an After Dark module contest award winner.
 *    Finally, a module for everyone who can't afford a skateboard!
 *    To change tunnel direction while Tunnel is running, press the Caps Lock
 *    key."
 *
 * Checked against the original running under Wine (October 2026). It never
 * shows up in a screen capture - it draws once in palette colours that are all
 * black and then only animates the palette - so this comes from a +relay trace
 * of its GDI calls and Wine's +palette trace of every AnimatePalette:
 *
 * - It draws the tunnel once: up to a hundred nested, filled frames (Shape
 *   R-Rect, the default, rounds each corner with an ellipse a quarter of the
 *   frame's width and height). The outermost is 1.25x the screen, centred;
 *   each one inside it is hw - hw/32 - 1 (and hh likewise), and the run stops
 *   after 79-100 of them. The centres step in a straight line from the screen
 *   centre to the far end, which is a random point on the diagonal through
 *   the centre (y = x - 128 at 1024x768). The hole at the far end stays
 *   black. It draws a new tunnel (new far end and length; the colours carry on)
 *   about every 45 seconds - twice in a two-minute trace.
 * - Each band between two frames is its own palette entry, and the module
 *   animates 99 of them about 55 times a second (each 18 ms timer tick): every
 *   tick the colours move one band outwards and a new one comes in at the far
 *   end. The new colour is the last plus a velocity per channel, wrapping
 *   round 0-255 as bytes do (so a fading run will suddenly jump to the other
 *   end of the channel - that is in the original); the velocity is picked
 *   afresh, up to about 4 a tick per channel, every 29 ticks. The palette
 *   starts black, so the first colours flow in from the far end.
 *
 * Still inferred: Out (taken as the same stream entering at the near end),
 * what Random picks (here, one of the two shapes per tunnel), and the range
 * of the far point (all eleven seen lay between y = 70 and 630).
 *
 *   <after-dark-tunnel direction="in" shape="r-rect">
 */
(function () {
	'use strict';

	var DIRECTIONS = ['in', 'out'];
	var SHAPES = ['rect', 'r-rect', 'random'];
	/* Palette entries the module animates. */
	var BANDS = 99;
	var TICK = 1 / 55;
	var TICKS_PER_TURN = 29;
	var MAX_VELOCITY = 4;
	/* It drew a new tunnel after 2490 and 2588 ticks in a two-minute trace. */
	var TICKS_PER_TUNNEL = 2500;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Tunnel() {
		this.dir = 1;
		this.shape = 1;
		this.rounded = true;
		this.frames = [];
		this.colours = [];
		for (var i = 0; i < BANDS; i += 1) { this.colours.push([0, 0, 0]); }
		this.last = [0, 0, 0];
		this.velocity = [0, 0, 0];
		this.ticks = 0;
		this.clock = 0;
	}

	/**
	 * The frames, far end first, worked out at 1024x768 as the module did
	 * (its integer steps) and then scaled to the screen.
	 */
	Tunnel.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.build();
	};

	/** A new tunnel: a new far end, length and (for Random) shape. */
	Tunnel.prototype.build = function () {
		var w = this.w, h = this.h;
		var count = 79 + Math.floor(Math.random() * 22);
		var farY = rand(64, 640);
		var far = { x: farY + 128, y: farY };
		var sizes = [];
		var hw = 640, hh = 480;
		for (var i = 0; i < count; i += 1) {
			sizes.unshift([hw, hh]);
			hw = hw - Math.floor(hw / 32) - 1;
			hh = hh - Math.floor(hh / 32) - 1;
		}
		var sx = w / 1024, sy = h / 768;
		this.frames = [];
		for (var k = 0; k < count; k += 1) {
			var t = k / (count - 1);
			var cx = far.x + (512 - far.x) * t, cy = far.y + (384 - far.y) * t;
			this.frames.push({
				x: (cx - sizes[k][0]) * sx, y: (cy - sizes[k][1]) * sy,
				w: sizes[k][0] * 2 * sx, h: sizes[k][1] * 2 * sy
			});
		}
		this.rounded = this.shape === 1 || (this.shape === 2 && Math.random() < 0.5);
	};

	/** One timer tick of the palette animation. */
	Tunnel.prototype.tick = function () {
		if (this.ticks % TICKS_PER_TURN === 0) {
			this.velocity = [rand(-MAX_VELOCITY, MAX_VELOCITY), rand(-MAX_VELOCITY, MAX_VELOCITY),
				rand(-MAX_VELOCITY, MAX_VELOCITY)];
		}
		this.ticks += 1;
		if (this.ticks % TICKS_PER_TUNNEL === 0) { this.build(); }
		var c = [];
		for (var i = 0; i < 3; i += 1) {
			c.push((((this.last[i] + this.velocity[i]) % 256) + 256) % 256);
		}
		this.last = c;
		if (this.dir > 0) {
			this.colours.pop();
			this.colours.unshift(c);
		} else {
			this.colours.shift();
			this.colours.push(c);
		}
	};

	Tunnel.prototype.step = function (dt, ctx, w, h) {
		this.clock += dt;
		var n = 0;
		while (this.clock >= TICK && n < 20) {
			this.clock -= TICK;
			this.tick();
			n += 1;
		}
		if (n === 20) { this.clock = 0; }

		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		/* Outermost first; band k lies between frames k and k + 1 and is
		   palette entry k, so the far end's hole is left black. */
		var frames = this.frames;
		var offset = this.dir > 0 ? 0 : BANDS - (frames.length - 1);
		for (var k = frames.length - 1; k >= 1; k -= 1) {
			var c = this.colours[k - 1 + offset];
			ctx.fillStyle = 'rgb(' + Math.floor(c[0]) + ',' + Math.floor(c[1]) + ',' + Math.floor(c[2]) + ')';
			this.frame(ctx, frames[k]);
		}
		ctx.fillStyle = '#000';
		this.frame(ctx, frames[0]);
	};

	Tunnel.prototype.frame = function (ctx, f) {
		ctx.beginPath();
		if (!this.rounded) {
			ctx.rect(f.x, f.y, f.w, f.h);
		} else {
			/* CreateRoundRectRgn with a corner ellipse w/4 by h/4. */
			var rx = f.w / 8, ry = f.h / 8;
			var x0 = f.x, y0 = f.y, x1 = f.x + f.w, y1 = f.y + f.h;
			ctx.moveTo(x0 + rx, y0);
			ctx.lineTo(x1 - rx, y0);
			ctx.ellipse(x1 - rx, y0 + ry, rx, ry, 0, -Math.PI / 2, 0);
			ctx.lineTo(x1, y1 - ry);
			ctx.ellipse(x1 - rx, y1 - ry, rx, ry, 0, 0, Math.PI / 2);
			ctx.lineTo(x0 + rx, y1);
			ctx.ellipse(x0 + rx, y1 - ry, rx, ry, 0, Math.PI / 2, Math.PI);
			ctx.lineTo(x0, y0 + ry);
			ctx.ellipse(x0 + rx, y0 + ry, rx, ry, 0, Math.PI, Math.PI * 1.5);
			ctx.closePath();
		}
		ctx.fill();
	};

	AfterDark.define('after-dark-tunnel', function (el) {
		var sim = new Tunnel();
		sim.dir = AfterDark.choice(el, 'direction', DIRECTIONS, 'in') === 0 ? 1 : -1;
		sim.shape = AfterDark.choice(el, 'shape', SHAPES, 'r-rect');
		/* The original's own way to turn round. */
		window.addEventListener('keydown', function (e) {
			if (e.key === 'CapsLock') { sim.dir = -sim.dir; }
		});
		return sim;
	});

	window.AfterDarkTunnel = Tunnel;
}());
