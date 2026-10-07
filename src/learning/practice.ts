import { recentAccuracy, type MasteryRecord } from './mastery';
import { itemKnown, itemShaky } from './placement';

/**
 * What a child should practise next. Not wired into the game yet: this is the foundation for
 * spaced/adaptive revision ("you know your 2s, 5s and 10s, but some 4s need another look").
 */
export type PracticeReason = 'struggling' | 'shaky' | 'rusty';

export interface PracticeNeed {
  readonly itemId: string;
  readonly reason: PracticeReason;
  /** Recent right-first-time rate, if it has been answered. */
  readonly accuracy: number | null;
  /** Presentations since it was last seen. */
  readonly sinceSeen: number;
}

/** Known items that haven't come up for this many presentations are due a refresh. */
export const RUSTY_AFTER = 60;

/**
 * Items most in need of practice, most urgent first: ones the child keeps getting wrong, ones
 * that went wrong last time, then well-known ones that haven't been seen for a long while.
 */
export function practiceTargets(records: readonly MasteryRecord[], currentStep: number, limit = 10): PracticeNeed[] {
  const needs: PracticeNeed[] = [];
  for (const rec of records) {
    const attempted = rec.guidedAttempts + rec.independentAttempts > 0;
    if (!attempted) continue;
    const accuracy = recentAccuracy(rec);
    const sinceSeen = rec.lastSeenStep < 0 ? currentStep : currentStep - rec.lastSeenStep;
    let reason: PracticeReason | null = null;
    if (accuracy !== null && rec.recent.length >= 2 && accuracy < 0.6) reason = 'struggling';
    else if (itemShaky(rec)) reason = 'shaky';
    else if (itemKnown(rec) && sinceSeen >= RUSTY_AFTER) reason = 'rusty';
    if (reason) needs.push({ itemId: rec.itemId, reason, accuracy, sinceSeen });
  }
  const order: Record<PracticeReason, number> = { struggling: 0, shaky: 1, rusty: 2 };
  needs.sort((a, b) => order[a.reason] - order[b.reason] || (a.accuracy ?? 1) - (b.accuracy ?? 1) || b.sinceSeen - a.sinceSeen);
  return needs.slice(0, limit);
}
