export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** Clockwise order, used for turning left/right. */
export const DIRECTIONS: readonly Direction[] = ['up', 'right', 'down', 'left'];

export const DIRECTION_VECTORS: Readonly<Record<Direction, Vec2>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Readonly<Record<Direction, Direction>> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export function opposite(d: Direction): Direction {
  return OPPOSITE[d];
}

export function isOpposite(a: Direction, b: Direction): boolean {
  return OPPOSITE[a] === b;
}

export function turnLeft(d: Direction): Direction {
  return DIRECTIONS[(DIRECTIONS.indexOf(d) + 3) % 4];
}

export function turnRight(d: Direction): Direction {
  return DIRECTIONS[(DIRECTIONS.indexOf(d) + 1) % 4];
}

/** Screen-space angle in radians (0 = right, PI/2 = down). */
export function directionAngle(d: Direction): number {
  const v = DIRECTION_VECTORS[d];
  return Math.atan2(v.y, v.x);
}

export function vecEquals(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Smallest signed difference from `from` to `to` on a ring of `size` cells. */
export function wrapDelta(from: number, to: number, size: number): number {
  let d = to - from;
  if (d > size / 2) d -= size;
  else if (d < -size / 2) d += size;
  return d;
}

/** Positive modulo. */
export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Shortest signed rotation from angle `from` to angle `to`. */
export function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Frame-rate independent exponential smoothing towards a target. */
export function approach(current: number, target: number, rate: number, dtSeconds: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dtSeconds));
}
