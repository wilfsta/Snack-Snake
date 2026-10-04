import type { Direction } from '../core/geometry';

export type InputSource = 'keyboard' | 'gamepad' | 'touch';

/** Abstract, device-independent controls. */
export type ControlAction = 'pause' | 'confirm' | 'back';

/** Every input device feeds the same sink, so the game never cares where input came from. */
export interface InputSink {
  direction(direction: Direction, source: InputSource): void;
  action(action: ControlAction, source: InputSource): void;
}
