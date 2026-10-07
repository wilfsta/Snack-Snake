import { clamp } from '../../core/geometry';
import type { Rng } from '../../core/random';
import type { AnswerOption, Challenge, ChallengeRequest, LearningContent, LearningUnit, TeachingAid } from '../../learning/types';
import { pickDistractors } from '../arithmetic/operations';
import { quantityPicture, sharedStyle } from './representations';

/**
 * Early number sense and the ideas behind multiplication. Each item kind is a different
 * skill, even when the numbers look similar: recognising seven apples, matching the numeral 7
 * to a picture and knowing "one more than 6" are learnt separately.
 *
 *   match:n        numeral → which picture shows it?          (n 1–10)
 *   subit:n        structured picture (dice / frame) → how many? (n 1–9)
 *   more:n         which group has the most?                   (n 3–10)
 *   fewest:n       which group has the fewest?                 (n 1–6)
 *   onemore:n      🍎🍎🍎 + 🍎 → ?                               (n 1–9)
 *   oneless:n      🍎🍎🍎🍎 − 🍎 → ?                             (n 2–10)
 *   seq:s          3, 4, ?, 6                                  (s 1–7)
 *   bond:t:a       a + ? = t   (number bonds)                  (t 5 or 10)
 *   groups:g:s     g groups of s → how many altogether?
 *   repadd:g:s     s + s + … (g times)
 *   skip:step:p    counting in 2s / 5s / 10s with a gap
 *   link:g:s       s + s + s = g × s
 */

interface Built {
  readonly prompt: string;
  readonly askAs?: string;
  readonly statement: string;
  readonly correct: string;
  readonly wrong: readonly string[];
  readonly teaching?: TeachingAid;
  readonly difficulty: number;
}

type Kind = 'match' | 'subit' | 'more' | 'fewest' | 'onemore' | 'oneless' | 'seq' | 'bond' | 'groups' | 'repadd' | 'skip' | 'link';

const ID = /^(match|subit|more|fewest|onemore|oneless|seq|bond|groups|repadd|skip|link):(\d+)(?::(\d+))?$/;

export function parseNumberSenseId(itemId: string): { kind: Kind; a: number; b: number } | null {
  const m = ID.exec(itemId);
  if (!m) return null;
  return { kind: m[1] as Kind, a: Number(m[2]), b: m[3] === undefined ? Number.NaN : Number(m[3]) };
}

/** Valid number ranges per kind; ids outside them are not ours. */
function inRange(kind: Kind, a: number, b: number): boolean {
  const two = !Number.isNaN(b);
  switch (kind) {
    case 'match':
      return !two && a >= 1 && a <= 10;
    case 'subit':
      return !two && a >= 1 && a <= 9;
    case 'more':
      return !two && a >= 3 && a <= 10;
    case 'fewest':
      return !two && a >= 1 && a <= 6;
    case 'onemore':
      return !two && a >= 1 && a <= 9;
    case 'oneless':
      return !two && a >= 2 && a <= 10;
    case 'seq':
      return !two && a >= 1 && a <= 7;
    case 'bond':
      return two && (a === 5 || a === 10) && b >= 1 && b < a;
    case 'groups':
    case 'repadd':
    case 'link':
      return two && a >= 2 && a <= 4 && b >= 2 && b <= 5;
    case 'skip':
      return two && (a === 2 || a === 5 || a === 10) && b >= 1 && b <= 6;
  }
}

/** Circled numerals used to show "a group of n". */
const CIRCLED: Readonly<Record<number, string>> = { 1: '①', 2: '②', 3: '③', 4: '④', 5: '⑤' };

const nums = (correct: number, candidates: readonly { value: number; weight: number }[], count: number, rng: Rng, allowZero = false) =>
  pickDistractors(correct, candidates, count, rng, allowZero).map(String);

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Pictures with different quantities, all in one style so only the amount differs. */
function pictureChoices(rng: Rng, correctQty: number, wrongQty: readonly number[]) {
  const style = sharedStyle(rng, [correctQty, ...wrongQty], ['dots', 'frame', 'dice']);
  return {
    correct: quantityPicture(correctQty, style),
    wrong: wrongQty.map((q) => quantityPicture(q, style)),
  };
}

