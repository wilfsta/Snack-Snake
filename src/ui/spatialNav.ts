import { DIRECTION_VECTORS, type Direction } from '../core/geometry';

/**
 * Finds the best element to move focus to in a direction, based on on-screen positions.
 * Lets gamepad D-pads and arrow keys move naturally around grids of buttons.
 */
export function findNeighbour(current: HTMLElement, candidates: readonly HTMLElement[], direction: Direction): HTMLElement | null {
  const from = current.getBoundingClientRect();
  const fx = from.left + from.width / 2;
  const fy = from.top + from.height / 2;
  const v = DIRECTION_VECTORS[direction];
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of candidates) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - fx;
    const dy = r.top + r.height / 2 - fy;
    const along = dx * v.x + dy * v.y;
    if (along <= 4) continue;
    const across = Math.abs(dx * v.y - dy * v.x);
    const score = along + across * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}
