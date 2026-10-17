import { FRACTION_GLYPHS } from '../../core/fractionGlyphs';
import { clamp } from '../../core/geometry';
import type { TeachingAid } from '../../learning/types';
import { pickDistractors, type Candidate } from './distractorPool';
import type { ArithmeticOperation } from './operations';

/**
 * Fractions and percentages of an amount: "¾ of 12", "25% of 80". Answers are always whole
 * numbers, so they fit the same game as the other subjects. Each unit is one fraction or
 * percentage; its 12 facts use bigger and bigger amounts (k = 1..12).
 */

/**
 * A fraction unit is stored as numerator × 100 + denominator (¾ → 304), so ids stay readable
 * and stable if more fractions are added later.
 */
const code = (a: number, d: number) => a * 100 + d;
const split = (n: number) => ({ a: Math.floor(n / 100), d: n % 100 });
const glyph = (a: number, d: number) => FRACTION_GLYPHS[`${a}/${d}`] ?? `${a}/${d}`;

/** Unit fractions first (halves, quarters, thirds…), then fractions with a bigger top number. */
const FRACTION_ORDER: readonly number[] = [
  code(1, 2),
  code(1, 4),
  code(1, 3),
  code(1, 5),
  code(1, 10),
  code(1, 6),
  code(1, 8),
  code(3, 4),
  code(2, 3),
  code(2, 5),
  code(3, 5),
  code(4, 5),
];

function fractionTeaching(a: number, d: number, k: number): TeachingAid {
  const amount = d * k;
  if (a === 1) return { caption: `Share ${amount} into ${d} equal parts`, steps: [`${amount} ÷ ${d} = ${k}`] };
  return {
    caption: `Find ${glyph(1, d)} first, then take ${a} of them`,
    steps: [`${amount} ÷ ${d} = ${k}`, `${k} × ${a} = ${a * k}`],
  };
}

export const FRACTIONS: ArithmeticOperation = {
  id: 'frac',
  name: 'Fractions',
  symbol: '½',
  units: FRACTION_ORDER,
  unitLabel: (n) => glyph(split(n).a, split(n).d),
  unitTitle: (n) => `${glyph(split(n).a, split(n).d)} of a number`,
  itemId: (n, k) => `frac:${split(n).a}/${split(n).d}x${k}`,
  parseItemId: (itemId) => {
    const m = /^frac:(\d+)\/(\d+)x(\d+)$/.exec(itemId);
    return m ? { n: code(Number(m[1]), Number(m[2])), k: Number(m[3]) } : null;
  },
  // left = the amount, right = the unit code, answer = the fraction of the amount.
  fact: (n, k) => {
    const { a, d } = split(n);
    return { left: d * k, right: n, answer: a * k };
  },
  prompt: (n, k) => {
    const { a, d } = split(n);
    return `${glyph(a, d)} of ${d * k}`;
  },
  distractors: (n, k, count, rng) => {
    const { a, d } = split(n);
    const amount = d * k;
    const c = a * k;
    const cands: Candidate[] = [
      { value: c + 1, weight: 3 },
      { value: c - 1, weight: 3 },
      { value: c + 2, weight: 1 },
      { value: c - 2, weight: 1 },
      { value: k, weight: a > 1 ? 5 : 0 }, // found the unit fraction but forgot the top number
      { value: c + k, weight: a > 1 ? 2 : 0 }, // one part too many
      { value: c - k, weight: a > 1 ? 2 : 0 },
      { value: amount - c, weight: 2 }, // the other part
      { value: amount / a, weight: a > 1 ? 1.5 : 0 }, // divided by the top number
      { value: amount / (d + 1), weight: 2 }, // shared into the wrong number of parts
      { value: amount / (d - 1), weight: d > 2 ? 2 : 0 },
      { value: amount, weight: 0.5 },
    ];
    return pickDistractors(c, cands, count, rng);
  },
  teaching: (n, k) => {
    const { a, d } = split(n);
    return fractionTeaching(a, d, k);
  },
  difficulty: (n, k) => clamp((FRACTION_ORDER.indexOf(n) / FRACTION_ORDER.length) * 0.7 + (k / 12) * 0.3, 0, 1),
};

