import { describe, expect, it } from 'vitest';
import { highScoreKey, isNewHighScore, pointsForCorrect, ScoreManager } from './scoring';

describe('scoring', () => {
  it('awards base points plus a capped streak bonus', () => {
    expect(pointsForCorrect(1)).toBe(10);
    expect(pointsForCorrect(2)).toBe(12);
    expect(pointsForCorrect(5)).toBe(18);
    expect(pointsForCorrect(100)).toBe(30);
  });

  it('tracks score, streak and best streak; a wrong answer resets the streak', () => {
    const s = new ScoreManager();
    s.registerCorrect();
    s.registerCorrect();
    s.registerCorrect();
    expect(s.score).toBe(10 + 12 + 14);
    expect(s.streak).toBe(3);
    s.registerWrong();
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(3);
    s.registerCorrect();
    expect(s.streak).toBe(1);
    expect(s.correct).toBe(4);
    expect(s.wrong).toBe(1);
  });

  it('detects new high scores per mode and table', () => {
    expect(isNewHighScore(50, undefined)).toBe(true);
    expect(isNewHighScore(0, undefined)).toBe(false);
    expect(isNewHighScore(40, 50)).toBe(false);
    expect(isNewHighScore(60, 50)).toBe(true);
    expect(highScoreKey('play', 'mul:table:6')).not.toBe(highScoreKey('play', 'mul:mixed'));
  });
});
