import { clamp, lerp, smoothstep, type Vec2 } from '../core/geometry';
import type { Arena } from '../game/Arena';
import type { SnakeView } from '../game/Snake';
import { drawStar, FONT_STACK, roundRectPath, type Layout } from './layout';
import type { SnakeAnimator } from './SnakeAnimator';
import type { SnakeSkin } from './skins';
import { buildSnakePath, samplePath, smoothPath } from './snakeGeometry';

interface BodyPoint {
  x: number;
  y: number;
  /** Radius in cells. */
  r: number;
}

const SAMPLE_SPACING = 0.2;

/**
 * Draws a snake character from its grid state plus its animator. Every colour and size comes
 * from the skin, so new characters need no changes here.
 */
export class SnakeRenderer {
  draw(
    ctx: CanvasRenderingContext2D,
    layout: Layout,
    arena: Arena,
    snake: SnakeView,
    progress: number,
    anim: SnakeAnimator,
    skin: SnakeSkin,
  ): void {
    const samples = samplePath(smoothPath(buildSnakePath(snake, arena, progress)), SAMPLE_SPACING);
    if (samples.length === 0) return;
    const time = anim.time;
    const total = samples[samples.length - 1].dist;
    const lengthFactor = clamp(snake.body.length / 28, 0, 1);
    // Longer snakes get a more exaggerated (funnier) slither - but never more than ~0.15 cells.
    const amplitude = (0.05 + 0.09 * lengthFactor) * anim.wiggle;

    const points: BodyPoint[] = samples.map((s) => {
      const u = total > 0 ? s.dist / total : 0;
      const envelope = smoothstep(0.35, 1.5, s.dist);
      const offset = amplitude * envelope * Math.sin(time * 7.5 - s.dist * 1.7);
      const nx = -Math.sin(s.angle);
      const ny = Math.cos(s.angle);
      let r = lerp(0.36, 0.2, Math.pow(u, 1.3)) * skin.bodyScale;
      r *= 0.55 + 0.45 * smoothstep(0, 0.9, total - s.dist);
      for (const b of anim.bulges) r += b.size * Math.exp(-((s.dist - b.dist) ** 2) / 0.3);
      r *= 1 + 0.3 * anim.tailGrow * smoothstep(total - 1.4, total, s.dist);
      return { x: s.x + nx * offset, y: s.y + ny * offset, r };
    });

    const death = anim.deathProgress;
    if (death !== null) this.deformForDeath(points, death, time);

    const head = points[0];
    const offsets = arena.walls === 'wrap' ? wrapOffsets(points, arena) : [{ x: 0, y: 0 }];

    ctx.save();
    roundRectPath(ctx, layout.ox, layout.oy, layout.cols * layout.cell, layout.rows * layout.cell, layout.cell * 0.4);
    ctx.clip();
    for (const o of offsets) {
      this.drawBody(ctx, layout, points, o, skin);
      const hx = layout.ox + (head.x + o.x) * layout.cell;
      const hy = layout.oy + (head.y + o.y) * layout.cell;
      this.drawHead(ctx, hx, hy, layout.cell, anim, skin);
    }
    ctx.restore();

    this.overlayAnchor = {
      x: layout.ox + wrapCoord(head.x, arena.cols, arena.walls === 'wrap') * layout.cell,
      y: layout.oy + wrapCoord(head.y, arena.rows, arena.walls === 'wrap') * layout.cell,
    };
  }

  private overlayAnchor: Vec2 | null = null;

  /** Speech bubbles and dizzy stars; drawn last so tiles and effects never cover them. */
  drawOverlays(ctx: CanvasRenderingContext2D, layout: Layout, anim: SnakeAnimator): void {
    if (this.overlayAnchor) this.drawHeadOverlays(ctx, layout, this.overlayAnchor.x, this.overlayAnchor.y, anim);
  }

