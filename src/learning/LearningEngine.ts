import { defaultRng, pick, weightedPick, type Rng } from '../core/random';
import type { LearningTracker, MasteryCounts } from './LearningTracker';
import type { MasteryRecord, MasteryState } from './mastery';
import {
  needsIntroduction,
  pickNextItem,
  planStage,
  practiceWeight,
  shouldUnlockMore,
  type StagePlan,
} from './selection';
import type { Challenge, ChallengeEvent, ChallengeSource, LearningContent, LearningUnit } from './types';

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

export interface UnitItemSummary {
  readonly itemId: string;
  readonly short: string;
  readonly full: string;
  readonly state: MasteryState;
}

export interface UnitSummary {
  readonly unit: LearningUnit;
  readonly counts: MasteryCounts;
  readonly items: readonly UnitItemSummary[];
}

let challengeCounter = 0;
function nextChallengeId(): string {
  challengeCounter += 1;
  return `ch${challengeCounter}`;
}

/**
 * The adaptive brain. Creates challenge sources for the game and quietly decides what to
 * present, in which stage, and when to introduce something new.
 */
export class LearningEngine {
  constructor(
    readonly tracker: LearningTracker,
    readonly content: LearningContent,
    private readonly rng: Rng = defaultRng,
  ) {}

  requireUnit(unitId: string): LearningUnit {
    const unit = this.content.getUnit(unitId);
    if (!unit) throw new Error(`Unknown learning unit: ${unitId}`);
    return unit;
  }

  /**
   * Learn mode: introduce → guided → independent, finishing after `sessionLength` challenges
   * (pass Infinity for an endless session). Accepts a unit id, or a unit object such as a world's
   * learning path that spans several units.
   */
  createLearnSession(unit: string | LearningUnit, sessionLength = 10, hooks: SessionHooks = {}): LearnSession {
    const resolved = typeof unit === 'string' ? this.requireUnit(unit) : unit;
    if (!resolved.supportsLearning) throw new Error(`Unit ${resolved.id} cannot be used for learning`);
    return new LearnSession(resolved, this.tracker, this.content, this.rng, hooks, sessionLength);
  }

  /** Play mode: endless independent recall across the whole unit. */
  createPracticeSession(unitId: string, hooks: SessionHooks = {}): PracticeSession {
    return new PracticeSession(this.requireUnit(unitId), this.tracker, this.content, this.rng, hooks);
  }

  summarizeUnit(unitOrId: string | LearningUnit): UnitSummary {
    const unit = typeof unitOrId === 'string' ? this.requireUnit(unitOrId) : unitOrId;
    const items = [...unit.itemIds]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((itemId) => ({ itemId, ...this.content.describeItem(itemId), state: this.tracker.get(itemId).state }));
    return { unit, counts: this.tracker.countStates(unit.itemIds), items };
  }
}

abstract class BaseSession implements ChallengeSource {
  protected readonly recent: string[] = [];
  /** First-try results of recent questions this session (true = right first time). */
  protected readonly results: boolean[] = [];
  protected completed = 0;

  constructor(
    readonly unit: LearningUnit,
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
        });
        break;
      case 'completed':
        this.completed++;
        if (event.challenge.stage !== 'introduce') {
          this.results.push(event.firstTryCorrect);
          if (this.results.length > 8) this.results.shift();
        }
        this.onCompleted();
        break;
    }
    const after = this.tracker.get(itemId).state;
    if (before !== after) this.hooks.onStateChange?.({ itemId, from: before, to: after });
  }

  protected onCompleted(): void {}

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

export class LearnSession extends BaseSession {
  private sinceIntroduction = Number.POSITIVE_INFINITY;
  private readonly probed = new Set<string>();

  constructor(
    unit: LearningUnit,
    tracker: LearningTracker,
    content: LearningContent,
    rng: Rng,
    hooks: SessionHooks,
    readonly sessionLength: number,
  ) {
    super(unit, tracker, content, rng, hooks);
  }

  isSessionComplete(): boolean {
    return this.completed >= this.sessionLength;
  }

  next(): Challenge {
    const unlocked = this.refreshUnlocked();
    const pending = unlocked.filter(needsIntroduction);
    const introduced = unlocked.filter((r) => !needsIntroduction(r));

    // New facts are introduced gradually, interleaved with practice of what is already known.
    const introduceNow = pending.length > 0 && (introduced.length < 2 || this.sinceIntroduction >= 2);
    if (introduceNow) {
      this.sinceIntroduction = 0;
      const next = pending[0];
      // On a roll? Quietly check whether they already know it before teaching it. Each item is
      // only tried this way once; if they don't know it, it is introduced properly next time.
      if (this.hooks.probeNewItems && !this.probed.has(next.itemId) && this.onARoll()) {
        this.probed.add(next.itemId);
        return this.build(next, { stage: 'independent', hintStrength: 0 });
      }
      return this.build(next, { stage: 'introduce', hintStrength: 0 });
    }

    this.sinceIntroduction++;
    const pool = introduced.length > 0 ? introduced : unlocked;
    const record = pickNextItem(pool, this.tracker.currentStep, this.recent, this.rng);
    return this.build(record, planStage(record));
  }

  protected override onCompleted(): void {
    if (this.isSessionComplete() && this.completed === this.sessionLength) {
      const progress = this.tracker.unitProgress(this.unit.id, this.initialUnlocked());
      this.tracker.setUnitProgress(this.unit.id, { ...progress, sessionsCompleted: progress.sessionsCompleted + 1 });
    }
  }

  /** The last four questions were all right first time. */
  private onARoll(): boolean {
    const last = this.results.slice(-4);
    return last.length === 4 && last.every(Boolean);
  }

  private initialUnlocked(): number {
    return Math.min(this.unit.initialBatch, this.unit.itemIds.length);
  }

  private refreshUnlocked(): MasteryRecord[] {
    const total = this.unit.itemIds.length;
    let progress = this.tracker.unitProgress(this.unit.id, this.initialUnlocked());
    let unlocked = Math.min(Math.max(progress.unlocked, this.initialUnlocked()), total);
    let records = this.tracker.getAll(this.unit.itemIds.slice(0, unlocked));
    if (unlocked < total && shouldUnlockMore(records)) {
      unlocked++;
      records = this.tracker.getAll(this.unit.itemIds.slice(0, unlocked));
    }
    if (unlocked !== progress.unlocked) {
      progress = { ...progress, unlocked };
      this.tracker.setUnitProgress(this.unit.id, progress);
    }
    return records;
  }
}

export class PracticeSession extends BaseSession {
  isSessionComplete(): boolean {
    return false;
  }

  next(): Challenge {
    const records = this.tracker.getAll(this.unit.itemIds);
    const record =
      weightedPick(this.rng, records, (r) => practiceWeight(r, this.recent, records.length)) ?? pick(this.rng, records);
    return this.build(record, { stage: 'independent', hintStrength: 0 });
  }
}
