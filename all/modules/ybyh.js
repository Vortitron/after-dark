/**
 * ybyh.js - You Bet Your Head!, the game show.
 *
 * YBYH.AD's own description:
 *
 *   "YOU BET YOUR HEAD! Ladies and gentlemen, welcome to You Bet Your Head,
 *    Berkeley System's wacky trivia game show. Contestants put their melon on
 *    the line for the chance to win fabulous prizes. Sit back and watch the
 *    action, or hit the CAPS LOCK key and put your gray matter to the test.
 *    To avoid a migraine, hit 1, 2, or 3 on the keyboard to select the
 *    correct answer. Programming by Andrew Armstrong and Jim Merkle. Art by
 *    Matt Small. Questions by Valerie Singer."
 *
 * Contestants is Text Only, 1, 2 or 3; Timer is 10 to 45 seconds; Show
 * Answers reveals the right one. Valerie Singer's questions are the module's
 * STRINGLISTs, 228 of them, the right answer first and the wrong ones after;
 * three answers are put up each time. The contestants are its three heads -
 * blue, red and green - on podiums with buzzers, and the stage is its
 * curtain and wood; the banners (THAT'S RIGHT! WRONG! TIME'S UP!), the
 * countdown digits and the gags for a wrong answer - a weight on the head, a
 * spring, a feather - are its own art too, in all/art/ybyh/. How the show was
 * staged is not in the resources, so this is one. Caps Lock and 1, 2, 3 let
 * you play.
 *
 *   <after-dark-you-bet-your-head art="art/ybyh" contestants="3" timer="20 seconds" show-answers>
 */
