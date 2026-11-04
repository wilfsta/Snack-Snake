import type { InputSink } from './types';

/**
 * Android's back gesture (a swipe in from the screen edge, easy to make by accident while swiping
 * to steer Sid), the back button and the browser's Back become the game's own "back": pause in a
 * game, the previous screen in menus. Without this they leave the game, or close it when it is
 * installed on the home screen.
 *
 * It works by keeping one extra history entry and catching its removal. Browsers ignore entries
 * added without a tap or key press, so the entry is only (re)added on one: a grown-up who presses
 * Back twice without touching the screen still leaves, so nobody is trapped.
 */
export class BackGuard {
  private armed = false;

  constructor(private readonly sink: InputSink) {
    window.addEventListener('popstate', this.onPopState);
    window.addEventListener('pointerdown', this.arm, { capture: true });
    window.addEventListener('keydown', this.arm, { capture: true });
  }

  private readonly arm = (): void => {
    if (this.armed) return;
    try {
      history.pushState({ snackSnakeBack: true }, '');
      this.armed = true;
    } catch {
      // History unavailable (e.g. sandboxed): Back simply behaves as normal.
    }
  };

  private readonly onPopState = (event: PopStateEvent): void => {
    // Forward again onto our own entry: it is back in place.
    if ((event.state as { snackSnakeBack?: boolean } | null)?.snackSnakeBack) {
      this.armed = true;
      return;
    }
    if (!this.armed) return;
    this.armed = false;
    this.sink.action('back', 'touch');
  };

  destroy(): void {
    window.removeEventListener('popstate', this.onPopState);
    window.removeEventListener('pointerdown', this.arm, { capture: true });
    window.removeEventListener('keydown', this.arm, { capture: true });
  }
}
