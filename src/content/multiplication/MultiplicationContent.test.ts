import { describe, expect, it } from 'vitest';
import { seededRng } from '../../core/random';
import { MIXED_UNIT_ID, MultiplicationContent, parseFactId, tableUnitId, TIMES_TABLES } from './MultiplicationContent';

const content = new MultiplicationContent();

describe('MultiplicationContent', () => {
  it('provides a 12-fact unit for each table from 2× to 12×, in order', () => {
    for (const t of TIMES_TABLES) {
      const unit = content.getUnit(tableUnitId(t));
      expect(unit).toBeDefined();
      expect(unit!.itemIds).toHaveLength(12);
      expect(new Set(unit!.itemIds).size).toBe(12);
      expect(unit!.itemIds.slice(0, 4).map((id) => parseFactId(id)!.b)).toEqual([1, 2, 3, 4]);
      expect(unit!.supportsLearning).toBe(true);
    }
  });

  it('mixed unit covers every table × 1..12 and is play-only', () => {
    const mixed = content.getUnit(MIXED_UNIT_ID)!;
    expect(mixed.itemIds).toHaveLength(11 * 12);
    expect(mixed.supportsLearning).toBe(false);
  });

  it('creates challenges with the right prompt, statement and answer', () => {
    const ch = content.createChallenge('mul:6x4', { challengeId: 'c1', stage: 'independent', hintStrength: 0, distractorCount: 4, rng: seededRng(1) });
    expect(ch.prompt).toBe('6 × 4');
    expect(ch.statement).toBe('6 × 4 = 24');
    expect(ch.correctAnswer.label).toBe('24');
    expect(ch.teaching?.steps).toEqual(['6', '12', '18', '24']);
  });

  it('every challenge has exactly five unique answers with exactly one correct', () => {
    let seed = 1;
    for (const a of TIMES_TABLES) {
      for (let b = 1; b <= 12; b++) {
        const ch = content.createChallenge(`mul:${a}x${b}`, { challengeId: `c${seed}`, stage: 'guided', hintStrength: 0.5, distractorCount: 4, rng: seededRng(seed++) });
        const all = [ch.correctAnswer, ...ch.distractors];
        expect(all).toHaveLength(5);
        expect(new Set(all.map((o) => o.label)).size).toBe(5);
        expect(new Set(all.map((o) => o.id)).size).toBe(5);
        expect(all.filter((o) => Number(o.label) === a * b)).toHaveLength(1);
        expect(ch.hintStrength).toBe(0.5);
      }
    }
  });

  it('only guided challenges carry a hint', () => {
    const ch = content.createChallenge('mul:3x3', { challengeId: 'x', stage: 'independent', hintStrength: 1, distractorCount: 4, rng: seededRng(2) });
    expect(ch.hintStrength).toBe(0);
  });
});
