import { weightedPick, type Rng } from '../../core/random';

export interface Candidate {
  readonly value: number;
  readonly weight: number;
}

/**
 * Picks `count` unique believable wrong answers from weighted candidates, topping up with
 * nearby numbers if there are not enough. Never returns the correct answer or a negative number.
 */
export function pickDistractors(correct: number, candidates: readonly Candidate[], count: number, rng: Rng, allowZero = false): number[] {
  const min = allowZero ? 0 : 1;
  const pool = new Map<number, number>();
  for (const c of candidates) {
    if (!Number.isInteger(c.value) || c.value < min || c.value === correct || c.weight <= 0) continue;
    pool.set(c.value, (pool.get(c.value) ?? 0) + c.weight);
  }
  const entries = [...pool.entries()].map(([value, weight]) => ({ value, weight }));
  const chosen: number[] = [];
  while (chosen.length < count && entries.length > 0) {
    const pick = weightedPick(rng, entries, (e) => e.weight);
    if (!pick) break;
    chosen.push(pick.value);
    entries.splice(entries.indexOf(pick), 1);
  }
  for (let d = 1; chosen.length < count; d++) {
    for (const v of [correct + d, correct - d]) {
      if (chosen.length < count && v >= min && v !== correct && !chosen.includes(v)) chosen.push(v);
    }
  }
  return chosen;
}
