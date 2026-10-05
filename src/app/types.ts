import type { AudioManager } from '../audio/AudioManager';
import type { GameModeId } from '../game/modes';
import type { GameOverInfo } from '../game/SnakeSession';

/** Everything needed to start a game. */
export interface GameSpec {
  readonly mode: GameModeId;
  /** Unit for play/learn, the world's path unit for worlds, 'classic' for Classic. */
  readonly unitId: string;
  /** Set when playing inside a world (e.g. the Number Garden). */
  readonly worldId?: string;
}

/**
 * The only way controllers move the app between screens. App implements it and owns the
 * top-level state machine, so controllers never need to know about each other.
 */
export interface Navigator {
  showMenu(): void;
  openSubjectSelect(mode: GameModeId): void;
  openTableSelect(mode: GameModeId, subjectId: string): void;
  openOptions(): void;
  closeOptions(): void;
  openWardrobe(): void;
  /** "Who's playing?" */
  openProfiles(): void;
  /** Makes a player active, loads their progress and goes to the menu. */
  switchPlayer(id: string): void;
  /** Reloads the active player's progress (e.g. after the active player was deleted). */
  reloadPlayer(): void;
  /** Straight into the Number Garden. */
  playWorld(): void;
  startGame(spec: GameSpec): void;
  pause(): void;
  resume(): void;
  gameOver(info: GameOverInfo): void;
  sessionComplete(): void;
}

/** Wraps a UI action so it gives the standard click sound (and unlocks audio on first use). */
export function withClick(audio: AudioManager, action: () => void): () => void {
  return () => {
    audio.unlock();
    audio.play('menuSelect');
    action();
  };
}
