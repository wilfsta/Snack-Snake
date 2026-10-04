import { clamp, turnLeft, turnRight, type Direction } from '../core/geometry';
import { defaultRng, shuffle, type Rng } from '../core/random';
import type { Challenge, ChallengeSource } from '../learning/types';
import { Arena } from './Arena';
import { planMove, rectContains, type Rect } from './collision';
import type { ModeRules } from './modes';
import { ScoreManager } from './scoring';
import { Snake, type SnakeView } from './Snake';
import { placeTiles } from './spawner';
import { measureTile, type Tile, type TileKind } from './tiles';

export type DeathCause = 'wrong-answer' | 'self' | 'wall' | 'arena-full';

/**
 * The in-game state machine. Exactly one phase is active at a time:
 *  ready      "Ready… Go!" countdown, snake waiting
 *  seek       PLAYING: one question (or fact) tile in the arena
 *  swallow    question just eaten; snake pauses to chew while answers pop in
 *  answer     ANSWER_MODE: five answers in the arena
 *  reaction   Learn mode: wrong answer spat out, short funny pause, then back to answer
 *  teach      LEARNING_INTRODUCTION: a new fact is being shown
 *  transition snake keeps moving briefly before the next challenge appears
 *  dying      cartoon death animation is playing
 *  over       GAME_OVER
 *  complete   SESSION_COMPLETE (learning session finished)
 */
export type SessionPhase =
  | { readonly kind: 'ready'; readonly until: number }
  | { readonly kind: 'seek' }
  | { readonly kind: 'swallow'; readonly until: number }
  | { readonly kind: 'answer' }
  | { readonly kind: 'reaction'; readonly until: number }
  | { readonly kind: 'teach'; readonly until: number; readonly startedAt: number }
  | { readonly kind: 'transition'; readonly until: number }
  | { readonly kind: 'dying'; readonly until: number; readonly cause: DeathCause }
  | { readonly kind: 'over'; readonly cause: DeathCause }
  | { readonly kind: 'complete' };

export type SessionPhaseKind = SessionPhase['kind'];

export interface GameOverInfo {
  readonly cause: DeathCause;
  /** The challenge that was answered wrongly (for revealing the right answer). */
  readonly challenge: Challenge | null;
  readonly wrongLabel: string | null;
  readonly score: number;
  readonly correct: number;
  readonly bestStreak: number;
}

export type SessionEvent =
  | { readonly type: 'challengePresented'; readonly challenge: Challenge }
  | { readonly type: 'questionEaten'; readonly challenge: Challenge; readonly tile: Tile }
  | { readonly type: 'answersShown'; readonly challenge: Challenge }
  | { readonly type: 'factCollected'; readonly challenge: Challenge; readonly tile: Tile }
  | {
      readonly type: 'correct';
      readonly challenge: Challenge;
      readonly tile: Tile;
      readonly points: number;
      readonly streak: number;
      readonly firstTry: boolean;
    }
  | { readonly type: 'wrong'; readonly challenge: Challenge; readonly tile: Tile; readonly fatal: boolean; readonly attempt: number }
  | { readonly type: 'foodEaten'; readonly tile: Tile; readonly points: number }
  | { readonly type: 'warmupComplete' }
  | { readonly type: 'selfBite'; readonly lost: readonly { x: number; y: number }[] }
  | { readonly type: 'bonk' }
  | { readonly type: 'died'; readonly cause: DeathCause }
  | { readonly type: 'gameOver'; readonly info: GameOverInfo }
  | { readonly type: 'sessionComplete' };

export const SESSION_TIMING = {
  readyMs: 1400,
  /** Snake pauses while chewing the question so children can read the answers calmly. */
  swallowMs: 900,
  answerStaggerMs: 90,
  reactionMs: 1050,
  transitionMs: 650,
  dyingMs: 2900,
  /** A new fact stays on screen at least this long, even if the button is mashed. */
  minTeachMs: 1800,
} as const;

/** How long a learning introduction lasts, and the pace of its skip-counting animation. */
export function teachingPlan(challenge: Challenge): { stepIntervalMs: number; totalMs: number } {
  const steps = challenge.teaching?.steps.length ?? 0;
  const stepIntervalMs = steps > 0 ? Math.min(380, 2800 / steps) : 0;
  return { stepIntervalMs, totalMs: 1400 + steps * stepIntervalMs + 1500 };
}

/** What the renderer needs from any snake world (a real session or the menu's demo). */
export interface SnakeWorld {
  readonly arena: Arena;
  readonly snake: SnakeView;
  readonly tiles: readonly Tile[];
  /** 0..1 progress between the previous grid position and the current one. */
  readonly moveProgress: number;
  /** World time in ms (pauses when the game pauses). */
  readonly time: number;
}

