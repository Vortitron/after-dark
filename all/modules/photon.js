/**
 * photon.js - Photon, bursts of particles.
 *
 * PHOTON.AD ships no artwork. Its own description:
 *
 *   "Photon keeps things active (radioactive?) with bursts of various sorts -
 *    photons, sort of squiggly outward bursts; electrons, spinning around the
 *    center; protons, spiralling outwards; and neutrinos, bursting straight
 *    out the center.
 *    'Length' sets the length of the trails. 'Burst Delay' sets the amount of
 *    time between bursts. 'Always Centered' keeps the bursts always centered
 *    on the screen. 'Burst' allows to select the type of bursts."
 *
 * Length runs 1 to 32; Burst is Mixed, Photon, Electron, Proton or Neutrino.
 *
 *   <after-dark-photon length="16" burst-delay="1 sec" burst="mixed">
 */
(function () {
	'use strict';

	var LENGTHS = ['1', '2', '4', '8', '12', '16', '24', '32'];
	var DELAYS = ['none', '1/2 sec.', '1 sec.', '2 sec.', '5 sec.', '10 sec.', '30 sec.'];
	var WAIT = [0, 0.5, 1, 2, 5, 10, 30];
	var BURSTS = ['mixed', 'photon', 'electron', 'proton', 'neutrino'];
	var COLOURS = ['#ff5555', '#55ff55', '#5555ff', '#ffff55', '#55ffff', '#ff55ff', '#ffffff', '#ffaa00'];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Photon() {
		this.length = 16;
		this.wait = 1;
		this.centered = false;
		this.kind = 0;
		this.bursts = [];
		this.next = 0;
	}

	Photon.prototype.resize = function (w, h) {
		this.bursts = [];
		this.next = 0;
		this.s = Math.max(1, Math.min(w, h) / 480);
	};

	Photon.prototype.burst = function (w, h) {
		var kind = this.kind || 1 + Math.floor(Math.random() * 4);
		var cx = this.centered ? w / 2 : rand(w * 0.2, w * 0.8), cy = this.centered ? h / 2 : rand(h * 0.2, h * 0.8);
		var n = Math.round(rand(24, 60)), parts = [], colour = COLOURS[Math.floor(Math.random() * COLOURS.length)];
		for (var i = 0; i < n; i += 1) {
			parts.push({
				a: i / n * Math.PI * 2 + rand(-0.05, 0.05), r: 0,
				v: rand(90, 220) * this.s * (kind === 4 ? 2.2 : 1), spin: rand(1.5, 3.5) * (Math.random() < 0.5 ? -1 : 1),
				orbit: rand(20, Math.min(w, h) * 0.45), wobble: rand(4, 9), trail: []
			});
		}
		return { kind: kind, x: cx, y: cy, t: 0, parts: parts, colour: colour, life: kind === 2 ? rand(4, 7) : 8 };
	};

	/** Where a particle is at time t into its burst, by the burst's kind. */
	Photon.prototype.place = function (b, p, t) {
		var a = p.a, r;
		if (b.kind === 1) {
			/* Photon: out, weaving side to side. */
			r = p.v * t;
			a += Math.sin(t * p.wobble) * 0.25;
		} else if (b.kind === 2) {
			/* Electron: swings out to its orbit and goes round. */
			r = p.orbit * Math.min(1, t * 1.2);
			a += p.spin * t;
		} else if (b.kind === 3) {
			/* Proton: spirals out. */
			r = p.v * t * 0.8;
			a += p.spin * t * 0.6;
		} else {
			r = p.v * t;
		}
		return { x: b.x + Math.cos(a) * r, y: b.y + Math.sin(a) * r };
	};

	Photon.prototype.step = function (dt, ctx, w, h) {
		this.next -= dt;
		if (this.next <= 0 && this.bursts.length < 4) {
			this.bursts.push(this.burst(w, h));
			this.next = Math.max(this.wait, 0.4);
		}
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		ctx.lineWidth = Math.max(1, this.s);
		ctx.lineCap = 'round';
		for (var i = this.bursts.length - 1; i >= 0; i -= 1) {
			var b = this.bursts[i];
			b.t += dt;
			var gone = 0;
			ctx.strokeStyle = b.colour;
			ctx.fillStyle = b.colour;
			for (var k = 0; k < b.parts.length; k += 1) {
				var p = b.parts[k], at = this.place(b, p, b.t);
				p.trail.push(at);
				if (p.trail.length > this.length + 1) { p.trail.shift(); }
				if (at.x < -50 || at.y < -50 || at.x > w + 50 || at.y > h + 50) { gone += 1; }
				if (p.trail.length < 2) {
					ctx.fillRect(at.x, at.y, ctx.lineWidth, ctx.lineWidth);
					continue;
				}
				ctx.beginPath();
				ctx.moveTo(p.trail[0].x, p.trail[0].y);
				for (var j = 1; j < p.trail.length; j += 1) { ctx.lineTo(p.trail[j].x, p.trail[j].y); }
				ctx.stroke();
			}
			if (gone === b.parts.length || b.t > b.life) { this.bursts.splice(i, 1); }
		}
	};

	AfterDark.define('after-dark-photon', function (el) {
		var sim = new Photon();
		sim.length = Number(LENGTHS[AfterDark.choice(el, 'length', LENGTHS, '16')]);
		sim.wait = WAIT[AfterDark.choice(el, 'burst-delay', DELAYS, '1 sec.')];
		sim.centered = AfterDark.flag(el, 'always-centered');
		sim.kind = AfterDark.choice(el, 'burst', BURSTS, 'mixed');
		return sim;
	});

	window.AfterDarkPhoton = Photon;
}());
