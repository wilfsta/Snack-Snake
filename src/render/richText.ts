import { FRACTION_GLYPH_RE, splitFractions } from '../core/fractionGlyphs';

/**
 * Canvas text for questions:
 *  - fractions are drawn stacked (3 over a bar over 4) at a size that matches the digits around them;
 *  - every "?" sits in a bright box, like the blank on a worksheet, so the missing part stands out.
 * Text with neither goes straight through to fillText / strokeText.
 */

/** Fraction digits relative to the main text size. */
const FRAC_SCALE = 0.6;
/** Space either side of a stacked fraction, relative to the main text size. */
const FRAC_PAD = 0.08;

/** The box behind a "?": the missing bit the child is looking for. */
export const QUESTION_BOX = { fill: '#ff3d8b', rim: '#ffffff', text: '#ffffff' } as const;
/** Inner padding of the "?" box and the gap either side of it, relative to the text size. */
const BOX_PAD = 0.2;
const BOX_GAP = 0.06;

type FontFor = (px: number) => string;
export type Pass = 'stroke' | 'fill';

type Segment = { readonly text: string } | { readonly mark: true } | { readonly num: string; readonly den: string };

function segmentsOf(text: string): Segment[] {
  return splitFractions(text).flatMap((seg): Segment[] =>
    'text' in seg
      ? seg.text
          .split(/(\?)/)
          .filter((t) => t !== '')
          .map((t) => (t === '?' ? { mark: true as const } : { text: t }))
      : [{ num: seg.num, den: seg.den }],
  );
}

const needsRich = (text: string) => text.includes('?') || FRACTION_GLYPH_RE.test(text);

function fracWidth(ctx: CanvasRenderingContext2D, num: string, den: string, size: number, fontFor: FontFor): number {
  ctx.font = fontFor(size * FRAC_SCALE);
  const w = Math.max(ctx.measureText(num).width, ctx.measureText(den).width);
  ctx.font = fontFor(size);
  return w + size * FRAC_PAD * 2 + size * 0.1;
}

function boxWidth(ctx: CanvasRenderingContext2D, size: number, fontFor: FontFor): number {
  ctx.font = fontFor(size);
  return ctx.measureText('?').width + size * (BOX_PAD * 2 + BOX_GAP * 2);
}

function segWidth(ctx: CanvasRenderingContext2D, seg: Segment, size: number, fontFor: FontFor): number {
  if ('text' in seg) {
    ctx.font = fontFor(size);
    return ctx.measureText(seg.text).width;
  }
  if ('mark' in seg) return boxWidth(ctx, size, fontFor);
  return fracWidth(ctx, seg.num, seg.den, size, fontFor);
}

/** Width of `text` at `size`, measured as drawn. */
export function measureRich(ctx: CanvasRenderingContext2D, text: string, size: number, fontFor: FontFor): number {
  ctx.font = fontFor(size);
  if (!needsRich(text)) return ctx.measureText(text).width;
  return segmentsOf(text).reduce((w, seg) => w + segWidth(ctx, seg, size, fontFor), 0);
}

/**
 * Draws `text` centred on (x, y) with textBaseline 'middle'. `passes` lists stroke and/or fill in
 * order, using the context's current strokeStyle / fillStyle / lineWidth.
 */
export function drawRich(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fontFor: FontFor, passes: readonly Pass[]): void {
  ctx.font = fontFor(size);
  ctx.textBaseline = 'middle';
  if (!needsRich(text)) {
    ctx.textAlign = 'center';
    for (const pass of passes) pass === 'stroke' ? ctx.strokeText(text, x, y) : ctx.fillText(text, x, y);
    return;
  }
  const segments = segmentsOf(text);
  const total = measureRich(ctx, text, size, fontFor);
  const outline = ctx.lineWidth;
  for (const pass of passes) {
    let cx = x - total / 2;
    for (const seg of segments) {
      const w = segWidth(ctx, seg, size, fontFor);
      if ('text' in seg) {
        ctx.font = fontFor(size);
        ctx.textAlign = 'left';
        pass === 'stroke' ? ctx.strokeText(seg.text, cx, y) : ctx.fillText(seg.text, cx, y);
      } else if ('mark' in seg) {
        drawQuestionBox(ctx, cx + w / 2, y, w - size * BOX_GAP * 2, size, fontFor, pass, outline);
      } else {
        drawFraction(ctx, seg.num, seg.den, cx + w / 2, y, w, size, fontFor, pass, outline);
      }
      cx += w;
    }
  }
  ctx.lineWidth = outline;
  ctx.font = fontFor(size);
  ctx.textAlign = 'center';
}

function drawQuestionBox(ctx: CanvasRenderingContext2D, mid: number, y: number, w: number, size: number, fontFor: FontFor, pass: Pass, outline: number): void {
  const h = size * 1.12;
  const left = mid - w / 2;
  const top = y - h / 2 + size * 0.02;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(left, top, w, h, size * 0.22);
  if (pass === 'stroke') {
    // Outlined text (the big banner): give the box the same outline.
    ctx.lineWidth = outline;
    ctx.stroke();
  } else {
    ctx.fillStyle = QUESTION_BOX.fill;
    ctx.fill();
    ctx.strokeStyle = QUESTION_BOX.rim;
    ctx.lineWidth = Math.max(1.5, size * 0.07);
    ctx.stroke();
    ctx.fillStyle = QUESTION_BOX.text;
    ctx.font = fontFor(size * 0.92);
    ctx.textAlign = 'center';
    ctx.fillText('?', mid, y + size * 0.04);
  }
  ctx.restore();
}

function drawFraction(ctx: CanvasRenderingContext2D, num: string, den: string, mid: number, y: number, w: number, size: number, fontFor: FontFor, pass: Pass, outline: number): void {
  const bar = Math.max(1.5, size * 0.075);
  ctx.font = fontFor(size * FRAC_SCALE);
  ctx.textAlign = 'center';
  const numY = y - size * 0.34;
  const denY = y + size * 0.4;
  if (pass === 'stroke') {
    ctx.lineWidth = outline * FRAC_SCALE;
    ctx.strokeText(num, mid, numY);
    ctx.strokeText(den, mid, denY);
  } else {
    ctx.fillText(num, mid, numY);
    ctx.fillText(den, mid, denY);
  }
  // The fraction bar.
  const half = w / 2 - size * FRAC_PAD;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(mid - half, y + size * 0.03);
  ctx.lineTo(mid + half, y + size * 0.03);
  ctx.lineCap = 'round';
  if (pass === 'stroke') {
    ctx.lineWidth = bar + outline * FRAC_SCALE;
  } else {
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = bar;
  }
  ctx.stroke();
  ctx.restore();
  ctx.lineWidth = outline;
}
