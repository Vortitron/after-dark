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
 * Answers leaves the right one up. The defaults are 3, 10 seconds and on.
 * Valerie Singer's questions are the module's STRINGLISTs, 228 of them, the
 * right answer first and the wrong ones after. The art is its own, in
 * all/art/ybyh/: the three heads, the podiums and their colour bars, the
 * score boxes and their odometer digits, the timer post with its dial, the
 * wooden arm and its mallet, the banners, and the gold, wood and fringe
 * textures the set is built from.
 *
 * Checked against the module running (8-bit captures of 120 s at the
 * defaults, and stills through the installed palette) and laid out to match
 * at 1024x768: a gold proscenium leaning back to the right round a dark
 * screen, the three score boxes - blue, red, green - down its right edge, a
 * wooden stage with a fringe below, the three heads on it behind their
 * podiums, the arm and mallet at the left and the timer post at the right.
 * The show opens on the title, then goes round the players: "Player One",
 * "Your question is...", the question, and the three answers a second
 * apart; the dial fills as the timer runs. Then THAT'S RIGHT!, WRONG! or
 * TIME'S UP! fills the screen for two seconds, the wrong answers go, and on
 * a miss the arm hops across and brings the mallet down on that head, which
 * comes up flat. Text is black in a white box a word, which is what the
 * module's text calls draw. The font is not in the module, so a similar one
 * stands in; what the heads do between times is a guess. Caps Lock and 1, 2,
 * 3 let you play.
 *
 *   <after-dark-you-bet-your-head art="art/ybyh" contestants="3" timer="10 seconds" show-answers>
 */
