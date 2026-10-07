import type { Curriculum } from '../learning/curriculum';
import { DEFAULT_PACING, type PacingConfig } from '../learning/pacing';
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
  /**
   * Plain apples a brand-new player eats before any maths: just learning to steer Sid and grow.
   * Never assessed, and not repeated once a player has finished them.
   */
  readonly onboardingApples: number;
  /** Thinking time before answers appear, by how well the child knows each fact. */
  readonly pacing: PacingConfig;
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
  onboardingApples: 5,
  pacing: DEFAULT_PACING,
  visitLength: 12,
};

export const WORLDS: readonly WorldDefinition[] = [NUMBER_GARDEN];

export function worldById(id: string): WorldDefinition | undefined {
  return WORLDS.find((w) => w.id === id);
}
