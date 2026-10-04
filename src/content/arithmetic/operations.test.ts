import { describe, expect, it } from 'vitest';
import { seededRng } from '../../core/random';
import { createContentLibrary } from '../ContentLibrary';
import { ArithmeticContent, mixedUnitId, unitId } from './ArithmeticContent';
import { ADDITION, DIVISION, MULTIPLICATION, OPERATIONS, SUBTRACTION } from './operations';

describe('arithmetic operations', () => {
  it('computes the right facts', () => {
    expect(MULTIPLICATION.fact(6, 4)).toEqual({ left: 6, right: 4, answer: 24 });
    expect(ADDITION.fact(3, 7)).toEqual({ left: 7, right: 3, answer: 10 });
    expect(SUBTRACTION.fact(3, 7)).toEqual({ left: 10, right: 3, answer: 7 });
    expect(DIVISION.fact(4, 6)).toEqual({ left: 24, right: 4, answer: 6 });
  });

  it('item ids round-trip for every operation', () => {
    for (const op of OPERATIONS) {
      for (const n of op.units) {
        for (let k = 1; k <= 12; k++) expect(op.parseItemId(op.itemId(n, k))).toEqual({ n, k });
      }
    }
    expect(MULTIPLICATION.itemId(6, 4)).toBe('mul:6x4'); // unchanged, so saved progress still loads
  });

  it('every fact in every subject has unique, non-negative, wrong distractors for 1–5 wrong answers', () => {
    let seed = 1;
    for (const op of OPERATIONS) {
      for (const n of op.units) {
        for (let k = 1; k <= 12; k++) {
          const answer = op.fact(n, k).answer;
          for (const count of [1, 3, 5]) {
            const wrong = op.distractors(n, k, count, seededRng(seed++));
            expect(wrong).toHaveLength(count);
            expect(new Set(wrong).size).toBe(count);
            for (const v of wrong) {
              expect(Number.isInteger(v)).toBe(true);
              expect(v).toBeGreaterThanOrEqual(0);
              expect(v).not.toBe(answer);
            }
          }
        }
      }
    }
  });

  it('subtraction and division never produce negative or fractional answers', () => {
    for (const op of [SUBTRACTION, DIVISION]) {
      for (const n of op.units) {
        for (let k = 1; k <= 12; k++) {
          const { answer } = op.fact(n, k);
          expect(Number.isInteger(answer)).toBe(true);
          expect(answer).toBeGreaterThan(0);
        }
      }
    }
  });

  it('teaching aids count on, count back and count in steps', () => {
    expect(ADDITION.teaching(3, 7).steps).toEqual(['8', '9', '10']);
    expect(SUBTRACTION.teaching(3, 7).steps).toEqual(['9', '8', '7']);
    expect(DIVISION.teaching(4, 3).steps).toEqual(['4', '8', '12']);
  });
});

describe('content library', () => {
  const library = createContentLibrary();

  it('routes units and items to the right subject', () => {
    expect(library.getUnit(unitId(ADDITION, 3))?.title).toBe('Adding 3');
    expect(library.getUnit(mixedUnitId(DIVISION))?.supportsLearning).toBe(false);
    const ch = library.createChallenge(DIVISION.itemId(4, 6), {
      challengeId: 'x',
      stage: 'independent',
      hintStrength: 0,
      distractorCount: 4,
      rng: seededRng(1),
    });
    expect(ch.prompt).toBe('24 ÷ 4');
    expect(ch.correctAnswer.label).toBe('6');
    expect(library.describeItem(SUBTRACTION.itemId(2, 5)).full).toBe('7 − 2 = 5');
  });

  it('each subject unit has 12 facts in order', () => {
    for (const op of OPERATIONS) {
      const content = new ArithmeticContent(op);
      const unit = content.getUnit(unitId(op, op.units[0]))!;
      expect(unit.itemIds).toEqual(Array.from({ length: 12 }, (_, i) => op.itemId(op.units[0], i + 1)));
    }
  });
});
