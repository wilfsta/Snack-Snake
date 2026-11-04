import { LearningTracker, type LearningSnapshot } from '../learning/LearningTracker';
import type { MasteryRecord } from '../learning/mastery';
import type { AssumedGroup, CurriculumState } from '../learning/placement';
import { sanitizeRewardState, type RewardState } from '../rewards/economy';
import type { DayActivity, ProfileData } from './StorageManager';

/**
 * Combines two copies of the same child, e.g. a backup from the tablet loaded onto the phone after
 * the child played on both. Nothing either copy learned or earned is lost:
 *
 *  - Name, avatar, settings, outfit and an unfinished visit come from the copy changed last.
 *  - Scores, streaks, visits and each day's activity keep the higher figure.
 *  - For each fact, the copy that has seen it more often wins (more evidence about the child).
 *  - Stars keep the higher total; anything bought or earned on either device is kept.
 */
export function mergeProfiles(a: ProfileData, b: ProfileData): ProfileData {
  const [older, newer] = a.updatedAt > b.updatedAt ? [b, a] : [a, b];
  return {
    ...newer,
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
    highScores: maxEach(a.highScores, b.highScores),
    bestStreaks: maxEach(a.bestStreaks, b.bestStreaks),
    worldVisits: maxEach(a.worldVisits, b.worldVisits),
    onboarded: [...new Set([...older.onboarded, ...newer.onboarded])],
    activity: mergeActivity(older.activity, newer.activity),
    rewards: mergeRewards(older.rewards, newer.rewards),
    learning: mergeLearning(older.learning, newer.learning),
  };
}

function maxEach(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? v, v);
  return out;
}

function mergeActivity(a: Readonly<Record<string, DayActivity>>, b: Readonly<Record<string, DayActivity>>): Record<string, DayActivity> {
  const out: Record<string, DayActivity> = { ...a };
  for (const [day, d] of Object.entries(b)) {
    const o = out[day];
    // Max, not sum: both copies may contain the same play from before they went separate ways.
    out[day] = o ? { questions: Math.max(o.questions, d.questions), firstTry: Math.max(o.firstTry, d.firstTry), ms: Math.max(o.ms, d.ms) } : d;
  }
  return out;
}

/** `older`/`newer` decide only what is worn; earned things are combined. */
function mergeRewards(older: unknown, newer: unknown): unknown {
  if (older === null) return newer;
  if (newer === null) return older;
  const o = sanitizeRewardState(older);
  const n = sanitizeRewardState(newer);
  const starsEarned = Math.max(o.starsEarned, n.starsEarned);
  const merged: RewardState = {
    starsEarned,
    starsSpent: Math.min(Math.max(o.starsSpent, n.starsSpent), starsEarned),
    gardenStars: Math.max(o.gardenStars, n.gardenStars),
    owned: [...new Set([...o.owned, ...n.owned])],
    equipped: n.equipped,
    milestones: [...new Set([...o.milestones, ...n.milestones])],
  };
  return merged;
}

function mergeLearning(older: unknown, newer: unknown): unknown {
  const o = older === null ? null : LearningTracker.sanitize(older);
  const n = newer === null ? null : LearningTracker.sanitize(newer);
  if (!o) return n ?? newer;
  if (!n) return o;
  const records: Record<string, MasteryRecord> = { ...o.records };
  for (const [id, r] of Object.entries(n.records)) {
    const other = records[id];
    if (!other || moreEvidence(r, other)) records[id] = r;
  }
  const units = { ...o.units };
  for (const [id, u] of Object.entries(n.units)) {
    const other = units[id];
    units[id] = other ? { unlocked: Math.max(other.unlocked, u.unlocked), sessionsCompleted: Math.max(other.sessionsCompleted, u.sessionsCompleted) } : u;
  }
  const curricula: Record<string, CurriculumState> = { ...(o.curricula ?? {}) };
  for (const [id, c] of Object.entries(n.curricula ?? {})) curricula[id] = curricula[id] ? mergeCurriculum(curricula[id], c) : c;
  const merged: LearningSnapshot = { version: 1, step: Math.max(o.step, n.step), records, units, curricula };
  return merged;
}

/** `a` wins over `b` when it has seen the fact more often (ties: the more recent answer). */
function moreEvidence(a: MasteryRecord, b: MasteryRecord): boolean {
  if (a.timesPresented !== b.timesPresented) return a.timesPresented > b.timesPresented;
  return (a.lastAttempted ?? -1) >= (b.lastAttempted ?? -1);
}

function mergeCurriculum(a: CurriculumState, b: CurriculumState): CurriculumState {
  const assumed: Record<string, AssumedGroup> = { ...a.assumed };
  for (const [g, x] of Object.entries(b.assumed)) {
    const y = assumed[g];
    if (!y || x.confirms + x.doubts >= y.confirms + y.doubts) assumed[g] = x;
  }
  return { assumed };
}
