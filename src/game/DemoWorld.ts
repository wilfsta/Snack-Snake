import { clamp, DIRECTIONS, isOpposite, type Direction } from '../core/geometry';
import { pick, type Rng } from '../core/random';
import { Arena } from './Arena';
import { planMove, rectContains } from './collision';
import { Snake } from './Snake';
import type { SnakeWorld } from './SnakeSession';
import { placeTiles } from './spawner';
import { measureTile, type Tile } from './tiles';

const DEMO_PROMPTS = ['7 × 8', '3 × 4', '6 × 6', '9 × 2', '5 × 5', '12 × 3', '4 × 7', '8 × 8'];

/**
 * A self-driving snake for the menu background, so the menu feels like a game from second one.
 */
export class DemoWorld implements SnakeWorld {
  readonly arena: Arena;
  readonly snake: Snake;
  private tileList: Tile[] = [];
  private clock = 0;
  private moveClock = 0;
  private respawnAt = 0;
  private nextId = 1;
  private readonly stepMs = 190;

  constructor(
    cols: number,
    rows: number,
    private readonly rng: Rng,
    private readonly onEat: (tile: Tile) => void = () => undefined,
  ) {
    this.arena = new Arena(cols, rows, 'wrap');
    this.snake = new Snake({ x: Math.floor(cols / 3), y: Math.floor(rows / 2) }, 'right', 6);
    this.moveClock = this.stepMs;
  }

  get tiles(): readonly Tile[] {
    return this.tileList;
  }

  get time(): number {
    return this.clock;
  }

  get moveProgress(): number {
    return clamp(this.moveClock / this.stepMs, 0, 1);
  }

  update(dtMs: number): void {
    this.clock += dtMs;
    if (this.tileList.length === 0 && this.clock >= this.respawnAt) this.spawn();
    this.moveClock += dtMs;
    while (this.moveClock >= this.stepMs) {
      this.moveClock -= this.stepMs;
      this.step();
    }
  }

  private spawn(): void {
    const label = pick(this.rng, DEMO_PROMPTS);
    const rects = placeTiles(
      {
        arena: this.arena,
        snakeCells: this.snake.body,
        head: this.snake.head,
        direction: this.snake.direction,
        obstacles: [],
        rng: this.rng,
      },
      [measureTile('question', label)],
    );
    if (!rects) return;
    const r = rects[0];
    this.tileList = [
      { id: this.nextId++, kind: 'question', ...r, label, optionId: null, isCorrect: false, bornAt: this.clock, hint: 0, mark: 'none' },
    ];
  }

  private step(): void {
    const direction = this.chooseDirection();
    this.snake.forceDirection(direction);
    const outcome = planMove(this.snake, this.arena, direction);
    if (outcome.kind !== 'move') {
      // Boxed in: start again small rather than crash.
      this.snake.truncate(4);
      return;
    }
    this.snake.moveTo(outcome.head);
    const tile = this.tileList.find((t) => rectContains(t, outcome.head));
    if (tile) {
      this.tileList = [];
      this.respawnAt = this.clock + 900;
      if (this.snake.length < 16) this.snake.grow(1);
      else this.snake.truncate(8);
      this.onEat(tile);
    }
  }

  /** Greedy chase toward the snack with a little randomness, never into itself. */
  private chooseDirection(): Direction {
    const current = this.snake.direction;
    const safe = DIRECTIONS.filter(
      (d) => !isOpposite(d, current) && planMove(this.snake, this.arena, d).kind === 'move',
    );
    if (safe.length === 0) return current;
    const target = this.tileList[0];
    if (!target || this.rng.next() < 0.12) {
      return safe.includes(current) && this.rng.next() < 0.8 ? current : pick(this.rng, safe);
    }
    const goal = { x: target.x + Math.floor(target.w / 2), y: target.y + Math.floor(target.h / 2) };
    const scored = safe.map((d) => {
      const next = this.arena.next(this.snake.head, d);
      return { d, dist: next ? this.arena.distance(next, goal) : 999 };
    });
    scored.sort((a, b) => a.dist - b.dist);
    return scored[0].d;
  }
}
