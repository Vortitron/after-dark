/**
 * ad.js - plays artwork ripped straight out of the original After Dark modules.
 *
 * The modules store their art two different ways and there is a tool for each.
 * tools/adweb.py unpacks the RLE animation in a 4.0 module into numbered PNG
 * strips; tools/adclassic.py unpacks the plain DIBs in a 3.x one into named
 * PNGs. Both write art/<module>/index.json, and this reads either:
 *
 *   AfterDark.load('art/marbles').then(function (art) {
 *     art.sequence(8000).draw(ctx, frameIndex, x, y);     // 4.0, animated
 *   });
 *
 *   AfterDark.load('art/marbles2').then(function (art) {
 *     art.bitmap('marbles').drawCell(ctx, 3, 16, x, y);   // 3.x, a still strip
 *   });
 *
 * Everything a particular screensaver actually *does* lives under modules/.
 */
(function (global) {
  'use strict';

  function Sequence(id, meta, image) {
    this.id = id;
    this.image = image;
    this.frames = meta.frames;
    this.count = meta.count;
    this.width = meta.w;
    this.height = meta.h;
  }

  /* Frames carry their own tight bounding box, so centre each one on the
     sequence's nominal size rather than assuming they all match.
     `opts` is for the modules whose creatures are drawn facing one way and
     turned round for the other, or set back in a tank: {flipX, flipY, scale}. */
  Sequence.prototype.draw = function (ctx, index, cx, cy, opts) {
    var f = this.frames[((index % this.count) + this.count) % this.count];
    var o = opts || {};
    var s = o.scale || 1;
    var w = f.w * s, h = f.h * s;
    if (!o.flipX && !o.flipY && s === 1) {
      ctx.drawImage(this.image, f.x, f.y, f.w, f.h,
                    Math.round(cx - f.w / 2), Math.round(cy - f.h / 2), f.w, f.h);
      return;
    }
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    ctx.scale(o.flipX ? -1 : 1, o.flipY ? -1 : 1);
    ctx.drawImage(this.image, f.x, f.y, f.w, f.h,
                  Math.round(-w / 2), Math.round(-h / 2), w, h);
    ctx.restore();
  };

  /** As draw(), but turned to `angle` radians - for the top-down creatures. */
  Sequence.prototype.drawTurned = function (ctx, index, cx, cy, angle, scale) {
    var f = this.frames[((index % this.count) + this.count) % this.count];
    var s = scale || 1;
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    ctx.rotate(angle);
    ctx.drawImage(this.image, f.x, f.y, f.w, f.h,
                  Math.round(-f.w * s / 2), Math.round(-f.h * s / 2), f.w * s, f.h * s);
    ctx.restore();
  };

  /* A 3.x module's artwork is a single unanimated DIB. Some are one picture,
     some are a horizontal strip of equal cells - the ten marbles live in one
     160x16 bitmap - so drawing takes an optional cell width. */
  function Bitmap(name, meta, image) {
    this.name = name;
    this.image = image;
    this.width = meta.w;
    this.height = meta.h;
  }

  /* Several modules draw their creatures facing one way only and mirror them
     for the other, so drawing takes an optional flip. */
  Bitmap.prototype.draw = function (ctx, cx, cy, flip) {
    var x = Math.round(cx - this.width / 2);
    var y = Math.round(cy - this.height / 2);
    if (!flip) {
      ctx.drawImage(this.image, x, y);
      return;
    }
    ctx.save();
    ctx.translate(Math.round(cx), 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.image, Math.round(-this.width / 2), y);
    ctx.restore();
  };

  Bitmap.prototype.cells = function (cellW) {
    return Math.max(1, Math.floor(this.width / cellW));
  };

  Bitmap.prototype.drawCell = function (ctx, index, cellW, cx, cy) {
    var n = this.cells(cellW);
    var i = ((index % n) + n) % n;
    ctx.drawImage(this.image, i * cellW, 0, cellW, this.height,
                  Math.round(cx - cellW / 2), Math.round(cy - this.height / 2),
                  cellW, this.height);
  };

  function Art(base, manifest, images) {
    this.base = base;
    this.module = manifest.module;
    this.format = manifest.format || 'rle';
    this.sequences = {};
    this.bitmaps = {};
    var name;
    for (name in manifest.sequences || {}) {
      this.sequences[name] = new Sequence(name, manifest.sequences[name], images[name]);
    }
    for (name in manifest.bitmaps || {}) {
      this.bitmaps[name] = new Bitmap(name, manifest.bitmaps[name], images[name]);
    }
  }

  Art.prototype.sequence = function (id) {
    return this.sequences[String(id)] || null;
  };

  Art.prototype.bitmap = function (name) {
    return this.bitmaps[String(name)] || null;
  };

  /** Sequence ids in a range, e.g. ids(8000, 8009) for the ten marble types. */
  Art.prototype.ids = function (from, to) {
    var out = [];
    for (var id in this.sequences) {
      var n = Number(id);
      if (n >= from && n <= to) { out.push(n); }
    }
    return out.sort(function (a, b) { return a - b; });
  };

  /**
   * A module's setting, which is an attribute on the element unless the page
   * URL says otherwise: all/marbles.html?pins=lots&speed=fast. That is how the
   * front page's Settings dialog gets a choice into a saver running in an
   * iframe, and it means every saver page is linkable with its options set.
   * Returns null if neither has it, and '' for a bare ?sea-floor.
   */
  function setting(el, name) {
    var search = (global.location && global.location.search) || '';
    if (search) {
      var parts = search.slice(1).split('&');
      for (var i = 0; i < parts.length; i += 1) {
        var eq = parts[i].indexOf('=');
        var key = eq < 0 ? parts[i] : parts[i].slice(0, eq);
        if (decodeURIComponent(key) === name) {
          return eq < 0 ? '' : decodeURIComponent(parts[i].slice(eq + 1).replace(/\+/g, ' '));
        }
      }
    }
    return el.getAttribute(name);
  }

  /** As setting(), for the options that are on-or-off rather than a value. */
  function flag(el, name) {
    var v = setting(el, name);
    return v !== null && v !== 'no' && v !== 'off' && v !== 'false';
  }

  /** Cache-bust a URL from ?v= on the page, or window.AFTER_DARK_BUILD.v. */
  function buildId() {
    var search = (global.location && global.location.search) || '';
    if (search) {
      var parts = search.slice(1).split('&');
      for (var i = 0; i < parts.length; i += 1) {
        var eq = parts[i].indexOf('=');
        var key = eq < 0 ? parts[i] : parts[i].slice(0, eq);
        if (decodeURIComponent(key) === 'v') {
          return eq < 0 ? '' : decodeURIComponent(parts[i].slice(eq + 1));
        }
      }
    }
    var b = global.AFTER_DARK_BUILD;
    return (b && (b.v || b.rev)) || '';
  }

  function bust(url) {
    var v = buildId();
    if (!v || !url) { return url; }
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(v);
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error('could not load ' + src)); };
      im.src = bust(src);
    });
  }

  function load(base) {
    base = base.replace(/\/$/, '');
    return fetch(bust(base + '/index.json'), { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) { throw new Error('no manifest at ' + base); }
      return r.json();
    }).then(function (manifest) {
      var images = {};
      var jobs = [];
      function queue(parts) {
        Object.keys(parts || {}).forEach(function (id) {
          jobs.push(loadImage(base + '/' + (parts[id].file || id + '.png')).then(function (im) {
            images[id] = im;
          }));
        });
      }
      queue(manifest.sequences);
      queue(manifest.bitmaps);
      return Promise.all(jobs).then(function () {
        return new Art(base, manifest, images);
      });
    });
  }

  /**
   * Canvas that fills its host element, keeps up with device pixel ratio and
   * calls back once per frame with the elapsed seconds.
   */
  function Screen(host) {
    this.host = host;
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.width = 0;
    this.height = 0;
    this._raf = 0;
    this.resize();

    var self = this;
    this._onResize = function () { self.resize(); };
    global.addEventListener('resize', this._onResize);
  }

  Screen.prototype.resize = function () {
    var dpr = global.devicePixelRatio || 1;
    var w = this.host.clientWidth;
    var h = this.host.clientHeight;
    if (!w || !h) {
      var r = this.host.getBoundingClientRect();
      w = Math.round(r.width);
      h = Math.round(r.height);
    }
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    if (this.onresize) { this.onresize(this.width, this.height); }
  };

  Screen.prototype.run = function (step) {
    var self = this;
    var last = 0;
    function tick(now) {
      var dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      step(dt, self.ctx, self.width, self.height);
      self._raf = global.requestAnimationFrame(tick);
    }
    this._raf = global.requestAnimationFrame(tick);
  };

  Screen.prototype.stop = function () {
    if (this._raf) { global.cancelAnimationFrame(this._raf); this._raf = 0; }
    global.removeEventListener('resize', this._onResize);
  };

  /**
   * Which of `values` a list setting names, as an index into it. Anything
   * unrecognised - or nothing at all - is `fallback`, which is a value too.
   */
  function choice(el, name, values, fallback) {
    var v = setting(el, name);
    var i = v === null ? -1 : values.indexOf(String(v).toLowerCase().trim());
    return i >= 0 ? i : Math.max(0, values.indexOf(fallback));
  }

  /**
   * Registers <tag> for a saver that draws itself in code. `setup(el)` reads
   * the element's settings and returns {step(dt, ctx, w, h), resize(w, h)};
   * this does the rest: the canvas, the frame loop, stopping when removed.
   * The older modules spell all of that out for themselves.
   */
  function define(tag, setup) {
    function El() { return Reflect.construct(HTMLElement, [], El); }
    El.prototype = Object.create(HTMLElement.prototype);
    El.prototype.constructor = El;
    Object.setPrototypeOf(El, HTMLElement);

    El.prototype.connectedCallback = function () {
      if (this._screen) { return; }
      this.style.display = this.style.display || 'block';
      this.style.background = this.style.background || '#000';
      var saver = setup(this);
      var screen = new Screen(this);
      this._screen = screen;
      this.saver = saver;
      if (saver.resize) {
        screen.onresize = function (w, h) { saver.resize(w, h); };
        saver.resize(screen.width, screen.height);
      }
      screen.run(function (dt, ctx, w, h) { saver.step(dt, ctx, w, h); });
    };

    El.prototype.disconnectedCallback = function () {
      if (this._screen) { this._screen.stop(); this._screen = null; }
    };

    customElements.define(tag, El);
    return El;
  }

  /* ------------------------------------------------------------ desktop ---
     Spotlight, Punch Out, Puzzle and Can of Worms all start from "your
     desktop" - they shine a light on it, punch it out, shuffle it and eat
     it. A page cannot read the pixels of whatever is behind it, so this
     paints one: Windows 95, the one these ran on, with the stock icons,
     a couple of windows open and the taskbar. Returns a canvas w x h. */

  var UI = '11px "MS Sans Serif", "Microsoft Sans Serif", Tahoma, Arial, sans-serif';
  var UI_BOLD = 'bold ' + UI;

  function bevel(g, x, y, w, h, raised) {
    g.fillStyle = '#c0c0c0';
    g.fillRect(x, y, w, h);
    g.fillStyle = raised ? '#fff' : '#808080';
    g.fillRect(x, y, w - 1, 1);
    g.fillRect(x, y, 1, h - 1);
    g.fillStyle = raised ? '#000' : '#fff';
    g.fillRect(x, y + h - 1, w, 1);
    g.fillRect(x + w - 1, y, 1, h);
    g.fillStyle = raised ? '#808080' : '#c0c0c0';
    g.fillRect(x + 1, y + h - 2, w - 2, 1);
    g.fillRect(x + w - 2, y + 1, 1, h - 2);
  }

  /* The stock icons, drawn at 32x32 from rectangles. */
  var ICONS = {
    computer: function (g, x, y) {
      g.fillStyle = '#c0c0c0'; g.fillRect(x + 4, y + 2, 24, 19);
      g.fillStyle = '#000'; g.fillRect(x + 4, y + 20, 24, 1); g.fillRect(x + 27, y + 2, 1, 19);
      g.fillStyle = '#008080'; g.fillRect(x + 7, y + 5, 18, 12);
      g.fillStyle = '#c0c0c0'; g.fillRect(x + 12, y + 21, 8, 3);
      g.fillStyle = '#c0c0c0'; g.fillRect(x + 2, y + 24, 28, 6);
      g.fillStyle = '#000'; g.fillRect(x + 2, y + 29, 28, 1);
      g.fillStyle = '#808080'; g.fillRect(x + 20, y + 26, 7, 1);
    },
    network: function (g, x, y) {
      [[2, 12], [18, 12], [10, 0]].forEach(function (p) {
        var px = x + p[0], py = y + p[1];
        g.fillStyle = '#c0c0c0'; g.fillRect(px, py + 2, 12, 10);
        g.fillStyle = '#000080'; g.fillRect(px + 2, py + 4, 8, 6);
        g.fillStyle = '#808080'; g.fillRect(px, py + 13, 12, 3);
      });
      g.fillStyle = '#000';
      g.fillRect(x + 8, y + 30, 16, 1); g.fillRect(x + 16, y + 16, 1, 14);
    },
    bin: function (g, x, y) {
      g.fillStyle = '#c0c0c0'; g.fillRect(x + 8, y + 6, 16, 24);
      g.fillStyle = '#808080'; g.fillRect(x + 6, y + 4, 20, 3);
      for (var i = 0; i < 4; i += 1) { g.fillRect(x + 10 + i * 4, y + 9, 1, 19); }
      g.fillStyle = '#000'; g.fillRect(x + 8, y + 30, 16, 1);
    },
    inbox: function (g, x, y) {
      g.fillStyle = '#ffff80'; g.fillRect(x + 6, y + 6, 20, 13);
      g.fillStyle = '#808000'; g.fillRect(x + 6, y + 6, 20, 1);
      g.fillStyle = '#000080'; g.fillRect(x + 2, y + 18, 28, 10);
      g.fillStyle = '#4040c0'; g.fillRect(x + 4, y + 20, 24, 6);
    },
    briefcase: function (g, x, y) {
      g.fillStyle = '#804000'; g.fillRect(x + 3, y + 10, 26, 18);
      g.fillStyle = '#c08040'; g.fillRect(x + 4, y + 11, 24, 3);
      g.fillStyle = '#402000'; g.fillRect(x + 11, y + 5, 10, 2); g.fillRect(x + 11, y + 5, 2, 5); g.fillRect(x + 19, y + 5, 2, 5);
      g.fillStyle = '#ffff00'; g.fillRect(x + 14, y + 17, 4, 3);
    },
    folder: function (g, x, y) {
      g.fillStyle = '#c0c000'; g.fillRect(x + 3, y + 8, 12, 4);
      g.fillStyle = '#ffff80'; g.fillRect(x + 3, y + 11, 26, 17);
      g.fillStyle = '#808000'; g.fillRect(x + 3, y + 27, 26, 1); g.fillRect(x + 28, y + 11, 1, 17);
    },
    drive: function (g, x, y) {
      g.fillStyle = '#c0c0c0'; g.fillRect(x + 2, y + 12, 28, 12);
      g.fillStyle = '#808080'; g.fillRect(x + 2, y + 23, 28, 1); g.fillRect(x + 29, y + 12, 1, 12);
      g.fillStyle = '#00ff00'; g.fillRect(x + 24, y + 19, 3, 2);
    },
    floppy: function (g, x, y) {
      g.fillStyle = '#000'; g.fillRect(x + 6, y + 4, 20, 22);
      g.fillStyle = '#c0c0c0'; g.fillRect(x + 11, y + 4, 10, 8);
      g.fillStyle = '#fff'; g.fillRect(x + 9, y + 15, 14, 9);
    },
    printer: function (g, x, y) {
      g.fillStyle = '#fff'; g.fillRect(x + 9, y + 3, 14, 10);
      g.fillStyle = '#c0c0c0'; g.fillRect(x + 3, y + 13, 26, 10);
      g.fillStyle = '#808080'; g.fillRect(x + 3, y + 22, 26, 2);
      g.fillStyle = '#fff'; g.fillRect(x + 8, y + 24, 16, 4);
    }
  };

  function label(g, text, cx, y, colour, back) {
    g.font = UI;
    g.textBaseline = 'top';
    var w = Math.ceil(g.measureText(text).width) + 4;
    if (back) { g.fillStyle = back; g.fillRect(Math.round(cx - w / 2), y, w, 13); }
    g.fillStyle = colour;
    g.textAlign = 'center';
    g.fillText(text, Math.round(cx), y + 1);
    g.textAlign = 'left';
  }

  function menu(g, items, x, y) {
    g.font = UI; g.fillStyle = '#000'; g.textBaseline = 'top';
    items.forEach(function (m) { g.fillText(m, x, y); x += Math.ceil(g.measureText(m).width) + 14; });
  }

  function window95(g, x, y, w, h, title, active) {
    bevel(g, x, y, w, h, true);
    var bar = g.createLinearGradient(x, 0, x + w, 0);
    bar.addColorStop(0, active ? '#000080' : '#808080');
    bar.addColorStop(1, active ? '#1084d0' : '#c0c0c0');
    g.fillStyle = bar;
    g.fillRect(x + 3, y + 3, w - 6, 18);
    g.font = UI_BOLD;
    g.textBaseline = 'top';
    g.fillStyle = active ? '#fff' : '#c0c0c0';
    g.fillText(title, x + 7, y + 6);
    for (var i = 0; i < 3; i += 1) {
      var bx = x + w - 55 + i * 16 + (i === 2 ? 2 : 0);
      bevel(g, bx, y + 5, 16, 14, true);
      g.fillStyle = '#000';
      if (i === 0) { g.fillRect(bx + 4, y + 14, 6, 2); }
      if (i === 1) { g.fillRect(bx + 3, y + 7, 9, 2); g.fillRect(bx + 3, y + 7, 1, 8); g.fillRect(bx + 11, y + 7, 1, 8); g.fillRect(bx + 3, y + 15, 9, 1); }
      if (i === 2) {
        for (var k = 0; k < 7; k += 1) {
          g.fillRect(bx + 4 + k, y + 8 + k, 2, 1);
          g.fillRect(bx + 10 - k, y + 8 + k, 2, 1);
        }
      }
    }
  }

  function desktop(w, h, when) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    var g = c.getContext('2d');
    g.fillStyle = '#008080';
    g.fillRect(0, 0, c.width, c.height);

    var bar = 28;
    var icons = [['computer', 'My Computer'], ['network', 'Network Neighborhood'],
                 ['inbox', 'Inbox'], ['bin', 'Recycle Bin'], ['briefcase', 'My Briefcase'],
                 ['folder', 'Letters']];
    icons.forEach(function (ic, i) {
      var y = 10 + i * 70;
      if (y + 50 > c.height - bar) { return; }
      ICONS[ic[0]](g, 22, y);
      label(g, ic[1].length > 12 ? ic[1].split(' ')[0] : ic[1], 38, y + 36, '#fff', '#008080');
      if (ic[1].length > 12) { label(g, ic[1].split(' ').slice(1).join(' '), 38, y + 49, '#fff', '#008080'); }
    });

    /* My Computer, behind. */
    var mx = Math.round(c.width * 0.46), my = Math.round(c.height * 0.08);
    var mw = Math.min(360, Math.round(c.width * 0.48)), mh = Math.min(230, Math.round(c.height * 0.42));
    if (mw > 160 && mh > 120) {
      window95(g, mx, my, mw, mh, 'My Computer', false);
      menu(g, ['File', 'Edit', 'View', 'Help'], mx + 9, my + 26);
      g.fillStyle = '#fff'; g.fillRect(mx + 4, my + 42, mw - 8, mh - 66);
      g.fillStyle = '#808080'; g.fillRect(mx + 4, my + 42, mw - 8, 1); g.fillRect(mx + 4, my + 42, 1, mh - 66);
      var items = [['floppy', '3\u00bd Floppy (A:)'], ['drive', '(C:)'], ['drive', 'Cd (D:)'],
                   ['folder', 'Control Panel'], ['printer', 'Printers'], ['folder', 'Dial-Up']];
      items.forEach(function (it, i) {
        var col = i % 4, row = Math.floor(i / 4);
        var ix = mx + 14 + col * 82, iy = my + 50 + row * 70;
        if (ix + 70 > mx + mw || iy + 50 > my + mh - 24) { return; }
        ICONS[it[0]](g, ix + 20, iy);
        label(g, it[1], ix + 36, iy + 36, '#000', null);
      });
      bevel(g, mx + 4, my + mh - 22, mw - 8, 18, false);
      g.font = UI; g.fillStyle = '#000'; g.fillText('6 object(s)', mx + 9, my + mh - 18);
    }

    /* Notepad, in front. */
    var nx = Math.round(c.width * 0.2), ny = Math.round(c.height * 0.3);
    var nw = Math.min(400, Math.round(c.width * 0.5)), nh = Math.min(260, Math.round(c.height * 0.5));
    if (nw > 140 && nh > 100) {
      window95(g, nx, ny, nw, nh, 'LETTER.TXT - Notepad', true);
      menu(g, ['File', 'Edit', 'Search', 'Help'], nx + 9, ny + 26);
      g.fillStyle = '#fff'; g.fillRect(nx + 4, ny + 42, nw - 8, nh - 46);
      g.fillStyle = '#808080'; g.fillRect(nx + 4, ny + 42, nw - 8, 1); g.fillRect(nx + 4, ny + 42, 1, nh - 46);
      g.save();
      g.beginPath(); g.rect(nx + 6, ny + 44, nw - 12, nh - 50); g.clip();
      g.font = '13px "Fixedsys", "Courier New", monospace';
      g.fillStyle = '#000';
      ['Dear Mom,', '', 'The new computer is great. It has a', 'screen saver with flying toasters and',
       'I have not done any work since Tuesday.', '', 'Please send cookies.', '', 'Love,', 'Me']
        .forEach(function (line, i) { g.fillText(line, nx + 8, ny + 48 + i * 15); });
      g.restore();
    }

    /* The taskbar. */
    var ty = c.height - bar;
    g.fillStyle = '#c0c0c0'; g.fillRect(0, ty, c.width, bar);
    g.fillStyle = '#fff'; g.fillRect(0, ty + 1, c.width, 1);
    bevel(g, 2, ty + 4, 54, 22, true);
    [['#ff0000', 0, 0], ['#00ff00', 5, 0], ['#0000ff', 0, 5], ['#ffff00', 5, 5]].forEach(function (q) {
      g.fillStyle = q[0]; g.fillRect(8 + q[1], ty + 9 + q[2], 4, 4);
    });
    g.font = UI_BOLD; g.fillStyle = '#000'; g.textBaseline = 'top';
    g.fillText('Start', 21, ty + 9);
    [['My Computer', false], ['LETTER.TXT - Notepad', true]].forEach(function (t, i) {
      var bx = 62 + i * 150;
      if (bx + 144 > c.width - 70) { return; }
      bevel(g, bx, ty + 4, 144, 22, !t[1]);
      g.font = t[1] ? UI_BOLD : UI; g.fillStyle = '#000';
      g.fillText(t[0], bx + 8, ty + 9);
    });
    bevel(g, c.width - 66, ty + 4, 63, 22, false);
    var d = when || new Date();
    var hr = d.getHours() % 12 || 12, mn = d.getMinutes();
    g.font = UI; g.fillStyle = '#000';
    g.fillText(hr + ':' + (mn < 10 ? '0' : '') + mn + (d.getHours() < 12 ? ' AM' : ' PM'), c.width - 56, ty + 9);
    return c;
  }

  global.AfterDark = {
    load: load, Screen: Screen, Sequence: Sequence, Bitmap: Bitmap,
    setting: setting, flag: flag, bust: bust, buildId: buildId,
    choice: choice, define: define, desktop: desktop
  };
}(window));
