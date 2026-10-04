import type { Vec2 } from '../core/geometry';
import type { Arena } from '../game/Arena';
import type { SnakeView } from '../game/Snake';

/**
 * Turns the authoritative grid snake into a smooth visual path.
 * The result is in continuous grid units (cell centres at x + 0.5) and "unwrapped": when the
 * snake passes through a wrap-around edge the path keeps going off the side instead of jumping,
 * so it can be drawn twice (once on each side) for a seamless portal effect.
 *
 * None of this affects gameplay - collisions use the grid cells only.
 */
export function buildSnakePath(snake: SnakeView, arena: Arena, progress: number): Vec2[] {
  const body = snake.body;
  if (body.length === 0) return [];
  const head = body[0];
  const neck = body.length > 1 ? body[1] : head;
  const points: Vec2[] = [];

  const toHead = arena.delta(neck, head);
  let ux = neck.x + 0.5;
  let uy = neck.y + 0.5;
  points.push({ x: ux + toHead.x * progress, y: uy + toHead.y * progress });
  if (body.length === 1) return points;
  points.push({ x: ux, y: uy });

  for (let i = 2; i < body.length; i++) {
    const d = arena.delta(body[i - 1], body[i]);
    ux += d.x;
    uy += d.y;
    points.push({ x: ux, y: uy });
  }

  const vacated = snake.lastVacated;
  if (vacated) {
    const d = arena.delta(body[body.length - 1], vacated);
    points.push({ x: ux + d.x * (1 - progress), y: uy + d.y * (1 - progress) });
  }
  return points;
}

/** One pass of Chaikin corner cutting, keeping the end points, so 90° turns become curves. */
export function smoothPath(points: readonly Vec2[]): Vec2[] {
  if (points.length < 3) return points.slice();
  const out: Vec2[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (i > 0) out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
    if (i < points.length - 2) out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  out.push(points[points.length - 1]);
  return out;
}

export interface PathSample {
  readonly x: number;
  readonly y: number;
  /** Direction of travel at this point (pointing toward the head). */
  readonly angle: number;
  /** Distance from the head along the body, in cells. */
  readonly dist: number;
}

/** Evenly spaced samples from head to tail. */
export function samplePath(points: readonly Vec2[], spacing: number): PathSample[] {
  if (points.length === 0) return [];
  const samples: PathSample[] = [];
  let travelled = 0;
  let nextAt = 0;
  let lastAngle = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    // Body runs head -> tail, so "forward" is from b to a.
    lastAngle = Math.atan2(a.y - b.y, a.x - b.x);
    while (nextAt <= travelled + len) {
      const t = (nextAt - travelled) / len;
      samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: lastAngle, dist: nextAt });
      nextAt += spacing;
    }
    travelled += len;
  }
  const last = points[points.length - 1];
  if (samples.length === 0 || travelled - samples[samples.length - 1].dist > spacing * 0.3) {
    samples.push({ x: last.x, y: last.y, angle: lastAngle, dist: travelled });
  }
  return samples;
}
