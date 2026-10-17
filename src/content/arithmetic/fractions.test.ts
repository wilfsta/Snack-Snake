import { describe, expect, it } from 'vitest';
import { seededRng } from '../../core/random';
import { measureTile } from '../../game/tiles';
import { createContentLibrary } from '../ContentLibrary';
import { unitId } from './ArithmeticContent';
import { FRACTIONS, PERCENTAGES } from './fractions';

const library = createContentLibrary();
const ask = (itemId: string, seed = 1, wrong = 5) =>
  library.createChallenge(itemId, { challengeId: 'x', stage: 'independent', hintStrength: 0, distractorCount: wrong, rng: seededRng(seed) });

describe('fractions of an amount', () => {
  it('asks "¾ of 16" and expects 12', () => {
    const ch = ask(FRACTIONS.itemId(304, 4));
    expect(ch.prompt).toBe('¾ of 16');
    expect(ch.correctAnswer.label).toBe('12');
    expect(ask(FRACTIONS.itemId(102, 6)).prompt).toBe('½ of 12');
    expect(ask(FRACTIONS.itemId(102, 6)).correctAnswer.label).toBe('6');
    expect(library.describeItem(FRACTIONS.itemId(203, 5)).full).toBe('⅔ of 15 = 10');
  });

  it('starts with halves and quarters, and unit fractions come before ¾, ⅔ …', () => {
    expect(FRACTIONS.units.map((n) => FRACTIONS.unitLabel(n))).toEqual(['½', '¼', '⅓', '⅕', '⅒', '⅙', '⅛', '¾', '⅔', '⅖', '⅗', '⅘']);
    expect(library.getUnit(unitId(FRACTIONS, 304))?.title).toBe('¾ of a number');
  });

  it('teaches the method: share into equal parts, then take as many as the top number says', () => {
    expect(FRACTIONS.teaching(104, 3)).toEqual({ caption: 'Share 12 into 4 equal parts', steps: ['12 ÷ 4 = 3'] });
    expect(FRACTIONS.teaching(304, 3)).toEqual({ caption: 'Find ¼ first, then take 3 of them', steps: ['12 ÷ 4 = 3', '3 × 3 = 9'] });
  });

  it('offers the classic mistake of forgetting the top number', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed < 40; seed++) for (const v of FRACTIONS.distractors(304, 4, 3, seededRng(seed))) seen.add(v);
    expect(seen.has(4)).toBe(true); // ¼ of 16, not ¾
    expect(seen.has(12)).toBe(false); // never the right answer
  });
});

describe('percentages of an amount', () => {
  it('uses friendly amounts that always give a whole-number answer', () => {
    for (const p of PERCENTAGES.units) {
      for (let k = 1; k <= 12; k++) {
        const { left: amount, answer } = PERCENTAGES.fact(p, k);
        expect(amount % 10, `${p}% of ${amount}`).toBe(0);
        expect(Number.isInteger(answer)).toBe(true);
        expect(answer).toBe((p * amount) / 100);
      }
    }
    expect(ask(PERCENTAGES.itemId(25, 4)).prompt).toBe('25% of 80');
    expect(ask(PERCENTAGES.itemId(25, 4)).correctAnswer.label).toBe('20');
    expect(ask(PERCENTAGES.itemId(50, 1)).prompt).toBe('50% of 10');
  });

  it('teaches halving, tenths and building from 10%', () => {
    expect(PERCENTAGES.teaching(25, 4).steps).toEqual(['80 ÷ 2 = 40', '40 ÷ 2 = 20']);
    expect(PERCENTAGES.teaching(30, 5)).toEqual({ caption: 'Find 10%, then take 3 lots', steps: ['10% = 5', '30% = 15'] });
    expect(PERCENTAGES.teaching(5, 2).steps).toEqual(['10% = 4', '5% = 2']);
  });

  it('offers believable mistakes like finding 10% or half instead', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed < 40; seed++) for (const v of PERCENTAGES.distractors(25, 4, 3, seededRng(seed))) seen.add(v);
    expect(seen.has(8)).toBe(true); // 10% of 80
    expect(seen.has(40)).toBe(true); // half of 80
    expect(seen.has(60)).toBe(true); // 75% – the part left over
  });
});

describe('fits the game', () => {
  it('every question, answer and worked step fits on the tiles and panels', () => {
    let seed = 1;
    for (const op of [FRACTIONS, PERCENTAGES]) {
      for (const n of op.units) {
        for (let k = 1; k <= 12; k++) {
          const ch = ask(op.itemId(n, k), seed++, 5);
          expect(measureTile('question', ch.prompt).w, ch.prompt).toBeLessThanOrEqual(8);
          expect(measureTile('fact', ch.statement).w, ch.statement).toBeLessThanOrEqual(12);
          for (const o of [ch.correctAnswer, ...ch.distractors]) expect(measureTile('answer', o.label).w, o.label).toBeLessThanOrEqual(6);
          // The last worked step lands on the answer.
          expect(ch.teaching?.steps.at(-1), ch.prompt).toContain(`= ${ch.correctAnswer.label}`);
        }
      }
    }
  });
});
