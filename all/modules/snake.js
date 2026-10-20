/**
 * snake.js - Snake, drawn the way the original module drew itself.
 *
 * SNAKE.AD ships no artwork. Its own description:
 *
 *   "SNAKE (tm) creates a random maze and then tries to solve it. See if you
 *    can solve the maze before the snake!
 *    Solution speed -- controls how fast the snake solves the maze.
 *    Maze complexity -- controls complexity of the maze."
 *   By Alex Zeltser, Jim Miars & P. Lamoreux.
 *
 * Checked against the original running under Wine at 1024x768 (October 2026):
 *  - The maze is always 49 x 37 cells at 1024x768, centred, drawn in 1-px
 *    white lines on black. It is a perfect maze with about 10% dead ends - a
 *    depth-first (recursive backtracker) maze, which is what this generates.
 *  - Maze complexity does not add cells; it shrinks them. The stored value is
 *    used raw: 0 (the stored default) gives 20 px cells, 1..9 give 19 - n px
 *    (18, 17 ... 10), and 10 or more blanks the module. So "more complex"
 *    is the same maze, smaller. Here the grid is sized from 20 px cells
 *    (floor((w - 40) / 20) x floor((h - 20) / 20), 49 x 37 at 1024x768).
 *  - Entrance and exit are gaps in opposite edges (left/right or top/bottom)
 *    at random positions. Outside the entrance sits a green (#00ff00) 7-px
 *    deep block, cell - 2 long; outside the exit a red (#ff0000) ellipse
 *    8 px deep, cell - 1 long.
 *  - The snake searches depth-first from the entrance, filling each cell it
 *    enters with a block inset 3 px from the wall lines (14 px in a 20 px
 *    cell) joined to the previous one, and erases itself as it backs out of
 *    dead ends. It is one solid VGA colour, a new one for every maze.
 *  - When it reaches the exit the next maze follows after "Pause when done"
 *    (stored default 0 sec - at once).
 *  - Solution speed is a 1..9 slider whose stored default is 0. Measured
 *    growth: about 130 cells/s at 0 and 1, 250 at 3, ~1400 at 9 (a maze
 *    every couple of seconds at default, several a second at 9). Wine ran the
 *    module without the original machine's drawing cost, so these rates are
 *    the module's own pacing at best; the in-between values are interpolated.
 * Inferred: whether the snake picks its next turn at random (it looks so), the
 *    grid size at other screen sizes, the exact speed curve.
 *
 *   <after-dark-snake speed="0" maze-complexity="0" pause-when-done="0 sec">
 *
 * speed and maze-complexity take the raw stored values 0-9.
 */
