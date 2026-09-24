/**
 * worms.js - Can of Worms, eating the desktop.
 *
 * WORMS.AD ships no artwork. Its own description:
 *
 *   "CAN OF WORMS (tm) These creepy crawlers can be set to eat away the
 *    screen that you have been working in. Set the number of worms and the
 *    number of segments."
 *
 * Its controls are Wiggle (Straight, Weavy, Crawly, Wiggly), Segments,
 * Worms and a Screen tick box - whether they eat the screen or crawl on
 * black. The worms are strings of round segments, each a shade of its own
 * colour, and with Screen on they leave black behind them where the desktop
 * was.
 *
 *   <after-dark-worms wiggle="crawly" segments="20" worms="6" eat-screen>
 */
(function () {
	'use strict';

	var WIGGLES = ['straight', 'weavy', 'crawly', 'wiggly'];
	/* How hard a worm can turn, radians a second. */
	var TURN = [0.3, 1.2, 2.5, 5];
	var SEGMENTS = ['5', '10', '20', '40'];
	var WORMS = ['1', '3', '6', '10', '20'];
	var COLOURS = [[255, 85, 85], [85, 255, 85], [255, 255, 85], [85, 255, 255],
		[255, 85, 255], [255, 170, 0], [170, 170, 255]];
	var PACE = 60;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Worms() {
		this.turn = TURN[2];
		this.segments = 20;
		this.count = 6;
		this.eat = true;
	}

	Worms.prototype.resize = function (w, h) {
		this.scale = Math.max(1, Math.min(w, h) / 480);
		this.radius = 5 * this.scale;
		this.ground = document.createElement('canvas');
		this.ground.width = Math.max(1, Math.round(w));
		this.ground.height = Math.max(1, Math.round(h));
		var g = this.ground.getContext('2d');
		if (this.eat) {
			g.drawImage(AfterDark.desktop(w, h), 0, 0);
		} else {
			g.fillStyle = '#000';
			g.fillRect(0, 0, w, h);
		}
		this.worms = [];
		for (var i = 0; i < this.count; i += 1) {
			var x = rand(0, w), y = rand(0, h), a = rand(0, Math.PI * 2);
			var body = [];
			for (var k = 0; k < this.segments; k += 1) { body.push({ x: x, y: y }); }
			this.worms.push({ body: body, a: a, spin: 0, rgb: COLOURS[i % COLOURS.length], owed: 0 });
		}
	};

	Worms.prototype.step = function (dt, ctx, w, h) {
		var r = this.radius, gap = r * 1.1, g = this.ground.getContext('2d');
		for (var i = 0; i < this.worms.length; i += 1) {
			var wm = this.worms[i];
			wm.spin += rand(-1, 1) * this.turn * dt * 4;
			wm.spin = Math.max(-this.turn, Math.min(this.turn, wm.spin));
			wm.a += wm.spin * dt;
			var head = wm.body[0];
			var nx = head.x + Math.cos(wm.a) * PACE * this.scale * dt;
			var ny = head.y + Math.sin(wm.a) * PACE * this.scale * dt;
			/* Turn back in off the edges. */
			if (nx < r || nx > w - r) { wm.a = Math.PI - wm.a; nx = Math.max(r, Math.min(w - r, nx)); }
			if (ny < r || ny > h - r) { wm.a = -wm.a; ny = Math.max(r, Math.min(h - r, ny)); }
			head.x = nx;
			head.y = ny;
			/* The rest follow, each a segment's length behind the one before. */
			for (var k = 1; k < wm.body.length; k += 1) {
				var a = wm.body[k - 1], b = wm.body[k];
				var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
				if (d > gap) {
					b.x = a.x + dx / d * gap;
					b.y = a.y + dy / d * gap;
				}
			}
			if (this.eat) {
				g.fillStyle = '#000';
				g.beginPath();
				g.arc(head.x, head.y, r, 0, Math.PI * 2);
				g.fill();
			}
		}

		ctx.drawImage(this.ground, 0, 0, w, h);
		for (var j = 0; j < this.worms.length; j += 1) {
			var worm = this.worms[j];
			for (var s = worm.body.length - 1; s >= 0; s -= 1) {
				var seg = worm.body[s];
				/* Brightest at the head, darker toward the tail. */
				var shade = 1 - 0.55 * s / Math.max(1, worm.body.length - 1);
				var c = worm.rgb;
				var grad = ctx.createRadialGradient(seg.x - r * 0.35, seg.y - r * 0.35, r * 0.1, seg.x, seg.y, r);
				grad.addColorStop(0, 'rgb(255,255,255)');
				grad.addColorStop(0.35, 'rgb(' + Math.round(c[0] * shade) + ',' + Math.round(c[1] * shade) + ',' +
					Math.round(c[2] * shade) + ')');
				grad.addColorStop(1, 'rgb(' + Math.round(c[0] * shade * 0.35) + ',' +
					Math.round(c[1] * shade * 0.35) + ',' + Math.round(c[2] * shade * 0.35) + ')');
				ctx.fillStyle = grad;
				ctx.beginPath();
				ctx.arc(seg.x, seg.y, r, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	};

	AfterDark.define('after-dark-worms', function (el) {
		var sim = new Worms();
		sim.turn = TURN[AfterDark.choice(el, 'wiggle', WIGGLES, 'crawly')];
		sim.segments = Number(SEGMENTS[AfterDark.choice(el, 'segments', SEGMENTS, '20')]);
		sim.count = Number(WORMS[AfterDark.choice(el, 'worms', WORMS, '6')]);
		sim.eat = AfterDark.flag(el, 'eat-screen');
		return sim;
	});

	window.AfterDarkWorms = Worms;
}());
