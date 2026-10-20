/**
 * critic.js - Art Critic, who comes to look at your pictures.
 *
 * CRITIC.AD's own description:
 *
 *   "Art Critic - Click on "Pictures" and select the folder with the gifs,
 *    jpegs or bitmaps that you want. ... All images that are in the selected
 *    folder will display. ... "Critic Appears" determines the frequency with
 *    which the critic appears. "Duration" determines how long the images will
 *    remain on your screen. "Display" determines whether the images will
 *    display randomly or in order."
 *   Programming by Jeff Mott, art by Bob Ting, additional art by Craig Foster.
 *
 * Its controls are Pictures (a folder), Critic Appears (Never, Rarely, Often,
 * Always), Duration (10 seconds ... 15 minutes) and Display (In order,
 * Random). With no folder picked it looks in "Pictures" beside the module,
 * which in the 10th-anniversary set is the PICTURES folder SlideShow uses
 * too - so `pictures="pictures"` is those eleven, out of all/art/slide/,
 * `pictures="bitmaps"` is SlideShow's other two, and `pictures="none"` is an
 * empty folder: the module's own "Sorry, there are no valid files in your
 * art folder." along the top, and a made-up abstract in every frame.
 *
 * Its art, in all/art/critic/: 25 RLE sequences - the critic in pieces
 * (legs, skirt, a dozen heads) and whole, his self-portrait in a little gold
 * frame, the brass stanchions and red rope, a picture hook, and eight kinds of
 * frame, each a straight piece of top, a straight piece of side and a corner.
 * How the pieces go together is the module's TYPE_8100 / TYPE_8102
 * resources, kept in index.json as `film`: 441 composite cels (sprite, flip,
 * position) and 1,395 frames of choreography in 49 runs, each frame a cel and
 * an offset. The runs are the module's own - he climbs out of his portrait,
 * falls, lands, gets up, walks, walks on the spot, stops, and has eighteen
 * different reactions to a picture - and so is everything about how he moves
 * within them.
 *
 * What is measured off captures of the real thing at 1024x768, one with an
 * empty folder and one with the PICTURES folder: the rope's top is 139px
 * above the bottom of the screen and the frame's bottom 56px above that, the
 * hook 4px over the frame, all centred. A picture is shown at its own size and
 * the frame is as many whole pieces as fit inside it, centred on it, so it
 * laps over the picture's edge. The rope is an end post, a run of 52px
 * post-and-rope pieces - one per 52px of frame and one more, at least four
 * (which fits all five frames seen) - and the other end post.
 *
 * It starts with the critic in his portrait (drawn mirrored, as the original
 * does): he climbs out, drops to the floor and walks off left.
 * Then a picture; he comes in from one side or the other, stops at the near
 * end of the rope, reacts, and walks on and off. When the picture's time is
 * up and he has gone it is either swapped straight away or he comes back from
 * the left and walks on the spot while the whole wall scrolls left to the next
 * picture, at about 78px a second. He plays at about 13.5 frames a second.
 *
 * Default settings are what the capture showed with nothing set: Display is
 * Random, Duration 10 seconds, and he turned up for every picture.
 *
 * Filled in, because the captures cannot say: how often "Rarely" and "Often"
 * are; which of the two ways a picture is changed (an even chance here); how
 * far apart the pictures are on the wall when it scrolls (a screen and 200px
 * between frames, which is what the one scroll in the capture fits); that he
 * reacts once per visit and stops and reacts again after a scroll; and the
 * made-up abstract's size and shapes - the look of the original's, not its
 * random numbers.
 *
 *   <after-dark-art-critic art="art/critic" pictures="pictures" critic-appears="always"
 *     duration="10 seconds" display="random">
 */
