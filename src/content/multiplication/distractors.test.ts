import { describe, expect, it } from 'vitest';
import { seededRng } from '../../core/random';
import { generateMultiplicationDistractors, multiplicationDistractorCandidates } from './distractors';

const TABLES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe('generateMultiplicationDistractors', () => {
  it('always returns 4 unique, positive, wrong whole numbers for every fact', () => {
    for (const a of TABLES) {
      for (let b = 1; b <= 12; b++) {
        for (let seed = 1; seed <= 15; seed++) {
          const wrong = generateMultiplicationDistractors(a, b, 4, seededRng(seed * 977 + a * 31 + b));
          expect(wrong).toHaveLength(4);
          expect(new Set(wrong).size).toBe(4);
          for (const v of wrong) {
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThan(0);
            expect(v).not.toBe(a * b);
          }
        }
      }
    }
  });

  it('prefers believable mistakes close to the real answer', () => {
    // 7 × 6 = 42: the neighbouring facts 36 and 48 are the classic mistakes and should come up most.
    const runs = 300;
    const counts = new Map<number, number>();
    for (let seed = 0; seed < runs; seed++) {
      for (const v of generateMultiplicationDistractors(7, 6, 4, seededRng(seed))) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
    expect(ranked.slice(0, 4)).toEqual(expect.arrayContaining([36, 48]));
    expect((counts.get(36) ?? 0) / runs).toBeGreaterThan(0.4);
    // Nothing wildly off (no random numbers like 3 or 97).
    for (const v of counts.keys()) expect(Math.abs(v - 42)).toBeLessThanOrEqual(30);
  });

  it('includes neighbouring-table and swapped-digit candidates', () => {
    const values = multiplicationDistractorCandidates(7, 6).map((c) => c.value);
    expect(values).toEqual(expect.arrayContaining([36, 48, 35, 49, 24]));
    expect(values).not.toContain(42);
  });

  it('still works for tiny facts with few natural mistakes', () => {
    const wrong = generateMultiplicationDistractors(2, 1, 4, seededRng(3));
    expect(wrong).toHaveLength(4);
    expect(wrong).not.toContain(2);
    expect(Math.min(...wrong)).toBeGreaterThan(0);
  });
});
