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
	assert.strictEqual(Gravity.SIZES.large, 30);
	assert.ok(Gravity.PALETTE.length >= Gravity.MAX_BALLS, 'enough colours for a set');

	var sim = new Gravity();
	sim.count = 3;
	sim.reset(320);
	assert.strictEqual(sim.balls.length, 3);
	var colours = sim.balls.map(function (b) { return b.colour; });
	assert.strictEqual(new Set(colours).size, 3, 'no two balls alike');
	var ball = sim.balls[0];
	var y = ball.y;
	sim.move(ball, 320, 240);
	sim.move(ball, 320, 240);
	assert.ok(ball.y > y, 'a ball falls');
	var floor = 240 - sim.size / 2;
	for (var i = 0; i < 5000 && !ball.done; i += 1) {
		sim.move(ball, 320, 240);
		assert.ok(ball.y <= floor + 1e-9, 'never below the floor');
		assert.ok(ball.x >= sim.size / 2 && ball.x <= 320 - sim.size / 2, 'inside the walls');
	}
	assert.ok(ball.done, 'the bounces die away');
}

function testSnake() {
	loadModule('snake');
	var Snake = global.AfterDarkSnake;
	var maze = Snake.generateMaze(8, 6);
	assert.strictEqual(maze.cols, 8);
	assert.strictEqual(maze.rows, 6);
	assert.strictEqual(maze.grid.length, 6);
	assert.strictEqual(maze.grid[0].length, 8);

	var edges = 0;
	maze.grid.forEach(function (row) {
		row.forEach(function (walls) {
			edges += 4 - ((walls & 1 ? 1 : 0) + (walls & 2 ? 1 : 0) + (walls & 4 ? 1 : 0) + (walls & 8 ? 1 : 0));
		});
	});
	assert.strictEqual(edges / 2, 8 * 6 - 1, 'a perfect maze: every cell joined, no loops');

	assert.strictEqual(Snake.cellSize(0), 20, 'stored default complexity: 20 px cells');
	assert.strictEqual(Snake.cellSize(1), 18);
	assert.strictEqual(Snake.cellSize(9), 10);

	var sim = new Snake();
	sim.rebuild(1024, 768);
	assert.strictEqual(sim.maze.cols, 49, '49 x 37 cells at 1024x768');
	assert.strictEqual(sim.maze.rows, 37);
	assert.strictEqual(sim.originX, 23);
	assert.strictEqual(sim.originY, 15);
	var mazes = 0;
	for (var i = 0; i < 20000 && mazes < 3; i += 1) {
		sim.step(0.05, 1024, 768);
		if (sim.done) {
			var head = sim.trail[sim.trail.length - 1];
			assert.ok(head.x === sim.goal.x && head.y === sim.goal.y, 'the snake ends at the exit');
			mazes += 1;
			sim.step(0.05, 1024, 768);
		}
	}
	assert.strictEqual(mazes, 3, 'the snake solves maze after maze');
}