/** Classic mode has no questions at all. */
const NO_CHALLENGES: ChallengeSource = {
  next: () => {
    throw new Error('Classic mode has no challenges');
  },
  record: () => undefined,
  isSessionComplete: () => false,
};

export interface SessionOptions {
  readonly rules: ModeRules;
  /** Where questions come from. Not needed for Classic mode. */
  readonly source?: ChallengeSource;
  /** Plain apples to eat before the first question (lets young players learn to steer first). */
  readonly warmupFood?: number;
  readonly cols: number;
  readonly rows: number;
  readonly rng?: Rng;
  readonly onEvent?: (event: SessionEvent) => void;
}

/**
 * One game of Snake. Owns the arena, the snake, the tiles and the flow between phases.
 * It only knows about Challenges through the generic interface - never about multiplication.
 */
export class SnakeSession implements SnakeWorld {
  readonly arena: Arena;
  readonly snake: Snake;
  readonly rules: ModeRules;
  readonly score = new ScoreManager();

  private tileList: Tile[] = [];
  private currentPhase: SessionPhase;
  private clock = 0;
  private moveClock: number;
  private currentChallenge: Challenge | null = null;
  private attempts = 0;
  private nextTileId = 1;
  private lastWrongLabel: string | null = null;
  private warmupLeft: number;
  private readonly source: ChallengeSource;
  private readonly rng: Rng;
  private readonly emit: (event: SessionEvent) => void;

  constructor(options: SessionOptions) {
    this.rules = options.rules;
    this.source = options.source ?? NO_CHALLENGES;
    this.warmupLeft = options.source ? Math.max(0, options.warmupFood ?? 0) : 0;
    this.rng = options.rng ?? defaultRng;
    this.emit = options.onEvent ?? (() => undefined);
    this.arena = new Arena(options.cols, options.rows, options.rules.walls);
    const startX = clamp(Math.floor(options.cols * 0.3), options.rules.startLength, options.cols - 1);
    this.snake = new Snake({ x: startX, y: Math.floor(options.rows / 2) }, 'right', options.rules.startLength);
    this.moveClock = this.stepMs;
    this.currentPhase = { kind: 'ready', until: SESSION_TIMING.readyMs };
  }

  /** Spawns the first challenge. Separate from the constructor so listeners are in place first. */
  start(): void {
    const ok = this.rules.mode === 'classic' || this.warmupLeft > 0 ? this.spawnFood() : this.presentNextChallenge();
    if (!ok) this.endBecauseArenaFull();
  }

  get phase(): SessionPhase {
    return this.currentPhase;
  }

  get tiles(): readonly Tile[] {
    return this.tileList;
  }

  get time(): number {
    return this.clock;
  }

  get challenge(): Challenge | null {
    return this.currentChallenge;
  }

  get stepMs(): number {
    const r = this.rules;
    return Math.max(r.minStepMs, r.baseStepMs - this.score.correct * r.speedUpPerCorrectMs);
  }

  /** True while still eating warm-up apples (no questions yet). */
  get inWarmup(): boolean {
    return this.warmupLeft > 0;
  }

  get isMoving(): boolean {
    const k = this.currentPhase.kind;
    return k === 'seek' || k === 'answer' || k === 'transition';
  }

  get isFinished(): boolean {
    const k = this.currentPhase.kind;
    return k === 'over' || k === 'complete';
  }

  get moveProgress(): number {
    return clamp(this.moveClock / this.stepMs, 0, 1);
  }

  /** The correct tile while a hint is showing, so the snake can glance at it. */
  get hintTile(): Tile | null {
    return this.tileList.find((t) => t.isCorrect && t.hint > 0 && t.mark === 'none') ?? null;
  }

  steer(direction: Direction): boolean {
    const k = this.currentPhase.kind;
    if (k === 'dying' || k === 'over' || k === 'complete') return false;
    return this.snake.queueDirection(direction);
  }

  /** Lets an impatient child skip the end of a learning introduction (after a minimum viewing time). */
  skipTeaching(): void {
    const phase = this.currentPhase;
    if (phase.kind !== 'teach') return;
    const earliest = phase.startedAt + SESSION_TIMING.minTeachMs;
    this.currentPhase = { ...phase, until: Math.min(phase.until, Math.max(this.clock, earliest)) };
  }

  update(dtMs: number): void {
    if (this.isFinished) return;
    this.clock += dtMs;
    const phase = this.currentPhase;
    if ('until' in phase && this.clock >= phase.until) this.onPhaseTimeout(phase);

    if (this.isMoving) {
      this.moveClock += dtMs;
      let steps = 0;
      while (this.isMoving && this.moveClock >= this.stepMs && steps < 3) {
        this.moveClock -= this.stepMs;
        this.step();
        steps++;
      }
      if (this.moveClock > this.stepMs) this.moveClock = this.stepMs;
    } else {
      // While paused for a reaction, let the visuals glide into the current cell and rest there.
      this.moveClock = Math.min(this.moveClock + dtMs, this.stepMs);
    }
  }

