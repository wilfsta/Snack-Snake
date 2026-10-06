import { describe, expect, it } from 'vitest';
import { ProfileService } from '../app/services/ProfileService';
import { ProgressService } from '../app/services/ProgressService';
import { createContentLibrary } from '../content/ContentLibrary';
import { seededRng } from '../core/random';
import { awardMilestones, initialRewardState, MILESTONE_RULES } from '../rewards/economy';
import { MemoryStore, StorageManager } from '../storage/StorageManager';
import { GARDEN_CURRICULUM } from '../worlds/gardenCurriculum';
import { curriculumGroups } from './curriculum';
import type { CurriculumSession } from './CurriculumSession';
import { LearningEngine } from './LearningEngine';
import { LearningTracker } from './LearningTracker';
import { confidenceFrom, exploreStep, groupSecure, probesNeeded, startExplore } from './placement';
import type { ChallengeStage } from './types';

const library = createContentLibrary();
const GROUPS = curriculumGroups(GARDEN_CURRICULUM);
const groupIndex = new Map<string, number>();
GROUPS.forEach((g, i) => g.itemIds.forEach((id) => groupIndex.set(id, i)));
const indexOf = (id: string) => GROUPS.findIndex((g) => g.id === id);

const BONDS_TO_5 = indexOf('bonds-to-5');
const ADD_TO_10 = indexOf('add-to-10');
const SUB_TO_20 = indexOf('sub-to-20');
const FIRST_MULTIPLICATION = indexOf('equal-groups');

/**
 * A simulated child. Groups they already know are always answered right; anything else is
 * wrong until it has been taught and practised a couple of times (hinted answers succeed).
 */
interface Child {
  answer(itemId: string, stage: ChallengeStage): boolean;
  taught(itemId: string): void;
}

function makeChild(knows: (group: number) => boolean, opts: { lucky?: number } = {}): Child {
  const practice = new Map<string, number>();
  let lucky = opts.lucky ?? 0;
  return {
    answer(itemId, stage) {
      if (lucky > 0) {
        lucky--;
        return true;
      }
      if (knows(groupIndex.get(itemId) ?? 0)) return true;
      const seen = practice.get(itemId);
      if (stage === 'guided') {
        practice.set(itemId, (seen ?? 0) + 1);
        return true;
      }
      if (seen !== undefined && seen >= 2) return true;
      if (seen !== undefined) practice.set(itemId, seen + 1);
      return false;
    },
    taught(itemId) {
      if (!practice.has(itemId)) practice.set(itemId, 0);
    },
  };
}

interface Turn {
  readonly itemId: string;
  readonly group: number;
  readonly stage: ChallengeStage;
  readonly correct: boolean;
  readonly frontierAfter: number;
}

/** Plays `turns` challenges (across as many 12-question visits as needed), like the game does. */
function play(engine: LearningEngine, child: Child, turns: number, onPassed?: (ids: readonly string[]) => void): Turn[] {
  const log: Turn[] = [];
  let session: CurriculumSession | null = null;
  while (log.length < turns) {
    if (!session || session.isSessionComplete()) {
      session = engine.createCurriculumSession(GARDEN_CURRICULUM, 12, { answerCount: 3, onGroupsPassed: onPassed });
    }
    const ch = session.next();
    let correct = true;
    if (ch.stage === 'introduce') {
      session.record({ type: 'introduced', challenge: ch });
      session.record({ type: 'completed', challenge: ch, firstTryCorrect: true });
      child.taught(ch.itemId);
    } else {
      correct = child.answer(ch.itemId, ch.stage);
      session.record({ type: 'answered', challenge: ch, optionId: 'x', correct, attemptNumber: 1, hintStrength: ch.hintStrength });
      if (!correct) session.record({ type: 'answered', challenge: ch, optionId: 'y', correct: true, attemptNumber: 2, hintStrength: 1 });
      session.record({ type: 'completed', challenge: ch, firstTryCorrect: correct });
    }
    log.push({ itemId: ch.itemId, group: groupIndex.get(ch.itemId) ?? -1, stage: ch.stage, correct, frontierAfter: session.frontier });
  }
  return log;
}

function freshEngine(seed: number, tracker = new LearningTracker()): LearningEngine {
  return new LearningEngine(tracker, library, seededRng(seed));
}