function testZot() {
	loadModule('zot');
	var Zot = global.AfterDarkZot;
	for (var n = 0; n < 50; n += 1) {
		var bolts = Zot.strike(1024, 768, Zot.FORKS.forky);
		var main = bolts[0];
		assert.strictEqual(main[0].y, 0, 'the bolt starts at the top edge');
		assert.ok(main[main.length - 1].y >= 740 && main[main.length - 1].y <= 758, 'and stops near the bottom');
		assert.ok(bolts.length - 1 >= 4 && bolts.length - 1 <= 17, '4..17 forks');
		for (var f = 1; f < bolts.length; f += 1) {
			assert.ok(bolts[f].length - 1 <= 24, 'Forky forks run at most ~23 steps');
		}
		bolts.forEach(function (line) {
			for (var i = 1; i < line.length; i += 1) {
				var dy = line[i].y - line[i - 1].y;
				assert.ok(dy >= 0 && dy <= 18, 'steps go 0..18 px down');
				assert.ok(Math.abs(line[i].x - line[i - 1].x) <= 25, 'and at most 25 px across');
			}
		});
	}

	var sim = new Zot();
	sim.wait = 0;
	sim.step(0.016, 1024, 768);
	assert.ok(sim.bolts.length >= 1, 'a due strike fires');
	assert.ok(sim.lit(), 'and shows');
	sim.step(0.2, 1024, 768);
	assert.ok(!sim.lit(), 'then is rubbed out');
	assert.ok(sim.wait >= 2, 'the next strike is seconds away');
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
	assert.ok(Bogglins.TWANG.sharp && Bogglins.TWANG.mild, 'every Twanginess is accepted');
	var bog = new Bogglins({ bitmap: function () { return { image: null }; } });
	bog.reset(1024, 768);
	assert.strictEqual(bog.crew.length, 1, 'one Bogglin, as in the original');
	for (var t = 0; t < 600; t += 1) { bog.step(1 / 30, 1024, 768); }
	assert.ok(bog.crew[0].x >= 0 && bog.crew[0].x <= 1024 && bog.crew[0].y <= 768, 'he stays on screen');

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
	/* Fish::IFish: H/100 + H/100/3 + 2, +1 unless H/100 is a multiple of 3, at most 16 */
	assert.strictEqual(FishWorld.schoolSize(1024, 768), 12);
	assert.strictEqual(FishWorld.schoolSize(640, 480), 8);
	assert.strictEqual(FishWorld.schoolSize(800, 600), 10);
	assert.strictEqual(FishWorld.schoolSize(4000, 3000), 16);
	/* a mirrored sprite moves the other way through the same frames */
	var movie = new FishWorld.Movie({ cels: {}, frames: [null, [0, 0, 10, 10], [5, 0, 15, 10]] }, {});
	var sp = new FishWorld.Sprite(movie);
	sp.nextSequence(1);
	sp.setCenter(100, 50);
	sp.play();
	sp.play();
	assert.strictEqual(sp.cx, 105);
	sp.op = 1;
	sp.nextSequence(1);
	sp.setCenter(100, 50);
	sp.play();
	sp.play();
	assert.strictEqual(sp.cx, 95);
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
	/* God's edge slots at 1024x768: 17 + 17 + 14, less one; 3 of each of 6 kinds */
	var god = new Rainforest.God(1024, 768, 18, 6);
	assert.strictEqual(god.total, 47);
	god.desiredPopulation(3);
	assert.strictEqual(god.desired, 3);
	assert.ok(god.requestBirth(0, 3) && god.requestBirth(0, 3) && god.requestBirth(0, 3));
	assert.ok(!god.requestBirth(0, 3));
	assert.strictEqual(Rainforest.God.angle([0, 10, 0, 10], [0, 0, 0, 0]), 90);
}

function testDraino() {
	loadModule('draino');
	var Draino = global.AfterDarkDraino;
	assert.ok(Draino.SPEED.fast > Draino.SPEED.slow);
	var sim = new Draino();
	sim.w = 1024;
	sim.h = 768;
	sim.bw = 170;
	sim.bh = 64;
	/* A block taken right of centre moves in and turns anticlockwise (up). */
	var to = sim.target(600, 380);
	assert.ok(to.x + 85 - 512 < 600 + 85 - 512, 'drawn in towards the drain');
	assert.ok(to.y < 380, 'Counter turns it anticlockwise on screen');
	sim.spin = 1;
	assert.ok(sim.target(600, 380).y > 380, 'Clockwise turns it the other way');
	/* Edge blocks are thrown across the centre. */
	assert.ok(sim.target(20, 300).x > 512, 'a left-edge block lands right of centre');
}

function testShapes() {
	loadModule('shapes');
	var Shapes = global.AfterDarkShapes;
	var grey = Shapes.colour(false);
	assert.ok(/^rgb\((\d+),\1,\1\)$/.test(grey), 'black & white is grey');
	assert.deepStrictEqual(Shapes.KINDS, ['rect', 'ellipse'], 'rectangles and ellipses only');
	assert.strictEqual(Shapes.PALETTE.length, 233, 'the 6x6x6 cube and 17 greys');
	assert.strictEqual(Shapes.nearest(250, 10, 30), 'rgb(255,0,51)');
	var sim = new Shapes();
	for (var i = 0; i < 500; i += 1) {
		var s = sim.roll(1024, 768);
		assert.ok(s.x >= -100 && s.x < 1004 && s.y >= -100 && s.y < 748);
		assert.ok(s.w >= 0 && s.w < 512 && s.h >= 0 && s.h < 384);
	}
}

