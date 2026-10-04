import { describe, expect, it } from 'vitest';
import { stickDirection } from './GamepadInput';

describe('analogue stick', () => {
  it('ignores small movements inside the dead zone', () => {
    expect(stickDirection(0.2, 0.1, null)).toBeNull();
    expect(stickDirection(-0.3, 0.3, null)).toBeNull();
  });

  it('maps clear pushes to directions', () => {
    expect(stickDirection(0.9, 0.1, null)).toBe('right');
    expect(stickDirection(-0.9, 0, null)).toBe('left');
    expect(stickDirection(0, -0.9, null)).toBe('up');
    expect(stickDirection(0.1, 0.9, null)).toBe('down');
  });

  it('holds the current axis near diagonals so it does not flicker', () => {
    // Slightly more vertical than horizontal, but we were going right: stay right.
    expect(stickDirection(0.65, 0.7, 'right')).toBe('right');
    // A clearly vertical push still turns.
    expect(stickDirection(0.3, 0.9, 'right')).toBe('down');
  });
});
