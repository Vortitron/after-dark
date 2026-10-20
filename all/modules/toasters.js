/**
 * toasters.js - Flying Toasters Pro, on the module's own artwork.
 *
 * TOAST3.AD, from the 1992 Windows release. Its description resource:
 *
 *   "Flying out of the sun, The smell of toast is in the air. When there's a
 *    job to be done, The Flying Toasters will be there."
 *   "Objects" determines the number of toasters on the screen.
 *   Original concept by Jack Eastman. Art by Jarir Maani.
 *
 * Artwork, from tools/adweb.py. The module draws its depth with four sizes of
 * toaster rather than by scaling one:
 *   6000  87x72  4 frames   toaster, nearest
 *   1000  75x62  9 frames   toaster, flapping
 *   1001  75x74  9 frames   toaster, flapping, banked over
 *   3000  45x36  4 frames   toaster, far off
 *   4000  39x39 26 frames   a slice of toast, tumbling
 *   7000  39x24  3 frames   toast with butter, jam and cream cheese
 *   2000  41x20  7 frames   bacon
 *
 * Everything crosses the screen on the same heading, which is what makes a
 * loose scatter of sprites read as a squadron.
 *
 * Checked against the real module under Wine at 1024x768 (25 s, defaults):
 * seven objects up at once, all heading down-left at 2 across to 1 down, in
 * off the top and right. Measured speeds across the screen: far toasters
 * (3000) 46 px/s, toast (4000, 7000) 90, the flapping toasters (1000) 90-130,
 * the banking one (1001) 170. Toast was the commonest thing in the sky, then
 * far toasters, then the big ones; no 6000, bacon or smoke turned up.
 * The default (37 of 100, which the popup shows as Squadron) and an explicit
 * Squadron both had 7 up. Still inferred: Flight, Air Wing and Swarm (scaled
 * from that by their 25/75/100), and how often 6000 appears.
 *
 *   <after-dark-toasters objects="squadron"></after-dark-toasters>
 */
(function () {
  'use strict';

  // id, how often it turns up, and how fast its wings or its tumble runs.
  // 2000 is in the module but left out here: its seven frames are not one
  // animation, so cycling them just makes the sprite flicker.
  // and its speed across the screen, px/s (a range where the capture showed one)
  var FLEET = [
    { id: 6000, weight: 1, fps: 9, speed: [120, 140] },
    { id: 1000, weight: 4, fps: 12, speed: [90, 130] },
    { id: 1001, weight: 3, fps: 12, speed: [170, 170] },
    { id: 3000, weight: 5, fps: 9, speed: [46, 46] },
    { id: 4000, weight: 4, fps: 14, speed: [90, 90] },
    { id: 7000, weight: 4, fps: 2, speed: [90, 90] }
  ];

  var COUNTS = { flight: 4, squadron: 7, 'air wing': 10, swarm: 14 };
  var DEFAULT_COUNT = COUNTS.squadron;     // the default and Squadron both put up 7
  var HEADING = { x: -1, y: 0.5 };         // down and to the left, in formation

  function rand(a, b) { return a + Math.random() * (b - a); }

  function Toasters(art) {
    this.art = art;
    this.kinds = FLEET.filter(function (k) { return art.sequence(k.id); })
                      .map(function (k) {
                        var s = art.sequence(k.id);
                        return { seq: s, weight: k.weight, fps: k.fps, size: s.width, speed: k.speed };
                      });
    this.pool = [];
    var self = this;
    this.kinds.forEach(function (k) {
      for (var i = 0; i < k.weight; i += 1) { self.pool.push(k); }
    });
    this.count = DEFAULT_COUNT;
    this.objects = [];
  }

  /* Objects come in off the top and right edges, so on a fresh start scatter
     them across the screen instead or it takes a minute to fill up. */
  Toasters.prototype.launch = function (w, h, scattered) {
    var kind = this.pool[Math.floor(Math.random() * this.pool.length)];
    var speed = rand(kind.speed[0], kind.speed[1]);    // across the screen
    var o = {
      kind: kind,
      frame: rand(0, kind.seq.count),
      vx: HEADING.x * speed,
      vy: HEADING.y * speed
    };
    if (scattered) {
      o.x = rand(0, w);
      o.y = rand(0, h);
    } else if (Math.random() < h / (w + h)) {
      o.x = w + kind.size;                       // in from the right
      o.y = rand(-kind.size, h * 0.75);
    } else {
      o.x = rand(0, w + kind.size);              // in from the top
      o.y = -kind.size;
    }
    return o;
  };

  Toasters.prototype.reset = function (w, h) {
    this.objects = [];
    for (var i = 0; i < this.count; i += 1) {
      this.objects.push(this.launch(w, h, true));
    }
    // Draw the near ones last so they pass in front of the far ones.
    this.objects.sort(function (a, b) { return a.kind.size - b.kind.size; });
  };

  Toasters.prototype.step = function (dt, w, h) {
    for (var i = 0; i < this.objects.length; i += 1) {
      var o = this.objects[i];
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.frame += o.kind.fps * dt;
      var margin = o.kind.size + 8;
      if (o.x < -margin || o.y > h + margin) {
        this.objects[i] = this.launch(w, h, false);
      }
    }
  };

  Toasters.prototype.draw = function (ctx, w, h) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < this.objects.length; i += 1) {
      var o = this.objects[i];
      o.kind.seq.draw(ctx, Math.floor(o.frame), o.x, o.y);
    }
  };

  /* ------------------------------------------------------------ element */

  function ToastersElement() { return Reflect.construct(HTMLElement, [], ToastersElement); }
  ToastersElement.prototype = Object.create(HTMLElement.prototype);
  ToastersElement.prototype.constructor = ToastersElement;
  Object.setPrototypeOf(ToastersElement, HTMLElement);

  ToastersElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var base = this.getAttribute('art') || 'art/toast3';
    this.style.display = this.style.display || 'block';
    this.style.background = '#000';

    window.AfterDark.load(base).then(function (art) {
      var sim = new Toasters(art);
      var objects = (AfterDark.setting(self, 'objects') || '').toLowerCase();
      sim.count = COUNTS[objects] || parseInt(objects, 10) || DEFAULT_COUNT;

      var screen = new AfterDark.Screen(self);
      self._screen = screen;
      self.sim = sim;
      screen.onresize = function (w, h) { sim.reset(w, h); };
      sim.reset(screen.width, screen.height);
      screen.run(function (dt, ctx, w, h) {
        sim.step(dt, w, h);
        sim.draw(ctx, w, h);
      });
    }).catch(function (err) {
      self.textContent = err.message;
    });
  };

  ToastersElement.prototype.disconnectedCallback = function () {
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-toasters', ToastersElement);
  window.AfterDarkToasters = Toasters;
}());
