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

  it('keeps what a child did on both devices after they went separate ways', () => {
    const tablet = new LearningTracker();
    tablet.markIntroduced('add:2+3');
    const phone = new LearningTracker();
    phone.markIntroduced('add:4+4');
    const here = {
      ...player('p1', 'Ada', 5000),
      highScores: { a: 50, b: 10 },
      activity: { '2026-11-01': { questions: 8, firstTry: 6, ms: 60000 } },
      learning: tablet.snapshot(),
      rewards: { starsEarned: 20, starsSpent: 5, gardenStars: 20, owned: ['skin:classic', 'hat:cap'], equipped: { hat: 'hat:cap', face: null, skin: 'skin:classic' }, milestones: ['g1'] },
    };
    const there = {
      ...player('p1', 'Ada', 9000),
      highScores: { a: 30, b: 40 },
      activity: { '2026-11-02': { questions: 4, firstTry: 4, ms: 30000 } },
      learning: phone.snapshot(),
      rewards: { starsEarned: 25, starsSpent: 0, gardenStars: 25, owned: ['skin:classic'], equipped: { hat: null, face: null, skin: 'skin:classic' }, milestones: ['g2'] },
    };
    const data = save(here);
    const result = mergeBackup(data, roundTrip(there), 6);
    const ada = data.profiles[0];
    expect(result.updated).toEqual(['Ada']);
    expect(ada.highScores).toEqual({ a: 50, b: 40 });
    expect(Object.keys(ada.activity).sort()).toEqual(['2026-11-01', '2026-11-02']);
    const records = (ada.learning as { records: Record<string, unknown> }).records;
    expect(Object.keys(records).sort()).toEqual(['add:2+3', 'add:4+4']);
    const rewards = ada.rewards as { starsEarned: number; owned: string[]; milestones: string[] };
    expect(rewards.starsEarned).toBe(25);
    expect(rewards.owned).toContain('hat:cap');
    expect(rewards.milestones.sort()).toEqual(['g1', 'g2']);
    expect(ada.updatedAt).toBe(9000);
  });

  it('for each fact, keeps the copy that has seen it more often', () => {
    const more = new LearningTracker();
    more.markIntroduced('add:2+3');
    more.markPresented('add:2+3');
    more.markPresented('add:2+3');
    const less = new LearningTracker();
    less.markIntroduced('add:2+3');
    const seen = (p: ProfileData) => (p.learning as { records: Record<string, { timesPresented: number }> }).records['add:2+3'].timesPresented;
    const data = save({ ...player('p1', 'Ada', 5000), learning: more.snapshot() });
    mergeBackup(data, roundTrip({ ...player('p1', 'Ada', 9000), learning: less.snapshot() }), 6);
    expect(seen(data.profiles[0])).toBe(more.snapshot().records['add:2+3'].timesPresented);
    expect(seen(data.profiles[0])).toBeGreaterThan(less.snapshot().records['add:2+3'].timesPresented);
  });

  it('recognises a child who was renamed on one device', () => {
    const data = save(player('p2', 'Bo', 5000, 1_700_000_000_000));
    const result = mergeBackup(data, roundTrip(player('p2', 'Bobby', 9000, 1_700_000_000_000)), 6);
    expect(data.profiles.map((p) => p.name)).toEqual(['Bobby']);
    expect(result.updated).toEqual(['Bobby']);
  });

  it('leaves out players beyond the limit and says so', () => {
    const data = save(player('a', 'A', 1), player('b', 'B', 1));
    const result = mergeBackup(data, roundTrip(player('c', 'C', 1), player('d', 'D', 1)), 3);
    expect(data.profiles.map((p) => p.name)).toEqual(['A', 'B', 'C']);
    expect(result.skipped).toEqual(['D']);
  });
});
