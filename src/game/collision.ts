import { vecEquals, type Direction, type Vec2 } from '../core/geometry';
import type { Arena } from './Arena';
import type { Snake } from './Snake';

export type MoveOutcome =
  | { readonly kind: 'move'; readonly head: Vec2 }
  | { readonly kind: 'wall' }
  | { readonly kind: 'self'; readonly head: Vec2; /** index of the body segment that was hit */ readonly index: number };

/**
 * Works out what happens if the snake moves one cell in `direction`, without changing anything.
 * The tail cell is safe to move into when the tail is about to move out of it.
 */
export function planMove(snake: Snake, arena: Arena, direction: Direction): MoveOutcome {
  const head = arena.next(snake.head, direction);
  if (!head) return { kind: 'wall' };
  const body = snake.body;
  const tailMovesAway = snake.pendingGrowth === 0;
  const limit = tailMovesAway ? body.length - 1 : body.length;
  for (let i = 1; i < limit; i++) {
    if (vecEquals(body[i], head)) return { kind: 'self', head, index: i };
  }
  return { kind: 'move', head };
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function rectContains(r: Rect, p: Vec2): boolean {
  return p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
}

/** True if the rectangles overlap or are closer than `gap` cells. */
export function rectsTooClose(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

export function rectCells(r: Rect): Vec2[] {
  const cells: Vec2[] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells.push({ x, y });
  return cells;
}
