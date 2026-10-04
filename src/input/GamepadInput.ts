import type { Direction } from '../core/geometry';
import type { ControlAction, InputSink } from './types';

/** Standard Gamepad API button indices (DualShock 4 / DualSense / Xbox all map the same way). */
export const PAD_BUTTONS = {
  cross: 0,
  circle: 1,
  share: 8,
  options: 9,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

export const STICK_DEADZONE = 0.5;

const BUTTON_ACTIONS: readonly [number, ControlAction][] = [
  [PAD_BUTTONS.cross, 'confirm'],
  [PAD_BUTTONS.circle, 'back'],
  [PAD_BUTTONS.options, 'pause'],
  [PAD_BUTTONS.share, 'pause'],
];

/**
 * Converts an analogue stick position into a direction.
 * - Inside the dead zone: no direction (stops drift from worn sticks).
 * - Hysteresis keeps the previous axis near diagonals, so the snake doesn't jitter between turns.
 */
export function stickDirection(x: number, y: number, previous: Direction | null, deadzone = STICK_DEADZONE): Direction | null {
  if (Math.hypot(x, y) < deadzone) return null;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const bias = 1.3;
  let horizontal = ax > ay;
  if (previous === 'left' || previous === 'right') horizontal = ax * bias >= ay;
  else if (previous === 'up' || previous === 'down') horizontal = ax > ay * bias;
  if (horizontal) return x > 0 ? 'right' : 'left';
  return y > 0 ? 'down' : 'up';
}

/** Some non-"standard" mappings report the D-pad as a single hat axis. */
function hatDirection(pad: Gamepad): Direction | null {
  if (pad.mapping === 'standard' || pad.axes.length < 10) return null;
  const v = pad.axes[9];
  if (v === undefined || v > 1.05) return null;
  const near = (target: number) => Math.abs(v - target) < 0.12;
  if (near(-1)) return 'up';
  if (near(-0.43)) return 'right';
  if (near(0.14)) return 'down';
  if (near(0.71)) return 'left';
  return null;
}

interface PadState {
  dir: Direction | null;
  stickDir: Direction | null;
  buttons: boolean[];
}

/**
 * Polls the Web Gamepad API once per frame and emits *edges* (new direction, new press),
 * so holding a direction doesn't spam turns.
 */
export class GamepadInput {
  private readonly states = new Map<number, PadState>();
  private connectedCount = 0;

  constructor(
    private readonly sink: InputSink,
    private readonly onConnectionChange: (connected: boolean, name: string | null) => void,
  ) {
    window.addEventListener('gamepadconnected', this.refreshConnection);
    window.addEventListener('gamepaddisconnected', this.refreshConnection);
  }

  destroy(): void {
    window.removeEventListener('gamepadconnected', this.refreshConnection);
    window.removeEventListener('gamepaddisconnected', this.refreshConnection);
  }

  poll(): void {
    const pads = this.readPads();
    if (pads.length !== this.connectedCount) this.refreshConnection();
    for (const pad of pads) this.pollPad(pad);
  }

  private readPads(): Gamepad[] {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
    return Array.from(navigator.getGamepads()).filter((p): p is Gamepad => !!p && p.connected);
  }

  private readonly refreshConnection = (): void => {
    const pads = this.readPads();
    this.connectedCount = pads.length;
    for (const index of [...this.states.keys()]) {
      if (!pads.some((p) => p.index === index)) this.states.delete(index);
    }
    this.onConnectionChange(pads.length > 0, pads[0]?.id ?? null);
  };

  private pollPad(pad: Gamepad): void {
    let state = this.states.get(pad.index);
    if (!state) {
      // Ignore whatever is held (or drifting) at the moment of connection.
      const stick = stickDirection(pad.axes[0] ?? 0, pad.axes[1] ?? 0, null);
      state = { dir: stick, stickDir: stick, buttons: pad.buttons.map((b) => b.pressed) };
      this.states.set(pad.index, state);
      return;
    }
    const pressed = (i: number) => {
      const b = pad.buttons[i];
      return !!b && (b.pressed || b.value > 0.5);
    };

    let dpad: Direction | null = null;
    if (pressed(PAD_BUTTONS.dpadUp)) dpad = 'up';
    else if (pressed(PAD_BUTTONS.dpadDown)) dpad = 'down';
    else if (pressed(PAD_BUTTONS.dpadLeft)) dpad = 'left';
    else if (pressed(PAD_BUTTONS.dpadRight)) dpad = 'right';
    dpad ??= hatDirection(pad);

    state.stickDir = stickDirection(pad.axes[0] ?? 0, pad.axes[1] ?? 0, state.stickDir);
    const dir = dpad ?? state.stickDir;
    if (dir && dir !== state.dir) this.sink.direction(dir, 'gamepad');
    state.dir = dir;

    for (const [index, action] of BUTTON_ACTIONS) {
      const now = pressed(index);
      if (now && !state.buttons[index]) this.sink.action(action, 'gamepad');
      state.buttons[index] = now;
    }
  }
}
