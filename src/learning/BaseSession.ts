import type { Rng } from '../core/random';
import type { LearningTracker } from './LearningTracker';
import type { MasteryRecord, MasteryState } from './mastery';
import type { StagePlan } from './selection';
import type { Challenge, ChallengeEvent, ChallengeSource, LearningContent } from './types';

export interface StateChange {
  readonly itemId: string;
  readonly from: MasteryState;
  readonly to: MasteryState;
}

export interface SessionHooks {
  onStateChange?: (change: StateChange) => void;
  /** Total answers shown per question, including the right one (default 5). */
  answerCount?: number;
  /**
   * When the learner is on a roll, try a new item as a plain question first. Right first time
   * means they already know it, so the introduction and hinted practice are skipped.
   */
  probeNewItems?: boolean;
}

export const DEFAULT_ANSWER_COUNT = 5;

let challengeCounter = 0;
export function nextChallengeId(): string {
  challengeCounter += 1;
  return `ch${challengeCounter}`;
}

/** Shared bookkeeping for every kind of session: records outcomes and builds challenges. */
export abstract class BaseSession implements ChallengeSource {
  protected readonly recent: string[] = [];
  /** First-try results of recent questions this session (true = right first time). */
  protected readonly results: boolean[] = [];
  protected completed = 0;

  constructor(
    protected readonly tracker: LearningTracker,
    protected readonly content: LearningContent,
    protected readonly rng: Rng,
    protected readonly hooks: SessionHooks,
  ) {}

  abstract next(): Challenge;
  abstract isSessionComplete(): boolean;

  get completedCount(): number {
    return this.completed;
  }

  record(event: ChallengeEvent): void {
    const itemId = event.challenge.itemId;
    const before = this.tracker.get(itemId).state;
    switch (event.type) {
      case 'introduced':
        this.tracker.markIntroduced(itemId);
        break;
      case 'answered':
        this.tracker.recordAttempt(itemId, {
          kind: event.challenge.stage === 'guided' ? 'guided' : 'independent',
          correct: event.correct,
          firstTry: event.attemptNumber === 1,
          hintStrength: event.hintStrength,
          responseMs: event.responseMs,
        });
        break;
      case 'completed':
        this.completed++;
        if (event.challenge.stage !== 'introduce') {
          // Only unaided first tries count as evidence of knowing something.
          this.results.push(event.firstTryCorrect && event.challenge.stage === 'independent');
          if (this.results.length > 8) this.results.shift();
        }
        this.onChallengeCompleted(event.challenge, event.firstTryCorrect);
        break;
    }
    const after = this.tracker.get(itemId).state;
    if (before !== after) this.hooks.onStateChange?.({ itemId, from: before, to: after });
  }

  /** Called after every finished challenge (introductions included). */
  protected onChallengeCompleted(_challenge: Challenge, _firstTryCorrect: boolean): void {}

  protected build(record: MasteryRecord, plan: StagePlan): Challenge {
    this.tracker.markPresented(record.itemId);
    this.recent.push(record.itemId);
    if (this.recent.length > 8) this.recent.shift();
    return this.content.createChallenge(record.itemId, {
      challengeId: nextChallengeId(),
      stage: plan.stage,
      hintStrength: plan.hintStrength,
      distractorCount: Math.max(1, (this.hooks.answerCount ?? DEFAULT_ANSWER_COUNT) - 1),
      rng: this.rng,
    });
  }
}