function testSpheres() {
	loadModule('spheres');
	var Spheres = global.AfterDarkSpheres;
	var s = Spheres.makeSphere(1024, 768, 73, 10);
	assert.ok(s.r >= 30 && s.r < 103, 'R = 30 + random(Max Size)');
	assert.strictEqual(s.rings.length, 34);
	assert.strictEqual(s.rings[0].r, s.r);
	assert.ok(Math.abs(s.rings[33].x - s.x - s.r / 2) < 1e-9, 'Offset 10: highlight half a radius right');
	assert.ok(Math.abs(s.y - s.rings[33].y - s.r / 2) < 1e-9, '... and up');
	assert.ok(/^rgb\(.*(24|29).*\)$/.test(s.rings[0].colour) && /255\)$|255,/.test(s.rings[33].colour));
	var flat = Spheres.makeSphere(1024, 768, 73, 0);
	assert.strictEqual(flat.rings[33].x, flat.x, 'Offset 0: concentric');
}

function testHardRain() {
	loadModule('hardrain');
	var HardRain = global.AfterDarkHardRain;
	/* Traced from RAIN.AD: 8 px, +6 a step, the first half in a 2-px pen,
	   then a black ellipse 2 px wider (pen 0) that erases the drop. */
	assert.deepStrictEqual(HardRain.rings(5), [[8, 2], [14, 2], [20, 1], [26, 1], [32, 1], [34, 0]]);
	assert.deepStrictEqual(HardRain.rings(12).slice(-2), [[74, 1], [76, 0]]);
}

function testStringTheory() {
	loadModule('string');
	var move = global.AfterDarkStringTheory.move;
	var size = [100, 50];
	var e = { p: [10, 0], v: [-4, 3], on: [1, 0] };
	assert.strictEqual(move(e, 0, size), 6, 'an end runs along its edge');
	assert.strictEqual(move(e, 1, size), 0, 'the other axis is still');
	move(e, 0, size); move(e, 0, size);
	assert.deepStrictEqual(e.p, [2, 0]);
	assert.strictEqual(move(e, 0, size), 2, 'off the screen it stays put');
	assert.deepStrictEqual(e.on, [0, 1], 'and turns the corner');
	assert.strictEqual(e.v[0], 4, 'turned back for next time');
	assert.strictEqual(move(e, 1, size), 3, 'now down the side edge');
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
		assert.ok(/[.?]$/.test(line), 'ends a sentence or a question: ' + line);
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

/** Every frame id a module names must be in its exported art. */
function testArtCoverage() {
	var boris = JSON.parse(fs.readFileSync(path.join(root, 'all/art/boris/index.json'), 'utf8'));
	var src = fs.readFileSync(path.join(root, 'all/modules/boris.js'), 'utf8');
	var ids = (src.match(/\b1[0-9]{3}\b/g) || []).filter(function (id) { return Number(id) >= 1000 && Number(id) < 2000; });
	assert.ok(ids.length > 20);
	ids.forEach(function (id) { assert.ok(boris.bitmaps[id], 'Boris frame ' + id + ' is exported'); });
	[15000, 15001, 15002, 15100, 15300, 15400, 15200, 15202].forEach(function (id) {
		assert.ok(boris.bitmaps[id], 'butterfly frame ' + id + ' is exported');
	});
	var mowin = JSON.parse(fs.readFileSync(path.join(root, 'all/art/mowin/index.json'), 'utf8'));
	['up', 'down', 'left', 'right', 'flowers', 'blade0', 'blade1', 'blade2'].forEach(function (name) {
		assert.ok(mowin.bitmaps[name], "Mowin' Man " + name + ' is exported');
	});
	assert.strictEqual(mowin.bitmaps.blade2.w, 1, 'a blade is one pixel wide');
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
testArtCoverage();
console.log('ok — gravity, snake, zot, bogglins, om, fish-world, rainforest, draino, shapes, spheres, ' +
	'hard rain, string theory, mandelbrot, messages, globe, starry night, warp, nonsense, einstein, ' +
	'geobounce, strange attractors, boris and mowin art');
