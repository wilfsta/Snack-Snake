import type { Direction } from '../core/geometry';
import type { InputSink } from './types';

const SWIPE_THRESHOLD_PX = 26;

function directionFromVector(dx: number, dy: number): Direction {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/**
 * Two touch schemes feeding the same sink:
 *  - an on-screen D-pad: direction follows the finger relative to the pad centre, so a child
 *    can keep their thumb down and roll it around;
 *  - swipes anywhere on the game area (taps = confirm).
 * Pointer events with `touch-action: none` (in CSS) stop the page scrolling while playing.
 */
export class TouchInput {
  private padPointer: number | null = null;
  private padDir: Direction | null = null;
  private swipe: { id: number; x: number; y: number; moved: boolean; start: number } | null = null;

  constructor(
    private readonly sink: InputSink,
    private readonly pad: HTMLElement,
    surface: HTMLElement,
    private readonly onTouchUsed: () => void,
  ) {
    pad.addEventListener('pointerdown', this.onPadDown);
    pad.addEventListener('pointermove', this.onPadMove);
    pad.addEventListener('pointerup', this.onPadUp);
    pad.addEventListener('pointercancel', this.onPadUp);
    pad.addEventListener('contextmenu', (e) => e.preventDefault());
    surface.addEventListener('pointerdown', this.onSurfaceDown);
    surface.addEventListener('pointermove', this.onSurfaceMove);
    surface.addEventListener('pointerup', this.onSurfaceUp);
    surface.addEventListener('pointercancel', () => (this.swipe = null));
  }

  private readonly onPadDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.onTouchUsed();
    this.padPointer = e.pointerId;
    this.pad.setPointerCapture?.(e.pointerId);
    this.updatePad(e);
  };

  private readonly onPadMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.padPointer) return;
    e.preventDefault();
    this.updatePad(e);
  };

  private readonly onPadUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.padPointer) return;
    this.padPointer = null;
    this.padDir = null;
    this.highlight(null);
  };

  private updatePad(e: PointerEvent): void {
    const rect = this.pad.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    // Small dead zone in the middle of the pad.
    if (Math.hypot(dx, dy) < Math.min(rect.width, rect.height) * 0.12) return;
    const dir = directionFromVector(dx, dy);
    if (dir !== this.padDir) {
      this.padDir = dir;
      this.highlight(dir);
      this.sink.direction(dir, 'touch');
    }
  }

  private highlight(dir: Direction | null): void {
    for (const btn of this.pad.querySelectorAll<HTMLElement>('[data-dir]')) {
      btn.classList.toggle('pressed', btn.dataset.dir === dir);
    }
  }

  private readonly onSurfaceDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType !== 'mouse') this.onTouchUsed();
    this.swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, start: performance.now() };
  };

  private readonly onSurfaceMove = (e: PointerEvent): void => {
    const s = this.swipe;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.hypot(dx, dy) >= SWIPE_THRESHOLD_PX) {
      this.sink.direction(directionFromVector(dx, dy), 'touch');
      // Re-anchor so one continuous finger movement can chain turns.
      s.x = e.clientX;
      s.y = e.clientY;
      s.moved = true;
    }
  };

  private readonly onSurfaceUp = (e: PointerEvent): void => {
    const s = this.swipe;
    this.swipe = null;
    if (!s || s.id !== e.pointerId) return;
    if (!s.moved && performance.now() - s.start < 350) this.sink.action('confirm', 'touch');
  };
}
