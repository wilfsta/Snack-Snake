import { createContentLibrary, type ContentLibrary } from '../../content/ContentLibrary';
import { highScoreKey, isNewHighScore } from '../../game/scoring';
import { LearningEngine } from '../../learning/LearningEngine';
import { LearningTracker } from '../../learning/LearningTracker';
import type { StorageManager } from '../../storage/StorageManager';

/**
 * Everything the player has achieved: learning progress, high scores and world visits.
 * The natural home for rewards, trophies and unlockables when they arrive.
 */
export class ProgressService {
  readonly content: ContentLibrary = createContentLibrary();
  readonly tracker: LearningTracker;
  readonly engine: LearningEngine;

  constructor(private readonly storage: StorageManager) {
    this.tracker = new LearningTracker(storage.data.learning);
    this.tracker.onChange(() => storage.update((d) => (d.learning = this.tracker.snapshot())));
    this.engine = new LearningEngine(this.tracker, this.content);
  }

  bestScore(mode: string, unitId: string): number {
    return this.storage.data.highScores[highScoreKey(mode, unitId)] ?? 0;
  }

  /** Saves a finished game's score. Returns the previous best and whether this beat it. */
  recordResult(mode: string, unitId: string, score: number, bestStreak: number): { previous: number; newBest: boolean } {
    const key = highScoreKey(mode, unitId);
    const previous = this.storage.data.highScores[key] ?? 0;
    const newBest = isNewHighScore(score, previous);
    this.storage.update((d) => {
      if (newBest) d.highScores[key] = score;
      d.bestStreaks[key] = Math.max(d.bestStreaks[key] ?? 0, bestStreak);
    }, true);
    return { previous, newBest };
  }

  /** Records entering a world. Returns how many times it had been visited before. */
  visitWorld(worldId: string): number {
    const before = this.storage.data.worldVisits[worldId] ?? 0;
    this.storage.update((d) => (d.worldVisits[worldId] = before + 1));
    return before;
  }

  flush(): void {
    this.storage.flush();
  }
}
