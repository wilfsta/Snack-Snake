import { DIRECTION_VECTORS, isOpposite, opposite, vecEquals, type Direction, type Vec2 } from '../core/geometry';

/** Read-only view of a snake, enough to render it. */
export interface SnakeView {
  /** Index 0 is the head. Grid cells. */
  readonly body: readonly Vec2[];
  /** The tail cell given up on the last move (null if the snake grew instead). Used for smooth tails. */
  readonly lastVacated: Vec2 | null;
  readonly direction: Direction;
}

/**
 * The authoritative, grid-based snake. It knows nothing about rendering or animation.
 */
export class Snake implements SnakeView {
  static readonly MAX_QUEUED_TURNS = 2;

  private segments: Vec2[];
  private heading: Direction;
  private readonly turns: Direction[] = [];
  private growth = 0;
  private vacated: Vec2 | null = null;

  constructor(head: Vec2, direction: Direction, length: number) {
    if (length < 1) throw new Error('A snake needs at least one segment');
    const back = DIRECTION_VECTORS[opposite(direction)];
    this.segments = Array.from({ length }, (_, i) => ({ x: head.x + back.x * i, y: head.y + back.y * i }));
    this.heading = direction;
  }

  get body(): readonly Vec2[] {
    return this.segments;
  }

  get head(): Vec2 {
    return this.segments[0];
  }

  get direction(): Direction {
    return this.heading;
  }

  get length(): number {
    return this.segments.length;
  }

  get pendingGrowth(): number {
    return this.growth;
  }

  get lastVacated(): Vec2 | null {
    return this.vacated;
  }

  get queuedTurns(): readonly Direction[] {
    return this.turns;
  }

  /**
   * Buffers a turn for upcoming moves. Turns are checked against the last *queued* direction,
   * so quickly pressing "up, left" while moving right can never produce an instant 180° reversal.
   */
  queueDirection(d: Direction): boolean {
    const last = this.turns.length > 0 ? this.turns[this.turns.length - 1] : this.heading;
    if (d === last || isOpposite(d, last)) return false;
    if (this.turns.length >= Snake.MAX_QUEUED_TURNS) return false;
    this.turns.push(d);
    return true;
  }

  /** The direction the next move will use. */
  peekDirection(): Direction {
    return this.turns.length > 0 ? this.turns[0] : this.heading;
  }

  /** Consumes the next queued turn (if any) and returns the direction for this move. */
  takeTurn(): Direction {
    const next = this.turns.shift();
    if (next) this.heading = next;
    return this.heading;
  }

  forceDirection(d: Direction): void {
    this.heading = d;
    this.turns.length = 0;
  }

  clearQueue(): void {
    this.turns.length = 0;
  }

  /** Moves the head into a new cell. The tail follows unless the snake is growing. */
  moveTo(head: Vec2): void {
    this.segments.unshift(head);
    if (this.growth > 0) {
      this.growth--;
      this.vacated = null;
    } else {
      this.vacated = this.segments.pop() ?? null;
    }
  }

  grow(amount = 1): void {
    this.growth += amount;
  }

  /** Cuts the snake down to `length` segments, returning the removed cells. */
  truncate(length: number): Vec2[] {
    if (length >= this.segments.length) return [];
    const removed = this.segments.splice(length);
    this.vacated = null;
    return removed;
  }

  occupies(p: Vec2): boolean {
    return this.segments.some((s) => vecEquals(s, p));
  }
}
