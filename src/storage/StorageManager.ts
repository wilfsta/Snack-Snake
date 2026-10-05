/** Minimal key/value interface so localStorage can later be swapped for accounts/cloud saves. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/** localStorage when it actually works (private browsing can throw), otherwise in-memory. */
export function createBestAvailableStore(): KeyValueStore {
  try {
    const probe = '__snack_snake_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return new MemoryStore();
  }
}

export type TouchControlsPreference = 'auto' | 'on' | 'off';

/** Settings that belong to the device, not to a child. */
export interface DeviceSettings {
  muted: boolean;
  touchControls: TouchControlsPreference;
}

/** Settings each child keeps for themselves. */
export interface ProfileSettings {
  lastPlayUnit: string | null;
  lastLearnUnit: string | null;
  lastSubject: string | null;
  /** Speed level index (validated by the game). */
  speed: number | null;
  walls: 'wrap' | 'solid' | null;
  answerCount: number | null;
}

/** Everything that belongs to one player. */
export interface ProfileData {
  id: string;
  name: string;
  avatar: string;
  createdAt: number;
  settings: ProfileSettings;
  highScores: Record<string, number>;
  bestStreaks: Record<string, number>;
  /** Times each world has been entered. */
  worldVisits: Record<string, number>;
  /** Opaque to storage; the rewards module validates its own state (stars, wardrobe). */
  rewards: unknown;
  /** Opaque to storage; the learning module validates its own snapshot. */
  learning: unknown;
}

export interface SaveData {
  version: 2;
  device: DeviceSettings;
  activeProfileId: string;
  profiles: ProfileData[];
}

export const SAVE_KEY = 'snack-snake.save.v1';
export const DEFAULT_AVATAR = '🦊';
export const MAX_NAME_LENGTH = 12;

export function defaultProfileSettings(): ProfileSettings {
  return { lastPlayUnit: null, lastLearnUnit: null, lastSubject: null, speed: null, walls: null, answerCount: null };
}

export function newProfile(id: string, name: string, avatar: string, createdAt = Date.now()): ProfileData {
  return {
    id,
    name: name.trim().slice(0, MAX_NAME_LENGTH),
    avatar,
    createdAt,
    settings: defaultProfileSettings(),
    highScores: {},
    bestStreaks: {},
    worldVisits: {},
    rewards: null,
    learning: null,
  };
}

export function defaultSaveData(): SaveData {
  const first = newProfile('p1', '', DEFAULT_AVATAR, 0);
  return { version: 2, device: { muted: false, touchControls: 'auto' }, activeProfileId: first.id, profiles: [first] };
}

function numberRecord(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

function parseProfileSettings(raw: unknown): ProfileSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    lastPlayUnit: typeof s.lastPlayUnit === 'string' ? s.lastPlayUnit : null,
    lastLearnUnit: typeof s.lastLearnUnit === 'string' ? s.lastLearnUnit : null,
    lastSubject: typeof s.lastSubject === 'string' ? s.lastSubject : null,
    speed: typeof s.speed === 'number' && Number.isFinite(s.speed) ? s.speed : null,
    walls: s.walls === 'wrap' || s.walls === 'solid' ? s.walls : null,
    answerCount: typeof s.answerCount === 'number' && Number.isFinite(s.answerCount) ? s.answerCount : null,
  };
}

function parseDevice(raw: unknown): DeviceSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    muted: typeof s.muted === 'boolean' ? s.muted : false,
    touchControls: s.touchControls === 'on' || s.touchControls === 'off' ? s.touchControls : 'auto',
  };
}

/** Builds a profile from saved data; `fallbackId` is used when the id is missing or a duplicate. */
function parseProfile(raw: Record<string, unknown>, fallbackId: string): ProfileData {
  const id = typeof raw.id === 'string' && raw.id ? raw.id : fallbackId;
  const name = typeof raw.name === 'string' ? raw.name : '';
  const avatar = typeof raw.avatar === 'string' && raw.avatar ? raw.avatar : DEFAULT_AVATAR;
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : 0;
  return {
    ...newProfile(id, name, avatar, createdAt),
    settings: parseProfileSettings(raw.settings),
    highScores: numberRecord(raw.highScores),
    bestStreaks: numberRecord(raw.bestStreaks),
    worldVisits: numberRecord(raw.worldVisits),
    rewards: raw.rewards ?? null,
    learning: raw.learning ?? null,
  };
}

/**
 * Tolerant parser: anything missing or malformed falls back to defaults instead of crashing.
 * Version 1 saves (from before profiles) become the first player's profile, so no progress is lost.
 */
export function parseSaveData(json: string | null): SaveData {
  const data = defaultSaveData();
  if (!json) return data;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return data;
  }
  if (!raw || typeof raw !== 'object') return data;
  const src = raw as Record<string, unknown>;

  if (src.version === 1) {
    const legacy = (src.settings ?? {}) as Record<string, unknown>;
    return {
      version: 2,
      device: parseDevice(legacy),
      activeProfileId: 'p1',
      profiles: [parseProfile({ ...src, id: 'p1', name: '', avatar: DEFAULT_AVATAR, settings: legacy }, 'p1')],
    };
  }
  if (src.version !== 2) return data;

  const profiles: ProfileData[] = [];
  if (Array.isArray(src.profiles)) {
    src.profiles.forEach((p, i) => {
      if (!p || typeof p !== 'object') return;
      let profile = parseProfile(p as Record<string, unknown>, `p${i + 1}`);
      if (profiles.some((existing) => existing.id === profile.id)) profile = { ...profile, id: `p${Date.now()}${i}` };
      profiles.push(profile);
    });
  }
  if (profiles.length === 0) profiles.push(data.profiles[0]);
  const active = typeof src.activeProfileId === 'string' && profiles.some((p) => p.id === src.activeProfileId) ? src.activeProfileId : profiles[0].id;
  return { version: 2, device: parseDevice(src.device), activeProfileId: active, profiles };
}

/**
 * Holds the save data in memory and writes it out (debounced) through a KeyValueStore.
 */
export class StorageManager {
  private current: SaveData;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly store: KeyValueStore,
    private readonly key = SAVE_KEY,
  ) {
    let json: string | null = null;
    try {
      json = store.getItem(key);
    } catch {
      json = null;
    }
    this.current = parseSaveData(json);
  }

  get data(): Readonly<SaveData> {
    return this.current;
  }

  /** The player whose turn it is. */
  get profile(): Readonly<ProfileData> {
    return this.current.profiles.find((p) => p.id === this.current.activeProfileId) ?? this.current.profiles[0];
  }

  update(mutate: (data: SaveData) => void, immediate = false): void {
    mutate(this.current);
    if (immediate) this.flush();
    else this.scheduleSave();
  }

  /** Changes the active player's data. */
  updateProfile(mutate: (profile: ProfileData) => void, immediate = false): void {
    this.update((d) => {
      const profile = d.profiles.find((p) => p.id === d.activeProfileId) ?? d.profiles[0];
      mutate(profile);
    }, immediate);
  }

  scheduleSave(delayMs = 400): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.write();
    }, delayMs);
  }

  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.write();
  }

  private write(): void {
    try {
      this.store.setItem(this.key, JSON.stringify(this.current));
    } catch {
      // Storage full or unavailable: keep playing; progress stays in memory for this visit.
    }
  }
}
