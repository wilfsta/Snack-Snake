import { ArithmeticContent, mixedUnitId, unitId } from '../arithmetic/ArithmeticContent';
import { MULTIPLICATION } from '../arithmetic/operations';

export { INTRODUCTION_ORDER, INITIAL_BATCH } from '../arithmetic/ArithmeticContent';

export const MULTIPLICATION_SUBJECT_ID = MULTIPLICATION.id;
export const TIMES_TABLES: readonly number[] = MULTIPLICATION.units;
export const MAX_MULTIPLIER = 12;
export const MIXED_UNIT_ID = mixedUnitId(MULTIPLICATION);

export function tableUnitId(table: number): string {
  return unitId(MULTIPLICATION, table);
}

export function factId(a: number, b: number): string {
  return MULTIPLICATION.itemId(a, b);
}

export function parseFactId(itemId: string): { a: number; b: number } | null {
  const p = MULTIPLICATION.parseItemId(itemId);
  return p ? { a: p.n, b: p.k } : null;
}

/** Times tables content (kept as its own class for convenience; it is the generic arithmetic content). */
export class MultiplicationContent extends ArithmeticContent {
  constructor() {
    super(MULTIPLICATION);
  }
}
