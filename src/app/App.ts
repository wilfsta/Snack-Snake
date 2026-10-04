import { AudioManager } from '../audio/AudioManager';
import { DIRECTION_VECTORS, directionAngle, wrapDelta, type Direction, type Vec2 } from '../core/geometry';
import { GameLoop } from '../core/GameLoop';
import { defaultRng } from '../core/random';
import { StateMachine } from '../core/StateMachine';
import { mixedUnitId, unitId as arithmeticUnitId } from '../content/arithmetic/ArithmeticContent';
import { MULTIPLICATION, operationById, OPERATIONS, type ArithmeticOperation } from '../content/arithmetic/operations';
import { createContentLibrary } from '../content/ContentLibrary';
import { chooseArenaSize } from '../game/Arena';
import { DemoWorld } from '../game/DemoWorld';
import {
  buildRules,
  MAX_ANSWERS,
  MIN_ANSWERS,
  sanitizeOptions,
  SPEED_LEVELS,
  type GameModeId,
  type GameOptions,
} from '../game/modes';
import { highScoreKey, isNewHighScore } from '../game/scoring';
import {
  SESSION_TIMING,
  SnakeSession,
  teachingPlan,
  type DeathCause,
  type GameOverInfo,
  type SessionEvent,
  type SnakeWorld,
} from '../game/SnakeSession';
import type { Tile } from '../game/tiles';
import type { ControlAction } from '../input/types';
import { InputManager } from '../input/InputManager';
import { LearningEngine, type LearnSession, type PracticeSession, type StateChange } from '../learning/LearningEngine';
import { LearningTracker } from '../learning/LearningTracker';
import { Effects } from '../render/Effects';
import { GameRenderer } from '../render/GameRenderer';
import { SnakeAnimator, type AnimatorContext } from '../render/SnakeAnimator';
import { DEFAULT_SKIN } from '../render/skins';
import { createBestAvailableStore, StorageManager, type TouchControlsPreference } from '../storage/StorageManager';
import { UIManager, type TableChoice } from '../ui/UIManager';

/**
 * Top-level states. In-game sub-states (seeking a question, ANSWER_MODE, LEARNING_INTRODUCTION,
 * dying...) are owned by SnakeSession's own phase machine.
 */
type AppState =
  | 'MENU'
  | 'OPTIONS'
  | 'SUBJECT_SELECT'
  | 'TABLE_SELECT'
  | 'PLAYING'
  | 'PAUSED'
  | 'SESSION_COMPLETE'
  | 'GAME_OVER';

const TRANSITIONS: Readonly<Record<AppState, readonly AppState[]>> = {
  MENU: ['SUBJECT_SELECT', 'OPTIONS', 'PLAYING'],
  OPTIONS: ['MENU', 'PAUSED'],
  SUBJECT_SELECT: ['MENU', 'TABLE_SELECT'],
  TABLE_SELECT: ['SUBJECT_SELECT', 'MENU', 'PLAYING'],
  PLAYING: ['PAUSED', 'GAME_OVER', 'SESSION_COMPLETE', 'MENU'],
  PAUSED: ['PLAYING', 'MENU', 'OPTIONS'],
  GAME_OVER: ['PLAYING', 'TABLE_SELECT', 'MENU'],
  SESSION_COMPLETE: ['PLAYING', 'TABLE_SELECT', 'MENU'],
};

const CLASSIC_UNIT = 'classic';

const SUBJECT_EXAMPLES: Readonly<Record<string, string>> = { mul: '6 × 4', add: '7 + 3', sub: '9 − 2', div: '12 ÷ 3' };

const TABLE_TITLES: Readonly<Record<string, string>> = {
  mul: 'Pick a times table!',
  add: 'What are we adding?',
  sub: 'What are we taking away?',
  div: 'What are we dividing by?',
};

/** Meaningful interactions (introductions + answered questions) per learning session. */
const LEARN_SESSION_LENGTH = 10;

const DEATH_TEXT: Readonly<Record<DeathCause, { title: string; reason: string }>> = {
  'wrong-answer': { title: 'Uh-oh!', reason: 'Sid gobbled the wrong answer!' },
  self: { title: 'Oops!', reason: 'Sid got tangled up in a knot!' },
  wall: { title: 'Bonk!', reason: 'Sid bumped into the wall!' },
  'arena-full': { title: 'WOW!', reason: 'Sid filled the whole arena. Amazing!' },
};

