#!/usr/bin/env node
/**
 * Unit tests for the savers that can run without a browser canvas.
 *
 *   node tools/test-savers.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var root = path.resolve(__dirname, '..');

function stubDom() {
	function HTMLElement() {}
	global.HTMLElement = HTMLElement;
	global.Reflect = Reflect;
	global.customElements = { define: function () {} };
	global.window = global;
	global.document = {
		createElement: function () {
			return {
				getContext: function () { return null; },
				width: 0,
				height: 0
			};
		}
	};
	global.AfterDark = {
		setting: function () { return null; },
		flag: function () { return false; },
		Screen: function () {},
		choice: function () { return 0; },
		define: function () {},
		desktop: function () { return null; },
		load: function () { return Promise.reject(new Error('no art in tests')); }
	};
}

function loadModule(name) {
	var src = fs.readFileSync(path.join(root, 'all/modules', name + '.js'), 'utf8');
	eval(src);
}

function testGravity() {
	loadModule('gravity');
	var Gravity = global.AfterDarkGravity;
	assert.strictEqual(Gravity.MIN_BALLS, 1);
	assert.strictEqual(Gravity.MAX_BALLS, 7);
	assert.strictEqual(Gravity.SIZES.medium, 18);

	var a = { x: 0, y: 0, radius: 10, mass: 100 };
	var b = { x: 40, y: 0, radius: 10, mass: 100 };
	var force = Gravity.pull(a, b);
	assert.ok(force.x > 0, 'A is pulled toward B (positive x)');
	assert.ok(Math.abs(force.y) < 1e-9, 'no vertical pull when they share y');

	var sim = new Gravity();
	sim.count = 3;
	sim.reset(320, 240);
	assert.strictEqual(sim.balls.length, 3);
	var before = sim.balls.map(function (ball) {
		return { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy };
	});
	sim.step(0.016, 320, 240);
	var moved = sim.balls.some(function (ball, i) {
		return ball.x !== before[i].x || ball.y !== before[i].y ||
			ball.vx !== before[i].vx || ball.vy !== before[i].vy;
	});
	assert.ok(moved, 'a step changes position or velocity');
}

function testSnake() {
	loadModule('snake');
	var Snake = global.AfterDarkSnake;
	var maze = Snake.generateMaze(8, 6);
	assert.strictEqual(maze.cols, 8);
	assert.strictEqual(maze.rows, 6);
	assert.strictEqual(maze.grid.length, 6);
	assert.strictEqual(maze.grid[0].length, 8);

	var path = Snake.solveMaze(maze);
	assert.ok(path.length >= 2, 'there is a path');
	assert.strictEqual(path[0].x, 0);
	assert.strictEqual(path[0].y, 0);
	assert.strictEqual(path[path.length - 1].x, 7);
	assert.strictEqual(path[path.length - 1].y, 5);

	var sim = new Snake();
	sim.complexity = { cols: 10, rows: 8 };
	sim.rebuild(400, 300);
	assert.ok(sim.maze);
	assert.ok(sim.path.length >= 2);
	var along = sim.along;
	sim.step(1, 400, 300);
	assert.ok(sim.along > along, 'the snake advances');
}

function testZot() {
	loadModule('zot');
	var Zot = global.AfterDarkZot;
	var straight = Zot.displace([{ x: 0, y: 0 }, { x: 0, y: 100 }], 0, 3);
	assert.ok(straight.length >= 2);
	assert.strictEqual(straight[0].x, 0);
	assert.strictEqual(straight[straight.length - 1].y, 100);

	var bolts = Zot.strike(320, 240, 3, 0.3);
	assert.ok(bolts.length >= 1, 'at least the main bolt');
	assert.ok(bolts[0].length >= 2, 'the main bolt has points');
	assert.ok(bolts.length >= 2, 'forky strike grows side bolts');

	var sim = new Zot();
	sim.gap = 10;
	sim.wait = 0;
	sim.step(0.016, 320, 240);
	assert.ok(sim.bolts.length >= 1, 'a due strike fires');
	assert.ok(sim.flash > 0, 'the screen flashes');
}

function stubSeq() {
	return {
		width: 40,
		height: 40,
		count: 1,
		frames: [{ x: 0, y: 0, w: 40, h: 40 }],
		draw: function () {}
	};
}

function stubArt() {
	var seq = stubSeq();
	return {
		sequence: function () { return seq; },
		bitmap: function () { return null; }
	};
}

function testTables() {
	loadModule('bogglins');
	var Bogglins = global.AfterDarkBogglins;
	assert.ok(Bogglins.EXPLOSIVITY.volatile > Bogglins.EXPLOSIVITY.unstable);
	assert.ok(Bogglins.TWANG.sharp.height > Bogglins.TWANG.mild.height);

	loadModule('om');
	var Om = global.AfterDarkOm;
	assert.strictEqual(Om.ENTITIES.some, 6);
	assert.strictEqual(Om.DEFROST.never, 0);
	assert.strictEqual(Om.KARMA.complete, 1);
	assert.ok(Om.ENERGY['5000 kwh'] > Om.ENERGY['1000 kwh']);
}

function testFishWorld() {
	loadModule('fish-world');
	var FishWorld = global.AfterDarkFishWorld;
	assert.strictEqual(FishWorld.SPECIES.length, 9);
	var names = FishWorld.SPECIES.map(function (s) { return s.name; });
	assert.ok(names.indexOf('Blue Bird Wrasse') >= 0);
	assert.ok(names.indexOf('Sea Horse') >= 0);
	var n = FishWorld.schoolSize(800, 600);
	assert.ok(n >= FishWorld.SCHOOL_MIN && n <= FishWorld.SCHOOL_MAX);
}

function testRainforest() {
	loadModule('rainforest');
	var Rainforest = global.AfterDarkRainforest;
	assert.ok(Rainforest.COUNTS.hordes > Rainforest.COUNTS.few);
	assert.strictEqual(Rainforest.CREATURES.length, 6);
	var sim = new Rainforest(stubArt());
	sim.setType('dragonfly');
	assert.deepStrictEqual(sim.chosen, ['dragonfly']);
	sim.setType("lehman");
	assert.deepStrictEqual(sim.chosen, ['lehman']);
	sim.setType("lehman\'s");
	assert.deepStrictEqual(sim.chosen, ['lehman']);
	sim.setType('all');
	assert.strictEqual(sim.chosen.length, 6);
	sim.reset(320, 240);
	assert.strictEqual(sim.critters.length, sim.count);
}

function testDraino() {
	loadModule('draino');
	var Draino = global.AfterDarkDraino;
	assert.ok(Draino.SPEED.fast > Draino.SPEED.slow);
	var sim = new Draino();
	sim.reset(320, 240);
	assert.ok(sim.bits.length > 50);
	var first = sim.bits[0];
	var before = { x: first.x, y: first.y };
	sim.step(0.05, 320, 240);
	assert.ok(first.x !== before.x || first.y !== before.y, 'water moves');
}

function testShapes() {
	loadModule('shapes');
	var Shapes = global.AfterDarkShapes;
	var grey = Shapes.colour(false);
	assert.ok(/^rgb\(/.test(grey));
	assert.ok(Shapes.KINDS.indexOf('ellipse') >= 0);
}

function testSpheres() {
	loadModule('spheres');
	var Spheres = global.AfterDarkSpheres;
	var round = Spheres.makeSphere(320, 240, 40, 0);
	assert.ok(round.rx >= 8 && round.rx <= 40);
	assert.strictEqual(round.ry, round.rx);
	var egg = Spheres.makeSphere(320, 240, 40, 60);
	assert.ok(egg.ry < egg.rx);
}

function testHardRain() {
	loadModule('hardrain');
	var HardRain = global.AfterDarkHardRain;
	[1, 2, 7, 30].forEach(function (r) {
		var pts = HardRain.circle(r);
		var seen = {};
		for (var i = 0; i < pts.length; i += 2) {
			var key = pts[i] + ',' + pts[i + 1];
			assert.ok(!seen[key], 'radius ' + r + ' visits ' + key + ' once');
			seen[key] = true;
			assert.ok(Math.abs(Math.hypot(pts[i], pts[i + 1]) - r) < 1, 'on the circle');
		}
	});
	/* XOR twice is where you started: the ripples leave the desktop alone. */
	var sim = new HardRain();
	sim.bw = 64;
	sim.bh = 64;
	sim.image = { data: new Uint8ClampedArray(64 * 64 * 4) };
	for (var k = 0; k < sim.image.data.length; k += 1) { sim.image.data[k] = (k * 37) & 255; }
	var before = Array.from(sim.image.data);
	sim.xor(30, 30, 20, [255, 85, 85]);
	assert.notDeepStrictEqual(Array.from(sim.image.data), before);
	sim.xor(30, 30, 20, [255, 85, 85]);
	assert.deepStrictEqual(Array.from(sim.image.data), before);
}

