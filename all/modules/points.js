/**
 * points.js - Points of View, After Dark 4.0's clouds of dots.
 *
 * POINTS.AD's own description:
 *
 *   "They say that matter is made up of empty space and points of light.
 *    What does that say about our points of view?"
 *   "New Shapes" determines how often the shapes change.
 *   "Color" chooses the color of the dots. Check "Bigger Dots" for BIG dots.
 *   Macintosh Programming by Arnold Kim. PC Programming by Brock Wagenaar.
 *   Art by Joe Kauffman and Jarir Maani.
 *
 * Controls: New Shapes (10 Seconds, 30 Seconds, 1 Minute, 5 Minutes,
 * 10 Minutes), Color (White, Yellow, Green, Blue, Random), Bigger Dots, and
 * Music Choice (not used - the site is silent).
 *
 * The shapes are the module's TYPE_4000 resources: 603 points (x, y, z) each,
 * 47 of them, in all/art/points/index.json. Ids of 10000 and up are chains
 * (a wave, a cube unfolding...) that morph round and round while they last.
 *
 * Under Wine the module paints nothing, so there is no capture; everything
 * here was read out of its code rather than watched:
 *
 *  - It runs at most every 33 ms; all speeds are per frame.
 *  - The shapes play in a shuffled order. Each one stays for the New Shapes
 *    time, counted from the end of the transition that brought it in.
 *  - Three angles, 1024 to the turn, each with a speed that steps by one
 *    towards a target re-rolled every two seconds to 0-19.
 *  - Perspective: depth D = 212 + z, screen = centre + 512 * (x, y) / D.
 *    Nearer dots are brighter: brightness 128 - 2z. "Blue" is cyan, as the
 *    code has it (green and blue channels).
 *  - The centre wanders, speed nudged by -1, 0 or +1 each frame and steered
 *    back inside 200 pixels of the edges.
 *  - Transitions, picked at random (the first is always the elastic one):
 *    bounce (the dots drop to a floor and hop to their new places), fly
 *    through the viewer, flatten and walk, split and close, zoom away and
 *    back, drop out and rain in, shimmer and morph, and elastic. Those are
 *    the eight the Windows build can reach; its random numbers come from a
 *    Mac Random() that went negative too, so seven more are dead code.
 *  - It opens with "Points of View:" and one of its four quips at the top
 *    left for three seconds. Caps Lock brings on the next shape at once.
 *
 * Filled in: on a screen smaller than about 600 pixels the whole picture is
 * scaled down, where the original keeps its fixed scale. The shuffle is a
 * plain one; the original's leans towards the later half of its list.
 *
 *   <after-dark-points-of-view art="art/points" new-shapes="10 seconds" color="white">
 */
