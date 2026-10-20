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
 *
 * Checked against SLIDE.AD running under Wine (8-bit, 1024x768, catalogue
 * BITMAPS, FX Random, Delay No Delay): each picture is drawn at its own size,
 * one bitmap pixel to a screen pixel, in the middle of a black screen - the
 * logo is 220x106 of the 1024x768. A change is two halves, both confined to
 * the picture's own rectangle: the old picture is taken off to black by an
 * effect (vertical blinds thinning to nothing, say), then the new one is put
 * on by another; each half took about half a second to a second there.
 * The FX menu (TYPE_1000 #3) is Blink, Rain, Wipe, Split, Spiral, Blinds,
 * Bars, Reveal, Dissolve or Random - families, each with variants; the long
 * list of named variants (Radial CW ... Tetris Vert) is a hidden, leftover
 * control (#2, "Posters..."), so those names are still accepted here but are
 * not on the menu. Delay is the module's own list, No Delay to 1 hr.
 * Still inferred: which variants each family really has, and the exact
 * timings. Delay rests at 45 of 100 on its slider, which is
 * "1 min." (the first label at or above it).
 * Slide Show reads its catalogue from MODULES.INI [Slide Show]
 * CatalogName=<name>, as C:\WINDOWS\<name>.ADC.
 *
 *   <after-dark-slideshow art="art/slide" slides="bitmaps" effect="random" delay="1 min.">
 */
(function () {
	'use strict';

	/* The FX menu: families of effect, each a handful of variants. */
	var FAMILIES = {
		blink: ['blink'],
		rain: ['rain'],
		wipe: ['wipe horizontal', 'wipe vertical'],
		split: ['split horiz in', 'split horiz out', 'split vert in', 'split vert out'],
		spiral: ['spiral'],
		blinds: ['blinds horiz', 'blinds vert'],
		bars: ['bars'],
		reveal: ['reveal checkers', 'reveal row', 'reveal column',
			'reveal box ul', 'reveal box ur', 'reveal box ll', 'reveal box lr'],
		dissolve: ['dissolve']
	};
	var FX = ['blink', 'rain', 'wipe', 'split', 'spiral', 'blinds', 'bars', 'reveal', 'dissolve', 'random'];
	/* Every variant by name, the hidden list's too, for anyone who asks for one. */
	var EFFECTS = ['blink', 'radial cw', 'radial ccw', 'wipe horizontal', 'wipe vertical',
		'split horiz in', 'split horiz out', 'split vert in', 'split vert out',
		'iris round in', 'iris round out', 'iris square in', 'iris square out',
		'iris diamond in', 'iris diamond out', 'blinds horiz', 'blinds vert', 'tetris horiz', 'tetris vert',
		'rain', 'spiral', 'bars', 'dissolve', 'reveal checkers', 'reveal row', 'reveal column',
		'reveal box ul', 'reveal box ur', 'reveal box ll', 'reveal box lr'];
	var DELAYS = ['no delay', '5 sec.', '10 sec.', '30 sec.', '1 min.', '2 min.', '5 min.',
		'10 min.', '20 min.', '30 min.', '1 hr.'];
	var WAIT = [0.3, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];
	var SLIDES = ['pictures', 'bitmaps'];
	/* Seconds for each half of a change: the old picture off, the new one on. */
	var HALF = 0.7;

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	/** A variant to run: the one asked for, or one of the family's, or any. */
	function variant(effect) {
		if (EFFECTS.indexOf(effect) >= 0) { return effect; }
		if (FAMILIES[effect]) { return pick(FAMILIES[effect]); }
		return pick(FAMILIES[pick(FX.slice(0, -1))]);
	}

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
		this.wait = WAIT[4];
		this.slides = 'bitmaps';
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

	/** One picture, one bitmap pixel to a CSS pixel, in the middle: where it sits. */
	SlideShow.prototype.place = function (name) {
		var bmp = this.art.bitmap(name);
		return { image: bmp.image, w: bmp.width, h: bmp.height,
			x: Math.round((this.w - bmp.width) / 2), y: Math.round((this.h - bmp.height) / 2) };
	};

	/** A half of a change: `kind` run over the picture's rectangle. */
	function half(pic, kind) {
		var size = Math.max(4, Math.round(Math.min(pic.w, pic.h) / 10));
		return { pic: pic, kind: kind, p: 0, grid: { size: size, cells: cells(kind, pic.w, pic.h, size) } };
	}

	/* The part of the picture the effect has reached, clipped to its rectangle. */
	function clipTo(ctx, hf, p) {
		var pic = hf.pic;
		ctx.beginPath();
		ctx.rect(pic.x, pic.y, pic.w, pic.h);
		ctx.clip();
		ctx.translate(pic.x, pic.y);
		region(ctx, hf.kind, p, pic.w, pic.h, hf.grid);
		ctx.translate(-pic.x, -pic.y);
		ctx.clip('evenodd');
	}

	SlideShow.prototype.step = function (dt, ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!this.art) { return; }
		var list = this.catalog, t = this.trans;
		if (t) {
			var hf = t.out || t['in'];
			hf.p += dt / HALF;
			if (hf.p >= 1) {
				if (t.out) {
					t.out = null;
				} else {
					this.shown = hf.pic;
					this.trans = null;
					this.timer = this.wait;
				}
			}
		} else {
			this.timer -= dt;
			if (this.timer <= 0) {
				this.index = (this.index + 1) % list.length;
				this.trans = {
					out: this.shown ? half(this.shown, variant(this.effect)) : null,
					'in': half(this.place(list[this.index]), variant(this.effect))
				};
				this.shown = null;
			}
		}
		t = this.trans;
		if (t && t.out) {
			/* The old picture going: it stays wherever the effect has not reached. */
			var o = t.out.pic;
			ctx.drawImage(o.image, o.x, o.y);
			ctx.save();
			clipTo(ctx, t.out, Math.min(1, t.out.p));
			ctx.fillRect(o.x, o.y, o.w, o.h);
			ctx.restore();
		} else if (t) {
			var n = t['in'].pic;
			ctx.save();
			clipTo(ctx, t['in'], Math.min(1, t['in'].p));
			ctx.drawImage(n.image, n.x, n.y);
			ctx.restore();
		} else if (this.shown) {
			ctx.drawImage(this.shown.image, this.shown.x, this.shown.y);
		}
	};

	AfterDark.define('after-dark-slideshow', function (el) {
		var sim = new SlideShow();
		var names = FX.concat(EFFECTS);
		sim.effect = names[AfterDark.choice(el, 'effect', names, 'random')];
		sim.wait = WAIT[AfterDark.choice(el, 'delay', DELAYS, '1 min.')];
		sim.slides = SLIDES[AfterDark.choice(el, 'slides', SLIDES, 'bitmaps')];
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
	SlideShow.FX = FX;
}());
