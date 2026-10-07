import { describe, expect, it } from 'vitest';
import { MULTIPLICATION } from '../content/arithmetic/operations';
import { createMasteryRecord, withAttempt, type AttemptInput, type MasteryRecord } from './mastery';
import { DEFAULT_PACING, thinkingTimeFor } from './pacing';
import { practiceTargets, RUSTY_AFTER } from './practice';

const ind = (correct: boolean, responseMs?: number): AttemptInput => ({ kind: 'independent', correct, firstTry: true, hintStrength: 0, responseMs });

function rec(itemId: string, results: boolean[], lastSeenStep: number): MasteryRecord {
  return { ...results.reduce((r, ok) => withAttempt(r, ind(ok), 0), createMasteryRecord(itemId)), lastSeenStep };
}

describe('what to practise next', () => {
  it('knows the 2s, 5s and 10s are fine but some 4s need another look', () => {
    const step = 100;
    const records: MasteryRecord[] = [];
    for (const table of [2, 5, 10]) for (let k = 1; k <= 10; k++) records.push(rec(MULTIPLICATION.itemId(table, k), [true, true, true, true], 95));
    records.push(rec(MULTIPLICATION.itemId(4, 6), [false, true, false], 90));
    records.push(rec(MULTIPLICATION.itemId(4, 7), [true, false], 92));
    records.push(rec(MULTIPLICATION.itemId(4, 3), [true, true, true], 94));
    const targets = practiceTargets(records, step);
    expect(targets.map((t) => t.itemId)).toEqual([MULTIPLICATION.itemId(4, 6), MULTIPLICATION.itemId(4, 7)]);
    expect(targets[0].reason).toBe('struggling');
  });

  it('well-known facts that have not come up for a long time are due a refresh', () => {
    const old = rec(MULTIPLICATION.itemId(5, 5), [true, true, true, true], 0);
    const targets = practiceTargets([old], RUSTY_AFTER + 5);
    expect(targets).toEqual([expect.objectContaining({ reason: 'rusty' })]);
    // Never-attempted items are not "practice" – they are new learning.
    expect(practiceTargets([createMasteryRecord('mul:3x3')], 500)).toEqual([]);
  });
});

describe('response times and pacing', () => {
  it('records a smoothed response time from first answers only', () => {
    let r = withAttempt(createMasteryRecord('x'), ind(true, 4000), 0);
    expect(r.responseMsAvg).toBe(4000);
    r = withAttempt(r, ind(true, 2000), 0);
    expect(r.responseMsAvg).toBe(3400);
    expect(r.lastResponseMs).toBe(2000);
    // A second attempt after a mistake says nothing about recall speed.
    r = withAttempt(r, { kind: 'independent', correct: true, firstTry: false, hintStrength: 0, responseMs: 100 }, 0);
    expect(r.lastResponseMs).toBe(2000);
  });

  it('new material gets more thinking time than well-known facts', () => {
    const fresh = createMasteryRecord('x');
    const mastered = [1, 2, 3, 4, 5, 6].reduce((r) => withAttempt(r, ind(true), 0), createMasteryRecord('y'));
    expect(mastered.state).toBe('MASTERED');
    expect(thinkingTimeFor(fresh, 'independent')).toBe(DEFAULT_PACING.thinkingMs.new);
    expect(thinkingTimeFor(mastered, 'independent')).toBe(DEFAULT_PACING.thinkingMs.mastered);
    expect(thinkingTimeFor(mastered, 'independent')).toBeLessThan(thinkingTimeFor(fresh, 'independent'));
    expect(thinkingTimeFor(fresh, 'introduce')).toBe(0);
  });
});
