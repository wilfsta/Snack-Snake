import { pick, type Rng } from '../core/random';
import { BaseSession, type SessionHooks } from './BaseSession';
import { curriculumGroups, probeItems, type Curriculum, type SkillGroup } from './curriculum';
import type { LearningTracker } from './LearningTracker';
import type { MasteryRecord } from './mastery';
import {
  confidenceFrom,
  CONFIRMS_TO_TRUST,
  DOUBTS_TO_REOPEN,
  exploreStep,
  groupInProgress,
  groupSecure,
  itemKnown,
  startExplore,
  type AssumedGroup,
  type CurriculumState,
  type ExploreState,
} from './placement';
import { needsIntroduction, pickNextItem, planStage, shouldUnlockMore } from './selection';
import type { Challenge, LearningContent } from './types';

export interface CurriculumHooks extends SessionHooks {
  /**
   * Skill groups the child has just moved past (learnt, or shown they already know).
   * Each group is reported at most once per session; callers de-duplicate across sessions.
   */
  onGroupsPassed?: (groupIds: readonly string[]) => void;
}

/** Why a challenge was asked, so its result is interpreted correctly. */
type Purpose =
  | { readonly kind: 'probe'; readonly group: number }
  | { readonly kind: 'recheck'; readonly group: number }
  | { readonly kind: 'learn'; readonly group: number }
  | { readonly kind: 'review'; readonly group: number };

/** Most quiet checks in one visit before simply getting on with learning. */
const MAX_PROBES_PER_SESSION = 16;
/** Every this-many learning questions, revisit something earlier (spaced review / re-check). */
const REVIEW_EVERY = 5;
/** Items unlocked when a child starts learning a skill group. */
const INITIAL_UNLOCKED = 2;

/**
 * A learning session over a whole curriculum (e.g. the Number Garden journey).
 *
 * It quietly finds the edge of the child's knowledge using ordinary questions, settles there to
 * teach, and keeps checking that anything skipped really is known. The child just plays.
 *
 *  - explore: probe representative items, jumping forward through skill groups while answers are
 *    right first time and narrowing back on a miss. Groups passed this way are *assumed* known.
 *  - settle:  learn the frontier group (introduce → guided → independent), mixing in reviews and
 *    re-checks of assumed groups. Repeated struggle triggers a re-check of the group before.
 */
export class CurriculumSession extends BaseSession {
  readonly groups: readonly SkillGroup[];
  private state: CurriculumState;
  private explore: ExploreState | null = null;
  /** Consecutive unaided right-first-time answers in this session. */
  private streak = 0;
  private probesAsked = 0;
  private readonly askedThisSession = new Set<string>();
  private readonly purposes = new Map<string, Purpose>();
  private learnCount = 0;
  private sinceIntroduction = Number.POSITIVE_INFINITY;
  private readonly triedAsQuestion = new Set<string>();
  /** A re-check to run next (after a doubt, or when struggling just past an assumed group). */
  private pendingRecheck: number | null = null;
  private readonly passed: Set<string>;
  /** Learning results in the current frontier group (for spotting struggle). */
  private frontierResults: boolean[] = [];
  private lastFrontier = -1;
  private lastExploreAt = -Infinity;

  constructor(
    readonly curriculum: Curriculum,
    tracker: LearningTracker,
    content: LearningContent,
    rng: Rng,
    protected override readonly hooks: CurriculumHooks,
    readonly sessionLength: number,
  ) {
    super(tracker, content, rng, hooks);
    this.groups = curriculumGroups(curriculum);
    this.state = tracker.curriculumState(curriculum.id);
    this.passed = new Set(this.groups.filter((_, i) => this.isPassed(i)).map((g) => g.id));
    this.maybeStartExplore();
  }

  isSessionComplete(): boolean {
    return this.completed >= this.sessionLength;
  }

  // ---- Reading the child's position ------------------------------------------------------------

  private records(group: number): MasteryRecord[] {
    return this.tracker.getAll(this.groups[group].itemIds);
  }

  private secure(group: number): boolean {
    return groupSecure(this.records(group));
  }

  private assumed(group: number): AssumedGroup | undefined {
    return this.state.assumed[this.groups[group].id];
  }

  private isPassed(group: number): boolean {
    return this.secure(group) || this.assumed(group) !== undefined;
  }

  /** The first group not yet learnt or believed known: where learning happens. */
  get frontier(): number {
    const i = this.groups.findIndex((_, g) => !this.isPassed(g));
    return i === -1 ? this.groups.length : i;
  }

  /** Current status of every group, for tests and grown-up views. */
  groupStatuses(): { id: string; status: 'secure' | 'assumed' | 'open' }[] {
    return this.groups.map((g, i) => ({ id: g.id, status: this.secure(i) ? 'secure' : this.assumed(i) ? 'assumed' : 'open' }));
  }

  get exploring(): boolean {
    return this.explore !== null;
  }

  private saveState(state: CurriculumState): void {
    this.state = state;
    this.tracker.setCurriculumState(this.curriculum.id, state);
  }

