import { AudioManager } from '../audio/AudioManager';
import { GameLoop } from '../core/GameLoop';
import type { Direction } from '../core/geometry';
import { StateMachine } from '../core/StateMachine';
import type { GameModeId } from '../game/modes';
import type { GameOverInfo } from '../game/SnakeSession';
import { InputManager } from '../input/InputManager';
import type { ControlAction } from '../input/types';
import { GameRenderer } from '../render/GameRenderer';
import { createBestAvailableStore, StorageManager } from '../storage/StorageManager';
import { UIManager } from '../ui/UIManager';
import { BackdropController } from './controllers/BackdropController';
import { GameController } from './controllers/GameController';
import { MenuController } from './controllers/MenuController';
import { NUMBER_GARDEN } from '../worlds/worlds';
import { ProfileController } from './controllers/ProfileController';
import { WardrobeController } from './controllers/WardrobeController';
import { ProfileService } from './services/ProfileService';
import { ProgressService } from './services/ProgressService';
import { RewardService } from './services/RewardService';
import { SettingsService } from './services/SettingsService';
import type { GameSpec, Navigator } from './types';

/**
 * Top-level states. In-game sub-states (warm-up, seeking a question, ANSWER_MODE,
 * LEARNING_INTRODUCTION, dying...) are owned by SnakeSession's own phase machine.
 */
type AppState =
  | 'MENU'
  | 'OPTIONS'
  | 'SUBJECT_SELECT'
  | 'TABLE_SELECT'
  | 'PLAYING'
  | 'PAUSED'
  | 'SESSION_COMPLETE'
  | 'GAME_OVER'
  | 'WARDROBE'
  | 'PROFILES';

const TRANSITIONS: Readonly<Record<AppState, readonly AppState[]>> = {
  MENU: ['SUBJECT_SELECT', 'OPTIONS', 'PLAYING', 'WARDROBE', 'PROFILES'],
  PROFILES: ['MENU'],
  WARDROBE: ['MENU', 'PLAYING'],
  OPTIONS: ['MENU', 'PAUSED'],
  SUBJECT_SELECT: ['MENU', 'TABLE_SELECT'],
  TABLE_SELECT: ['SUBJECT_SELECT', 'MENU', 'PLAYING'],
  PLAYING: ['PAUSED', 'GAME_OVER', 'SESSION_COMPLETE', 'MENU'],
  PAUSED: ['PLAYING', 'MENU', 'OPTIONS'],
  GAME_OVER: ['PLAYING', 'TABLE_SELECT', 'MENU'],
  SESSION_COMPLETE: ['PLAYING', 'TABLE_SELECT', 'MENU', 'WARDROBE'],
};

/**
 * Composition root and router. It wires the services and controllers together, owns the
 * top-level state machine and routes input; the actual work lives in the controllers.
 */
export class App implements Navigator {
  private readonly storage = new StorageManager(createBestAvailableStore());
  private readonly states = new StateMachine<AppState>('MENU', TRANSITIONS);
  private readonly audio: AudioManager;
  private readonly renderer: GameRenderer;
  private readonly ui: UIManager;
  private readonly input: InputManager;
  private readonly loop: GameLoop;
  private readonly settings: SettingsService;
  private readonly progress: ProgressService;
  private readonly rewards: RewardService;
  private readonly menus: MenuController;
  private readonly wardrobe: WardrobeController;
  private readonly profiles: ProfileService;
  private readonly profileScreens: ProfileController;
  private readonly games: GameController;
  private readonly backdrop: BackdropController;
  /** Where "Done" in Options returns to. */
  private optionsFromPause = false;

