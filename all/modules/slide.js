/**
 * slide.js - SlideShow, pictures with transitions.
 *
 * SLIDE.AD's own description:
 *
 *   "SLIDESHOW - Slideshow displays pictures with interesting transition
 *    effects. 'Slides' allows you to select which directory of images, or
 *    'catalog', will be displayed. 'Effect' selects the transition effect(s)
 *    between pictures. 'Delay' sets how long before each new picture will be
 *    drawn."
 *
 * The catalogue it shipped with is BITMAPS.ADC, and all that lists is two
 * pictures, In Order: the After Dark logo and a flying toaster. The
 * 10th-anniversary set put a PICTURES folder of eleven more beside it.
 * Both are in all/art/slide/, as `slides="bitmaps"` and `slides="pictures"`.
 * The effects are the module's own list, Blink to Tetris Vert, plus Random.
 *
 *   <after-dark-slideshow art="art/slide" slides="pictures" effect="random" delay="5 sec.">
 */
(function () {
	'use strict';

	var EFFECTS = ['blink', 'radial cw', 'radial ccw', 'wipe horizontal', 'wipe vertical',
		'split horiz in', 'split horiz out', 'split vert in', 'split vert out',
		'iris round in', 'iris round out', 'iris square in', 'iris square out',
		'iris diamond in', 'iris diamond out', 'blinds horiz', 'blinds vert', 'tetris horiz', 'tetris vert',
		'rain', 'spiral', 'bars', 'dissolve', 'reveal checkers', 'reveal row', 'reveal column',
		'reveal box ul', 'reveal box ur', 'reveal box ll', 'reveal box lr', 'random'];
	var DELAYS = ['no delay', '5 sec.', '10 sec.', '30 sec.', '1 min.', '2 min.', '5 min.'];
	var WAIT = [0.3, 5, 10, 30, 60, 120, 300];
	var SLIDES = ['pictures', 'bitmaps'];
	var TRANSITION = 1.6;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	/**
	 * Cells for the effects that come on a block at a time, each with the
	 * moment (0..1 through the transition) it appears.
	 */
	function cells(kind, w, h, size) {
		var cols = Math.ceil(w / size), rows = Math.ceil(h / size), out = [], c, r;
		for (r = 0; r < rows; r += 1) {
			for (c = 0; c < cols; c += 1) {
				var t;
				if (kind === 'dissolve') { t = Math.random(); }
				if (kind === 'reveal checkers') { t = ((c + r) % 2 ? 0.5 : 0) + Math.random() * 0.5; }
				if (kind === 'reveal row') { t = (r + c / cols) / rows; }
				if (kind === 'reveal column') { t = (c + r / rows) / cols; }
				if (kind === 'tetris horiz') { t = (rows - 1 - r) / rows + Math.random() / rows; }
				if (kind === 'tetris vert') { t = c / cols + Math.random() / cols; }
				if (kind === 'rain') { t = r / rows * 0.6 + (c * 7919 % 97) / 97 * 0.4; }
				out.push({ x: c * size, y: r * size, t: Math.min(0.999, t) });
			}
		}
		if (kind === 'spiral') {
			/* Round the outside and in. */
			var order = [], top = 0, left = 0, bottom = rows - 1, right = cols - 1;
			while (top <= bottom && left <= right) {
				for (c = left; c <= right; c += 1) { order.push([c, top]); }
				for (r = top + 1; r <= bottom; r += 1) { order.push([right, r]); }
				if (top < bottom) { for (c = right - 1; c >= left; c -= 1) { order.push([c, bottom]); } }
				if (left < right) { for (r = bottom - 1; r > top; r -= 1) { order.push([left, r]); } }
				top += 1; left += 1; bottom -= 1; right -= 1;
			}
			out = order.map(function (o, i) { return { x: o[0] * size, y: o[1] * size, t: i / order.length }; });
		}
		return out;
	}

	/** The part of the screen the new picture has reached, p from 0 to 1. */
	function region(g, kind, p, w, h, grid) {
		var cx = w / 2, cy = h / 2, i, n;
		g.beginPath();
		switch (kind) {
		case 'blink': if (p > 0.5) { g.rect(0, 0, w, h); } break;
		case 'radial cw':
		case 'radial ccw':
			var ccw = kind === 'radial ccw', start = -Math.PI / 2, end = start + (ccw ? -1 : 1) * p * Math.PI * 2;
			g.moveTo(cx, cy);
			g.arc(cx, cy, Math.hypot(w, h), start, end, ccw);
			g.closePath();
			break;
		case 'wipe horizontal': g.rect(0, 0, w * p, h); break;
		case 'wipe vertical': g.rect(0, 0, w, h * p); break;
		case 'split horiz in': g.rect(0, 0, w * p / 2, h); g.rect(w - w * p / 2, 0, w * p / 2, h); break;
		case 'split horiz out': g.rect(cx - w * p / 2, 0, w * p, h); break;
		case 'split vert in': g.rect(0, 0, w, h * p / 2); g.rect(0, h - h * p / 2, w, h * p / 2); break;
		case 'split vert out': g.rect(0, cy - h * p / 2, w, h * p); break;
		case 'iris round out': g.arc(cx, cy, Math.hypot(w, h) / 2 * p, 0, Math.PI * 2); break;
		case 'iris round in':
			g.rect(0, 0, w, h);
			g.arc(cx, cy, Math.hypot(w, h) / 2 * (1 - p), 0, Math.PI * 2, true);
			break;
		case 'iris square out': g.rect(cx - w / 2 * p, cy - h / 2 * p, w * p, h * p); break;
		case 'iris square in':
			g.rect(0, 0, w, h);
			g.rect(cx + w / 2 * (1 - p), cy - h / 2 * (1 - p), -w * (1 - p), h * (1 - p));
			break;
		case 'iris diamond out':
		case 'iris diamond in':
			var d = (w + h) / 2 * (kind === 'iris diamond out' ? p : 1 - p);
			if (kind === 'iris diamond in') {
				g.rect(0, 0, w, h);
				g.moveTo(cx, cy - d); g.lineTo(cx - d, cy); g.lineTo(cx, cy + d); g.lineTo(cx + d, cy);
			} else {
				g.moveTo(cx, cy - d); g.lineTo(cx + d, cy); g.lineTo(cx, cy + d); g.lineTo(cx - d, cy);
			}
			g.closePath();
			break;
		case 'blinds horiz':
			n = 10;
			for (i = 0; i < n; i += 1) { g.rect(0, i * h / n, w, h / n * p); }
			break;
		case 'blinds vert':
			n = 12;
			for (i = 0; i < n; i += 1) { g.rect(i * w / n, 0, w / n * p, h); }
			break;
		case 'bars':
			n = 16;
			for (i = 0; i < n; i += 1) {
				if (i % 2) { g.rect(w - w * p, i * h / n, w * p, h / n); } else { g.rect(0, i * h / n, w * p, h / n); }
			}
			break;
		case 'reveal box ul': g.rect(0, 0, w * p, h * p); break;
		case 'reveal box ur': g.rect(w - w * p, 0, w * p, h * p); break;
		case 'reveal box ll': g.rect(0, h - h * p, w * p, h * p); break;
		case 'reveal box lr': g.rect(w - w * p, h - h * p, w * p, h * p); break;
		default:
			for (i = 0; i < grid.cells.length; i += 1) {
				var cell = grid.cells[i];
				if (cell.t < p) { g.rect(cell.x, cell.y, grid.size, grid.size); }
			}
		}
	}

	function SlideShow() {
		this.effect = 'random';
		this.wait = WAIT[1];
		this.slides = 'pictures';
		this.art = null;
	}

	SlideShow.prototype.resize = function (w, h) {
		this.w = w;
		this.h = h;
		this.shown = null;
		this.index = -1;
		this.timer = 0.4;
		this.trans = null;
	};

	/** A whole screen with one picture in the middle, as big as whole pixels allow. */
	SlideShow.prototype.frame = function (name) {
		var bmp = this.art.bitmap(name), w = this.w, h = this.h;
		var c = document.createElement('canvas');
		c.width = Math.max(1, Math.round(w));
		c.height = Math.max(1, Math.round(h));
		var g = c.getContext('2d');
		g.fillStyle = '#000';
		g.fillRect(0, 0, w, h);
		var k = Math.max(1, Math.floor(Math.min(w * 0.85 / bmp.width, h * 0.85 / bmp.height)));
		g.imageSmoothingEnabled = false;
		g.drawImage(bmp.image, Math.round((w - bmp.width * k) / 2), Math.round((h - bmp.height * k) / 2),
			bmp.width * k, bmp.height * k);
		return c;
	};

	SlideShow.prototype.step = function (dt, ctx, w, h) {
		if (!this.art) {
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);
			return;
		}
		var list = this.catalog;
		if (this.trans) {
			var t = this.trans;
			t.p += dt / TRANSITION;
			if (t.p >= 1) {
				this.shown = t.to;
				this.trans = null;
				this.timer = this.wait;
			} else {
				ctx.drawImage(t.from, 0, 0, w, h);
				ctx.save();
				region(ctx, t.kind, t.p, w, h, t.grid);
				ctx.clip('evenodd');
				ctx.drawImage(t.to, 0, 0, w, h);
				ctx.restore();
				return;
			}
		}
		this.timer -= dt;
		if (this.timer <= 0) {
			this.index = (this.index + 1) % list.length;
			var kind = this.effect === 'random' ? EFFECTS[Math.floor(Math.random() * (EFFECTS.length - 1))] : this.effect;
			var from = this.shown;
			if (!from) {
				from = document.createElement('canvas');
				from.width = Math.max(1, Math.round(w));
				from.height = Math.max(1, Math.round(h));
				from.getContext('2d').fillRect(0, 0, w, h);
			}
			var size = Math.max(8, Math.round(Math.min(w, h) / 24));
			this.trans = { from: from, to: this.frame(list[this.index]), p: 0, kind: kind,
				grid: { size: size, cells: cells(kind, w, h, size) } };
		}
		if (this.shown) {
			ctx.drawImage(this.shown, 0, 0, w, h);
		} else {
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);
		}
	};

	AfterDark.define('after-dark-slideshow', function (el) {
		var sim = new SlideShow();
		sim.effect = EFFECTS[AfterDark.choice(el, 'effect', EFFECTS, 'random')];
		sim.wait = WAIT[AfterDark.choice(el, 'delay', DELAYS, '5 sec.')];
		sim.slides = SLIDES[AfterDark.choice(el, 'slides', SLIDES, 'pictures')];
		var base = AfterDark.setting(el, 'art') || 'art/slide';
		Promise.all([AfterDark.load(base), AfterDark.data(base)]).then(function (both) {
			sim.catalog = both[1].catalogs[sim.slides];
			sim.art = both[0];
		}).catch(function (err) {
			if (window.console) { console.error(err); }
		});
		return sim;
	});

	window.AfterDarkSlideShow = SlideShow;
	SlideShow.EFFECTS = EFFECTS;
}());
