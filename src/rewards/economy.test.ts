import { describe, expect, it } from 'vitest';
import { GARDEN_PLANTS, WARDROBE } from './catalog';
import {
  affordableItems,
  award,
  balance,
  buy,
  equip,
  initialRewardState,
  nextGoal,
  plantsUnlocked,
  plantThreshold,
  sanitizeRewardState,
} from './economy';

describe('reward economy', () => {
  it('starts with classic Sid and no stars', () => {
    const s = initialRewardState();
    expect(balance(s)).toBe(0);
    expect(s.equipped.skin).toBe('skin:classic');
    expect(s.owned).toContain('skin:classic');
  });

  it('earning stars only goes up; garden stars only count inside the garden', () => {
    let s = initialRewardState();
    s = award(s, 5, true).state;
    s = award(s, 4, false).state;
    expect(s.starsEarned).toBe(9);
    expect(s.gardenStars).toBe(5);
    expect(award(s, 0, true).state).toBe(s);
    expect(award(s, -3, true).state).toBe(s);
  });

  it('the garden grows as garden stars are earned, quickly at first', () => {
    expect(plantsUnlocked(0)).toBe(0);
    expect(plantsUnlocked(plantThreshold(0))).toBe(1);
    // A first visit's worth of stars (~12) already grows a few things.
    expect(plantsUnlocked(12)).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < GARDEN_PLANTS.length; i++) expect(plantThreshold(i)).toBeGreaterThan(plantThreshold(i - 1));
    expect(plantsUnlocked(1_000_000)).toBe(GARDEN_PLANTS.length);
    const first = award(initialRewardState(), plantThreshold(1), true);
    expect(first.newPlants).toEqual([0, 1]);
  });

  it('buying spends stars, adds the item and puts it on', () => {
    let s = award(initialRewardState(), 10, true).state;
    const r = buy(s, 'hat:cap');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    expect(balance(s)).toBe(5);
    expect(s.owned).toContain('hat:cap');
    expect(s.equipped.hat).toBe('hat:cap');
    // Earned stars are never reduced by spending.
    expect(s.starsEarned).toBe(10);
  });

  it('cannot buy what you cannot afford, already own, or that does not exist', () => {
    const s = award(initialRewardState(), 3, true).state;
    const poor = buy(s, 'hat:crown');
    expect(poor).toMatchObject({ ok: false, reason: 'not-enough', missing: 31 });
    expect(buy(s, 'skin:classic')).toMatchObject({ ok: false, reason: 'owned' });
    expect(buy(s, 'hat:nope')).toMatchObject({ ok: false, reason: 'unknown' });
  });

  it('tapping a worn hat takes it off; skins swap but are never removed', () => {
    let s = award(initialRewardState(), 100, true).state;
    for (const id of ['hat:cap', 'hat:bow', 'skin:bee']) {
      const r = buy(s, id);
      if (r.ok) s = r.state;
    }
    expect(s.equipped.hat).toBe('hat:bow');
    s = equip(s, 'hat:bow');
    expect(s.equipped.hat).toBeNull();
    s = equip(s, 'hat:cap');
    expect(s.equipped.hat).toBe('hat:cap');
    s = equip(s, 'skin:bee');
    expect(s.equipped.skin).toBe('skin:bee');
    s = equip(s, 'skin:classic');
    expect(s.equipped.skin).toBe('skin:classic');
    // Not owned: no change.
    expect(equip(s, 'hat:crown')).toBe(s);
  });

  it('knows what can be bought now and what to save up for next', () => {
    const s = award(initialRewardState(), 9, true).state;
    expect(affordableItems(s)).toEqual(['hat:cap', 'face:shades']);
    expect(nextGoal(s)).toEqual({ itemId: 'hat:cap', missing: 0 });
    const prices = WARDROBE.map((i) => i.price);
    expect(Math.min(...prices.filter((p) => p > 0))).toBeLessThanOrEqual(6); // something on the first visit
  });

  it('survives corrupt saved data', () => {
    const s = sanitizeRewardState({
      starsEarned: 20,
      starsSpent: 999,
      gardenStars: 'lots',
      owned: ['hat:cap', 'hat:bogus', 7],
      equipped: { hat: 'hat:crown', face: 'hat:cap', skin: 'skin:nope' },
    });
    expect(balance(s)).toBe(0); // spent capped at earned
    expect(s.gardenStars).toBe(0);
    expect([...s.owned].sort()).toEqual(['hat:cap', 'skin:classic']);
    expect(s.equipped).toEqual({ hat: null, face: null, skin: 'skin:classic' });
    expect(sanitizeRewardState(null)).toEqual(initialRewardState());
  });
});
