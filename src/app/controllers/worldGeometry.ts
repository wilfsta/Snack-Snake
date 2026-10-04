import { wrapDelta, type Vec2 } from '../../core/geometry';
import type { SnakeWorld } from '../../game/SnakeSession';
import type { Tile } from '../../game/tiles';

export function tileCenter(tile: Tile): Vec2 {
  return { x: tile.x + tile.w / 2, y: tile.y + tile.h / 2 };
}

/** Offset in cells from the centre of the snake's head cell to a tile's centre (wrap-aware). */
export function offsetToTile(world: SnakeWorld, tile: Tile): Vec2 {
  const head = world.snake.body[0];
  const c = tileCenter(tile);
  const hx = head.x + 0.5;
  const hy = head.y + 0.5;
  const { arena } = world;
  if (arena.walls === 'wrap') return { x: wrapDelta(hx, c.x, arena.cols), y: wrapDelta(hy, c.y, arena.rows) };
  return { x: c.x - hx, y: c.y - hy };
}

/** Offset to the nearest visible, unrevealed tile (for the snake's eyes), or null. */
export function nearestTileOffset(world: SnakeWorld): Vec2 | null {
  let best: Vec2 | null = null;
  let bestDist = Infinity;
  for (const tile of world.tiles) {
    if (tile.mark !== 'none' || tile.bornAt > world.time) continue;
    const offset = offsetToTile(world, tile);
    const d = Math.hypot(offset.x, offset.y);
    if (d < bestDist) {
      bestDist = d;
      best = offset;
    }
  }
  return best;
}
