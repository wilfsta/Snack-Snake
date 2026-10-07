import { parseProfile, type ProfileData, type ProfileSettings } from './StorageManager';

/**
 * The shape a player profile would take when synchronised with a future backend/cloud account.
 * Nothing uses a server yet; this simply fixes the boundary so local profiles can later be
 * uploaded/downloaded without touching the learning system.
 *
 *  - `game`: ordinary game progress (settings, scores, world visits, onboarding, rewards/outfits)
 *  - `learning`: the learning engine's own snapshot (mastery per fact, accuracy, response times,
 *    placement and provisional skills). Opaque here; the learning module validates it.
 *  - `updatedAt`: lets a sync service keep the newest copy or detect conflicts.
 */
export const SYNC_SCHEMA_VERSION = 1;

export interface ProfileSyncRecord {
  readonly schema: typeof SYNC_SCHEMA_VERSION;
  readonly id: string;
  readonly name: string;
  readonly avatar: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly game: {
    readonly settings: ProfileSettings;
    readonly highScores: Readonly<Record<string, number>>;
    readonly bestStreaks: Readonly<Record<string, number>>;
    readonly worldVisits: Readonly<Record<string, number>>;
    readonly onboarded: readonly string[];
    readonly rewards: unknown;
  };
  readonly learning: unknown;
}

export function toSyncRecord(p: ProfileData): ProfileSyncRecord {
  return {
    schema: SYNC_SCHEMA_VERSION,
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    game: {
      settings: { ...p.settings },
      highScores: { ...p.highScores },
      bestStreaks: { ...p.bestStreaks },
      worldVisits: { ...p.worldVisits },
      onboarded: [...p.onboarded],
      rewards: p.rewards,
    },
    learning: p.learning,
  };
}

/** Rebuilds a local profile from a sync record (validated field by field). Null if unusable. */
export function fromSyncRecord(raw: unknown): ProfileData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.schema !== SYNC_SCHEMA_VERSION || typeof r.id !== 'string' || !r.id) return null;
  const game = (r.game && typeof r.game === 'object' ? r.game : {}) as Record<string, unknown>;
  return parseProfile({ ...game, id: r.id, name: r.name, avatar: r.avatar, createdAt: r.createdAt, updatedAt: r.updatedAt, learning: r.learning }, r.id);
}
