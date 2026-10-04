import { clamp, easeOutBack } from '../core/geometry';
import type { SnakeWorld } from '../game/SnakeSession';
import { ArenaRenderer } from './ArenaRenderer';
import type { Effects } from './Effects';
import { computeLayout, FONT_STACK, type Layout } from './layout';
import type { SnakeAnimator } from './SnakeAnimator';
import { SnakeRenderer } from './SnakeRenderer';
import type { ArenaThemeId } from './themes';
import type { SnakeSkin } from './skins';
import { drawHint, drawTile } from './tileRenderer';

export interface SceneOptions {
  readonly world: SnakeWorld;
  readonly animator: SnakeAnimator;
  readonly effects: Effects;
  readonly skin: SnakeSkin;
  /** Large centred caption, e.g. "Ready?" / "Go!". */
  readonly banner?: { readonly text: string; readonly age: number } | null;
  readonly theme?: ArenaThemeId;
}

/** Owns the canvas: sizing for any screen and device pixel ratio, and drawing a frame. */
export class GameRenderer {
  readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private readonly arenaRenderer = new ArenaRenderer();
  private readonly snakeRenderer = new SnakeRenderer();

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported on this device');
    this.ctx = ctx;
    this.resize();
  }

  /** Width / height of the drawable area. */
  get aspect(): number {
    return this.height > 0 ? this.width / this.height : 1.5;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === this.width && h === this.height && dpr === this.dpr) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  layoutFor(cols: number, rows: number): Layout {
    const padding = Math.max(6, Math.min(this.width, this.height) * 0.02);
    return computeLayout(this.width, this.height, cols, rows, padding);
  }

  render(scene: SceneOptions): void {
    this.resize();
    const { ctx } = this;
    const { world, animator, effects, skin } = scene;
    const layout = this.layoutFor(world.arena.cols, world.arena.rows);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    this.arenaRenderer.draw(ctx, this.width, this.height, layout, world.arena, this.dpr, scene.theme);

    const time = world.time;
    for (const tile of world.tiles) drawHint(ctx, layout, tile, time);
    // Revealed (✓ / ✗) tiles are slightly enlarged; the snake's face still stays on top.
    for (const tile of world.tiles) drawTile(ctx, layout, tile, time, tile.mark === 'none' ? {} : { scale: 1.08 });

    this.snakeRenderer.draw(ctx, layout, world.arena, world.snake, world.moveProgress, animator, skin);
    effects.draw(ctx, layout);
    this.snakeRenderer.drawOverlays(ctx, layout, animator);
    if (scene.banner) this.drawBanner(layout, scene.banner.text, scene.banner.age);
  }

  private drawBanner(layout: Layout, text: string, age: number): void {
    const { ctx } = this;
    const c = layout.cell;
    const scale = easeOutBack(clamp(age / 0.35, 0, 1));
    const size = Math.max(28, c * 2.2) * scale;
    if (size <= 1) return;
    const x = layout.ox + (layout.cols * c) / 2;
    const y = layout.oy + (layout.rows * c) * 0.3;
    ctx.save();
    ctx.font = `700 ${size}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = '#2b2d5c';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = '#ffd54a';
    ctx.fillText(text, x, y);
    ctx.restore();
  }
}
