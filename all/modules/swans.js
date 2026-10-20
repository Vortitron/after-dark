/**
 * swans.js - Swan Lake, on the module's own artwork.
 *
 * Swans.ad, 1992. Its own description:
 *
 *   "SWAN LAKE (tm) Swans and their cygnets swim gracefully across your
 *    screen. Try a "Synchronized" swim to impose a little structure on the
 *    proceedings."
 *   Swan artwork by Igor Gasowski. Windows version by Mike Overlin,
 *   SAPIEN Technologies, Inc.
 *
 * The settings are its own, out of TYPE_1000: Speed = Too Slow / Just Right
 * / Too Fast / Absurdly Fast, Num Swans (a slider), and Synchronized Swim.
 *
 * The art is 40 DIBs, in all/art/swans/, every swan facing left:
 *   100       a whole swan side on, 75 x 60
 *   300-307   her neck and head: six ways of holding it, then two raised
 *   400-403   her body, the feathers lifting
 *   200-204   the reflection under a side-on swan, rippling
 *   600-608   her turning to face you, side on to head on
 *   700-707   the reflections of those
 *   500-502   a cygnet, with its own reflection
 * A side-on swan is picture 100 with this moment's neck laid over it at its
 * top left and body 28 across and 23 down, and the reflection right under
 * her, 60 down - which is where the capture of the real thing has them
 * (the parts alone leave a hole where her breast is). The raised necks,
 * 306-307, are not used: where they go was not seen. From the
 * capture, too: on black, swans side on, swimming across and a little
 * down or up the screen at about 80 pixels a second with the control unset,
 * then off the edge; turning round by way of facing you. Inferred: how the
 * neck and feathers are chosen, the cygnets trailing their mother, and what
 * Synchronized does (here: one heading, one pace, in step).
 *
 *   <after-dark-swan-lake art="art/swans" speed="too slow" num-swans="4">
 */