/** Easiest first: half, a tenth, a quarter, then percentages built from those. */
const PERCENT_ORDER: readonly number[] = [50, 10, 25, 20, 5, 1, 75, 30, 40, 60, 90];

const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
/** Amounts go up in steps that keep the answer whole and use friendly numbers (multiples of 10). */
function percentStep(p: number): number {
  const whole = 100 / gcd(p, 100);
  return (whole * 10) / gcd(whole, 10);
}
const percentAmount = (p: number, k: number) => percentStep(p) * k;
const percentOf = (p: number, amount: number) => (p * amount) / 100;

function percentTeaching(p: number, amount: number): TeachingAid {
  const answer = percentOf(p, amount);
  const tenth = amount / 10;
  switch (p) {
    case 50:
      return { caption: '50% is half', steps: [`${amount} ÷ 2 = ${answer}`] };
    case 10:
      return { caption: '10% is a tenth', steps: [`${amount} ÷ 10 = ${answer}`] };
    case 25:
      return { caption: '25% is a quarter: half, then half again', steps: [`${amount} ÷ 2 = ${amount / 2}`, `${amount / 2} ÷ 2 = ${answer}`] };
    case 75:
      return { caption: '75% is 50% and 25% together', steps: [`50% = ${amount / 2}`, `25% = ${amount / 4}`, `75% = ${answer}`] };
    case 5:
      return { caption: 'Find 10%, then halve it', steps: [`10% = ${tenth}`, `5% = ${answer}`] };
    case 1:
      return { caption: '1% is a hundredth', steps: [`${amount} ÷ 100 = ${answer}`] };
    default:
      return { caption: `Find 10%, then take ${p / 10} lots`, steps: [`10% = ${tenth}`, `${p}% = ${answer}`] };
  }
}

export const PERCENTAGES: ArithmeticOperation = {
  id: 'pct',
  name: 'Percentages',
  symbol: '%',
  units: PERCENT_ORDER,
  unitLabel: (p) => `${p}%`,
  unitTitle: (p) => `${p}% of a number`,
  itemId: (p, k) => `pct:${p}%${k}`,
  parseItemId: (itemId) => {
    const m = /^pct:(\d+)%(\d+)$/.exec(itemId);
    return m ? { n: Number(m[1]), k: Number(m[2]) } : null;
  },
  // left = the amount, right = the percentage, answer = that percentage of the amount.
  fact: (p, k) => {
    const amount = percentAmount(p, k);
    return { left: amount, right: p, answer: percentOf(p, amount) };
  },
  prompt: (p, k) => `${p}% of ${percentAmount(p, k)}`,
  distractors: (p, k, count, rng) => {
    const amount = percentAmount(p, k);
    const c = percentOf(p, amount);
    const tenth = amount / 10;
    const cands: Candidate[] = [
      { value: c + 1, weight: 2 },
      { value: c - 1, weight: 2 },
      { value: tenth, weight: p !== 10 ? 3 : 0 }, // found 10% whatever the percentage
      { value: amount / 2, weight: p !== 50 ? 3 : 0 }, // found half
      { value: amount / 4, weight: p !== 25 ? 1.5 : 0 },
      { value: amount - c, weight: 2.5 }, // the part that's left (75% instead of 25%)
      { value: c * 10, weight: 1.5 }, // place value slips
      { value: c / 10, weight: 1.5 },
      { value: c + tenth, weight: 2 }, // one 10% too many / few
      { value: c - tenth, weight: 2 },
      { value: p, weight: 0.5 }, // gave the percentage back
    ];
    return pickDistractors(c, cands, count, rng);
  },
  teaching: (p, k) => percentTeaching(p, percentAmount(p, k)),
  difficulty: (p, k) => clamp((PERCENT_ORDER.indexOf(p) / PERCENT_ORDER.length) * 0.7 + (k / 12) * 0.3 + 0.1, 0, 1),
};
