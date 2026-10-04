import type { Rng } from '../core/random';

/**
 * The learning stages a challenge can be presented in.
 *  - introduce:   show the complete fact; it cannot be got wrong.
 *  - guided:      ask the question, with a visual hint toward the right answer.
 *  - independent: ask the question with no help.
 */
export type ChallengeStage = 'introduce' | 'guided' | 'independent';

export interface AnswerOption {
  readonly id: string;
  readonly label: string;
}

/** Optional subject-specific teaching aid shown when a fact is introduced (e.g. skip counting). */
export interface TeachingAid {
  readonly caption: string;
  readonly steps: readonly string[];
}

/**
 * One subject-agnostic challenge. The game engine only reads these fields and never needs to
 * know whether it is multiplication, spelling, vocabulary or anything else.
 */
export interface Challenge {
  /** Unique per presentation. */
  readonly id: string;
  /** The underlying learning item (e.g. the fact "6 × 4"). Stable across presentations. */
  readonly itemId: string;
  readonly category: string;
  /** The question as shown to the player, e.g. "6 × 4". */
  readonly prompt: string;
  /** The complete fact, e.g. "6 × 4 = 24". Used for introductions and reinforcement. */
  readonly statement: string;
  readonly correctAnswer: AnswerOption;
  readonly distractors: readonly AnswerOption[];
  /** 0 (easy) .. 1 (hard). */
  readonly difficulty: number;
  readonly stage: ChallengeStage;
  /** 0 = no hint, 1 = strongest hint. Only meaningful for guided challenges. */
  readonly hintStrength: number;
  readonly teaching?: TeachingAid;
  /** Subject-specific extras. The game never interprets these. */
  readonly metadata: Readonly<Record<string, unknown>>;
}

export type ChallengeEvent =
  | { readonly type: 'introduced'; readonly challenge: Challenge }
  | {
      readonly type: 'answered';
      readonly challenge: Challenge;
      readonly optionId: string;
      readonly correct: boolean;
      /** 1 for the first answer eaten for this challenge, 2 for the second, ... */
      readonly attemptNumber: number;
      readonly hintStrength: number;
    }
  | { readonly type: 'completed'; readonly challenge: Challenge; readonly firstTryCorrect: boolean };

/**
 * What a game asks for: "give me the next challenge" and "here is what happened".
 * Everything about adaptivity, mastery and subject matter lives behind this interface.
 */
export interface ChallengeSource {
  next(): Challenge;
  record(event: ChallengeEvent): void;
  /** Learning sessions end after enough meaningful interactions; endless sessions return false. */
  isSessionComplete(): boolean;
}

/** A group of items studied together, e.g. "the 6× table". */
export interface LearningUnit {
  readonly id: string;
  readonly subjectId: string;
  readonly title: string;
  readonly shortTitle: string;
  /** Items in recommended introduction order. */
  readonly itemIds: readonly string[];
  /** How many items to unlock when a learner first starts this unit. */
  readonly initialBatch: number;
  /** Whether the unit can be used in Learn mode (mixed review units cannot). */
  readonly supportsLearning: boolean;
}

export interface ChallengeRequest {
  readonly challengeId: string;
  readonly stage: ChallengeStage;
  readonly hintStrength: number;
  /** How many wrong answers to generate (answers on screen minus one). */
  readonly distractorCount: number;
  readonly rng: Rng;
}

/** Educational content plug-in. Add a new subject by implementing this. */
export interface LearningContent {
  readonly subjectId: string;
  getUnit(unitId: string): LearningUnit | undefined;
  /** True if this content can build challenges for the item. */
  ownsItem(itemId: string): boolean;
  createChallenge(itemId: string, request: ChallengeRequest): Challenge;
  describeItem(itemId: string): { readonly short: string; readonly full: string };
}
