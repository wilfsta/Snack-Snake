import { createContentLibrary, type ContentLibrary } from '../../content/ContentLibrary';
import { highScoreKey, isNewHighScore } from '../../game/scoring';
import { LearningEngine } from '../../learning/LearningEngine';
import { LearningTracker } from '../../learning/LearningTracker';
import type { StorageManager } from '../../storage/StorageManager';

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

  flush(): void {
    this.storage.flush();
  }
}
