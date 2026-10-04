import { clamp } from '../core/geometry';

export type MasteryState = 'NEW' | 'LEARNING' | 'PRACTISING' | 'MASTERED';
export const MASTERY_STATES: readonly MasteryState[] = ['NEW', 'LEARNING', 'PRACTISING', 'MASTERED'];

export type AttemptKind = 'guided' | 'independent';

/** Everything we know about how well a learner knows one item (e.g. "7 × 8"). */
export interface MasteryRecord {
  readonly itemId: string;
  readonly timesPresented: number;
  readonly introductions: number;
  readonly guidedAttempts: number;
  readonly guidedCorrect: number;
  readonly independentAttempts: number;
  readonly independentCorrect: number;
  readonly correctAttempts: number;
  readonly incorrectAttempts: number;
  /** Consecutive first-try independent correct answers. */
  readonly consecutiveCorrect: number;
  /** Most recent results, oldest first: G/g = guided right/wrong, I/i = independent right/wrong. */
  readonly recent: string;
  readonly lastAttempted: number | null;
  /** Global presentation counter value when this item was last shown (-1 = never). Used for spacing. */
  readonly lastSeenStep: number;
  /** 0..100 */
  readonly masteryScore: number;
  readonly state: MasteryState;
}

export const MASTERY_RULES = {
  recentWindow: 10,
  /** Score needed (together with the streak) to become MASTERED. */
  masteredScore: 80,
  /** Consecutive independent first-try correct answers needed to become MASTERED. */
  masteredStreak: 3,
  /** A mastered item only drops back once its score falls below this (avoids flicker on one slip). */
  keepMasteredScore: 60,
  practisingScore: 35,
  /** Guided (hinted) answers alone can never push the score above this. */
  guidedCeiling: 60,
  introductionScore: 5,
} as const;

export interface AttemptInput {
  readonly kind: AttemptKind;
  readonly correct: boolean;
  /** True if this was the first answer chosen for this challenge. */
  readonly firstTry: boolean;
  readonly hintStrength: number;
}

export function createMasteryRecord(itemId: string): MasteryRecord {
  return {
    itemId,
    timesPresented: 0,
    introductions: 0,
    guidedAttempts: 0,
    guidedCorrect: 0,
    independentAttempts: 0,
    independentCorrect: 0,
    correctAttempts: 0,
    incorrectAttempts: 0,
    consecutiveCorrect: 0,
    recent: '',
    lastAttempted: null,
    lastSeenStep: -1,
    masteryScore: 0,
    state: 'NEW',
  };
}

export function deriveState(rec: MasteryRecord): MasteryState {
  const touched = rec.introductions > 0 || rec.guidedAttempts > 0 || rec.independentAttempts > 0;
  if (!touched) return 'NEW';
  if (rec.state === 'MASTERED' && rec.masteryScore >= MASTERY_RULES.keepMasteredScore) return 'MASTERED';
  if (rec.consecutiveCorrect >= MASTERY_RULES.masteredStreak && rec.masteryScore >= MASTERY_RULES.masteredScore) {
    return 'MASTERED';
  }
  if (rec.independentCorrect > 0 && rec.masteryScore >= MASTERY_RULES.practisingScore) return 'PRACTISING';
  return 'LEARNING';
}

function finalize(rec: MasteryRecord): MasteryRecord {
  return { ...rec, state: deriveState(rec) };
}

export function withPresentation(rec: MasteryRecord, step: number): MasteryRecord {
  return { ...rec, timesPresented: rec.timesPresented + 1, lastSeenStep: step };
}

export function withIntroduction(rec: MasteryRecord, now: number): MasteryRecord {
  return finalize({
    ...rec,
    introductions: rec.introductions + 1,
    masteryScore: Math.max(rec.masteryScore, MASTERY_RULES.introductionScore),
    lastAttempted: now,
  });
}

/**
 * Independent recall moves mastery much more than guided answers, and only first-try
 * independent answers build the streak needed for MASTERED.
 */
export function withAttempt(rec: MasteryRecord, attempt: AttemptInput, now: number): MasteryRecord {
  let score = rec.masteryScore;
  let consecutive = rec.consecutiveCorrect;
  const { kind, correct, firstTry } = attempt;

  if (kind === 'independent') {
    if (correct && firstTry) {
      score += 18;
      consecutive += 1;
    } else if (correct) {
      score += 3;
    } else {
      score -= firstTry ? 15 : 4;
      consecutive = 0;
    }
  } else {
    const ceiling = Math.max(score, MASTERY_RULES.guidedCeiling);
    if (correct && firstTry) {
      // Less help => more credit.
      score = Math.min(score + 6 + 6 * (1 - clamp(attempt.hintStrength, 0, 1)), ceiling);
    } else if (correct) {
      score = Math.min(score + 1, ceiling);
    } else {
      score -= firstTry ? 6 : 2;
    }
  }

  const symbol = kind === 'guided' ? (correct && firstTry ? 'G' : 'g') : correct && firstTry ? 'I' : 'i';
  const recent = (rec.recent + symbol).slice(-MASTERY_RULES.recentWindow);

  return finalize({
    ...rec,
    guidedAttempts: rec.guidedAttempts + (kind === 'guided' ? 1 : 0),
    guidedCorrect: rec.guidedCorrect + (kind === 'guided' && correct ? 1 : 0),
    independentAttempts: rec.independentAttempts + (kind === 'independent' ? 1 : 0),
    independentCorrect: rec.independentCorrect + (kind === 'independent' && correct ? 1 : 0),
    correctAttempts: rec.correctAttempts + (correct ? 1 : 0),
    incorrectAttempts: rec.incorrectAttempts + (correct ? 0 : 1),
    consecutiveCorrect: consecutive,
    recent,
    lastAttempted: now,
    masteryScore: clamp(Math.round(score), 0, 100),
  });
}

/** Fraction of recent results that were right first time, or null if never attempted. */
export function recentAccuracy(rec: MasteryRecord): number | null {
  if (rec.recent.length === 0) return null;
  let good = 0;
  for (const ch of rec.recent) if (ch === 'G' || ch === 'I') good++;
  return good / rec.recent.length;
}

/** Rebuilds a record from untrusted saved data, falling back to defaults field by field. */
export function sanitizeRecord(itemId: string, raw: unknown): MasteryRecord {
  const base = createMasteryRecord(itemId);
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Record<string, unknown>;
  const num = (key: keyof MasteryRecord, fallback: number): number => {
    const v = src[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  };
  const state = MASTERY_STATES.includes(src.state as MasteryState) ? (src.state as MasteryState) : 'NEW';
  const lastAttempted = typeof src.lastAttempted === 'number' ? src.lastAttempted : null;
  const recent = typeof src.recent === 'string' ? src.recent.replace(/[^GgIi]/g, '').slice(-MASTERY_RULES.recentWindow) : '';
  return finalize({
    itemId,
    timesPresented: num('timesPresented', 0),
    introductions: num('introductions', 0),
    guidedAttempts: num('guidedAttempts', 0),
    guidedCorrect: num('guidedCorrect', 0),
    independentAttempts: num('independentAttempts', 0),
    independentCorrect: num('independentCorrect', 0),
    correctAttempts: num('correctAttempts', 0),
    incorrectAttempts: num('incorrectAttempts', 0),
    consecutiveCorrect: num('consecutiveCorrect', 0),
    recent,
    lastAttempted,
    lastSeenStep: num('lastSeenStep', -1),
    masteryScore: clamp(num('masteryScore', 0), 0, 100),
    state,
  });
}
