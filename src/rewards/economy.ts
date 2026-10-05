import { DEFAULT_SKIN_ID, GARDEN_PLANTS, WARDROBE, wardrobeItem, type WardrobeSlot } from './catalog';

/**
 * The child's rewards. Stars are earned for effort and progress and are never taken away;
 * spending them on Sid's wardrobe is the only way the balance goes down.
 */
export interface RewardState {
  readonly starsEarned: number;
  readonly starsSpent: number;
  /** Stars earned inside the Number Garden; these make the garden grow. */
  readonly gardenStars: number;
  readonly owned: readonly string[];
  readonly equipped: Readonly<Record<WardrobeSlot, string | null>>;
}

/** How many stars things are worth. Answering after a mistake still counts: effort is rewarded. */
export const STAR_RULES = {
  questionCompleted: 1,
  newFactMet: 1,
  factMastered: 3,
} as const;

export function initialRewardState(): RewardState {
  return {
    starsEarned: 0,
    starsSpent: 0,
    gardenStars: 0,
    owned: [DEFAULT_SKIN_ID],
    equipped: { hat: null, face: null, skin: DEFAULT_SKIN_ID },
  };
}

export function balance(state: RewardState): number {
  return state.starsEarned - state.starsSpent;
}

/** Garden stars needed for the i-th plant: quick at first, then gradually spacing out. */
export function plantThreshold(index: number): number {
  return 3 + 4 * index + Math.floor((index * index) / 2);
}

export function plantsUnlocked(gardenStars: number): number {
  let n = 0;
  while (n < GARDEN_PLANTS.length && gardenStars >= plantThreshold(n)) n++;
  return n;
}

export interface AwardResult {
  readonly state: RewardState;
  /** Indices into GARDEN_PLANTS that just appeared. */
  readonly newPlants: readonly number[];
}

export function award(state: RewardState, stars: number, inGarden: boolean): AwardResult {
  if (stars <= 0) return { state, newPlants: [] };
  const before = plantsUnlocked(state.gardenStars);
  const next: RewardState = {
    ...state,
    starsEarned: state.starsEarned + stars,
    gardenStars: state.gardenStars + (inGarden ? stars : 0),
  };
  const after = plantsUnlocked(next.gardenStars);
  return { state: next, newPlants: Array.from({ length: after - before }, (_, i) => before + i) };
}

export type BuyResult =
  | { readonly ok: true; readonly state: RewardState }
  | { readonly ok: false; readonly reason: 'unknown' | 'owned' | 'not-enough'; readonly missing: number };

export function buy(state: RewardState, itemId: string): BuyResult {
  const item = wardrobeItem(itemId);
  if (!item) return { ok: false, reason: 'unknown', missing: 0 };
  if (state.owned.includes(itemId)) return { ok: false, reason: 'owned', missing: 0 };
  const missing = item.price - balance(state);
  if (missing > 0) return { ok: false, reason: 'not-enough', missing };
  const bought: RewardState = { ...state, starsSpent: state.starsSpent + item.price, owned: [...state.owned, itemId] };
  return { ok: true, state: equip(bought, itemId) };
}

/** Puts an owned item on. Tapping a worn hat or glasses takes it off; a skin can only be swapped. */
export function equip(state: RewardState, itemId: string): RewardState {
  const item = wardrobeItem(itemId);
  if (!item || !state.owned.includes(itemId)) return state;
  const current = state.equipped[item.slot];
  const value = current === itemId && item.slot !== 'skin' ? null : itemId;
  return { ...state, equipped: { ...state.equipped, [item.slot]: value } };
}

/** Items the child could buy right now but doesn't own yet. */
export function affordableItems(state: RewardState): string[] {
  return WARDROBE.filter((i) => !state.owned.includes(i.id) && i.price <= balance(state)).map((i) => i.id);
}

/** The cheapest thing still to save up for, if any. */
export function nextGoal(state: RewardState): { itemId: string; missing: number } | null {
  const goals = WARDROBE.filter((i) => !state.owned.includes(i.id)).sort((a, b) => a.price - b.price);
  const goal = goals[0];
  return goal ? { itemId: goal.id, missing: Math.max(0, goal.price - balance(state)) } : null;
}

/** Rebuilds reward state from untrusted saved data. */
export function sanitizeRewardState(raw: unknown): RewardState {
  const base = initialRewardState();
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Record<string, unknown>;
  const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const owned = new Set<string>([DEFAULT_SKIN_ID]);
  if (Array.isArray(src.owned)) for (const id of src.owned) if (typeof id === 'string' && wardrobeItem(id)) owned.add(id);
  const starsEarned = count(src.starsEarned);
  const starsSpent = Math.min(count(src.starsSpent), starsEarned);
  const eq = (src.equipped ?? {}) as Record<string, unknown>;
  const pick = (slot: WardrobeSlot): string | null => {
    const id = eq[slot];
    return typeof id === 'string' && owned.has(id) && wardrobeItem(id)?.slot === slot ? id : null;
  };
  return {
    starsEarned,
    starsSpent,
    gardenStars: count(src.gardenStars),
    owned: [...owned],
    equipped: { hat: pick('hat'), face: pick('face'), skin: pick('skin') ?? DEFAULT_SKIN_ID },
  };
}
