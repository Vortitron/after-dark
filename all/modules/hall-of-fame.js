/**
 * hall-of-fame.js - the Hall of Fame, After Dark's characters on trading cards.
 *
 * Hall of Fame.ad (1999) describes itself as
 *
 *   "Your Favorite After Dark Characters on Anime Trading Card Screens ...
 *    Known far and wide, glorious and acclaimed, these characters have
 *    received awards and renown, celebrity and admiration. Now, they reside
 *    on your desktop, affiliating you with their cachet and celebrity. At
 *    last, you are one of the elite."
 *
 * It has no controls. It is built on Midnight Software's "AD Online" engine
 * and keeps its art beside it in hof.srf: 21 animated cards, each an
 * "offset strip" (frames of placed, LZ-compressed sprites on a 640x480
 * stage) with its own palette and a music loop. They are in
 * all/art/hall-of-fame/, one sheet per card plus index.json (see the
 * adsrf.py notes): the title (After Dark Hall of Fame, Artists' Cut, with a
 * flying toaster), Bad Dog, You Bet Your Head, Bogglins, Boris, Beula Hula,
 * Shadow, Mime Hunt, Rock Paper Scissors, Father Time, Phlegm Guy,
 * Chameleon, Daredevil Dan, Toxic, Lunatic Fringe, Mike's Life, Shocked
 * Monkey, Rat Race, Super Guy, Taluia Hula and the Flying Toasters.
 *
 * From OnlineModule::LoadHallOfFame / CheckHallOfFame / ShuffleOrder:
 *  - The cards play in a shuffled order - 30 random swaps among all but the
 *    first, so the title always opens each round of 21.
 *  - A card plays its strip once, start to end, at 15 frames a second (the
 *    Wine capture matches frame for frame), centred on the screen, and
 *    stays until its music loop has also finished. Then the screen goes
 *    black for 1.5 seconds and the next card starts.
 * The music itself is not played; only its length is used, from the 'snd '
 * headers. Items reaching off the 640x480 stage are clipped to it, which is
 * a guess. On a screen smaller than the stage the stage is scaled down.
 *
 *   <after-dark-hall-of-fame art="art/hall-of-fame">
 */
(function () {
	'use strict';

	/* 0x452f7c: the strips in play order, and 0x452fd0: each one's groove. */
	var STRIPS = [6090, 5000, 5010, 5020, 5030, 5040, 5050, 5060, 5070, 5080, 5090,
		6000, 6010, 6020, 6030, 6040, 6050, 6060, 6070, 6080, 7000];
	var GROOVES = [21, 1, 2, 4, 5, 3, 17, 12, 16, 8, 14, 6, 7, 9, 10, 11, 13, 15, 18, 19, 20];
	var FPS = 15;
	var GAP = 1.5;

	function HallOfFame() {
		this.data = null;
		this.base = 'art/hall-of-fame';
		this.images = {};
		this.order = [];
		for (var i = 0; i < STRIPS.length; i += 1) { this.order.push(i); }
		this.shuffle();
		this.index = 0;
		this.card = null;
	}

	HallOfFame.prototype.shuffle = function () {
		for (var n = 0; n < 30; n += 1) {
			var a = 1 + Math.floor(Math.random() * 20), b = 1 + Math.floor(Math.random() * 20);
			var t = this.order[a];
			this.order[a] = this.order[b];
			this.order[b] = t;
		}
	};

	HallOfFame.prototype.image = function (rid) {
		var self = this, key = String(rid);
		if (!this.images[key]) {
			var im = new Image();
			im.onload = function () { im.ready = true; };
			im.src = AfterDark.bust(this.base + '/' + this.data.strips[key].file);
			this.images[key] = im;
			im.ready = false;
			im.onerror = function () { if (window.console) { console.error('could not load', im.src); } self.images[key].failed = true; };
		}
		return this.images[key];
	};

	HallOfFame.prototype.start = function () {
		var k = this.order[this.index], rid = STRIPS[k];
		var strip = this.data.strips[String(rid)];
		this.card = {
			rid: rid,
			strip: strip,
			image: this.image(rid),
			t: 0,
			length: Math.max((strip.frames.length) / FPS, this.data.grooveSeconds[String(GROOVES[k])] || 0)
		};
		/* Fetch the next one while this plays. */
		var next = (this.index + 1) % STRIPS.length;
		this.image(STRIPS[this.order[next]]);
		this.black = 0;
	};

	HallOfFame.prototype.resize = function () {};

	HallOfFame.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.data) { return; }
		if (!this.card) { this.start(); }
		var c = this.card;
		if (!c.image.ready && !c.image.failed) { return; }
		if (c.t >= c.length) {
			/* Stopped: black for a second and a half, then the next card. */
			this.black += dt;
			if (this.black >= GAP) {
				this.index += 1;
				if (this.index >= STRIPS.length) {
					this.index = 0;
					this.shuffle();
				}
				this.start();
			}
			return;
		}
		c.t += dt;
		var f = Math.min(c.strip.frames.length - 1, Math.floor(c.t * FPS));
		var items = c.strip.frames[f];
		if (!items || !c.image.ready) { return; }
		var scale = Math.min(1, w / 640, h / 480);
		var ox = Math.round((w - 640 * scale) / 2), oy = Math.round((h - 480 * scale) / 2);
		ctx.save();
		ctx.beginPath();
		ctx.rect(ox, oy, 640 * scale, 480 * scale);
		ctx.clip();
		ctx.imageSmoothingEnabled = scale < 1;
		for (var i = 0; i < items.length; i += 1) {
			var it = items[i], cast = c.strip.casts[String(it[0])];
			if (!cast) { continue; }
			var x = ox + it[1] * scale, y = oy + it[2] * scale, iw = it[3] * scale, ih = it[4] * scale;
			if (it[5]) {
				ctx.save();
				ctx.translate(x + (it[5] & 1 ? iw : 0), y + (it[5] & 2 ? ih : 0));
				ctx.scale(it[5] & 1 ? -1 : 1, it[5] & 2 ? -1 : 1);
				ctx.drawImage(c.image, cast[0], cast[1], cast[2], cast[3], 0, 0, iw, ih);
				ctx.restore();
			} else {
				ctx.drawImage(c.image, cast[0], cast[1], cast[2], cast[3], x, y, iw, ih);
			}
		}
		ctx.restore();
	};

	AfterDark.define('after-dark-hall-of-fame', function (el) {
		var sim = new HallOfFame();
		sim.base = (AfterDark.setting(el, 'art') || 'art/hall-of-fame').replace(/\/$/, '');
		AfterDark.data(sim.base).then(function (d) {
			sim.data = d;
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkHallOfFame = HallOfFame;
}());
