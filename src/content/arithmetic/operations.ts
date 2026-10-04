import { clamp } from '../../core/geometry';
import { weightedPick, type Rng } from '../../core/random';
import type { TeachingAid } from '../../learning/types';
import { generateMultiplicationDistractors } from '../multiplication/distractors';

/** One arithmetic fact, e.g. 6 × 4 = 24 (left=6, right=4, answer=24). */
export interface ArithmeticFact {
  readonly left: number;
  readonly right: number;
  readonly answer: number;
}

/**
 * Everything specific to one kind of arithmetic. Each unit is a number n (e.g. "the 6× table",
 * "adding 3") containing 12 facts, k = 1..12, which are introduced in that order.
 */
export interface ArithmeticOperation {
  /** Item/unit id prefix. */
  readonly id: string;
  readonly name: string;
  readonly symbol: string;
  readonly units: readonly number[];
  /** Short label for a unit button, e.g. "6×", "+3". */
  unitLabel(n: number): string;
  /** Longer title, e.g. "6× table", "Adding 3". */
  unitTitle(n: number): string;
  itemId(n: number, k: number): string;
  parseItemId(itemId: string): { n: number; k: number } | null;
  fact(n: number, k: number): ArithmeticFact;
  distractors(n: number, k: number, count: number, rng: Rng): number[];
  teaching(n: number, k: number): TeachingAid;
  difficulty(n: number, k: number): number;
}

export const STEPS_PER_UNIT = 12;

interface Candidate {
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

function reverseDigits(n: number): number {
  return Number(String(n).split('').reverse().join(''));
}

function counting(from: number, to: number): string[] {
  const steps: string[] = [];
  const dir = to >= from ? 1 : -1;
  for (let v = from + dir; dir > 0 ? v <= to : v >= to; v += dir) steps.push(String(v));
  return steps;
}

function idParser(prefix: string, sep: string) {
  const escaped = sep.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
  const re = new RegExp(`^${prefix}:(\\d+)${escaped}(\\d+)$`);
  return (itemId: string): { n: number; k: number } | null => {
    const m = re.exec(itemId);
    return m ? { n: Number(m[1]), k: Number(m[2]) } : null;
  };
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const EASE: Readonly<Record<number, number>> = {
  1: 0, 2: 0.05, 10: 0.05, 5: 0.15, 11: 0.2, 3: 0.3, 4: 0.35, 6: 0.6, 9: 0.6, 8: 0.75, 7: 0.8, 12: 0.75,
};
function tableDifficulty(a: number, b: number): number {
  const da = EASE[a] ?? 0.5;
  const db = EASE[b] ?? 0.5;
  return clamp(Math.min(da, db) * 0.7 + Math.max(da, db) * 0.3, 0, 1);
}

export const MULTIPLICATION: ArithmeticOperation = {
  id: 'mul',
  name: 'Times tables',
  symbol: '×',
  units: range(2, 12),
  unitLabel: (n) => `${n}×`,
  unitTitle: (n) => `${n}× table`,
  itemId: (n, k) => `mul:${n}x${k}`,
  parseItemId: idParser('mul', 'x'),
  fact: (n, k) => ({ left: n, right: k, answer: n * k }),
  distractors: (n, k, count, rng) => generateMultiplicationDistractors(n, k, count, rng),
  teaching: (n, k) => ({ caption: `Count in ${n}s`, steps: range(1, k).map((i) => String(n * i)) }),
  difficulty: tableDifficulty,
};

export const ADDITION: ArithmeticOperation = {
  id: 'add',
  name: 'Adding',
  symbol: '+',
  units: range(1, 12),
  unitLabel: (n) => `+${n}`,
  unitTitle: (n) => `Adding ${n}`,
  itemId: (n, k) => `add:${n}+${k}`,
  parseItemId: idParser('add', '+'),
  fact: (n, k) => ({ left: k, right: n, answer: k + n }),
  distractors: (n, k, count, rng) => {
    const c = k + n;
    const cands: Candidate[] = [
      { value: c + 1, weight: 5 },
      { value: c - 1, weight: 5 },
      { value: c + 2, weight: 2 },
      { value: c - 2, weight: 2 },
      { value: Math.abs(k - n), weight: 1 }, // took away instead
      { value: c + 10, weight: c >= 8 ? 1 : 0 },
      { value: c - 10, weight: c >= 12 ? 1.5 : 0 },
      { value: reverseDigits(c), weight: c >= 12 ? 1.5 : 0 },
    ];
    return pickDistractors(c, cands, count, rng);
  },
  teaching: (n, k) => ({ caption: `Start at ${k}, count on ${n}`, steps: counting(k, k + n) }),
  difficulty: (n, k) => clamp((n + k) / 24, 0, 1),
};

export const SUBTRACTION: ArithmeticOperation = {
  id: 'sub',
  name: 'Taking away',
  symbol: '−',
  units: range(1, 12),
  unitLabel: (n) => `−${n}`,
  unitTitle: (n) => `Taking away ${n}`,
  itemId: (n, k) => `sub:${n}-${k}`,
  parseItemId: idParser('sub', '-'),
  fact: (n, k) => ({ left: k + n, right: n, answer: k }),
  distractors: (n, k, count, rng) => {
    const c = k;
    const cands: Candidate[] = [
      { value: c + 1, weight: 5 },
      { value: c - 1, weight: 5 },
      { value: c + 2, weight: 2 },
      { value: c - 2, weight: 2 },
      { value: k + n + n, weight: 1 }, // added instead
      { value: n, weight: n !== c ? 1 : 0 }, // gave the number taken away
      { value: c + 10, weight: k + n >= 10 ? 1 : 0 },
    ];
    return pickDistractors(c, cands, count, rng);
  },
  teaching: (n, k) => ({ caption: `Start at ${k + n}, count back ${n}`, steps: counting(k + n, k) }),
  difficulty: (n, k) => clamp((n + k) / 24 + 0.1, 0, 1),
};

export const DIVISION: ArithmeticOperation = {
  id: 'div',
  name: 'Sharing (÷)',
  symbol: '÷',
  units: range(2, 12),
  unitLabel: (n) => `÷${n}`,
  unitTitle: (n) => `Dividing by ${n}`,
  itemId: (n, k) => `div:${n}/${k}`,
  parseItemId: idParser('div', '/'),
  fact: (n, k) => ({ left: n * k, right: n, answer: k }),
  distractors: (n, k, count, rng) => {
    const c = k;
    const total = n * k;
    const cands: Candidate[] = [
      { value: c + 1, weight: 5 },
      { value: c - 1, weight: 5 },
      { value: c + 2, weight: 2 },
      { value: c - 2, weight: 2 },
      { value: n, weight: n !== c ? 1.5 : 0 }, // gave the divisor
      { value: total / (n + 1), weight: 2 }, // used a neighbouring table (only whole numbers survive)
      { value: total / (n - 1), weight: 2 },
      { value: total - n, weight: total - n > 12 ? 0.5 : 0 }, // subtracted instead
    ];
    return pickDistractors(c, cands, count, rng);
  },
  teaching: (n, k) => ({ caption: `Count in ${n}s to ${n * k} – that's ${k} jump${k === 1 ? '' : 's'}`, steps: range(1, k).map((i) => String(n * i)) }),
  difficulty: (n, k) => clamp(tableDifficulty(n, k) + 0.1, 0, 1),
};

export const OPERATIONS: readonly ArithmeticOperation[] = [MULTIPLICATION, ADDITION, SUBTRACTION, DIVISION];

export function operationById(id: string): ArithmeticOperation | undefined {
  return OPERATIONS.find((op) => op.id === id);
}