(function () {
  'use strict';

  var SPEEDS = ['too slow', 'just right', 'too fast', 'absurdly fast'];
  var PACE = [80, 140, 260, 520];
  var NECK = [300, 301, 302, 303, 304, 305];
  var BODY = [400, 401, 402, 403];
  var RIPPLE = [200, 201, 202, 203, 204];
  var TURN = [600, 601, 602, 603, 604, 605, 606, 607, 608];
  var CYGNET = [500, 501, 502];

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function SwanLake() {
    this.pace = PACE[0];
    this.count = 4;
    this.sync = false;
    this.art = null;
  }

  SwanLake.prototype.resize = function (w, h) {
    this.w = w;
    this.h = h;
    this.s = Math.max(1, Math.round(Math.min(w, h) / 768));
    this.swans = null;
  };

  SwanLake.prototype.spawn = function (sw, enter) {
    var w = this.w, h = this.h, s = this.s;
    var dir = this.sync ? this.heading : (Math.random() < 0.5 ? 1 : -1);
    sw.dir = dir;
    sw.vy = this.sync ? this.drift : rand(-0.25, 0.25);
    sw.y = rand(30 * s, h - 100 * s);
    sw.x = enter ? (dir > 0 ? -90 * s : w + 10 * s) : rand(0, w - 80 * s);
    sw.neck = 300;
    sw.body = 400;
    sw.ripple = 0;
    sw.t = rand(0, 3);
    sw.turn = -1;
    sw.cygnets = Math.random() < 0.4 ? Math.floor(rand(1, 3.99)) : 0;
  };

  SwanLake.prototype.begin = function () {
    this.heading = Math.random() < 0.5 ? 1 : -1;
    this.drift = rand(-0.25, 0.25);
    this.swans = [];
    for (var i = 0; i < this.count; i += 1) {
      var sw = {};
      this.spawn(sw, false);
      if (this.sync) {
        /* In formation: a line across, in step. */
        sw.x = (this.heading > 0 ? -90 : this.w + 10) * this.s - this.heading * i * 130 * this.s;
        sw.y = this.h * 0.2 + i * Math.min(110 * this.s, (this.h * 0.6) / Math.max(1, this.count - 1));
      }
      this.swans.push(sw);
    }
  };

  SwanLake.prototype.move = function (sw, dt) {
    var s = this.s, w = this.w, h = this.h;
    sw.t += dt;
    /* The reflection ripples; now and then she lifts her feathers or moves
       her head. */
    sw.ripple = Math.floor(sw.t * 6) % RIPPLE.length;
    if (Math.random() < dt * 0.6) { sw.neck = pick(NECK); }
    if (Math.random() < dt * 0.8) { sw.body = pick(BODY); }
    if (sw.turn >= 0) {
      /* Turning: round to face you, then on round the other way. */
      sw.turn += dt * 8;
      var k = Math.floor(sw.turn);
      if (k === TURN.length && !sw.turned) { sw.dir = -sw.dir; sw.turned = true; }
      if (k >= TURN.length * 2 - 1) { sw.turn = -1; sw.turned = false; }
      return;
    }
    sw.x += sw.dir * this.pace * s * dt;
    sw.y += sw.vy * this.pace * s * dt;
    if (sw.y < 10 * s || sw.y > h - 90 * s) { sw.vy = -sw.vy; }
    if (!this.sync && Math.random() < dt * 0.03) { sw.turn = 0; }
    if (sw.dir > 0 ? sw.x > w + 20 * s : sw.x < -110 * s) {
      if (this.sync) {
        if (this.swans.every(function (o) { return o.dir > 0 ? o.x > w : o.x < -100 * s; })) { this.begin(); }
      } else {
        this.spawn(sw, true);
      }
    }
  };

  /** Draw a part at (dx, dy) inside the swan's 75-wide box, mirrored when she faces right. */
  SwanLake.prototype.part = function (ctx, sw, name, dx, dy) {
    var b = this.art.bitmap(name);
    if (!b) { return; }
    var s = this.s, right = sw.dir > 0;
    var x = right ? sw.x + (75 - dx - b.width) * s : sw.x + dx * s;
    var y = sw.y + dy * s;
    if (!right) {
      ctx.drawImage(b.image, Math.round(x), Math.round(y), b.width * s, b.height * s);
      return;
    }
    ctx.save();
    ctx.translate(Math.round(x + b.width * s), Math.round(y));
    ctx.scale(-1, 1);
    ctx.drawImage(b.image, 0, 0, b.width * s, b.height * s);
    ctx.restore();
  };

  SwanLake.prototype.drawSwan = function (ctx, sw) {
    var i, s = this.s;
    for (i = 0; i < sw.cygnets; i += 1) {
      /* Her cygnets paddle along behind her. */
      var c = { x: sw.x - sw.dir * (84 + i * 38) * s, y: sw.y + (20 + (i % 2) * 12) * s, dir: sw.dir };
      this.part(ctx, c, String(CYGNET[Math.floor(sw.t * 3 + i) % CYGNET.length]), 0, 0);
    }
    if (sw.turn >= 0) {
      var k = Math.floor(sw.turn), n = TURN.length;
      var f = k < n ? k : 2 * n - 2 - k;
      var name = String(TURN[Math.max(0, Math.min(n - 1, f))]);
      var b = this.art.bitmap(name);
      var bh = b ? b.height : 60;
      var refl = this.art.bitmap(String(700 + Math.min(7, f)));
      if (refl && f < 8) { this.part(ctx, sw, String(700 + f), 0, bh); }
      this.part(ctx, sw, name, 0, 60 - bh);
      return;
    }
    /* The whole swan, then this moment's body and neck laid over it. */
    this.part(ctx, sw, String(RIPPLE[sw.ripple]), 0, 60);
    this.part(ctx, sw, '100', 0, 0);
    this.part(ctx, sw, String(sw.body), 28, 23);
    this.part(ctx, sw, String(sw.neck), 0, 0);
  };

  SwanLake.prototype.step = function (dt, ctx, w, h) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (!this.art) { return; }
    if (!this.swans) { this.begin(); }
    var i;
    for (i = 0; i < this.swans.length; i += 1) { this.move(this.swans[i], dt); }
    ctx.imageSmoothingEnabled = false;
    var order = this.swans.slice().sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < order.length; i += 1) { this.drawSwan(ctx, order[i]); }
  };

  AfterDark.define('after-dark-swan-lake', function (el) {
    var sim = new SwanLake();
    sim.pace = PACE[AfterDark.choice(el, 'speed', SPEEDS, 'too slow')];
    var n = parseInt(AfterDark.setting(el, 'num-swans'), 10);
    sim.count = Math.max(1, Math.min(10, isNaN(n) ? 4 : n));
    sim.sync = AfterDark.flag(el, 'synchronized-swim');
    AfterDark.load(AfterDark.setting(el, 'art') || 'art/swans').then(function (art) {
      sim.art = art;
    }).catch(function (err) {
      if (window.console) { console.error(err); }
    });
    return sim;
  });

  window.AfterDarkSwanLake = SwanLake;
}());
