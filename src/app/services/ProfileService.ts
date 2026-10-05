import { balance, sanitizeRewardState } from '../../rewards/economy';
import { MAX_NAME_LENGTH, newProfile, type StorageManager } from '../../storage/StorageManager';

/** Picture choices for a player. Animals, so even non-readers can find their own. */
export const AVATARS: readonly string[] = ['🦊', '🐼', '🐸', '🐯', '🐵', '🦄', '🐙', '🐶', '🐱', '🐰', '🦁', '🐨'];
export const MAX_PROFILES = 6;

export interface ProfileSummary {
  readonly id: string;
  /** Display name: the given name, or "Player N" if none was typed. */
  readonly name: string;
  readonly avatar: string;
  readonly stars: number;
  readonly active: boolean;
}

/** Creates, edits, removes and switches between players. */
export class ProfileService {
  constructor(private readonly storage: StorageManager) {}

  get activeId(): string {
    return this.storage.profile.id;
  }

  get count(): number {
    return this.storage.data.profiles.length;
  }

  get canAdd(): boolean {
    return this.count < MAX_PROFILES;
  }

  list(): ProfileSummary[] {
    const active = this.activeId;
    return this.storage.data.profiles.map((p, i) => ({
      id: p.id,
      name: p.name || `Player ${i + 1}`,
      avatar: p.avatar,
      stars: balance(sanitizeRewardState(p.rewards)),
      active: p.id === active,
    }));
  }

  get(id: string): ProfileSummary | undefined {
    return this.list().find((p) => p.id === id);
  }

  /** Raw (possibly empty) name, for editing. */
  rawName(id: string): string {
    return this.storage.data.profiles.find((p) => p.id === id)?.name ?? '';
  }

  /** Adds a player and makes them the active one. Returns their id, or null when full. */
  create(name: string, avatar: string): string | null {
    if (!this.canAdd) return null;
    const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    this.storage.update((d) => {
      d.profiles.push(newProfile(id, name, AVATARS.includes(avatar) ? avatar : AVATARS[0]));
      d.activeProfileId = id;
    }, true);
    return id;
  }

  edit(id: string, name: string, avatar: string): void {
    this.storage.update((d) => {
      const p = d.profiles.find((x) => x.id === id);
      if (!p) return;
      p.name = name.trim().slice(0, MAX_NAME_LENGTH);
      if (AVATARS.includes(avatar)) p.avatar = avatar;
    }, true);
  }

  /** Removes a player and everything they earned. The last remaining player can't be removed. */
  remove(id: string): boolean {
    if (this.count <= 1) return false;
    this.storage.update((d) => {
      d.profiles = d.profiles.filter((p) => p.id !== id);
      if (d.activeProfileId === id) d.activeProfileId = d.profiles[0].id;
    }, true);
    return true;
  }

  switchTo(id: string): boolean {
    if (!this.storage.data.profiles.some((p) => p.id === id)) return false;
    this.storage.flush();
    this.storage.update((d) => (d.activeProfileId = id), true);
    return true;
  }
}