  /**
   * Start probing forward unless the child was clearly in the middle of learning the frontier
   * group last time (then we just carry on teaching it).
   */
  private maybeStartExplore(): void {
    const f = this.frontier;
    if (f >= this.groups.length) return;
    if (groupInProgress(this.records(f)) && confidenceFrom(this.results) !== 'strong') return;
    this.explore = startExplore(f, this.groups.length);
    this.lastExploreAt = this.completed;
  }

  // ---- Choosing the next challenge ---------------------------------------------------------------

  next(): Challenge {
    if (this.pendingRecheck !== null) {
      const g = this.pendingRecheck;
      this.pendingRecheck = null;
      if (this.assumed(g)) return this.ask(this.pickProbeItem(g), 'independent', { kind: 'recheck', group: g });
    }

    if (this.explore && this.probesAsked < MAX_PROBES_PER_SESSION) {
      const target = this.explore.target;
      // Already solid from earlier play: no need to ask, treat as answered.
      if (this.secure(target)) {
        this.applyExplore(true);
        return this.next();
      }
      this.probesAsked++;
      return this.ask(this.pickProbeItem(target), 'independent', { kind: 'probe', group: target });
    }
    this.explore = null;

    const f = this.frontier;
    if (f !== this.lastFrontier) {
      this.lastFrontier = f;
      this.frontierResults = [];
    }

    // Spaced review: now and then look back at an earlier group (re-checking assumed ones first).
    if (this.learnCount > 0 && this.learnCount % REVIEW_EVERY === 0) {
      const back = this.reviewGroup(f);
      if (back !== null) {
        this.learnCount++;
        const kind = this.assumed(back) ? 'recheck' : 'review';
        const item = kind === 'recheck' ? this.pickProbeItem(back) : this.pickReviewItem(back);
        return this.ask(item, 'independent', { kind, group: back });
      }
    }

    this.learnCount++;
    if (f >= this.groups.length) {
      // The whole journey is done: keep everything fresh with mixed practice.
      const g = Math.floor(this.rng.next() * this.groups.length);
      return this.ask(this.pickReviewItem(g), 'independent', { kind: 'review', group: g });
    }
    return this.learnIn(f);
  }

  /** Teach and practise inside the frontier group, the way Learn mode does. */
  private learnIn(g: number): Challenge {
    const unlocked = this.refreshUnlocked(g);
    const pending = unlocked.filter(needsIntroduction);
    const introduced = unlocked.filter((r) => !needsIntroduction(r));
    const purpose: Purpose = { kind: 'learn', group: g };

    const introduceNow = pending.length > 0 && (introduced.length < 2 || this.sinceIntroduction >= 2);
    if (introduceNow) {
      this.sinceIntroduction = 0;
      const next = pending[0];
      // Going well? Ask it as a plain question first; if they already know it, no lesson needed.
      const confidence = confidenceFrom(this.results);
      if (!this.triedAsQuestion.has(next.itemId) && (confidence === 'strong' || confidence === 'good')) {
        this.triedAsQuestion.add(next.itemId);
        return this.ask(next.itemId, 'independent', purpose);
      }
      return this.ask(next.itemId, 'introduce', purpose);
    }
    this.sinceIntroduction++;
    const pool = introduced.length > 0 ? introduced : unlocked;
    const record = pickNextItem(pool, this.tracker.currentStep, this.recent, this.rng);
    const plan = planStage(record);
    return this.ask(record.itemId, plan.stage, purpose, plan.hintStrength);
  }

  private refreshUnlocked(g: number): MasteryRecord[] {
    const group = this.groups[g];
    const key = `${this.curriculum.id}/${group.id}`;
    const total = group.itemIds.length;
    const initial = Math.min(INITIAL_UNLOCKED, total);
    const progress = this.tracker.unitProgress(key, initial);
    let unlocked = Math.min(Math.max(progress.unlocked, initial), total);
    let records = this.tracker.getAll(group.itemIds.slice(0, unlocked));
    if (unlocked < total && shouldUnlockMore(records)) {
      unlocked++;
      records = this.tracker.getAll(group.itemIds.slice(0, unlocked));
    }
    if (unlocked !== progress.unlocked) this.tracker.setUnitProgress(key, { ...progress, unlocked });
    return records;
  }

  /** An earlier group to look back at: unverified assumed groups first, otherwise any passed group. */
  private reviewGroup(frontier: number): number | null {
    const earlier = Array.from({ length: Math.min(frontier, this.groups.length) }, (_, i) => i);
    if (earlier.length === 0) return null;
    const unverified = earlier.filter((i) => {
      const a = this.assumed(i);
      return a !== undefined && !this.secure(i) && a.confirms < CONFIRMS_TO_TRUST;
    });
    if (unverified.length > 0) return unverified[unverified.length - 1];
    return pick(this.rng, earlier);
  }

  /** A representative item for checking a group, preferring ones not asked this visit. */
  private pickProbeItem(g: number): string {
    const group = this.groups[g];
    const reps = probeItems(group);
    const fresh = reps.filter((id) => !this.askedThisSession.has(id));
    if (fresh.length > 0) return fresh[0];
    const others = group.itemIds.filter((id) => !this.askedThisSession.has(id));
    return others.length > 0 ? pick(this.rng, others) : pick(this.rng, reps);
  }

