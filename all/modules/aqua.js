/**
 * aqua.js - Aquatic Realm, on the module's own artwork.
 *
 * Aqua.ad, from the 10th anniversary collection. Its description:
 *
 *   "AQUATIC REALM (tm) turns your monitor into a lively undersea environment
 *    featuring many colorful marine creatures. Checking 'Show Sea Floor' makes
 *    this module much more interesting, but a little less of a screen saver."
 *   Original concept from Fish! by Tom & Ed's Bogus Software.
 *   Realistic fish artwork by Tomoya Ikeda and Igor Gasowski.
 *
 * Its settings are Creatures, Seaweed, Show Sea Floor and Sound; the first
 * three are attributes here.
 *
 * Artwork, from tools/adclassic.py. The module ships every creature five times
 * over - 16 colour art, 256 colour art, and three bands of masks. Only the deep
 * pair is exported:
 *   1000-1018   nineteen creatures, 64x64, first frame
 *   1100-1118   the same nineteen, second frame
 *   1900, 900   two sea floors, 192x64, to tile along the bottom
 *
 * Index 0 of each band is seaweed rather than a creature, 1 is a crab and 12
 * is a few bubbles. Everything is drawn facing left and mirrored to swim right.
 *
 * Checked against a capture of the real module (25 s at its defaults,
 * 1024x768): Show Sea Floor is on by default (TYPE_1000 3, default word 1),
 * the floor is the 192x64 strip tiled along the bottom, the seaweed stands
 * with its foot in the top of it (bitmap centre ~60 px up), the crabs walk
 * along the top of the floor rather than swimming, and the bubbles rise
 * straight up on their own. About a dozen creatures are about at the default
 * Creatures (25 on a 1-100 slider); the 4.0-era sizes are the bitmaps' own.
 * Under Wine the module runs unthrottled - fish cross the screen in a couple
 * of seconds - so the speeds here are still a guess, as is the slider scale.
 *
 *   <after-dark-aqua creatures="14" seaweed="6" sea-floor></after-dark-aqua>
 */
