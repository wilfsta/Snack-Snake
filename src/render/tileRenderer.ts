import { clamp, easeOutBack } from '../core/geometry';
import type { Tile, TileKind, TileMark } from '../game/tiles';
import { drawStar, FONT_STACK, roundRectPath, type Layout } from './layout';

/** Minimal tile description so effects can draw "ghost" copies of eaten tiles. */
export interface TileLike {
  readonly id: number;
  readonly kind: TileKind;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly label: string;
  readonly bornAt: number;
  readonly mark: TileMark;
}

interface TileStyle {
  readonly fill: string;
  readonly rim: string;
  readonly text: string;
  readonly gloss: string;
}

const STYLES: Readonly<Record<Exclude<TileKind, 'food'>, TileStyle>> = {
  question: { fill: '#7b5cff', rim: '#3d2a9e', text: '#ffffff', gloss: 'rgba(255,255,255,0.25)' },
  answer: { fill: '#ffffff', rim: '#2f7de1', text: '#1d2248', gloss: 'rgba(47,125,225,0.08)' },
  fact: { fill: '#ffd54a', rim: '#b9760f', text: '#3a2400', gloss: 'rgba(255,255,255,0.35)' },
};

const MARK_RIM: Readonly<Record<TileMark, string | null>> = { none: null, correct: '#1e9e4a', wrong: '#d6334a' };

export interface TileDrawOptions {
  readonly alpha?: number;
  /** Overrides the pop-in scale. */
  readonly scale?: number;
  readonly dx?: number;
  readonly dy?: number;
  readonly rotation?: number;
  readonly bob?: boolean;
}

export function drawTile(ctx: CanvasRenderingContext2D, layout: Layout, tile: TileLike, timeMs: number, opts: TileDrawOptions = {}): void {
  const age = timeMs - tile.bornAt;
  if (age < 0 && opts.scale === undefined) return;
  const c = layout.cell;
  const scale = opts.scale ?? easeOutBack(clamp(age / 320, 0, 1));
  if (scale <= 0.01) return;
  const bob = opts.bob === false ? 0 : Math.sin(timeMs / 520 + tile.id * 1.7) * c * 0.04;
  const cx = layout.ox + (tile.x + tile.w / 2) * c + (opts.dx ?? 0) * c;
  const cy = layout.oy + (tile.y + tile.h / 2) * c + (opts.dy ?? 0) * c + bob;
  if (tile.kind === 'food') {
    drawApple(ctx, cx, cy, c * 0.42 * scale, opts.alpha ?? 1);
    return;
  }
  const w = tile.w * c - c * 0.22;
  const h = tile.h * c - c * 0.22;
  const style = STYLES[tile.kind];
  const rim = MARK_RIM[tile.mark] ?? style.rim;
  const radius = c * 0.38;

  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.translate(cx, cy);
  if (opts.rotation) ctx.rotate(opts.rotation);
  if (tile.mark === 'wrong') ctx.rotate(Math.sin(timeMs / 70) * 0.04);
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(20, 30, 60, 0.22)';
  roundRectPath(ctx, -w / 2, -h / 2 + c * 0.12, w, h, radius);
  ctx.fill();

  ctx.fillStyle = style.fill;
  roundRectPath(ctx, -w / 2, -h / 2, w, h, radius);
  ctx.fill();
  ctx.lineWidth = Math.max(2, c * (tile.mark === 'none' ? 0.1 : 0.16));
  ctx.strokeStyle = rim;
  ctx.stroke();

  ctx.fillStyle = style.gloss;
  roundRectPath(ctx, -w / 2 + c * 0.12, -h / 2 + c * 0.1, w - c * 0.24, h * 0.38, radius * 0.7);
  ctx.fill();

  // Label (one or two lines), shrunk to fit.
  const lines = tile.label.split('\n');
  let size = Math.min(h * (lines.length > 1 ? 0.4 : 0.56), c * 1.05);
  ctx.font = `700 ${size}px ${FONT_STACK}`;
  const maxW = w * 0.84;
  const measured = Math.max(...lines.map((l) => ctx.measureText(l).width));
  if (measured > maxW) {
    size *= maxW / measured;
    ctx.font = `700 ${size}px ${FONT_STACK}`;
  }
  ctx.fillStyle = style.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => ctx.fillText(line, 0, size * 0.06 + (i - (lines.length - 1) / 2) * size * 1.12));

  // Badges: a "?" on questions, a star on facts, ✓ / ✗ when revealing (shape, not just colour).
  const badgeR = c * 0.32;
  const bx = w / 2 - badgeR * 0.4;
  const by = -h / 2 + badgeR * 0.4;
  if (tile.mark === 'correct' || tile.mark === 'wrong') {
    drawMarkBadge(ctx, bx, by, badgeR * 1.25, tile.mark);
  } else if (tile.kind === 'question') {
    ctx.fillStyle = '#ffd54a';
    ctx.strokeStyle = '#3d2a9e';
    ctx.lineWidth = Math.max(1.5, c * 0.06);
    ctx.beginPath();
    ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3d2a9e';
    ctx.font = `700 ${badgeR * 1.4}px ${FONT_STACK}`;
    ctx.fillText('?', bx, by + badgeR * 0.08);
  } else if (tile.kind === 'fact') {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#b9760f';
    ctx.lineWidth = Math.max(1.5, c * 0.06);
    drawStar(ctx, bx, by, badgeR * 1.1, badgeR * 0.5, timeMs / 900);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Classic-mode snack: a shiny cartoon apple. */
function drawApple(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(20, 30, 60, 0.2)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.15, y + r * 0.35, r * 0.95, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff4b4b';
  ctx.strokeStyle = '#9b1c26';
  ctx.lineWidth = Math.max(1.5, r * 0.14);
  ctx.beginPath();
  ctx.arc(x - r * 0.38, y + r * 0.05, r * 0.62, 0, Math.PI * 2);
  ctx.arc(x + r * 0.38, y + r * 0.05, r * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - r * 0.38, y + r * 0.05, r * 0.62, Math.PI * 0.55, Math.PI * 1.75);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + r * 0.38, y + r * 0.05, r * 0.62, Math.PI * 1.25, Math.PI * 0.45);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.45, y - r * 0.15, r * 0.16, r * 0.24, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6b3a12';
  ctx.lineWidth = Math.max(1.5, r * 0.13);
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.45);
  ctx.quadraticCurveTo(x + r * 0.05, y - r * 0.8, x + r * 0.2, y - r * 0.95);
  ctx.stroke();
  ctx.fillStyle = '#4fcf4a';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.42, y - r * 0.78, r * 0.3, r * 0.14, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMarkBadge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, mark: 'correct' | 'wrong'): void {
  ctx.fillStyle = mark === 'correct' ? '#1e9e4a' : '#d6334a';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, r * 0.18);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = Math.max(2.5, r * 0.28);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (mark === 'correct') {
    ctx.moveTo(x - r * 0.45, y + r * 0.02);
    ctx.lineTo(x - r * 0.1, y + r * 0.38);
    ctx.lineTo(x + r * 0.48, y - r * 0.35);
  } else {
    ctx.moveTo(x - r * 0.38, y - r * 0.38);
    ctx.lineTo(x + r * 0.38, y + r * 0.38);
    ctx.moveTo(x + r * 0.38, y - r * 0.38);
    ctx.lineTo(x - r * 0.38, y + r * 0.38);
  }
  ctx.stroke();
}

