import { describe, expect, it } from 'vitest';
import type { SessionEvent } from '../../game/SnakeSession';
import type { Challenge } from '../../learning/types';
import { DEFAULT_PLAYTEST } from './playtest';
import { formatNote, parseNotes, VisitRecorder } from './playtestLog';

const tile = { x: 0, y: 0 } as never;

function challenge(statement: string, stage: Challenge['stage'] = 'independent'): Challenge {
  return { statement, stage } as Challenge;
}

const correct = (statement: string, firstTry: boolean, stage?: Challenge['stage']): SessionEvent => ({
  type: 'correct',
  challenge: challenge(statement, stage),
  tile,
  points: 1,
  streak: 1,
  firstTry,
});
const wrong = (statement: string, attempt: number): SessionEvent => ({ type: 'wrong', challenge: challenge(statement), tile, fatal: false, attempt });

describe('playtest visit notes', () => {
  it('counts answers, misses, hints and bumps from the game events', () => {
    const rec = new VisitRecorder('🦊 Ada', DEFAULT_PLAYTEST, false, 0);
    rec.observe({ type: 'factCollected', challenge: challenge('2 + 2 = 4'), tile });
    rec.observe(correct('2 + 2 = 4', true), 1000);
    rec.observe(wrong('3 + 4 = 7', 1));
    rec.observe(wrong('3 + 4 = 7', 2));
    rec.observe(correct('3 + 4 = 7', false, 'guided'));
    rec.observe({ type: 'bonk' });
    rec.observe({ type: 'selfBite', lost: [] });
    expect(rec.observe({ type: 'answersShown', challenge: challenge('x') })).toBe(false);
    const note = rec.finish(5 * 60000);
    expect(note).toMatchObject({ questions: 2, rightFirstTime: 1, hinted: 1, taught: 1, wrongAnswers: 2, missed: ['3 + 4 = 7'], bumps: 2, finished: true });
  });

  it('formats a visit as one readable line', () => {
    const rec = new VisitRecorder('🦊 Ada', DEFAULT_PLAYTEST, true, new Date(2026, 9, 31, 9, 5).getTime());
    rec.observe(wrong('3 + 4 = 7', 1));
    rec.observe(correct('3 + 4 = 7', false));
    const line = formatNote({ ...rec.current, endedAt: rec.current.startedAt + 6 * 60000, note: 'got tired' });
    expect(line).toBe('2026-10-31 09:05 · 🦊 Ada · 6 min · left early · carried on · 0/1 right first time · 0 bumps · missed: 3 + 4 = 7 · [Sid slows, thinking 100%, 3 answers] · note: got tired');
  });

  it('reads saved notes back, ignoring anything broken', () => {
    const note = new VisitRecorder('Bo', DEFAULT_PLAYTEST, false, 10).finish(20);
    expect(parseNotes(JSON.stringify([note, null, { nope: 1 }]))).toEqual([note]);
    expect(parseNotes('garbage')).toEqual([]);
  });
});