  private pickReviewItem(g: number): string {
    const records = this.records(g).filter((r) => r.timesPresented > 0 || itemKnown(r));
    if (records.length === 0) return this.pickProbeItem(g);
    return pickNextItem(records, this.tracker.currentStep, this.recent, this.rng).itemId;
  }

  private ask(itemId: string, stage: 'introduce' | 'guided' | 'independent', purpose: Purpose, hintStrength = 0): Challenge {
    this.askedThisSession.add(itemId);
    const challenge = this.build(this.tracker.get(itemId), { stage, hintStrength: stage === 'guided' ? hintStrength : 0 });
    this.purposes.set(challenge.id, purpose);
    return challenge;
  }

  // ---- Learning from the answer ------------------------------------------------------------------

  protected override onChallengeCompleted(challenge: Challenge, firstTryCorrect: boolean): void {
    const purpose = this.purposes.get(challenge.id);
    this.purposes.delete(challenge.id);
    // Evidence only counts when nothing helped: a plain question, right first time.
    const unaided = challenge.stage === 'independent' && firstTryCorrect;
    if (challenge.stage !== 'introduce') this.streak = unaided ? this.streak + 1 : 0;

    if (purpose) {
      switch (purpose.kind) {
        case 'probe':
          if (this.explore && this.explore.target === purpose.group) this.applyExplore(unaided);
          break;
        case 'recheck':
          this.applyRecheck(purpose.group, unaided);
          break;
        case 'learn':
          // A hinted answer that was right is normal learning, not a sign of struggle.
          if (challenge.stage === 'independent' || (challenge.stage === 'guided' && !firstTryCorrect)) {
            this.afterLearn(purpose.group, unaided);
          }
          break;
        case 'review':
          break;
      }
    }
    this.reportPassedGroups();
  }

  private applyExplore(correct: boolean): void {
    if (!this.explore) return;
    const result = exploreStep(this.explore, correct, this.streak);
    if (result.confirmed) {
      const assumed = { ...this.state.assumed };
      const step = this.tracker.currentStep;
      for (let g = result.confirmed.from; g <= result.confirmed.to; g++) {
        const id = this.groups[g].id;
        if (this.secure(g) || assumed[id]) continue;
        assumed[id] = { how: g === result.confirmed.to ? 'probe' : 'implied', since: step, confirms: 0, doubts: 0 };
      }
      this.saveState({ assumed });
    }
    this.explore = result.next;
  }

  private applyRecheck(g: number, correct: boolean): void {
    const id = this.groups[g].id;
    const current = this.state.assumed[id];
    if (!current) return;
    if (correct) {
      this.saveState({ assumed: { ...this.state.assumed, [id]: { ...current, confirms: current.confirms + 1 } } });
      return;
    }
    const doubts = current.doubts + 1;
    if (doubts >= DOUBTS_TO_REOPEN) {
      // The assumption was wrong: reopen the group so it is taught properly. Groups that were
      // only *implied* by the same leap forward have no evidence of their own, so reopen them too.
      const assumed = { ...this.state.assumed };
      delete assumed[id];
      for (const [other, info] of Object.entries(assumed)) {
        if (info.how === 'implied' && info.since === current.since) delete assumed[other];
      }
      this.saveState({ assumed });
      this.explore = null;
      // Keep checking downwards while doubts continue; a right answer stops the chain.
      let below = -1;
      for (let i = g - 1; i >= 0; i--) {
        if (this.assumed(i) && !this.secure(i)) {
          below = i;
          break;
        }
      }
      if (below !== -1) this.pendingRecheck = below;
      return;
    }
    this.saveState({ assumed: { ...this.state.assumed, [id]: { ...current, doubts } } });
    // One slip could be bad luck: check again soon.
    this.pendingRecheck = g;
  }

  private afterLearn(g: number, unaided: boolean): void {
    this.frontierResults.push(unaided);
    if (this.frontierResults.length > 6) this.frontierResults.shift();
    const lastFour = this.frontierResults.slice(-4);
    // Struggling right after a skipped group? Maybe it was skipped wrongly: check it.
    if (lastFour.length === 4 && lastFour.filter((r) => !r).length >= 3 && g > 0 && this.assumed(g - 1) && !this.secure(g - 1)) {
      this.pendingRecheck = g - 1;
      this.frontierResults = [];
      return;
    }
    // Flying through? Look further ahead again (not too often).
    if (confidenceFrom(this.results) === 'strong' && this.streak >= 4 && this.completed - this.lastExploreAt >= 6 && this.probesAsked < MAX_PROBES_PER_SESSION) {
      this.explore = startExplore(this.frontier, this.groups.length);
      this.lastExploreAt = this.completed;
    }
  }

  private reportPassedGroups(): void {
    const newly: string[] = [];
    this.groups.forEach((group, i) => {
      if (!this.passed.has(group.id) && this.isPassed(i)) {
        this.passed.add(group.id);
        newly.push(group.id);
      }
    });
    if (newly.length > 0) this.hooks.onGroupsPassed?.(newly);
  }
}
