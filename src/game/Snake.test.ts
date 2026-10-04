import { describe, expect, it } from 'vitest';
import { Arena } from './Arena';
import { planMove, rectContains } from './collision';
import { Snake } from './Snake';

describe('direction handling', () => {
  it('rejects an instant 180° reversal', () => {
    const snake = new Snake({ x: 5, y: 5 }, 'right', 4);
    expect(snake.queueDirection('left')).toBe(false);
    expect(snake.peekDirection()).toBe('right');
  });

  it('checks reversal against the last queued turn, so quick double-presses cannot reverse', () => {
    const snake = new Snake({ x: 5, y: 5 }, 'right', 4);
    expect(snake.queueDirection('up')).toBe(true);
    // "left" is fine after "up" (it's a turn, not a reversal of up)...
    expect(snake.queueDirection('left')).toBe(true);
    // ...and the snake will go up first, then left - never straight back into itself.
    expect(snake.takeTurn()).toBe('up');
    expect(snake.takeTurn()).toBe('left');
  });

  it('ignores duplicate presses and caps the buffer', () => {
    const snake = new Snake({ x: 5, y: 5 }, 'right', 4);
    expect(snake.queueDirection('right')).toBe(false);
    expect(snake.queueDirection('up')).toBe(true);
    expect(snake.queueDirection('up')).toBe(false);
    expect(snake.queueDirection('right')).toBe(true);
    expect(snake.queueDirection('down')).toBe(false);
  });
});

describe('movement and collisions', () => {
  it('moves and keeps its length; grows when fed', () => {
    const arena = new Arena(10, 10, 'solid');
    const snake = new Snake({ x: 5, y: 5 }, 'right', 3);
    const out = planMove(snake, arena, snake.takeTurn());
    expect(out).toEqual({ kind: 'move', head: { x: 6, y: 5 } });
    if (out.kind === 'move') snake.moveTo(out.head);
    expect(snake.length).toBe(3);
    expect(snake.lastVacated).toEqual({ x: 3, y: 5 });
    snake.grow(1);
    snake.moveTo({ x: 7, y: 5 });
    expect(snake.length).toBe(4);
    expect(snake.lastVacated).toBeNull();
  });

  it('solid walls stop the snake; wrap walls send it to the other side', () => {
    const snake = new Snake({ x: 9, y: 2 }, 'right', 3);
    expect(planMove(snake, new Arena(10, 10, 'solid'), 'right')).toEqual({ kind: 'wall' });
    expect(planMove(snake, new Arena(10, 10, 'wrap'), 'right')).toEqual({ kind: 'move', head: { x: 0, y: 2 } });
  });

  it('detects running into its own body', () => {
    const arena = new Arena(10, 10, 'solid');
    // A 5-long snake curled so that turning down from the head hits the body.
    const snake = new Snake({ x: 5, y: 5 }, 'right', 5);
    snake.moveTo({ x: 5, y: 4 }); // head up
    snake.moveTo({ x: 4, y: 4 }); // head left
    const out = planMove(snake, arena, 'down');
    expect(out.kind).toBe('self');
  });

  it('may move into the tail cell because the tail moves away at the same time', () => {
    const arena = new Arena(10, 10, 'solid');
    const snake = new Snake({ x: 1, y: 0 }, 'right', 4);
    snake.moveTo({ x: 1, y: 1 });
    snake.moveTo({ x: 0, y: 1 });
    // Body is now (0,1) (1,1) (1,0) (0,0); the tail is at (0,0), directly above the head.
    expect(snake.body[snake.length - 1]).toEqual({ x: 0, y: 0 });
    expect(planMove(snake, arena, 'up')).toEqual({ kind: 'move', head: { x: 0, y: 0 } });
    // ...but not if the snake is growing (the tail stays put).
    snake.grow(1);
    expect(planMove(snake, arena, 'up').kind).toBe('self');
  });

  it('truncate removes the tail end', () => {
    const snake = new Snake({ x: 5, y: 5 }, 'right', 6);
    const removed = snake.truncate(4);
    expect(snake.length).toBe(4);
    expect(removed).toHaveLength(2);
  });

  it('tile hit-testing covers the whole tile footprint', () => {
    const tile = { x: 3, y: 4, w: 2, h: 2 };
    expect(rectContains(tile, { x: 3, y: 4 })).toBe(true);
    expect(rectContains(tile, { x: 4, y: 5 })).toBe(true);
    expect(rectContains(tile, { x: 5, y: 5 })).toBe(false);
    expect(rectContains(tile, { x: 2, y: 4 })).toBe(false);
  });
});