  private onPhaseTimeout(phase: SessionPhase): void {
    switch (phase.kind) {
      case 'ready':
        this.currentPhase = { kind: 'seek' };
        break;
      case 'swallow':
      case 'reaction':
        this.currentPhase = { kind: 'answer' };
        break;
      case 'teach':
        this.beginTransition();
        break;
      case 'transition':
        this.finishTransition();
        break;
      case 'dying':
        this.currentPhase = { kind: 'over', cause: phase.cause };
        this.emit({ type: 'gameOver', info: this.gameOverInfo(phase.cause) });
        break;
      default:
        break;
    }
  }

  private step(): void {
    const direction = this.snake.takeTurn();
    const outcome = planMove(this.snake, this.arena, direction);

    if (outcome.kind === 'wall') {
      this.handleWall();
      return;
    }
    if (outcome.kind === 'self') {
      if (this.rules.selfCollision === 'game-over') {
        this.die('self');
        return;
      }
      // Learn mode: the snake bites its own tail and loses the bitten-off bit. Silly, not fatal.
      this.snake.moveTo(outcome.head);
      const lost = this.snake.truncate(Math.max(3, outcome.index + 1));
      this.emit({ type: 'selfBite', lost });
      return;
    }

    this.snake.moveTo(outcome.head);
    const tile = this.tileList.find((t) => t.mark === 'none' && this.clock >= t.bornAt && rectContains(t, outcome.head));
    if (tile) this.eat(tile);
  }

  private handleWall(): void {
    if (this.rules.wallCollision === 'game-over') {
      this.die('wall');
      return;
    }
    const current = this.snake.direction;
    const options = [turnLeft(current), turnRight(current)].filter(
      (d) => planMove(this.snake, this.arena, d).kind === 'move',
    );
    if (options.length === 0) {
      this.die('wall');
      return;
    }
    this.snake.forceDirection(options[Math.floor(this.rng.next() * options.length)]);
    this.emit({ type: 'bonk' });
  }

  private eat(tile: Tile): void {
    if (tile.kind === 'food') {
      // Classic Snake: munch, grow, a new snack appears straight away.
      this.removeTile(tile);
      const points = this.score.registerFood();
      this.snake.grow(this.rules.growthPerCorrect);
      this.emit({ type: 'foodEaten', tile, points });
      if (this.rules.mode !== 'classic' && this.warmupLeft > 0) {
        this.warmupLeft--;
        if (this.warmupLeft === 0) {
          // Warm-up done: a short pause, then the first number snack appears.
          this.emit({ type: 'warmupComplete' });
          this.beginTransition();
          return;
        }
      }
      if (!this.spawnFood()) this.endBecauseArenaFull();
      return;
    }
    const challenge = this.currentChallenge;
    if (!challenge) return;
    switch (tile.kind) {
      case 'question':
        this.removeTile(tile);
        this.emit({ type: 'questionEaten', challenge, tile });
        if (!this.spawnAnswers(challenge)) return;
        this.currentPhase = { kind: 'swallow', until: this.clock + SESSION_TIMING.swallowMs };
        this.emit({ type: 'answersShown', challenge });
        break;
      case 'fact':
        this.removeTile(tile);
        this.snake.grow(this.rules.growthPerCorrect);
        this.source.record({ type: 'introduced', challenge });
        this.source.record({ type: 'completed', challenge, firstTryCorrect: true });
        this.currentPhase = { kind: 'teach', until: this.clock + teachingPlan(challenge).totalMs, startedAt: this.clock };
        this.emit({ type: 'factCollected', challenge, tile });
        break;
      case 'answer':
        this.answer(challenge, tile);
        break;
    }
  }

  private answer(challenge: Challenge, tile: Tile): void {
    this.attempts++;
    const correctTile = this.tileList.find((t) => t.isCorrect) ?? null;
    this.source.record({
      type: 'answered',
      challenge,
      optionId: tile.optionId ?? '',
      correct: tile.isCorrect,
      attemptNumber: this.attempts,
      hintStrength: correctTile?.hint ?? 0,
    });

    if (tile.isCorrect) {
      const points = this.score.registerCorrect();
      this.snake.grow(this.rules.growthPerCorrect);
      this.tileList = [];
      const firstTry = this.attempts === 1;
      this.source.record({ type: 'completed', challenge, firstTryCorrect: firstTry });
      this.emit({ type: 'correct', challenge, tile, points, streak: this.score.streak, firstTry });
      this.beginTransition();
      return;
    }

    this.score.registerWrong();
    this.lastWrongLabel = tile.label;

    if (this.rules.wrongAnswer === 'game-over') {
      // Keep just the wrong and the right tiles on screen, clearly marked, for the reveal.
      tile.mark = 'wrong';
      if (correctTile) correctTile.mark = 'correct';
      this.tileList = correctTile ? [tile, correctTile] : [tile];
      this.emit({ type: 'wrong', challenge, tile, fatal: true, attempt: this.attempts });
      this.die('wrong-answer');
      return;
    }

    // Learn mode: spit it out, make the right answer a little easier to spot, carry on.
    this.removeTile(tile);
    if (correctTile) correctTile.hint = Math.max(correctTile.hint, this.attempts >= 2 ? 1 : 0.6);
    this.currentPhase = { kind: 'reaction', until: this.clock + SESSION_TIMING.reactionMs };
    this.emit({ type: 'wrong', challenge, tile, fatal: false, attempt: this.attempts });
  }

