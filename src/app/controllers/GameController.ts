import type { AudioManager } from '../../audio/AudioManager';
import { operationById } from '../../content/arithmetic/operations';
import { DIRECTION_VECTORS, directionAngle, type Direction } from '../../core/geometry';
import { chooseArenaSize } from '../../game/Arena';
import { buildRules } from '../../game/modes';
import { SESSION_TIMING, SnakeSession, teachingPlan, type DeathCause, type GameOverInfo, type SessionEvent } from '../../game/SnakeSession';
import type { LearnSession, PracticeSession, StateChange } from '../../learning/LearningEngine';
import { Effects } from '../../render/Effects';
import type { GameRenderer } from '../../render/GameRenderer';
import { SnakeAnimator } from '../../render/SnakeAnimator';
import { DEFAULT_SKIN } from '../../render/skins';
import type { UIManager } from '../../ui/UIManager';
import { worldById, type WorldDefinition } from '../../worlds/worlds';
import type { ProgressService } from '../services/ProgressService';
import type { SettingsService } from '../services/SettingsService';
import { withClick, type GameSpec, type Navigator } from '../types';
import { nearestTileOffset, offsetToTile, tileCenter } from './worldGeometry';

/** Meaningful interactions (introductions + answered questions) per Learn-mode session. */
export const LEARN_SESSION_LENGTH = 10;

const DEATH_TEXT: Readonly<Record<DeathCause, { title: string; reason: string }>> = {
  'wrong-answer': { title: 'Uh-oh!', reason: 'Sid gobbled the wrong answer!' },
  self: { title: 'Oops!', reason: 'Sid got tangled up in a knot!' },
  wall: { title: 'Bonk!', reason: 'Sid bumped into the wall!' },
  'arena-full': { title: 'WOW!', reason: 'Sid filled the whole arena. Amazing!' },
};

interface ActiveGame {
  readonly spec: GameSpec;
  readonly session: SnakeSession;
  /** Null in Classic mode (no questions). */
  readonly source: LearnSession | PracticeSession | null;
  readonly world: WorldDefinition | null;
  newlyMastered: number;
  /** Questions answered correctly this visit (shown as stars in worlds). */
  stars: number;
}

export interface FrameState {
  readonly playing: boolean;
  readonly paused: boolean;
}

/**
 * Runs one game at a time: builds the session for a GameSpec, turns game events into snake
 * reactions, particles and sounds, keeps the HUD up to date, and shows the end-of-game screens.
 */
export class GameController {
  private game: ActiveGame | null = null;
  private readonly animator = new SnakeAnimator();
  private readonly effects = new Effects();
  private readonly skin = DEFAULT_SKIN;

  constructor(
    private readonly nav: Navigator,
    private readonly ui: UIManager,
    private readonly audio: AudioManager,
    private readonly renderer: GameRenderer,
    private readonly settings: SettingsService,
    private readonly progress: ProgressService,
  ) {}

  get active(): boolean {
    return this.game !== null;
  }

  private click(action: () => void): () => void {
    return withClick(this.audio, action);
  }

  // ---- Lifecycle ------------------------------------------------------------------------------

  start(spec: GameSpec): void {
    this.settings.rememberUnit(spec.mode, spec.unitId);
    this.ui.clearScreen();
    this.ui.hideTeaching();
    this.ui.setHudVisible(true);
    this.settings.updateTouchVisibility();
    this.renderer.resize();

    const options = this.settings.options;
    const world = spec.worldId ? (worldById(spec.worldId) ?? null) : null;
    const engine = this.progress.engine;
    const onStateChange = (change: StateChange) => this.onMasteryChange(change);

    let source: LearnSession | PracticeSession | null = null;
    let warmupFood = 0;
    if (world) {
      const visitsBefore = this.progress.visitWorld(world.id);
      warmupFood = visitsBefore === 0 ? world.warmup.firstVisit : world.warmup.laterVisits;
      source = engine.createLearnSession(world.path, Number.POSITIVE_INFINITY, {
        onStateChange,
        answerCount: world.answerCount,
        probeNewItems: true,
      });
    } else if (spec.mode === 'learn') {
      source = engine.createLearnSession(spec.unitId, LEARN_SESSION_LENGTH, { onStateChange, answerCount: options.answerCount });
    } else if (spec.mode === 'play') {
      source = engine.createPracticeSession(spec.unitId, { onStateChange, answerCount: options.answerCount });
    }

    const { cols, rows } = chooseArenaSize(this.renderer.aspect);
    const session = new SnakeSession({
      rules: buildRules(spec.mode, options),
      source: source ?? undefined,
      warmupFood,
      cols,
      rows,
      onEvent: (event) => this.onSessionEvent(event),
    });
    this.game = { spec, session, source, world, newlyMastered: 0, stars: 0 };
    this.animator.reset(directionAngle(session.snake.direction));
    this.effects.clear();
    session.start();
  }

