/**
 * lunatic.js - Lunatic Fringe, the video game that was also a screen saver.
 *
 * LUNATIC.AD's own description:
 *
 *   "LUNATIC FRINGE (tm) -- Video Game. To run, use After Dark's 'Sleep Now'
 *    corner or Sleep Hot Key combination. ... Original Mac version by Ben
 *    Haller."
 *
 * and its intro: "You are alone on patrol at the unexplored borders of the
 * Interstellar Alliance's territory. It's a remote, forbidding region known
 * as the Fringe. Suddenly you are attacked by a marauding band of aliens!"
 * Its bestiary names the rest - your ship, your shots ("bigger is better"),
 * the yummies (fuel, spare parts, repairs), your base, the asteroids Rocko
 * and Pebbles, the MultiBlaster, the Puffer, the Hammerhead, the Slicer, the
 * Sludger that lays mines, and the enemy base - and every one of them is in
 * its art, most as 32 headings, in all/art/lunatic/.
 *
 * Here it plays itself, the way a screen saver should. Caps Lock enters the
 * Fringe, as it did: then J and L (or the arrows) turn, K or Up thrusts,
 * Space fires and P raises the shield. Its sounds are left out, as all
 * sound is here, and the rules are this port's, not a transcription.
 *
 *   <after-dark-lunatic-fringe art="art/lunatic" level="1">
 */
