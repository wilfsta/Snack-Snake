import type { MasteryRecord } from './mastery';

/**
 * Pure rules for finding the edge of a child's knowledge. Nothing here knows about Snake,
 * screens or any particular subject.
 */

// ---- Confidence from recent answers -----------------------------------------------------------

export type Confidence = 'unknown' | 'struggling' | 'uncertain' | 'good' | 'strong';

/**
 * How sure we are, from recent first-try results (true = right first time, without help).
 * Response speed is deliberately ignored: thoughtful children and children with motor
 * difficulties must not be treated as less able.
 */
export function confidenceFrom(results: readonly boolean[]): Confidence {
  if (results.length < 3) return 'unknown';
  const last = results.slice(-8);
  const rate = last.filter(Boolean).length / last.length;
  const lastFour = results.slice(-4);
  if ((lastFour.length === 4 && lastFour.every(Boolean)) || (last.length >= 8 && rate >= 7 / 8)) return 'strong';
  if (rate >= 0.75) return 'good';
  if (rate >= 0.5) return 'uncertain';
  return 'struggling';
}

// ---- Evidence about items and groups ------------------------------------------------------------

/** The child has shown they can do this item: practised/mastered, or last answered right first time unaided. */
export function itemKnown(rec: MasteryRecord): boolean {
  return rec.state === 'PRACTISING' || rec.state === 'MASTERED' || rec.recent.endsWith('I');
}

/** The last time this item came up, it needed help or went wrong. */
export function itemShaky(rec: MasteryRecord): boolean {
  return rec.recent.endsWith('i') || rec.recent.endsWith('g');
}

/** How many items of a group must be solid before the group counts as learnt (not every item). */
export function itemsNeededToSecure(groupSize: number): number {
  return Math.max(1, Math.min(6, Math.ceil(groupSize * 0.6)));
}

/** A group is genuinely secure when enough of its items are solid and few are shaky. */
export function groupSecure(records: readonly MasteryRecord[]): boolean {
  const known = records.filter(itemKnown).length;
  const shaky = records.filter(itemShaky).length;
  return known >= itemsNeededToSecure(records.length) && shaky * 3 <= known;
}

/** The child was clearly working on (and finding hard) this group last time. */
export function groupInProgress(records: readonly MasteryRecord[]): boolean {
  return records.some(itemShaky) || records.some((r) => r.introductions > 0 && !itemKnown(r));
}

// ---- Provisional ("assumed") groups --------------------------------------------------------------

/** Why a group is believed known without being learnt item by item. */
export interface AssumedGroup {
  /** probe: representative questions answered; implied: a harder group was answered. */
  readonly how: 'probe' | 'implied';
  /** Learning step (tracker presentation count) when it was assumed. */
  readonly since: number;
  /** Later re-checks answered right / wrong first time. */
  readonly confirms: number;
  readonly doubts: number;
}

export interface CurriculumState {
  readonly assumed: Readonly<Record<string, AssumedGroup>>;
}

export function emptyCurriculumState(): CurriculumState {
  return { assumed: {} };
}

/** Re-checks needed before an assumed group stops being checked often. */
export const CONFIRMS_TO_TRUST = 2;
/** Re-checks answered wrong that reopen an assumed group. */
export const DOUBTS_TO_REOPEN = 2;

export function sanitizeCurriculumState(raw: unknown): CurriculumState {
  if (!raw || typeof raw !== 'object') return emptyCurriculumState();
  const src = (raw as Record<string, unknown>).assumed;
  const assumed: Record<string, AssumedGroup> = {};
  if (src && typeof src === 'object') {
    for (const [id, value] of Object.entries(src as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const v = value as Record<string, unknown>;
      const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
      assumed[id] = { how: v.how === 'implied' ? 'implied' : 'probe', since: n(v.since), confirms: n(v.confirms), doubts: n(v.doubts) };
    }
  }
  return { assumed };
}

// ---- Finding the edge: an exponential-then-binary search over skill groups -----------------------

/**
 * While exploring, `lo` is the first group not yet shown to be known, `hi` the first group
 * shown to be too hard (or the end), and `target` the group currently being probed.
 * Jumps double while answers keep coming right (1, 2, 4 groups ahead...); a miss halves the
 * gap. This finds a capable child's level in a handful of questions.
 */
export interface ExploreState {
  readonly lo: number;
  readonly hi: number;
  readonly target: number;
  /** Right-first-time answers at the current target. */
  readonly atTarget: number;
  readonly jump: number;
}

export function startExplore(frontier: number, groupCount: number): ExploreState {
  return { lo: frontier, hi: groupCount, target: frontier, atTarget: 0, jump: 1 };
}

/**
 * Right answers needed at a group before moving past it. Two distinct items normally; once the
 * child has a long unbroken run (several groups' worth of evidence), one more right answer is
 * enough - the run itself is the extra evidence. A single lucky answer can never skip anything.
 */
export function probesNeeded(sessionStreak: number): number {
  return sessionStreak >= 4 ? 1 : 2;
}

export interface ExploreResult {
  /** Next explore state, or null when the edge has been found (the child settles at `edge`). */
  readonly next: ExploreState | null;
  /** Groups lo..confirmedUpTo are now believed known (target directly, the rest implied). */
  readonly confirmed: { readonly from: number; readonly to: number } | null;
  /** Where to settle when exploring ends. */
  readonly edge: number;
}

export function exploreStep(s: ExploreState, correctFirstTry: boolean, sessionStreak: number): ExploreResult {
  if (correctFirstTry) {
    const atTarget = s.atTarget + 1;
    if (atTarget < probesNeeded(sessionStreak)) return { next: { ...s, atTarget }, confirmed: null, edge: s.lo };
    const confirmed = { from: s.lo, to: s.target };
    const lo = s.target + 1;
    if (lo >= s.hi) return { next: null, confirmed, edge: lo };
    const jump = s.jump * 2;
    const target = Math.min(lo + jump - 1, s.hi - 1);
    return { next: { lo, hi: s.hi, target, atTarget: 0, jump }, confirmed, edge: lo };
  }
  // A miss: the edge is at or before this group.
  const hi = s.target;
  if (hi <= s.lo) return { next: null, confirmed: null, edge: s.lo };
  const target = s.lo + Math.floor((hi - 1 - s.lo) / 2);
  return { next: { lo: s.lo, hi, target, atTarget: 0, jump: 1 }, confirmed: null, edge: s.lo };
}
