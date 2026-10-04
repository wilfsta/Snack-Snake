export interface Rng {
  /** Returns a float in [0, 1). */
  next(): number;
}

export const defaultRng: Rng = { next: () => Math.random() };

/** Small deterministic PRNG (mulberry32) for tests and reproducible runs. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function randInt(rng: Rng, min: number, maxInclusive: number): number {
  return min + Math.floor(rng.next() * (maxInclusive - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() called with an empty list');
  return items[Math.floor(rng.next() * items.length)];
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Picks one item with probability proportional to its weight. Returns undefined if all weights are 0. */
export function weightedPick<T>(rng: Rng, items: readonly T[], weightOf: (item: T) => number): T | undefined {
  const weights = items.map((item) => Math.max(0, weightOf(item)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return undefined;
  let r = rng.next() * total;
  let lastPositive: T | undefined;
  for (let i = 0; i < items.length; i++) {
    if (weights[i] <= 0) continue;
    lastPositive = items[i];
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return lastPositive;
}
