import { pick, type Rng } from '../../core/random';

/**
 * Different pictures of the same quantity. Seeing 7 as apples, dots, a ten frame and fingers
 * builds a flexible sense of "seven", and stops a child relying on one shortcut such as
 * "a full row plus two".
 *
 * All pictures are at most two lines, so they fit on a tile.
 */
export type QuantityStyle = 'apples' | 'dots' | 'frame' | 'dice' | 'fingers';

const FILLED = '●';
/** Frames use emoji counters so filled and empty spaces are always exactly the same size. */
const COUNTER = '🔴';
const SPACE = '⚪';

function rows(n: number, glyph: string, perRow = 5): string {
  const out: string[] = [];
  for (let left = n; left > 0; left -= perRow) out.push(glyph.repeat(Math.min(perRow, left)));
  return out.join('\n');
}

/** A five frame (n ≤ 5) or a ten frame (n ≤ 10): filled and empty spaces, two rows of five. */
export function framePicture(n: number, size: 5 | 10 = n <= 5 ? 5 : 10): string {
  const cells = [...Array(n).fill(COUNTER), ...Array(Math.max(0, size - n)).fill(SPACE)];
  return size === 5 ? cells.join('') : `${cells.slice(0, 5).join('')}\n${cells.slice(5, 10).join('')}`;
}

/** Dice-like arrangements in two rows, for quantities you can see at a glance. */
const DICE: Readonly<Record<number, string>> = {
  1: '●',
  2: '●●',
  3: '●●\n●',
  4: '●●\n●●',
  5: '●●●\n●●',
  6: '●●●\n●●●',
};

/** Hands: 🖐️ is five. Only quantities that are easy to show with hand emoji. */
const FINGERS: Readonly<Record<number, string>> = {
  1: '☝️',
  2: '✌️',
  5: '🖐️',
  6: '🖐️☝️',
  7: '🖐️✌️',
  10: '🖐️🖐️',
};

export function stylesFor(n: number): QuantityStyle[] {
  const styles: QuantityStyle[] = ['apples', 'dots'];
  if (n <= 10) styles.push('frame');
  if (DICE[n]) styles.push('dice');
  if (FINGERS[n]) styles.push('fingers');
  return styles;
}

export function quantityPicture(n: number, style: QuantityStyle): string {
  switch (style) {
    case 'apples':
      return rows(n, '🍎');
    case 'dots':
      return rows(n, FILLED);
    case 'frame':
      return n <= 10 ? framePicture(n) : rows(n, FILLED);
    case 'dice':
      return DICE[n] ?? framePicture(n);
    case 'fingers':
      return FINGERS[n] ?? rows(n, FILLED);
  }
}

/** A random picture style that works for every quantity given (so answer choices match). */
export function sharedStyle(rng: Rng, quantities: readonly number[], allowed: readonly QuantityStyle[]): QuantityStyle {
  const usable = allowed.filter((s) => quantities.every((q) => stylesFor(q).includes(s)));
  return usable.length > 0 ? pick(rng, usable) : 'dots';
}

/**
 * `groups` groups of `size` things, two groups per line: "🍎🍎  🍎🍎\n🍎🍎". Big groups use
 * compact dots so the picture still fits on a phone-sized arena.
 */
export function groupsPicture(groups: number, size: number, glyph = size >= 4 ? '●' : '🍎'): string {
  const parts = Array.from({ length: groups }, () => glyph.repeat(size));
  const lines: string[] = [];
  for (let i = 0; i < parts.length; i += 2) lines.push(parts.slice(i, i + 2).join('  '));
  return lines.join('\n');
}
