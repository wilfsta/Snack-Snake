import { describe, expect, it } from 'vitest';
import { seededRng } from '../core/random';
import { createMasteryRecord, withAttempt, withIntroduction, type AttemptInput, type MasteryRecord } from './mastery';
import { pickNextItem, planStage, selectionWeight, shouldUnlockMore } from './selection';

const ind = (correct: boolean): AttemptInput => ({ kind: 'independent', correct, firstTry: true, hintStrength: 0 });

function record(id: string, attempts: AttemptInput[], lastSeenStep = 0): MasteryRecord {
  const rec = attempts.reduce((r, a) => withAttempt(r, a, 0), withIntroduction(createMasteryRecord(id), 0));
  return { ...rec, lastSeenStep };
}

describe('adaptive selection', () => {
  it('shows struggling facts more often than known facts', () => {
    const hard = record('7x8', [ind(false), ind(false), ind(true), ind(false)]);
    const easy = record('5x2', [ind(true), ind(true), ind(true), ind(true), ind(true)]);
    const rng = seededRng(42);
    const counts = { hard: 0, easy: 0 };
    for (let i = 0; i < 2000; i++) {
      const pickRec = pickNextItem([hard, easy], 20, [], rng);
      if (pickRec === hard) counts.hard++;
      else counts.easy++;
    }
    expect(counts.hard).toBeGreaterThan(counts.easy * 2);
    // ...but known facts still come back occasionally.
    expect(counts.easy).toBeGreaterThan(0);
  });

  it('never repeats the challenge that was just shown when there is an alternative', () => {
    const a = record('a', [ind(false), ind(false)]);
    const b = record('b', [ind(true)]);
    const rng = seededRng(7);
    for (let i = 0; i < 200; i++) expect(pickNextItem([a, b], 10, ['a'], rng).itemId).toBe('b');
  });

  it('spaces repetitions: an item seen long ago outweighs one seen moments ago', () => {
    const recent = record('r', [ind(true)], 9);
    const old = record('o', [ind(true)], 0);
    expect(selectionWeight(old, 10, [])).toBeGreaterThan(selectionWeight(recent, 10, []));
  });

  it('falls back gracefully when only one item exists', () => {
    const only = record('only', []);
    expect(pickNextItem([only], 5, ['only'], seededRng(1)).itemId).toBe('only');
  });
});

describe('learning stages', () => {
  it('introduces, then guides with a fading hint, then asks independently', () => {
    const fresh = createMasteryRecord('x');
    expect(planStage(fresh).stage).toBe('introduce');

    let rec = withIntroduction(fresh, 0);
    const first = planStage(rec);
    expect(first.stage).toBe('guided');
    expect(first.hintStrength).toBe(1);

    rec = withAttempt(rec, { kind: 'guided', correct: true, firstTry: true, hintStrength: 1 }, 0);
    const second = planStage(rec);
    expect(second.stage).toBe('guided');
    expect(second.hintStrength).toBeLessThan(first.hintStrength);

    rec = withAttempt(rec, { kind: 'guided', correct: true, firstTry: true, hintStrength: 0.7 }, 0);
    expect(planStage(rec).stage).toBe('independent');
  });

  it('goes back to guided practice when a learner is struggling', () => {
    let rec = withIntroduction(createMasteryRecord('x'), 0);
    for (let i = 0; i < 2; i++) rec = withAttempt(rec, { kind: 'guided', correct: true, firstTry: true, hintStrength: 1 }, 0);
    rec = withAttempt(rec, ind(false), 0);
    rec = withAttempt(rec, ind(false), 0);
    rec = withAttempt(rec, ind(false), 0);
    expect(planStage(rec).stage).toBe('guided');
  });

  it('unlocks new facts only when the current ones are under control', () => {
    const learning = [record('a', []), record('b', []), record('c', [])];
    expect(shouldUnlockMore(learning)).toBe(false);
    const comfortable = [record('a', [ind(true), ind(true)]), record('b', [ind(true), ind(true)]), record('c', [])];
    expect(shouldUnlockMore(comfortable)).toBe(true);
    expect(shouldUnlockMore([createMasteryRecord('never-introduced')])).toBe(false);
  });
});
