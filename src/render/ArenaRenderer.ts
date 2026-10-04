import type { Arena } from '../game/Arena';
import { roundRectPath, type Layout } from './layout';

/** Draws the page backdrop and the checkerboard arena, caching the static parts. */
export class ArenaRenderer {
  private cache: HTMLCanvasElement | null = null;
  private cacheKey = '';

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, layout: Layout, arena: Arena, dpr: number): void {
    const key = `${width}x${height}@${dpr}|${layout.cell},${layout.ox},${layout.oy},${arena.cols}x${arena.rows},${arena.walls}`;
    if (key !== this.cacheKey || !this.cache) {
      this.cache = this.renderStatic(width, height, layout, arena, dpr);
      this.cacheKey = key;
    }
    ctx.drawImage(this.cache, 0, 0, width, height);
  }

  private renderStatic(width: number, height: number, layout: Layout, arena: Arena, dpr: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.scale(dpr, dpr);

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#3a8dde');
    bg.addColorStop(1, '#5b4bd6');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Soft decorative blobs.
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 7; i++) {
      const x = ((i * 0.37 + 0.11) % 1) * width;
      const y = ((i * 0.61 + 0.23) % 1) * height;
      ctx.beginPath();
      ctx.arc(x, y, Math.min(width, height) * (0.08 + (i % 3) * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }

    const c = layout.cell;
    const w = arena.cols * c;
    const h = arena.rows * c;
    const r = c * 0.4;

    ctx.fillStyle = 'rgba(15, 20, 70, 0.35)';
    roundRectPath(ctx, layout.ox + c * 0.08, layout.oy + c * 0.2, w, h, r);
    ctx.fill();

    ctx.save();
    roundRectPath(ctx, layout.ox, layout.oy, w, h, r);
    ctx.clip();
    ctx.fillStyle = '#d4f0ff';
    ctx.fillRect(layout.ox, layout.oy, w, h);
    ctx.fillStyle = '#c2e8fd';
    for (let y = 0; y < arena.rows; y++) {
      for (let x = (y % 2); x < arena.cols; x += 2) {
        ctx.fillRect(layout.ox + x * c, layout.oy + y * c, c, c);
      }
    }
    ctx.restore();

    roundRectPath(ctx, layout.ox, layout.oy, w, h, r);
    if (arena.walls === 'wrap') {
      // Dashed "portal" edge: the snake can pass through.
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = Math.max(2, c * 0.12);
      ctx.setLineDash([c * 0.45, c * 0.3]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = '#2b2d5c';
      ctx.lineWidth = Math.max(3, c * 0.22);
      ctx.stroke();
    }
    return canvas;
  }
}
