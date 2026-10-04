import { ADDITION } from '../content/arithmetic/operations';
import { countItemId, MAX_COUNT } from '../content/counting/CountingContent';
import type { LearningUnit } from '../learning/types';
import type { ArenaThemeId } from '../render/themes';

/**
 * A world is a place to play plus a learning path through it. The child never picks
 * "a table" – the learning engine walks the path, unlocking the next item when they are ready.
 */
export interface WorldDefinition {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly theme: ArenaThemeId;
  /** Ordered items (possibly spanning several subjects) that make up the world. */
  readonly path: LearningUnit;
  /** Answers per question. Young worlds keep this small. */
  readonly answerCount: number;
  /** Plain apples to eat before any numbers appear: lots on the first visit, a couple after. */
  readonly warmup: { readonly firstVisit: number; readonly laterVisits: number };
}

/** Number Garden path: count to 10, then adding within 10 (+1s first, then +2s ...). */
function gardenPath(): string[] {
  const items: string[] = [];
  for (let n = 1; n <= MAX_COUNT; n++) items.push(countItemId(n));
  for (let add = 1; add <= 5; add++) {
    for (let k = 1; k + add <= 10; k++) items.push(ADDITION.itemId(add, k));
  }
  return items;
}

export const NUMBER_GARDEN: WorldDefinition = {
  id: 'garden',
  name: 'Number Garden',
  icon: '🌻',
  theme: 'garden',
  path: {
    id: 'world:garden',
    subjectId: 'world',
    title: 'Number Garden',
    shortTitle: '🌻',
    itemIds: gardenPath(),
    initialBatch: 3,
    supportsLearning: true,
  },
  answerCount: 3,
  warmup: { firstVisit: 6, laterVisits: 2 },
};

export const WORLDS: readonly WorldDefinition[] = [NUMBER_GARDEN];

export function worldById(id: string): WorldDefinition | undefined {
  return WORLDS.find((w) => w.id === id);
}
