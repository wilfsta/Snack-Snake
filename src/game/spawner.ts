import type { Direction, Vec2 } from '../core/geometry';
import type { Rng } from '../core/random';
import type { Arena } from './Arena';
import type { Rect } from './collision';

/** How strict placement is. We start strict (fair, roomy) and relax only if the arena is crowded. */
export interface PlacementRules {
  /** Cells kept clear around every snake segment. */
  readonly snakePadding: number;
  /** Cells kept clear between tiles. */
  readonly tileGap: number;
  /** Minimum moves from the snake's head to any part of a tile. */
  readonly minHeadDistance: number;
  /** Cells straight ahead of the head kept clear (so nothing is eaten by accident). */
  readonly forwardLookahead: number;
}

export const PLACEMENT_LEVELS: readonly PlacementRules[] = [
  { snakePadding: 1, tileGap: 1, minHeadDistance: 5, forwardLookahead: 6 },
  { snakePadding: 1, tileGap: 1, minHeadDistance: 4, forwardLookahead: 4 },
  { snakePadding: 0, tileGap: 1, minHeadDistance: 3, forwardLookahead: 3 },
  { snakePadding: 0, tileGap: 1, minHeadDistance: 2, forwardLookahead: 2 },
  { snakePadding: 0, tileGap: 0, minHeadDistance: 2, forwardLookahead: 1 },
];

export interface PlacementContext {
  readonly arena: Arena;
  readonly snakeCells: readonly Vec2[];
  readonly head: Vec2;
  readonly direction: Direction;
  /** Existing tiles that new ones must keep away from. */
  readonly obstacles: readonly Rect[];
  readonly rng: Rng;
}

export interface TileSize {
  readonly w: number;
  readonly h: number;
}

/**
 * Finds non-overlapping, fairly spread positions for all requested tiles, or null if the
 * arena is too full. Tiles never touch the snake, never overlap each other and always sit
 * fully inside the arena.
 */
export function placeTiles(
  ctx: PlacementContext,
  sizes: readonly TileSize[],
  levels: readonly PlacementRules[] = PLACEMENT_LEVELS,
): Rect[] | null {
  for (const rules of levels) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const placed = tryPlace(ctx, sizes, rules);
      if (placed) return placed;
    }
  }
  return null;
}

function tryPlace(ctx: PlacementContext, sizes: readonly TileSize[], rules: PlacementRules): Rect[] | null {
  const { arena } = ctx;
  const blocked = new Uint8Array(arena.cols * arena.rows);
  const block = (x: number, y: number): void => {
    const p = arena.normalize(x, y);
    if (p) blocked[arena.index(p)] = 1;
  };
  const blockAround = (x: number, y: number, pad: number): void => {
    for (let dy = -pad; dy <= pad; dy++) for (let dx = -pad; dx <= pad; dx++) block(x + dx, y + dy);
  };
  const blockRect = (r: Rect, pad: number): void => {
    for (let y = r.y - pad; y < r.y + r.h + pad; y++) for (let x = r.x - pad; x < r.x + r.w + pad; x++) block(x, y);
  };

  for (const c of ctx.snakeCells) blockAround(c.x, c.y, rules.snakePadding);
  let p: Vec2 | null = ctx.head;
  for (let k = 0; k < rules.forwardLookahead && p; k++) {
    p = arena.next(p, ctx.direction);
    if (p) blockAround(p.x, p.y, Math.min(1, rules.snakePadding));
  }
  for (const r of ctx.obstacles) blockRect(r, rules.tileGap);

  const isFree = (r: Rect): boolean => {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) if (blocked[y * arena.cols + x]) return false;
    }
    return true;
  };
  const headDistance = (r: Rect): number => {
    let best = Number.POSITIVE_INFINITY;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) best = Math.min(best, arena.distance(ctx.head, { x, y }));
    }
    return best;
  };

  const placed: Rect[] = [];
  for (const size of sizes) {
    const candidates: Rect[] = [];
    for (let y = 0; y + size.h <= arena.rows; y++) {
      for (let x = 0; x + size.w <= arena.cols; x++) {
        const r = { x, y, w: size.w, h: size.h };
        if (isFree(r) && headDistance(r) >= rules.minHeadDistance) candidates.push(r);
      }
    }
    if (candidates.length === 0) return null;
    const choice = chooseSpread(candidates, placed, ctx);
    placed.push(choice);
    blockRect(choice, rules.tileGap);
  }
  return placed;
}

/** Of a random sample of candidates, prefer the one furthest from tiles already placed. */
function chooseSpread(candidates: readonly Rect[], placed: readonly Rect[], ctx: PlacementContext): Rect {
  const center = (r: Rect): Vec2 => ({ x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) });
  let best = candidates[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  const samples = Math.min(24, candidates.length);
  for (let i = 0; i < samples; i++) {
    const r = candidates[Math.floor(ctx.rng.next() * candidates.length)];
    let spread = 0;
    if (placed.length > 0) {
      spread = Math.min(...placed.map((other) => ctx.arena.distance(center(r), center(other))));
    }
    const score = spread + ctx.rng.next() * 2;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}