  stop(): void {
    this.game = null;
    this.ui.hideTeaching();
    this.ui.setHudVisible(false);
    this.settings.updateTouchVisibility();
  }

  restart(): void {
    if (this.game) this.nav.startGame(this.game.spec);
  }

  // ---- Input ----------------------------------------------------------------------------------

  steer(direction: Direction): void {
    this.game?.session.steer(direction);
  }

  confirm(): void {
    this.game?.session.skipTeaching();
  }

  // ---- Screens --------------------------------------------------------------------------------

  showPause(): void {
    this.ui.showPause(
      this.click(() => this.nav.resume()),
      this.click(() => this.restart()),
      this.click(() => this.nav.showMenu()),
      this.click(() => this.nav.openOptions()),
    );
  }

  showGameOver(info: GameOverInfo): void {
    const game = this.game;
    if (!game) return;
    const { previous, newBest } = this.progress.recordResult(game.spec.mode, game.spec.unitId, info.score, info.bestStreak);
    const text = DEATH_TEXT[info.cause];
    this.ui.showGameOver(
      {
        title: text.title,
        reason: text.reason,
        reveal: info.challenge ? { statement: info.challenge.statement, wrongLabel: info.wrongLabel } : null,
        score: info.score,
        best: Math.max(previous, info.score),
        newBest,
        correct: info.correct,
        bestStreak: info.bestStreak,
      },
      this.click(() => this.restart()),
      this.click(() => this.changeTable(game)),
      this.click(() => this.nav.showMenu()),
    );
  }

  showSessionComplete(): void {
    const game = this.game;
    if (!game) return;
    this.progress.flush();
    this.audio.play('learnAchievement');
    const unit = game.world ? game.world.path : game.spec.unitId;
    const summary = this.progress.engine.summarizeUnit(unit);
    const learnUnit = game.spec.unitId;
    this.ui.showSessionComplete(
      {
        title: summary.unit.title,
        counts: summary.counts,
        items: summary.items,
        correctThisSession: game.session.score.correct,
        newlyMastered: game.newlyMastered,
      },
      this.click(() => this.restart()),
      this.click(() => this.changeTable(game)),
      this.click(() => (game.world ? this.nav.showMenu() : this.nav.startGame({ mode: 'play', unitId: learnUnit }))),
    );
  }

  /** "Change table" goes back to that subject's list; worlds and Classic go to the menu. */
  private changeTable(game: ActiveGame): void {
    const { mode, unitId } = game.spec;
    if (mode === 'play' || mode === 'learn') this.nav.openTableSelect(mode, operationById(unitId.split(':')[0])?.id ?? 'mul');
    else this.nav.showMenu();
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
    const inWorld = game.world !== null;

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
        game.stars++;
        this.animator.celebrate(event.streak);
        this.effects.burst(tileCenter(event.tile), event.streak >= 5 ? 30 : 18);
        const reward = game.spec.mode === 'play' ? `+${event.points}` : '⭐';
        this.effects.popText({ x: headCenter.x, y: headCenter.y - 0.9 }, reward, '#ffd54a', 0.9);
        this.effects.popText({ x: headCenter.x, y: headCenter.y - 2 }, event.challenge.statement.replace(/\n/g, ''), '#ffffff', 0.75, 1.7);
        this.audio.play('correct');
        this.audio.play('grow');
        if (event.streak >= 3 && event.streak % 5 === 0) {
          this.audio.play('streak');
          this.ui.flash(inWorld ? '🔥🔥🔥' : `🔥 ${event.streak} in a row!`);
        } else if (game.spec.mode !== 'play') {
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
          // Worlds stay text-free; the sparkly hint and the snake's reaction say it all.
          if (!inWorld) this.ui.flash(event.attempt >= 2 ? 'Look for the sparkly one ✨' : 'Not that one – try another!', 'gentle');
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
      case 'foodEaten':
        this.animator.eat();
        this.animator.grow();
        this.effects.suck(event.tile, mouth);
        this.effects.burst(tileCenter(event.tile), 10, { shapes: ['dot', 'star'], colors: ['#ff4b4b', '#ffd54a', '#7bdc4c'] });
        if (!inWorld) this.effects.popText({ x: headCenter.x, y: headCenter.y - 0.9 }, `+${event.points}`, '#ffd54a', 0.8);
        this.audio.play('questionEaten');
        this.audio.play('grow');
        break;
      case 'warmupComplete':
        this.animator.say('Ooh! Numbers!', 1.6);
        this.audio.play('learnAchievement');
        break;
      case 'gameOver':
        this.nav.gameOver(event.info);
        break;
      case 'sessionComplete':
        this.nav.sessionComplete();
        break;
      case 'challengePresented':
        break;
    }
  }

