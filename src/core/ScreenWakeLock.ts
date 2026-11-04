/**
 * Keeps the screen on while a game is being played, so a phone doesn't dim and lock while a
 * child is thinking. Only ever held while wanted: paused games and menus let the phone sleep.
 * Browsers drop the lock when the page is hidden; it is taken again on return if still wanted.
 */
export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private requesting = false;
  private wanted = false;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (this.wanted && document.visibilityState === 'visible') void this.acquire();
    });
  }

  set(on: boolean): void {
    this.wanted = on;
    if (on) void this.acquire();
    else this.release();
  }

  private async acquire(): Promise<void> {
    if (this.sentinel || this.requesting || !('wakeLock' in navigator)) return;
    this.requesting = true;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      // No longer wanted by the time it arrived (the game ended meanwhile).
      if (!this.wanted) {
        void sentinel.release().catch(() => undefined);
        return;
      }
      this.sentinel = sentinel;
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null;
      });
    } catch {
      // Not allowed (battery saver, no tap yet...): the phone just follows its own settings.
    } finally {
      this.requesting = false;
    }
  }

  private release(): void {
    const sentinel = this.sentinel;
    this.sentinel = null;
    void sentinel?.release().catch(() => undefined);
  }
}
