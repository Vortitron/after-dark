/**
 * rebound.js - Rebound, using the original ball artwork.
 *
 * REBOUND.AD stores two balls at each of three sizes. The even resource IDs
 * are the coloured plastic set and the odd IDs are the metal set:
 *   1000/1001  4x4, 1002/1003  16x16, 1004/1005  32x32.
 *
 * Its control panel calls the choices Plastic / Metal / Both, Wobbly,
 * Clear Screen First, and Not Many / More / Lots More / Bunches / Oodles.
 * Its description: "Watch plastic or metal balls bounce off each other and fly
 * around your monitor." - so they collide, which is done here as elastic
 * collisions with mass going with size.
 *
 * Checked against the real module under Wine at 1024x768 (25 s at the
 * defaults, 15 s at Oodles/Plastic). It runs unthrottled there, far too fast
 * to follow a ball from frame to frame, so speed is not confirmed. What is:
 *   - Balls = n of 100 gives n/5 balls: the default (50, which the popup shows
 *     as Lots More) had 12 up, Oodles 20. So Not Many 4 ... Oodles 20.
 *   - Only the 16 and 32 pixel balls are used on a full screen, three small
 *     to every big one (9 + 3, 15 + 5). The 4 pixel pair is left for screens
 *     too small for the others (assumed to be the control panel preview).
 *   - The QICT pictures are the ones drawn.
 * "Clear Screen First" off means the balls fly over your desktop (here the
 * Windows 95 one from ad.js); under Xvfb that desktop is black, so this half
 * is not confirmed either.
 */
