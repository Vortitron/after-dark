/**
 * shapes.js - Shapes, drawn the way the original module drew itself.
 *
 * SHAPES.AD ships no artwork. Its own description:
 *
 *   "SHAPES (tm) fills the screen with a rapid succession of geometric
 *    shapes.
 *    Original design and concept by Jack Eastman.
 *    If 'Clear Screen First' is checked, the screen is blanked before the
 *    shapes start appearing.
 *    Use the 'Color' check box to select color or black & white shapes."
 *
 * Checked against the original running under Wine (October 2026), from a
 * WINEDEBUG=+relay trace of its GDI calls (3,400 shapes) and an 8-bit
 * capture. Each tick it draws exactly one shape with the NULL pen and a
 * fresh solid brush - a filled Rectangle or a filled upright Ellipse, half
 * and half; there are no outlines, triangles, lines or rotations:
 *
 *   left = random(W + 80) - 100     top = random(H + 80) - 100
 *   width = random(W / 2)           height = random(H / 2)
 *
 * so shapes run off every edge, up to half the screen across. The brush is
 * PALETTERGB(random(255), random(255), random(255)) - or one random(255)
 * for all three in black & white - and PALETTERGB means Windows paints the
 * nearest colour of the palette the engine has selected: AFTERDAR.SCR's
 * AD_PALETTE 104, a 6x6x6 colour cube plus a grey ramp. So the shapes are
 * flat colours from that palette (the dithered fills in a Wine capture are
 * Wine's, not the module's). The defaults are the module's own: Clear Screen
 * First off - the shapes pile up on your desktop - and Color on.
 *
 * Still chosen: the rate. Under Wine it runs unthrottled.
 *
 *   <after-dark-shapes color>
 */
(function () {
	'use strict';

	var PER_FRAME = 3;
	var KINDS = ['rect', 'ellipse'];

	/* AD_PALETTE 104: the 6x6x6 cube and the greys between its steps. */
	var PALETTE = (function () {
		var list = [];
		var r, g, b;
		for (r = 0; r < 6; r += 1) {
			for (g = 0; g < 6; g += 1) {
				for (b = 0; b < 6; b += 1) {
					list.push([r * 51, g * 51, b * 51]);
				}
			}
		}
		[12, 25, 38, 64, 77, 90, 103, 116, 129, 142, 155, 168, 181, 194, 207, 220, 233].forEach(function (v) {
			list.push([v, v, v]);
		});
		return list;
	}());

	function random(n) {
		return Math.floor(Math.random() * n);
	}

	/** PALETTERGB(r, g, b): the nearest palette entry, as a CSS colour. */
	function nearest(r, g, b) {
		var best = PALETTE[0];
		var bestD = Infinity;
		for (var i = 0; i < PALETTE.length; i += 1) {
			var p = PALETTE[i];
			var d = (p[0] - r) * (p[0] - r) + (p[1] - g) * (p[1] - g) + (p[2] - b) * (p[2] - b);
			if (d < bestD) {
				bestD = d;
				best = p;
			}
		}
		return 'rgb(' + best[0] + ',' + best[1] + ',' + best[2] + ')';
	}

	function colour(useColour) {
		if (!useColour) {
			var v = random(255);
			return nearest(v, v, v);
		}
		return nearest(random(255), random(255), random(255));
	}

	function Shapes() {
		this.color = true;
		this.clearScreen = false;
		this.cleared = false;
	}

	Shapes.prototype.reset = function () {
		this.cleared = false;
	};

	/** One shape, as the module rolls it, on a w x h screen (1024x768 there). */
	Shapes.prototype.roll = function (w, h) {
		var k = w / 1024;
		return {
			kind: KINDS[random(2)],
			x: random(w + 80 * k) - 100 * k,
			y: random(h + 80 * k) - 100 * k,
			w: random(w / 2),
			h: random(h / 2),
			colour: colour(this.color)
		};
	};

	Shapes.prototype.paint = function (ctx, w, h) {
		var s = this.roll(w, h);
		ctx.fillStyle = s.colour;
		if (s.kind === 'rect') {
			// with the NULL pen GDI fills one pixel short on the right and bottom
			ctx.fillRect(s.x, s.y, Math.max(0, s.w - 1), Math.max(0, s.h - 1));
		} else {
			ctx.beginPath();
			ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
			ctx.fill();
		}
	};

	Shapes.prototype.step = function () {};

	Shapes.prototype.draw = function (ctx, w, h) {
		var i;
		if (!this.cleared) {
			if (this.clearScreen) {
				ctx.fillStyle = '#000';
				ctx.fillRect(0, 0, w, h);
			} else {
				ctx.drawImage(AfterDark.desktop(Math.round(w), Math.round(h)), 0, 0, w, h);
			}
			this.cleared = true;
		}
		for (i = 0; i < PER_FRAME; i += 1) {
			this.paint(ctx, w, h);
		}
	};

	function ShapesElement() {
		return Reflect.construct(HTMLElement, [], ShapesElement);
	}
	ShapesElement.prototype = Object.create(HTMLElement.prototype);
	ShapesElement.prototype.constructor = ShapesElement;
	Object.setPrototypeOf(ShapesElement, HTMLElement);

	ShapesElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		var self = this;
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		var sim = new Shapes();
		sim.color = AfterDark.flag(self, 'color');
		sim.clearScreen = AfterDark.flag(self, 'clear-screen');

		var screen = new AfterDark.Screen(self);
		this._screen = screen;
		this.sim = sim;
		screen.onresize = function () {
			sim.reset();
		};
		sim.reset();
		screen.run(function (dt, ctx, width, height) {
			sim.draw(ctx, width, height);
		});
	};

	ShapesElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-shapes', ShapesElement);
	window.AfterDarkShapes = Shapes;
	Shapes.colour = colour;
	Shapes.nearest = nearest;
	Shapes.PALETTE = PALETTE;
	Shapes.KINDS = KINDS;
}());