(function () {
  'use strict';

  var FRAME_A = 1000, FRAME_B = 1100, SPAN = 19;
  var SEAWEED = 0;                     // index 0 of a band is the plant
  var CRAB = 1;                        // walks the floor
  var BUBBLES = 12;                    // rise
  var FLOOR = ['1900', '900'];
  var SWIM = 2.2;                      // frames per second of tail flick

  function rand(a, b) { return a + Math.random() * (b - a); }

  function Aqua(art) {
    this.art = art;
    this.creatures = [];
    var i, a, b;
    for (i = 0; i < SPAN; i += 1) {
      a = art.bitmap(String(FRAME_A + i));
      b = art.bitmap(String(FRAME_B + i)) || a;
      if (a && i !== SEAWEED) { this.creatures.push([a, b, i]); }
    }
    this.weed = [art.bitmap(String(FRAME_A + SEAWEED)),
                 art.bitmap(String(FRAME_B + SEAWEED))];
    this.floor = null;
    for (i = 0; i < FLOOR.length && !this.floor; i += 1) {
      this.floor = art.bitmap(FLOOR[i]);
    }
    this.count = 12;
    this.weeds = 5;
    this.showFloor = true;
    this.fish = [];
    this.plants = [];
  }

  Aqua.prototype.floorHeight = function () {
    return this.showFloor && this.floor ? this.floor.height : 0;
  };

  /** Where things stand on the bottom: the seaweed's and the crabs' centre. */
  Aqua.prototype.ground = function (h) {
    return h - this.floorHeight() * 0.45 - 32;
  };

  Aqua.prototype.spawn = function (w, h, anywhere) {
    var pair = this.creatures[Math.floor(Math.random() * this.creatures.length)];
    var right = Math.random() < 0.5;
    var speed = rand(14, 46);
    var deep = h - this.floorHeight();
    var f = {
      art: pair,
      right: right,
      vx: right ? speed : -speed,
      x: anywhere ? rand(0, w) : (right ? -pair[0].width : w + pair[0].width),
      y: rand(pair[0].height * 0.6, Math.max(pair[0].height * 0.7, deep - 10)),
      drift: rand(-6, 6),
      frame: rand(0, 2)
    };
    if (pair[2] === CRAB) {
      // Along the top of the floor, sideways and slowly.
      f.vx = right ? rand(8, 20) : -rand(8, 20);
      f.y = this.ground(h) + 4;
      f.drift = 0;
    } else if (pair[2] === BUBBLES) {
      // Up from the bottom, straight.
      f.vx = 0;
      f.x = rand(0, w);
      f.y = anywhere ? rand(0, deep) : deep;
      f.drift = -rand(30, 60);
      f.rises = true;
    }
    return f;
  };

  Aqua.prototype.reset = function (w, h) {
    var i;
    this.fish = [];
    for (i = 0; i < this.count; i += 1) { this.fish.push(this.spawn(w, h, true)); }

    // Seaweed is rooted on the bottom and only sways, so it is placed once.
    this.plants = [];
    if (this.weed[0]) {
      for (i = 0; i < this.weeds; i += 1) {
        this.plants.push({
          x: rand(0, w),
          y: this.ground(h),
          phase: rand(0, 2)
        });
      }
    }
  };

  Aqua.prototype.step = function (dt, w, h) {
    for (var i = 0; i < this.fish.length; i += 1) {
      var f = this.fish[i];
      f.x += f.vx * dt;
      f.y += f.drift * dt;
      f.frame += SWIM * dt;

      if (f.rises) {
        f.x += Math.sin(f.frame * 2) * 6 * dt;
        if (f.y < -f.art[0].height) { this.fish[i] = this.spawn(w, h, false); }
        continue;
      }
      var top = f.art[0].height * 0.6;
      var floor = h - this.floorHeight() - 10;
      if (f.drift && (f.y < top || f.y > floor)) { f.drift = -f.drift; }

      var edge = f.art[0].width;
      if ((f.right && f.x > w + edge) || (!f.right && f.x < -edge)) {
        this.fish[i] = this.spawn(w, h, false);
      }
    }
    for (i = 0; i < this.plants.length; i += 1) {
      this.plants[i].phase += dt * 0.7;
    }
  };

  Aqua.prototype.draw = function (ctx, w, h) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    var i, x;
    if (this.showFloor && this.floor) {
      for (x = 0; x < w; x += this.floor.width) {
        this.floor.draw(ctx, x + this.floor.width / 2, h - this.floor.height / 2);
      }
    }
    for (i = 0; i < this.plants.length; i += 1) {
      var p = this.plants[i];
      this.weed[Math.floor(p.phase) % 2 ? 1 : 0].draw(ctx, p.x, p.y);
    }
    for (i = 0; i < this.fish.length; i += 1) {
      var f = this.fish[i];
      f.art[Math.floor(f.frame) % 2].draw(ctx, f.x, f.y, f.right);
    }
  };

  /* ------------------------------------------------------------ element */

  function AquaElement() { return Reflect.construct(HTMLElement, [], AquaElement); }
  AquaElement.prototype = Object.create(HTMLElement.prototype);
  AquaElement.prototype.constructor = AquaElement;
  Object.setPrototypeOf(AquaElement, HTMLElement);

  AquaElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var base = this.getAttribute('art') || 'art/aqua';
    this.style.display = this.style.display || 'block';
    this.style.background = '#000';

    window.AfterDark.load(base).then(function (art) {
      var sim = new Aqua(art);
      sim.count = parseInt(AfterDark.setting(self, 'creatures'), 10) || sim.count;
      var weeds = AfterDark.setting(self, 'seaweed');
      if (weeds !== null) { sim.weeds = parseInt(weeds, 10) || 0; }
      // On unless the page or URL says sea-floor="no": the module's default.
      sim.showFloor = AfterDark.setting(self, 'sea-floor') === null || AfterDark.flag(self, 'sea-floor');

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

  AquaElement.prototype.disconnectedCallback = function () {
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-aqua', AquaElement);
  window.AfterDarkAqua = Aqua;
}());
