/**
 * toilets.js - Flying Toilets, composed from the original TOILETS.AD frames.
 *
 * The module stores one sequence whose frames are separate scene parts:
 *   0-2 occupants, 3 toilet, 4-7 flapping wings, 8-16 paper rolls,
 *   17-19 plungers, and 20 the occasional flying pig.
 * How they go together is not guesswork: like the Totally Twisted set (it is a
 * Midnight Software module too) it ships a little film, OFMM/OFST/OFTB 9000,
 * which tools/adfilm.py adds to the art's index.json. Its 32 cels, each a
 * stack of frames at fixed offsets in a 126x126 box, play as:
 *   ticks  1-6   cels 0-3-0  an empty toilet, wings 4,5,6,7,6,5
 *   ticks 10-15  cels 4-7    the same with the cow (frame 0) on it
 *   ticks 20-25  cels 8-11   ... with frame 2 on it
 *   ticks 30-35  cels 12-15  ... with frame 1
 *   ticks 40-42 / 45-47 / 50-52  a roll unwinding: frames 8-10 (cow print),
 *                14-16 (pastel), 11-13 (white)
 *   ticks 55-57  cels 25-27  a plunger, 17-19;  60-62 the plunger held still
 *   ticks 65-70  cels 28-31  frame 1's toilet with the pig (20) on his head
 *
 * Checked against the real module under Wine at 1024x768 (25 s, defaults:
 * Nobody, White paper): toilets, toilet rolls and the odd plunger are each
 * their own flier, drawn at their own size (a winged toilet is 108x95), all
 * heading down and to the left at exactly 2 across to 1 down, at speeds from
 * ~45 to ~140 px/s across, in off the top and right edges. About eight are up
 * at once, roughly as many rolls as toilets. Still inferred: which occupant
 * is Aaron (Dumpin' Dan, frame 2, was confirmed by a capture), when the pig
 * turns up, and the Crowd counts other than the default (Lots More also
 * showed 6-7 up).
 *
 * The original control panel calls its options Crowd, Paper, Occupant and
 * Rude Sounds (the sounds are TT_SND.DLL's; not reproduced).
 */