function testStringTheory() {
	loadModule('string');
	var edge = global.AfterDarkStringTheory.edge;
	assert.deepStrictEqual(edge(0, 100, 50), { x: 0, y: 0 });
	assert.deepStrictEqual(edge(100, 100, 50), { x: 99, y: 0 });
	assert.deepStrictEqual(edge(125, 100, 50), { x: 99, y: 25 });
	assert.deepStrictEqual(edge(300, 100, 50), edge(0, 100, 50), 'once round is back to the start');
	assert.deepStrictEqual(edge(-1, 100, 50), edge(299, 100, 50));
}

function testMandelbrot() {
	loadModule('mandelbrot');
	var escape = global.AfterDarkMandelbrot.escape;
	assert.strictEqual(escape(0, 0, 100), -1, 'the origin is in the set');
	assert.strictEqual(escape(-1, 0, 100), -1, 'so is -1');
	assert.ok(escape(2, 2, 100) <= 1, 'far outside escapes at once');
	assert.ok(escape(-0.75, 0.1, 1000) > 10, 'near the neck it takes a while');
}

function testMessages() {
	loadModule('messages');
	var Messages = global.AfterDarkMessages;
	assert.strictEqual(Messages.MESSAGES.length, 8, 'MESG_AD3.DAT holds eight');
	assert.strictEqual(Messages.pick('out to lunch').pt, 36);
	assert.strictEqual(Messages.pick('3').text, 'I Quit!');
	assert.ok(Messages.pick('temporarily comatose').underline);
	assert.ok(Messages.pick('after dark - the ultimate screen saver collection').center);
	var own = Messages.pick('Back in 5');
	assert.strictEqual(own.text, 'Back in 5', 'anything else is your own message');
	assert.strictEqual(own.face, 'System');
	assert.strictEqual(Messages.pick(null).text, 'OUT TO LUNCH');
}

