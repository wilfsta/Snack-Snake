import { composeSkin, type SnakeSkin } from '../../render/skins';
import { GARDEN_PLANTS } from '../../rewards/catalog';
import {
  affordableItems,
  award,
  balance,
  buy,
  equip,
  nextGoal,
  plantsUnlocked,
  plantThreshold,
  sanitizeRewardState,
  type BuyResult,
  type RewardState,
} from '../../rewards/economy';
import type { StorageManager } from '../../storage/StorageManager';

/** Stars, the growing garden and Sid's wardrobe, persisted with the rest of the save data. */
export class RewardService {
  private current: RewardState;

  constructor(private readonly storage: StorageManager) {
    this.current = sanitizeRewardState(storage.profile.rewards);
  }

  /** Loads the active player's stars and wardrobe (after switching player). */
  reload(): void {
    this.current = sanitizeRewardState(this.storage.profile.rewards);
  }

  get state(): RewardState {
    return this.current;
  }

  get balance(): number {
    return balance(this.current);
  }

  /** Adds stars. Returns the emoji of any garden plants that just grew. */
  award(stars: number, inGarden: boolean): string[] {
    const result = award(this.current, stars, inGarden);
    this.set(result.state);
    return result.newPlants.map((i) => GARDEN_PLANTS[i]);
  }

  buy(itemId: string): BuyResult {
    const result = buy(this.current, itemId);
    if (result.ok) this.set(result.state, true);
    return result;
  }

  equip(itemId: string): void {
    this.set(equip(this.current, itemId), true);
  }

  /** Everything growing in the garden so far. */
  gardenPlants(): string[] {
    return GARDEN_PLANTS.slice(0, plantsUnlocked(this.current.gardenStars));
  }

  /** 0..1 how full the garden is (used to decorate the arena). */
  get gardenGrowth(): number {
    return plantsUnlocked(this.current.gardenStars) / GARDEN_PLANTS.length;
  }

  /** Garden stars still needed before the next plant appears, or null when it's all grown. */
  starsToNextPlant(): number | null {
    const n = plantsUnlocked(this.current.gardenStars);
    return n >= GARDEN_PLANTS.length ? null : plantThreshold(n) - this.current.gardenStars;
  }

  affordable(): string[] {
    return affordableItems(this.current);
  }

  nextGoal(): { itemId: string; missing: number } | null {
    return nextGoal(this.current);
  }

  /** Sid as currently dressed. */
  skin(): SnakeSkin {
    const e = this.current.equipped;
    return composeSkin(e.skin ?? 'skin:classic', e.hat, e.face);
  }

  private set(state: RewardState, immediate = false): void {
    this.current = state;
    this.storage.updateProfile((p) => (p.rewards = state), immediate);
  }
}
