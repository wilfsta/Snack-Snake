import { describe, expect, it } from 'vitest';
import { createContentLibrary } from '../content/ContentLibrary';
import { objectPicture } from '../content/counting/CountingContent';
import { seededRng } from '../core/random';
import { measureTile } from '../game/tiles';
import { LearningEngine } from '../learning/LearningEngine';
import { LearningTracker } from '../learning/LearningTracker';
import type { Challenge, ChallengeSource } from '../learning/types';
import { NUMBER_GARDEN, WORLDS } from './worlds';

function play(source: ChallengeSource, ch: Challenge, correct: boolean): void {
  if (ch.stage === 'introduce') {
    source.record({ type: 'introduced', challenge: ch });
    source.record({ type: 'completed', challenge: ch, firstTryCorrect: true });
    return;
  }
  if (!correct) {
    source.record({ type: 'answered', challenge: ch, optionId: ch.distractors[0].id, correct: false, attemptNumber: 1, hintStrength: 0 });
  }
  source.record({ type: 'answered', challenge: ch, optionId: ch.correctAnswer.id, correct: true, attemptNumber: correct ? 1 : 2, hintStrength: 0 });
  source.record({ type: 'completed', challenge: ch, firstTryCorrect: correct });
}

describe('worlds', () => {
  const library = createContentLibrary();

  it('every item on every world path exists in the content library', () => {
    for (const world of WORLDS) {
      expect(new Set(world.path.itemIds).size).toBe(world.path.itemIds.length);
      for (const id of world.path.itemIds) expect(library.ownsItem(id)).toBe(true);
    }
  });

  it('Number Garden starts with counting, then adding within 10, in order', () => {
    const ids = NUMBER_GARDEN.path.itemIds;
    expect(ids.slice(0, 3)).toEqual(['count:1', 'count:2', 'count:3']);
    expect(ids).toContain('add:1+1');
    expect(ids.indexOf('count:10')).toBeLessThan(ids.indexOf('add:1+1'));
    for (const id of ids.filter((i) => i.startsWith('add:'))) {
      const ch = library.createChallenge(id, { challengeId: 'x', stage: 'independent', hintStrength: 0, distractorCount: 2, rng: seededRng(1) });
      expect(Number(ch.correctAnswer.label)).toBeLessThanOrEqual(10);
    }
  });

  it('counting questions are pictures in rows of five, and fit on a phone-sized arena', () => {
    expect(objectPicture(3)).toBe('🍎🍎🍎');
    expect(objectPicture(7)).toBe('🍎🍎🍎🍎🍎\n🍎🍎');
    for (let n = 1; n <= 10; n++) {
      const ch = library.createChallenge(`count:${n}`, { challengeId: 'x', stage: 'introduce', hintStrength: 0, distractorCount: 2, rng: seededRng(n) });
      expect(ch.correctAnswer.label).toBe(String(n));
      expect(measureTile('fact', ch.statement).w).toBeLessThanOrEqual(8);
      expect(measureTile('question', ch.prompt).w).toBeLessThanOrEqual(5);
    }
  });

  it('a young learner is introduced to each new thing before being asked about it', () => {
    const engine = new LearningEngine(new LearningTracker(), library, seededRng(4));
    const session = engine.createLearnSession(NUMBER_GARDEN.path, Infinity, { answerCount: 3, probeNewItems: true });
    const introduced = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const ch = session.next();
      expect(1 + ch.distractors.length).toBe(3);
      if (ch.stage === 'introduce') introduced.add(ch.itemId);
      // Struggling child (wrong every other time): never on a roll, so nothing is ever skipped.
      else expect(introduced.has(ch.itemId)).toBe(true);
      play(session, ch, i % 2 === 0);
    }
  });

  it('a child who already knows things moves through quickly, skipping introductions', () => {
    const engine = new LearningEngine(new LearningTracker(), library, seededRng(9));
    const session = engine.createLearnSession(NUMBER_GARDEN.path, Infinity, { answerCount: 3, probeNewItems: true });
    let introductions = 0;
    let questions = 0;
    for (let i = 0; i < 120; i++) {
      const ch = session.next();
      if (ch.stage === 'introduce') introductions++;
      else questions++;
      play(session, ch, true);
    }
    const reached = NUMBER_GARDEN.path.itemIds.filter((id) => engine.tracker.get(id).timesPresented > 0).length;
    expect(introductions).toBeLessThan(reached / 2); // most new things were simply known
    expect(reached).toBeGreaterThan(15); // and they got well past counting
    expect(questions).toBeGreaterThan(introductions);
  });

  it('a probed item that was not known gets introduced properly next time', () => {
    const engine = new LearningEngine(new LearningTracker(), library, seededRng(2));
    const session = engine.createLearnSession(NUMBER_GARDEN.path, Infinity, { answerCount: 3, probeNewItems: true });
    const seen = new Map<string, string[]>();
    for (let i = 0; i < 80; i++) {
      const ch = session.next();
      const stages = seen.get(ch.itemId) ?? [];
      // A brand-new item asked as a question is a probe: pretend the child didn't know it.
      const isProbe = ch.stage === 'independent' && stages.length === 0;
      stages.push(ch.stage);
      seen.set(ch.itemId, stages);
      play(session, ch, !isProbe);
    }
    const probedThenTaught = [...seen.values()].filter((s) => s[0] === 'independent' && s.includes('introduce'));
    expect(probedThenTaught.length).toBeGreaterThan(0);
    for (const stages of probedThenTaught) expect(stages[1]).toBe('introduce');
  });
});
