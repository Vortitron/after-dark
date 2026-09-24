/**
 * messages.js - Messages, a line of text keeping your screen busy.
 *
 * MESSAGE3.AD ships no artwork. Its own description:
 *
 *   "MESSAGES lets you create and display one of up to eight different
 *    screen saving messages.
 *    'Move' chooses how the message will move around on the screen.
 *    'Speed' determines how fast the message will move.
 *    'Edit / Select' allows you to edit and select the messages, and to set
 *    their color, font, size and style."
 *
 * The eight messages it came with are in MESG_AD3.DAT beside it: 246-byte
 * records, each an italic/underline/bold flag word, a point size, a 32-byte
 * face name, a colour index into the module's own list (White, Red, Green,
 * Blue, Cyan, Magenta, Yellow), an alignment and the text. They are below as
 * they were shipped. `message` picks one by its text; anything else is taken
 * as your own message, in the first one's style.
 *
 *   <after-dark-messages message="out to lunch" move="floating" speed="medium">
 */
(function () {
	'use strict';

	var MOVES = ['popping', 'floating', 'sliding'];
	var SPEEDS = ['sluggish', 'slow', 'medium', 'moving', 'quick', 'flying', 'zoom!'];
	/* Pixels a second for floating and sliding; seconds a pop for popping. */
	var PACE = [25, 45, 80, 130, 200, 300, 450];
	var POP = [8, 6, 4, 3, 2, 1.2, 0.6];
	var COLOURS = ['#ffffff', '#ff0000', '#00ff00', '#0000ff', '#00ffff', '#ff00ff', '#ffff00'];
	/* The Windows 3.1 faces, and what a browser has that looks like them. */
	var FACES = {
		'System': '"Arial Black", "Arial", sans-serif',
		'Script': '"Brush Script MT", "Segoe Script", "Comic Sans MS", cursive',
		'Tms Rmn': '"Times New Roman", Times, serif',
		'Lucida Sans Typewriter': '"Lucida Sans Typewriter", "Lucida Console", "Courier New", monospace',
		'Roman': '"Times New Roman", Times, serif',
		'Helv': 'Helvetica, Arial, sans-serif'
	};

	/* MESG_AD3.DAT, record by record. */
	var MESSAGES = [
		{ text: 'OUT TO LUNCH', face: 'System', pt: 36, colour: 6 },
		{ text: 'Coffee Break', face: 'Script', pt: 90, colour: 4, bold: true },
		{ text: 'I Quit!', face: 'Tms Rmn', pt: 37, colour: 2 },
		{ text: 'Why are you staring\nat my computer?', face: 'Lucida Sans Typewriter', pt: 24, colour: 3,
			bold: true },
		{ text: 'Gone for the day', face: 'System', pt: 16, colour: 0 },
		{ text: ' After Dark - The Ultimate \n Screen Saver Collection ', face: 'Roman', pt: 32, colour: 1,
			bold: true, italic: true, center: true },
		{ text: 'Temporarily \nComatose ', face: 'Helv', pt: 24, colour: 5, bold: true, italic: true,
			underline: true },
		{ text: 'Equal rights for silicon intelligences! ', face: 'System', pt: 32, colour: 2, bold: true,
			italic: true }
	];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function pick(text) {
		var want = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
		if (!want) { return MESSAGES[0]; }
		for (var i = 0; i < MESSAGES.length; i += 1) {
			var have = MESSAGES[i].text.toLowerCase().replace(/\s+/g, ' ').trim();
			if (have === want || have.indexOf(want) === 0 || String(i + 1) === want) { return MESSAGES[i]; }
		}
		var own = Object.create(MESSAGES[0]);
		own.text = text;
		return own;
	}

	function Messages() {
		this.message = MESSAGES[0];
		this.move = 1;
		this.pace = PACE[2];
		this.pop = POP[2];
	}

	/** The message drawn once, tight, so moving it is just a blit. */
	Messages.prototype.render = function (w) {
		var m = this.message;
		var px = m.pt * 96 / 72;
		var lines = m.text.split('\n');
		var c = document.createElement('canvas');
		var g = c.getContext('2d');
		var font = function (size) {
			return (m.italic ? 'italic ' : '') + (m.bold || m.face === 'System' ? 'bold ' : '') +
				Math.round(size) + 'px ' + (FACES[m.face] || FACES.System);
		};
		g.font = font(px);
		var widest = Math.max.apply(null, lines.map(function (l) { return g.measureText(l).width; }));
		/* Never wider than the screen it is on. */
		if (widest > w * 0.92) {
			px *= w * 0.92 / widest;
			g.font = font(px);
			widest = w * 0.92;
		}
		var lineH = Math.ceil(px * 1.2);
		c.width = Math.ceil(widest) + 8;
		c.height = lineH * lines.length + 8;
		g.font = font(px);
		g.textBaseline = 'top';
		g.fillStyle = COLOURS[m.colour] || COLOURS[0];
		g.strokeStyle = g.fillStyle;
		lines.forEach(function (l, i) {
			var lw = g.measureText(l).width;
			var x = 4 + (m.center ? (widest - lw) / 2 : 0);
			var y = 4 + i * lineH;
			g.fillText(l, x, y);
			if (m.underline) {
				g.fillRect(x, y + px * 1.02, lw, Math.max(1, px / 14));
			}
		});
		return c;
	};

	Messages.prototype.resize = function (w, h) {
		this.sprite = this.render(w);
		this.place(w, h);
		var a = rand(0.3, 1.2) + Math.floor(rand(0, 4)) * Math.PI / 2;
		this.vx = Math.cos(a) * this.pace;
		this.vy = Math.sin(a) * this.pace;
		if (this.move === 2) {
			this.x = w;
		}
		this.timer = this.pop;
	};

	Messages.prototype.place = function (w, h) {
		this.x = rand(0, Math.max(0, w - this.sprite.width));
		this.y = rand(0, Math.max(0, h - this.sprite.height));
	};

	Messages.prototype.step = function (dt, ctx, w, h) {
		var s = this.sprite;
		if (this.move === 0) {
			/* Popping: up somewhere, then gone and up somewhere else. */
			this.timer -= dt;
			if (this.timer <= 0) {
				this.place(w, h);
				this.timer = this.pop;
			}
		} else if (this.move === 1) {
			this.x += this.vx * dt;
			this.y += this.vy * dt;
			if (this.x < 0) { this.x = 0; this.vx = Math.abs(this.vx); }
			if (this.y < 0) { this.y = 0; this.vy = Math.abs(this.vy); }
			if (this.x + s.width > w) { this.x = Math.max(0, w - s.width); this.vx = -Math.abs(this.vx); }
			if (this.y + s.height > h) { this.y = Math.max(0, h - s.height); this.vy = -Math.abs(this.vy); }
		} else {
			/* Sliding: in from the right, out at the left, at a new height. */
			this.x -= this.pace * dt;
			if (this.x + s.width < 0) {
				this.x = w;
				this.y = rand(0, Math.max(0, h - s.height));
			}
		}
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		ctx.drawImage(s, Math.round(this.x), Math.round(this.y));
	};

	AfterDark.define('after-dark-messages', function (el) {
		var sim = new Messages();
		sim.message = pick(AfterDark.setting(el, 'message'));
		sim.move = AfterDark.choice(el, 'move', MOVES, 'floating');
		var speed = AfterDark.choice(el, 'speed', SPEEDS, 'medium');
		sim.pace = PACE[speed];
		sim.pop = POP[speed];
		return sim;
	});

	window.AfterDarkMessages = Messages;
	Messages.MESSAGES = MESSAGES;
	Messages.pick = pick;
}());
