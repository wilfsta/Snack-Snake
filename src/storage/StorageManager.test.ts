import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileService } from '../app/services/ProfileService';
import { ProgressService } from '../app/services/ProgressService';
import { RewardService } from '../app/services/RewardService';
import { LearningTracker } from '../learning/LearningTracker';
import { fromSyncRecord, toSyncRecord } from './profileSync';
import { MemoryStore, parseSaveData, SAVE_KEY, StorageManager } from './StorageManager';

describe('StorageManager', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('round-trips device settings and the active player\'s data', () => {
    const store = new MemoryStore();
    const tracker = new LearningTracker();
    tracker.markIntroduced('mul:6x4');
    tracker.recordAttempt('mul:6x4', { kind: 'independent', correct: true, firstTry: true, hintStrength: 0 });

    const first = new StorageManager(store);
    first.update((d) => (d.device.muted = true));
    first.updateProfile((p) => {
      p.settings.lastLearnUnit = 'mul:table:6';
      p.highScores['play:mul:table:6'] = 120;
      p.learning = tracker.snapshot();
    });
    // Debounced: nothing written yet, then flushed after the delay.
    expect(store.getItem(SAVE_KEY)).toBeNull();
    vi.advanceTimersByTime(500);
    expect(store.getItem(SAVE_KEY)).not.toBeNull();

    const reloaded = new StorageManager(store);
    expect(reloaded.data.device.muted).toBe(true);
    expect(reloaded.profile.settings.lastLearnUnit).toBe('mul:table:6');
    expect(reloaded.profile.highScores['play:mul:table:6']).toBe(120);
    expect(new LearningTracker(reloaded.profile.learning).get('mul:6x4')).toEqual(tracker.get('mul:6x4'));
  });

  it('flush writes immediately', () => {
    const store = new MemoryStore();
    const storage = new StorageManager(store);
    storage.updateProfile((p) => (p.highScores.x = 5), true);
    expect(JSON.parse(store.getItem(SAVE_KEY)!).profiles[0].highScores.x).toBe(5);
  });

  it('moves a save from before profiles into the first player, losing nothing', () => {
    const v1 = {
      version: 1,
      settings: { muted: true, touchControls: 'on', lastLearnUnit: 'mul:table:7', speed: 1, walls: 'solid', answerCount: 3 },
      highScores: { 'play:mul:table:6': 90 },
      bestStreaks: { 'play:mul:table:6': 4 },
      worldVisits: { garden: 2 },
      rewards: { starsEarned: 12, starsSpent: 5, gardenStars: 12, owned: ['skin:classic', 'hat:cap'] },
      learning: { version: 1, step: 3, records: {}, units: {} },
    };
    const data = parseSaveData(JSON.stringify(v1));
    expect(data.version).toBe(2);
    expect(data.device).toEqual({ muted: true, touchControls: 'on' });
    expect(data.profiles).toHaveLength(1);
    const p = data.profiles[0];
    expect(data.activeProfileId).toBe(p.id);
    expect(p.settings).toMatchObject({ lastLearnUnit: 'mul:table:7', speed: 1, walls: 'solid', answerCount: 3 });
    expect(p.highScores).toEqual({ 'play:mul:table:6': 90 });
    expect(p.worldVisits).toEqual({ garden: 2 });
    expect(p.rewards).toEqual(v1.rewards);
    expect(p.learning).toEqual(v1.learning);
  });

  it('survives corrupt or foreign data', () => {
    expect(parseSaveData('{not json').profiles).toHaveLength(1);
    expect(parseSaveData(JSON.stringify({ version: 99 })).profiles[0].highScores).toEqual({});
    const odd = parseSaveData(
      JSON.stringify({
        version: 2,
        device: { muted: 'yes', touchControls: 'sideways' },
        activeProfileId: 'missing',
        profiles: [{ id: 'a', highScores: { a: -5, b: 10, c: 'x' } }, null, { id: 'a', name: 'Dup' }],
      }),
    );
    expect(odd.device).toEqual({ muted: false, touchControls: 'auto' });
    expect(odd.profiles).toHaveLength(2);
    expect(new Set(odd.profiles.map((p) => p.id)).size).toBe(2); // duplicate ids fixed
    expect(odd.activeProfileId).toBe('a');
    expect(odd.profiles[0].highScores).toEqual({ b: 10 });
    expect(parseSaveData(JSON.stringify({ version: 2, profiles: [] })).profiles).toHaveLength(1);
  });
});

