import { backupFileName, createBackup, mergeBackup, parseBackup, type MergeResult } from '../../storage/backup';
import type { SaveStatus, StorageManager } from '../../storage/StorageManager';
import { MAX_PROFILES } from './ProfileService';

/** What to tell a grown-up when progress isn't being saved (null when all is well). */
export function saveWarning(status: SaveStatus): string | null {
  switch (status) {
    case 'ok':
      return null;
    case 'memory-only':
      return '⚠️ This browser isn’t saving progress (private browsing?). It will be lost when the page is closed – use a normal window, or save a backup.';
    case 'write-failed':
      return '⚠️ The last save didn’t work (storage may be full). Progress is safe until the page is closed – save a backup now.';
  }
}

/** Keeping progress safe: whether it is being saved, backup files, and loading them back. */
export class BackupService {
  constructor(private readonly storage: StorageManager) {}

  get status(): SaveStatus {
    return this.storage.status;
  }

  /** The backup file's name and contents, with everything up to date. */
  createFile(now = new Date()): { name: string; text: string } {
    this.storage.flush();
    return { name: backupFileName(now), text: JSON.stringify(createBackup(this.storage.data, now.getTime())) };
  }

  /** Loads a backup's players (never losing newer progress). Null if it isn't a backup file. */
  load(text: string): MergeResult | null {
    const profiles = parseBackup(text);
    if (!profiles) return null;
    let result: MergeResult | null = null;
    this.storage.update((d) => (result = mergeBackup(d, profiles, MAX_PROFILES)), true);
    return result;
  }
}
