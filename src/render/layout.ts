/** Maps logical grid coordinates to canvas pixels (CSS pixels; DPR is applied by the context transform). */
export interface Layout {
  readonly cell: number;
  readonly ox: number;
  readonly oy: number;
  readonly cols: number;
  readonly rows: number;
}

export function computeLayout(width: number, height: number, cols: number, rows: number, padding: number): Layout {
  const cell = Math.max(4, Math.floor(Math.min((width - padding * 2) / cols, (height - padding * 2) / rows)));
  const ox = Math.round((width - cell * cols) / 2);
  const oy = Math.round((height - cell * rows) / 2);
  return { cell, ox, oy, cols, rows };
}

export function toPx(layout: Layout, gx: number, gy: number): { x: number; y: number } {
  return { x: layout.ox + gx * layout.cell, y: layout.oy + gy * layout.cell };
}

export const FONT_STACK = "'Fredoka', 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif";

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number, rotation = 0): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation - Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}
