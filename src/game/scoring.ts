export const SCORING = {
  basePoints: 10,
  streakBonusPerStep: 2,
  maxStreakBonus: 20,
} as const;

/** Points for a correct answer. `streak` includes this answer. No time bonus: accuracy beats speed. */
export function pointsForCorrect(streak: number): number {
  const bonus = Math.min(Math.max(streak - 1, 0) * SCORING.streakBonusPerStep, SCORING.maxStreakBonus);
  return SCORING.basePoints + bonus;
}

export class ScoreManager {
  score = 0;
  streak = 0;
  bestStreak = 0;
  correct = 0;
  wrong = 0;

  registerCorrect(): number {
    this.streak++;
    this.correct++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    const points = pointsForCorrect(this.streak);
    this.score += points;
    return points;
  }

  /** Classic mode: a flat 10 points per snack, like the original game. */
  registerFood(): number {
    this.correct++;
    this.score += SCORING.basePoints;
    return SCORING.basePoints;
  }

  registerWrong(): void {
    this.streak = 0;
    this.wrong++;
  }
}

export function highScoreKey(mode: string, unitId: string): string {
  return `${mode}:${unitId}`;
}

export function isNewHighScore(score: number, previous: number | undefined): boolean {
  return score > 0 && score > (previous ?? 0);
}
