/**
 * nonsense.js - Nonsense, grammatical and meaningless.
 *
 * NONSENSE.AD's own description:
 *
 *   "Nonsense generates random English sentences that are more or less
 *    grammatically correct, but usually semantically ridiculous.
 *    'How Many' determines the number of phrases that will appear.
 *    'Delay' determines how much time passes on average before new phrases
 *    appear. 'Colored Background' makes the text appear on colored
 *    backgrounds. 'Edit Names' allows you to edit the proper names used in
 *    the phrases."
 *
 * Every word it knows is in its string table, and so is most of its grammar:
 * nouns with their irregular plurals, verbs in all five forms plus a code for
 * what may follow each one (an object, a place, a that-clause, "to" and
 * another verb, an -ing, an adjective, or nothing), pronouns by person,
 * number and case, "to be", modals with their negatives, adverbs,
 * intensifiers, conjunctions and mass nouns. The proper names are
 * NONSENSE.TXT, which is where Edit Names wrote. tools/adtext.py puts the lot
 * in all/art/nonsense/; this strings it together.
 *
 *   <after-dark-nonsense art="art/nonsense" how-many="sagacious" delay="medium" colored-background>
 */
(function () {
	'use strict';

	var HOW_MANY = ['curt', 'laconic', 'sagacious', 'proverbial', 'loquacious', 'tennysonian'];
	/* Sentences on the screen at once. Laconic, the default, showed one at a
	   time; the rest are a guess. */
	var ON_SCREEN = [1, 1, 2, 4, 7, 11];
	var DELAYS = ['very short', 'short', 'medium', 'long', 'very long'];
	/* Seconds between sentences. Short, the default (22 on the slider), was a
	   steady 1.2 s; the others are scaled from that by their slider values. */
	var WAIT = [0.55, 1.2, 2.7, 3.8, 4.9];
	/* The module's own font, as Wine drew it: 24 px a line of sans serif,
	   30 px apart, centred in a column about 300 px wide. */
	var FONT = '24px Arial, Helvetica, sans-serif';
	var LINE = 30;
	var ROOM = 300;
	var PAPERS = ['#aa0000', '#00aa00', '#0000aa', '#aa00aa', '#00aaaa', '#aa5500', '#555555', '#000080'];

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	function chance(p) {
		return Math.random() < p;
	}

	/** The sentence machine, over the word lists tools/adtext.py pulled out. */
	function Grammar(words) {
		this.w = words;
	}

	Grammar.prototype.plural = function (pair) {
		if (pair[1]) { return pair[1]; }
		var s = pair[0];
		if (/(s|x|z|ch|sh)$/.test(s)) { return s + 'es'; }
		if (/[^aeiou]y$/.test(s)) { return s.slice(0, -1) + 'ies'; }
		return s + 's';
	};

	/** "a" before a vowel sound is "an". */
	Grammar.prototype.article = function (det, next) {
		return det === 'a' && /^[aeiouAEIOU]/.test(next) ? 'an' : det;
	};

	/** Some adjectives, sometimes with "very" or "excruciatingly" in front. */
	Grammar.prototype.adjectives = function () {
		var out = [], n = chance(0.5) ? (chance(0.3) ? 2 : 1) : 0;
		for (var i = 0; i < n; i += 1) {
			out.push((chance(0.2) ? pick(this.w.intensifiers) + ' ' : '') + pick(this.w.adjectives));
		}
		return out.join(', ');
	};

	/**
	 * A noun phrase, and how the verb must agree with it: person 1-3,
	 * plural or not. `object` asks for "me" rather than "I".
	 */
	Grammar.prototype.noun = function (object) {
		var w = this.w, r = Math.random();
		if (r < 0.15 && w.names.length) {
			return { text: pick(w.names), person: 3, plural: false };
		}
		if (r < 0.3) {
			/* I we / you you / he they / she they / it they, subject object possessive. */
			var k = Math.floor(Math.random() * w.pronouns.length);
			var person = k < 2 ? 1 : (k < 4 ? 2 : 3);
			return { text: w.pronouns[k][object ? 1 : 0], person: person, plural: k % 2 === 1 };
		}
		var adj = this.adjectives();
		if (r < 0.4) {
			var mass = (adj ? adj + ' ' : '') + pick(w.mass);
			return { text: chance(0.4) ? 'some ' + mass : mass, person: 3, plural: false };
		}
		var plural = chance(0.35);
		var noun = pick(w.nouns);
		var head = (adj ? adj + ' ' : '') + (plural ? this.plural(noun) : noun[0]);
		var det;
		if (chance(0.15)) {
			/* Somebody's: "my wombat", "Elvis's pretzels". */
			var owner = Math.random() < 0.5 && w.names.length ? pick(w.names) + "'s"
				: w.pronouns[Math.floor(Math.random() * w.pronouns.length)][2];
			det = owner;
		} else {
			det = pick(w.determiners)[plural ? 1 : 0];
		}
		return { text: det ? this.article(det, head) + ' ' + head : head, person: 3, plural: plural };
	};

	/** Which "to be": am / are / is. */
	Grammar.prototype.be = function (subj) {
		if (subj.person === 1 && !subj.plural) { return this.w.be[0]; }
		if (subj.person === 3 && !subj.plural) { return this.w.be[2]; }
		return this.w.be[1];
	};

	/** What follows a verb, by its code letters. */
	Grammar.prototype.complement = function (code, depth) {
		var opts = code.split('');
		var c = pick(opts);
		var w = this.w;
		if (depth > 2 && /[cig]/.test(c)) { c = 'n'; }
		switch (c) {
		case 'n': return this.noun(true).text;
		case 'p': return pick(w.prepositions) + ' ' + this.noun(true).text;
		case 'c': return 'that ' + this.clause(depth + 1);
		case 'i':
			var v = pick(w.verbs);
			return 'to ' + v[1] + this.after(v, depth + 1);
		case 'g':
			var g = pick(w.verbs);
			return g[4] + this.after(g, depth + 1);
		case 'a': return (chance(0.3) ? pick(w.intensifiers) + ' ' : '') + pick(w.adjectives);
		default: return '';
		}
	};

	Grammar.prototype.after = function (verb, depth) {
		var more = this.complement(verb[5] || ' ', depth);
		return more ? ' ' + more : '';
	};

	/** Subject and verb phrase, in one of the tenses the tables allow. */
	Grammar.prototype.clause = function (depth) {
		var w = this.w;
		var subj = this.noun(false);
		var v = pick(w.verbs);
		var third = subj.person === 3 && !subj.plural;
		var be = this.be(subj);
		var has = third ? 'has' : 'have';
		var verb, r = Math.random();
		if (r < 0.3) {
			verb = third ? v[0] : v[1];
		} else if (r < 0.55) {
			verb = v[2];
		} else if (r < 0.7) {
			verb = (chance(0.5) ? be[0] : be[2]) + ' ' + v[4];
		} else if (r < 0.82) {
			verb = has + ' ' + v[3];
		} else {
			verb = pick(pick(w.modals)) + ' ' + v[1];
		}
		var adverb = chance(0.2) ? pick(w.adverbs) + ' ' : '';
		return subj.text + ' ' + adverb + verb + this.after(v, depth || 0);
	};

	/** A yes-no question, the modal first: "Can't perforated girls ... be like them?" */
	Grammar.prototype.question = function () {
		var w = this.w;
		var subj = this.noun(false);
		var v = pick(w.verbs);
		var modal = pick(pick(w.modals));
		var verb = chance(0.3) ? 'have ' + v[3] : v[1];
		return modal + ' ' + subj.text + ' ' + verb + this.after(v, 0);
	};

	/* The captures end sentences with full stops and question marks, never "!". */
	Grammar.prototype.sentence = function () {
		var w = this.w, s, end = '.';
		if (chance(0.25)) {
			s = this.question();
			end = '?';
		} else {
			s = this.clause(0);
			if (chance(0.2)) { s += ', ' + pick(w.conjunctions) + ' ' + this.clause(1); }
			if (chance(0.1)) { s = pick(w.connectives) + ', ' + s; }
		}
		s = s.replace(/\s+/g, ' ').trim();
		return s.charAt(0).toUpperCase() + s.slice(1) + end;
	};

	function Nonsense() {
		this.count = ON_SCREEN[1];
		this.wait = WAIT[1];
		this.colored = false;
		this.grammar = null;
		this.shown = [];
		this.next = 0.3;
	}

	Nonsense.prototype.resize = function (w, h) {
		this.screen = document.createElement('canvas');
		this.screen.width = Math.max(1, Math.round(w));
		this.screen.height = Math.max(1, Math.round(h));
		var g = this.screen.getContext('2d');
		g.fillStyle = '#000';
		g.fillRect(0, 0, w, h);
		this.shown = [];
		this.next = 0.3;
	};

	function wrap(g, text, room) {
		var lines = [], line = '';
		text.split(' ').forEach(function (word) {
			var next = line ? line + ' ' + word : word;
			if (line && g.measureText(next).width > room) {
				lines.push(line);
				line = word;
			} else {
				line = next;
			}
		});
		lines.push(line);
		return lines;
	}

	/** A bright colour, any colour: the original picks them at random. */
	function ink() {
		var c = [Math.random(), Math.random(), Math.random()];
		var top = Math.max(c[0], c[1], c[2]);
		var lift = 0.7 + Math.random() * 0.3;
		return 'rgb(' + c.map(function (v) { return Math.round(v / top * lift * 255); }).join(',') + ')';
	}

	/**
	 * One sentence, centred line by line, somewhere it fits, drawn straight
	 * onto the screen. It is later rubbed out by filling the box the module
	 * worked out for it - which was measured a little wider than the text was
	 * set, so when the last line only just wrapped, the box is a line short and
	 * that last line stays behind on the screen ("phaser.", "onion.") until
	 * something else is rubbed out over it.
	 */
	Nonsense.prototype.phrase = function (w, h) {
		var g = this.screen.getContext('2d');
		g.font = FONT;
		var lines = wrap(g, this.grammar.sentence(), ROOM);
		var boxLines = wrap(g, lines.join(' '), ROOM * 1.2).length;
		var tw = Math.ceil(Math.max.apply(null, lines.map(function (l) { return g.measureText(l).width; })));
		var pad = this.colored ? 8 : 0;
		var bw = tw + pad * 2, bh = LINE * lines.length + pad * 2;
		var x = Math.round(Math.random() * Math.max(0, w - bw));
		var y = Math.round(Math.random() * Math.max(0, h - bh));
		if (this.colored) {
			g.fillStyle = PAPERS[Math.floor(Math.random() * PAPERS.length)];
			g.fillRect(x, y, bw, bh);
		}
		g.textBaseline = 'top';
		g.textAlign = 'center';
		g.fillStyle = this.colored ? '#ffffff' : ink();
		lines.forEach(function (l, i) { g.fillText(l, x + bw / 2, y + pad + i * LINE + 3); });
		g.textAlign = 'left';
		return { x: x, y: y, w: bw, h: Math.min(bh, LINE * boxLines + pad * 2) };
	};

	Nonsense.prototype.step = function (dt, ctx, w, h) {
		if (!this.screen) { this.resize(w, h); }
		if (this.grammar) {
			this.next -= dt;
			if (this.next <= 0) {
				/* Like clockwork: the oldest goes, the next one comes. */
				var g = this.screen.getContext('2d');
				while (this.shown.length >= this.count) {
					var old = this.shown.shift();
					g.fillStyle = '#000';
					g.fillRect(old.x, old.y, old.w, old.h);
				}
				this.shown.push(this.phrase(w, h));
				this.next += this.wait;
				if (this.next <= 0) { this.next = this.wait; }
			}
		}
		ctx.drawImage(this.screen, 0, 0, w, h);
	};

	AfterDark.define('after-dark-nonsense', function (el) {
		var sim = new Nonsense();
		sim.count = ON_SCREEN[AfterDark.choice(el, 'how-many', HOW_MANY, 'laconic')];
		sim.wait = WAIT[AfterDark.choice(el, 'delay', DELAYS, 'short')];
		sim.colored = AfterDark.flag(el, 'colored-background');
		AfterDark.data(AfterDark.setting(el, 'art') || 'art/nonsense').then(function (words) {
			sim.grammar = new Grammar(words);
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkNonsense = Nonsense;
	Nonsense.Grammar = Grammar;
}());
