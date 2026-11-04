import type { AudioManager } from '../../audio/AudioManager';
import { sanitizeOptions, type GameModeId, type GameOptions } from '../../game/modes';
import type { PadSide, StorageManager, TouchControlsPreference } from '../../storage/StorageManager';
import type { UIManager } from '../../ui/UIManager';

const TOUCH_ORDER: readonly TouchControlsPreference[] = ['auto', 'on', 'off'];
const SIDE_ORDER: readonly PadSide[] = ['auto', 'left', 'right'];

/** Player preferences: game options, sound, touch pad and remembered selections. */
export class SettingsService {
  private touchSeen = false;

  constructor(
    private readonly storage: StorageManager,
    private readonly audio: AudioManager,
    private readonly ui: UIManager,
  ) {
    ui.setMuted(audio.muted);
    ui.setTouchPreference(storage.data.device.touchControls);
    this.applyPadSide();
  }

  get options(): GameOptions {
    const s = this.storage.profile.settings;
    return sanitizeOptions({ speed: s.speed ?? undefined, walls: s.walls ?? undefined, answerCount: s.answerCount ?? undefined });
  }

  setSpeed(speed: number): void {
    this.storage.updateProfile((p) => (p.settings.speed = speed));
  }

  setWalls(walls: 'wrap' | 'solid'): void {
    this.storage.updateProfile((p) => (p.settings.walls = walls));
  }

  setAnswerCount(count: number): void {
    this.storage.updateProfile((p) => (p.settings.answerCount = count));
  }

  lastUnit(mode: GameModeId): string | null {
    const s = this.storage.profile.settings;
    return mode === 'play' ? s.lastPlayUnit : mode === 'learn' ? s.lastLearnUnit : null;
  }

  rememberUnit(mode: GameModeId, unitId: string): void {
    this.storage.updateProfile((p) => {
      if (mode === 'play') p.settings.lastPlayUnit = unitId;
      else if (mode === 'learn') p.settings.lastLearnUnit = unitId;
    });
  }

  get lastSubject(): string | null {
    return this.storage.profile.settings.lastSubject;
  }

  rememberSubject(subjectId: string): void {
    this.storage.updateProfile((p) => (p.settings.lastSubject = subjectId));
  }

  toggleMute(): void {
    this.audio.unlock();
    const muted = this.audio.toggleMuted();
    this.storage.update((d) => (d.device.muted = muted), true);
    this.ui.setMuted(muted);
    this.audio.play('menuSelect');
  }

  cycleTouchControls(): void {
    const current = this.storage.data.device.touchControls;
    const next = TOUCH_ORDER[(TOUCH_ORDER.indexOf(current) + 1) % TOUCH_ORDER.length];
    this.storage.update((d) => (d.device.touchControls = next), true);
    this.ui.setTouchPreference(next);
    this.updateTouchVisibility();
    this.audio.play('menuSelect');
  }

  cyclePadSide(): void {
    const current = this.storage.profile.settings.padSide;
    const next = SIDE_ORDER[(SIDE_ORDER.indexOf(current) + 1) % SIDE_ORDER.length];
    this.storage.updateProfile((p) => (p.settings.padSide = next));
    this.applyPadSide();
    this.audio.play('menuSelect');
  }

  /** Each child keeps their own side; called again when the player changes. */
  applyPadSide(): void {
    this.ui.setPadSide(this.storage.profile.settings.padSide);
  }

  /** Called the first time the screen is touched, so "auto" can show the pad. */
  markTouchUsed(): void {
    if (this.touchSeen) return;
    this.touchSeen = true;
    this.updateTouchVisibility();
  }

  updateTouchVisibility(): void {
    const pref = this.storage.data.device.touchControls;
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.ui.setTouchControlsVisible(pref === 'on' || (pref === 'auto' && (coarse || this.touchSeen)));
  }
}
