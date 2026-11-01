import { backupFileName, createBackup, mergeBackup, parseBackup, type MergeResult } from '../../storage/backup';
import type { StorageManager } from '../../storage/StorageManager';
import { MAX_PROFILES } from './ProfileService';

/** Saving every player to a backup file, and bringing a backup's players back in. */
export class BackupService {
  constructor(private readonly storage: StorageManager) {}

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
