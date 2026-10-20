/**
 * bogglins.js - Bogglins, using the original 256-colour artwork.
 *
 * BOGGLINS.AD, from the classic set. Its own description:
 *
 *   "A Bogglin is sort of a cross between Santa Claus and a pickle. He has
 *    apparently just eaten several hundred pounds of something that doesn't
 *    agree with him.
 *    This example of Manga (Japanese-style cartooning) was written by Andy
 *    Karn, based on animated art submitted by Dann Auld to the 1992 After
 *    Dark Contest."
 *   Windows version by Paul Sasse. Original Mac version by Dann Auld and
 *   Andy Karn.
 *
 * The settings are its own, out of TYPE_1000: Explosivity = Unstable /
 * Volatile / Dangerous / Evacuate!, and Twanginess = Mild / Rich / Zesty /
 * Sharp.
 *
 * Artwork, from tools/adclassic.py, the 256-colour band 2111-2120. Ten frames:
 *   2111-2114  squashed flat to stretched tall, one bounce
 *   2115-2118  he detonates, then the smoke thins
 *   2119       a small lump
 *   2120       flattened into a puddle
 *
 * Checked against the real module under Wine at 1024x768 (40 s at the
 * defaults, 30 s at Evacuate!/Sharp; 15 fps):
 *   - There is one Bogglin. He does not hop: he bounces on the spot, the four
 *     bounce frames going up and back down about fifteen a second, while he
 *     drifts across the screen at ~45 px/s on each axis, a step of about
 *     (3, 3) px a frame. He changes direction now and then of his own accord,
 *     and off the edges, and every so often stands still for half a second.
 *   - Now and then he explodes where he is: 2115-2118 over about a third of a
 *     second. Then a lump (2119) drops out of the top of the screen somewhere
 *     else, too fast to see in more than one frame, lands as a puddle (2120)
 *     for about a quarter of a second, and bounces off from there.
 *   - At the default Explosivity that is every ~8 s (5 in 40 s); at
 *     Evacuate! every ~2 s.
 * Still inferred: the rates for Unstable and Dangerous (between those two);
 * and Twanginess, which changed nothing visible between the default (54 of
 * 100, shown as Rich) and Sharp - it is taken to be the pitch of his boing,
 * so it is accepted here and does nothing.
 *
 * The blob sits low in a 153x156 bitmap, so drawing is from the feet rather
 * than the frame centre.
 *
 *   <after-dark-bogglins explosivity="volatile" twanginess="rich">
 */
