/**
 * dosshell.js - DOS Shell, a PC typing to itself at the C:\> prompt.
 *
 * DOSSHELL.AD's own description:
 *
 *   "DOS SHELL - Relive the good ol' days of computing. Who needs a graphical
 *    interface anyways? 'Color' selects the color of the screen text.
 *    'Speed' determines how fast commands are typed.
 *    Original concept by Ed Hall."
 *
 * It ships no pictures, just five sounds (a boot beep, a disk click, key and
 * return clicks, and an "oops" voice for its typos) - and all its lines are
 * in its data segment, which is where everything below comes from:
 *
 *   Toaster-BIOS v1.3.02.P0100137 3/25/94 rev.A-A1        the power-on banner
 *   " %3d KB OK"                                           the memory count
 *   AfterDark DOS Shell version 2.7(Win), Welcome to AD-DOS.
 *   DIR, DIR /W, DATE, TIME, VER, VOL, CD, COPY, PROMPT $P$G  what it types
 *   "%-9s%-4s%s %02d-%02d-%02d  %2d:%02d%c"               a DIR line
 *   "%9d file(s) %10ld bytes", "%28ld bytes free"
 *   COPY ????????.??? NUL:, File not found - , Bad command or file name
 *
 * Checked against the real module running under Wine (24-bit and 8-bit
 * captures, 25-75 s, default settings and others):
 *   - It writes straight onto a black screen in the OEM fixed font, top left,
 *     12 px a line, as many lines as the screen holds (64 at 1024x768), and
 *     scrolls a line at a time at the bottom. No 80x25 box, no glow. Wine
 *     drew it 7 px a character; Windows 3.1's Terminal font was 8.
 *   - Boot: the KB count on the top line, a blank line, the BIOS banner, two
 *     blank lines, the AD-DOS banner, two more, the welcome, then the prompt.
 *     The prompt is C:\> ($P$G) from the start; typing PROMPT $P$G changes
 *     nothing visible.
 *   - Every answer is followed by a blank line before the next prompt.
 *   - The cursor is a block (OEM character 219; Wine's font shows it as U
 *     with an umlaut) blinking 0.3 s on, 0.3 s off. It waits 1-6 s at the
 *     prompt, then types 2.6-5 keys a second at the default speed.
 *   - DIR reads the real disk: "Volume in drive C has no label." and
 *     "Directory of C:\X" (no leading spaces), . and .. counted as files,
 *     DIR /W puts [names] 16 columns apart across the whole screen width.
 *     The disk below stands in for the one it would have listed in 1994.
 *   - COPY copies a file from the current directory to NUL:; with none to
 *     pick it types ????????.??? and gets "File not found".
 *   - A typo is not rubbed out: it is entered, and the answer is "Bad
 *     command or file name" (DATE came out as DRTE).
 *   - Now and then the screen is cleared and it carries on at the top, once
 *     having moved into another directory in between.
 *   - Colours: Amber is RGB(128,128,0), Green (the default) 0,128,0, Mono
 *     128,128,128, all on black; Programmer is white on 0,0,128.
 * The control panel is Color (Amber, Green, Mono, Programmer, Random; default
 * Green), Speed (a slider: Pokey, Normal, Fast, Demon; default 75, Fast) and
 * Accuracy (a slider from 50 to 100; default 94), plus a "User-Unfriendly"
 * box whose effect did not show in the captures. Sound is left out, as
 * everywhere here.
 *
 *   <after-dark-dos-shell color="green" speed="fast" accuracy="high">
 */