(function () {
	'use strict';

	var SEQUENCE_ID = 9000;
	var CROWD_COUNTS = {
		few: 4,
		more: 8,
		'lots more': 12,
		'not pretty': 18,
		'phew!': 24
	};
	/* The film's toilet blocks: [first cel, the occupant frame it carries]. */
	var OCCUPANTS = {
		nobody: 0,
		"dumpin' dan": 8,
		bessie: 4,
		aaron: 12
	};
	var OCCUPANT_NAMES = Object.keys(OCCUPANTS);
	var PIG = 28;                       // cels 28-31: the pig rides along
	var PIG_CHANCE = 0.1;
	var FLAP = [0, 1, 2, 3, 2, 1];      // the film's wingbeat, ticks 1-6
	var PAPER_CELS = {
		'cow print': [16, 17, 18],
		pastel: [19, 20, 21],
		white: [22, 23, 24]
	};
	var PAPER_NAMES = Object.keys(PAPER_CELS);
	var PLUNGER_CELS = [25, 26, 27];
	var PLUNGER_CHANCE = 0.08;
	var ROLL_SHARE = 0.5;               // rolls to toilets, about even
	var HEADING = { x: -2 / Math.sqrt(5), y: 1 / Math.sqrt(5) };
	var MIN_SPEED = 45 * Math.sqrt(5) / 2;   // along the heading, for 45 px/s across
	var MAX_SPEED = 140 * Math.sqrt(5) / 2;
	var FPS = 10;                       // film ticks a second
	var BOX = 126;                      // the film's cel box

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	function Toilets(art, film) {
		this.art = art;
		this.sequence = art.sequence(SEQUENCE_ID);
		this.film = film;
		this.count = CROWD_COUNTS.more;
		this.paper = 'white';
		this.occupant = 'nobody';
		this.objects = [];
	}

	Toilets.prototype.launch = function (w, h, scattered) {
		var o = {
			speed: rand(MIN_SPEED, MAX_SPEED),
			tick: rand(0, 6)
		};
		var r = Math.random();
		if (r < PLUNGER_CHANCE) {
			o.cels = PLUNGER_CELS;
		} else if (r < ROLL_SHARE) {
			o.cels = PAPER_CELS[this.paper === 'random' ? pick(PAPER_NAMES) : this.paper] ||
				PAPER_CELS.white;
		} else {
			var who = this.occupant === 'random' ? pick(OCCUPANT_NAMES) : this.occupant;
			var first = OCCUPANTS[who] !== undefined ? OCCUPANTS[who] : 0;
			if (who === 'aaron' && Math.random() < PIG_CHANCE) { first = PIG; }
			o.cels = FLAP.map(function (k) { return first + k; });
		}
		if (scattered) {
			o.x = rand(-BOX / 2, w + BOX / 2);
			o.y = rand(-BOX / 2, h + BOX / 2);
		} else if (Math.random() < h / Math.max(1, w + h)) {
			o.x = w + BOX / 2;              // in from the right
			o.y = rand(-BOX / 2, h * 0.75);
		} else {
			o.x = rand(0, w + BOX / 2);      // in from the top
			o.y = -BOX / 2;
		}
		return o;
	};

	Toilets.prototype.reset = function (w, h) {
		this.objects = [];
		for (var i = 0; i < this.count; i += 1) {
			this.objects.push(this.launch(w, h, true));
		}
	};

	Toilets.prototype.step = function (dt, w, h) {
		for (var i = 0; i < this.objects.length; i += 1) {
			var o = this.objects[i];
			o.x += HEADING.x * o.speed * dt;
			o.y += HEADING.y * o.speed * dt;
			o.tick += FPS * dt;
			if (o.x < -BOX || o.y > h + BOX) {
				this.objects[i] = this.launch(w, h, false);
			}
		}
	};

	/* One cel: its frames stacked by layer at their offsets in the 126 box,
	   which is centred on the flier. */
	Toilets.prototype.drawCel = function (ctx, cel, cx, cy) {
		var seq = this.sequence;
		var x0 = cx - BOX / 2, y0 = cy - BOX / 2;
		for (var k = 0; k < cel.length; k += 1) {
			var f = seq.frames[cel[k][1]];
			if (f) {
				seq.draw(ctx, cel[k][1], x0 + cel[k][4] + f.w / 2, y0 + cel[k][5] + f.h / 2);
			}
		}
	};

	Toilets.prototype.draw = function (ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		var cels = this.film.cels;
		for (var i = 0; i < this.objects.length; i += 1) {
			var o = this.objects[i];
			this.drawCel(ctx, cels[o.cels[Math.floor(o.tick) % o.cels.length]], o.x, o.y);
		}
	};

	function ToiletsElement() {
		return Reflect.construct(HTMLElement, [], ToiletsElement);
	}
	ToiletsElement.prototype = Object.create(HTMLElement.prototype);
	ToiletsElement.prototype.constructor = ToiletsElement;
	Object.setPrototypeOf(ToiletsElement, HTMLElement);

	ToiletsElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		var self = this;
		var base = this.getAttribute('art') || 'art/toilets';
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		Promise.all([window.AfterDark.load(base), window.AfterDark.data(base)]).then(function (got) {
			var art = got[0];
			var film = got[1].films && got[1].films[SEQUENCE_ID];
			var sim = new Toilets(art, film);
			if (!sim.sequence || !film) {
				throw new Error('Flying Toilets artwork is missing sequence or film ' + SEQUENCE_ID);
			}
			var crowd = (AfterDark.setting(self, 'crowd') || 'more').toLowerCase();
			var paper = (AfterDark.setting(self, 'paper') || 'white').toLowerCase();
			var occupant = (AfterDark.setting(self, 'occupant') || 'nobody').toLowerCase();
			sim.count = CROWD_COUNTS[crowd] || parseInt(crowd, 10) || CROWD_COUNTS.more;
			sim.count = Math.max(1, Math.min(CROWD_COUNTS['phew!'], sim.count));
			if (paper === 'random' || PAPER_CELS[paper]) {
				sim.paper = paper;
			}
			if (occupant === 'random' ||
				Object.prototype.hasOwnProperty.call(OCCUPANTS, occupant)) {
				sim.occupant = occupant;
			}

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
			console.error('Could not start Flying Toilets:', error);
			self.textContent = error.message;
		});
	};

	ToiletsElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-toilets', ToiletsElement);
	window.AfterDarkToilets = Toilets;
}());
