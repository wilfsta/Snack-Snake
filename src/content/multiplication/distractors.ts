import { weightedPick, type Rng } from '../../core/random';

/**
 * Believable wrong answers for a × b. Each candidate models a real mistake a child makes,
 * weighted by how common that mistake is.
 */
export interface DistractorCandidate {
  readonly value: number;
  readonly weight: number;
  readonly reason: string;
}

function reverseDigits(n: number): number {
  return Number(String(n).split('').reverse().join(''));
}

export function multiplicationDistractorCandidates(a: number, b: number): DistractorCandidate[] {
  const correct = a * b;
  const byValue = new Map<number, DistractorCandidate>();
  const add = (value: number, weight: number, reason: string): void => {
    if (!Number.isInteger(value) || value <= 0 || value === correct || weight <= 0) return;
    const existing = byValue.get(value);
    // Several mistakes can lead to the same number - that makes it even more believable.
    byValue.set(value, { value, weight: (existing?.weight ?? 0) + weight, reason: existing?.reason ?? reason });
  };

  // Neighbouring facts: one step too far / not far enough along the table.
  add(a * (b + 1), 5, 'one step too high');
  add(a * (b - 1), 5, 'one step too low');
  add((a + 1) * b, 4, 'neighbouring table');
  add((a - 1) * b, 4, 'neighbouring table');
  add(a * (b + 2), 2, 'two steps too high');
  add(a * (b - 2), 2, 'two steps too low');
  add((a + 1) * (b + 1), 1, 'nearby fact');
  add((a - 1) * (b - 1), 1, 'nearby fact');
  add((a + 1) * (b - 1), 1, 'nearby fact');
  add((a - 1) * (b + 1), 1, 'nearby fact');

  // Counting slips.
  add(correct + 1, 1.5, 'counting slip');
  add(correct - 1, 1.5, 'counting slip');
  add(correct + 2, 1, 'counting slip');
  add(correct - 2, 1, 'counting slip');

  // Place-value slips and swapped digits (42 ↔ 24).
  if (correct >= 10) {
    add(correct + 10, 1.5, 'tens slip');
    add(correct - 10, 1.5, 'tens slip');
    const reversed = reverseDigits(correct);
    if (reversed >= 10) add(reversed, 2, 'swapped digits');
  }

  // Nearby round number (e.g. 40 for 42).
  add(Math.round(correct / 10) * 10, 1, 'nearby round number');
  // Added instead of multiplied.
  add(a + b, 0.75, 'added instead');

  return [...byValue.values()];
}

/**
 * Returns `count` unique, positive, wrong answers for a × b.
 * Falls back to nearby numbers if there are not enough plausible mistakes (e.g. 2 × 1).
 */
export function generateMultiplicationDistractors(a: number, b: number, count: number, rng: Rng): number[] {
  const correct = a * b;
  const pool = multiplicationDistractorCandidates(a, b);
  const chosen: number[] = [];

  while (chosen.length < count && pool.length > 0) {
    const candidate = weightedPick(rng, pool, (c) => c.weight);
    if (!candidate) break;
    chosen.push(candidate.value);
    pool.splice(pool.indexOf(candidate), 1);
  }

  // Fallback: other answers from the same table, then numbers close to the correct answer.
  for (let m = 1; chosen.length < count && m <= 12; m++) {
    const value = a * m;
    if (value !== correct && !chosen.includes(value)) chosen.push(value);
  }
  for (let k = 1; chosen.length < count; k++) {
    for (const value of [correct + k, correct - k]) {
      if (chosen.length < count && value > 0 && value !== correct && !chosen.includes(value)) chosen.push(value);
    }
  }
  return chosen;
}
