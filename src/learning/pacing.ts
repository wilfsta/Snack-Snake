import type { MasteryRecord } from './mastery';
import type { ChallengeStage } from './types';

/**
 * How long a child gets to think between collecting a question and the answers appearing.
 * All learning timings live here so they can be tuned in one place, and later adapted per
 * learner (e.g. using recorded response times) without touching the game.
 *
 * The aim is fluency: new material gets plenty of time, well-known facts gradually less, so that
 * "see 6 × 4 → recall 24" becomes natural. Nothing here is a hard time limit – the answers simply
 * appear later or sooner, and the child can take as long as they like to choose.
 */
export interface PacingConfig {
  readonly thinkingMs: {
    /** Never answered unaided before (including first quiet checks). */
    readonly new: number;
    readonly learning: number;
    readonly practising: number;
    readonly mastered: number;
  };
}

export const DEFAULT_PACING: PacingConfig = {
  thinkingMs: {
    new: 3200,
    learning: 2600,
    practising: 2000,
    mastered: 1500,
  },
};

/** Thinking time before answers appear, from how well the child knows this item. */
export function thinkingTimeFor(rec: MasteryRecord, stage: ChallengeStage, pacing: PacingConfig = DEFAULT_PACING): number {
  if (stage === 'introduce') return 0; // facts to collect have no answers
  const t = pacing.thinkingMs;
  if (stage === 'guided' || (rec.independentCorrect === 0 && rec.guidedCorrect === 0)) return t.new;
  switch (rec.state) {
    case 'MASTERED':
      return t.mastered;
    case 'PRACTISING':
      return t.practising;
    default:
      return t.learning;
  }
}
