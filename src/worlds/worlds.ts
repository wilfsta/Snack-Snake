import type { Curriculum } from '../learning/curriculum';
import type { ArenaThemeId } from '../render/themes';
import { GARDEN_CURRICULUM } from './gardenCurriculum';

/**
 * A world is a place to play plus a learning journey through it. The child never picks
 * "a table" or a level – the learning engine works out where they are and what comes next.
 */
export interface WorldDefinition {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly theme: ArenaThemeId;
  /** The skill groups that make up the world, in journey order. */
  readonly curriculum: Curriculum;
  /** Answers per question. Young worlds keep this small. */
  readonly answerCount: number;
  /** Plain apples to eat before any numbers appear: lots on the first visit, a couple after. */
  readonly warmup: { readonly firstVisit: number; readonly laterVisits: number };
  /** Questions and new things per visit, before the "look what grew!" reward screen. */
  readonly visitLength: number;
}

export const NUMBER_GARDEN: WorldDefinition = {
  id: 'garden',
  name: 'Number Garden',
  icon: '🌻',
  theme: 'garden',
  curriculum: GARDEN_CURRICULUM,
  answerCount: 3,
  warmup: { firstVisit: 6, laterVisits: 2 },
  visitLength: 12,
};

export const WORLDS: readonly WorldDefinition[] = [NUMBER_GARDEN];

export function worldById(id: string): WorldDefinition | undefined {
  return WORLDS.find((w) => w.id === id);
}