describe('onboarding, sync shape and resuming', () => {
  it('players who had already visited a world are not sent back through the starter apples', () => {
    const v1 = parseSaveData(JSON.stringify({ version: 1, worldVisits: { garden: 2 } }));
    expect(v1.profiles[0].onboarded).toEqual(['garden']);
    const v2 = parseSaveData(JSON.stringify({ version: 2, profiles: [{ id: 'a', worldVisits: { garden: 1 } }, { id: 'b' }] }));
    expect(v2.profiles.map((p) => p.onboarded)).toEqual([['garden'], []]);
  });

  it('onboarding is remembered per player and survives a reload', () => {
    const store = new MemoryStore();
    const storage = new StorageManager(store);
    const profiles = new ProfileService(storage);
    const progress = new ProgressService(storage);
    expect(progress.isOnboarded('garden')).toBe(false);
    progress.markOnboarded('garden');
    expect(progress.isOnboarded('garden')).toBe(true);
    const first = profiles.activeId;
    profiles.create('New', '🐸');
    expect(progress.isOnboarded('garden')).toBe(false); // a new child still gets the apples
    profiles.switchTo(first);
    storage.flush();
    const reopened = new ProgressService(new StorageManager(store));
    expect(reopened.isOnboarded('garden')).toBe(true);
  });

  it('a returning child resumes their learning exactly where they left off', () => {
    const store = new MemoryStore();
    const storage = new StorageManager(store);
    const progress = new ProgressService(storage);
    progress.tracker.recordAttempt('count:3', { kind: 'independent', correct: true, firstTry: true, hintStrength: 0, responseMs: 2500 });
    progress.tracker.setCurriculumState('garden', { assumed: { 'count-to-5': { how: 'probe', since: 1, confirms: 1, doubts: 0 } } });
    storage.flush(); // the game saves when the page is hidden or closed
    const reopened = new ProgressService(new StorageManager(store));
    expect(reopened.tracker.get('count:3')).toMatchObject({ independentCorrect: 1, lastResponseMs: 2500 });
    expect(reopened.tracker.curriculumState('garden').assumed['count-to-5']).toMatchObject({ how: 'probe', confirms: 1 });
  });

  it('every change stamps the player with a last-updated time', () => {
    const storage = new StorageManager(new MemoryStore());
    const before = storage.profile.updatedAt;
    vi.setSystemTime(before + 5000);
    storage.updateProfile((p) => (p.highScores.x = 1));
    expect(storage.profile.updatedAt).toBe(before + 5000);
  });

  it('a profile converts to and from the cloud-sync shape without losing anything', () => {
    const storage = new StorageManager(new MemoryStore());
    storage.updateProfile((p) => {
      p.name = 'Mo';
      p.highScores['play:x'] = 50;
      p.onboarded.push('garden');
      p.rewards = { starsEarned: 9 };
      p.learning = { version: 1, step: 2, records: {}, units: {} };
    });
    const record = toSyncRecord(storage.profile);
    expect(record).toMatchObject({ schema: 1, id: storage.profile.id, name: 'Mo', game: { onboarded: ['garden'] } });
    expect(Object.keys(record.game).sort()).toEqual(['bestStreaks', 'highScores', 'onboarded', 'rewards', 'settings', 'worldVisits']);
    const back = fromSyncRecord(JSON.parse(JSON.stringify(record)));
    expect(back).toEqual(storage.profile);
    expect(fromSyncRecord({ schema: 99, id: 'x' })).toBeNull();
  });
});

describe('player profiles', () => {
  it('each player keeps their own stars, wardrobe, learning and settings', () => {
    const storage = new StorageManager(new MemoryStore());
    const profiles = new ProfileService(storage);
    const rewards = new RewardService(storage);
    const progress = new ProgressService(storage);
    const first = profiles.activeId;

    rewards.award(20, true);
    rewards.buy('hat:cap');
    progress.tracker.markIntroduced('count:1');
    storage.updateProfile((p) => (p.settings.speed = 0));

    const second = profiles.create('Ava', '🐼')!;
    expect(profiles.activeId).toBe(second);
    rewards.reload();
    progress.reload();
    expect(rewards.balance).toBe(0);
    expect(rewards.state.equipped.hat).toBeNull();
    expect(progress.tracker.get('count:1').state).toBe('NEW');
    expect(storage.profile.settings.speed).toBeNull();
    rewards.award(3, true);

    profiles.switchTo(first);
    rewards.reload();
    progress.reload();
    expect(rewards.balance).toBe(15);
    expect(rewards.state.equipped.hat).toBe('hat:cap');
    expect(progress.tracker.get('count:1').introductions).toBe(1);
    expect(profiles.list().map((p) => p.stars)).toEqual([15, 3]);
  });

  it('an old learning tracker never writes into a different player', () => {
    const storage = new StorageManager(new MemoryStore());
    const profiles = new ProfileService(storage);
    const progress = new ProgressService(storage);
    const oldTracker = progress.tracker;
    profiles.create('B', '🐸');
    oldTracker.markIntroduced('count:2'); // a late write from the previous player's game
    expect(storage.profile.learning).toBeNull();
    expect(new LearningTracker(storage.data.profiles[0].learning).get('count:2').introductions).toBe(1);
  });

  it('names default to Player N, are trimmed, and the last player cannot be removed', () => {
    const storage = new StorageManager(new MemoryStore());
    const profiles = new ProfileService(storage);
    expect(profiles.list()[0].name).toBe('Player 1');
    const id = profiles.create('   A really very long name   ', '🦄')!;
    expect(profiles.get(id)!.name).toBe('A really ver');
    profiles.edit(id, 'Mo', 'not-an-avatar');
    expect(profiles.get(id)).toMatchObject({ name: 'Mo', avatar: '🦄' });
    expect(profiles.remove(id)).toBe(true);
    expect(profiles.count).toBe(1);
    expect(profiles.remove(profiles.activeId)).toBe(false);
  });

  it('caps the number of players', () => {
    const profiles = new ProfileService(new StorageManager(new MemoryStore()));
    for (let i = 0; i < 10; i++) profiles.create(`P${i}`, '🐶');
    expect(profiles.count).toBe(6);
    expect(profiles.canAdd).toBe(false);
    expect(profiles.create('extra', '🐶')).toBeNull();
  });
});