/** Distinct quantities near `n` (within 1..max), excluding n. */
function nearbyQuantities(n: number, count: number, max: number, rng: Rng): number[] {
  return pickDistractors(
    n,
    [
      { value: n + 1, weight: 4 },
      { value: n - 1, weight: 4 },
      { value: n + 2, weight: 2 },
      { value: n - 2, weight: 2 },
      { value: n + 3, weight: 1 },
      { value: n - 3, weight: 1 },
    ].filter((c) => c.value >= 1 && c.value <= max),
    count,
    rng,
  ).filter((q) => q >= 1 && q <= max);
}

function build(kind: Kind, a: number, b: number, count: number, rng: Rng): Built {
  switch (kind) {
    case 'match': {
      // Picture answers stay small (at most 5, or the number itself) so nothing needs counting while steering.
      const wrongQty = nearbyQuantities(a, count, Math.max(5, a), rng);
      const pics = pictureChoices(rng, a, wrongQty);
      return {
        prompt: String(a),
        statement: `${a} = ${pics.correct}`,
        correct: pics.correct,
        wrong: pics.wrong,
        teaching: { caption: `This is ${a}`, steps: range(1, a).map(String) },
        difficulty: a / 12,
      };
    }
    case 'subit': {
      const style = a <= 6 ? (rng.next() < 0.5 ? 'dice' : 'frame') : 'frame';
      const pic = quantityPicture(a, style);
      return {
        prompt: pic,
        statement: `${pic} = ${a}`,
        correct: String(a),
        wrong: nums(a, [{ value: a + 1, weight: 4 }, { value: a - 1, weight: 4 }, { value: a + 2, weight: 1 }, { value: a - 2, weight: 1 }], count, rng),
        teaching: { caption: a > 5 ? `5 and ${a - 5} more` : 'See it in a flash!', steps: a > 5 ? ['5', String(a)] : [String(a)] },
        difficulty: 0.15 + a / 20,
      };
    }
    case 'more':
    case 'fewest': {
      const most = kind === 'more';
      const others = most
        ? pickDistractors(a, range(1, a - 1).map((v) => ({ value: v, weight: v >= a - 3 ? 3 : 1 })), Math.min(count, a - 1), rng)
        : pickDistractors(a, range(a + 1, Math.min(10, a + 5)).map((v) => ({ value: v, weight: v <= a + 3 ? 3 : 1 })), count, rng);
      const valid = others.filter((q) => q >= 1 && q <= 10 && q !== a);
      // Compared as numerals: no piles of objects to count while steering.
      return {
        prompt: most ? 'Biggest?' : 'Smallest?',
        askAs: most ? 'Which number is biggest?' : 'Which number is smallest?',
        statement: most ? `${a} is the biggest!` : `${a} is the smallest!`,
        correct: String(a),
        wrong: valid.map(String),
        teaching: {
          caption: most ? 'Bigger numbers come later when we count' : 'Smaller numbers come earlier when we count',
          steps: [...valid, a].sort((x, y) => x - y).map(String),
        },
        difficulty: 0.2,
      };
    }
    case 'onemore':
    case 'oneless': {
      const more = kind === 'onemore';
      const answer = more ? a + 1 : a - 1;
      // The question is numerals ("6 + 1"); a small picture only appears when it is first taught.
      const prompt = `${a} ${more ? '+' : '−'} 1`;
      return {
        prompt,
        askAs: `${prompt} = ?`,
        statement: `${prompt} = ${answer}`,
        correct: String(answer),
        wrong: nums(answer, [{ value: a, weight: 5 }, { value: more ? a + 2 : a - 2, weight: 3 }, { value: more ? a - 1 : a + 1, weight: 2 }], count, rng),
        teaching: { caption: more ? 'One more!' : 'One less!', steps: [String(a), String(answer)] },
        difficulty: 0.25 + a / 40,
      };
    }
    case 'seq': {
      const values = range(a, a + 3);
      const gap = 1 + (a % 2);
      const answer = values[gap];
      const shown = values.map((v, i) => (i === gap ? '?' : String(v))).join(', ');
      return {
        prompt: shown,
        askAs: shown,
        statement: values.join(', '),
        correct: String(answer),
        wrong: nums(answer, [{ value: answer + 1, weight: 4 }, { value: answer - 1, weight: 4 }, { value: answer + 2, weight: 1 }], count, rng),
        teaching: { caption: 'Count along', steps: values.map(String) },
        difficulty: 0.3,
      };
    }
    case 'bond': {
      const t = a;
      const part = b;
      const answer = t - part;
      const prompt = `${part} + ? = ${t}`;
      return {
        prompt,
        askAs: prompt,
        statement: `${part} + ${answer} = ${t}`,
        correct: String(answer),
        wrong: nums(answer, [{ value: t, weight: 3 }, { value: part, weight: part !== answer ? 2 : 0 }, { value: answer + 1, weight: 4 }, { value: answer - 1, weight: 4 }], count, rng, false),
        teaching: { caption: `Fill it up to ${t}`, steps: [String(part), `+ ${answer}`, String(t)] },
        difficulty: t === 5 ? 0.35 : 0.45,
      };
    }
    case 'groups':
    case 'repadd':
    case 'link': {
      const g = a;
      const s = b;
      const answer = g * s;
      const sum = Array.from({ length: g }, () => String(s)).join(' + ');
      // Groups are shown as numbered bubbles (②②② = three groups of two): the idea of equal groups
      // without objects to count. The apple picture is only used when it is first taught.
      const bubbles = Array.from({ length: g }, () => CIRCLED[s] ?? `(${s})`).join(' ');
      const prompt = kind === 'groups' ? bubbles : kind === 'repadd' ? sum : `${sum}\n= ${g} × ${s}`;
      return {
        prompt,
        askAs: kind === 'link' ? `${g} × ${s} = ?` : kind === 'groups' ? `${bubbles} = ?` : undefined,
        statement: kind === 'groups' ? `${bubbles} = ${answer}` : kind === 'repadd' ? `${sum} = ${answer}` : `${sum} = ${g} × ${s} = ${answer}`,
        correct: String(answer),
        wrong: nums(answer, [{ value: g + s, weight: 3 }, { value: answer + s, weight: 3 }, { value: answer - s, weight: 3 }, { value: answer + 1, weight: 2 }, { value: answer - 1, weight: 2 }], count, rng),
        teaching: { caption: `${g} groups of ${s}`, steps: range(1, g).map((i) => String(i * s)) },
        difficulty: kind === 'groups' ? 0.55 : kind === 'repadd' ? 0.6 : 0.7,
      };
    }
    case 'skip': {
      const step = a;
      const values = range(b, b + 3).map((i) => i * step);
      const gap = 1 + (b % 2);
      const answer = values[gap];
      const shown = values.map((v, i) => (i === gap ? '?' : String(v))).join(', ');
      return {
        prompt: shown,
        askAs: shown,
        statement: values.join(', '),
        correct: String(answer),
        wrong: nums(answer, [{ value: answer + step, weight: 3 }, { value: answer - step, weight: 3 }, { value: answer + 1, weight: 3 }, { value: answer - 1, weight: 2 }], count, rng),
        teaching: { caption: `Count in ${step}s`, steps: values.map(String) },
        difficulty: step === 10 ? 0.5 : step === 2 ? 0.55 : 0.6,
      };
    }
  }
}

