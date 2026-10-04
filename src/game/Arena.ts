import { DIRECTION_VECTORS, clamp, mod, wrapDelta, type Direction, type Vec2 } from '../core/geometry';

/** What happens at the edge of the arena. */
export type WallMode = 'wrap' | 'solid';

/** The logical grid. All gameplay (movement, collisions, spawning) happens in these integer cells. */
export class Arena {
  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly walls: WallMode,
  ) {}

  get cellCount(): number {
    return this.cols * this.rows;
  }

  inBounds(p: Vec2): boolean {
    return p.x >= 0 && p.y >= 0 && p.x < this.cols && p.y < this.rows;
  }

  /** Maps any coordinate onto the grid (wrapping), or null if it is outside a solid arena. */
  normalize(x: number, y: number): Vec2 | null {
    if (this.walls === 'wrap') return { x: mod(x, this.cols), y: mod(y, this.rows) };
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows ? { x, y } : null;
  }

  /** The neighbouring cell in a direction, or null when that would hit a solid wall. */
  next(p: Vec2, d: Direction): Vec2 | null {
    const v = DIRECTION_VECTORS[d];
    return this.normalize(p.x + v.x, p.y + v.y);
  }

  /** Shortest displacement from a to b (taking wrap-around into account). */
  delta(a: Vec2, b: Vec2): Vec2 {
    if (this.walls === 'wrap') {
      return { x: wrapDelta(a.x, b.x, this.cols), y: wrapDelta(a.y, b.y, this.rows) };
    }
    return { x: b.x - a.x, y: b.y - a.y };
  }

  /** Manhattan distance in moves. */
  distance(a: Vec2, b: Vec2): number {
    const d = this.delta(a, b);
    return Math.abs(d.x) + Math.abs(d.y);
  }

  index(p: Vec2): number {
    return p.y * this.cols + p.x;
  }
}

/**
 * Picks a grid shape that roughly matches the screen's aspect ratio, so cells stay square
 * and big on both landscape tablets and portrait phones. The grid is then fixed for the session.
 */
export function chooseArenaSize(aspect: number, targetCells = 260): { cols: number; rows: number } {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1.5;
  const cols = clamp(Math.round(Math.sqrt(targetCells * safeAspect)), 12, 24);
  const rows = clamp(Math.round(targetCells / cols), 12, 22);
  return { cols, rows };
}