(function () {
	'use strict';

	var BOUNCE = ['2111', '2112', '2113', '2114'];
	var BOOM = ['2115', '2116', '2117', '2118'];
	var LUMP = '2119';
	var PUDDLE = '2120';

	/* Explosions per second. The module's default (54 of 100, which its popup
	   shows as Volatile) measured one every ~8 s, Evacuate! one every ~2 s. */
	var EXPLOSIVITY = {
		unstable: 0.07,
		volatile: 0.125,
		dangerous: 0.3,
		'evacuate!': 0.5
	};
	/* Accepted, but nothing to see: it did not change the bounce or the drift. */
	var TWANG = { mild: {}, rich: {}, zesty: {}, sharp: {} };

	/* Feet of the idle frames, in bitmap space. Explosions share the same x. */
	var FEET_X = 78;
	var FEET_Y = 147;
	var HALF_W = 60;              // half the widest bounce frame, for the edges
	var TALL = 135;               // feet to the top of the tallest one
	var BOUNCE_FPS = 15;
	var DRIFT_MIN = 30, DRIFT_MAX = 70;   // px/s on each axis
	var TURN_MIN = 1.5, TURN_MAX = 5;     // seconds between changes of mind
	var PAUSE = 0.5, PAUSE_CHANCE = 0.2;
	var BOOM_FPS = 12;
	var DROP = 0.12;              // seconds the lump takes to fall in
	var SPLAT = 0.27;             // and lies as a puddle

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Bogglins(art) {
		console.assert(art, 'Bogglins needs decoded artwork');
		this.art = art;
		this.bounce = BOUNCE.map(function (id) { return art.bitmap(id); })
			.filter(Boolean);
		this.boom = BOOM.map(function (id) { return art.bitmap(id); })
			.filter(Boolean);
		this.lump = art.bitmap(LUMP);
		this.puddle = art.bitmap(PUDDLE);
		console.assert(this.bounce.length === 4, 'bogglin bounce cycle');
		this.chance = EXPLOSIVITY.volatile;
		this.crew = [];
	}

	Bogglins.prototype.heading = function (b) {
		b.vx = rand(DRIFT_MIN, DRIFT_MAX) * (Math.random() < 0.5 ? -1 : 1);
		b.vy = rand(DRIFT_MIN, DRIFT_MAX) * (Math.random() < 0.5 ? -1 : 1);
		b.turn = rand(TURN_MIN, TURN_MAX);
	};

	Bogglins.prototype.spawn = function (w, h) {
		var b = {
			x: rand(HALF_W, Math.max(HALF_W + 1, w - HALF_W)),
			y: rand(TALL, Math.max(TALL + 1, h)),
			phase: 0,
			state: 'bounce',
			frame: 0,
			wait: 0,
			drop: 0
		};
		this.heading(b);
		return b;
	};

	Bogglins.prototype.reset = function (w, h) {
		this.crew = [this.spawn(w, h)];
	};

	Bogglins.prototype.drawAt = function (ctx, bitmap, x, y) {
		if (!bitmap) {
			return;
		}
		ctx.drawImage(bitmap.image,
			Math.round(x - FEET_X), Math.round(y - FEET_Y));
	};

	/* Up the four frames and back down: 0 1 2 3 2 1 0 ... */
	function bounceFrame(phase) {
		var k = Math.floor(phase) % 6;
		return k < 4 ? k : 6 - k;
	}

	Bogglins.prototype.step = function (dt, w, h) {
		for (var i = 0; i < this.crew.length; i += 1) {
			var b = this.crew[i];
			if (b.state === 'bounce' || b.state === 'pause') {
				if (Math.random() < this.chance * dt) {
					b.state = 'boom';
					b.frame = 0;
					continue;
				}
				b.turn -= dt;
				if (b.state === 'pause') {
					if (b.turn <= 0) { b.state = 'bounce'; this.heading(b); }
					continue;
				}
				b.phase += dt * BOUNCE_FPS;
				b.frame = bounceFrame(b.phase);
				if (b.turn <= 0) {
					if (Math.random() < PAUSE_CHANCE) {
						b.state = 'pause';
						b.frame = 1;
						b.turn = PAUSE;
						continue;
					}
					this.heading(b);
				}
				b.x += b.vx * dt;
				b.y += b.vy * dt;
				if (b.x < HALF_W) { b.x = HALF_W; b.vx = Math.abs(b.vx); }
				if (b.x > w - HALF_W) { b.x = w - HALF_W; b.vx = -Math.abs(b.vx); }
				if (b.y < TALL) { b.y = TALL; b.vy = Math.abs(b.vy); }
				if (b.y > h) { b.y = h; b.vy = -Math.abs(b.vy); }
			} else if (b.state === 'boom') {
				b.frame += dt * BOOM_FPS;
				if (b.frame >= this.boom.length) {
					// and somewhere else, another one drops in
					var next = this.spawn(w, h);
					b.x = next.x;
					b.y = next.y;
					b.state = 'drop';
					b.drop = 0;
				}
			} else if (b.state === 'drop') {
				b.drop += dt / DROP;
				if (b.drop >= 1) {
					b.state = 'puddle';
					b.wait = SPLAT;
				}
			} else if (b.state === 'puddle') {
				b.wait -= dt;
				if (b.wait <= 0) {
					b.state = 'bounce';
					b.phase = 0;
					this.heading(b);
				}
			}
		}
	};

	Bogglins.prototype.draw = function (ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		for (var i = 0; i < this.crew.length; i += 1) {
			var b = this.crew[i];
			if (b.state === 'bounce' || b.state === 'pause') {
				this.drawAt(ctx, this.bounce[b.frame], b.x, b.y);
			} else if (b.state === 'boom') {
				this.drawAt(ctx, this.boom[Math.min(this.boom.length - 1, Math.floor(b.frame))], b.x, b.y);
			} else if (b.state === 'drop') {
				this.drawAt(ctx, this.lump, b.x, b.drop * b.y);
			} else {
				this.drawAt(ctx, this.puddle, b.x, b.y);
			}
		}
	};

	function BogglinsElement() {
		return Reflect.construct(HTMLElement, [], BogglinsElement);
	}
	BogglinsElement.prototype = Object.create(HTMLElement.prototype);
	BogglinsElement.prototype.constructor = BogglinsElement;
	Object.setPrototypeOf(BogglinsElement, HTMLElement);

	BogglinsElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		var self = this;
		var base = this.getAttribute('art') || 'art/bogglins';
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		window.AfterDark.load(base).then(function (art) {
			var sim = new Bogglins(art);
			var bang = (AfterDark.setting(self, 'explosivity') || 'volatile').toLowerCase();
			var twang = (AfterDark.setting(self, 'twanginess') || 'rich').toLowerCase();
			sim.chance = EXPLOSIVITY[bang] || EXPLOSIVITY.volatile;
			sim.twang = TWANG[twang] ? twang : 'rich';

			var screen = new AfterDark.Screen(self);
			self._screen = screen;
			self.sim = sim;
			screen.onresize = function (width, height) {
				sim.reset(width, height);
			};
			sim.reset(screen.width, screen.height);
			screen.run(function (dt, ctx, width, height) {
				sim.step(dt, width, height);
				sim.draw(ctx, width, height);
			});
		}).catch(function (error) {
			console.error('Could not start Bogglins:', error);
			self.textContent = error.message;
		});
	};

	BogglinsElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-bogglins', BogglinsElement);
	window.AfterDarkBogglins = Bogglins;
	Bogglins.EXPLOSIVITY = EXPLOSIVITY;
	Bogglins.TWANG = TWANG;
}());