/**
 * The guided-practice hint: a soft golden halo whose strength fades as the learner improves.
 * At full strength a bouncing arrow points at the answer too.
 */
export function drawHint(ctx: CanvasRenderingContext2D, layout: Layout, tile: Tile, timeMs: number): void {
  if (tile.hint <= 0 || timeMs < tile.bornAt) return;
  const c = layout.cell;
  const h = clamp(tile.hint, 0, 1);
  const cx = layout.ox + (tile.x + tile.w / 2) * c;
  const cy = layout.oy + (tile.y + tile.h / 2) * c;
  // Weak hints only shimmer now and then; strong hints glow steadily.
  const cycle = (Math.sin(timeMs / (420 - 160 * h)) + 1) / 2;
  const shimmer = h < 0.5 ? Math.max(0, Math.sin(timeMs / 900)) ** 3 : 1;
  const alpha = (0.2 + 0.55 * h) * (0.55 + 0.45 * cycle) * shimmer;
  if (alpha < 0.02) return;

  ctx.save();
  const radius = Math.max(tile.w, tile.h) * c * (0.75 + 0.12 * cycle);
  const glow = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius);
  glow.addColorStop(0, `rgba(255, 220, 80, ${alpha})`);
  glow.addColorStop(1, 'rgba(255, 220, 80, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Orbiting sparkles.
  const sparkles = h >= 0.6 ? 3 : 1;
  for (let i = 0; i < sparkles; i++) {
    const a = timeMs / 600 + (i * Math.PI * 2) / sparkles;
    const sx = cx + Math.cos(a) * tile.w * c * 0.62;
    const sy = cy + Math.sin(a) * tile.h * c * 0.62;
    ctx.globalAlpha = Math.min(1, alpha * 1.6);
    ctx.fillStyle = '#fff6c2';
    drawStar(ctx, sx, sy, c * 0.16, c * 0.06, a);
    ctx.fill();
  }

  if (h >= 0.95) {
    const bounce = Math.abs(Math.sin(timeMs / 220)) * c * 0.35;
    const ax = cx;
    const ay = layout.oy + tile.y * c - c * 0.35 - bounce;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffcf33';
    ctx.strokeStyle = '#8a4b00';
    ctx.lineWidth = Math.max(2, c * 0.07);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - c * 0.4, ay - c * 0.45);
    ctx.lineTo(ax - c * 0.16, ay - c * 0.45);
    ctx.lineTo(ax - c * 0.16, ay - c * 0.9);
    ctx.lineTo(ax + c * 0.16, ay - c * 0.9);
    ctx.lineTo(ax + c * 0.16, ay - c * 0.45);
    ctx.lineTo(ax + c * 0.4, ay - c * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
