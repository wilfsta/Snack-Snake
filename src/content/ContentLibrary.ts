import type { Challenge, ChallengeRequest, LearningContent, LearningUnit } from '../learning/types';
import { ArithmeticContent } from './arithmetic/ArithmeticContent';
import { OPERATIONS } from './arithmetic/operations';
import { CountingContent } from './counting/CountingContent';

/** Combines several subjects into one LearningContent, routing by unit and item id. */
export class ContentLibrary implements LearningContent {
  readonly subjectId = 'library';

  constructor(private readonly parts: readonly LearningContent[]) {}

  getUnit(unitId: string): LearningUnit | undefined {
    for (const part of this.parts) {
      const unit = part.getUnit(unitId);
      if (unit) return unit;
    }
    return undefined;
  }

  ownsItem(itemId: string): boolean {
    return this.parts.some((p) => p.ownsItem(itemId));
  }

  createChallenge(itemId: string, request: ChallengeRequest): Challenge {
    return this.partFor(itemId).createChallenge(itemId, request);
  }

  describeItem(itemId: string): { short: string; full: string } {
    return this.partFor(itemId).describeItem(itemId);
  }

  private partFor(itemId: string): LearningContent {
    const part = this.parts.find((p) => p.ownsItem(itemId));
    if (!part) throw new Error(`No content owns item ${itemId}`);
    return part;
  }
}

/** Every subject the game currently offers. */
export function createContentLibrary(): ContentLibrary {
  return new ContentLibrary([new CountingContent(), ...OPERATIONS.map((op) => new ArithmeticContent(op))]);
}
