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

export interface Settings {
  muted: boolean;
  touchControls: TouchControlsPreference;
  lastPlayUnit: string | null;
  lastLearnUnit: string | null;
  lastSubject: string | null;
  /** Speed level index (validated by the game). */
  speed: number | null;
  walls: 'wrap' | 'solid' | null;
  answerCount: number | null;
}

export interface SaveData {
  version: 1;
  settings: Settings;
  highScores: Record<string, number>;
  bestStreaks: Record<string, number>;
  /** Times each world has been entered. */
  worldVisits: Record<string, number>;
  /** Opaque to storage; the learning module validates its own snapshot. */
  learning: unknown;
}

export const SAVE_KEY = 'snack-snake.save.v1';

export function defaultSaveData(): SaveData {
  return {
    version: 1,
    settings: {
      muted: false,
      touchControls: 'auto',
      lastPlayUnit: null,
      lastLearnUnit: null,
      lastSubject: null,
      speed: null,
      walls: null,
      answerCount: null,
    },
    highScores: {},
    bestStreaks: {},
    worldVisits: {},
    learning: null,
  };
}

function numberRecord(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

/** Tolerant parser: anything missing or malformed falls back to defaults instead of crashing. */
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
  if (src.version !== 1) return data;

  const s = (src.settings ?? {}) as Record<string, unknown>;
  data.settings = {
    muted: typeof s.muted === 'boolean' ? s.muted : false,
    touchControls: s.touchControls === 'on' || s.touchControls === 'off' ? s.touchControls : 'auto',
    lastPlayUnit: typeof s.lastPlayUnit === 'string' ? s.lastPlayUnit : null,
    lastLearnUnit: typeof s.lastLearnUnit === 'string' ? s.lastLearnUnit : null,
    lastSubject: typeof s.lastSubject === 'string' ? s.lastSubject : null,
    speed: typeof s.speed === 'number' && Number.isFinite(s.speed) ? s.speed : null,
    walls: s.walls === 'wrap' || s.walls === 'solid' ? s.walls : null,
    answerCount: typeof s.answerCount === 'number' && Number.isFinite(s.answerCount) ? s.answerCount : null,
  };
  data.highScores = numberRecord(src.highScores);
  data.bestStreaks = numberRecord(src.bestStreaks);
  data.worldVisits = numberRecord(src.worldVisits);
  data.learning = src.learning ?? null;
  return data;
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

  update(mutate: (data: SaveData) => void, immediate = false): void {
    mutate(this.current);
    if (immediate) this.flush();
    else this.scheduleSave();
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
