import type { Direction } from '../core/geometry';
import { GamepadInput } from './GamepadInput';
import { KeyboardInput } from './KeyboardInput';
import { TouchInput } from './TouchInput';
import type { ControlAction, InputSink, InputSource } from './types';

type DirectionListener = (direction: Direction, source: InputSource) => void;
type ActionListener = (action: ControlAction, source: InputSource) => void;

export interface InputManagerOptions {
  readonly touchPad: HTMLElement;
  readonly swipeSurface: HTMLElement;
  readonly onGamepadChange: (connected: boolean, name: string | null) => void;
  readonly onTouchUsed: () => void;
}

/** Merges keyboard, gamepad and touch into one stream of abstract directions and actions. */
export class InputManager implements InputSink {
  private readonly directionListeners = new Set<DirectionListener>();
  private readonly actionListeners = new Set<ActionListener>();
  private lastSource: InputSource = 'keyboard';
  private readonly keyboard: KeyboardInput;
  private readonly gamepad: GamepadInput;

  constructor(options: InputManagerOptions) {
    this.keyboard = new KeyboardInput(this);
    this.gamepad = new GamepadInput(this, options.onGamepadChange);
    new TouchInput(this, options.touchPad, options.swipeSurface, options.onTouchUsed);
  }

  get lastUsedSource(): InputSource {
    return this.lastSource;
  }

  /** Call once per frame (the Gamepad API must be polled). */
  poll(): void {
    this.gamepad.poll();
  }

  onDirection(listener: DirectionListener): () => void {
    this.directionListeners.add(listener);
    return () => this.directionListeners.delete(listener);
  }

  onAction(listener: ActionListener): () => void {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }

  direction(direction: Direction, source: InputSource): void {
    this.lastSource = source;
    for (const listener of this.directionListeners) listener(direction, source);
  }

  action(action: ControlAction, source: InputSource): void {
    this.lastSource = source;
    for (const listener of this.actionListeners) listener(action, source);
  }

  destroy(): void {
    this.keyboard.destroy();
    this.gamepad.destroy();
  }
}
