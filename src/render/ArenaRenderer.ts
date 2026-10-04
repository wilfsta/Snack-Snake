import { seededRng } from '../core/random';
import type { Arena } from '../game/Arena';
import { roundRectPath, type Layout } from './layout';
import { THEMES, type ArenaTheme, type ArenaThemeId } from './themes';

/** Draws the page backdrop and the checkerboard arena for a theme, caching the static parts. */
export class ArenaRenderer {
  private cache: HTMLCanvasElement | null = null;
  private cacheKey = '';

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, layout: Layout, arena: Arena, dpr: number, themeId: ArenaThemeId = 'sky'): void {
    const key = `${themeId}|${width}x${height}@${dpr}|${layout.cell},${layout.ox},${layout.oy},${arena.cols}x${arena.rows},${arena.walls}`;
    if (key !== this.cacheKey || !this.cache) {
      this.cache = this.renderStatic(width, height, layout, arena, dpr, THEMES[themeId]);
      this.cacheKey = key;
    }
    ctx.drawImage(this.cache, 0, 0, width, height);
  }

  private renderStatic(width: number, height: number, layout: Layout, arena: Arena, dpr: number, theme: ArenaTheme): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.scale(dpr, dpr);

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, theme.backgroundTop);
    bg.addColorStop(1, theme.backgroundBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    if (theme.hills) {
      this.drawHills(ctx, width, height, theme.hills);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let i = 0; i < 7; i++) {
        const x = ((i * 0.37 + 0.11) % 1) * width;
        const y = ((i * 0.61 + 0.23) % 1) * height;
        ctx.beginPath();
        ctx.arc(x, y, Math.min(width, height) * (0.08 + (i % 3) * 0.05), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const c = layout.cell;
    const w = arena.cols * c;
    const h = arena.rows * c;
    const r = c * 0.4;

    ctx.fillStyle = 'rgba(15, 20, 70, 0.3)';
    roundRectPath(ctx, layout.ox + c * 0.08, layout.oy + c * 0.2, w, h, r);
    ctx.fill();

    ctx.save();
    roundRectPath(ctx, layout.ox, layout.oy, w, h, r);
    ctx.clip();
    ctx.fillStyle = theme.boardLight;
    ctx.fillRect(layout.ox, layout.oy, w, h);
    ctx.fillStyle = theme.boardDark;
    for (let y = 0; y < arena.rows; y++) {
      for (let x = y % 2; x < arena.cols; x += 2) ctx.fillRect(layout.ox + x * c, layout.oy + y * c, c, c);
    }
    if (theme.decorations === 'flowers') this.drawFlowers(ctx, layout, arena);
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
      ctx.strokeStyle = theme.id === 'garden' ? '#7a4a24' : '#2b2d5c';
      ctx.lineWidth = Math.max(3, c * 0.22);
      ctx.stroke();
    }
    return canvas;
  }

  private drawHills(ctx: CanvasRenderingContext2D, width: number, height: number, colors: readonly string[]): void {
    // Sun.
    ctx.fillStyle = 'rgba(255, 236, 120, 0.9)';
    ctx.beginPath();
    ctx.arc(width * 0.88, height * 0.12, Math.min(width, height) * 0.08, 0, Math.PI * 2);
    ctx.fill();
    colors.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      const base = height * (0.72 + i * 0.1);
      ctx.moveTo(0, height);
      ctx.lineTo(0, base);
      for (let x = 0; x <= width; x += 20) {
        ctx.lineTo(x, base - Math.sin(x / (width * 0.18) + i * 1.7) * height * 0.06);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
    });
  }

  /** Little flowers at the corners of some cells: decoration only, deliberately small and soft. */
  private drawFlowers(ctx: CanvasRenderingContext2D, layout: Layout, arena: Arena): void {
    const rng = seededRng(arena.cols * 31 + arena.rows);
    const c = layout.cell;
    const petals = ['#ffb3c7', '#fff0a6', '#ffffff', '#d7c4ff'];
    const count = Math.round(arena.cols * arena.rows * 0.06);
    for (let i = 0; i < count; i++) {
      const x = layout.ox + Math.floor(rng.next() * arena.cols) * c + c * (0.2 + rng.next() * 0.6);
      const y = layout.oy + Math.floor(rng.next() * arena.rows) * c + c * (0.2 + rng.next() * 0.6);
      const r = c * 0.09;
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = petals[i % petals.length];
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffc93c';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
