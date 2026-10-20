/**
 * worms.js - Can of Worms, eating the desktop.
 *
 * WORMS.AD ships no artwork. Its own description:
 *
 *   "CAN OF WORMS (tm) These creepy crawlers can be set to eat away the
 *    screen that you have been working in. Set the number of worms and the
 *    number of segments."
 *
 * Its controls are Wiggle (Straight, Weavy, Crawly, Wiggly), Segments
 * (2-20), Worms (1-20) and a Screen tick box - whether they eat the screen or
 * crawl on black. (Screen and Sound sit in a TYPE_1000 record of type 0, which
 * the Windows panel does not show; the option is kept here.)
 *
 * Checked against WORMS.AD under Wine (8-bit, 1024x768, defaults): the
 * sliders rest at 70 of 100, which is 14 worms of 14 segments, and that is
 * what is on screen - small worms, each a chain of hollow rings about five
 * pixels across set three pixels apart, some 45 pixels long, every ring
 * the worm's one colour, crawling in tight wiggles. They moved much too fast
 * to time under Wine, so the pace is still a guess, as are the colours (the
 * 8-bit capture's are not to be trusted) and what Screen does on a real
 * desktop.
 *
 *   <after-dark-worms wiggle="crawly" segments="14" worms="14" eat-screen>
 */
(function () {
	'use strict';

	var WIGGLES = ['straight', 'weavy', 'crawly', 'wiggly'];
	/* How hard a worm can turn, radians a second. */
	var TURN = [0.5, 3, 8, 14];
	/* How far, radians, the crawl zigzags either side of the heading. */
	var WOBBLE = [0, 0.5, 0.9, 1.2];
	function range(a, b) {
		var out = [];
		for (var i = a; i <= b; i += 1) { out.push(String(i)); }
		return out;
	}
	var SEGMENTS = range(2, 20);
	var WORMS = range(1, 20);
	var COLOURS = [[255, 85, 85], [85, 255, 85], [255, 255, 85], [85, 255, 255],
		[255, 85, 255], [255, 170, 0], [170, 170, 255]];
	var PACE = 80;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Worms() {
		this.turn = TURN[2];
		this.wobble = WOBBLE[2];
		this.segments = 14;
		this.count = 14;
		this.eat = true;
	}

	Worms.prototype.resize = function (w, h) {
		this.scale = Math.max(1, Math.min(w, h) / 768);
		this.radius = 2.5 * this.scale;
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
		var r = this.radius, gap = r * 1.2, g = this.ground.getContext('2d');
		for (var i = 0; i < this.worms.length; i += 1) {
			var wm = this.worms[i];
			wm.spin += rand(-1, 1) * this.turn * dt * 4;
			wm.spin = Math.max(-this.turn, Math.min(this.turn, wm.spin));
			wm.a += wm.spin * dt;
			var head = wm.body[0];
			/* The crawl: the head zigzags about its heading, a kink every segment or two. */
			wm.trip = (wm.trip || 0) + PACE * this.scale * dt;
			var dir = wm.a + this.wobble * Math.sin(wm.trip / gap * Math.PI / 1.5);
			var nx = head.x + Math.cos(dir) * PACE * this.scale * dt;
			var ny = head.y + Math.sin(dir) * PACE * this.scale * dt;
			/* Turn back in off the edges. */
			if (nx < r || nx > w - r) { wm.a = Math.PI - wm.a; nx = Math.max(r, Math.min(w - r, nx)); }
			if (ny < r || ny > h - r) { wm.a = -wm.a; ny = Math.max(r, Math.min(h - r, ny)); }
			head.x = nx;
			head.y = ny;
			/* The rest lie along the path the head took, a segment's length apart. */
			var last = wm.body[1];
			if (Math.hypot(head.x - last.x, head.y - last.y) >= gap) {
				wm.body.splice(1, 0, { x: head.x, y: head.y });
				wm.body.pop();
			}
			if (this.eat) {
				g.fillStyle = '#000';
				g.beginPath();
				g.arc(head.x, head.y, r, 0, Math.PI * 2);
				g.fill();
			}
		}

		ctx.drawImage(this.ground, 0, 0, w, h);
		/* Each segment a hollow ring in the worm's colour. */
		ctx.lineWidth = Math.max(1, this.scale);
		for (var j = 0; j < this.worms.length; j += 1) {
			var worm = this.worms[j], c = worm.rgb;
			ctx.strokeStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
			ctx.beginPath();
			for (var s = worm.body.length - 1; s >= 0; s -= 1) {
				var seg = worm.body[s];
				ctx.moveTo(seg.x + r - ctx.lineWidth / 2, seg.y);
				ctx.arc(seg.x, seg.y, r - ctx.lineWidth / 2, 0, Math.PI * 2);
			}
			ctx.stroke();
		}
	};

	AfterDark.define('after-dark-worms', function (el) {
		var sim = new Worms();
		var wiggle = AfterDark.choice(el, 'wiggle', WIGGLES, 'crawly');
		sim.turn = TURN[wiggle];
		sim.wobble = WOBBLE[wiggle];
		sim.segments = Number(SEGMENTS[AfterDark.choice(el, 'segments', SEGMENTS, '14')]);
		sim.count = Number(WORMS[AfterDark.choice(el, 'worms', WORMS, '14')]);
		sim.eat = AfterDark.flag(el, 'eat-screen');
		return sim;
	});

	window.AfterDarkWorms = Worms;
}());
