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

/** Tile footprint in cells, sized from its label so longer content (future spelling words) still fits. */
export function measureTile(kind: TileKind, label: string): { w: number; h: number } {
  const chars = label.length;
  switch (kind) {
    case 'answer':
      return { w: Math.max(2, Math.ceil(chars * 0.6)), h: 2 };
    case 'question':
      return { w: Math.max(3, Math.ceil(chars * 0.4)), h: 2 };
    case 'fact':
      return { w: Math.max(4, Math.ceil(chars * 0.42)), h: 2 };
    case 'food':
      return { w: 1, h: 1 };
  }
}