(function () {
	'use strict';

	var CONTESTANTS = ['text only', '1', '2', '3'];
	var TIMERS = ['10 seconds', '20 seconds', '30 seconds', '45 seconds'];
	var SECONDS = [10, 20, 30, 45];
	var HEADS = [1001, 1002, 1003];
	var COLOURS = ['#3a4cff', '#ff3030', '#30c030'];
	/* THAT'S RIGHT! / WRONG! / TIME'S UP! in the banner bitmap. */
	var BANNERS = [[0, 195], [195, 150], [345, 164]];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function shuffle(list) {
		for (var i = list.length - 1; i > 0; i -= 1) {
			var j = Math.floor(Math.random() * (i + 1));
			var t = list[i]; list[i] = list[j]; list[j] = t;
		}
		return list;
	}

	function YouBetYourHead() {
		this.players = 3;
		this.timer = 20;
		this.showAnswers = true;
		this.art = null;
		this.you = false;
	}

	YouBetYourHead.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.s = Math.min(w, h) / 480;
		this.scores = [0, 0, 0];
		if (this.data) { this.ask(); }
	};

	YouBetYourHead.prototype.ask = function () {
		var qs = this.data.questions, q = qs[Math.floor(Math.random() * qs.length)];
		var wrong = shuffle(q.a.slice(1)).slice(0, 2);
		var answers = shuffle([q.a[0]].concat(wrong));
		this.q = { text: q.q, answers: answers, right: answers.indexOf(q.a[0]) };
		this.phase = 'ask';
		this.clock = 0;
		this.buzz = -1;
		this.pick = -1;
		this.outcome = null;
		/* Who will buzz, and when, and whether they know it. */
		this.plan = [];
		for (var i = 0; i < this.players; i += 1) {
			this.plan.push({ at: rand(2, this.timer * 0.9), knows: Math.random() < 0.55 });
		}
	};

	YouBetYourHead.prototype.answer = function (who, choice) {
		this.buzz = who;
		this.pick = choice;
		this.phase = 'verdict';
		this.clock = 0;
		this.outcome = choice === this.q.right ? 'right' : 'wrong';
		if (this.outcome === 'right' && who >= 0) { this.scores[who] += 1; }
		this.gag = ['weight', 'spring', 'feather'][Math.floor(Math.random() * 3)];
	};

	YouBetYourHead.prototype.seq = function (id, i, x, y, k) {
		var q = this.art.sequence(id);
		if (!q) { return; }
		var f = q.frames[((i % q.count) + q.count) % q.count];
		k = k || this.s;
		this.ctx.drawImage(q.image, f.x, f.y, f.w, f.h, Math.round(x - f.w * k / 2), Math.round(y - f.h * k), f.w * k, f.h * k);
	};

	/** Text wrapped into a box; returns the height used. */
	YouBetYourHead.prototype.wrap = function (ctx, text, x, y, width, size) {
		ctx.font = 'bold ' + Math.round(size) + 'px Arial, Helvetica, sans-serif';
		var words = text.split(' '), line = '', lh = size * 1.25, used = 0;
		for (var i = 0; i < words.length; i += 1) {
			var next = line ? line + ' ' + words[i] : words[i];
			if (line && ctx.measureText(next).width > width) {
				ctx.fillText(line, x, y + used);
				used += lh;
				line = words[i];
			} else {
				line = next;
			}
		}
		ctx.fillText(line, x, y + used);
		return used + lh;
	};

	YouBetYourHead.prototype.stage = function (ctx, w, h) {
		var curtain = this.art.bitmap('curtain').image, wood = this.art.bitmap('wood').image, x, y, k = Math.max(1, this.s * 1.2);
		for (y = 0; y < h * 0.72; y += curtain.height * k) {
			for (x = 0; x < w; x += curtain.width * k) { ctx.drawImage(curtain, x, y, curtain.width * k, curtain.height * k); }
		}
		for (y = h * 0.72; y < h; y += wood.height * k) {
			for (x = 0; x < w; x += wood.width * k) { ctx.drawImage(wood, x, y, wood.width * k, wood.height * k); }
		}
	};

	YouBetYourHead.prototype.panel = function (ctx, w, h) {
		var s = this.s, px = w * 0.06, py = h * 0.04, pw = w * 0.88, ph = h * (this.players ? 0.4 : 0.6);
		ctx.fillStyle = 'rgba(0,0,0,0.85)';
		ctx.fillRect(px, py, pw, ph);
		ctx.strokeStyle = '#e8c040';
		ctx.lineWidth = Math.max(2, 3 * s);
		ctx.strokeRect(px, py, pw, ph);
		ctx.fillStyle = '#fff';
		ctx.textBaseline = 'top';
		var size = Math.max(11, 15 * s), used = this.wrap(ctx, this.q.text, px + 14 * s, py + 12 * s, pw - 80 * s, size);
		for (var i = 0; i < 3; i += 1) {
			var reveal = this.phase === 'verdict' && this.showAnswers && i === this.q.right;
			var chosen = this.phase === 'verdict' && i === this.pick;
			ctx.fillStyle = reveal ? '#7cff7c' : chosen ? '#ffe060' : '#e0e0ff';
			this.wrap(ctx, (i + 1) + '.  ' + this.q.answers[i], px + 30 * s, py + 18 * s + used + i * size * 1.5, pw - 60 * s, size * 0.95);
		}
		/* The countdown, in its own digits. */
		if (this.phase === 'ask') {
			var left = Math.max(0, Math.ceil(this.timer - this.clock)), digits = this.whiteDigits();
			var str = String(left), dk = Math.max(2, 3 * s);
			for (var d = 0; d < str.length; d += 1) {
				var n = Number(str.charAt(d)), row = n === 0 ? 0 : 10 - n;
				ctx.drawImage(digits, 0, row * 15, 10, 15, px + pw - (str.length - d) * 11 * dk - 8 * s, py + 8 * s, 10 * dk, 15 * dk);
			}
		}
	};

	/** The digits are black ink; the panel wants them white. */
	YouBetYourHead.prototype.whiteDigits = function () {
		if (!this.digitCanvas) {
			var src = this.art.bitmap('digits').image, c = document.createElement('canvas');
			c.width = src.width;
			c.height = src.height;
			var g = c.getContext('2d');
			g.drawImage(src, 0, 0);
			g.globalCompositeOperation = 'source-in';
			g.fillStyle = '#ffe060';
			g.fillRect(0, 0, c.width, c.height);
			this.digitCanvas = c;
		}
		return this.digitCanvas;
	};

	YouBetYourHead.prototype.contestants = function (ctx, w, h) {
		var s = this.s, n = this.players;
		for (var i = 0; i < n; i += 1) {
			var cx = w * (i + 1) / (n + 1), base = h * 0.95, podH = 80 * s, podW = 110 * s;
			/* The podium, in the contestant's colour, with the score on it. */
			ctx.fillStyle = '#5a3a1a';
			ctx.fillRect(cx - podW / 2, base - podH, podW, podH);
			ctx.fillStyle = COLOURS[i];
			ctx.fillRect(cx - podW / 2 + 6 * s, base - podH + 22 * s, podW - 12 * s, podH - 30 * s);
			ctx.fillStyle = '#fff';
			ctx.font = 'bold ' + Math.round(22 * s) + 'px Arial, sans-serif';
			ctx.textAlign = 'center';
			ctx.fillText(String(this.scores[i]), cx, base - podH + 30 * s);
			ctx.textAlign = 'left';
			var lit = this.buzz === i;
			this.seq(1016, lit ? 2 + Math.floor(this.clock * 6) % 2 : 0, cx, base - podH + 16 * s);
			/* The head, and what happens to it. */
			var headY = base - podH, frame = Math.floor(this.clock * 3 + i) % 3;
			var wrongHere = this.phase === 'verdict' && this.outcome !== 'right' && (this.buzz === i || this.buzz < 0);
			if (wrongHere) {
				var t = this.clock;
				if (this.gag === 'weight') {
					/* Down it comes: squash, then the head pops back. */
					var dropY = Math.min(headY - 70 * s, -60 * s + t * 900 * s);
					if (t < 0.4) { this.seq(1010, 0, cx, dropY); }
					frame = t < 0.4 ? 0 : t < 1.4 ? 4 : t < 1.8 ? 5 : 0;
					if (t >= 0.4 && t < 1.4) { this.seq(1010, 0, cx, headY - 25 * s); }
				} else if (this.gag === 'spring') {
					frame = [5, 6, 5, 6, 3, 0][Math.floor(t * 4) % 6];
					this.seq(1007, Math.floor(t * 8), cx + 40 * s, headY);
				} else {
					frame = Math.floor(t * 6) % 3;
					this.seq(1012, Math.floor(t * 10), cx + 30 * s, headY - 40 * s);
				}
			} else if (this.phase === 'verdict' && this.buzz === i) {
				frame = [5, 6, 0][Math.floor(this.clock * 4) % 3];
			}
			this.seq(HEADS[i], frame, cx, headY);
		}
	};

	YouBetYourHead.prototype.step = function (dt, ctx, w, h) {
		this.ctx = ctx;
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.art || !this.q) { return; }
		this.clock += dt;
		ctx.imageSmoothingEnabled = true;
		this.stage(ctx, w, h);
		if (this.phase === 'ask') {
			if (!this.you) {
				for (var i = 0; i < this.plan.length; i += 1) {
					var p = this.plan[i];
					if (this.clock >= p.at) {
						var choice = p.knows ? this.q.right : (this.q.right + 1 + Math.floor(Math.random() * 2)) % 3;
						this.answer(i, choice);
						break;
					}
				}
			}
			if (this.phase === 'ask' && this.clock >= this.timer) {
				this.phase = 'verdict';
				this.outcome = 'time';
				this.clock = 0;
				this.buzz = -1;
				this.gag = 'feather';
			}
		} else if (this.clock > 5) {
			this.ask();
		}
		this.panel(ctx, w, h);
		if (this.players) { this.contestants(ctx, w, h); }
		if (this.phase === 'verdict' && this.clock < 2.5) {
			var b = BANNERS[{ right: 0, wrong: 1, time: 2 }[this.outcome]], img = this.art.bitmap('banners').image;
			var k = Math.min(w * 0.6 / img.width, h * 0.35 / b[1]) * Math.min(1, this.clock * 4);
			ctx.drawImage(img, 0, b[0], img.width, b[1], w / 2 - img.width * k / 2, h * 0.42 - b[1] * k / 2, img.width * k, b[1] * k);
		}
	};

	AfterDark.define('after-dark-you-bet-your-head', function (el) {
		var sim = new YouBetYourHead();
		sim.players = AfterDark.choice(el, 'contestants', CONTESTANTS, '3');
		sim.timer = SECONDS[AfterDark.choice(el, 'timer', TIMERS, '20 seconds')];
		sim.showAnswers = AfterDark.flag(el, 'show-answers');
		window.addEventListener('keydown', function (e) {
			if (e.getModifierState) { sim.you = e.getModifierState('CapsLock'); }
			if (sim.you && sim.phase === 'ask' && /^[123]$/.test(e.key)) { sim.answer(-1, Number(e.key) - 1); }
		});
		var base = AfterDark.setting(el, 'art') || 'art/ybyh';
		Promise.all([AfterDark.load(base), AfterDark.data(base)]).then(function (both) {
			sim.art = both[0];
			sim.data = both[1];
			if (sim.w) { sim.ask(); }
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkYouBetYourHead = YouBetYourHead;
}());
