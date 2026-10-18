/**
 * Playtest settings: switches a grown-up can flip in the "?debug" panel to compare versions of the
 * Number Garden with a real child. Without "?debug" the defaults always apply, so normal play is
 * never affected. Stored on this device only, apart from players' saves.
 */
export interface PlaytestSettings {
  /** What Sid does while the child thinks: keep moving slowly (normal), or stand still. */
  readonly sidWhileThinking: 'slow' | 'stop';
  /** Multiplies every thinking time (1 = normal). */
  readonly thinkingScale: number;
  /** Answers shown per Garden question. */
  readonly gardenAnswers: number;
}

export const DEFAULT_PLAYTEST: PlaytestSettings = { sidWhileThinking: 'slow', thinkingScale: 1, gardenAnswers: 3 };

export const THINKING_SCALES: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];
export const GARDEN_ANSWER_CHOICES: readonly number[] = [2, 3, 4];

const KEY = 'snack-snake.playtest';

/** Accepts only known values; anything odd falls back to the default. */
export function parsePlaytest(raw: unknown): PlaytestSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_PLAYTEST;
  const src = raw as Record<string, unknown>;
  return {
    sidWhileThinking: src.sidWhileThinking === 'stop' ? 'stop' : 'slow',
    thinkingScale: THINKING_SCALES.includes(src.thinkingScale as number) ? (src.thinkingScale as number) : DEFAULT_PLAYTEST.thinkingScale,
    gardenAnswers: GARDEN_ANSWER_CHOICES.includes(src.gardenAnswers as number) ? (src.gardenAnswers as number) : DEFAULT_PLAYTEST.gardenAnswers,
  };
}

export class PlaytestStore {
  private value: PlaytestSettings;

  /** `enabled` is false for normal play: then the defaults are used and nothing is read or written. */
  constructor(private readonly enabled: boolean) {
    this.value = DEFAULT_PLAYTEST;
    if (!enabled) return;
    try {
      const text = window.localStorage.getItem(KEY);
      this.value = text ? parsePlaytest(JSON.parse(text)) : DEFAULT_PLAYTEST;
    } catch {
      this.value = DEFAULT_PLAYTEST;
    }
  }

  get settings(): PlaytestSettings {
    return this.value;
  }

  /** True only when opened with ?debug: otherwise the game ignores these settings. */
  get active(): boolean {
    return this.enabled;
  }

  update(change: Partial<PlaytestSettings>): void {
    if (!this.enabled) return;
    this.value = parsePlaytest({ ...this.value, ...change });
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.value));
    } catch {
      // Private browsing or storage blocked: the setting still applies until the page is closed.
    }
  }
}
