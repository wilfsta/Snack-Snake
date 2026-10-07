import type { WallMode } from './Arena';

/**
 * play    – answer questions, a wrong answer ends the game
 * learn   – guided learning, mistakes are safe
 * classic – the original Snake: eat food, grow, don't crash
 * garden  – a world: endless, nothing can go badly wrong, the learning path runs underneath
 */
export type GameModeId = 'play' | 'learn' | 'classic' | 'garden';

/** Everything that differs between game modes lives here, not in scattered if-statements. */
export interface ModeRules {
  readonly mode: GameModeId;
  readonly wrongAnswer: 'game-over' | 'forgive';
  readonly selfCollision: 'game-over' | 'trim';
  readonly walls: WallMode;
  /** Only relevant when walls are solid. */
  readonly wallCollision: 'game-over' | 'bounce';
  readonly startLength: number;
  readonly growthPerCorrect: number;
  /** Milliseconds per grid step. Higher = slower. */
  readonly baseStepMs: number;
  readonly minStepMs: number;
  /** Gentle speed-up per correct answer / food eaten. */
  readonly speedUpPerCorrectMs: number;
  /**
   * While a child is thinking about a collected question, Sid keeps moving but this many times
   * more slowly: still Snake, but nothing rushes them.
   */
  readonly thinkingSlowdown: number;
}

/** Player-chosen options (from the Options menu). */
export interface GameOptions {
  /** Index into SPEED_LEVELS. */
  readonly speed: number;
  readonly walls: WallMode;
  /** Answers on screen per question (2..6). Fewer = easier. */
  readonly answerCount: number;
}

export const SPEED_LEVELS: readonly { readonly label: string; readonly icon: string; readonly stepMs: number }[] = [
  { label: 'Snail', icon: '🐌', stepMs: 340 },
  { label: 'Slow', icon: '🐢', stepMs: 290 },
  { label: 'Steady', icon: '🐍', stepMs: 245 },
  { label: 'Quick', icon: '🐇', stepMs: 200 },
  { label: 'Zoom', icon: '🚀', stepMs: 160 },
];

export const MIN_ANSWERS = 2;
export const MAX_ANSWERS = 6;

/**
 * Defaults: a steady speed (a little slower than before), wrap-around edges (young children
 * lose far fewer games to accidental wall bumps) and five answers.
 */
export const DEFAULT_OPTIONS: GameOptions = { speed: 2, walls: 'wrap', answerCount: 5 };

export function sanitizeOptions(raw: Partial<GameOptions> | undefined): GameOptions {
  const speed = Number.isInteger(raw?.speed) && raw!.speed! >= 0 && raw!.speed! < SPEED_LEVELS.length ? raw!.speed! : DEFAULT_OPTIONS.speed;
  const walls = raw?.walls === 'solid' || raw?.walls === 'wrap' ? raw.walls : DEFAULT_OPTIONS.walls;
  const answerCount =
    Number.isInteger(raw?.answerCount) && raw!.answerCount! >= MIN_ANSWERS && raw!.answerCount! <= MAX_ANSWERS
      ? raw!.answerCount!
      : DEFAULT_OPTIONS.answerCount;
  return { speed, walls, answerCount };
}

export function buildRules(mode: GameModeId, options: GameOptions = DEFAULT_OPTIONS): ModeRules {
  const step = SPEED_LEVELS[options.speed]?.stepMs ?? SPEED_LEVELS[DEFAULT_OPTIONS.speed].stepMs;
  switch (mode) {
    case 'play':
      return {
        mode,
        wrongAnswer: 'game-over',
        selfCollision: 'game-over',
        walls: options.walls,
        wallCollision: 'game-over',
        startLength: 4,
        growthPerCorrect: 1,
        baseStepMs: step,
        minStepMs: Math.round(step * 0.8),
        speedUpPerCorrectMs: 2,
        thinkingSlowdown: 1.6,
      };
    case 'learn':
    case 'garden':
      // Learning stays gentle: a little slower, no speed-up, and walls bounce instead of killing.
      return {
        mode,
        wrongAnswer: 'forgive',
        selfCollision: 'trim',
        walls: options.walls,
        wallCollision: 'bounce',
        startLength: 4,
        growthPerCorrect: 1,
        baseStepMs: step + 30,
        minStepMs: step + 30,
        speedUpPerCorrectMs: 0,
        thinkingSlowdown: 1.6,
      };
    case 'classic':
      return {
        mode,
        wrongAnswer: 'game-over',
        selfCollision: 'game-over',
        walls: options.walls,
        wallCollision: 'game-over',
        startLength: 4,
        growthPerCorrect: 1,
        baseStepMs: step,
        minStepMs: Math.round(step * 0.6),
        speedUpPerCorrectMs: 3,
        thinkingSlowdown: 1,
      };
  }
}

export const PLAY_RULES = buildRules('play');
export const LEARN_RULES = buildRules('learn');
export const CLASSIC_RULES = buildRules('classic');
