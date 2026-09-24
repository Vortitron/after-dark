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
 *   DIR, DIR /W, DATE, TIME, VER, VOL, COPY, PROMPT $P$G    what it can do
 *   "%-9s%-4s%s %02d-%02d-%02d  %2d:%02d%c"               a DIR line
 *   Bad command or file name, Invalid directory, File not found,
 *   Invalid switch, "[unimplemented command]"
 *
 * Its controls are Color (Amber, Green, Mono, Programmer, Random), Speed
 * (Pokey, Normal, Fast, Demon) and Accuracy, a slider; the less accurate it
 * is, the more it mistypes and backspaces. Sound is left out, as everywhere
 * here.
 *
 *   <after-dark-dos-shell color="amber" speed="normal" accuracy="medium">
 */
(function () {
	'use strict';

	var COLORS = ['amber', 'green', 'mono', 'programmer', 'random'];
	/* Ink, paper, glow. Programmer is the blue of the DOS editors. */
	var SCHEMES = [['#ffb000', '#0a0600', 'rgba(255,160,0,0.6)'], ['#33ff66', '#000a02', 'rgba(40,255,90,0.55)'],
		['#c0c0c0', '#000000', 'rgba(200,200,200,0.25)'], ['#ffffff', '#0000aa', null]];
	var SPEEDS = ['pokey', 'normal', 'fast', 'demon'];
	/* Keys a second. */
	var KEYS = [4, 9, 18, 60];
	var ACCURACY = ['low', 'medium', 'high', 'perfect'];
	var TYPO = [0.08, 0.03, 0.01, 0];
	/* 80 columns, or DOS's own 40-column mode when the screen is taller than wide. */
	var WIDE = 80;
	var NARROW = 40;
	var ROWS = 25;

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

	/* Real DOS commands it knows the names of but never got round to. */
	var UNIMPLEMENTED = ['CLS', 'MEM', 'FORMAT A:', 'CHKDSK', 'EDIT AUTOEXEC.BAT', 'DEL *.*', 'TYPE CONFIG.SYS',
		'WIN', 'DOOM', 'DEFRAG', 'SCANDISK'];
	var NONSENSE = ['DRI', 'HELP', 'ARGH', 'EXIT', 'WHY', 'LOGIN', 'GIMME', 'FIX', 'COFFEE', 'QUIT', 'PLEASE'];

	function DosShell() {
		this.scheme = 0;
		this.keys = KEYS[1];
		this.typo = TYPO[1];
	}

	DosShell.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.cols = w < h ? NARROW : WIDE;
		this.cell = Math.max(4, Math.floor(Math.min(w / this.cols, h / ROWS / 2) * 100) / 100);
		if (!this.lines) { this.boot(); }
	};

	DosShell.prototype.boot = function () {
		this.lines = [''];
		this.queue = [];
		this.cwd = 'C:\\';
		this.prompt = 'C>';
		this.wait = 0;
		this.carry = 0;
		var q = this.queue;
		q.push({ wait: 0.6 });
		q.push({ out: 'Toaster-BIOS v1.3.02.P0100137 3/25/94 rev.A-A1' });
		q.push({ out: 'Copyright(c)BSI' });
		q.push({ out: '' });
		q.push({ count: 640 });
		q.push({ wait: 0.8 });
		q.push({ out: '' });
		q.push({ out: 'AfterDark DOS Shell version 2.7(Win)' });
		q.push({ out: 'Copyright(c) 1993,94 Berkeley Systems, Inc.  All rights reserved.' });
		q.push({ out: '' });
		q.push({ out: 'Welcome to AD-DOS.' });
		q.push({ out: '' });
		q.push({ wait: 0.5 });
		this.first = true;
	};

	/* ---------------------------------------------------------- the screen -- */

	DosShell.prototype.write = function (text) {
		for (var i = 0; i < text.length; i += 1) {
			var ch = text.charAt(i);
			if (ch === '\n') {
				this.lines.push('');
			} else if (ch === '\b') {
				var last = this.lines[this.lines.length - 1];
				this.lines[this.lines.length - 1] = last.slice(0, -1);
			} else {
				if (this.lines[this.lines.length - 1].length >= (this.cols || WIDE)) { this.lines.push(''); }
				this.lines[this.lines.length - 1] += ch;
			}
		}
		while (this.lines.length > ROWS) { this.lines.shift(); }
	};

	/* ------------------------------------------------------------ commands -- */

	DosShell.prototype.dir = function (wide) {
		var files = DISK[this.cwd] || [];
		var out = [' Volume in drive C has no label', ' Directory of ' + this.cwd, ''];
		var bytes = 0, count = 0;
		if (this.cwd !== 'C:\\') {
			out.push(pad('.', 9) + pad('', 4) + '<DIR>     09-30-93   6:20a');
			out.push(pad('..', 9) + pad('', 4) + '<DIR>     09-30-93   6:20a');
		}
		if (wide) {
			var row = '', per = Math.floor((this.cols || WIDE) / 16);
			files.forEach(function (f, i) {
				row += pad(f[2] === null ? '[' + f[0] + ']' : f[0] + (f[1] ? '.' + f[1] : ''), 16);
				if (i % per === per - 1) { out.push(row); row = ''; }
			});
			if (row) { out.push(row); }
		}
		files.forEach(function (f) {
			count += 1;
			if (f[2] !== null) { bytes += f[2]; }
			if (wide) { return; }
			var d = f[3].split('-');
			/* "%-9s%-4s%s %02d-%02d-%02d  %2d:%02d%c" */
			out.push(pad(f[0], 9) + pad(f[1], 4) + (f[2] === null ? '<DIR>    ' : lpad(f[2], 9)) + ' ' +
				d[0] + '-' + d[1] + '-' + d[2] + '  ' + lpad(f[4].slice(0, -1), 5) + f[4].slice(-1));
		});
		out.push(lpad(count, 9) + ' file(s) ' + lpad(bytes, 10) + ' bytes');
		out.push(lpad(Math.round(rand(8, 60)) * 32768, 28) + ' bytes free');
		return out;
	};

	/** What gets typed next, and what comes back. */
	DosShell.prototype.command = function () {
		var now = new Date(), r = Math.random(), dirs;
		if (this.first) {
			this.first = false;
			return ['PROMPT $P$G', [], function (self) { self.prompt = '$P$G'; }];
		}
		if (r < 0.25) { return ['DIR', this.dir(false)]; }
		if (r < 0.33) { return ['DIR /W', this.dir(true)]; }
		if (r < 0.36) {
			var sw = pick(['Q', 'X', 'Z']);
			return ['DIR /' + sw, ['Invalid switch - /' + sw]];
		}
		if (r < 0.52) {
			dirs = (DISK[this.cwd] || []).filter(function (f) { return f[2] === null && DISK[this.cwd + (this.cwd.slice(-1) === '\\' ? '' : '\\') + f[0]]; }, this);
			if (this.cwd !== 'C:\\' && Math.random() < 0.6) {
				return [pick(['CD ..', 'CD \\']), [], function (self) { self.cwd = 'C:\\'; }];
			}
			if (dirs.length && Math.random() < 0.8) {
				var d = pick(dirs)[0];
				var where = (this.cwd === 'C:\\' ? 'C:\\' : this.cwd + '\\') + d;
				return ['CD ' + d, [], function (self) { self.cwd = where; }];
			}
			return ['CD ' + pick(['TEMP', 'WORK', 'SECRET', 'TAXES']), ['Invalid directory']];
		}
		if (r < 0.58) {
			var day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
			return ['DATE', ['Current date is ' + day + ' ' + two(now.getMonth() + 1) + '-' + two(now.getDate()) +
				'-' + now.getFullYear()]];
		}
		if (r < 0.64) {
			var hr = now.getHours() % 12 || 12;
			return ['TIME', ['Current time is ' + lpad(hr, 2) + ':' + two(now.getMinutes()) + ':' +
				two(now.getSeconds()) + '.' + two(Math.floor(now.getMilliseconds() / 10)) +
				(now.getHours() < 12 ? 'a' : 'p')]];
		}
		if (r < 0.68) { return ['VER', ['', 'AfterDark DOS Shell version 2.7(Win)']]; }
		if (r < 0.72) { return ['VOL', [' Volume in drive C has no label']]; }
		if (r < 0.8) {
			var files = (DISK[this.cwd] || []).filter(function (f) { return f[2] !== null; });
			if (files.length && Math.random() < 0.6) {
				var f = pick(files);
				return ['COPY ' + f[0] + (f[1] ? '.' + f[1] : '') + ' A:', [lpad(1, 9) + ' file(s) copied']];
			}
			var missing = pick(['HOMEWORK.DOC', 'RESUME.TXT', 'LOVE.LTR', 'BUDGET.XLS']);
			return ['COPY ' + missing + ' A:', ['File not found - ' + missing, '        0 file(s) copied']];
		}
		if (r < 0.92) { return [pick(UNIMPLEMENTED), ['[unimplemented command]']]; }
		return [pick(NONSENSE), ['Bad command or file name']];
	};

	DosShell.prototype.promptText = function () {
		return this.prompt === '$P$G' ? this.cwd + '>' : 'C>';
	};

	/** Queue the prompt, the typing (typos and all), and the answer. */
	DosShell.prototype.plan = function () {
		var q = this.queue, cmd = this.command();
		q.push({ out: '\n' + this.promptText(), raw: true });
		q.push({ wait: rand(0.6, 2.5) });
		var text = cmd[0];
		for (var i = 0; i < text.length; i += 1) {
			if (Math.random() < this.typo && /[A-Z]/.test(text.charAt(i))) {
				var wrong = 'QWERTYUIOPASDFGHJKLZXCVBNM'.charAt(Math.floor(Math.random() * 26));
				var extra = Math.random() < 0.4 ? 2 : 1;
				for (var k = 0; k < extra; k += 1) { q.push({ key: k ? text.charAt(i + k) || 'X' : wrong }); }
				q.push({ wait: rand(0.3, 0.7) });
				for (k = 0; k < extra; k += 1) { q.push({ key: '\b' }); }
			}
			q.push({ key: text.charAt(i) });
		}
		q.push({ wait: rand(0.2, 0.6) });
		q.push({ key: '\n' });
		q.push({ wait: 0.15 });
		cmd[1].forEach(function (line) { q.push({ out: line, fast: true }); });
		if (cmd[2]) { q.push({ run: cmd[2] }); }
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
				/* Humans are uneven typists. */
				this.wait += rand(0.5, 1.5) / this.keys;
			} else if (a.count) {
				this.counting = { to: a.count, at: 0 };
				this.write(lpad(0, 4) + ' KB OK');
				this.queue.unshift({ counting: true });
			} else if (a.counting) {
				var c = this.counting;
				c.at = Math.min(c.to, c.at + 16);
				this.lines[this.lines.length - 1] = lpad(c.at, 4) + ' KB OK';
				if (c.at < c.to) { this.queue.unshift({ counting: true }); }
				this.wait += 0.025;
			} else if (a.run) {
				a.run(this);
			} else if (a.out !== undefined) {
				this.write(a.raw ? a.out : a.out + '\n');
				this.wait += a.fast ? 0.03 : 0.12;
			}
		}

		var sc = this.scheme === 4 ? (this.pickedScheme = this.pickedScheme === undefined
			? Math.floor(Math.random() * 4) : this.pickedScheme) : this.scheme;
		var ink = SCHEMES[sc][0], paper = SCHEMES[sc][1], glow = SCHEMES[sc][2];
		ctx.fillStyle = paper;
		ctx.fillRect(0, 0, w, h);
		var cw = this.cell, ch = cw * 2;
		var ox = Math.round((w - cw * this.cols) / 2), oy = Math.round((h - ch * ROWS) / 2);
		ctx.font = Math.round(ch * 0.82) + 'px "Perfect DOS VGA 437", "Lucida Console", "Courier New", monospace';
		ctx.textBaseline = 'top';
		ctx.fillStyle = ink;
		if (glow) {
			ctx.shadowColor = glow;
			ctx.shadowBlur = cw * 0.9;
		}
		for (var r = 0; r < this.lines.length; r += 1) {
			var line = this.lines[r];
			for (var i = 0; i < line.length; i += 1) {
				var chr = line.charAt(i);
				if (chr !== ' ') { ctx.fillText(chr, ox + i * cw, oy + r * ch + ch * 0.08); }
			}
		}
		/* The cursor: an underline, blinking. */
		if ((this.t * 2.2) % 1 < 0.55) {
			var cr = this.lines.length - 1;
			ctx.fillRect(ox + this.lines[cr].length * cw, oy + cr * ch + ch * 0.8, cw, Math.max(1, ch * 0.12));
		}
		ctx.shadowBlur = 0;
	};

	AfterDark.define('after-dark-dos-shell', function (el) {
		var sim = new DosShell();
		sim.scheme = AfterDark.choice(el, 'color', COLORS, 'amber');
		sim.keys = KEYS[AfterDark.choice(el, 'speed', SPEEDS, 'normal')];
		sim.typo = TYPO[AfterDark.choice(el, 'accuracy', ACCURACY, 'medium')];
		return sim;
	});

	window.AfterDarkDosShell = DosShell;
	DosShell.DISK = DISK;
}());