(function () {
	'use strict';

	var LEVELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
	var ALIENS = ['alien1', 'alien2', 'alien3', 'alien4', 'blaster', 'puffer'];
	var TAU = Math.PI * 2;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function wrapAngle(a) {
		while (a > Math.PI) { a -= TAU; }
		while (a < -Math.PI) { a += TAU; }
		return a;
	}

	function LunaticFringe() {
		this.startLevel = 1;
		this.art = null;
		this.keys = {};
		this.playing = false;
	}

	LunaticFringe.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.s = Math.min(w, h) / 480;
		this.stars = [];
		for (var i = 0; i < 120; i += 1) { this.stars.push([rand(0, w), rand(0, h), Math.random()]); }
		this.newGame();
	};

	LunaticFringe.prototype.newGame = function () {
		var w = this.w, h = this.h;
		this.level = this.startLevel;
		this.score = 0;
		this.lives = 3;
		this.base = { x: w * 0.2, y: h * 0.75 };
		this.enemyBase = { x: w * 0.8, y: h * 0.22, hp: 30 };
		this.title = 3.5;
		this.startLevelObjects();
		this.spawnShip();
	};

	LunaticFringe.prototype.startLevelObjects = function () {
		this.aliens = [];
		this.shots = [];
		this.rocks = [];
		this.bits = [];
		this.yummies = [];
		this.mines = [];
		this.kills = 0;
		this.spawnIn = 1;
		for (var i = 0; i < 2 + this.level; i += 1) {
			this.rocks.push({ x: rand(0, this.w), y: rand(0, this.h), vx: rand(-30, 30), vy: rand(-30, 30), big: true });
		}
	};

	LunaticFringe.prototype.spawnShip = function () {
		this.ship = { x: this.base.x, y: this.base.y - 40 * this.s, vx: 0, vy: 0, a: 0, shield: 2.5, cool: 0, dead: 0 };
	};

	/* ------------------------------------------------------------ art -- */

	LunaticFringe.prototype.sprite = function (ctx, name, frame, x, y, scale) {
		var sp = this.art.sprites[name];
		if (!sp) { return; }
		var f = sp.frames[((frame % sp.frames.length) + sp.frames.length) % sp.frames.length], k = this.s * (scale || 1);
		ctx.drawImage(this.art.images[name], 0, f[0], sp.w, f[1], Math.round(x - sp.w * k / 2), Math.round(y - f[1] * k / 2), sp.w * k, f[1] * k);
	};

	/** The heading frame for an angle, 0 = up, clockwise, of n frames. */
	function heading(a, n) {
		return Math.round(((a % TAU) + TAU) % TAU / TAU * n) % n;
	}

	/* ----------------------------------------------------------- world -- */

	LunaticFringe.prototype.wrap = function (o) {
		var w = this.w, h = this.h;
		o.x = (o.x + w) % w;
		o.y = (o.y + h) % h;
	};

	LunaticFringe.prototype.boom = function (x, y, n, colour) {
		for (var i = 0; i < n; i += 1) {
			var a = rand(0, TAU), v = rand(30, 160) * this.s;
			this.bits.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: rand(0.4, 1.1), c: colour || pick(['#ffd040', '#ff6020', '#ffffff']) });
		}
	};

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	LunaticFringe.prototype.fire = function (from, a, mine, size) {
		var v = (mine ? 380 : 200) * this.s;
		this.shots.push({ x: from.x + Math.sin(a) * 18 * this.s, y: from.y - Math.cos(a) * 18 * this.s,
			vx: Math.sin(a) * v + (from.vx || 0), vy: -Math.cos(a) * v + (from.vy || 0), t: 1.4, mine: mine, size: size || 1 });
	};

	/** What the player does when nobody is: aim at the nearest trouble and shoot it. */
	LunaticFringe.prototype.autopilot = function (dt) {
		var sh = this.ship, best = null, bd = Infinity, self = this;
		this.aliens.concat(this.rocks).forEach(function (o) {
			var d = Math.hypot(o.x - sh.x, o.y - sh.y);
			if (d < bd) { bd = d; best = o; }
		});
		var want = sh.a, thrust = false, shoot = false;
		if (best) {
			/* Lead the target a little. */
			var t = bd / (380 * self.s);
			var tx = best.x + (best.vx || 0) * t, ty = best.y + (best.vy || 0) * t;
			want = Math.atan2(tx - sh.x, -(ty - sh.y));
			var off = Math.abs(wrapAngle(want - sh.a));
			shoot = off < 0.2;
			thrust = bd > 180 * self.s || (bd < 60 * self.s && Math.random() < 0.5);
		}
		return { turn: Math.sign(wrapAngle(want - sh.a)), thrust: thrust, fire: shoot, shield: sh.hurt };
	};

	LunaticFringe.prototype.controls = function () {
		var k = this.keys;
		return {
			turn: (k.l || k.arrowright ? 1 : 0) - (k.j || k.arrowleft ? 1 : 0),
			thrust: k.k || k.arrowup, fire: k[' '], shield: k.p
		};
	};

	LunaticFringe.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.art) { return; }
		var s = this.s, i, j, sh = this.ship, self = this;
		for (i = 0; i < this.stars.length; i += 1) {
			var st = this.stars[i];
			ctx.fillStyle = st[2] > 0.8 ? '#fff' : st[2] > 0.4 ? '#888' : '#444';
			ctx.fillRect(st[0], st[1], 1.5, 1.5);
		}
		ctx.imageSmoothingEnabled = false;
		if (this.title > 0) {
			this.title -= dt;
			this.sprite(ctx, 'title', 0, w / 2, h * 0.42, 1.3);
			ctx.fillStyle = '#fff';
			ctx.font = 'bold ' + Math.round(14 * s) + 'px Arial, sans-serif';
			ctx.textAlign = 'center';
			ctx.fillText('Press Caps Lock to enter the Fringe...', w / 2, h * 0.8);
			ctx.textAlign = 'left';
			return;
		}

		/* The ship. */
		if (sh.dead > 0) {
			sh.dead -= dt;
			if (sh.dead <= 0) {
				if (this.lives > 0) { this.spawnShip(); } else { this.newGame(); return; }
			}
		} else {
			var c = this.playing ? this.controls() : this.autopilot(dt);
			sh.a += c.turn * 4.5 * dt;
			if (c.thrust) {
				sh.vx += Math.sin(sh.a) * 260 * s * dt;
				sh.vy -= Math.cos(sh.a) * 260 * s * dt;
				if (Math.random() < 0.6) {
					this.bits.push({ x: sh.x - Math.sin(sh.a) * 16 * s, y: sh.y + Math.cos(sh.a) * 16 * s, vx: -Math.sin(sh.a) * 80 * s,
						vy: Math.cos(sh.a) * 80 * s, t: 0.25, c: '#ffa020' });
				}
			}
			sh.vx *= Math.pow(0.6, dt);
			sh.vy *= Math.pow(0.6, dt);
			sh.x += sh.vx * dt;
			sh.y += sh.vy * dt;
			this.wrap(sh);
			sh.cool -= dt;
			if (c.fire && sh.cool <= 0) {
				this.fire(sh, sh.a, true, this.score > 2000 ? 2 : 1);
				sh.cool = 0.18;
			}
			if (c.shield && sh.shield <= 0 && !sh.used) { sh.shield = 3; sh.used = true; }
			sh.shield = Math.max(0, sh.shield - dt);
			/* Home: parked over the base, you are repaired. */
			if (Math.hypot(sh.x - this.base.x, sh.y - this.base.y) < 30 * s) { sh.used = false; }
		}

		/* The enemy base sends them out. */
		this.spawnIn -= dt;
		if (this.spawnIn <= 0 && this.aliens.length < 2 + this.level * 2) {
			var kind = ALIENS[Math.floor(Math.random() * Math.min(ALIENS.length, 2 + this.level))];
			this.aliens.push({ kind: kind, x: this.enemyBase.x, y: this.enemyBase.y, vx: 0, vy: 0, a: rand(0, TAU),
				t: 0, cool: rand(1, 3), hp: kind === 'blaster' ? 3 : 1 });
			this.spawnIn = Math.max(0.8, 4 - this.level * 0.4);
		}
		for (i = 0; i < this.aliens.length; i += 1) {
			var al = this.aliens[i];
			al.t += dt;
			var slow = al.kind === 'blaster' ? 0.4 : al.kind === 'puffer' ? 0.6 : 1;
			var want = Math.atan2(sh.x - al.x, -(sh.y - al.y)) + Math.sin(al.t + i) * 0.6;
			al.a += Math.max(-2, Math.min(2, wrapAngle(want - al.a))) * dt * 2;
			al.vx += Math.sin(al.a) * 110 * s * slow * dt;
			al.vy -= Math.cos(al.a) * 110 * s * slow * dt;
			al.vx *= Math.pow(0.5, dt);
			al.vy *= Math.pow(0.5, dt);
			al.x += al.vx * dt;
			al.y += al.vy * dt;
			this.wrap(al);
			al.cool -= dt;
			if (al.cool <= 0 && sh.dead <= 0) {
				if (al.kind === 'blaster') {
					/* Four barrels. */
					for (j = 0; j < 4; j += 1) { this.fire(al, al.a + j * Math.PI / 2, false); }
				} else if (al.kind === 'puffer' && Math.random() < 0.5) {
					this.mines.push({ x: al.x, y: al.y, t: 0 });
				} else {
					this.fire(al, Math.atan2(sh.x - al.x, -(sh.y - al.y)), false);
				}
				al.cool = rand(1.5, 3.5) / Math.sqrt(this.level);
			}
		}
		for (i = 0; i < this.rocks.length; i += 1) {
			var r = this.rocks[i];
			r.x += r.vx * s * dt;
			r.y += r.vy * s * dt;
			this.wrap(r);
		}

		/* Shots against everything. */
		for (i = this.shots.length - 1; i >= 0; i -= 1) {
			var p = this.shots[i];
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.t -= dt;
			this.wrap(p);
			var gone = p.t <= 0;
			if (p.mine) {
				for (j = this.aliens.length - 1; j >= 0 && !gone; j -= 1) {
					if (Math.hypot(this.aliens[j].x - p.x, this.aliens[j].y - p.y) < 18 * s) {
						gone = true;
						this.aliens[j].hp -= p.size;
						if (this.aliens[j].hp <= 0) {
							this.boom(this.aliens[j].x, this.aliens[j].y, 30);
							if (Math.random() < 0.25) { this.yummies.push({ x: this.aliens[j].x, y: this.aliens[j].y, kind: Math.floor(Math.random() * 8), t: 10 }); }
							this.aliens.splice(j, 1);
							this.score += 100 * this.level;
							this.kills += 1;
						}
					}
				}
				for (j = this.rocks.length - 1; j >= 0 && !gone; j -= 1) {
					var rk = this.rocks[j];
					if (Math.hypot(rk.x - p.x, rk.y - p.y) < (rk.big ? 26 : 14) * s) {
						gone = true;
						this.boom(rk.x, rk.y, 12, '#aaaaaa');
						this.rocks.splice(j, 1);
						this.score += rk.big ? 20 : 50;
						if (rk.big) {
							/* Rocko breaks into Pebbles. */
							for (var q = 0; q < 2; q += 1) { this.rocks.push({ x: rk.x, y: rk.y, vx: rand(-60, 60), vy: rand(-60, 60), big: false }); }
						}
					}
				}
				if (!gone && Math.hypot(this.enemyBase.x - p.x, this.enemyBase.y - p.y) < 30 * s) {
					gone = true;
					this.boom(p.x, p.y, 6);
					this.enemyBase.hp -= 1;
					if (this.enemyBase.hp <= 0) {
						/* Level cleared. */
						this.boom(this.enemyBase.x, this.enemyBase.y, 120);
						this.score += 5000;
						this.level += 1;
						this.enemyBase.hp = 30 + this.level * 5;
						this.startLevelObjects();
					}
				}
			} else if (sh.dead <= 0 && Math.hypot(sh.x - p.x, sh.y - p.y) < 14 * s) {
				gone = true;
				this.hit();
			}
			if (gone) { this.shots.splice(i, 1); }
		}
		/* Collisions with the ship. */
		if (sh.dead <= 0) {
			this.aliens.concat(this.rocks).forEach(function (o) {
				if (sh.dead <= 0 && Math.hypot(o.x - sh.x, o.y - sh.y) < (o.big ? 28 : 18) * s) { self.hit(); }
			});
			for (i = this.mines.length - 1; i >= 0; i -= 1) {
				if (Math.hypot(this.mines[i].x - sh.x, this.mines[i].y - sh.y) < 12 * s) { this.mines.splice(i, 1); this.hit(); }
			}
			for (i = this.yummies.length - 1; i >= 0; i -= 1) {
				if (Math.hypot(this.yummies[i].x - sh.x, this.yummies[i].y - sh.y) < 18 * s) {
					this.score += 250;
					if (this.yummies[i].kind === 4) { sh.shield = 5; }
					this.yummies.splice(i, 1);
				}
			}
		}

		/* Draw. */
		this.clock = (this.clock || 0) + dt;
		this.sprite(ctx, 'base', Math.floor(this.clock * 8), this.base.x, this.base.y);
		this.sprite(ctx, 'enemybase', 0, this.enemyBase.x, this.enemyBase.y);
		this.rocks.forEach(function (rk) { self.sprite(ctx, 'rocks', rk.big ? 0 : 1, rk.x, rk.y); });
		this.mines.forEach(function (m) { m.t += dt; self.sprite(ctx, 'mines', Math.floor(m.t * 6), m.x, m.y); });
		for (i = this.yummies.length - 1; i >= 0; i -= 1) {
			var y = this.yummies[i];
			y.t -= dt;
			if (y.t <= 0) { this.yummies.splice(i, 1); continue; }
			this.sprite(ctx, 'yummies', y.kind, y.x, y.y);
		}
		this.aliens.forEach(function (al) {
			var frame = al.kind === 'blaster' ? heading(al.a, 8) : al.kind === 'puffer' ? Math.floor(al.t * 8) : heading(al.a, 32);
			self.sprite(ctx, al.kind, frame, al.x, al.y);
		});
		this.shots.forEach(function (p) { self.sprite(ctx, p.mine ? (p.size > 1 ? 'shot2' : 'shot1') : 'shot0', 0, p.x, p.y); });
		if (sh.dead <= 0) {
			this.sprite(ctx, sh.shield > 0 && Math.floor(sh.shield * 8) % 2 ? 'shield' : 'ship', heading(sh.a, 32), sh.x, sh.y);
		}
		for (i = this.bits.length - 1; i >= 0; i -= 1) {
			var b = this.bits[i];
			b.t -= dt;
			if (b.t <= 0) { this.bits.splice(i, 1); continue; }
			b.x += b.vx * dt;
			b.y += b.vy * dt;
			ctx.fillStyle = b.c;
			ctx.fillRect(b.x, b.y, 2 * s, 2 * s);
		}
		/* Score, level, ships left. */
		ctx.fillStyle = '#fff';
		ctx.font = 'bold ' + Math.round(12 * s) + 'px Arial, sans-serif';
		ctx.fillText('SCORE ' + this.score + '    LEVEL ' + this.level + (this.playing ? '' : '    (Caps Lock to play)'), 10 * s, 18 * s);
		for (i = 0; i < this.lives; i += 1) { this.sprite(ctx, 'life', 0, w - (20 + i * 30) * s, 14 * s); }
	};

	LunaticFringe.prototype.hit = function () {
		var sh = this.ship;
		if (sh.shield > 0) { return; }
		this.boom(sh.x, sh.y, 60, '#88aaff');
		sh.dead = 2.2;
		this.lives -= 1;
	};

	AfterDark.define('after-dark-lunatic-fringe', function (el) {
		var sim = new LunaticFringe();
		sim.startLevel = Number(LEVELS[AfterDark.choice(el, 'level', LEVELS, '1')]);
		window.addEventListener('keydown', function (e) {
			if (e.getModifierState) { sim.playing = e.getModifierState('CapsLock'); }
			sim.keys[e.key.toLowerCase()] = true;
			if (sim.playing && [' ', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].indexOf(e.key) >= 0) { e.preventDefault(); }
		});
		window.addEventListener('keyup', function (e) {
			if (e.getModifierState) { sim.playing = e.getModifierState('CapsLock'); }
			sim.keys[e.key.toLowerCase()] = false;
		});
		var base = AfterDark.setting(el, 'art') || 'art/lunatic';
		AfterDark.data(base).then(function (d) {
			var names = Object.keys(d.sprites), images = {}, left = names.length;
			names.forEach(function (n) {
				var im = new Image();
				im.onload = function () {
					images[n] = im;
					left -= 1;
					if (!left) { sim.art = { sprites: d.sprites, images: images }; }
				};
				im.src = AfterDark.bust(base + '/' + d.sprites[n].file);
			});
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkLunaticFringe = LunaticFringe;
}());