(function () {
	'use strict';

	var BALL_IDS = {
		plastic: [1000, 1002, 1004],
		metal: [1001, 1003, 1005]
	};
	var BALL_COUNTS = {
		'not many': 4,
		more: 8,
		'lots more': 12,
		bunches: 16,
		oodles: 20
	};
	var BIG_SHARE = 0.25;          // one ball in four is a 32 pixel one
	var MIN_SPEED = 45;
	var MAX_SPEED = 135;
	var WOBBLE = 0.22;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	/* The ids of one size - 0 tiny, 1 small, 2 big - in the chosen material. */
	function availableIds(art, type, size) {
		var sets = type === 'both' ? [BALL_IDS.plastic, BALL_IDS.metal]
			: [BALL_IDS[type] || BALL_IDS.plastic];
		return sets.map(function (set) { return set[size]; }).filter(function (id) {
			return art.bitmap('qict-' + id);
		});
	}

	function Rebound(art) {
		this.art = art;
		this.type = 'both';
		this.count = BALL_COUNTS['lots more'];
		this.wobbly = true;
		this.clearScreen = true;
		this.balls = [];
	}

	Rebound.prototype.spawn = function (w, h) {
		var size = Math.min(w, h) < 240 ? 0 : (Math.random() < BIG_SHARE ? 2 : 1);
		var ids = availableIds(this.art, this.type, size);
		if (!ids.length) {
			return null;
		}
		var id = pick(ids);
		var bitmap = this.art.bitmap('qict-' + id);
		if (!bitmap) {
			return null;
		}
		var radius = bitmap.width / 2;
		var angle = rand(0, Math.PI * 2);
		var speed = rand(MIN_SPEED, MAX_SPEED) * (24 / Math.max(12, bitmap.width));
		return {
			bitmap: bitmap,
			radius: radius,
			x: rand(radius, Math.max(radius + 1, w - radius)),
			y: rand(radius, Math.max(radius + 1, h - radius)),
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed,
			mass: radius * radius
		};
	};

	Rebound.prototype.reset = function (w, h) {
		this.balls = [];
		for (var i = 0; i < this.count; i += 1) {
			var ball = this.spawn(w, h);
			if (ball) {
				this.balls.push(ball);
			}
		}
	};

	Rebound.prototype.bounce = function (ball, w, h) {
		var hit = false;
		if (ball.x < ball.radius || ball.x > w - ball.radius) {
			ball.x = Math.max(ball.radius, Math.min(w - ball.radius, ball.x));
			ball.vx = -ball.vx;
			hit = true;
		}
		if (ball.y < ball.radius || ball.y > h - ball.radius) {
			ball.y = Math.max(ball.radius, Math.min(h - ball.radius, ball.y));
			ball.vy = -ball.vy;
			hit = true;
		}
		if (hit && this.wobbly) {
			var turn = rand(-WOBBLE, WOBBLE);
			var cosine = Math.cos(turn);
			var sine = Math.sin(turn);
			var vx = ball.vx * cosine - ball.vy * sine;
			ball.vy = ball.vx * sine + ball.vy * cosine;
			ball.vx = vx;
		}
	};

	/* Two balls that meet bounce apart, as billiard balls do. */
	Rebound.prototype.collide = function (a, b) {
		var dx = b.x - a.x, dy = b.y - a.y;
		var reach = a.radius + b.radius;
		var d = Math.hypot(dx, dy);
		if (d >= reach || d === 0) {
			return;
		}
		var nx = dx / d, ny = dy / d;
		var push = (reach - d) / 2;
		a.x -= nx * push; a.y -= ny * push;
		b.x += nx * push; b.y += ny * push;
		var closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
		if (closing <= 0) {
			return;
		}
		var k = 2 * closing / (a.mass + b.mass);
		a.vx -= k * b.mass * nx; a.vy -= k * b.mass * ny;
		b.vx += k * a.mass * nx; b.vy += k * a.mass * ny;
	};

	Rebound.prototype.step = function (dt, w, h) {
		var i, j;
		for (i = 0; i < this.balls.length; i += 1) {
			var ball = this.balls[i];
			ball.x += ball.vx * dt;
			ball.y += ball.vy * dt;
		}
		for (i = 0; i < this.balls.length; i += 1) {
			for (j = i + 1; j < this.balls.length; j += 1) {
				this.collide(this.balls[i], this.balls[j]);
			}
		}
		for (i = 0; i < this.balls.length; i += 1) {
			this.bounce(this.balls[i], w, h);
		}
	};

	Rebound.prototype.draw = function (ctx, w, h) {
		if (this.clearScreen) {
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);
		} else {
			// they fly over the desktop, not smear across it
			if (!this.desk || this.desk.width !== Math.round(w) || this.desk.height !== Math.round(h)) {
				this.desk = AfterDark.desktop(Math.round(w), Math.round(h));
			}
			ctx.drawImage(this.desk, 0, 0, w, h);
		}
		for (var i = 0; i < this.balls.length; i += 1) {
			var ball = this.balls[i];
			ball.bitmap.draw(ctx, ball.x, ball.y);
		}
	};

	function ReboundElement() {
		return Reflect.construct(HTMLElement, [], ReboundElement);
	}
	ReboundElement.prototype = Object.create(HTMLElement.prototype);
	ReboundElement.prototype.constructor = ReboundElement;
	Object.setPrototypeOf(ReboundElement, HTMLElement);

	ReboundElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		var self = this;
		var base = this.getAttribute('art') || 'art/rebound';
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		window.AfterDark.load(base).then(function (art) {
			var sim = new Rebound(art);
			var type = (AfterDark.setting(self, 'ball-type') || 'both').toLowerCase();
			var balls = (AfterDark.setting(self, 'balls') || 'lots more').toLowerCase();
			if (type === 'plastic' || type === 'metal' || type === 'both') {
				sim.type = type;
			}
			sim.count = BALL_COUNTS[balls] || parseInt(balls, 10) || BALL_COUNTS['lots more'];
			sim.count = Math.max(1, Math.min(BALL_COUNTS.oodles, sim.count));
			sim.wobbly = AfterDark.flag(self, 'wobbly');
			sim.clearScreen = AfterDark.flag(self, 'clear-screen');

			var screen = new AfterDark.Screen(self);
			self._screen = screen;
			self.sim = sim;
			screen.onresize = function (w, h) {
				sim.reset(w, h);
			};
			sim.reset(screen.width, screen.height);
			screen.run(function (dt, ctx, w, h) {
				sim.step(dt, w, h);
				sim.draw(ctx, w, h);
			});
		}).catch(function (error) {
			console.error('Could not start Rebound:', error);
			self.textContent = error.message;
		});
	};

	ReboundElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-rebound', ReboundElement);
	window.AfterDarkRebound = Rebound;
}());