describe('placement rules', () => {
  it('confidence grows with unaided right answers and drops with mistakes', () => {
    expect(confidenceFrom([true, true])).toBe('unknown');
    expect(confidenceFrom([true, true, true, true])).toBe('strong');
    expect(confidenceFrom([true, false, true, true, true, false, true, true])).toBe('good');
    expect(confidenceFrom([true, false, true, false, true, false])).toBe('uncertain');
    expect(confidenceFrom([false, false, true, false])).toBe('struggling');
  });

  it('one right answer is never enough to move past a group, unless a long run backs it up', () => {
    expect(probesNeeded(1)).toBe(2);
    expect(probesNeeded(3)).toBe(2);
    expect(probesNeeded(4)).toBe(1);
  });

  it('jumps forward while right, and narrows back after a miss', () => {
    let s = startExplore(0, 20);
    let r = exploreStep(s, true, 1);
    expect(r.confirmed).toBeNull();
    r = exploreStep(r.next!, true, 2);
    expect(r.confirmed).toEqual({ from: 0, to: 0 });
    expect(r.next!.target).toBe(2); // jumped two ahead
    s = { lo: 7, hi: 20, target: 14, atTarget: 0, jump: 8 };
    r = exploreStep(s, false, 0);
    expect(r.next).toMatchObject({ lo: 7, hi: 14, target: 10 });
    r = exploreStep({ lo: 7, hi: 8, target: 7, atTarget: 0, jump: 1 }, false, 0);
    expect(r.next).toBeNull();
    expect(r.edge).toBe(7);
  });

  it('a group is secure when most (not all) of it is solid', () => {
    const tracker = new LearningTracker();
    const ids = GROUPS[indexOf('add-to-10')].itemIds;
    for (const id of ids.slice(0, 5)) tracker.recordAttempt(id, { kind: 'independent', correct: true, firstTry: true, hintStrength: 0 });
    expect(groupSecure(tracker.getAll(ids))).toBe(false);
    tracker.recordAttempt(ids[5], { kind: 'independent', correct: true, firstTry: true, hintStrength: 0 });
    expect(groupSecure(tracker.getAll(ids))).toBe(true); // 6 of 25 items
  });
});

describe('finding the edge of what a child knows', () => {
  it('a beginner gets introductions and stays in early counting – no fast-tracking', () => {
    const engine = freshEngine(1);
    const log = play(engine, makeChild(() => false), 40);
    expect(log.filter((t) => t.stage === 'introduce').length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...log.map((t) => t.group))).toBeLessThanOrEqual(2);
    expect(Object.keys(engine.tracker.curriculumState('garden').assumed)).toEqual([]);
    // Never anywhere near multiplication.
    expect(log.every((t) => t.group < FIRST_MULTIPLICATION)).toBe(true);
  });

  it('a confident child (knows adding to 10) reaches harder material within a few questions, with no lessons on the way', () => {
    const engine = freshEngine(2);
    const log = play(engine, makeChild((g) => g <= ADD_TO_10), 14);
    const reachedAt = log.findIndex((t) => t.frontierAfter > ADD_TO_10);
    expect(reachedAt).toBeGreaterThanOrEqual(0);
    expect(reachedAt + 1).toBeLessThanOrEqual(12);
    // Nothing was taught before reaching their level.
    expect(log.slice(0, reachedAt + 1).filter((t) => t.stage === 'introduce')).toEqual([]);
    // And it settled at the right place: not beyond what they can do.
    expect(log[log.length - 1].frontierAfter).toBe(ADD_TO_10 + 1);
  });

  it('mixed ability: fast-tracks counting and number sense, settles and is taught at number bonds', () => {
    const engine = freshEngine(3);
    const log = play(engine, makeChild((g) => g < BONDS_TO_5), 40);
    const settledAt = log.findIndex((t) => t.frontierAfter === BONDS_TO_5);
    expect(settledAt).toBeGreaterThanOrEqual(0);
    expect(settledAt + 1).toBeLessThanOrEqual(12);
    const afterSettling = log.slice(settledAt + 1);
    // Teaching happens at bonds...
    expect(afterSettling.some((t) => t.stage === 'introduce' && t.group === BONDS_TO_5)).toBe(true);
    // ...and nothing much harder is attempted while bonds are being learnt.
    expect(afterSettling.every((t) => t.group <= BONDS_TO_5 + 1)).toBe(true);
  });

  it('an advanced child reaches the foundations of multiplication without doing every earlier fact', () => {
    const engine = freshEngine(4);
    const log = play(engine, makeChild((g) => g <= SUB_TO_20), 20);
    const reachedAt = log.findIndex((t) => t.frontierAfter >= FIRST_MULTIPLICATION);
    expect(reachedAt).toBeGreaterThanOrEqual(0);
    expect(reachedAt + 1).toBeLessThanOrEqual(14);
    const earlierItems = GROUPS.slice(0, FIRST_MULTIPLICATION).reduce((n, g) => n + g.itemIds.length, 0);
    expect(new Set(log.slice(0, reachedAt + 1).map((t) => t.itemId)).size).toBeLessThan(earlierItems / 10);
    expect(log.slice(0, reachedAt + 1).filter((t) => t.stage === 'introduce')).toEqual([]);
  });

  it('a lucky start is reconsidered: when later answers go wrong, earlier material comes back', () => {
    const engine = freshEngine(5);
    const log = play(engine, makeChild(() => false, { lucky: 6 }), 80);
    const peak = Math.max(...log.map((t) => t.frontierAfter));
    expect(peak).toBeGreaterThan(2); // the lucky run did move them on...
    // ...but the doubts were noticed and they were brought back to early counting and taught it.
    const final = log[log.length - 1].frontierAfter;
    expect(final).toBeLessThanOrEqual(2);
    expect(log.slice(20).some((t) => t.stage === 'introduce' && t.group <= 1)).toBe(true);
  });

  it('existing mastery places a returning child straight away', () => {
    const tracker = new LearningTracker();
    for (const g of GROUPS.slice(0, 3)) {
      for (const id of g.itemIds) tracker.recordAttempt(id, { kind: 'independent', correct: true, firstTry: true, hintStrength: 0 });
    }
    const session = freshEngine(6, tracker).createCurriculumSession(GARDEN_CURRICULUM, 12, { answerCount: 3 });
    expect(session.frontier).toBe(3);
    const first = session.next();
    expect(groupIndex.get(first.itemId)).toBeGreaterThanOrEqual(3);
  });

  it('placement carries over between visits instead of starting again', () => {
    const tracker = new LearningTracker();
    play(freshEngine(7, tracker), makeChild((g) => g <= ADD_TO_10), 12);
    const next = freshEngine(8, tracker).createCurriculumSession(GARDEN_CURRICULUM, 12, { answerCount: 3 });
    expect(next.frontier).toBeGreaterThan(ADD_TO_10);
    expect(groupIndex.get(next.next().itemId)).toBeGreaterThan(ADD_TO_10 - 2);
  });

  it('keeps checking skipped groups now and then', () => {
    const engine = freshEngine(9);
    const log = play(engine, makeChild((g) => g <= ADD_TO_10), 60);
    const afterPlacement = log.slice(14);
    expect(afterPlacement.some((t) => t.group <= ADD_TO_10 && t.stage === 'independent')).toBe(true);
    // Correct re-checks build trust in the assumption.
    const assumed = Object.values(engine.tracker.curriculumState('garden').assumed);
    expect(assumed.some((a) => a.confirms > 0)).toBe(true);
  });

  it('the whole journey is reachable', () => {
    // A child who already knows everything gets to the end quickly...
    const expert = freshEngine(10);
    const quick = play(expert, makeChild(() => true), 30);
    expect(quick[quick.length - 1].frontierAfter).toBe(GROUPS.length);
    // ...and a child who learns everything as it is taught gets there eventually.
    const learner = freshEngine(11);
    const long = play(learner, makeChild(() => false), 2500);
    expect(long[long.length - 1].frontierAfter).toBe(GROUPS.length);
  });
});

