import { describe, expect, it } from 'vitest';
import { createMasteryRecord, recentAccuracy, sanitizeRecord, withAttempt, withIntroduction, type AttemptInput, type MasteryRecord } from './mastery';

const independent = (correct: boolean, firstTry = true): AttemptInput => ({ kind: 'independent', correct, firstTry, hintStrength: 0 });
const guided = (correct: boolean, hintStrength = 1, firstTry = true): AttemptInput => ({ kind: 'guided', correct, firstTry, hintStrength });

function apply(rec: MasteryRecord, attempts: AttemptInput[]): MasteryRecord {
  return attempts.reduce((r, a) => withAttempt(r, a, 1000), rec);
}

describe('mastery', () => {
  it('starts NEW and becomes LEARNING once introduced', () => {
    const rec = createMasteryRecord('x');
    expect(rec.state).toBe('NEW');
    expect(withIntroduction(rec, 0).state).toBe('LEARNING');
  });

  it('is never MASTERED after a single correct answer', () => {
    const rec = apply(withIntroduction(createMasteryRecord('x'), 0), [independent(true)]);
    expect(rec.state).not.toBe('MASTERED');
  });

  it('requires repeated independent recall to become MASTERED', () => {
    let rec = withIntroduction(createMasteryRecord('x'), 0);
    rec = apply(rec, [guided(true), guided(true, 0.7), guided(true, 0.4)]);
    rec = apply(rec, [independent(true), independent(true)]);
    expect(rec.state).not.toBe('MASTERED');
    rec = apply(rec, [independent(true), independent(true)]);
    expect(rec.state).toBe('MASTERED');
    expect(rec.consecutiveCorrect).toBeGreaterThanOrEqual(3);
  });

  it('guided answers alone can never reach MASTERED', () => {
    let rec = withIntroduction(createMasteryRecord('x'), 0);
    rec = apply(rec, Array.from({ length: 30 }, () => guided(true, 0.25)));
    expect(rec.masteryScore).toBeLessThanOrEqual(60);
    expect(rec.state).toBe('LEARNING');
  });

  it('independent recall is worth more than a guided answer', () => {
    const base = withIntroduction(createMasteryRecord('x'), 0);
    expect(withAttempt(base, independent(true), 0).masteryScore).toBeGreaterThan(withAttempt(base, guided(true, 0.25), 0).masteryScore);
  });

  it('a wrong independent answer resets the streak and lowers the score', () => {
    let rec = apply(withIntroduction(createMasteryRecord('x'), 0), [independent(true), independent(true)]);
    const before = rec.masteryScore;
    rec = withAttempt(rec, independent(false), 0);
    expect(rec.consecutiveCorrect).toBe(0);
    expect(rec.masteryScore).toBeLessThan(before);
    expect(rec.incorrectAttempts).toBe(1);
  });

  it('one slip does not instantly un-master a fact, but repeated slips do', () => {
    let rec = withIntroduction(createMasteryRecord('x'), 0);
    rec = apply(rec, Array.from({ length: 6 }, () => independent(true)));
    expect(rec.state).toBe('MASTERED');
    rec = withAttempt(rec, independent(false), 0);
    expect(rec.state).toBe('MASTERED');
    rec = apply(rec, [independent(false), independent(false), independent(false)]);
    expect(rec.state).not.toBe('MASTERED');
  });

  it('tracks counts and recent performance', () => {
    const rec = apply(createMasteryRecord('x'), [guided(true), guided(false), independent(true), independent(false, false)]);
    expect(rec.guidedAttempts).toBe(2);
    expect(rec.independentAttempts).toBe(2);
    expect(rec.correctAttempts).toBe(2);
    expect(rec.incorrectAttempts).toBe(2);
    expect(rec.recent).toBe('GgIi');
    expect(recentAccuracy(rec)).toBe(0.5);
    expect(rec.lastAttempted).toBe(1000);
  });

  it('sanitizes corrupted saved records', () => {
    const rec = sanitizeRecord('x', { masteryScore: 'lots', recent: 'GGzzI', state: 'BOGUS', independentCorrect: 2 });
    expect(rec.masteryScore).toBe(0);
    expect(rec.recent).toBe('GGI');
    expect(['NEW', 'LEARNING', 'PRACTISING', 'MASTERED']).toContain(rec.state);
  });
});