(function () {
	'use strict';

	var COLORS = ['amber', 'green', 'mono', 'programmer', 'random'];
	/* Ink and paper, as measured off the captures: the dark half of the VGA
	   palette for the first three, white on navy for Programmer. */
	var SCHEMES = [['#808000', '#000000'], ['#008000', '#000000'], ['#808080', '#000000'], ['#ffffff', '#000080']];
	var SPEEDS = ['pokey', 'normal', 'fast', 'demon'];
	/* Keys a second. Fast, the default, typed 2.6-5 a second in the captures;
	   the others are scaled from it (Wine's timing made Demon no faster). */
	var KEYS = [1.2, 2.5, 3.5, 8];
	var ACCURACY = ['low', 'medium', 'high', 'perfect'];
	/* The slider is 50-100 (default 94): the chance a command goes in mistyped. */
	var TYPO = [0.5, 0.25, 0.06, 0];
	/* The OEM fixed font's cell, and the left margin, in pixels. */
	var CELL_W = 7;
	var CELL_H = 12;
	var LEFT = 5;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	function pad(s, n) {
		s = String(s);
		while (s.length < n) { s += ' '; }
		return s.slice(0, n);
	}

	function lpad(s, n) {
		s = String(s);
		while (s.length < n) { s = ' ' + s; }
		return s;
	}

	function two(n) {
		return (n < 10 ? '0' : '') + n;
	}

	/* A disk as it might have been in 1994. [name, ext, size or null for a directory, date, time]. */
	var DISK = {
		'C:\\': [['DOS', '', null, '09-30-93', '6:20a'], ['WINDOWS', '', null, '09-30-93', '6:24a'],
			['AFTERDRK', '', null, '03-25-94', '10:02a'], ['GAMES', '', null, '11-12-93', '8:41p'],
			['UTIL', '', null, '10-02-93', '9:15a'], ['COMMAND', 'COM', 54619, '09-30-93', '6:20a'],
			['AUTOEXEC', 'BAT', 212, '03-25-94', '10:05a'], ['CONFIG', 'SYS', 157, '03-25-94', '10:05a'],
			['WINA20', '386', 9349, '09-30-93', '6:20a'], ['TOAST', 'TXT', 1994, '04-01-94', '4:01p']],
		'C:\\DOS': [['EDIT', 'COM', 413, '09-30-93', '6:20a'], ['QBASIC', 'EXE', 194309, '09-30-93', '6:20a'],
			['MEM', 'EXE', 32502, '09-30-93', '6:20a'], ['FORMAT', 'COM', 22916, '09-30-93', '6:20a'],
			['CHKDSK', 'EXE', 12241, '09-30-93', '6:20a'], ['DOSSHELL', 'EXE', 235484, '09-30-93', '6:20a']],
		'C:\\WINDOWS': [['WIN', 'COM', 44170, '11-01-93', '3:11a'], ['WIN', 'INI', 8872, '03-25-94', '10:06a'],
			['SYSTEM', 'INI', 3310, '03-25-94', '10:06a'], ['SOL', 'EXE', 180688, '11-01-93', '3:11a'],
			['WINMINE', 'EXE', 27776, '11-01-93', '3:11a'], ['SYSTEM', '', null, '11-01-93', '3:11a']],
		'C:\\AFTERDRK': [['AFTERDRK', 'EXE', 47104, '03-25-94', '10:02a'], ['TOAST3', 'AD', 124672, '03-25-94', '10:02a'],
			['MARBLES2', 'AD', 41488, '03-25-94', '10:02a'], ['DOSSHELL', 'AD', 30208, '03-25-94', '10:02a'],
			['WARP', 'AD', 9728, '03-25-94', '10:02a']],
		'C:\\GAMES': [['DOOM', 'EXE', 580391, '12-10-93', '11:59p'], ['KEEN4', 'EXE', 263119, '12-15-91', '1:00p'],
			['PRINCE', 'EXE', 103904, '10-03-90', '2:22p']],
		'C:\\UTIL': [['PKZIP', 'EXE', 42166, '02-01-93', '2:04a'], ['LIST', 'COM', 12863, '06-02-91', '9:51p']]
	};


	/* What it types, picked evenly; CD goes down, back up, or just says where it is. */
	var COMMANDS = ['DIR', 'DIR /W', 'VOL', 'COPY', 'CD', 'TIME', 'DATE', 'PROMPT $P$G', 'VER'];

	function DosShell() {
		this.scheme = 1;
		this.keys = KEYS[2];
		this.typo = TYPO[2];
	}

	DosShell.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.cols = Math.max(20, Math.floor((w - LEFT) / CELL_W));
		this.rows = Math.max(5, Math.floor(h / CELL_H));
		if (!this.lines) { this.boot(); }
		while (this.lines.length > this.rows) { this.lines.shift(); }
	};

	DosShell.prototype.boot = function () {
		this.lines = [''];
		this.queue = [];
		this.cwd = 'C:\\';
		this.wait = 0;
		var q = this.queue;
		q.push({ count: 640 });
		q.push({ wait: 0.1 });
		['', '', 'Toaster-BIOS v1.3.02.P0100137 3/25/94 rev.A-A1', 'Copyright(c)BSI', '', '',
			'AfterDark DOS Shell version 2.7(Win)', 'Copyright(c) 1993,94 Berkeley Systems, Inc.  All rights reserved.',
			'', '', 'Welcome to AD-DOS.', ''].forEach(function (line, i) {
			q.push({ out: (i ? '\n' : '') + line, raw: true, fast: true });
		});
		q.push({ out: '\n', raw: true }, { prompt: true });
	};

	/* ---------------------------------------------------------- the screen -- */

	DosShell.prototype.write = function (text) {
		for (var i = 0; i < text.length; i += 1) {
			var ch = text.charAt(i);
			if (ch === '\n') {
				this.lines.push('');
			} else {
				if (this.lines[this.lines.length - 1].length >= this.cols) { this.lines.push(''); }
				this.lines[this.lines.length - 1] += ch;
			}
		}
		/* Off the bottom: everything goes up a line. */
		while (this.lines.length > (this.rows || 64)) { this.lines.shift(); }
	};

	/* ------------------------------------------------------------ commands -- */

	DosShell.prototype.here = function () {
		return DISK[this.cwd] || [];
	};

	DosShell.prototype.subdirs = function () {
		var cwd = this.cwd;
		return this.here().filter(function (f) {
			return f[2] === null && DISK[cwd + (cwd.slice(-1) === '\\' ? '' : '\\') + f[0]];
		});
	};

	DosShell.prototype.dir = function (wide) {
		var files = this.here().slice();
		var out = ['Volume in drive C has no label.', 'Directory of ' + this.cwd, ''];
		var bytes = 0;
		if (this.cwd !== 'C:\\') {
			files.unshift(['.', '', null, '09-30-93', '6:20a'], ['..', '', null, '09-30-93', '6:20a']);
		}
		if (wide) {
			var row = '', per = Math.max(1, Math.floor(this.cols / 16));
			files.forEach(function (f, i) {
				row += pad(f[2] === null ? '[' + f[0] + ']' : f[0] + (f[1] ? '.' + f[1] : ''), 16);
				if (i % per === per - 1) { out.push(row.replace(/\s+$/, '')); row = ''; }
			});
			if (row) { out.push(row.replace(/\s+$/, '')); }
		}
		files.forEach(function (f) {
			if (f[2] !== null) { bytes += f[2]; }
			if (wide) { return; }
			var d = f[3].split('-');
			/* "%-9s%-4s%s %02d-%02d-%02d  %2d:%02d%c" */
			out.push(pad(f[0], 9) + pad(f[1], 4) + (f[2] === null ? '<DIR>    ' : lpad(f[2], 9)) + ' ' +
				d[0] + '-' + d[1] + '-' + d[2] + '  ' + lpad(f[4].slice(0, -1), 5) + f[4].slice(-1));
		});
		out.push(lpad(files.length, 9) + ' file(s) ' + lpad(bytes, 10) + ' bytes');
		out.push(lpad(Math.round(rand(8, 60)) * 32768, 28) + ' bytes free');
		return out;
	};

	/** What gets typed next, what comes back, and what it changes. */
	DosShell.prototype.command = function () {
		var now = new Date(), what = pick(COMMANDS), self = this;
		if (what === 'DIR') { return ['DIR', this.dir(false)]; }
		if (what === 'DIR /W') { return ['DIR /W', this.dir(true)]; }
		if (what === 'VOL') { return ['VOL', ['Volume in drive C has no label.']]; }
		if (what === 'VER') { return ['VER', ['AfterDark DOS Shell version 2.7(Win)']]; }
		if (what === 'PROMPT $P$G') { return ['PROMPT $P$G', []]; }
		if (what === 'DATE') {
			var day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
			/* "%s %02d-%02d-%4d" */
			return ['DATE', ['Current date is ' + day + ' ' + two(now.getMonth() + 1) + '-' + two(now.getDate()) +
				'-' + now.getFullYear()]];
		}
		if (what === 'TIME') {
			/* "%2d:%02d:%02d.%02d%c" */
			var hr = now.getHours() % 12 || 12;
			return ['TIME', ['Current time is ' + lpad(hr, 2) + ':' + two(now.getMinutes()) + ':' +
				two(now.getSeconds()) + '.' + two(Math.floor(now.getMilliseconds() / 10)) +
				(now.getHours() < 12 ? 'a' : 'p')]];
		}
		if (what === 'COPY') {
			var files = this.here().filter(function (f) { return f[2] !== null; });
			if (!files.length) {
				return ['COPY ????????.??? NUL:', ['File not found - ????????.???', '        0 file(s) copied']];
			}
			var f = pick(files);
			return ['COPY ' + f[0] + (f[1] ? '.' + f[1] : '') + ' NUL:', [lpad(1, 9) + ' file(s) copied']];
		}
		/* CD */
		var dirs = this.subdirs(), r = Math.random();
		if (this.cwd !== 'C:\\' && r < 0.4) {
			return ['CD ..', [], function () { self.cwd = 'C:\\'; }];
		}
		if (dirs.length && r < 0.8) {
			var d = pick(dirs)[0];
			var where = (this.cwd === 'C:\\' ? 'C:\\' : this.cwd + '\\') + d;
			return ['CD ' + d, [], function () { self.cwd = where; }];
		}
		return ['CD', [this.cwd]];
	};

	/** Queue the typing and the answer, then the blank line and the next prompt. */
	DosShell.prototype.plan = function () {
		var q = this.queue, cmd = this.command();
		var text = cmd[0], out = cmd[1], after = cmd[2];
		/* A slip of the finger goes in as typed. */
		if (Math.random() < this.typo) {
			var word = text.split(' ')[0];
			var at = Math.floor(Math.random() * word.length);
			var wrong = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.charAt(Math.floor(Math.random() * 26));
			if (wrong !== word.charAt(at)) {
				text = text.slice(0, at) + wrong + text.slice(at + 1);
				out = ['Bad command or file name'];
				after = null;
			}
		}
		q.push({ wait: rand(1, 5) });
		for (var i = 0; i < text.length; i += 1) { q.push({ key: text.charAt(i) }); }
		q.push({ wait: rand(0.2, 0.5) });
		q.push({ out: '\n', raw: true });
		out.forEach(function (line) { q.push({ out: line, fast: true }); });
		if (after) { q.push({ run: after }); }
		q.push({ out: '\n', raw: true, fast: true });
		/* Now and then a clean screen. */
		if (Math.random() < 0.08) { q.push({ wait: rand(0.5, 2) }, { run: function (self) { self.clear(); } }); }
		q.push({ prompt: true });
	};

	DosShell.prototype.clear = function () {
		this.lines = [''];
		var dirs = DISK['C:\\'].filter(function (f) { return f[2] === null && DISK['C:\\' + f[0]]; });
		if (Math.random() < 0.3 && dirs.length) { this.cwd = 'C:\\' + pick(dirs)[0]; }
	};

	DosShell.prototype.step = function (dt, ctx, w, h) {
		this.t = (this.t || 0) + dt;
		this.wait -= dt;
		var guard = 0;
		while (this.wait <= 0 && guard < 200) {
			guard += 1;
			if (!this.queue.length) { this.plan(); }
			var a = this.queue.shift();
			if (a.wait) {
				this.wait += a.wait;
			} else if (a.key !== undefined) {
				this.write(a.key);
				this.blink = this.t;
				/* Humans are uneven typists. */
				this.wait += rand(0.5, 1.5) / this.keys;
			} else if (a.count) {
				this.counting = { to: a.count, at: 0 };
				this.queue.unshift({ counting: true });
			} else if (a.counting) {
				var c = this.counting;
				c.at = Math.min(c.to, c.at + 64);
				this.lines[this.lines.length - 1] = ' ' + lpad(c.at, 3) + ' KB OK';
				if (c.at < c.to) { this.queue.unshift({ counting: true }); }
				this.wait += 0.06;
			} else if (a.run) {
				a.run(this);
			} else if (a.prompt) {
				this.write(this.cwd + '>');
			} else if (a.out !== undefined) {
				this.write(a.raw ? a.out : a.out + '\n');
				this.wait += a.fast ? 0.02 : 0.1;
			}
		}

		var sc = this.scheme === 4 ? (this.pickedScheme = this.pickedScheme === undefined
			? Math.floor(Math.random() * 4) : this.pickedScheme) : this.scheme;
		var ink = SCHEMES[sc][0], paper = SCHEMES[sc][1];
		ctx.fillStyle = paper;
		ctx.fillRect(0, 0, w, h);
		ctx.font = '12px "Courier New", Courier, monospace';
		ctx.textBaseline = 'top';
		ctx.fillStyle = ink;
		for (var r = 0; r < this.lines.length; r += 1) {
			var line = this.lines[r];
			for (var i = 0; i < line.length; i += 1) {
				var chr = line.charAt(i);
				if (chr !== ' ') { ctx.fillText(chr, LEFT + i * CELL_W, r * CELL_H + 3); }
			}
		}
		/* The cursor: a block, 0.3 s on and 0.3 s off. */
		if (((this.t - (this.blink || 0)) / 0.3) % 2 < 1) {
			var cr = this.lines.length - 1;
			ctx.fillRect(LEFT + this.lines[cr].length * CELL_W, cr * CELL_H + 2, CELL_W, CELL_H - 1);
		}
	};

	AfterDark.define('after-dark-dos-shell', function (el) {
		var sim = new DosShell();
		sim.scheme = AfterDark.choice(el, 'color', COLORS, 'green');
		sim.keys = KEYS[AfterDark.choice(el, 'speed', SPEEDS, 'fast')];
		sim.typo = TYPO[AfterDark.choice(el, 'accuracy', ACCURACY, 'high')];
		return sim;
	});

	window.AfterDarkDosShell = DosShell;
	DosShell.DISK = DISK;
}());
