import { clamp } from '../core/geometry';
import { weightedPick, type Rng } from '../core/random';
import { recentAccuracy, type MasteryRecord, type MasteryState } from './mastery';
import type { ChallengeStage } from './types';

/**
 * Pure adaptive-scheduling rules. Kept free of state so they are easy to reason about and test.
 */

const STATE_WEIGHT: Readonly<Record<MasteryState, number>> = {
  NEW: 3,
  LEARNING: 3,
  PRACTISING: 2,
  MASTERED: 0.6,
};

/**
 * How likely an item is to be chosen next.
 *  - struggling items (low recent accuracy) come up more often
 *  - mastered items still return occasionally
 *  - items seen very recently are suppressed so nothing gets hammered
 *  - items not seen for a while become gradually more likely (spacing)
 */
export function selectionWeight(rec: MasteryRecord, currentStep: number, recentItemIds: readonly string[]): number {
  const accuracy = recentAccuracy(rec);
  const struggle = accuracy === null ? 1 : 1 + (1 - accuracy) * 1.5;
  const gap = rec.lastSeenStep < 0 ? 10 : currentStep - rec.lastSeenStep;
  const spacing = Math.min(0.3 + gap / 4, 2.5);
  let weight = STATE_WEIGHT[rec.state] * struggle * spacing;

  const position = recentItemIds.lastIndexOf(rec.itemId);
  if (position >= 0) {
    const ago = recentItemIds.length - position; // 1 = the challenge just shown
    if (ago === 1) weight = 0;
    else if (ago === 2) weight *= 0.3;
  }
  return weight;
}

export function pickNextItem(
  records: readonly MasteryRecord[],
  currentStep: number,
  recentItemIds: readonly string[],
  rng: Rng,
): MasteryRecord {
  if (records.length === 0) throw new Error('pickNextItem() needs at least one record');
  const chosen = weightedPick(rng, records, (r) => selectionWeight(r, currentStep, recentItemIds));
  if (chosen) return chosen;
  // Everything was suppressed by spacing (e.g. only one item): fall back to least recently seen.
  return records.reduce((a, b) => (a.lastSeenStep <= b.lastSeenStep ? a : b));
}

/** Play-mode weighting: mostly uniform, gently favouring items the player gets wrong. */
export function practiceWeight(rec: MasteryRecord, recentItemIds: readonly string[], poolSize: number): number {
  const avoidWindow = Math.min(4, poolSize - 1);
  if (avoidWindow > 0 && recentItemIds.slice(-avoidWindow).includes(rec.itemId)) return 0;
  const accuracy = recentAccuracy(rec);
  const struggle = accuracy === null ? 1 : 1 + (1 - accuracy) * 0.8;
  return (rec.state === 'MASTERED' ? 0.7 : 1) * struggle;
}

export function needsIntroduction(rec: MasteryRecord): boolean {
  return rec.introductions === 0 && rec.independentCorrect === 0 && rec.guidedCorrect === 0;
}

/** Hint fades as the learner gets guided questions right. */
export function guidedHintStrength(rec: MasteryRecord): number {
  return clamp(1 - rec.guidedCorrect * 0.3, 0.25, 1);
}

export interface StagePlan {
  readonly stage: ChallengeStage;
  readonly hintStrength: number;
}

/** Decide how an item should be presented: introduce → guided practice → independent recall. */
export function planStage(rec: MasteryRecord): StagePlan {
  if (needsIntroduction(rec)) return { stage: 'introduce', hintStrength: 0 };
  if (rec.state === 'NEW' || rec.state === 'LEARNING') {
    const accuracy = recentAccuracy(rec);
    const struggling = accuracy !== null && rec.recent.length >= 2 && accuracy < 0.5;
    if (rec.guidedCorrect < 2 || struggling) {
      return { stage: 'guided', hintStrength: guidedHintStrength(rec) };
    }
  }
  return { stage: 'independent', hintStrength: 0 };
}

/**
 * Unlock the next item in the curriculum once the learner is comfortable with what they have:
 * everything unlocked has been introduced and fewer than two items are still being learnt.
 */
export function shouldUnlockMore(unlocked: readonly MasteryRecord[]): boolean {
  if (unlocked.some(needsIntroduction)) return false;
  const stillLearning = unlocked.filter((r) => r.state === 'NEW' || r.state === 'LEARNING').length;
  return stillLearning < 2;
}