  constructor() {
    this.audio = new AudioManager(this.storage.data.device.muted);

    const canvas = document.getElementById('game');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #game canvas');
    this.renderer = new GameRenderer(canvas);

    this.ui = new UIManager({
      onToggleMute: () => this.settings.toggleMute(),
      onCycleTouchControls: () => this.settings.cycleTouchControls(),
      onPauseButton: () => this.pause(),
      onTeachingTap: () => this.games.confirm(),
      onFocusMove: () => this.audio.play('menuMove'),
    });

    this.settings = new SettingsService(this.storage, this.audio, this.ui);
    this.progress = new ProgressService(this.storage);
    this.rewards = new RewardService(this.storage);
    this.profiles = new ProfileService(this.storage);
    this.profileScreens = new ProfileController(this, this.ui, this.audio, this.profiles);
    this.menus = new MenuController(this, this.ui, this.audio, this.settings, this.progress, this.rewards, this.profiles);
    this.games = new GameController(this, this.ui, this.audio, this.renderer, this.settings, this.progress, this.rewards);
    this.wardrobe = new WardrobeController(this, this.ui, this.audio, this.rewards);
    this.backdrop = new BackdropController(this.renderer, () => this.rewards.skin());

    const pad = document.getElementById('touch-pad');
    const stage = document.getElementById('stage');
    if (!pad || !stage) throw new Error('Missing touch elements');
    this.input = new InputManager({
      touchPad: pad,
      swipeSurface: stage,
      onGamepadChange: (connected) => this.ui.setControllerConnected(connected),
      onTouchUsed: () => this.settings.markTouchUsed(),
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
    // With more than one player, the first question is always "who's playing?".
    if (this.profiles.count > 1) {
      this.goTo('PROFILES');
      this.profileScreens.showPicker(false);
    } else {
      this.showMenu();
    }
    this.loop.start();
  }

  private goTo(state: AppState): void {
    if (this.states.current !== state) this.states.transition(state);
  }

  // ---- Navigator ------------------------------------------------------------------------------

  showMenu(): void {
    this.games.stop();
    this.goTo('MENU');
    this.menus.showMenu();
  }

  openSubjectSelect(mode: GameModeId): void {
    this.games.stop();
    this.goTo('SUBJECT_SELECT');
    this.menus.showSubjectSelect(mode);
  }

  openTableSelect(mode: GameModeId, subjectId: string): void {
    this.games.stop();
    this.goTo('TABLE_SELECT');
    this.menus.showTableSelect(mode, subjectId);
  }

  openOptions(): void {
    this.optionsFromPause = this.states.is('PAUSED');
    this.goTo('OPTIONS');
    this.menus.showOptions(this.optionsFromPause);
  }

  closeOptions(): void {
    if (this.optionsFromPause) {
      this.goTo('PAUSED');
      this.games.showPause();
    } else {
      this.showMenu();
    }
  }

  openWardrobe(): void {
    this.games.stop();
    this.goTo('WARDROBE');
    this.wardrobe.show();
  }

  openProfiles(): void {
    this.games.stop();
    this.goTo('PROFILES');
    this.profileScreens.showPicker(true);
  }

  switchPlayer(id: string): void {
    this.profiles.switchTo(id);
    this.reloadPlayer();
    this.showMenu();
  }

  reloadPlayer(): void {
    this.progress.reload();
    this.rewards.reload();
  }

  playWorld(): void {
    this.startGame({ mode: 'garden', unitId: `world:${NUMBER_GARDEN.id}`, worldId: NUMBER_GARDEN.id });
  }

  startGame(spec: GameSpec): void {
    this.goTo('PLAYING');
    this.games.start(spec);
  }

  pause(): void {
    if (!this.states.is('PLAYING') || !this.games.active) return;
    this.goTo('PAUSED');
    this.audio.play('pause');
    this.games.showPause();
  }

  resume(): void {
    if (!this.states.is('PAUSED')) return;
    this.ui.clearScreen();
    this.goTo('PLAYING');
  }

  gameOver(info: GameOverInfo): void {
    this.goTo('GAME_OVER');
    this.games.showGameOver(info);
  }

  sessionComplete(): void {
    this.goTo('SESSION_COMPLETE');
    this.games.showSessionComplete();
  }

  // ---- Input ----------------------------------------------------------------------------------

  private handleDirection(direction: Direction): void {
    this.audio.unlock();
    if (this.ui.hasScreen()) this.ui.navigate(direction);
    else if (this.states.is('PLAYING')) this.games.steer(direction);
  }

  private handleAction(action: ControlAction): void {
    this.audio.unlock();
    switch (this.states.current) {
      case 'PLAYING':
        if (action === 'confirm') this.games.confirm();
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

  // ---- Loop -----------------------------------------------------------------------------------

  private update(dtMs: number): void {
    if (this.games.active) {
      this.games.update(dtMs, { playing: this.states.is('PLAYING'), paused: this.states.is('PAUSED') });
    } else {
      this.backdrop.update(dtMs);
    }
  }

  private render(): void {
    this.input.poll();
    if (this.games.active) this.games.render();
    else this.backdrop.render();
  }
}