function testGlobe() {
	loadModule('globe');
	var project = global.AfterDarkGlobe.project;
	var flat = project(40, 0);
	var mid = 40 * flat.size + 40;
	assert.ok(flat.inside[mid]);
	assert.ok(Math.abs(flat.v[mid] - 0.5) < 0.02, 'no tilt: the middle is the equator');
	assert.ok(!flat.inside[0], 'the corner is off the globe');
	var top = 1 * flat.size + 40;
	assert.ok(flat.v[top] < 0.2, 'north is up');
	var pole = project(40, 90);
	assert.ok(pole.v[mid] < 0.02, 'tilted right over, the pole faces you');
}

function testStarryNight() {
	loadModule('starry-night');
	var skyline = global.AfterDarkStarryNight.skyline;
	var city = skyline(640, 480, 30, 0.3);
	assert.strictEqual(city.length, 30, 'Buildings is a count, 0 to 100');
	city.forEach(function (b) {
		assert.strictEqual(b.y + b.h, 480, 'buildings stand on the bottom');
		assert.ok(b.h <= 480 * 0.3 + 1, 'no taller than the height setting');
	});
	assert.strictEqual(skyline(640, 480, 0, 0.3).length, 0);
}

function testWarp() {
	loadModule('warp');
	var Warp = global.AfterDarkWarp;
	assert.strictEqual(Warp.SPEEDS.length, 8);
	Warp.SPEEDS.forEach(function (s, i) {
		assert.ok(/ in$/.test(s) ? Warp.VELOCITY[i] > 0 : Warp.VELOCITY[i] < 0, s + ' goes the right way');
	});
}