interface ActiveGame {
  readonly mode: GameModeId;
  readonly unitId: string;
  readonly session: SnakeSession;
  /** Null in Classic mode (no questions). */
  readonly source: LearnSession | PracticeSession | null;
  newlyMastered: number;
}

/** The arithmetic operation a unit id belongs to, e.g. "add:table:3" → ADDITION. */
function operationOfUnit(unitId: string): ArithmeticOperation {
  return operationById(unitId.split(':')[0]) ?? MULTIPLICATION;
}

export class App {
  private readonly storage = new StorageManager(createBestAvailableStore());
  private readonly content = createContentLibrary();
  private readonly tracker: LearningTracker;
  private readonly engine: LearningEngine;
  private readonly audio: AudioManager;
  private readonly renderer: GameRenderer;
  private readonly ui: UIManager;
  private readonly input: InputManager;
  private readonly loop: GameLoop;
  private readonly states = new StateMachine<AppState>('MENU', TRANSITIONS);
  private readonly animator = new SnakeAnimator();
  private readonly effects = new Effects();
  private readonly skin = DEFAULT_SKIN;

  private game: ActiveGame | null = null;
  private demo: DemoWorld | null = null;
  private demoAspect = 0;
  private demoAnimator = new SnakeAnimator();
  private readonly demoEffects = new Effects();
  private touchSeen = false;

