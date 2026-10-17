/**
 * Fraction characters (½, ¾, ⅔ …). Content writes them as single characters; the canvas and the
 * DOM draw them as proper stacked fractions, because fonts print these glyphs much smaller than
 * the digits around them.
 */
export const FRACTION_GLYPHS: Readonly<Record<string, string>> = {
  '1/2': '½',
  '1/3': '⅓',
  '2/3': '⅔',
  '1/4': '¼',
  '3/4': '¾',
  '1/5': '⅕',
  '2/5': '⅖',
  '3/5': '⅗',
  '4/5': '⅘',
  '1/6': '⅙',
  '5/6': '⅚',
  '1/7': '⅐',
  '1/8': '⅛',
  '3/8': '⅜',
  '5/8': '⅝',
  '7/8': '⅞',
  '1/9': '⅑',
  '1/10': '⅒',
};

const PARTS = new Map<string, { num: string; den: string }>(
  Object.entries(FRACTION_GLYPHS).map(([frac, glyph]) => {
    const [num, den] = frac.split('/');
    return [glyph, { num, den }];
  }),
);

/** Matches any fraction character. */
export const FRACTION_GLYPH_RE = new RegExp(`[${[...PARTS.keys()].join('')}]`, 'u');

export type TextSegment = { readonly text: string } | { readonly num: string; readonly den: string; readonly glyph: string };

/** Splits text into plain runs and fractions: "¾ of 12" → [¾] [" of 12"]. */
export function splitFractions(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  let run = '';
  for (const ch of Array.from(text)) {
    const parts = PARTS.get(ch);
    if (!parts) {
      run += ch;
      continue;
    }
    if (run) out.push({ text: run });
    run = '';
    out.push({ ...parts, glyph: ch });
  }
  if (run) out.push({ text: run });
  return out;
}