(function () {
	'use strict';

	var APPEARS = ['never', 'rarely', 'often', 'always'];
	var CHANCE = [0, 0.3, 0.7, 1];
	var DURATIONS = ['10 seconds', '20 seconds', '30 seconds', '45 seconds', '1 minute', '1.5 minutes',
		'2 minutes', '3 minutes', '5 minutes', '10 minutes', '15 minutes'];
	var SECONDS = [10, 20, 30, 45, 60, 90, 120, 180, 300, 600, 900];
	var DISPLAYS = ['in order', 'random'];
	var PICTURES = ['pictures', 'bitmaps', 'none'];
	var SORRY = 'Sorry, there are no valid files in your art folder.';

	var FPS = 13.5;
	/* Runs of the film, by their first frame number. */
	var INTRO = 2, FALL = 47, LAND = 52, ON_THE_SPOT = 84, WALK = 95, STOP = 125, GO = 137,
		HOP = 178, GETUP = 190, DASH = 1209;
	var REACTIONS = [207, 271, 329, 414, 498, 569, 647, 672, 746, 829, 881, 930, 1020, 1094, 1151,
		1214, 1318, 1370];
	/* The one that ends with him running off the way he came. */
	var RUNS_OFF = 1151;
	/* Cel 31 is the portrait with him gone out of it. */
	var EMPTY_PORTRAIT = 31;

	/* The eight frames, as frame numbers in sequence 26024: top piece, side piece, corner. */
	var FRAMES = [[0, 1, 2], [5, 6, 7], [10, 11, 12], [8, 9, 4], [13, 14, 15], [18, 19, 17], [21, 22, 20], [24, 25, 23]];
	var HOOK = 26;

	/* Measured at 1024x768: from the bottom of the screen, and from the rope's top. */
	var ROPE_UP = 139;
	var FRAME_UP = 56;
	var HOOK_GAP = 4;
	var CRITIC_Y = -242;     // his runs' y, against the rope's top
	var PORTRAIT_Y = -375;   // the portrait's
	var LANDING_Y = -396;    // and where he comes down from it
	var PORTRAIT_X = 224;    // the portrait's run x, against the middle of the screen (mirrored)
	var STOP_X = 301;        // his run x outside the rope's left end when he stops there,
	var STOP_X_MIRRORED = 274; // and the right end (the original is not quite symmetrical)
	var STRIDE = 160;
	var SCROLL = 78;         // px a second
	var SPOT_X = 0.395;      // where he walks on the spot (his left edge), across the screen
	var GAP = 200;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	/* ------------------------------------------------------------ film --- */

	function Film(art, film) {
		this.art = art;
		this.cels = film.cels;
		this.labels = film.labels;
	}

	/**
	 * One cel at run position (x, y) plus (ox, oy). Mirrored, a sprite at x
	 * of width w goes to ox - x - w, facing the other way.
	 */
	Film.prototype.draw = function (ctx, cel, ox, oy, mirror) {
		var layers = this.cels[cel];
		for (var i = 0; i < layers.length; i += 1) {
			var L = layers[i], seq = this.art.sequence(L[0]);
			if (!seq) { continue; }
			var f = seq.frames[L[1]];
			var flip = L[2], x = mirror ? ox - L[3] - f.w : ox + L[3], y = oy + L[4];
			if (mirror) { flip ^= 1; }
			x = Math.round(x);
			y = Math.round(y);
			if (!flip) {
				ctx.drawImage(seq.image, f.x, f.y, f.w, f.h, x, y, f.w, f.h);
			} else {
				ctx.save();
				ctx.translate(x + (flip & 1 ? f.w : 0), y + (flip & 2 ? f.h : 0));
				ctx.scale(flip & 1 ? -1 : 1, flip & 2 ? -1 : 1);
				ctx.drawImage(seq.image, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
				ctx.restore();
			}
		}
	};

	/** A cel's left and right, in run coordinates. */
	Film.prototype.extent = function (cel) {
		var layers = this.cels[cel], l = Infinity, r = -Infinity;
		for (var i = 0; i < layers.length; i += 1) {
			var seq = this.art.sequence(layers[i][0]);
			if (!seq) { continue; }
			l = Math.min(l, layers[i][3]);
			r = Math.max(r, layers[i][3] + seq.frames[layers[i][1]].w);
		}
		return [l, r];
	};

	/**
	 * The critic: a run of the film at a base position, maybe mirrored. Going
	 * from one run to the next, if the new one starts on the cel the old one
	 * ended on, the base moves so that cel stays put - that is how the runs
	 * chain (a walk's stride, a hop, getting up) without the module saying so.
	 */
	function Actor(film) {
		this.film = film;
		this.run = null;
		this.i = 0;
		this.t = 0;
		this.bx = 0;
		this.by = 0;
		this.mirror = false;
		this.loop = false;
		this.done = true;
	}

	Actor.prototype.ex = function (rec) {
		return this.mirror ? -rec[1] : rec[1];
	};

	Actor.prototype.play = function (start, loop) {
		var run = this.film.labels[String(start)];
		if (this.run) {
			var last = this.run[this.i];
			if (last[0] === run[0][0]) {
				this.bx += this.ex(last) - this.ex(run[0]);
				this.by += last[2] - run[0][2];
			}
		}
		this.start = start;
		this.run = run;
		this.i = 0;
		this.t = 0;
		this.loop = !!loop;
		this.done = false;
	};

	Actor.prototype.tick = function (dt) {
		if (!this.run || this.done) { return; }
		this.t += dt * FPS;
		while (this.t >= 1 && !this.done) {
			this.t -= 1;
			var n = this.run.length;
			if (this.loop && this.i >= n - 2) {
				/* A looping run's last frame is its first again, a stride on. */
				this.bx += this.ex(this.run[n - 1]) - this.ex(this.run[0]);
				this.by += this.run[n - 1][2] - this.run[0][2];
				this.i = 0;
			} else if (this.i < n - 1) {
				this.i += 1;
			} else {
				this.done = true;
			}
		}
	};

	/** Left and right on the screen. */
	Actor.prototype.span = function () {
		var rec = this.run[this.i], e = this.film.extent(rec[0]);
		if (this.mirror) { return [this.bx - rec[1] - e[1], this.bx - rec[1] - e[0]]; }
		return [this.bx + rec[1] + e[0], this.bx + rec[1] + e[1]];
	};

	Actor.prototype.draw = function (ctx) {
		if (!this.run) { return; }
		var rec = this.run[this.i];
		this.film.draw(ctx, rec[0], this.bx + this.ex(rec), this.by + rec[2], this.mirror);
	};

	/* --------------------------------------------------------- pictures --- */

	/**
	 * What the module hangs when its folder has nothing it can read: a
	 * coloured ground and a heap of flat rectangles and ellipses in random
	 * colours, inset from the edge.
	 */
	function abstract(w, h) {
		var c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		var g = c.getContext('2d');
		function colour() {
			return 'rgb(' + Math.floor(rand(0, 256)) + ',' + Math.floor(rand(0, 256)) + ',' + Math.floor(rand(0, 256)) + ')';
		}
		g.fillStyle = 'rgb(' + Math.floor(rand(30, 130)) + ',' + Math.floor(rand(20, 50)) + ',' + Math.floor(rand(100, 150)) + ')';
		g.fillRect(0, 0, w, h);
		var mx = Math.round(w * 0.05), my = Math.round(h * 0.06);
		var n = Math.round(w * h / 1000);
		for (var i = 0; i < n; i += 1) {
			var sw = Math.round(rand(8, w * 0.32)), sh = Math.round(rand(8, h * 0.4));
			var x = Math.round(rand(mx, w - mx - sw)), y = Math.round(rand(my, h - my - sh));
			g.fillStyle = colour();
			if (Math.random() < 0.55) {
				g.fillRect(x, y, sw, sh);
			} else {
				g.beginPath();
				g.ellipse(x + sw / 2, y + sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
				g.fill();
			}
		}
		return c;
	}

	/* ------------------------------------------------------------ critic --- */

	function ArtCritic() {
		this.chance = CHANCE[3];
		this.duration = SECONDS[0];
		this.random = true;
		this.art = null;
	}

	ArtCritic.prototype.ready = function (art, film, slides, catalog) {
		this.art = art;
		this.film = new Film(art, film);
		this.slides = slides;
		this.catalog = catalog || [];
		this.order = -1;
		this.critic = new Actor(this.film);
		this.reset();
	};

	ArtCritic.prototype.resize = function (w, h) {
		this.k = Math.max(1, Math.floor(Math.min(w / 1024, h / 768) + 0.25));
		this.w = Math.round(w / this.k);
		this.h = Math.round(h / this.k);
		this.reset();
	};

	ArtCritic.prototype.reset = function () {
		if (!this.art || !this.w) { return; }
		this.ropeY = Math.round(this.h - ROPE_UP);
		this.wall = [];
		this.mode = 'none';
		this.critic.run = null;
		if (this.chance > 0) {
			this.startIntro();
		} else {
			this.wall = [this.hang(this.nextImage(), 0)];
			this.arrived();
		}
	};

	/* The stanchions for a frame fw wide: n pieces of rope between two end posts. */
	ArtCritic.prototype.drawRope = function (ctx, cx, n) {
		var seq = this.art.sequence(26023), piece = seq.frames[0], post = seq.frames[1];
		var x = Math.round(cx - (2 * post.w + n * 52) / 2), y = this.ropeY;
		ctx.drawImage(seq.image, post.x, post.y, post.w, post.h, x, y, post.w, post.h);
		x += post.w;
		for (var i = 0; i < n; i += 1) {
			ctx.drawImage(seq.image, piece.x, piece.y, piece.w, piece.h, x, y, piece.w, piece.h);
			x += piece.w;
		}
		ctx.save();
		ctx.translate(x + post.w, y);
		ctx.scale(-1, 1);
		ctx.drawImage(seq.image, post.x, post.y, post.w, post.h, 0, 0, post.w, post.h);
		ctx.restore();
	};

	ArtCritic.prototype.ropeEnds = function (item) {
		var post = this.art.sequence(26023).frames[1];
		var half = (2 * post.w + item.rope * 52) / 2;
		return [this.w / 2 + item.x - half, this.w / 2 + item.x + half];
	};

	/** The next picture from the folder, or a made-up one if it has none. */
	ArtCritic.prototype.nextImage = function () {
		var maxW = this.w - 80, maxH = this.ropeY - FRAME_UP - 70;
		if (!this.catalog.length) {
			var aw = Math.round(Math.min(maxW, rand(260, 390))), ah = Math.round(Math.min(maxH, rand(150, 300)));
			return { image: abstract(aw, ah), w: aw, h: ah };
		}
		if (this.random && this.catalog.length > 1) {
			var j;
			do { j = Math.floor(Math.random() * this.catalog.length); } while (j === this.order);
			this.order = j;
		} else {
			this.order = (this.order + 1) % this.catalog.length;
		}
		var bmp = this.slides.bitmap(this.catalog[this.order]);
		var image = bmp.image, iw = bmp.width, ih = bmp.height;
		var k = Math.min(1, maxW / iw, maxH / ih);
		if (k < 1) {
			var c = document.createElement('canvas');
			c.width = Math.max(1, Math.round(iw * k));
			c.height = Math.max(1, Math.round(ih * k));
			c.getContext('2d').drawImage(image, 0, 0, c.width, c.height);
			image = c;
			iw = c.width;
			ih = c.height;
		}
		return { image: image, w: iw, h: ih };
	};

	/**
	 * A picture in one of the eight frames, hook above: a canvas whose bottom
	 * is the frame's bottom, centred on the frame. x is where it hangs on the
	 * wall, from the middle of the screen.
	 */
	ArtCritic.prototype.hang = function (pic, x) {
		var seq = this.art.sequence(26024), style = pick(FRAMES);
		var top = seq.frames[style[0]], side = seq.frames[style[1]], corner = seq.frames[style[2]];
		var tw = top.w, th = top.h, sw = side.w, sh = side.h;
		var nx = Math.max(1, Math.floor(pic.w / tw)), ny = Math.max(1, Math.floor(pic.h / sh));
		var fw = nx * tw + 2 * sw, fh = ny * sh + 2 * th;
		var hook = seq.frames[HOOK], lift = hook.h + HOOK_GAP;
		var cw = Math.max(fw, pic.w), ch = Math.max(fh, pic.h);
		var c = document.createElement('canvas');
		c.width = cw;
		c.height = ch + lift;
		var g = c.getContext('2d');
		g.imageSmoothingEnabled = false;
		var fx = Math.floor((cw - fw) / 2), fy = lift + Math.floor((ch - fh) / 2);
		g.drawImage(pic.image, 0, 0, pic.w, pic.h, Math.floor((cw - pic.w) / 2), lift + Math.floor((ch - pic.h) / 2), pic.w, pic.h);
		function piece(f, px, py, mx, my) {
			g.save();
			g.translate(fx + px + (mx ? f.w : 0), fy + py + (my ? f.h : 0));
			g.scale(mx ? -1 : 1, my ? -1 : 1);
			g.drawImage(seq.image, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
			g.restore();
		}
		var i;
		for (i = 0; i < nx; i += 1) {
			piece(top, sw + i * tw, 0, false, false);
			piece(top, sw + i * tw, fh - th, false, true);
		}
		for (i = 0; i < ny; i += 1) {
			piece(side, 0, th + i * sh, false, false);
			piece(side, fw - sw, th + i * sh, true, false);
		}
		piece(corner, 0, 0, false, false);
		piece(corner, fw - corner.w, 0, true, false);
		piece(corner, 0, fh - corner.h, false, true);
		piece(corner, fw - corner.w, fh - corner.h, true, true);
		g.drawImage(seq.image, hook.x, hook.y, hook.w, hook.h, Math.round(fx + fw / 2 - hook.w / 2), fy - lift, hook.w, hook.h);
		return { canvas: c, x: x, w: fw, below: ch + lift - (fy + fh), rope: Math.max(4, Math.round(fw / 52) + 1) };
	};

	/* The intro: his self-portrait, which he climbs out of, mirrored. */
	ArtCritic.prototype.startIntro = function () {
		var c = this.critic;
		c.run = null;
		c.mirror = true;
		c.bx = Math.round(this.w / 2 + PORTRAIT_X);
		c.by = this.ropeY + PORTRAIT_Y;
		c.play(INTRO);
		this.mode = 'intro';
		this.portrait = true;
		this.wall = [];
	};

	/** A picture is up: the critic may come and see it. */
	ArtCritic.prototype.arrived = function () {
		this.shown = 0;
		this.mode = 'none';
		this.visited = Math.random() >= this.chance;
		this.wait = rand(0.2, 0.6);
	};

	/** He walks in from one side, a whole number of strides from where he stops. */
	ArtCritic.prototype.enter = function () {
		var c = this.critic, ends = this.ropeEnds(this.wall[0]);
		c.run = null;
		c.mirror = Math.random() < 0.5;
		c.by = this.ropeY + CRITIC_Y;
		var e = this.film.extent(this.film.labels[String(WALK)][0][0]);
		var k;
		if (!c.mirror) {
			this.stopAt = Math.round(ends[0] - STOP_X);
			k = Math.max(1, Math.ceil((this.stopAt + e[1]) / STRIDE));
			c.bx = this.stopAt - k * STRIDE;
		} else {
			this.stopAt = Math.round(ends[1] + STOP_X_MIRRORED);
			k = Math.max(1, Math.ceil((this.w - this.stopAt + e[1]) / STRIDE));
			c.bx = this.stopAt + k * STRIDE;
		}
		c.play(WALK, true);
		this.mode = 'enter';
	};

	/** The picture's time is up and he has gone: swap it, or walk him to the next one. */
	ArtCritic.prototype.change = function () {
		if (Math.random() < this.chance && Math.random() < 0.5) {
			var c = this.critic, old = this.wall[0];
			var pic = this.nextImage();
			var item = this.hang(pic, 0);
			/* Hung a screen and a bit to the right of the one there now. */
			item.x = old.x + old.w / 2 + this.w + GAP + item.w / 2;
			this.wall.push(item);
			c.run = null;
			c.mirror = false;
			c.by = this.ropeY + CRITIC_Y;
			var e = this.film.extent(this.film.labels[String(WALK)][0][0]);
			this.stopAt = Math.round(this.w * SPOT_X - e[0]);
			c.bx = this.stopAt - Math.max(1, Math.ceil((this.stopAt + e[1] + 10) / STRIDE)) * STRIDE;
			c.play(WALK, true);
			this.mode = 'to-spot';
		} else {
			this.wall = [this.hang(this.nextImage(), 0)];
			this.arrived();
		}
	};

	ArtCritic.prototype.offstage = function () {
		var s = this.critic.span();
		return s[1] < -10 || s[0] > this.w + 10;
	};

	/** On to the next run when this one ends. */
	ArtCritic.prototype.advance = function (dt) {
		var c = this.critic;
		switch (this.mode) {
		case 'intro':
			if (c.done) { this.portrait = false; this.emptyPortrait = true; c.play(FALL); this.fall = true; this.mode = 'fall'; }
			break;
		case 'fall':
			if (c.done) {
				/* He comes down a little nearer than he stands later. */
				c.play(LAND);
				c.by = this.ropeY + LANDING_Y;
				this.mode = 'land';
			}
			break;
		case 'land':
			if (c.done) { c.play(HOP); this.mode = 'hop'; }
			break;
		case 'hop':
			if (c.done) { c.play(GETUP); this.mode = 'getup'; }
			break;
		case 'getup':
			if (c.done) { c.play(GO); this.mode = 'go'; }
			break;
		case 'enter':
			if (c.mirror ? c.bx <= this.stopAt : c.bx >= this.stopAt) {
				c.bx = this.stopAt;
				c.play(STOP);
				this.mode = 'stop';
			}
			break;
		case 'stop':
			if (c.done) { this.react = pick(REACTIONS); c.play(this.react); this.mode = 'react'; }
			break;
		case 'react':
			if (c.done) {
				if (this.react === RUNS_OFF) {
					c.play(DASH, true);
				} else {
					c.play(GO);
				}
				this.mode = this.react === RUNS_OFF ? 'leave' : 'go';
			}
			break;
		case 'go':
			if (c.done) { c.play(WALK, true); this.mode = 'leave'; }
			break;
		case 'leave':
			if (this.offstage()) {
				c.run = null;
				this.visited = true;
				this.mode = 'none';
				if (this.emptyPortrait) {
					this.emptyPortrait = false;
					this.wall = [this.hang(this.nextImage(), 0)];
					this.arrived();
				}
			}
			break;
		case 'to-spot':
			if (c.bx >= this.stopAt) {
				c.bx = this.stopAt;
				c.play(ON_THE_SPOT, true);
				this.mode = 'scroll';
			}
			break;
		case 'scroll':
			var step = SCROLL * dt, last = this.wall[this.wall.length - 1];
			step = Math.min(step, last.x);
			for (var i = 0; i < this.wall.length; i += 1) { this.wall[i].x -= step; }
			this.wall = this.wall.filter(function (it) { return it.x > -this.w || it === last; }, this);
			if (last.x <= 0) {
				this.wall = [last];
				this.shown = 0;
				this.visited = true;
				if (c.run[c.i][0] === this.film.labels[String(STOP)][0][0]) {
					c.play(STOP);
					this.mode = 'stop';
				} else {
					this.mode = 'settle';
				}
			}
			break;
		case 'settle':
			if (c.run[c.i][0] === this.film.labels[String(STOP)][0][0]) {
				c.play(STOP);
				this.mode = 'stop';
			}
			break;
		}
	};

	ArtCritic.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.art || !this.w) { return; }
		var c = this.critic;
		if (c.run) {
			c.tick(dt);
			this.advance(dt);
		}
		if (this.wall.length && this.mode === 'none') {
			this.shown += dt;
			if (!this.visited) {
				this.wait -= dt;
				if (this.wait <= 0) { this.enter(); }
			} else if (this.shown >= this.duration) {
				this.change();
			}
		} else if (this.wall.length) {
			this.shown += dt;
		}

		ctx.save();
		ctx.scale(this.k, this.k);
		ctx.imageSmoothingEnabled = false;
		if (!this.catalog.length && this.wall.length) {
			ctx.save();
			ctx.fillStyle = '#fff';
			ctx.font = 'bold 12px "MS Sans Serif", Tahoma, Arial, sans-serif';
			var tw = ctx.measureText(SORRY).width, sx = tw > 272 ? 272 / tw : 1;
			ctx.translate(Math.round(this.w / 2 - tw * sx / 2), 20);
			ctx.scale(sx, 1);
			ctx.fillText(SORRY, 0, 0);
			ctx.restore();
		}
		var bottom = this.ropeY - FRAME_UP, i;
		for (i = 0; i < this.wall.length; i += 1) {
			var it = this.wall[i], cx = Math.round(this.w / 2 + it.x);
			ctx.drawImage(it.canvas, Math.round(cx - it.canvas.width / 2), bottom + it.below - it.canvas.height);
			this.drawRope(ctx, cx, it.rope);
		}
		if (this.portrait || this.emptyPortrait) {
			var ox = Math.round(this.w / 2 + PORTRAIT_X), oy = this.ropeY + PORTRAIT_Y;
			if (this.emptyPortrait) { this.film.draw(ctx, EMPTY_PORTRAIT, ox, oy, true); }
			this.drawRope(ctx, this.w / 2, 4);
		}
		c.draw(ctx);
		ctx.restore();
	};

	AfterDark.define('after-dark-art-critic', function (el) {
		var sim = new ArtCritic();
		sim.chance = CHANCE[AfterDark.choice(el, 'critic-appears', APPEARS, 'always')];
		sim.duration = SECONDS[AfterDark.choice(el, 'duration', DURATIONS, '10 seconds')];
		sim.random = AfterDark.choice(el, 'display', DISPLAYS, 'random') === 1;
		var folder = PICTURES[AfterDark.choice(el, 'pictures', PICTURES, 'pictures')];
		var base = AfterDark.setting(el, 'art') || 'art/critic';
		var slides = AfterDark.setting(el, 'slides') || 'art/slide';
		var jobs = [AfterDark.load(base), AfterDark.data(base)];
		if (folder !== 'none') { jobs.push(AfterDark.load(slides), AfterDark.data(slides)); }
		Promise.all(jobs).then(function (all) {
			var catalog = folder === 'none' ? [] : all[3].catalogs[folder];
			sim.ready(all[0], all[1].film, all[2] || null, catalog);
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkArtCritic = ArtCritic;
}());