(function () {
	'use strict';

	var CONTESTANTS = ['text only', '1', '2', '3'];
	var TIMERS = ['10 seconds', '20 seconds', '30 seconds', '45 seconds'];
	var SECONDS = [10, 20, 30, 45];
	var HEADS = [1001, 1002, 1003];
	var NAMES = ['Player One', 'Player Two', 'Player Three'];
	/* THAT'S RIGHT! / WRONG! / TIME'S UP! in the banner bitmap. */
	var BANNERS = [[0, 195], [195, 150], [345, 164]];
	/* The set, at 1024x768. */
	var FRAME = [[155, 200], [830, 108], [790, 528], [240, 528]];
	var SIDE = [[830, 108], [855, 128], [805, 528], [790, 528]];
	var SCREEN = [[300, 252], [686, 203], [708, 220], [686, 524], [318, 524]];
	var FLOOR = [[240, 522], [860, 522], [893, 634], [140, 634]];
	var HEAD_X = [410, 510, 610], HEAD_BASE = 566;
	var BOX_AT = [[730, 237], [725, 287], [720, 337]];
	var HOME = [290, 552];
	var DIAL = [781, 514, 18];

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

	function poly(ctx, pts) {
		ctx.moveTo(pts[0][0], pts[0][1]);
		for (var i = 1; i < pts.length; i += 1) { ctx.lineTo(pts[i][0], pts[i][1]); }
		ctx.closePath();
	}

	function YouBetYourHead() {
		this.players = 3;
		this.timer = 10;
		this.showAnswers = true;
		this.art = null;
		this.you = false;
	}

	YouBetYourHead.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.s = Math.min(w / 1024, h / 768);
		this.scores = [0, 0, 0];
		this.shown = [0, 0, 0];
		this.turn = -1;
		this.phase = 'title';
		this.clock = 0;
		this.set = null;
		if (this.data) { this.pick(); }
	};

	YouBetYourHead.prototype.pick = function () {
		var qs = this.data.questions, q = qs[Math.floor(Math.random() * qs.length)];
		var wrong = shuffle(q.a.slice(1)).slice(0, 2);
		var answers = shuffle([q.a[0]].concat(wrong));
		this.q = { text: q.q, answers: answers, right: answers.indexOf(q.a[0]) };
		this.choice = -1;
		this.outcome = null;
		/* When the contestant answers, and whether they know it; past the timer is too late. */
		this.plan = { at: rand(1, this.timer * 1.15), knows: Math.random() < 0.5 };
	};

	YouBetYourHead.prototype.go = function (phase) {
		this.phase = phase;
		this.clock = 0;
	};

	YouBetYourHead.prototype.nextTurn = function () {
		this.pick();
		if (this.players) {
			this.turn = (this.turn + 1) % this.players;
			this.go('intro');
		} else {
			this.go('question');
		}
	};

	YouBetYourHead.prototype.answer = function (choice) {
		this.choice = choice;
		this.outcome = choice === this.q.right ? 'right' : 'wrong';
		if (this.outcome === 'right' && this.turn >= 0) { this.scores[this.turn] += 1; }
		this.go('verdict');
	};

	/* ------------------------------------------------------------- the set -- */

	YouBetYourHead.prototype.paintSet = function () {
		var c = document.createElement('canvas');
		c.width = 1024;
		c.height = 768;
		var g = c.getContext('2d');
		/* The fringe under the stage, then the stage. */
		var fringe = this.art.bitmap('curtain').image, pleats = this.art.bitmap('curtain2').image;
		g.save();
		g.beginPath();
		g.rect(140, 634, 753, 134);
		g.clip();
		g.fillStyle = g.createPattern(pleats, 'repeat');
		g.fillRect(140, 634, 753, 134);
		for (var x = 140; x < 893; x += fringe.width) { g.drawImage(fringe, x, 634); }
		g.restore();
		g.beginPath();
		poly(g, FLOOR);
		g.fillStyle = g.createPattern(this.art.bitmap('wood').image, 'repeat');
		g.fill();
		/* The proscenium: gold, its right side in shadow, round a dark screen. */
		var gold = g.createPattern(this.art.bitmap('gold').image, 'repeat');
		g.beginPath();
		poly(g, SIDE);
		g.fillStyle = gold;
		g.fill();
		g.fillStyle = 'rgba(0,0,40,0.45)';
		g.fill();
		g.beginPath();
		poly(g, FRAME);
		poly(g, SCREEN);
		g.fillStyle = gold;
		g.fill('evenodd');
		var dots = document.createElement('canvas');
		dots.width = 2;
		dots.height = 2;
		var d = dots.getContext('2d');
		d.fillStyle = '#000';
		d.fillRect(0, 0, 2, 2);
		d.fillStyle = '#808080';
		d.fillRect(0, 0, 1, 1);
		d.fillRect(1, 1, 1, 1);
		g.beginPath();
		poly(g, SCREEN);
		g.fillStyle = '#000';
		g.fill();
		g.fillStyle = g.createPattern(dots, 'repeat');
		g.globalAlpha = 0.6;
		g.fill();
		g.globalAlpha = 1;
		g.strokeStyle = '#2a2a2a';
		g.lineWidth = 3;
		g.stroke();
		return c;
	};

	YouBetYourHead.prototype.sprite = function (ctx, id, i, x, y, anchor) {
		var q = this.art.sequence(id);
		if (!q) { return; }
		var f = q.frames[((i % q.count) + q.count) % q.count];
		/* Anchored by the middle of its bottom edge, or its centre. */
		var top = anchor === 'centre' ? y - f.h / 2 : y - f.h;
		ctx.drawImage(q.image, f.x, f.y, f.w, f.h, Math.round(x - f.w / 2), Math.round(top), f.w, f.h);
	};

	/** Words in black, each in its own white box, centred on cx (or from x if left). */
	YouBetYourHead.prototype.say = function (ctx, text, x, y, size, left) {
		ctx.font = 'bold ' + size + 'px Verdana, Geneva, Arial, sans-serif';
		ctx.textBaseline = 'middle';
		var words = text.split(' '), gap = size * 0.55, widths = [], total = 0, i;
		for (i = 0; i < words.length; i += 1) {
			widths.push(Math.ceil(ctx.measureText(words[i]).width) + 2);
			total += widths[i] + (i ? gap : 0);
		}
		var pen = Math.round(left ? x : x - total / 2), h = size + 3;
		for (i = 0; i < words.length; i += 1) {
			ctx.fillStyle = '#fff';
			ctx.fillRect(pen, Math.round(y - h / 2), widths[i], h);
			ctx.fillStyle = '#000';
			ctx.fillText(words[i], pen + 1, Math.round(y) + 0.5);
			pen += widths[i] + gap;
		}
		return total;
	};

	/** Wrap text into lines that fit `width`, at `size`. */
	YouBetYourHead.prototype.lines = function (ctx, text, width, size) {
		ctx.font = 'bold ' + size + 'px Verdana, Geneva, Arial, sans-serif';
		var words = text.split(' '), out = [], line = '';
		for (var i = 0; i < words.length; i += 1) {
			var next = line ? line + ' ' + words[i] : words[i];
			if (line && ctx.measureText(next).width + next.split(' ').length * size * 0.6 > width) {
				out.push(line);
				line = words[i];
			} else {
				line = next;
			}
		}
		out.push(line);
		return out;
	};

	YouBetYourHead.prototype.screen = function (ctx) {
		var t = this.clock, i;
		if (this.phase === 'title') {
			this.say(ctx, 'You Bet Your Head', 505, 295, 13);
		} else if (this.phase === 'intro') {
			this.say(ctx, NAMES[this.turn], 505, 295, 13);
			this.say(ctx, 'Your question is...', 505, 330, 10);
		} else {
			var ql = this.lines(ctx, this.q.text, 360, 10);
			for (i = 0; i < ql.length; i += 1) { this.say(ctx, ql[i], 505, 294 + i * 13 - (ql.length > 2 ? 6 : 0), 10); }
			var reveal = this.phase === 'question' ? Math.min(3, Math.floor(t)) : 3;
			var only = (this.phase === 'show' || this.phase === 'gag') && this.showAnswers;
			for (i = 0; i < reveal; i += 1) {
				if (only && i !== this.q.right) { continue; }
				var al = this.lines(ctx, this.q.answers[i], 300, 10);
				for (var l = 0; l < al.length && l < 2; l += 1) {
					this.say(ctx, (l ? '' : (i + 1) + '> ') + al[l], 350 + (l ? 25 : 0), 357 + i * 49 + l * 13, 10, true);
				}
			}
			if (this.phase === 'verdict' && t < 2) {
				var b = BANNERS[{ right: 0, wrong: 1, time: 2 }[this.outcome]], img = this.art.bitmap('banners').image;
				ctx.drawImage(img, 0, b[0], img.width, b[1], Math.round(500 - img.width / 2), Math.round(372 - b[1] / 2), img.width, b[1]);
			}
		}
		this.say(ctx, 'Hit Caps Lock for interactive game', 505, 505, 9);
	};

	/** A score box: its frame, the three odometer wheels and their digits. */
	YouBetYourHead.prototype.box = function (ctx, i, dt) {
		var boxes = this.art.bitmap('boxes').image, digits = this.art.bitmap('digits').image;
		var x = BOX_AT[i][0], y = BOX_AT[i][1];
		ctx.drawImage(boxes, 0, 22 + 36 * i, 70, 36, x, y, 70, 36);
		ctx.drawImage(boxes, 0, 0, 52, 21, x + 9, y + 7, 52, 21);
		/* The wheels roll on to the new score. */
		var target = this.scores[i];
		if (this.shown[i] < target) { this.shown[i] = Math.min(target, this.shown[i] + dt * 2); }
		var v = this.shown[i], unit = [100, 10, 1];
		for (var d = 0; d < 3; d += 1) {
			var whole = Math.floor(v / unit[d]), part = d === 2 ? v - Math.floor(v) : 0;
			var n = whole % 10, idx = (n === 0 ? 10 : 10 - n) - part;
			var sy = 7 + 15 * idx - 5;
			ctx.save();
			ctx.beginPath();
			ctx.rect(x + 10 + d * 18, y + 8, 14, 19);
			ctx.clip();
			ctx.drawImage(digits, 0, sy, 10, 19, x + 12 + d * 18, y + 8, 10, 19);
			ctx.restore();
		}
	};

	YouBetYourHead.prototype.timerPost = function (ctx) {
		this.sprite(ctx, 1005, 0, 770, 600);
		/* The dial fills as the time goes. */
		var frac = 0;
		if (this.phase === 'question' && this.clock > 3) { frac = Math.min(1, (this.clock - 3) / this.timer); } else if (this.phase === 'verdict' && this.outcome === 'time') { frac = 1; }
		if (frac > 0) {
			ctx.fillStyle = '#d01818';
			ctx.beginPath();
			ctx.moveTo(DIAL[0], DIAL[1]);
			ctx.arc(DIAL[0], DIAL[1], DIAL[2], -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
			ctx.closePath();
			ctx.fill();
		}
		this.sprite(ctx, 1005, 1, 772, 478);
		this.sprite(ctx, 1008, Math.floor(this.time * 3) % 4, 765, 458);
	};

	YouBetYourHead.prototype.contestants = function (ctx) {
		for (var i = 0; i < this.players; i += 1) {
			var x = HEAD_X[i], frame = Math.floor(this.time * 0.7 + i * 1.3) % 9 === 0 ? 1 + Math.floor(this.time * 8) % 2 : 0;
			var me = i === this.turn;
			if (me && this.phase === 'gag') {
				var t = this.clock;
				if (t >= 1 && t < 3) { frame = -1; } else if (t >= 3) { frame = [9, 8, 7, 4, 4, 3, 0][Math.min(6, Math.floor((t - 3) * 4))]; }
			} else if (me && (this.phase === 'show' || this.phase === 'verdict') && this.outcome === 'right') {
				frame = [5, 6, 5, 0][Math.floor(this.clock * 4) % 4];
			}
			if (frame >= 0) { this.sprite(ctx, HEADS[i], frame, x, HEAD_BASE); }
			this.sprite(ctx, 1016, me && this.phase !== 'title' ? 2 + Math.floor(this.time * 3) % 2 : 0, x - 2, 630);
			this.sprite(ctx, 1017, i, x - 2, 637);
		}
	};

	/** The wooden arm and its mallet: at home, or hopping over to bring it down. */
	YouBetYourHead.prototype.arm = function (ctx) {
		var x = HOME[0], y = HOME[1], t = this.clock, hop = false, frame = 0;
		if (this.phase === 'gag' && this.turn >= 0) {
			var tx = HEAD_X[this.turn], ty = HEAD_BASE - 10;
			if (t < 1) {
				x += (tx - x) * t;
				y += (ty - y) * t - Math.sin(t * Math.PI) * 60;
				hop = true;
				frame = 1 + Math.floor(t * 14) % 7;
			} else if (t < 3) {
				/* The mallet comes down. */
				this.sprite(ctx, 1110, Math.min(7, Math.floor((t - 1) * 4)), tx, HEAD_BASE);
				return;
			}
		}
		this.sprite(ctx, 1011, frame, x, y);
		this.sprite(ctx, 1010, hop ? 1 + Math.floor(t * 6) % 3 : 0, x - 7, y - 109, 'centre');
	};

	YouBetYourHead.prototype.step = function (dt, ctx, w, h) {
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.art || !this.q) { return; }
		this.clock += dt;
		this.time = (this.time || 0) + dt;
		var t = this.clock;
		if (this.phase === 'title' && t > 4) {
			this.nextTurn();
		} else if (this.phase === 'intro' && t > 2) {
			this.go('question');
		} else if (this.phase === 'question' && t > 3) {
			var running = t - 3;
			if (!this.you && running >= this.plan.at && this.plan.at < this.timer) {
				this.answer(this.plan.knows ? this.q.right : (this.q.right + 1 + Math.floor(Math.random() * 2)) % 3);
			} else if (running >= this.timer) {
				this.outcome = 'time';
				this.go('verdict');
			}
		} else if (this.phase === 'verdict' && t > 2) {
			this.go('show');
		} else if (this.phase === 'show' && t > 1.5) {
			if (this.outcome !== 'right' && this.players) { this.go('gag'); } else { this.nextTurn(); }
		} else if (this.phase === 'gag' && t > 5) {
			this.nextTurn();
		}
		if (!this.set) { this.set = this.paintSet(); }
		var s = this.s;
		ctx.setTransform(s, 0, 0, s, Math.round((w - 1024 * s) / 2), Math.round((h - 768 * s) / 2));
		ctx.imageSmoothingEnabled = s !== 1;
		ctx.drawImage(this.set, 0, 0);
		for (var i = 0; i < 3; i += 1) { this.box(ctx, i, dt); }
		this.screen(ctx);
		if (this.players) {
			this.contestants(ctx);
			this.arm(ctx);
		}
		this.timerPost(ctx);
		ctx.setTransform(1, 0, 0, 1, 0, 0);
	};

	AfterDark.define('after-dark-you-bet-your-head', function (el) {
		var sim = new YouBetYourHead();
		sim.players = AfterDark.choice(el, 'contestants', CONTESTANTS, '3');
		sim.timer = SECONDS[AfterDark.choice(el, 'timer', TIMERS, '10 seconds')];
		sim.showAnswers = AfterDark.flag(el, 'show-answers');
		window.addEventListener('keydown', function (e) {
			if (e.getModifierState) { sim.you = e.getModifierState('CapsLock'); }
			if (sim.you && sim.phase === 'question' && sim.clock > 3 && /^[123]$/.test(e.key)) { sim.answer(Number(e.key) - 1); }
		});
		var base = AfterDark.setting(el, 'art') || 'art/ybyh';
		Promise.all([AfterDark.load(base), AfterDark.data(base)]).then(function (both) {
			sim.art = both[0];
			sim.data = both[1];
			if (sim.w) { sim.pick(); }
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkYouBetYourHead = YouBetYourHead;
}());
