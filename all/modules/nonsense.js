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
	var ON_SCREEN = [1, 2, 4, 7, 11, 16];
	var DELAYS = ['very short', 'short', 'medium', 'long', 'very long'];
	var WAIT = [0.8, 2, 4, 7, 12];
	var FACES = ['"Times New Roman", serif', 'Arial, Helvetica, sans-serif', '"Courier New", monospace',
		'Georgia, serif', '"Arial Black", sans-serif', '"Comic Sans MS", "Chalkboard SE", cursive'];
	var INKS = ['#ffffff', '#ffff55', '#55ffff', '#ff55ff', '#55ff55', '#ff5555', '#aaaaff', '#ffaa00'];
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

	Grammar.prototype.sentence = function () {
		var w = this.w;
		var s = this.clause(0);
		if (chance(0.2)) { s += ' ' + pick(w.conjunctions) + ' ' + this.clause(1); }
		if (chance(0.1)) { s = pick(w.connectives) + ', ' + s; }
		s = s.replace(/\s+/g, ' ').trim();
		return s.charAt(0).toUpperCase() + s.slice(1) + (chance(0.15) ? '!' : '.');
	};

	function Nonsense() {
		this.count = ON_SCREEN[2];
		this.wait = WAIT[2];
		this.colored = false;
		this.grammar = null;
		this.shown = [];
		this.next = 0.3;
	}

	Nonsense.prototype.resize = function (w, h) {
		this.shown = [];
		this.next = 0.3;
	};

	/** One sentence, set in a box somewhere it fits. */
	Nonsense.prototype.phrase = function (w, h) {
		var text = this.grammar.sentence();
		var size = Math.round(Math.max(14, Math.min(w, h) / 22) * (0.8 + Math.random() * 0.6));
		var font = (chance(0.3) ? 'bold ' : '') + (chance(0.2) ? 'italic ' : '') + size + 'px ' + pick(FACES);
		var c = document.createElement('canvas');
		var g = c.getContext('2d');
		g.font = font;
		var room = w * 0.55, lines = [], line = '';
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
		var pad = this.colored ? Math.round(size * 0.5) : 2;
		var lh = Math.round(size * 1.25);
		var tw = Math.ceil(Math.max.apply(null, lines.map(function (l) { return g.measureText(l).width; })));
		c.width = tw + pad * 2;
		c.height = lh * lines.length + pad * 2;
		var ink = pick(INKS);
		if (this.colored) {
			g.fillStyle = pick(PAPERS);
			g.fillRect(0, 0, c.width, c.height);
			/* On colour, only the inks that stand out on any of the papers. */
			ink = pick(['#ffffff', '#ffffff', '#ffff55']);
		}
		g.font = font;
		g.textBaseline = 'top';
		g.fillStyle = ink;
		lines.forEach(function (l, i) { g.fillText(l, pad, pad + i * lh + size * 0.1); });
		return {
			c: c,
			x: Math.random() * Math.max(0, w - c.width),
			y: Math.random() * Math.max(0, h - c.height)
		};
	};

	Nonsense.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.grammar) { return; }
		this.next -= dt;
		if (this.next <= 0) {
			this.shown.push(this.phrase(w, h));
			while (this.shown.length > this.count) { this.shown.shift(); }
			this.next = this.wait * (0.5 + Math.random());
		}
		for (var i = 0; i < this.shown.length; i += 1) {
			var p = this.shown[i];
			ctx.drawImage(p.c, Math.round(p.x), Math.round(p.y));
		}
	};

	AfterDark.define('after-dark-nonsense', function (el) {
		var sim = new Nonsense();
		sim.count = ON_SCREEN[AfterDark.choice(el, 'how-many', HOW_MANY, 'sagacious')];
		sim.wait = WAIT[AfterDark.choice(el, 'delay', DELAYS, 'medium')];
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
