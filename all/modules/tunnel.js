/**
 * tunnel.js - Tunnel, down a winding rectangular tube.
 *
 * TUNNEL.AD ships no artwork. Its own description:
 *
 *   "TUNNEL (tm) was an After Dark module contest award winner.
 *    Finally, a module for everyone who can't afford a skateboard!
 *    To change tunnel direction while Tunnel is running, press the Caps Lock
 *    key."
 *
 * Its controls are Direction (In, Out) and Shape (Rect, R-Rect, Random). The
 * tunnel is a run of frames at even spacing, each a colour band, and its line
 * bends as it goes so the far end swings about. Caps Lock still turns it
 * round.
 *
 *   <after-dark-tunnel direction="in" shape="rect">
 */
(function () {
	'use strict';

	var DIRECTIONS = ['in', 'out'];
	var SHAPES = ['rect', 'r-rect', 'random'];
	var RINGS = 40;
	var SPACING = 0.25;
	/* Depth a second. */
	var SPEED = 1.3;
	/* The sixteen-colour palette, bright half first, as the rings cycle through it. */
	var BANDS = ['#ff5555', '#ffff55', '#55ff55', '#55ffff', '#5555ff', '#ff55ff',
		'#aa0000', '#aa5500', '#00aa00', '#00aaaa', '#0000aa', '#aa00aa'];

	function Tunnel() {
		this.dir = 1;
		this.shape = 0;
		this.travel = 0;
		this.t = 0;
	}

	/** Where the tunnel's middle is at a given distance along it, -1..1. */
	Tunnel.prototype.bend = function (d) {
		return {
			x: 0.55 * Math.sin(d * 0.21 + Math.sin(d * 0.05) * 2) + 0.25 * Math.sin(d * 0.53),
			y: 0.45 * Math.sin(d * 0.17 + 1.3) + 0.2 * Math.sin(d * 0.41 + 0.4)
		};
	};

	Tunnel.prototype.resize = function () {};

	Tunnel.prototype.step = function (dt, ctx, w, h) {
		this.t += dt;
		this.travel += this.dir * SPEED * dt;
		var cx = w / 2, cy = h / 2;
		var near = this.bend(this.travel);
		var base = Math.floor(this.travel / SPACING);
		var focal = Math.min(w, h) * 0.35;

		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		/* Farthest first, so the nearer frames go over them. */
		for (var i = RINGS; i >= 1; i -= 1) {
			var n = base + i;
			var depth = n * SPACING - this.travel;
			if (depth <= 0.05) { continue; }
			var c = this.bend(n * SPACING);
			var scale = focal / depth;
			var hw = w * 0.5 / depth * 0.9, hh = h * 0.5 / depth * 0.9;
			var x = cx + (c.x - near.x) * scale * 1.6;
			var y = cy + (c.y - near.y) * scale * 1.6;
			var rounded = this.shape === 1 || (this.shape === 2 && ((n >> 3) & 1));
			ctx.globalAlpha = Math.max(0.12, Math.min(1, 1.6 / (1 + depth * 0.35)));
			ctx.strokeStyle = BANDS[((n % BANDS.length) + BANDS.length) % BANDS.length];
			ctx.lineWidth = Math.max(1, SPACING * 2.4 / depth * Math.min(w, h) / 60);
			this.frame(ctx, x - hw, y - hh, hw * 2, hh * 2, rounded ? Math.min(hw, hh) * 0.35 : 0);
		}
		ctx.globalAlpha = 1;
	};

	Tunnel.prototype.frame = function (ctx, x, y, w, h, r) {
		ctx.beginPath();
		if (!r) {
			ctx.rect(x, y, w, h);
		} else {
			ctx.moveTo(x + r, y);
			ctx.arcTo(x + w, y, x + w, y + h, r);
			ctx.arcTo(x + w, y + h, x, y + h, r);
			ctx.arcTo(x, y + h, x, y, r);
			ctx.arcTo(x, y, x + w, y, r);
			ctx.closePath();
		}
		ctx.stroke();
	};

	AfterDark.define('after-dark-tunnel', function (el) {
		var sim = new Tunnel();
		sim.dir = AfterDark.choice(el, 'direction', DIRECTIONS, 'in') === 0 ? 1 : -1;
		sim.shape = AfterDark.choice(el, 'shape', SHAPES, 'rect');
		/* The original's own way to turn round. */
		window.addEventListener('keydown', function (e) {
			if (e.key === 'CapsLock') { sim.dir = -sim.dir; }
		});
		return sim;
	});

	window.AfterDarkTunnel = Tunnel;
}());