function testNonsense() {
	loadModule('nonsense');
	var words = JSON.parse(fs.readFileSync(path.join(root, 'all/art/nonsense/index.json'), 'utf8'));
	assert.strictEqual(words.nouns.length, 136, 'NONSENSE.AD has 136 nouns');
	assert.strictEqual(words.verbs.length, 76);
	assert.ok(words.names.indexOf('Elvis') >= 0, 'the names come from NONSENSE.TXT');
	var g = new global.AfterDarkNonsense.Grammar(words);
	assert.strictEqual(g.plural(['mouse', 'mice']), 'mice');
	assert.strictEqual(g.plural(['church', '']), 'churches');
	assert.strictEqual(g.plural(['baby', '']), 'babies');
	assert.strictEqual(g.article('a', 'onion'), 'an');
	for (var i = 0; i < 200; i += 1) {
		var line = g.sentence();
		assert.ok(/^[A-Z]/.test(line), 'starts with a capital: ' + line);
		assert.ok(/[.!]$/.test(line), 'ends a sentence: ' + line);
		assert.ok(!/\s\s|undefined/.test(line), 'no gaps or holes: ' + line);
	}
}

function testEinstein() {
	loadModule('einstein');
	var font = JSON.parse(fs.readFileSync(path.join(root, 'all/art/einstein/index.json'), 'utf8'));
	assert.strictEqual(font.lines.length, 50);
	assert.strictEqual(font.equations.length, 15);
	assert.ok(font.lines.indexOf('I will not waste chalk.') >= 0);
	var sim = new global.AfterDarkEinstein();
	sim.font = font;
	var a = sim.glyph(97);
	assert.ok(a.steps.length > 10 && a.advance > 0, "'a' is a pen path");
	for (var i = 2; i < a.steps.length; i += 2) {
		assert.ok(Math.abs(a.steps[i]) <= 127 && Math.abs(a.steps[i + 1]) <= 127);
	}
	var dollar = sim.glyph(36);
	assert.ok(dollar.steps.length > sim.glyph(83).steps.length, '$ is an S with a bar');
	assert.ok(sim.width('I will not waste chalk.') > 100);
}

function testGeoBounce() {
	loadModule('geobounce');
	var solid = global.AfterDarkGeoBounce.solid;
	[['tetrahedron', 4, 4, 3], ['cube', 8, 6, 4], ['octahedron', 6, 8, 3], ['dodecahedron', 20, 12, 5],
		['icosahedron', 12, 20, 3]].forEach(function (t) {
		var s = solid(t[0]);
		assert.strictEqual(s.v.length, t[1], t[0] + ' vertices');
		assert.strictEqual(s.faces.length, t[2], t[0] + ' faces');
		s.faces.forEach(function (f) { assert.strictEqual(f.length, t[3], t[0] + ' face sides'); });
	});
}

function testStrange() {
	loadModule('strange');
	var p = global.AfterDarkStrange.find();
	assert.ok(p.box.w > 0 && p.box.h > 0, 'the attractor covers some ground');
}

stubDom();
testGravity();
testSnake();
testZot();
testTables();
testFishWorld();
testRainforest();
testDraino();
testShapes();
testSpheres();
testHardRain();
testStringTheory();
testMandelbrot();
testMessages();
testGlobe();
testStarryNight();
testWarp();
testNonsense();
testEinstein();
testGeoBounce();
testStrange();
console.log('ok — gravity, snake, zot, bogglins, om, fish-world, rainforest, draino, shapes, spheres, ' +
	'hard rain, string theory, mandelbrot, messages, globe, starry night, warp, nonsense, einstein, ' +
	'geobounce, strange attractors');