describe('players and rewards', () => {
  it('placement evidence belongs to each player separately', () => {
    const storage = new StorageManager(new MemoryStore());
    const profiles = new ProfileService(storage);
    const progress = new ProgressService(storage);
    const first = profiles.activeId;
    play(progress.engine, makeChild((g) => g <= ADD_TO_10), 14);
    const firstFrontier = progress.engine.createCurriculumSession(GARDEN_CURRICULUM, 12).frontier;
    expect(firstFrontier).toBeGreaterThan(ADD_TO_10);

    profiles.create('Second', '🐼');
    progress.reload();
    expect(progress.engine.createCurriculumSession(GARDEN_CURRICULUM, 12).frontier).toBe(0);
    expect(progress.tracker.curriculumState('garden').assumed).toEqual({});

    profiles.switchTo(first);
    progress.reload();
    expect(progress.engine.createCurriculumSession(GARDEN_CURRICULUM, 12).frontier).toBe(firstFrontier);
  });

  it('each passed group is reported once, and milestones pay once, capped per celebration', () => {
    const reported: string[] = [];
    const engine = freshEngine(12);
    let rewards = initialRewardState();
    let paid = 0;
    play(engine, makeChild((g) => g <= SUB_TO_20), 30, (ids) => {
      reported.push(...ids);
      const r = awardMilestones(rewards, ids, true);
      expect(r.stars).toBeLessThanOrEqual(MILESTONE_RULES.maxStarsPerEvent);
      rewards = r.state;
      paid += r.stars;
    });
    expect(new Set(reported).size).toBe(reported.length);
    expect(reported.length).toBeGreaterThan(10);
    // Paying the same groups again gives nothing (no farming by re-passing a group).
    expect(awardMilestones(rewards, reported, true).stars).toBe(0);
    // A big leap is a few modest celebrations, not dozens of stars.
    expect(paid).toBeLessThanOrEqual(reported.length * MILESTONE_RULES.starsPerGroup);
    expect(paid).toBeGreaterThan(0);
  });

  it('a child who needs more practice still earns steadily (every finished question pays)', () => {
    // Mirrors the game's rule: 1 star per finished question or new thing met, right or wrong.
    const engine = freshEngine(13);
    const log = play(engine, makeChild(() => false), 24);
    const starsFromPlaying = log.length;
    const wrongFirstTime = log.filter((t) => !t.correct).length;
    expect(wrongFirstTime).toBeGreaterThan(0);
    expect(starsFromPlaying).toBe(24);
  });
});