  private deformForDeath(points: BodyPoint[], progress: number, time: number): void {
    const head = points[0];
    const wobble = 1 - smoothstep(0.2, 0.45, progress);
    const collapse = smoothstep(0.35, 0.85, progress);
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      // Body wobbles in shock...
      p.x += Math.sin(time * 22 + i * 0.7) * 0.06 * wobble;
      p.y += Math.cos(time * 19 + i * 0.5) * 0.06 * wobble;
      if (i === 0) continue;
      // ...then flops into a silly coiled pile behind the head (tail first).
      const theta = i * 0.62;
      const rho = Math.min(0.25 + i * 0.022, 1.25);
      const tx = head.x - 0.15 + Math.cos(theta) * rho;
      const ty = head.y + 0.35 + Math.sin(theta) * rho * 0.75;
      const local = clamp(collapse * 1.4 - (1 - i / n) * 0.4, 0, 1);
      p.x = lerp(p.x, tx, local);
      p.y = lerp(p.y, ty, local);
    }
  }

  private drawBody(ctx: CanvasRenderingContext2D, layout: Layout, pts: readonly BodyPoint[], o: Vec2, skin: SnakeSkin): void {
    const c = layout.cell;
    const px = (p: BodyPoint) => layout.ox + (p.x + o.x) * c;
    const py = (p: BodyPoint) => layout.oy + (p.y + o.y) * c;

    const circles = (radius: (p: BodyPoint) => number, dx = 0, dy = 0, every = 1, phase = 0): void => {
      ctx.beginPath();
      for (let i = pts.length - 1; i >= 1; i--) {
        if (every > 1 && (i + phase) % every !== 0) continue;
        const p = pts[i];
        const r = radius(p);
        if (r <= 0) continue;
        const x = px(p) + dx;
        const y = py(p) + dy;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
    };

    ctx.fillStyle = 'rgba(20, 30, 60, 0.18)';
    circles((p) => p.r * c, c * 0.07, c * 0.12);
    ctx.fill();

    ctx.fillStyle = skin.outline;
    circles((p) => p.r * c + Math.max(1.5, c * 0.06));
    ctx.fill();

    ctx.fillStyle = skin.body;
    circles((p) => p.r * c);
    ctx.fill();

    const pattern = skin.pattern;
    if (pattern.kind === 'rainbow') {
      // Each slice of body gets the next colour of the rainbow.
      for (let i = pts.length - 1; i >= 1; i--) {
        const p = pts[i];
        ctx.fillStyle = `hsl(${(i * 9) % 360}, 90%, 62%)`;
        ctx.beginPath();
        ctx.arc(px(p), py(p), p.r * c, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (pattern.kind !== 'none') {
      ctx.fillStyle = pattern.color;
      if (pattern.kind === 'spots') circles((p) => p.r * c * 0.42, 0, 0, pattern.every, 2);
      else circles((p) => p.r * c * 0.92, 0, 0, pattern.every, 0);
      ctx.fill();
    }

    ctx.fillStyle = skin.highlight;
    ctx.globalAlpha = 0.55;
    circles((p) => p.r * c * 0.38, -c * 0.07, -c * 0.09);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawHead(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, anim: SnakeAnimator, skin: SnakeSkin): void {
    const f = anim.face;
    const R = cell * 0.5 * skin.headScale;
    const angle = anim.headAngle + anim.headTilt;
    const outline = Math.max(1.5, cell * 0.06);
    const hw = R * 1.02;
    const hh = R * 0.9;

    // Shadow in screen space.
    ctx.fillStyle = 'rgba(20, 30, 60, 0.18)';
    ctx.beginPath();
    ctx.ellipse(x + cell * 0.07, y + cell * 0.12, hw, hh, angle, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(1 + anim.stretch, 1 - anim.stretch * 0.5);

    // Puffed cheeks poke out past the head outline.
    if (f.cheek > 0.5) {
      const puff = (f.cheek - 0.5) * 2;
      for (const side of [-1, 1]) {
        ctx.fillStyle = skin.outline;
        ctx.beginPath();
        ctx.arc(R * 0.12, side * hh * 0.82, R * 0.3 * puff + outline, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = skin.body;
        ctx.beginPath();
        ctx.arc(R * 0.12, side * hh * 0.82, R * 0.3 * puff, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = skin.outline;
    ctx.beginPath();
    ctx.ellipse(0, 0, hw + outline, hh + outline, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin.body;
    ctx.beginPath();
    ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin.highlight;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.ellipse(-R * 0.2, -hh * 0.35, R * 0.45, hh * 0.28, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Rosy cheeks.
    ctx.fillStyle = skin.cheek;
    ctx.globalAlpha = 0.35 + 0.45 * clamp(f.cheek, 0, 1);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(R * 0.28, side * hh * 0.62, R * 0.16, R * 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    this.drawMouth(ctx, R, hw, hh, f, skin, outline);

    // Nostrils.
    ctx.fillStyle = skin.outline;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(hw * 0.86, side * R * 0.13, Math.max(1, R * 0.045), 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawEyes(ctx, R, hh, angle, f, skin, outline, anim.time);

    for (const accessory of skin.accessories) {
      if (!accessory.draw) continue;
      ctx.save();
      accessory.draw(ctx, { radius: R, face: f, time: anim.time });
      ctx.restore();
    }
    ctx.restore();

    // Hats stay upright on top of the head whichever way Sid is facing.
    for (const accessory of skin.accessories) {
      if (!accessory.drawUpright) continue;
      ctx.save();
      accessory.drawUpright(ctx, { x, y, radius: R, face: f, time: anim.time });
      ctx.restore();
    }
  }

  /** Speech bubble and stars for a portrait drawn outside the arena (e.g. the wardrobe preview). */
  drawStandaloneOverlays(ctx: CanvasRenderingContext2D, hx: number, hy: number, cell: number, width: number, anim: SnakeAnimator): void {
    this.drawHeadOverlays(ctx, { cell, ox: 0, oy: 0, cols: width / cell, rows: 100 }, hx, hy, anim);
  }

  /** A posed Sid facing right, for menus such as the wardrobe preview. `cell` sets the size. */
  drawPortrait(ctx: CanvasRenderingContext2D, cx: number, cy: number, cell: number, anim: SnakeAnimator, skin: SnakeSkin): void {
    const n = 26;
    const pts: BodyPoint[] = [];
    for (let i = 0; i < n; i++) {
      const d = i * 0.2;
      const wave = Math.sin(d * 1.4 - anim.time * 2.5) * 0.45 * Math.min(1, d / 2);
      pts.push({ x: -d, y: wave, r: lerp(0.36, 0.18, i / n) * skin.bodyScale });
    }
    const layout: Layout = { cell, ox: cx, oy: cy, cols: 0, rows: 0 };
    this.drawBody(ctx, layout, pts, { x: 0, y: 0 }, skin);
    this.drawHead(ctx, cx, cy, cell, anim, skin);
  }

  private drawMouth(
    ctx: CanvasRenderingContext2D,
    R: number,
    hw: number,
    hh: number,
    f: SnakeAnimator['face'],
    skin: SnakeSkin,
    outline: number,
  ): void {
    // Tongue flick (behind the mouth line).
    if (f.tongue > 0.02 && f.mouthOpen < 0.3) {
      const len = R * 0.8 * f.tongue;
      ctx.strokeStyle = skin.tongue;
      ctx.lineWidth = Math.max(1.5, R * 0.09);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hw * 0.9, 0);
      ctx.lineTo(hw + len, 0);
      ctx.lineTo(hw + len + R * 0.18, -R * 0.13);
      ctx.moveTo(hw + len, 0);
      ctx.lineTo(hw + len + R * 0.18, R * 0.13);
      ctx.stroke();
    }

    if (f.mouthOpen > 0.06) {
      const open = f.mouthOpen;
      ctx.fillStyle = skin.outline;
      ctx.beginPath();
      ctx.ellipse(hw * 0.78, 0, R * (0.14 + 0.16 * open) + outline, R * (0.12 + 0.42 * open) + outline, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = skin.mouth;
      ctx.beginPath();
      ctx.ellipse(hw * 0.78, 0, R * (0.14 + 0.16 * open), R * (0.12 + 0.42 * open), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = skin.tongue;
      ctx.beginPath();
      ctx.ellipse(hw * 0.74, R * 0.05, R * 0.1 * open, R * 0.22 * open, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = skin.outline;
      ctx.lineWidth = Math.max(1.5, R * 0.09);
      ctx.lineCap = 'round';
      ctx.beginPath();
      switch (f.mouth) {
        case 'smile':
          ctx.arc(hw * 0.25, 0, hw * 0.6, -0.75, 0.75);
          break;
        case 'grin':
          ctx.arc(hw * 0.15, 0, hw * 0.72, -0.85, 0.85);
          break;
        case 'flat':
          ctx.moveTo(hw * 0.8, -R * 0.3);
          ctx.lineTo(hw * 0.8, R * 0.3);
          break;
        case 'wavy':
          for (let i = 0; i <= 6; i++) {
            const yy = -R * 0.36 + (i * R * 0.72) / 6;
            const xx = hw * 0.8 + (i % 2 === 0 ? -R * 0.05 : R * 0.05);
            if (i === 0) ctx.moveTo(xx, yy);
            else ctx.lineTo(xx, yy);
          }
          break;
        case 'o':
          ctx.ellipse(hw * 0.8, 0, R * 0.1, R * 0.14, 0, 0, Math.PI * 2);
          break;
      }
      ctx.stroke();
      if (f.mouth === 'grin') {
        ctx.fillStyle = skin.mouth;
        ctx.beginPath();
        ctx.arc(hw * 0.15, 0, hw * 0.72, -0.6, 0.6);
        ctx.closePath();
        ctx.globalAlpha = 0.25;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Silly tongue hanging out of the side of the mouth.
    if (f.tongueHang > 0.05) {
      const t = f.tongueHang;
      ctx.strokeStyle = skin.outline;
      ctx.lineWidth = R * 0.24 + outline;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hw * 0.8, hh * 0.3);
      ctx.quadraticCurveTo(hw * 1.05, hh * 0.55, hw * 0.98, hh * (0.3 + 0.55 * t));
      ctx.stroke();
      ctx.strokeStyle = skin.tongue;
      ctx.lineWidth = R * 0.24;
      ctx.stroke();
    }
  }

  private drawEyes(
    ctx: CanvasRenderingContext2D,
    R: number,
    hh: number,
    angle: number,
    f: SnakeAnimator['face'],
    skin: SnakeSkin,
    outline: number,
    time: number,
  ): void {
    // Rotate the world-space look vector into head space.
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const lx = f.lookX * cos - f.lookY * sin;
    const ly = f.lookX * sin + f.lookY * cos;

    for (const side of [-1, 1]) {
      const ex = -R * 0.05;
      const ey = side * hh * 0.5;
      const er = R * 0.36 * f.eyeScale * (1 + side * f.eyeAsym * 0.5);

      // Eyebrows sit on the outer edge of each eye.
      if (Math.abs(f.brow) > 0.1) {
        ctx.strokeStyle = skin.outline;
        ctx.lineWidth = Math.max(1.5, R * 0.08);
        ctx.lineCap = 'round';
        const by = ey + side * er * 1.3;
        const tilt = side * f.brow * er * 0.35;
        ctx.beginPath();
        ctx.moveTo(ex - er * 0.65, by - tilt);
        ctx.lineTo(ex + er * 0.65, by + tilt);
        ctx.stroke();
      }

      if (f.happyEyes > 0.5) {
        ctx.strokeStyle = skin.outline;
        ctx.lineWidth = Math.max(2, R * 0.1);
        ctx.lineCap = 'round';
        // A curved "^" opening toward the back of the head.
        ctx.beginPath();
        ctx.arc(ex - er * 0.35, ey, er * 0.6, -1.1, 1.1);
        ctx.stroke();
        continue;
      }

      ctx.fillStyle = skin.outline;
      ctx.beginPath();
      ctx.arc(ex, ey, er + outline, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = skin.eyeWhite;
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, Math.PI * 2);
      ctx.fill();

      if (f.spiralEyes > 0.5) {
        ctx.strokeStyle = skin.pupil;
        ctx.lineWidth = Math.max(1.2, er * 0.14);
        ctx.beginPath();
        const spin = time * 8 * side;
        for (let i = 0; i <= 28; i++) {
          const a = spin + i * 0.5;
          const rr = (i / 28) * er * 0.82;
          const sx = ex + Math.cos(a) * rr;
          const sy = ey + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      } else {
        let px = ex + lx * er * 0.42;
        let py = ey + ly * er * 0.42;
        // Cross-eyed: pupils look at each other.
        px = lerp(px, ex + er * 0.25, f.crossEyed);
        py = lerp(py, ey - side * er * 0.45, f.crossEyed);
        const pr = er * 0.5 * f.pupilScale;
        ctx.fillStyle = skin.pupil;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px - pr * 0.3, py - pr * 0.35, pr * 0.32, 0, Math.PI * 2);
        ctx.fill();
      }

      // Eyelid closes from the back of the eye.
      if (f.lid > 0.02) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(ex, ey, er + 0.5, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = skin.body;
        const cover = er * 2 * clamp(f.lid, 0, 1);
        ctx.fillRect(ex - er - 1, ey - er - 1, cover + 1, er * 2 + 2);
        ctx.strokeStyle = skin.outline;
        ctx.lineWidth = Math.max(1.5, R * 0.07);
        ctx.beginPath();
        ctx.moveTo(ex - er + cover, ey - er);
        ctx.lineTo(ex - er + cover, ey + er);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private drawHeadOverlays(ctx: CanvasRenderingContext2D, layout: Layout, hx: number, hy: number, anim: SnakeAnimator): void {
    const c = layout.cell;
    if (anim.stars > 0.05) {
      ctx.save();
      ctx.globalAlpha = anim.stars;
      for (let i = 0; i < 3; i++) {
        const a = anim.time * 3.2 + (i * Math.PI * 2) / 3;
        const sx = hx + Math.cos(a) * c * 0.75;
        const sy = hy - c * 0.75 + Math.sin(a) * c * 0.28;
        ctx.fillStyle = '#ffd93b';
        ctx.strokeStyle = '#b5651d';
        ctx.lineWidth = Math.max(1, c * 0.04);
        drawStar(ctx, sx, sy, c * 0.2, c * 0.09, a);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    const bubble = anim.bubble;
    if (bubble) {
      const t = bubble.age / bubble.duration;
      const appear = clamp(bubble.age / 0.12, 0, 1);
      const fade = 1 - smoothstep(0.8, 1, t);
      const size = Math.max(14, c * 0.55);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.font = `700 ${size}px ${FONT_STACK}`;
      const w = ctx.measureText(bubble.text).width + size * 1.1;
      const h = size * 1.6;
      let bx = hx - w / 2;
      let by = hy - c * 1.25 - h - (1 - appear) * c * 0.3;
      bx = clamp(bx, layout.ox + 4, layout.ox + layout.cols * c - w - 4);
      by = Math.max(layout.oy + 4, by);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#2b2d5c';
      ctx.lineWidth = Math.max(2, c * 0.07);
      roundRectPath(ctx, bx, by, w, h, h * 0.45);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      const tipX = clamp(hx, bx + h * 0.5, bx + w - h * 0.5);
      ctx.moveTo(tipX - size * 0.35, by + h - 1);
      ctx.lineTo(tipX, by + h + size * 0.45);
      ctx.lineTo(tipX + size * 0.35, by + h - 1);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(tipX - size * 0.3, by + h - ctx.lineWidth * 1.5, size * 0.6, ctx.lineWidth * 2);
      ctx.fillStyle = '#2b2d5c';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bubble.text, bx + w / 2, by + h / 2 + size * 0.05);
      ctx.restore();
    }
  }
}

function wrapCoord(v: number, size: number, wrap: boolean): number {
  if (!wrap) return v;
  return ((v % size) + size) % size;
}

/** Which copies of the snake to draw so it appears seamlessly on both sides of a wrap edge. */
function wrapOffsets(points: readonly BodyPoint[], arena: Arena): Vec2[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x - 1);
    maxX = Math.max(maxX, p.x + 1);
    minY = Math.min(minY, p.y - 1);
    maxY = Math.max(maxY, p.y + 1);
  }
  const offsets: Vec2[] = [];
  for (const kx of [-1, 0, 1, 2, -2]) {
    for (const ky of [-1, 0, 1, 2, -2]) {
      const dx = kx * arena.cols;
      const dy = ky * arena.rows;
      if (maxX + dx < 0 || minX + dx > arena.cols || maxY + dy < 0 || minY + dy > arena.rows) continue;
      offsets.push({ x: dx, y: dy });
    }
  }
  return offsets;
}