(function () {
	'use strict';

	/* Cells per second (each step one cell forward or one back), by setting. */
	var SPEED = [130, 130, 180, 250, 340, 460, 620, 840, 1100, 1400];
	var SPEED_NAMES = { slow: 1, medium: 5, fast: 9 };
	var COMPLEXITY_NAMES = { simple: 0, medium: 4, twisty: 9 };
	var PAUSE = {
		'0 sec': 0,
		'1 sec': 1,
		'3 sec': 3,
		'5 sec': 5,
		'10 sec': 10,
		'15 sec': 15,
		'30 sec': 30,
		'1 min': 60
	};
	/* The standard VGA colours bar black and white; one per maze. */
	var COLOURS = ['#800000', '#008000', '#808000', '#000080', '#800080',
		'#008080', '#c0c0c0', '#808080', '#ff0000', '#00ff00', '#ffff00',
		'#0000ff', '#ff00ff', '#00ffff'];

	var N = 1, E = 2, S = 4, W = 8;
	var OPP = {};
	OPP[N] = S;
	OPP[E] = W;
	OPP[S] = N;
	OPP[W] = E;
	var DX = {};
	DX[N] = 0;
	DX[E] = 1;
	DX[S] = 0;
	DX[W] = -1;
	var DY = {};
	DY[N] = -1;
	DY[E] = 0;
	DY[S] = 1;
	DY[W] = 0;
	var DIRS = [N, E, S, W];

	function shuffle(list) {
		var i, j, t;
		for (i = list.length - 1; i > 0; i -= 1) {
			j = Math.floor(Math.random() * (i + 1));
			t = list[i];
			list[i] = list[j];
			list[j] = t;
		}
		return list;
	}

	/** Cell size for a raw Maze complexity value (see the header). */
	function cellSize(complexity) {
		var n = Math.max(0, Math.min(9, Math.round(complexity) || 0));
		return n === 0 ? 20 : 19 - n;
	}

	/** Perfect maze, recursive backtracker. Each cell starts with all walls. */
	function generateMaze(cols, rows) {
		console.assert(cols >= 2 && rows >= 2, 'maze needs room to turn');
		var grid = [];
		var seen = [];
		var x, y, stack, cx, cy, dirs, d, nx, ny, carved;
		for (y = 0; y < rows; y += 1) {
			grid[y] = [];
			seen[y] = [];
			for (x = 0; x < cols; x += 1) {
				grid[y][x] = N | E | S | W;
				seen[y][x] = false;
			}
		}
		cx = Math.floor(Math.random() * cols);
		cy = Math.floor(Math.random() * rows);
		stack = [{ x: cx, y: cy }];
		seen[cy][cx] = true;
		while (stack.length) {
			cx = stack[stack.length - 1].x;
			cy = stack[stack.length - 1].y;
			dirs = shuffle(DIRS.slice());
			carved = false;
			for (d = 0; d < dirs.length; d += 1) {
				nx = cx + DX[dirs[d]];
				ny = cy + DY[dirs[d]];
				if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen[ny][nx]) {
					continue;
				}
				grid[cy][cx] &= ~dirs[d];
				grid[ny][nx] &= ~OPP[dirs[d]];
				seen[ny][nx] = true;
				stack.push({ x: nx, y: ny });
				carved = true;
				break;
			}
			if (!carved) {
				stack.pop();
			}
		}
		return { cols: cols, rows: rows, grid: grid };
	}

	/**
	 * Entrance and exit in opposite edges at random places. Each is a cell
	 * and the side of it that opens to the outside.
	 */
	function openings(maze) {
		var cols = maze.cols, rows = maze.rows;
		var across = Math.random() < 0.5;
		var flip = Math.random() < 0.5;
		var a, b;
		if (across) {
			a = { x: 0, y: Math.floor(Math.random() * rows), side: W };
			b = { x: cols - 1, y: Math.floor(Math.random() * rows), side: E };
		} else {
			a = { x: Math.floor(Math.random() * cols), y: 0, side: N };
			b = { x: Math.floor(Math.random() * cols), y: rows - 1, side: S };
		}
		maze.grid[a.y][a.x] &= ~a.side;
		maze.grid[b.y][b.x] &= ~b.side;
		return flip ? { start: a, goal: b } : { start: b, goal: a };
	}

	function Snake() {
		this.speed = SPEED[0];
		this.complexity = 0;
		this.pause = PAUSE['0 sec'];
		this.maze = null;
		this.trail = [];
		this.visited = null;
		this.budget = 0;
		this.wait = 0;
		this.done = false;
		this.colour = COLOURS[0];
	}

	Snake.prototype.rebuild = function (w, h) {
		var cols = Math.max(2, Math.floor((w - 40) / 20));
		var rows = Math.max(2, Math.floor((h - 20) / 20));
		var cell = cellSize(this.complexity);
		var x, y, ends;
		this.cell = cell;
		/* +1: the original's lines sit one pixel right of and below centre. */
		this.originX = Math.floor((w - cols * cell) / 2) + 1;
		this.originY = Math.floor((h - rows * cell) / 2) + 1;
		this.maze = generateMaze(cols, rows);
		ends = openings(this.maze);
		this.start = ends.start;
		this.goal = ends.goal;
		this.visited = [];
		for (y = 0; y < rows; y += 1) {
			this.visited[y] = [];
			for (x = 0; x < cols; x += 1) {
				this.visited[y][x] = false;
			}
		}
		this.visited[this.start.y][this.start.x] = true;
		this.trail = [{ x: this.start.x, y: this.start.y }];
		this.colour = COLOURS[Math.floor(Math.random() * COLOURS.length)];
		this.budget = 0;
		this.done = false;
		this.wait = 0;
	};

	/** One move of the depth-first search: forward into a new cell or back. */
	Snake.prototype.move = function () {
		var head = this.trail[this.trail.length - 1];
		var walls, dirs, i, nx, ny;
		if (head.x === this.goal.x && head.y === this.goal.y) {
			this.done = true;
			this.wait = this.pause;
			return;
		}
		walls = this.maze.grid[head.y][head.x];
		dirs = shuffle(DIRS.slice());
		for (i = 0; i < dirs.length; i += 1) {
			if (walls & dirs[i]) {
				continue;
			}
			nx = head.x + DX[dirs[i]];
			ny = head.y + DY[dirs[i]];
			if (nx < 0 || ny < 0 || nx >= this.maze.cols || ny >= this.maze.rows ||
				this.visited[ny][nx]) {
				continue;
			}
			this.visited[ny][nx] = true;
			this.trail.push({ x: nx, y: ny });
			return;
		}
		this.trail.pop();
		console.assert(this.trail.length > 0, 'a perfect maze always leads to the exit');
	};

	Snake.prototype.step = function (dt, w, h) {
		if (!this.maze) {
			this.rebuild(w, h);
			return;
		}
		if (this.done) {
			this.wait -= dt;
			if (this.wait <= 0) {
				this.rebuild(w, h);
			}
			return;
		}
		this.budget += dt * this.speed;
		while (this.budget >= 1 && !this.done) {
			this.budget -= 1;
			this.move();
		}
		if (this.done) {
			this.budget = 0;
		}
	};

	/* The fill of one cell, [x0, y0, x1, y1) in pixels. */
	Snake.prototype.box = function (p) {
		var x = this.originX + p.x * this.cell;
		var y = this.originY + p.y * this.cell;
		return [x + 3, y + 3, x + this.cell - 3, y + this.cell - 3];
	};

	/* Cell fill stretched out through its gap to the outer wall line. */
	Snake.prototype.outward = function (end) {
		var b = this.box(end);
		var c = this.cell;
		var ox = this.originX, oy = this.originY;
		if (end.side === W) { b[0] = ox; }
		if (end.side === E) { b[2] = ox + this.maze.cols * c + 1; }
		if (end.side === N) { b[1] = oy; }
		if (end.side === S) { b[3] = oy + this.maze.rows * c + 1; }
		return b;
	};

	/* Rectangle just outside an opening: `depth` deep, `len` along the edge. */
	Snake.prototype.outside = function (end, depth, len) {
		var c = this.cell;
		var x = this.originX + end.x * c;
		var y = this.originY + end.y * c;
		var right = this.originX + this.maze.cols * c;
		var bottom = this.originY + this.maze.rows * c;
		if (end.side === W) { return [x - depth, y + 1, depth, len]; }
		if (end.side === E) { return [right + 1, y + 1, depth, len]; }
		if (end.side === N) { return [x + 1, y - depth, len, depth]; }
		return [x + 1, bottom + 1, len, depth];
	};

	Snake.prototype.draw = function (ctx, w, h) {
		var maze = this.maze;
		var cell = this.cell;
		var ox = this.originX;
		var oy = this.originY;
		var x, y, walls, px, py, i, a, b, r;
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!maze) {
			return;
		}
		ctx.fillStyle = '#fff';
		for (y = 0; y < maze.rows; y += 1) {
			for (x = 0; x < maze.cols; x += 1) {
				walls = maze.grid[y][x];
				px = ox + x * cell;
				py = oy + y * cell;
				if (walls & N) {
					ctx.fillRect(px, py, cell + 1, 1);
				}
				if (walls & W) {
					ctx.fillRect(px, py, 1, cell + 1);
				}
				if (y === maze.rows - 1 && (walls & S)) {
					ctx.fillRect(px, py + cell, cell + 1, 1);
				}
				if (x === maze.cols - 1 && (walls & E)) {
					ctx.fillRect(px + cell, py, 1, cell + 1);
				}
			}
		}

		/* Entrance block and exit ellipse. */
		r = this.outside(this.start, 7, cell - 2);
		ctx.fillStyle = '#00ff00';
		ctx.fillRect(r[0], r[1], r[2], r[3]);
		r = this.outside(this.goal, 8, cell - 1);
		ctx.fillStyle = '#ff0000';
		ctx.beginPath();
		ctx.ellipse(r[0] + r[2] / 2, r[1] + r[3] / 2, r[2] / 2, r[3] / 2, 0, 0, Math.PI * 2);
		ctx.fill();

		/* The snake: each cell joined to the next, one solid colour. */
		ctx.fillStyle = this.colour;
		a = this.outward(this.start);
		ctx.fillRect(a[0], a[1], a[2] - a[0], a[3] - a[1]);
		for (i = 1; i < this.trail.length; i += 1) {
			a = this.box(this.trail[i - 1]);
			b = this.box(this.trail[i]);
			x = Math.min(a[0], b[0]);
			y = Math.min(a[1], b[1]);
			ctx.fillRect(x, y, Math.max(a[2], b[2]) - x, Math.max(a[3], b[3]) - y);
		}
		if (this.done) {
			a = this.outward(this.goal);
			ctx.fillRect(a[0], a[1], a[2] - a[0], a[3] - a[1]);
		}
	};

	function SnakeElement() {
		return Reflect.construct(HTMLElement, [], SnakeElement);
	}
	SnakeElement.prototype = Object.create(HTMLElement.prototype);
	SnakeElement.prototype.constructor = SnakeElement;
	Object.setPrototypeOf(SnakeElement, HTMLElement);

	function level(value, names) {
		var v = String(value === null || value === undefined ? '0' : value).toLowerCase().trim();
		if (names[v] !== undefined) {
			return names[v];
		}
		v = parseInt(v, 10);
		return isNaN(v) ? 0 : Math.max(0, Math.min(9, v));
	}

	SnakeElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		var sim = new Snake();
		var pause = (AfterDark.setting(this, 'pause-when-done') || '0 sec').toLowerCase();
		sim.speed = SPEED[level(AfterDark.setting(this, 'speed'), SPEED_NAMES)];
		sim.complexity = level(AfterDark.setting(this, 'maze-complexity'), COMPLEXITY_NAMES);
		sim.pause = PAUSE[pause] !== undefined ? PAUSE[pause] : 0;

		var screen = new AfterDark.Screen(this);
		this._screen = screen;
		this.sim = sim;
		screen.onresize = function (width, height) {
			sim.rebuild(width, height);
		};
		sim.rebuild(screen.width, screen.height);
		screen.run(function (dt, ctx, width, height) {
			sim.step(dt, width, height);
			sim.draw(ctx, width, height);
		});
	};

	SnakeElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-snake', SnakeElement);
	window.AfterDarkSnake = Snake;
	Snake.generateMaze = generateMaze;
	Snake.cellSize = cellSize;
	Snake.SPEED = SPEED;
	Snake.PAUSE = PAUSE;
}());