(function () {
	'use strict';

	var NEW_SHAPES = ['10 seconds', '30 seconds', '1 minute', '5 minutes', '10 minutes'];
	var INTERVAL = [10000, 30000, 60000, 300000, 600000];
	var COLORS = ['white', 'yellow', 'green', 'blue', 'random'];
	var MASK = [[1, 1, 1], [1, 1, 0], [0, 1, 0], [0, 1, 1]];
	var N = 603;
	var FRAME = 33;
	var REST = -300;

	var SIN = [];
	for (var i = 0; i <= 1024; i += 1) { SIN.push(Math.trunc(256 * Math.sin(2 * Math.PI * i / 1024)) / 256); }
	function sin(k) { return SIN[((k % 1024) + 1024) % 1024]; }
	function cos(k) { return SIN[(((256 - k) % 1024) + 1024) % 1024]; }

	function rand(n) { return Math.floor(Math.random() * n); }
	function sign(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
	function toward(v, t, step) {
		if (Math.abs(t - v) <= step) { return t; }
		return v + (t > v ? step : -step);
	}

	function decode(b64) {
		var s = atob(b64);
		var out = new Float32Array(s.length);
		for (var k = 0; k < s.length; k += 1) {
			var c = s.charCodeAt(k);
			out[k] = c > 127 ? c - 256 : c;
		}
		return out;
	}

	function Points() {
		this.data = null;
		this.interval = INTERVAL[0];
		this.colour = 0;
		this.random = false;
		this.big = false;
		this.clock = 0;
		this.acc = 0;
	}

	Points.prototype.setData = function (data) {
		this.data = data;
		var shapes = data.shapes.map(function (s) { return { id: s.id, p: decode(s.points) }; });
		/* Entries: single shapes, and chains (a head and its members). */
		var entries = [], byHead = {};
		shapes.forEach(function (s) {
			if (s.id < 10000) { entries.push([s]); return; }
			var head = Math.floor(s.id / 10) * 10;
			if (!byHead[head]) { byHead[head] = []; entries.push(byHead[head]); }
			byHead[head].push(s);
		});
		this.entries = entries;
		this.order = [];
		this.next = 0;
		this.P = new Float32Array(N * 3);
		this.T = new Float32Array(N * 3);
		this.shown = new Uint8Array(N);
		this.a = [0, 0, 0];
		this.speed = [0, 0, 0];
		this.target = [rand(20), rand(20), rand(20)];
		this.reroll = 2000;
		this.off = REST;
		this.offV = 0;
		this.first = true;
		this.entry = this.pick();
		this.P.set(this.entry[0].p);
		this.shown.fill(1);
		this.link = 0;
		this.title = this.clock + 3000;
		this.quip = data.quips[rand(data.quips.length)];
		this.T0 = this.clock;
		this.mode = 'show';
		this.chainStep = 0;
		this.recolour = this.clock + 10000;
		if (this.random) { this.colour = rand(4); }
	};

	Points.prototype.pick = function () {
		if (this.next >= this.order.length) {
			this.order = this.entries.slice();
			for (var k = this.order.length - 1; k > 0; k -= 1) {
				var j = rand(k + 1), t = this.order[k];
				this.order[k] = this.order[j];
				this.order[j] = t;
			}
			this.next = 0;
		}
		return this.order[this.next++];
	};

	Points.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.k = Math.min(1, Math.min(w, h) / 600);
		this.cx = w / 2;
		this.cy = h / 2;
		this.vx = 5;
		this.vy = 5;
	};

	/* --------------------------------------------------- rotation, drift */

	Points.prototype.spin = function () {
		if (this.clock > this.reroll) {
			this.reroll = this.clock + 2000;
			this.target = [rand(20), rand(20), rand(20)];
		}
		var aligning = this.mode === 'align' || this.type === 7 && this.mode === 'trans';
		for (var k = 0; k < 3; k += 1) {
			var t = this.target[k];
			if (aligning) {
				if (k === 1) { t = -5; } else if (this.a[k] === 0 && this.speed[k] === 0) { continue; } else { t = -5; }
			}
			this.speed[k] += sign(t - this.speed[k]);
			this.a[k] += this.speed[k];
			if (this.a[k] > 1024) { this.a[k] -= 1024; }
			if (this.a[k] < 0) { this.a[k] += 1024; }
			if (aligning && k !== 1 && (this.a[k] < 5 || this.a[k] > 1019)) {
				this.a[k] = 0;
				this.speed[k] = 0;
			}
		}
		if (aligning) { return; }
		var k2 = this.k;
		this.cx += this.vx * k2;
		this.cy += this.vy * k2;
		this.vx += rand(3) - 1;
		this.vy += rand(3) - 1;
		if (this.vx > 10) { this.vx = 5; } else if (this.vx < -10) { this.vx = -5; }
		if (this.vy > 10) { this.vy = 5; } else if (this.vy < -10) { this.vy = -5; }
		var m = 200 * k2;
		if (this.w > 400 * k2) {
			if (this.cx > this.w - m) { this.vx -= 1; }
			if (this.cx < m) { this.vx += 1; }
		}
		if (this.h > 400 * k2) {
			if (this.cy > this.h - m) { this.vy -= 1; }
			if (this.cy < m) { this.vy += 1; }
		}
	};

	/* ------------------------------------------------------ transitions */

	Points.prototype.begin = function () {
		var type;
		if (this.first) {
			type = 14;
			this.first = false;
		} else {
			var r = rand(15);
			type = r === 0 ? 7 : 8 + Math.floor((r - 1) / 2);
		}
		this.entry = this.pick();
		this.T.set(this.entry[0].p);
		this.link = 0;
		this.type = type;
		this.n = 0;
		this.phase = 0;
		var P = this.P, T = this.T, k;
		this.V = new Float32Array(N * 3);
		this.S = new Float32Array(N * 3);
		this.F = new Float32Array(N);
		this.done = new Uint8Array(N);
		if (type === 7) {
			this.S.set(P);
			this.mode = 'align';
			return;
		}
		this.mode = 'trans';
		if (type === 13 || type === 14) {
			this.S.set(P);
			for (k = 0; k < N * 3; k += 1) {
				this.V[k] = type === 13 ? rand(2) : (T[k] >= P[k] ? 1 : -1);
			}
		}
		if (type === 8 || type === 11) { this.offV = 0; }
	};

	Points.prototype.finish = function () {
		this.P.set(this.T);
		this.shown.fill(1);
		this.off = REST;
		this.mode = 'show';
		this.T0 = this.clock;
		this.chainStep = 0;
	};

	Points.prototype.trans = function () {
		var P = this.P, T = this.T, V = this.V, shown = this.shown;
		var i, k, all, n = this.n;
		this.n += 1;
		switch (this.type) {
		case 7: /* bounce: fall to the floor, then hop to the new place */
			all = true;
			for (i = 0; i < N; i += 1) {
				var x = i * 3;
				if (this.done[i]) { continue; }
				all = false;
				if (!this.F[i]) {
					var t = this.V[x];
					P[x + 1] = this.S[x + 1] - Math.floor(t * t / 2);
					this.V[x] = t + 1;
					if (P[x + 1] <= -100) {
						P[x + 1] = -100;
						var tf = Math.floor(Math.sqrt(2 * (this.S[x + 1] + 100)));
						this.F[i] = Math.max(1, tf);
						this.S[x] = P[x];
						this.S[x + 2] = P[x + 2];
						this.V[x] = 0;
						this.V[x + 1] = 1;
					}
				} else {
					var Tf = this.F[i], s = this.V[x] + 1;
					this.V[x] = s;
					var H = T[x + 1] + 100, v0 = H / Tf + Tf / 2;
					P[x] = this.S[x] + (T[x] - this.S[x]) * Math.min(1, s / Tf);
					P[x + 2] = this.S[x + 2] + (T[x + 2] - this.S[x + 2]) * Math.min(1, s / Tf);
					P[x + 1] = -100 + v0 * s - s * s / 2;
					if (s >= Tf) {
						P[x] = T[x]; P[x + 1] = T[x + 1]; P[x + 2] = T[x + 2];
						this.done[i] = 1;
					}
				}
			}
			if (all) { this.finish(); }
			break;
		case 8: /* fly through the viewer and out the back, then back in */
		case 11: /* zoom away and back */
			if (this.phase === 0) {
				this.offV += this.type === 8 ? -2 : 4;
				this.off += this.offV;
				if (this.type === 8 ? this.off <= -600 : this.off >= 400) {
					P.set(T);
					this.offV = 0;
					this.phase = 1;
				}
			} else {
				this.offV += this.type === 8 ? 1 : -1;
				this.off += this.offV;
				if (this.type === 8 ? this.off >= REST : this.off <= REST) { this.finish(); }
			}
			break;
		case 9: /* flatten, then walk each axis home */
			all = true;
			for (k = 0; k < N * 3; k += 1) {
				if (this.phase === 0) {
					if (k % 3 === 2) { P[k] = toward(P[k], -50, 3); if (P[k] !== -50) { all = false; } }
				} else {
					P[k] = toward(P[k], T[k], 4);
					if (P[k] !== T[k]) { all = false; }
				}
			}
			if (all) { if (this.phase === 0) { this.phase = 1; } else { this.finish(); } }
			break;
		case 10: /* split sideways, close in vertically */
			all = true;
			for (i = 0; i < N; i += 1) {
				x = i * 3;
				if (this.phase === 0) {
					if (!shown[i]) { continue; }
					P[x] += P[x] >= 0 ? 5 : -5;
					if (Math.abs(P[x]) > 100) { shown[i] = 0; } else { all = false; }
				} else {
					P[x + 1] = toward(P[x + 1], T[x + 1], 5);
					if (P[x + 1] !== T[x + 1]) { all = false; }
				}
			}
			if (all) {
				if (this.phase === 0) {
					for (i = 0; i < N; i += 1) {
						x = i * 3;
						P[x] = T[x]; P[x + 2] = T[x + 2];
						P[x + 1] = T[x + 1] + (T[x + 1] > 0 ? 100 : -100);
					}
					shown.fill(1);
					this.phase = 1;
				} else { this.finish(); }
			}
			break;
		case 12: /* the bottom drops out, then it rains back in from the bottom up */
			var c = (n - (this.phase ? this.phaseAt : 0)) * 5;
			all = true;
			for (i = 0; i < N; i += 1) {
				x = i * 3;
				if (this.phase === 0) {
					if (!shown[i]) { continue; }
					all = false;
					if (this.done[i] || P[x + 1] < c - 100) {
						this.done[i] = 1;
						P[x + 1] -= V[x + 1];
						V[x + 1] += 2;
						if (P[x + 1] <= -100) { shown[i] = 0; }
					}
				} else {
					if (this.done[i] === 2) { continue; }
					all = false;
					if (!this.done[i]) {
						if (T[x + 1] < c - 100) {
							this.done[i] = 1;
							shown[i] = 1;
							P[x] = T[x]; P[x + 2] = T[x + 2]; P[x + 1] = 100;
							V[x + 1] = 0;
						}
						continue;
					}
					P[x + 1] -= V[x + 1];
					V[x + 1] += 1;
					if (P[x + 1] <= T[x + 1]) { P[x + 1] = T[x + 1]; this.done[i] = 2; }
				}
			}
			if (all) {
				if (this.phase === 0) {
					this.phase = 1;
					this.phaseAt = this.n;
					this.done.fill(0);
					V.fill(0);
				} else { this.finish(); }
			}
			break;
		case 13: /* shimmer, smear, then morph */
			if (n < 30) {
				for (k = 0; k < N * 3; k += 1) { P[k] = this.S[k] + rand(2); }
			} else if (n < 90) {
				for (k = 0; k < N * 3; k += 1) { P[k] += V[k]; }
			} else if (n === 90) {
				this.S.set(P);
			} else {
				var f = Math.min(1, (n - 90) / 32);
				for (k = 0; k < N * 3; k += 1) { P[k] = this.S[k] + (T[k] - this.S[k]) * f; }
				if (f >= 1) { this.finish(); }
			}
			break;
		case 14: /* elastic */
			if (n >= 65) { this.finish(); break; }
			for (k = 0; k < N * 3; k += 1) {
				P[k] += V[k];
				V[k] -= sign(P[k] - T[k]);
				if (n >= 5) {
					var cap = Math.floor((60 - (n - 5)) / 6);
					V[k] = Math.max(-cap, Math.min(cap, V[k]));
				}
			}
			break;
		}
	};

	/* ---------------------------------------------------------- a frame */

	Points.prototype.frame = function () {
		if (this.random && this.clock > this.recolour) {
			this.recolour = this.clock + 10000;
			this.colour = rand(4);
		}
		this.spin();
		if (this.clock < this.title) { return; }
		if (this.mode === 'show') {
			if (this.clock - this.T0 > this.interval) {
				this.begin();
			} else if (this.entry.length > 1) {
				/* A chain keeps morphing through its members, 16 frames each. */
				var from = this.entry[this.link].p;
				var to = this.entry[(this.link + 1) % this.entry.length].p;
				this.chainStep += 1;
				var f = this.chainStep / 16;
				for (var k = 0; k < N * 3; k += 1) { this.P[k] = from[k] + (to[k] - from[k]) * f; }
				if (this.chainStep >= 16) {
					this.chainStep = 0;
					this.link = (this.link + 1) % this.entry.length;
				}
			}
		} else if (this.mode === 'align') {
			if (this.a[0] === 0 && this.a[2] === 0) { this.mode = 'trans'; }
		} else {
			this.trans();
		}
	};

	Points.prototype.draw = function (ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (this.clock < this.title) {
			ctx.font = 'bold 13px "MS Sans Serif", "Microsoft Sans Serif", Arial, sans-serif';
			ctx.textBaseline = 'top';
			ctx.fillStyle = '#fff';
			ctx.fillText(w > 200 ? this.data.title + ':' + this.quip : this.data.title, 15, 15);
			return;
		}
		var a = this.a[0], b = this.a[1], c = this.a[2];
		var Sa = sin(a), Ca = cos(a), Sb = sin(b), Cb = cos(b), Sc = sin(c), Cc = cos(c);
		var m00 = Cb * Ca, m01 = Cb * Sa, m02 = Sb;
		var m10 = Sc * Sb * Ca + Cc * Sa, m11 = Sc * Sb * Sa - Cc * Ca, m12 = -Sc * Cb;
		var m20 = Sc * Sa - Cc * Sb * Ca, m21 = -Sc * Ca - Cc * Sb * Sa, m22 = Cc * Cb;
		var P = this.P, k = this.k, size = this.big ? 2 : 1;
		var mask = MASK[this.colour];
		var cx = Math.round(this.cx), cy = Math.round(this.cy);
		var last = -1;
		for (var i = 0; i < N; i += 1) {
			if (!this.shown[i]) { continue; }
			var x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
			var X = m00 * x + m01 * y + m02 * z;
			var Y = m10 * x + m11 * y + m12 * z;
			var Z = m20 * x + m21 * y + m22 * z;
			var D = this.off + 512 + Math.trunc(Z);
			if (D <= 0 || D >= 1024) { continue; }
			var dx = Math.trunc(512 * X / D), dy = Math.trunc(512 * Y / D);
			if (!dx && !dy) { continue; }
			var sx = cx + Math.round(dx * k), sy = cy + Math.round(dy * k);
			if (sx <= 0 || sy <= 0 || sx >= w || sy >= h) { continue; }
			var shade = Math.max(1, Math.min(255, Math.trunc(2 * Z) + 128));
			var v = 256 - shade;
			if (v !== last) {
				ctx.fillStyle = 'rgb(' + v * mask[0] + ',' + v * mask[1] + ',' + v * mask[2] + ')';
				last = v;
			}
			ctx.fillRect(sx, sy, size, size);
		}
	};

	Points.prototype.step = function (dt, ctx, w, h) {
		if (!this.data) {
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);
			return;
		}
		this.acc += dt * 1000;
		var budget = 10;
		while (this.acc >= FRAME && budget > 0) {
			this.acc -= FRAME;
			this.clock += FRAME;
			this.frame();
			budget -= 1;
		}
		if (!budget) { this.acc = 0; }
		this.draw(ctx, w, h);
	};

	AfterDark.define('after-dark-points-of-view', function (el) {
		var p = new Points();
		p.interval = INTERVAL[AfterDark.choice(el, 'new-shapes', NEW_SHAPES, '10 seconds')];
		var c = AfterDark.choice(el, 'color', COLORS, 'white');
		p.random = c === 4;
		p.colour = c === 4 ? 0 : c;
		p.big = AfterDark.flag(el, 'bigger-dots');
		AfterDark.data(AfterDark.setting(el, 'art') || 'art/points').then(function (data) {
			p.setData(data);
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		window.addEventListener('keydown', function (e) {
			if (e.key === 'CapsLock' && p.data && p.mode === 'show') { p.T0 = p.clock - p.interval - 1; }
		});
		return p;
	});

	window.AfterDarkPointsOfView = Points;
}());