export class NumberSenseContent implements LearningContent {
  readonly subjectId = 'numbersense';

  getUnit(): LearningUnit | undefined {
    return undefined;
  }

  ownsItem(itemId: string): boolean {
    const p = parseNumberSenseId(itemId);
    return !!p && inRange(p.kind, p.a, p.b);
  }

  describeItem(itemId: string): { short: string; full: string } {
    const p = parseNumberSenseId(itemId);
    if (!p) return { short: itemId, full: itemId };
    return { short: itemId.replace(/^\w+:/, ''), full: itemId };
  }

  createChallenge(itemId: string, request: ChallengeRequest): Challenge {
    const p = parseNumberSenseId(itemId);
    if (!p || !inRange(p.kind, p.a, p.b)) throw new Error(`Not a number-sense item: ${itemId}`);
    const built = build(p.kind, p.a, p.b, Math.max(1, request.distractorCount), request.rng);
    const id = request.challengeId;
    const option = (label: string, i: number): AnswerOption => ({ id: `${id}:${i}`, label });
    // Wrong answers must never duplicate the right one or each other.
    const wrong = [...new Set(built.wrong)].filter((w) => w !== built.correct);
    return {
      id,
      itemId,
      category: this.subjectId,
      prompt: built.prompt,
      askAs: built.askAs,
      statement: built.statement,
      correctAnswer: option(built.correct, 0),
      distractors: wrong.map((w, i) => option(w, i + 1)),
      difficulty: clamp(built.difficulty, 0, 1),
      stage: request.stage,
      hintStrength: request.stage === 'guided' ? clamp(request.hintStrength, 0, 1) : 0,
      teaching: built.teaching,
      metadata: { kind: p.kind, a: p.a, b: p.b },
    };
  }
}
