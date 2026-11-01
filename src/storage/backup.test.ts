import { describe, expect, it } from 'vitest';
import { LearningTracker } from '../learning/LearningTracker';
import { backupFileName, createBackup, mergeBackup, parseBackup } from './backup';
import { defaultSaveData, newProfile, type ProfileData, type SaveData } from './StorageManager';

function player(id: string, name: string, updatedAt: number, createdAt = 1000): ProfileData {
  return { ...newProfile(id, name, '🐼', createdAt), updatedAt };
}

function save(...profiles: ProfileData[]): SaveData {
  return { ...defaultSaveData(), activeProfileId: profiles[0].id, profiles };
}

/** A backup of these players, read back as a device loading it would. */
function roundTrip(...profiles: ProfileData[]): ProfileData[] {
  const parsed = parseBackup(JSON.stringify(createBackup(save(...profiles))));
  if (!parsed) throw new Error('backup did not parse');
  return parsed;
}

describe('backup files', () => {
  it('round-trips every player, including learning, scores and an unfinished visit', () => {
    const tracker = new LearningTracker();
    tracker.markIntroduced('add:2+3');
    const ada = {
      ...player('p1', 'Ada', 5000),
      highScores: { 'play:mul:table:2': 40 },
      learning: tracker.snapshot(),
      visit: { worldId: 'garden', done: 4, stars: 6, newPlants: 1, at: 4900 },
    };
    const [back, bo] = roundTrip(ada, player('p2', 'Bo', 6000));
    expect(back).toEqual(ada);
    expect(bo.name).toBe('Bo');
  });

  it('rejects files that are not Snack Snake backups', () => {
    expect(parseBackup('not json')).toBeNull();
    expect(parseBackup('{"app":"other","backup":1,"profiles":[]}')).toBeNull();
    expect(parseBackup(JSON.stringify({ ...createBackup(save(player('p1', 'A', 1))), backup: 99 }))).toBeNull();
    expect(parseBackup('{"app":"snack-snake","backup":1,"profiles":[]}')).toBeNull();
  });

  it('names the file after the day it was saved', () => {
    expect(backupFileName(new Date(2026, 9, 3))).toBe('snack-snake-backup-2026-10-03.json');
  });
});

describe('loading a backup', () => {
  it('replaces the unused starter player on a fresh device', () => {
    const data = defaultSaveData();
    const result = mergeBackup(data, roundTrip(player('p1', 'Ada', 5000), player('p2', 'Bo', 6000)), 6);
    expect(data.profiles.map((p) => p.name)).toEqual(['Ada', 'Bo']);
    expect(result.added).toEqual(['Ada', 'Bo']);
    expect(data.activeProfileId).toBe('p1');
  });

  it('never replaces progress with an older copy', () => {
    const data = save(player('p1', 'Ada', 9000));
    const result = mergeBackup(data, roundTrip(player('p1', 'Ada', 5000)), 6);
    expect(data.profiles[0].updatedAt).toBe(9000);
    expect(result.unchanged).toEqual(['Ada']);
  });

  it('updates a player when the backup is newer', () => {
    const data = save(player('p1', 'Ada', 5000));
    const result = mergeBackup(data, roundTrip({ ...player('p1', 'Ada', 9000), highScores: { x: 3 } }), 6);
    expect(data.profiles[0].highScores).toEqual({ x: 3 });
    expect(result.updated).toEqual(['Ada']);
  });

  it("doesn't mix up two different children who happen to share an id", () => {
    // Both devices called their first player "p1".
    const data = save(player('p1', 'Bo', 5000, 0));
    const result = mergeBackup(data, roundTrip(player('p1', 'Ada', 9000, 0)), 6);
    expect(data.profiles.map((p) => p.name)).toEqual(['Bo', 'Ada']);
    expect(new Set(data.profiles.map((p) => p.id)).size).toBe(2);
    expect(result.added).toEqual(['Ada']);
  });

  it('leaves out players beyond the limit and says so', () => {
    const data = save(player('a', 'A', 1), player('b', 'B', 1));
    const result = mergeBackup(data, roundTrip(player('c', 'C', 1), player('d', 'D', 1)), 3);
    expect(data.profiles.map((p) => p.name)).toEqual(['A', 'B', 'C']);
    expect(result.skipped).toEqual(['D']);
  });
});
