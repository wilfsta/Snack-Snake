import type { Direction } from '../core/geometry';
import type { InputSink } from './types';

const KEY_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

function buttonHasFocus(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement;
}

export class KeyboardInput {
  constructor(
    private readonly sink: InputSink,
    private readonly target: Window = window,
  ) {
    target.addEventListener('keydown', this.onKeyDown);
  }

  destroy(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const direction = KEY_DIRECTIONS[e.code];
    if (direction) {
      e.preventDefault();
      this.sink.direction(direction, 'keyboard');
      return;
    }
    switch (e.code) {
      case 'Escape':
      case 'KeyP':
        e.preventDefault();
        if (!e.repeat) this.sink.action('pause', 'keyboard');
        break;
      case 'Space':
      case 'Enter':
      case 'NumpadEnter':
        // A focused button already handles Enter/Space natively - don't fire twice.
        if (buttonHasFocus()) return;
        e.preventDefault();
        if (!e.repeat) this.sink.action('confirm', 'keyboard');
        break;
      case 'Backspace':
        e.preventDefault();
        if (!e.repeat) this.sink.action('back', 'keyboard');
        break;
      default:
        break;
    }
  };
}