  constructor() {
    this.tracker = new LearningTracker(this.storage.data.learning);
    this.tracker.onChange(() => this.storage.update((d) => (d.learning = this.tracker.snapshot())));
    this.engine = new LearningEngine(this.tracker, this.content);

    this.audio = new AudioManager(this.storage.data.settings.muted);

    const canvas = document.getElementById('game');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #game canvas');
    this.renderer = new GameRenderer(canvas);

    this.ui = new UIManager({
      onToggleMute: () => this.toggleMute(),
      onCycleTouchControls: () => this.cycleTouchControls(),
      onPauseButton: () => this.pause(),
      onTeachingTap: () => this.game?.session.skipTeaching(),
      onFocusMove: () => this.audio.play('menuMove'),
    });
    this.ui.setMuted(this.audio.muted);
    this.ui.setTouchPreference(this.storage.data.settings.touchControls);

    const pad = document.getElementById('touch-pad');
    const stage = document.getElementById('stage');
    if (!pad || !stage) throw new Error('Missing touch elements');
    this.input = new InputManager({
      touchPad: pad,
      swipeSurface: stage,
      onGamepadChange: (connected) => this.ui.setControllerConnected(connected),
      onTouchUsed: () => {
        if (!this.touchSeen) {
          this.touchSeen = true;
          this.updateTouchVisibility();
        }
      },
    });
    this.input.onDirection((d) => this.handleDirection(d));
    this.input.onAction((a) => this.handleAction(a));

    // Any click/tap also counts as the gesture browsers need before playing audio.
    window.addEventListener('pointerdown', () => this.audio.unlock(), { capture: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
        this.storage.flush();
      }
    });
    window.addEventListener('blur', () => this.pause());
    window.addEventListener('pagehide', () => this.storage.flush());

    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
    );
  }

  start(): void {
    this.showMenu();
    this.loop.start();
  }

  // ---- Screens & flow -------------------------------------------------------------------------

  private goTo(state: AppState): void {
    if (this.states.current !== state) this.states.transition(state);
  }

  private click(action: () => void): () => void {
    return () => {
      this.audio.unlock();
      this.audio.play('menuSelect');
      action();
    };
  }

  private showMenu(): void {
    this.leaveGame();
    this.goTo('MENU');
    this.ui.showMenu(
      this.click(() => this.openSubjectSelect('play')),
      this.click(() => this.openSubjectSelect('learn')),
      this.click(() => this.startGame('classic', CLASSIC_UNIT)),
      this.click(() => this.openOptions()),
    );
  }

  private openSubjectSelect(mode: GameModeId): void {
    this.leaveGame();
    this.goTo('SUBJECT_SELECT');
    const subjects = OPERATIONS.map((op) => ({ id: op.id, symbol: op.symbol, name: op.name, example: SUBJECT_EXAMPLES[op.id] ?? '' }));
    this.ui.showSubjectSelect(
      mode,
      subjects,
      this.storage.data.settings.lastSubject,
      (subjectId) =>
        this.click(() => {
          this.storage.update((d) => (d.settings.lastSubject = subjectId));
          this.openTableSelect(mode, subjectId);
        })(),
      this.click(() => this.showMenu()),
    );
  }

  private openTableSelect(mode: GameModeId, subjectId: string): void {
    const op = operationById(subjectId) ?? MULTIPLICATION;
    this.leaveGame();
    this.goTo('TABLE_SELECT');
    const data = this.storage.data;
    const choices: TableChoice[] = op.units.map((n) => {
      const unitId = arithmeticUnitId(op, n);
      let detail: string | null = null;
      if (mode === 'play') {
        const best = data.highScores[highScoreKey('play', unitId)];
        detail = best ? `Best ${best}` : null;
      } else {
        const counts = this.engine.summarizeUnit(unitId).counts;
        const total = counts.NEW + counts.LEARNING + counts.PRACTISING + counts.MASTERED;
        detail = counts.NEW < total ? `★ ${counts.MASTERED} / ${total}` : 'New!';
      }
      return { unitId, label: op.unitLabel(n), detail };
    });
    if (mode === 'play') {
      const mixed = mixedUnitId(op);
      const best = data.highScores[highScoreKey('play', mixed)];
      choices.push({ unitId: mixed, label: 'MIXED', detail: best ? `Best ${best}` : 'All of them', wide: true });
    }
    const focus = mode === 'play' ? data.settings.lastPlayUnit : data.settings.lastLearnUnit;
    this.ui.showTableSelect(
      mode,
      TABLE_TITLES[op.id] ?? 'Pick one!',
      choices,
      focus,
      (unitId) => this.click(() => this.startGame(mode, unitId))(),
      this.click(() => this.openSubjectSelect(mode)),
    );
  }

  // ---- Options ---------------------------------------------------------------------------------

  private get options(): GameOptions {
    const s = this.storage.data.settings;
    return sanitizeOptions({ speed: s.speed ?? undefined, walls: s.walls ?? undefined, answerCount: s.answerCount ?? undefined });
  }

  private openOptions(): void {
    const fromPause = this.states.is('PAUSED');
    this.goTo('OPTIONS');
    const back = () => {
      if (fromPause) {
        this.goTo('PAUSED');
        this.showPauseScreen();
      } else {
        this.showMenu();
      }
    };
    const opts = this.options;
    this.ui.showOptions(
      {
        speed: opts.speed,
        speedLevels: SPEED_LEVELS,
        walls: opts.walls,
        answerCount: opts.answerCount,
        minAnswers: MIN_ANSWERS,
        maxAnswers: MAX_ANSWERS,
        inGame: fromPause,
      },
      {
        onSpeed: (speed) => this.storage.update((d) => (d.settings.speed = speed)),
        onWalls: (walls) => {
          this.storage.update((d) => (d.settings.walls = walls));
          this.audio.play('menuSelect');
        },
        onAnswers: (count) => this.storage.update((d) => (d.settings.answerCount = count)),
        onBack: this.click(() => {
          this.storage.flush();
          back();
        }),
      },
    );
  }

  private leaveGame(): void {
    this.game = null;
    this.ui.hideTeaching();
    this.ui.setHudVisible(false);
    this.updateTouchVisibility();
  }

  private startGame(mode: GameModeId, unitId: string): void {
    this.storage.update((d) => {
      if (mode === 'play') d.settings.lastPlayUnit = unitId;
      else if (mode === 'learn') d.settings.lastLearnUnit = unitId;
    });
    this.ui.clearScreen();
    this.ui.hideTeaching();
    this.ui.setHudVisible(true);
    this.updateTouchVisibility();
    this.renderer.resize();

    const { cols, rows } = chooseArenaSize(this.renderer.aspect);
    const options = this.options;
    const hooks = { onStateChange: (change: StateChange) => this.onMasteryChange(change), answerCount: options.answerCount };
    const source =
      mode === 'learn'
        ? this.engine.createLearnSession(unitId, LEARN_SESSION_LENGTH, hooks)
        : mode === 'play'
          ? this.engine.createPracticeSession(unitId, hooks)
          : null;
    const session = new SnakeSession({
      rules: buildRules(mode, options),
      source: source ?? undefined,
      cols,
      rows,
      onEvent: (event) => this.onSessionEvent(event),
    });
    this.game = { mode, unitId, session, source, newlyMastered: 0 };
    this.animator.reset(directionAngle(session.snake.direction));
    this.effects.clear();
    this.goTo('PLAYING');
    session.start();
  }

  private pause(): void {
    if (!this.states.is('PLAYING') || !this.game) return;
    this.goTo('PAUSED');
    this.audio.play('pause');
    this.showPauseScreen();
  }

  private showPauseScreen(): void {
    this.ui.showPause(
      this.click(() => this.resume()),
      this.click(() => this.restart()),
      this.click(() => this.showMenu()),
      this.click(() => this.openOptions()),
    );
  }

  /** Where "Change table" goes: the table list for that subject (Classic has none, so the menu). */
  private changeTable(game: ActiveGame): void {
    if (game.mode === 'classic') this.showMenu();
    else this.openTableSelect(game.mode, operationOfUnit(game.unitId).id);
  }

  private resume(): void {
    if (!this.states.is('PAUSED')) return;
    this.ui.clearScreen();
    this.goTo('PLAYING');
  }

  private restart(): void {
    const game = this.game;
    if (!game) return;
    this.startGame(game.mode, game.unitId);
  }

  private endGame(info: GameOverInfo): void {
    const game = this.game;
    if (!game) return;
    const key = highScoreKey(game.mode, game.unitId);
    const previous = this.storage.data.highScores[key];
    const newBest = isNewHighScore(info.score, previous);
    this.storage.update((d) => {
      if (newBest) d.highScores[key] = info.score;
      d.bestStreaks[key] = Math.max(d.bestStreaks[key] ?? 0, info.bestStreak);
    }, true);

    this.goTo('GAME_OVER');
    const text = DEATH_TEXT[info.cause];
    this.ui.showGameOver(
      {
        title: text.title,
        reason: text.reason,
        reveal: info.challenge ? { statement: info.challenge.statement, wrongLabel: info.wrongLabel } : null,
        score: info.score,
        best: Math.max(previous ?? 0, info.score),
        newBest,
        correct: info.correct,
        bestStreak: info.bestStreak,
      },
      this.click(() => this.restart()),
      this.click(() => this.changeTable(game)),
      this.click(() => this.showMenu()),
    );
  }

  private completeSession(): void {
    const game = this.game;
    if (!game) return;
    this.storage.flush();
    this.goTo('SESSION_COMPLETE');
    this.audio.play('learnAchievement');
    const summary = this.engine.summarizeUnit(game.unitId);
    this.ui.showSessionComplete(
      {
        title: summary.unit.title,
        counts: summary.counts,
        items: summary.items,
        correctThisSession: game.session.score.correct,
        newlyMastered: game.newlyMastered,
      },
      this.click(() => this.startGame('learn', game.unitId)),
      this.click(() => this.changeTable(game)),
      this.click(() => this.startGame('play', game.unitId)),
    );
  }

  // ---- Settings -------------------------------------------------------------------------------

  private toggleMute(): void {
    this.audio.unlock();
    const muted = this.audio.toggleMuted();
    this.storage.update((d) => (d.settings.muted = muted), true);
    this.ui.setMuted(muted);
    this.audio.play('menuSelect');
  }

  private cycleTouchControls(): void {
    const order: TouchControlsPreference[] = ['auto', 'on', 'off'];
    const current = this.storage.data.settings.touchControls;
    const next = order[(order.indexOf(current) + 1) % order.length];
    this.storage.update((d) => (d.settings.touchControls = next), true);
    this.ui.setTouchPreference(next);
    this.updateTouchVisibility();
    this.audio.play('menuSelect');
  }

  private updateTouchVisibility(): void {
    const pref = this.storage.data.settings.touchControls;
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.ui.setTouchControlsVisible(pref === 'on' || (pref === 'auto' && (coarse || this.touchSeen)));
  }

  // ---- Input ----------------------------------------------------------------------------------

  private handleDirection(direction: Direction): void {
    this.audio.unlock();
    if (this.ui.hasScreen()) {
      this.ui.navigate(direction);
      return;
    }
    if (this.states.is('PLAYING') && this.game) this.game.session.steer(direction);
  }

  private handleAction(action: ControlAction): void {
    this.audio.unlock();
    switch (this.states.current) {
      case 'PLAYING':
        if (action === 'confirm') this.game?.session.skipTeaching();
        else this.pause();
        return;
      case 'PAUSED':
        if (action === 'confirm') this.ui.activateFocused();
        else this.resume();
        return;
      default:
        if (!this.ui.hasScreen()) return;
        if (action === 'confirm') this.ui.activateFocused();
        else this.ui.back();
    }
  }

  // ---- Game events ----------------------------------------------------------------------------

  private onSessionEvent(event: SessionEvent): void {
    const game = this.game;
    if (!game) return;
    const session = game.session;
    const head = session.snake.head;
    const headCenter = { x: head.x + 0.5, y: head.y + 0.5 };
    const v = DIRECTION_VECTORS[session.snake.direction];
    const mouth = { x: headCenter.x + v.x * 0.45, y: headCenter.y + v.y * 0.45 };

    switch (event.type) {
      case 'questionEaten':
        this.animator.eat();
        this.effects.suck(event.tile, mouth);
        this.audio.play('questionEaten');
        this.audio.play('chew');
        break;
      case 'answersShown':
        this.audio.play('answersAppear');
        break;
      case 'factCollected': {
        this.animator.collectFact();
        this.animator.grow();
        this.effects.suck(event.tile, mouth);
        this.effects.burst(headCenter, 14, { shapes: ['star'], colors: ['#ffd54a', '#ffffff', '#ffb43a'] });
        this.audio.play('factLearned');
        const plan = teachingPlan(event.challenge);
        this.ui.showTeaching(event.challenge.statement, event.challenge.teaching?.caption ?? null, event.challenge.teaching?.steps ?? [], plan.stepIntervalMs);
        break;
      }
      case 'correct': {
        this.animator.celebrate(event.streak);
        const center = tileCenter(event.tile);
        this.effects.burst(center, event.streak >= 5 ? 30 : 18);
        this.effects.popText({ x: headCenter.x, y: headCenter.y - 0.9 }, game.mode === 'play' ? `+${event.points}` : '⭐', '#ffd54a', 0.9);
        this.effects.popText({ x: headCenter.x, y: headCenter.y - 2 }, event.challenge.statement, '#ffffff', 0.75, 1.7);
        this.audio.play('correct');
        this.audio.play('grow');
        if (event.streak >= 3 && event.streak % 5 === 0) {
          this.audio.play('streak');
          this.ui.flash(`🔥 ${event.streak} in a row!`);
        } else if (game.mode === 'learn') {
          this.ui.announce(`Yes! ${event.challenge.statement}`);
        }
        break;
      }
      case 'wrong':
        if (event.fatal) {
          this.audio.play('incorrect');
        } else {
          this.animator.spitOut();
          this.effects.spit(event.tile, mouth, directionAngle(session.snake.direction));
          this.audio.play('spit');
          this.ui.flash(event.attempt >= 2 ? 'Look for the sparkly one ✨' : 'Not that one – try another!', 'gentle');
        }
        break;
      case 'died':
        this.animator.die();
        this.audio.play('gameOver');
        break;
      case 'selfBite':
        this.animator.ouch();
        this.effects.poof(event.lost);
        this.audio.play('bonk');
        break;
      case 'bonk':
        this.animator.bonk();
        this.audio.play('bonk');
        break;
      case 'gameOver':
        this.endGame(event.info);
        break;
      case 'sessionComplete':
        this.completeSession();
        break;
      case 'foodEaten':
        this.animator.eat();
        this.animator.grow();
        this.effects.suck(event.tile, mouth);
        this.effects.burst(tileCenter(event.tile), 10, { shapes: ['dot', 'star'], colors: ['#ff4b4b', '#ffd54a', '#7bdc4c'] });
        this.effects.popText({ x: headCenter.x, y: headCenter.y - 0.9 }, `+${event.points}`, '#ffd54a', 0.8);
        this.audio.play('questionEaten');
        this.audio.play('grow');
        break;
      case 'challengePresented':
        break;
    }
  }

  private onMasteryChange(change: StateChange): void {
    const game = this.game;
    if (!game) return;
    if (change.to === 'MASTERED' && change.from !== 'MASTERED') {
      game.newlyMastered++;
      if (game.mode === 'learn') {
        this.ui.flash(`⭐ ${this.content.describeItem(change.itemId).full} – got it!`);
        this.audio.play('learnAchievement');
      }
    }
  }

  // ---- Loop -----------------------------------------------------------------------------------

  private update(dtMs: number): void {
    const dt = dtMs / 1000;
    const game = this.game;
    if (game) {
      if (this.states.is('PLAYING')) game.session.update(dtMs);
      this.animator.update(this.animatorContext(game.session, dt, game));
      this.effects.update(dt);
    } else if (this.demo) {
      this.demo.update(dtMs);
      this.demoAnimator.update(this.animatorContext(this.demo, dt, null));
      this.demoEffects.update(dt);
    }
  }

  private animatorContext(world: SnakeWorld, dt: number, game: ActiveGame | null): AnimatorContext {
    const snake = world.snake;
    const head = snake.body[0];
    let nearest: Vec2 | null = null;
    let nearestDist = Infinity;
    for (const tile of world.tiles) {
      if (tile.mark !== 'none' || tile.bornAt > world.time) continue;
      const offset = this.offsetTo(world, head, tile);
      const d = Math.hypot(offset.x, offset.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = offset;
      }
    }
    const session = game?.session ?? null;
    const hint = session?.hintTile ?? null;
    const phase = session?.phase.kind;
    return {
      dt,
      moving: session ? session.isMoving && this.states.is('PLAYING') : true,
      travelAngle: directionAngle(snake.direction),
      nearestTile: nearest,
      hintOffset: hint ? this.offsetTo(world, head, hint) : null,
      hintStrength: hint?.hint ?? 0,
      answering: phase === 'answer' || phase === 'swallow' || phase === 'reaction',
      paused: this.states.is('PAUSED'),
      streak: session?.score.streak ?? 0,
    };
  }

  /** Offset in cells from the centre of the head cell to a tile's centre (wrap-aware). */
  private offsetTo(world: SnakeWorld, head: Vec2, tile: Tile): Vec2 {
    const c = tileCenter(tile);
    const hx = head.x + 0.5;
    const hy = head.y + 0.5;
    const { arena } = world;
    if (arena.walls === 'wrap') return { x: wrapDelta(hx, c.x, arena.cols), y: wrapDelta(hy, c.y, arena.rows) };
    return { x: c.x - hx, y: c.y - hy };
  }

  private render(): void {
    this.input.poll();
    const game = this.game;
    if (game) {
      const session = game.session;
      this.renderer.render({
        world: session,
        animator: this.animator,
        effects: this.effects,
        skin: this.skin,
        banner: this.readyBanner(session),
      });
      this.syncTeaching(session);
      this.ui.updateHud({
        mode: game.mode,
        unitLabel: game.mode === 'classic' ? '🍎 Classic' : this.engine.requireUnit(game.unitId).shortTitle,
        score: session.score.score,
        streak: session.score.streak,
        best: Math.max(this.storage.data.highScores[highScoreKey(game.mode, game.unitId)] ?? 0, session.score.score),
        question: this.hudQuestion(session),
        progress:
          game.mode === 'learn' && game.source
            ? { done: Math.min(game.source.completedCount, LEARN_SESSION_LENGTH), total: LEARN_SESSION_LENGTH }
            : null,
      });
      return;
    }
    this.ensureDemo();
    if (this.demo) {
      this.renderer.render({ world: this.demo, animator: this.demoAnimator, effects: this.demoEffects, skin: this.skin });
    }
  }

  private hudQuestion(session: SnakeSession): string | null {
    const kind = session.phase.kind;
    const showing = kind === 'swallow' || kind === 'answer' || kind === 'reaction' || (kind === 'dying' && session.phase.cause === 'wrong-answer');
    return showing && session.challenge ? session.challenge.prompt : null;
  }

  private readyBanner(session: SnakeSession): { text: string; age: number } | null {
    if (session.phase.kind !== 'ready') return null;
    const goAt = SESSION_TIMING.readyMs - 500;
    const t = session.time;
    return t < goAt ? { text: 'Ready?', age: t / 1000 } : { text: 'Go!', age: (t - goAt) / 1000 };
  }

  private syncTeaching(session: SnakeSession): void {
    if (session.phase.kind !== 'teach' && this.ui.teachingVisible) this.ui.hideTeaching();
  }

  private ensureDemo(): void {
    const aspect = this.renderer.aspect;
    if (this.demo && Math.abs(aspect - this.demoAspect) < 0.35) return;
    const { cols, rows } = chooseArenaSize(aspect, 200);
    this.demoAspect = aspect;
    this.demoAnimator = new SnakeAnimator();
    this.demoEffects.clear();
    this.demo = new DemoWorld(cols, rows, defaultRng, (tile) => {
      this.demoAnimator.eat();
      this.demoEffects.burst(tileCenter(tile), 12);
    });
  }
}

function tileCenter(tile: Tile): Vec2 {
  return { x: tile.x + tile.w / 2, y: tile.y + tile.h / 2 };
}
