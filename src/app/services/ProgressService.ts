import { createContentLibrary, type ContentLibrary } from '../../content/ContentLibrary';
import { highScoreKey, isNewHighScore } from '../../game/scoring';
import { LearningEngine } from '../../learning/LearningEngine';
import { LearningTracker } from '../../learning/LearningTracker';
import { ACTIVITY_DAYS_KEPT, dayKey, type StorageManager, type UnfinishedVisit } from '../../storage/StorageManager';

/** An unfinished visit is carried on only if the child comes back within this time (same sitting). */
export const VISIT_RESUME_MS = 3 * 60 * 60 * 1000;

/**
 * Everything the active player has achieved: learning progress, high scores and world visits.
 * Call reload() after switching player.
 */
export class ProgressService {
  readonly content: ContentLibrary = createContentLibrary();
  private currentTracker!: LearningTracker;
  private currentEngine!: LearningEngine;

  constructor(private readonly storage: StorageManager) {
    this.reload();
  }

  get tracker(): LearningTracker {
    return this.currentTracker;
  }

  get engine(): LearningEngine {
    return this.currentEngine;
  }

  /** Loads the active player's learning progress. */
  reload(): void {
    const profileId = this.storage.profile.id;
    const tracker = new LearningTracker(this.storage.profile.learning);
    // Always save into the player this tracker belongs to, even if the active player changes later.
    tracker.onChange(() =>
      this.storage.update((d) => {
        const owner = d.profiles.find((p) => p.id === profileId);
        if (owner) {
          owner.learning = tracker.snapshot();
          owner.updatedAt = Date.now();
        }
      }),
    );
    this.currentTracker = tracker;
    this.currentEngine = new LearningEngine(tracker, this.content);
  }

  bestScore(mode: string, unitId: string): number {
    return this.storage.profile.highScores[highScoreKey(mode, unitId)] ?? 0;
  }

  /** Saves a finished game's score. Returns the previous best and whether this beat it. */
  recordResult(mode: string, unitId: string, score: number, bestStreak: number): { previous: number; newBest: boolean } {
    const key = highScoreKey(mode, unitId);
    const previous = this.storage.profile.highScores[key] ?? 0;
    const newBest = isNewHighScore(score, previous);
    this.storage.updateProfile((p) => {
      if (newBest) p.highScores[key] = score;
      p.bestStreaks[key] = Math.max(p.bestStreaks[key] ?? 0, bestStreak);
    }, true);
    return { previous, newBest };
  }

  /** Times this player has entered a world. */
  worldVisits(worldId: string): number {
    return this.storage.profile.worldVisits[worldId] ?? 0;
  }

  /** Records entering a world. Returns how many times it had been visited before. */
  visitWorld(worldId: string): number {
    const before = this.storage.profile.worldVisits[worldId] ?? 0;
    this.storage.updateProfile((p) => (p.worldVisits[worldId] = before + 1));
    return before;
  }

  /** Has this player finished the starter apples in this world? */
  isOnboarded(worldId: string): boolean {
    return this.storage.profile.onboarded.includes(worldId);
  }

  markOnboarded(worldId: string): void {
    if (this.isOnboarded(worldId)) return;
    this.storage.updateProfile((p) => p.onboarded.push(worldId), true);
  }

  /**
   * The visit to carry on with in this world, if the player left one unfinished not long ago.
   * Anything older (or already complete) is a fresh start.
   */
  unfinishedVisit(worldId: string, visitLength: number, now = Date.now()): UnfinishedVisit | null {
    const visit = this.storage.profile.visit;
    if (!visit || visit.worldId !== worldId || visit.done <= 0 || visit.done >= visitLength) return null;
    if (now - visit.at > VISIT_RESUME_MS || now < visit.at) return null;
    return visit;
  }

  saveVisit(visit: Omit<UnfinishedVisit, 'at'>, now = Date.now()): void {
    this.storage.updateProfile((p) => (p.visit = { ...visit, at: now }));
  }

  clearVisit(): void {
    if (this.storage.profile.visit === null) return;
    this.storage.updateProfile((p) => (p.visit = null), true);
  }

  /** Adds to today's activity (questions answered, right first time, time played). */
  recordActivity(add: { questions?: number; firstTry?: number; ms?: number }, now = Date.now()): void {
    const today = dayKey(now);
    this.storage.updateProfile((p) => {
      const day = p.activity[today] ?? { questions: 0, firstTry: 0, ms: 0 };
      p.activity[today] = { questions: day.questions + (add.questions ?? 0), firstTry: day.firstTry + (add.firstTry ?? 0), ms: day.ms + Math.round(add.ms ?? 0) };
      const days = Object.keys(p.activity).sort();
      for (const old of days.slice(0, Math.max(0, days.length - ACTIVITY_DAYS_KEPT))) delete p.activity[old];
    });
  }

  flush(): void {
    this.storage.flush();
  }
}
