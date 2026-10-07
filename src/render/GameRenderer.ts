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
  readonly banner?: { readonly text: string; readonly age: number; /** 0..1 shows a gentle progress bar (e.g. thinking time). */ readonly progress?: number } | null;
  readonly theme?: ArenaThemeId;
  /** Plants the child has grown; drawn softly on the board in worlds that grow. */
  readonly gardenPlants?: readonly string[];
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
    this.arenaRenderer.draw(ctx, this.width, this.height, layout, world.arena, this.dpr, scene.theme, scene.gardenPlants ?? []);

    const time = world.time;
    for (const tile of world.tiles) drawHint(ctx, layout, tile, time);
    // Revealed (✓ / ✗) tiles are slightly enlarged; the snake's face still stays on top.
    for (const tile of world.tiles) drawTile(ctx, layout, tile, time, tile.mark === 'none' ? {} : { scale: 1.08 });

    this.snakeRenderer.draw(ctx, layout, world.arena, world.snake, world.moveProgress, animator, skin);
    effects.draw(ctx, layout);
    this.snakeRenderer.drawOverlays(ctx, layout, animator);
    if (scene.banner) this.drawBanner(layout, scene.banner.text, scene.banner.age, scene.banner.progress);
  }

  private drawBanner(layout: Layout, text: string, age: number, progress?: number): void {
    const { ctx } = this;
    const c = layout.cell;
    const scale = easeOutBack(clamp(age / 0.35, 0, 1));
    // Thinking banners (with a progress bar) are a little smaller and see-through so Sid stays visible.
    const thinking = progress !== undefined;
    let size = Math.max(thinking ? 24 : 28, c * (thinking ? 1.6 : 2.2)) * scale;
    if (size <= 1) return;
    const x = layout.ox + (layout.cols * c) / 2;
    const y = layout.oy + (layout.rows * c) * (thinking ? 0.22 : 0.3);
    ctx.save();
    if (thinking) ctx.globalAlpha = 0.88;
    ctx.font = `700 ${size}px ${FONT_STACK}`;
    // Long questions shrink to fit the board.
    const maxW = layout.cols * c * 0.9;
    const w = ctx.measureText(text).width;
    if (w > maxW) {
      size *= maxW / w;
      ctx.font = `700 ${size}px ${FONT_STACK}`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = '#2b2d5c';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = '#ffd54a';
    ctx.fillText(text, x, y);
    if (progress !== undefined) {
      // A soft bar filling up: answers are on their way. Not a countdown, nothing runs out.
      const bw = Math.min(layout.cols * c * 0.5, size * 4);
      const bh = Math.max(6, c * 0.22);
      const bx = x - bw / 2;
      const by = y + size * 0.75;
      ctx.fillStyle = 'rgba(43, 45, 92, 0.35)';
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, bh / 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(bx, by, Math.max(bh, bw * clamp(progress, 0, 1)), bh, bh / 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
