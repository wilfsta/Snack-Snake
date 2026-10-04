import { clamp } from '../../core/geometry';
import type { Challenge, ChallengeRequest, LearningContent, LearningUnit } from '../../learning/types';
import { STEPS_PER_UNIT, type ArithmeticOperation } from './operations';

/** Facts in each unit are introduced strictly in order: 1, 2, 3 ... 12. */
export const INTRODUCTION_ORDER: readonly number[] = Array.from({ length: STEPS_PER_UNIT }, (_, i) => i + 1);
export const INITIAL_BATCH = 3;

export function unitId(op: ArithmeticOperation, n: number): string {
  return `${op.id}:table:${n}`;
}

export function mixedUnitId(op: ArithmeticOperation): string {
  return `${op.id}:mixed`;
}

/** LearningContent for one arithmetic operation (times tables, adding, taking away, dividing). */
export class ArithmeticContent implements LearningContent {
  readonly subjectId: string;
  private readonly units = new Map<string, LearningUnit>();

  constructor(readonly op: ArithmeticOperation) {
    this.subjectId = op.id;
    const all: string[] = [];
    for (const n of op.units) {
      const itemIds = INTRODUCTION_ORDER.map((k) => op.itemId(n, k));
      all.push(...itemIds);
      this.units.set(unitId(op, n), {
        id: unitId(op, n),
        subjectId: op.id,
        title: op.unitTitle(n),
        shortTitle: op.unitLabel(n),
        itemIds,
        initialBatch: INITIAL_BATCH,
        supportsLearning: true,
      });
    }
    this.units.set(mixedUnitId(op), {
      id: mixedUnitId(op),
      subjectId: op.id,
      title: `Mixed ${op.name.toLowerCase()}`,
      shortTitle: 'Mixed',
      itemIds: all,
      initialBatch: all.length,
      supportsLearning: false,
    });
  }

  getUnit(id: string): LearningUnit | undefined {
    return this.units.get(id);
  }

  ownsItem(itemId: string): boolean {
    return this.op.parseItemId(itemId) !== null;
  }

  describeItem(itemId: string): { short: string; full: string } {
    const p = this.op.parseItemId(itemId);
    if (!p) return { short: itemId, full: itemId };
    const f = this.op.fact(p.n, p.k);
    return { short: `${f.left}${this.op.symbol}${f.right}`, full: `${f.left} ${this.op.symbol} ${f.right} = ${f.answer}` };
  }

  createChallenge(itemId: string, request: ChallengeRequest): Challenge {
    const p = this.op.parseItemId(itemId);
    if (!p) throw new Error(`Not a ${this.op.name} item: ${itemId}`);
    const { n, k } = p;
    const fact = this.op.fact(n, k);
    const id = request.challengeId;
    const prompt = `${fact.left} ${this.op.symbol} ${fact.right}`;
    const wrong = this.op.distractors(n, k, Math.max(1, request.distractorCount), request.rng);
    return {
      id,
      itemId,
      category: this.op.id,
      prompt,
      statement: `${prompt} = ${fact.answer}`,
      correctAnswer: { id: `${id}:${fact.answer}`, label: String(fact.answer) },
      distractors: wrong.map((value) => ({ id: `${id}:${value}`, label: String(value) })),
      difficulty: this.op.difficulty(n, k),
      stage: request.stage,
      hintStrength: request.stage === 'guided' ? clamp(request.hintStrength, 0, 1) : 0,
      teaching: this.op.teaching(n, k),
      metadata: { ...fact, n, k },
    };
  }
}
