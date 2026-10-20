/**
 * toasters-2.js - Flying Toasters, the original Windows one.
 *
 * Toast2.ad, Bill Stewart's Flying Toasters (c) 1990-92, a 16-bit module
 * that keeps plain DIBs. Its description:
 *
 *   "FLYING TOASTERS (tm). 'I really just walked into the kitchen and said
 *    to myself, "Flying Toasters!" and went back to the office and coded
 *    it.' - Jack Eastman. Original concept by Jack Eastman. Toaster artwork
 *    by Tomoya Ikeda & Igor Gasowski."
 *
 * This is not the Flying Toasters Pro on toasters.html (TOAST3.AD): that one
 * has rendered toasters at four sizes, bacon and cream cheese, and an
 * Objects list. This one has one toaster, four wing positions and a slice of
 * toast, and its own control panel: Flying Things (a slider, 1 to 12), Toast
 * (Light, Medium, Dark) and Color.
 *
 * Artwork, from tools/adclassic.py, named by the module's RESINFO table:
 *   127-130   wing_up, wing_mid, wing_md, wing_dn   the toaster, 256 colours
 *   131-133   lt_toast, md_toast, dk_toast          the toast, 256 colours
 *   144-146   the same toast dithered for 16 colours (not used)
 *   bwing_*, bwmtoast                               the black-and-white set
 *
 * It does not paint under Wine at a usable rate - the one capture has the
 * toasters jumping a few hundred pixels a frame - so that capture only gives
 * the look: 64x64 toasters and toast at 1:1 on the black, about as many
 * slices as toasters, all on one heading of two across to one down. The
 * flying-things default (7, of each) comes from its slider sitting at 51% of
 * 1-12 and matches the count in the capture. Filled in, not from the module:
 *   - the speed (about 80 px/s across, each thing a little faster or slower)
 *     and the flap rate;
 *   - Color off drawing the module's black-and-white bitmaps. Its RESINFO
 *     keys those to 1-3 bit screens; on a colour screen Color only swapped
 *     16-colour palettes, which has nothing to show at 256 colours and up.
 *
 *   <after-dark-toasters-2 art="art/toast2" flying-things="7" toast="medium" color>
 */
(function () {
  'use strict';

  var TOAST = ['light', 'medium', 'dark'];
  var HEADING = { x: -2 / Math.sqrt(5), y: 1 / Math.sqrt(5) };
  var SPEED = 90;                          // px/s along the heading
  var FLAP = 10;                           // wing frames a second
  var CYCLE = [0, 1, 2, 3, 2, 1];          // up, mid, md, dn and back
  var SIZE = 64;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function Toasters2() {
    this.art = null;
    this.count = 7;
    this.shade = 1;
    this.color = true;
    this.things = [];
    this.w = 0;
    this.h = 0;
  }

  Toasters2.prototype.pictures = function () {
    var art = this.art;
    if (this.color) {
      return { wings: ['127', '128', '129', '130'].map(function (n) { return art.bitmap(n); }),
               toast: art.bitmap(['131', '132', '133'][this.shade]) };
    }
    return { wings: ['bwing_up', 'bwingmid', 'bwing_md', 'bwing_dn'].map(function (n) { return art.bitmap(n); }),
             toast: art.bitmap('bwmtoast') };
  };

  /* Things come in off the top and right edges; on a fresh start they are
     scattered over the screen instead, or it takes a while to fill up. */
  Toasters2.prototype.launch = function (toaster, scattered) {
    var t = { toaster: toaster, speed: SPEED * rand(0.8, 1.2), frame: Math.floor(rand(0, CYCLE.length)) };
    for (var tries = 0; tries < 8; tries += 1) {
      if (scattered) {
        t.x = rand(0, this.w); t.y = rand(0, this.h);
      } else if (Math.random() < this.h / (this.h + this.w * 0.5)) {
        t.x = this.w + rand(0, SIZE); t.y = rand(-SIZE, this.h * 0.8);
      } else {
        t.x = rand(this.w * 0.2, this.w + SIZE); t.y = -SIZE - rand(0, SIZE);
      }
      if (!this.crowded(t)) { break; }
    }
    return t;
  };

  Toasters2.prototype.crowded = function (t) {
    return this.things.some(function (o) {
      return o !== t && Math.abs(o.x - t.x) < SIZE && Math.abs(o.y - t.y) < SIZE * 0.8;
    });
  };

  Toasters2.prototype.resize = function (w, h) {
    this.w = w;
    this.h = h;
    this.things = [];
    for (var i = 0; i < this.count * 2; i += 1) {
      this.things.push(this.launch(i % 2 === 0, true));
    }
  };

  Toasters2.prototype.step = function (dt, ctx, w, h) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (!this.art) { return; }
    var pic = this.pictures();
    for (var i = 0; i < this.things.length; i += 1) {
      var t = this.things[i];
      /* A slower thing behind a faster one waits rather than pass through it. */
      var v = t.speed;
      for (var k = 0; k < this.things.length; k += 1) {
        var o = this.things[k];
        if (o === t) { continue; }
        var ax = o.x - t.x, ay = o.y - t.y;
        if (ax < 0 && ax > -SIZE * 0.9 && Math.abs(ay - ax * HEADING.y / HEADING.x) < SIZE * 0.6) {
          v = Math.min(v, o.speed);
        }
      }
      t.x += HEADING.x * v * dt;
      t.y += HEADING.y * v * dt;
      if (t.toaster) { t.frame += FLAP * dt; }
      if (t.x < -SIZE || t.y > h + SIZE / 2) {
        this.things[i] = this.launch(t.toaster, false);
      }
    }
    for (i = 0; i < this.things.length; i += 1) {
      t = this.things[i];
      var bmp = t.toaster ? pic.wings[CYCLE[Math.floor(t.frame) % CYCLE.length]] : pic.toast;
      ctx.drawImage(bmp.image, Math.round(t.x - SIZE / 2), Math.round(t.y - SIZE / 2));
    }
  };

  AfterDark.define('after-dark-toasters-2', function (el) {
    var sim = new Toasters2();
    var n = parseInt(AfterDark.setting(el, 'flying-things'), 10);
    sim.count = isNaN(n) ? 7 : Math.max(1, Math.min(12, n));
    sim.shade = AfterDark.choice(el, 'toast', TOAST, 'medium');
    sim.color = AfterDark.flag(el, 'color');
    AfterDark.load(AfterDark.setting(el, 'art') || 'art/toast2').then(function (art) {
      sim.art = art;
    }).catch(function (err) {
      if (window.console) { console.error(err); }
    });
    return sim;
  });

  window.AfterDarkToasters2 = Toasters2;
}());
