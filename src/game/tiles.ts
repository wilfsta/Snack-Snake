import type { Rect } from './collision';

/**
 * question: the prompt to eat ("6 × 4")
 * answer:   one of the five choices
 * fact:     a complete fact to collect during a learning introduction ("6 × 4 = 24")
 * food:     a plain snack for Classic mode
 */
export type TileKind = 'question' | 'answer' | 'fact' | 'food';
export type TileMark = 'none' | 'correct' | 'wrong';

export interface Tile extends Rect {
  readonly id: number;
  readonly kind: TileKind;
  readonly label: string;
  readonly optionId: string | null;
  readonly isCorrect: boolean;
  /** Session time (ms) the tile appears; used for staggered pop-in. */
  readonly bornAt: number;
  /** 0..1 strength of the "this one!" hint glow. */
  hint: number;
  mark: TileMark;
}

/**
 * Rough printed width of a line in "em" units. Emoji (pictures, e.g. counting apples) are about
 * twice as wide as digits and letters.
 */
export function textWidthUnits(line: string): number {
  let units = 0;
  for (const ch of Array.from(line)) {
    const cp = ch.codePointAt(0) ?? 0;
    // Emoji pictures (🍎 🔴) and symbol-emoji (⚪ ☝ ✌) are wide; variation selectors take no space.
    if (cp === 0xfe0f) continue;
    units += cp >= 0x1f000 || (cp >= 0x2600 && cp <= 0x27bf) ? 1.15 : 0.6;
  }
  return units;
}

/**
 * Tile footprint in cells, sized from its label so longer content (future spelling words, pictures)
 * still fits. Labels may contain "\n" for two lines; tiles are two cells tall either way.
 */
export function measureTile(kind: TileKind, label: string): { w: number; h: number } {
  const units = Math.max(0, ...label.split('\n').map(textWidthUnits));
  switch (kind) {
    case 'answer':
      return { w: Math.max(2, Math.ceil(units)), h: 2 };
    case 'question':
      return { w: Math.max(3, Math.ceil(units * 0.667)), h: 2 };
    case 'fact':
      return { w: Math.max(4, Math.ceil(units * 0.7)), h: 2 };
    case 'food':
      return { w: 1, h: 1 };
  }
}
