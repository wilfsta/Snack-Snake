import { pick } from '../../core/random';
import type { Challenge, ChallengeRequest, LearningContent, LearningUnit } from '../../learning/types';
import { pickDistractors } from '../arithmetic/operations';
import { quantityPicture, stylesFor } from '../numberSense/representations';

export const MAX_COUNT = 10;
const PER_ROW = 5;

export function countItemId(n: number): string {
  return `count:${n}`;
}

export function parseCountItemId(itemId: string): number | null {
  const m = /^count:(\d+)$/.exec(itemId);
  return m ? Number(m[1]) : null;
}

/** "🍎🍎🍎🍎🍎\n🍎🍎" – rows of five, so groups are easy to see (and the tile stays compact). */
export function objectPicture(n: number, emoji = '🍎'): string {
  const rows: string[] = [];
  for (let left = n; left > 0; left -= PER_ROW) rows.push(emoji.repeat(Math.min(PER_ROW, left)));
  return rows.join('\n');
}

/**
 * Counting: how many apples? Needs no reading at all – the question is a picture and the
 * answers are numerals, so it also teaches number recognition.
 */
export class CountingContent implements LearningContent {
  readonly subjectId = 'count';
  private readonly unit: LearningUnit = {
    id: 'count:all',
    subjectId: 'count',
    title: 'Counting',
    shortTitle: '🍎',
    itemIds: Array.from({ length: MAX_COUNT }, (_, i) => countItemId(i + 1)),
    initialBatch: 3,
    supportsLearning: true,
  };

  getUnit(unitId: string): LearningUnit | undefined {
    return unitId === this.unit.id ? this.unit : undefined;
  }

  ownsItem(itemId: string): boolean {
    return parseCountItemId(itemId) !== null;
  }

  describeItem(itemId: string): { short: string; full: string } {
    const n = parseCountItemId(itemId) ?? 0;
    return { short: `${n}🍎`, full: `${n} apple${n === 1 ? '' : 's'}` };
  }

  createChallenge(itemId: string, request: ChallengeRequest): Challenge {
    const n = parseCountItemId(itemId);
    if (n === null) throw new Error(`Not a counting item: ${itemId}`);
    const id = request.challengeId;
    // Introductions use apples; questions vary the picture so "seven" is recognised in any form.
    const style = request.stage === 'introduce' || request.rng.next() < 0.4 ? 'apples' : pick(request.rng, stylesFor(n));
    const prompt = quantityPicture(n, style);
    const wrong = pickDistractors(
      n,
      [
        { value: n + 1, weight: 5 },
        { value: n - 1, weight: 5 },
        { value: n + 2, weight: 2 },
        { value: n - 2, weight: 2 },
        { value: n + 3, weight: 1 },
      ],
      Math.max(1, request.distractorCount),
      request.rng,
    );
    return {
      id,
      itemId,
      category: this.subjectId,
      prompt,
      statement: `${prompt} = ${n}`,
      correctAnswer: { id: `${id}:${n}`, label: String(n) },
      distractors: wrong.map((v) => ({ id: `${id}:${v}`, label: String(v) })),
      difficulty: n / MAX_COUNT,
      stage: request.stage,
      hintStrength: request.stage === 'guided' ? request.hintStrength : 0,
      teaching: { caption: 'Count them!', steps: Array.from({ length: n }, (_, i) => String(i + 1)) },
      metadata: { n, style },
    };
  }
}
