import { describe, expect, it } from 'vitest';
import { DIRECTIONS, type Vec2 } from '../core/geometry';
import { seededRng } from '../core/random';
import { Arena } from './Arena';
import { rectCells, rectsTooClose, type Rect } from './collision';
import { placeTiles } from './spawner';

const FIVE_ANSWERS = Array.from({ length: 5 }, () => ({ w: 2, h: 2 }));

function randomSnake(arena: Arena, length: number, seed: number): Vec2[] {
  const rng = seededRng(seed);
  const cells: Vec2[] = [{ x: Math.floor(rng.next() * arena.cols), y: Math.floor(rng.next() * arena.rows) }];
  const taken = new Set([`${cells[0].x},${cells[0].y}`]);
  while (cells.length < length) {
    const last = cells[cells.length - 1];
    const options = DIRECTIONS.map((d) => arena.next(last, d)).filter((p): p is Vec2 => !!p && !taken.has(`${p.x},${p.y}`));
    if (options.length === 0) break;
    const next = options[Math.floor(rng.next() * options.length)];
    cells.push(next);
    taken.add(`${next.x},${next.y}`);
  }
  return cells;
}

describe('placeTiles', () => {
  it('never overlaps the snake or other tiles, and stays inside the arena', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const arena = new Arena(20, 13, seed % 2 === 0 ? 'wrap' : 'solid');
      const snake = randomSnake(arena, 4 + (seed % 40), seed);
      const existing: Rect[] = [];
      const rects = placeTiles(
        { arena, snakeCells: snake, head: snake[0], direction: 'right', obstacles: existing, rng: seededRng(seed) },
        FIVE_ANSWERS,
      );
      if (!rects) continue;
      expect(rects).toHaveLength(5);
      const snakeKeys = new Set(snake.map((c) => `${c.x},${c.y}`));
      for (const r of rects) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(arena.cols);
        expect(r.y + r.h).toBeLessThanOrEqual(arena.rows);
        for (const c of rectCells(r)) expect(snakeKeys.has(`${c.x},${c.y}`)).toBe(false);
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) expect(rectsTooClose(rects[i], rects[j])).toBe(false);
      }
    }
  });

  it('keeps answers away from the snake head so nothing is eaten by accident', () => {
    const arena = new Arena(20, 13, 'wrap');
    for (let seed = 1; seed <= 100; seed++) {
      const snake = randomSnake(arena, 6, seed);
      const rects = placeTiles({ arena, snakeCells: snake, head: snake[0], direction: 'up', obstacles: [], rng: seededRng(seed) }, FIVE_ANSWERS);
      expect(rects).not.toBeNull();
      for (const r of rects!) {
        const closest = Math.min(...rectCells(r).map((c) => arena.distance(snake[0], c)));
        expect(closest).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('places a fair spread on a roomy board using the strictest rules', () => {
    const arena = new Arena(20, 13, 'wrap');
    const snake = [{ x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }, { x: 2, y: 6 }];
    const rects = placeTiles({ arena, snakeCells: snake, head: snake[0], direction: 'right', obstacles: [], rng: seededRng(1) }, FIVE_ANSWERS)!;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) expect(rectsTooClose(rects[i], rects[j], 1)).toBe(false);
    }
    for (const r of rects) {
      expect(Math.min(...rectCells(r).map((c) => arena.distance(snake[0], c)))).toBeGreaterThanOrEqual(5);
    }
  });

  it('returns null instead of overlapping when the arena is too full', () => {
    const arena = new Arena(6, 6, 'solid');
    const snake: Vec2[] = [];
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if (!(x < 2 && y < 2)) snake.push({ x, y });
    const rects = placeTiles({ arena, snakeCells: snake, head: snake[0], direction: 'right', obstacles: [], rng: seededRng(1) }, FIVE_ANSWERS);
    expect(rects).toBeNull();
  });
});
