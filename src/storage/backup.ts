import { mergeProfiles } from './mergeProfiles';
import type { ProfileData, SaveData } from './StorageManager';
import { fromSyncRecord, toSyncRecord, type ProfileSyncRecord } from './profileSync';

/**
 * A backup file a grown-up can save and load again, e.g. to move to another device or to keep
 * progress safe before clearing the browser. Each player is stored as a ProfileSyncRecord, the
 * same shape a future cloud save would use.
 */
export const BACKUP_APP = 'snack-snake';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  readonly app: typeof BACKUP_APP;
  readonly backup: typeof BACKUP_VERSION;
  readonly savedAt: number;
  readonly profiles: readonly ProfileSyncRecord[];
}

export function createBackup(data: Readonly<SaveData>, now = Date.now()): BackupFile {
  return { app: BACKUP_APP, backup: BACKUP_VERSION, savedAt: now, profiles: data.profiles.map(toSyncRecord) };
}

/** e.g. "snack-snake-backup-2026-10-30.json" */
export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `snack-snake-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/** The players in a backup file, or null if it isn't a Snack Snake backup. */
export function parseBackup(text: string): ProfileData[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  if (src.app !== BACKUP_APP || src.backup !== BACKUP_VERSION || !Array.isArray(src.profiles)) return null;
  const profiles: ProfileData[] = [];
  for (const record of src.profiles) {
    const profile = fromSyncRecord(record);
    if (profile && !profiles.some((p) => p.id === profile.id)) profiles.push(profile);
  }
  return profiles.length > 0 ? profiles : null;
}

export interface MergeResult {
  /** Players who weren't on this device yet. */
  readonly added: readonly string[];
  /** Players whose backup was newer than what this device had. */
  readonly updated: readonly string[];
  /** Players already up to date here (this device's copy was the same or newer). */
  readonly unchanged: readonly string[];
  /** Players left out because the device already has the most players allowed. */
  readonly skipped: readonly string[];
}

/**
 * Brings a backup's players into the save. Loading a backup never loses progress: a player who
 * is already here is combined with the backup's copy (see mergeProfiles), so a child who played
 * on both devices keeps everything from each. An unused, unnamed starter player (a fresh device)
 * is replaced by the backup instead of taking up a place.
 *
 * Ids alone don't prove two copies are the same child (every device's first player is "p1"), so
 * a copy only counts as the same player when its id and creation time match (and, for the
 * starter player, whose creation time is the same everywhere, its name too). Anything else is
 * added as a new player: a duplicate can be deleted, lost progress can't be got back.
 */
export function mergeBackup(data: SaveData, incoming: readonly ProfileData[], maxProfiles: number): MergeResult {
  const added: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];
  const skipped: string[] = [];
  const label = (p: ProfileData) => p.name || 'Player';

  if (incoming.length > 0 && data.profiles.length === 1 && isUntouched(data.profiles[0]) && !incoming.some((p) => samePlayer(p, data.profiles[0]))) {
    data.profiles = [];
  }
  for (const original of incoming) {
    const i = data.profiles.findIndex((p) => samePlayer(p, original));
    const taken = i === -1 && data.profiles.some((p) => p.id === original.id);
    const profile = taken ? { ...original, id: freshId(data.profiles, original.id) } : original;
    if (i !== -1) {
      const merged = mergeProfiles(data.profiles[i], profile);
      if (JSON.stringify(merged) !== JSON.stringify(data.profiles[i])) {
        data.profiles[i] = merged;
        updated.push(label(merged));
      } else {
        unchanged.push(label(merged));
      }
    } else if (data.profiles.length < maxProfiles) {
      data.profiles.push(profile);
      added.push(label(profile));
    } else {
      skipped.push(label(profile));
    }
  }
  if (!data.profiles.some((p) => p.id === data.activeProfileId)) data.activeProfileId = data.profiles[0].id;
  return { added, updated, unchanged, skipped };
}

function samePlayer(a: ProfileData, b: ProfileData): boolean {
  // A real creation time is unique enough to recognise a child who has been renamed since.
  return a.id === b.id && a.createdAt === b.createdAt && (a.createdAt !== 0 || a.name === b.name);
}

function freshId(existing: readonly ProfileData[], base: string): string {
  let n = 2;
  while (existing.some((p) => p.id === `${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** The starter player of a brand-new device: no name and nothing played. */
function isUntouched(p: ProfileData): boolean {
  return !p.name && p.learning === null && p.rewards === null && Object.keys(p.worldVisits).length === 0 && Object.keys(p.highScores).length === 0;
}
