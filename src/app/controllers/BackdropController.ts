import { directionAngle } from '../../core/geometry';
import { defaultRng } from '../../core/random';
import { chooseArenaSize } from '../../game/Arena';
import { DemoWorld } from '../../game/DemoWorld';
import { Effects } from '../../render/Effects';
import type { GameRenderer } from '../../render/GameRenderer';
import { SnakeAnimator } from '../../render/SnakeAnimator';
import { DEFAULT_SKIN } from '../../render/skins';
import { nearestTileOffset, tileCenter } from './worldGeometry';

/** The self-driving snake behind the menus, so the game feels alive from the first second. */
export class BackdropController {
  private demo: DemoWorld | null = null;
  private aspect = 0;
  private animator = new SnakeAnimator();
  private readonly effects = new Effects();

  constructor(private readonly renderer: GameRenderer) {}

  update(dtMs: number): void {
    const demo = this.demo;
    if (!demo) return;
    demo.update(dtMs);
    this.animator.update({
      dt: dtMs / 1000,
      moving: true,
      travelAngle: directionAngle(demo.snake.direction),
      nearestTile: nearestTileOffset(demo),
      hintOffset: null,
      hintStrength: 0,
      answering: false,
      paused: false,
      streak: 0,
    });
    this.effects.update(dtMs / 1000);
  }

  render(): void {
    this.ensureDemo();
    if (this.demo) this.renderer.render({ world: this.demo, animator: this.animator, effects: this.effects, skin: DEFAULT_SKIN });
  }

  /** Rebuilds the demo when the screen shape changes a lot (e.g. phone rotated). */
  private ensureDemo(): void {
    const aspect = this.renderer.aspect;
    if (this.demo && Math.abs(aspect - this.aspect) < 0.35) return;
    const { cols, rows } = chooseArenaSize(aspect, 200);
    this.aspect = aspect;
    this.animator = new SnakeAnimator();
    this.effects.clear();
    this.demo = new DemoWorld(cols, rows, defaultRng, (tile) => {
      this.animator.eat();
      this.effects.burst(tileCenter(tile), 12);
    });
  }
}