  private onMasteryChange(change: StateChange): void {
    const game = this.game;
    if (!game || change.to !== 'MASTERED' || change.from === 'MASTERED') return;
    game.newlyMastered++;
    if (game.spec.mode === 'play' || game.spec.mode === 'classic') return;
    // In worlds a mastered fact is a burst of stars, no words needed.
    this.ui.flash(game.world ? '⭐⭐⭐' : `⭐ ${this.progress.content.describeItem(change.itemId).full} – got it!`);
    this.audio.play('learnAchievement');
    const head = game.session.snake.head;
    this.effects.burst({ x: head.x + 0.5, y: head.y + 0.5 }, 24, { shapes: ['star'], colors: ['#ffd54a', '#fff6c2', '#ffb43a'] });
  }

  // ---- Frame ----------------------------------------------------------------------------------

  update(dtMs: number, frame: FrameState): void {
    const game = this.game;
    if (!game) return;
    const session = game.session;
    if (frame.playing) session.update(dtMs);
    const hint = session.hintTile;
    const phase = session.phase.kind;
    this.animator.update({
      dt: dtMs / 1000,
      moving: session.isMoving && frame.playing,
      travelAngle: directionAngle(session.snake.direction),
      nearestTile: nearestTileOffset(session),
      hintOffset: hint ? offsetToTile(session, hint) : null,
      hintStrength: hint?.hint ?? 0,
      answering: phase === 'answer' || phase === 'swallow' || phase === 'reaction',
      paused: frame.paused,
      streak: session.score.streak,
    });
    this.effects.update(dtMs / 1000);
  }

  render(): void {
    const game = this.game;
    if (!game) return;
    const session = game.session;
    this.renderer.render({
      world: session,
      animator: this.animator,
      effects: this.effects,
      skin: this.skin,
      banner: this.readyBanner(session),
      theme: game.world?.theme ?? 'sky',
    });
    if (session.phase.kind !== 'teach' && this.ui.teachingVisible) this.ui.hideTeaching();

    const { mode, unitId } = game.spec;
    this.ui.updateHud({
      mode,
      unitLabel: game.world ? game.world.icon : mode === 'classic' ? '🍎 Classic' : this.progress.engine.requireUnit(unitId).shortTitle,
      score: game.world ? game.stars : session.score.score,
      streak: session.score.streak,
      best: Math.max(this.progress.bestScore(mode, unitId), session.score.score),
      question: this.hudQuestion(session),
      progress:
        mode === 'learn' && game.source
          ? { done: Math.min(game.source.completedCount, LEARN_SESSION_LENGTH), total: LEARN_SESSION_LENGTH }
          : null,
    });
  }

  private hudQuestion(session: SnakeSession): string | null {
    const kind = session.phase.kind;
    const showing =
      kind === 'swallow' || kind === 'answer' || kind === 'reaction' || (kind === 'dying' && session.phase.cause === 'wrong-answer');
    return showing && session.challenge ? session.challenge.prompt : null;
  }

  private readyBanner(session: SnakeSession): { text: string; age: number } | null {
    if (session.phase.kind !== 'ready') return null;
    const goAt = SESSION_TIMING.readyMs - 500;
    const t = session.time;
    return t < goAt ? { text: 'Ready?', age: t / 1000 } : { text: 'Go!', age: (t - goAt) / 1000 };
  }
}
