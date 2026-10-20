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
 * Checked against the real module under Wine (8-bit, 1024x768, defaults, plus
 * a true-colour window grab): bursts start at the middle of the screen (Always
 * Centered is on by default); trails are 1-pixel lines; each particle has its
 * own colour from the 20-colour Windows system palette; a burst has a handful
 * of particles (4 to 16 seen - a four-armed cross is common); electrons circle
 * at about a fifth of the screen width; photons zigzag, protons spiral out,
 * neutrinos go straight; bursts overlap. Still inferred: exact speeds, counts,
 * zigzag shape and the delay - the module runs unthrottled-looking under Wine.
 * always-centered="off" turns centring off.
 *
 *   <after-dark-photon length="16" burst-delay="1 sec" burst="mixed">
 */
(function () {
	'use strict';

	var LENGTHS = ['1', '2', '4', '8', '12', '16', '24', '32'];
	var DELAYS = ['none', '1/2 sec.', '1 sec.', '2 sec.', '5 sec.', '10 sec.', '30 sec.'];
	var WAIT = [0, 0.5, 1, 2, 5, 10, 30];
	var BURSTS = ['mixed', 'photon', 'electron', 'proton', 'neutrino'];
	/* Every particle takes its own colour from the Windows static palette - the
	   ones seen in a true-colour grab of the real module (no white or blue). */
	var COLOURS = ['#a0a0a4', '#c0c0c0', '#00ff00', '#c0dcc0', '#00ffff', '#ff00ff', '#fffbf0',
		'#008080', '#808000', '#ffff00', '#800080', '#ff0000'];

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
		var n = [4, 8, 12, 16][Math.floor(Math.random() * 4)], parts = [], colour = null;
		for (var i = 0; i < n; i += 1) {
			parts.push({
				a: i / n * Math.PI * 2 + rand(-0.05, 0.05), r: 0,
				v: rand(90, 220) * this.s * (kind === 4 ? 2.2 : 1), spin: rand(1.5, 3.5) * (Math.random() < 0.5 ? -1 : 1),
				orbit: rand(0.18, 0.25) * w, wobble: rand(4, 9), trail: [],
				colour: COLOURS[Math.floor(Math.random() * COLOURS.length)]
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
		ctx.lineWidth = 1;
		ctx.lineCap = 'butt';
		for (var i = this.bursts.length - 1; i >= 0; i -= 1) {
			var b = this.bursts[i];
			b.t += dt;
			var gone = 0;
			for (var k = 0; k < b.parts.length; k += 1) {
				var p = b.parts[k], at = this.place(b, p, b.t);
				ctx.strokeStyle = ctx.fillStyle = p.colour;
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
		/* On by default in the module's own settings, and in the capture. */
		sim.centered = AfterDark.setting(el, 'always-centered') !== 'off';
		sim.kind = AfterDark.choice(el, 'burst', BURSTS, 'mixed');
		return sim;
	});

	window.AfterDarkPhoton = Photon;
}());
