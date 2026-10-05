import type { AccessoryDrawInfo, SnakeAccessory, UprightDrawInfo } from './skins';

const INK = '#2b2d5c';

function outline(ctx: CanvasRenderingContext2D, width: number): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** Hats are drawn upright above the head (cartoon logic), so they read clearly whichever way Sid faces. */
const cap: SnakeAccessory = {
  id: 'hat:cap',
  drawUpright(ctx, { x, y, radius: R }: UprightDrawInfo) {
    const top = y - R * 0.55;
    const lw = Math.max(1.5, R * 0.08);
    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.ellipse(x + R * 0.45, top, R * 0.6, R * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    outline(ctx, lw);
    ctx.beginPath();
    ctx.arc(x, top, R * 0.62, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    outline(ctx, lw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, top - R * 0.62, R * 0.1, 0, Math.PI * 2);
    ctx.fill();
  },
};

const topHat: SnakeAccessory = {
  id: 'hat:tophat',
  drawUpright(ctx, { x, y, radius: R }) {
    const brimY = y - R * 0.6;
    const lw = Math.max(1.5, R * 0.08);
    ctx.fillStyle = '#26262e';
    ctx.beginPath();
    ctx.ellipse(x, brimY, R * 0.85, R * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    outline(ctx, lw);
    ctx.beginPath();
    ctx.rect(x - R * 0.48, brimY - R * 1.05, R * 0.96, R * 1.05);
    ctx.fill();
    outline(ctx, lw);
    ctx.fillStyle = '#e63946';
    ctx.fillRect(x - R * 0.48, brimY - R * 0.34, R * 0.96, R * 0.2);
  },
};

const crown: SnakeAccessory = {
  id: 'hat:crown',
  drawUpright(ctx, { x, y, radius: R, time }) {
    const base = y - R * 0.55;
    const w = R * 1.25;
    const h = R * 0.75;
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(x - w / 2, base);
    ctx.lineTo(x - w / 2, base - h * 0.6);
    ctx.lineTo(x - w / 4, base - h * 0.25);
    ctx.lineTo(x, base - h);
    ctx.lineTo(x + w / 4, base - h * 0.25);
    ctx.lineTo(x + w / 2, base - h * 0.6);
    ctx.lineTo(x + w / 2, base);
    ctx.closePath();
    ctx.fill();
    outline(ctx, Math.max(1.5, R * 0.08));
    const sparkle = 0.6 + 0.4 * Math.sin(time * 4);
    for (const [dx, color] of [[-w / 4, '#ff4f7b'], [0, '#3ec1ff'], [w / 4, '#7bdc4c']] as const) {
      ctx.fillStyle = color;
      ctx.globalAlpha = sparkle;
      ctx.beginPath();
      ctx.arc(x + dx, base - h * 0.22, R * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
};

const pirateHat: SnakeAccessory = {
  id: 'hat:pirate',
  drawUpright(ctx, { x, y, radius: R }) {
    const base = y - R * 0.5;
    ctx.fillStyle = '#1f1f26';
    ctx.beginPath();
    ctx.moveTo(x - R * 1.0, base);
    ctx.quadraticCurveTo(x - R * 0.7, base - R * 1.1, x, base - R * 0.95);
    ctx.quadraticCurveTo(x + R * 0.7, base - R * 1.1, x + R * 1.0, base);
    ctx.quadraticCurveTo(x, base - R * 0.3, x - R * 1.0, base);
    ctx.closePath();
    ctx.fill();
    outline(ctx, Math.max(1.5, R * 0.08));
    // Skull.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, base - R * 0.6, R * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1f1f26';
    ctx.beginPath();
    ctx.arc(x - R * 0.06, base - R * 0.62, R * 0.04, 0, Math.PI * 2);
    ctx.arc(x + R * 0.06, base - R * 0.62, R * 0.04, 0, Math.PI * 2);
    ctx.fill();
  },
};

const bow: SnakeAccessory = {
  id: 'hat:bow',
  drawUpright(ctx, { x, y, radius: R }) {
    const cx = x + R * 0.25;
    const cy = y - R * 0.75;
    const lw = Math.max(1.5, R * 0.07);
    ctx.fillStyle = '#ff6fae';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + side * R * 0.55, cy - R * 0.3);
      ctx.lineTo(cx + side * R * 0.55, cy + R * 0.3);
      ctx.closePath();
      ctx.fill();
      outline(ctx, lw);
    }
    ctx.fillStyle = '#ff3d8b';
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.14, 0, Math.PI * 2);
    ctx.fill();
    outline(ctx, lw);
  },
};

/** Glasses sit on the eyes, so they are drawn in the head's own rotated frame. */
const shades: SnakeAccessory = {
  id: 'face:shades',
  draw(ctx, { radius: R, face }: AccessoryDrawInfo) {
    if (face.spiralEyes > 0.5) return; // let the dizzy eyes show through
    const hh = R * 0.9;
    const ex = -R * 0.05;
    const er = R * 0.4 * Math.max(1, face.eyeScale);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(1.5, R * 0.1);
    ctx.beginPath();
    ctx.moveTo(ex, -hh * 0.5 + er * 0.7);
    ctx.lineTo(ex, hh * 0.5 - er * 0.7);
    ctx.stroke();
    for (const side of [-1, 1]) {
      const ey = side * hh * 0.5;
      ctx.fillStyle = '#16161d';
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(ex - er * 0.3, ey - er * 0.3, er * 0.28, er * 0.16, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

export const ACCESSORIES: Readonly<Record<string, SnakeAccessory>> = Object.fromEntries(
  [cap, topHat, crown, pirateHat, bow, shades].map((a) => [a.id, a]),
);