  private beginTransition(): void {
    this.currentPhase = { kind: 'transition', until: this.clock + SESSION_TIMING.transitionMs };
  }

  private finishTransition(): void {
    if (this.source.isSessionComplete()) {
      this.tileList = [];
      this.currentPhase = { kind: 'complete' };
      this.emit({ type: 'sessionComplete' });
      return;
    }
    if (this.presentNextChallenge()) {
      this.currentPhase = { kind: 'seek' };
    } else {
      this.endBecauseArenaFull();
    }
  }

  private presentNextChallenge(): boolean {
    const challenge = this.source.next();
    this.currentChallenge = challenge;
    this.attempts = 0;
    const kind: TileKind = challenge.stage === 'introduce' ? 'fact' : 'question';
    const label = kind === 'fact' ? challenge.statement : challenge.prompt;
    const rects = placeTiles(this.placementContext([]), [measureTile(kind, label)]);
    if (!rects) return false;
    this.tileList = [this.makeTile(kind, rects[0], label, null, false, 0)];
    this.emit({ type: 'challengePresented', challenge });
    return true;
  }

  private spawnFood(): boolean {
    const rects = placeTiles(this.placementContext([]), [measureTile('food', '')]);
    if (!rects) return false;
    this.tileList = [this.makeTile('food', rects[0], '', null, false, 0)];
    return true;
  }

  private spawnAnswers(challenge: Challenge): boolean {
    const options = shuffle(this.rng, [challenge.correctAnswer, ...challenge.distractors]);
    const rects = placeTiles(
      this.placementContext([]),
      options.map((o) => measureTile('answer', o.label)),
    );
    if (!rects) {
      this.endBecauseArenaFull();
      return false;
    }
    this.tileList = options.map((option, i) => {
      const isCorrect = option.id === challenge.correctAnswer.id;
      const tile = this.makeTile('answer', rects[i], option.label, option.id, isCorrect, i * SESSION_TIMING.answerStaggerMs);
      tile.hint = isCorrect ? challenge.hintStrength : 0;
      return tile;
    });
    return true;
  }

  private makeTile(kind: TileKind, rect: Rect, label: string, optionId: string | null, isCorrect: boolean, delayMs: number): Tile {
    return {
      id: this.nextTileId++,
      kind,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      label,
      optionId,
      isCorrect,
      bornAt: this.clock + delayMs,
      hint: 0,
      mark: 'none',
    };
  }

  private placementContext(obstacles: readonly Rect[]) {
    return {
      arena: this.arena,
      snakeCells: this.snake.body,
      head: this.snake.head,
      direction: this.snake.peekDirection(),
      obstacles,
      rng: this.rng,
    };
  }

  private removeTile(tile: Tile): void {
    this.tileList = this.tileList.filter((t) => t !== tile);
  }

  private die(cause: DeathCause): void {
    this.snake.clearQueue();
    this.currentPhase = { kind: 'dying', until: this.clock + SESSION_TIMING.dyingMs, cause };
    this.emit({ type: 'died', cause });
  }

  /** The snake is so long there is no fair space left - an amazing achievement, not a failure. */
  private endBecauseArenaFull(): void {
    this.tileList = [];
    if (this.rules.wrongAnswer === 'forgive') {
      // Learn mode never ends in failure.
      this.currentPhase = { kind: 'complete' };
      this.emit({ type: 'sessionComplete' });
    } else {
      this.currentPhase = { kind: 'over', cause: 'arena-full' };
      this.emit({ type: 'gameOver', info: this.gameOverInfo('arena-full') });
    }
  }

  private gameOverInfo(cause: DeathCause): GameOverInfo {
    return {
      cause,
      challenge: cause === 'wrong-answer' ? this.currentChallenge : null,
      wrongLabel: cause === 'wrong-answer' ? this.lastWrongLabel : null,
      score: this.score.score,
      correct: this.score.correct,
      bestStreak: this.score.bestStreak,
    };
  }
}
