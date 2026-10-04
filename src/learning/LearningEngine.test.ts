import { describe, expect, it } from 'vitest';
import { seededRng } from '../core/random';
import { MultiplicationContent, tableUnitId } from '../content/multiplication/MultiplicationContent';
import { LearningEngine } from './LearningEngine';
import { LearningTracker } from './LearningTracker';
import type { Challenge, ChallengeSource } from './types';

/** Plays a challenge the way a child might: introductions collected, answers right or wrong. */
function answer(source: ChallengeSource, ch: Challenge, correct: boolean): void {
  if (ch.stage === 'introduce') {
    source.record({ type: 'introduced', challenge: ch });
    source.record({ type: 'completed', challenge: ch, firstTryCorrect: true });
    return;
  }
  const option = correct ? ch.correctAnswer : ch.distractors[0];
  source.record({ type: 'answered', challenge: ch, optionId: option.id, correct, attemptNumber: 1, hintStrength: ch.hintStrength });
  if (!correct) {
    source.record({ type: 'answered', challenge: ch, optionId: ch.correctAnswer.id, correct: true, attemptNumber: 2, hintStrength: 1 });
  }
  source.record({ type: 'completed', challenge: ch, firstTryCorrect: correct });
}

describe('LearningEngine learn sessions', () => {
  it('starts a table with a small subset, introducing before practising', () => {
    const engine = new LearningEngine(new LearningTracker(), new MultiplicationContent(), seededRng(5));
    const session = engine.createLearnSession(tableUnitId(6), 10);
    const first = session.next();
    expect(first.stage).toBe('introduce');
    expect(first.itemId).toBe('mul:6x1');
    answer(session, first, true);

    const seen = new Set<string>([first.itemId]);
    for (let i = 0; i < 5; i++) {
      const ch = session.next();
      seen.add(ch.itemId);
      answer(session, ch, true);
    }
    // Only the first few facts are in play this early.
    for (const id of seen) expect(['mul:6x1', 'mul:6x2', 'mul:6x3']).toContain(id);
  });

  it('introduces the facts of a table in order: ×1, ×2, ×3 ... ×12', () => {
    const engine = new LearningEngine(new LearningTracker(), new MultiplicationContent(), seededRng(13));
    const session = engine.createLearnSession(tableUnitId(7), 500);
    const order: number[] = [];
    for (let i = 0; i < 400 && order.length < 12; i++) {
      const ch = session.next();
      if (ch.stage === 'introduce') order.push((ch.metadata as { k: number }).k);
      answer(session, ch, true);
    }
    expect(order).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('respects the chosen number of answers on screen', () => {
    for (const count of [2, 3, 6]) {
      const engine = new LearningEngine(new LearningTracker(), new MultiplicationContent(), seededRng(count));
      const session = engine.createPracticeSession(tableUnitId(4), { answerCount: count });
      const ch = session.next();
      expect(1 + ch.distractors.length).toBe(count);
    }
  });

  it('a fact is always introduced before it is asked', () => {
    const engine = new LearningEngine(new LearningTracker(), new MultiplicationContent(), seededRng(11));
    const session = engine.createLearnSession(tableUnitId(7), 200);
    const introduced = new Set<string>();
    for (let i = 0; i < 150; i++) {
      const ch = session.next();
      if (ch.stage === 'introduce') introduced.add(ch.itemId);
      else expect(introduced.has(ch.itemId)).toBe(true);
      answer(session, ch, i % 4 !== 0);
    }
  });

  it('gradually unlocks the whole table and eventually masters facts', () => {
    const tracker = new LearningTracker();
    const engine = new LearningEngine(tracker, new MultiplicationContent(), seededRng(3));
    const session = engine.createLearnSession(tableUnitId(4), 400);
    for (let i = 0; i < 300; i++) answer(session, session.next(), true);
    const summary = engine.summarizeUnit(tableUnitId(4));
    expect(summary.counts.NEW).toBe(0);
    expect(summary.counts.MASTERED).toBeGreaterThan(6);
  });

  it('never presents the same fact twice in a row once several are available', () => {
    const engine = new LearningEngine(new LearningTracker(), new MultiplicationContent(), seededRng(9));
    const session = engine.createLearnSession(tableUnitId(8), 200);
    let last = '';
    for (let i = 0; i < 100; i++) {
      const ch = session.next();
      if (i > 3) expect(ch.itemId).not.toBe(last);
      last = ch.itemId;
      answer(session, ch, true);
    }
  });

  it('completes after the configured number of interactions', () => {
    const engine = new LearningEngine(new LearningTracker(), new MultiplicationContent(), seededRng(1));
    const session = engine.createLearnSession(tableUnitId(2), 5);
    for (let i = 0; i < 5; i++) {
      expect(session.isSessionComplete()).toBe(false);
      answer(session, session.next(), true);
    }
    expect(session.isSessionComplete()).toBe(true);
  });

  it('progress survives a save/load round trip', () => {
    const tracker = new LearningTracker();
    const engine = new LearningEngine(tracker, new MultiplicationContent(), seededRng(2));
    const session = engine.createLearnSession(tableUnitId(9), 50);
    for (let i = 0; i < 30; i++) answer(session, session.next(), true);
    const saved = JSON.parse(JSON.stringify(tracker.snapshot()));

    const restored = new LearningTracker(saved);
    const engine2 = new LearningEngine(restored, new MultiplicationContent(), seededRng(2));
    expect(engine2.summarizeUnit(tableUnitId(9)).counts).toEqual(engine.summarizeUnit(tableUnitId(9)).counts);
    expect(restored.get('mul:9x1')).toEqual(tracker.get('mul:9x1'));
    expect(restored.unitProgress(tableUnitId(9), 4)).toEqual(tracker.unitProgress(tableUnitId(9), 4));
  });
});

describe('LearningEngine practice (play) sessions', () => {
  it('asks independent questions only, and avoids immediate repeats', () => {
    const engine = new LearningEngine(new LearningTracker(), new MultiplicationContent(), seededRng(4));
    const session = engine.createPracticeSession(tableUnitId(5));
    const recent: string[] = [];
    for (let i = 0; i < 100; i++) {
      const ch = session.next();
      expect(ch.stage).toBe('independent');
      expect(ch.hintStrength).toBe(0);
      expect(recent.slice(-4)).not.toContain(ch.itemId);
      recent.push(ch.itemId);
      answer(session, ch, true);
    }
    expect(session.isSessionComplete()).toBe(false);
  });

  it('mixed mode draws from many tables', () => {
    const engine = new LearningEngine(new LearningTracker(), new MultiplicationContent(), seededRng(8));
    const session = engine.createPracticeSession('mul:mixed');
    const tables = new Set<number>();
    for (let i = 0; i < 80; i++) tables.add((session.next().metadata as { n: number }).n);
    expect(tables.size).toBeGreaterThan(6);
  });
});
