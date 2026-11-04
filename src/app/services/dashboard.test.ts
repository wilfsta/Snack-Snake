import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createContentLibrary } from '../../content/ContentLibrary';
import { LearningTracker } from '../../learning/LearningTracker';
import { dayKey, MemoryStore, newProfile, parseSaveData, StorageManager, type KeyValueStore } from '../../storage/StorageManager';
import { GARDEN_CURRICULUM } from '../../worlds/gardenCurriculum';
import { summarizeChild } from './dashboard';
import { ProgressService } from './ProgressService';

const library = createContentLibrary();
const NOW = new Date(2026, 10, 1, 15, 0).getTime(); // Sunday 1 November 2026, afternoon
const daysAgo = (n: number) => dayKey(new Date(2026, 10, 1 - n, 12).getTime());

describe('daily activity', () => {
  it('adds up questions, right-first-time answers and time per day, and survives a reload', () => {
    const store = new MemoryStore();
    const storage = new StorageManager(store);
    const progress = new ProgressService(storage);
    progress.recordActivity({ questions: 1, firstTry: 1 }, NOW);
    progress.recordActivity({ questions: 1, firstTry: 0, ms: 90_000 }, NOW);
    storage.flush();
    expect(new StorageManager(store).profile.activity[dayKey(NOW)]).toEqual({ questions: 2, firstTry: 1, ms: 90_000 });
  });

  it('keeps only the last 90 days', () => {
    const progress = new ProgressService(new StorageManager(new MemoryStore()));
    for (let i = 0; i < 100; i++) progress.recordActivity({ questions: 1 }, new Date(2026, 0, 1 + i, 12).getTime());
    const storage = (progress as unknown as { storage: StorageManager }).storage;
    const days = Object.keys(storage.profile.activity).sort();
    expect(days).toHaveLength(90);
    expect(days[0]).toBe(dayKey(new Date(2026, 0, 11, 12).getTime()));
  });

  it('ignores broken activity data in a save', () => {
    const save = parseSaveData(JSON.stringify({ version: 2, profiles: [{ id: 'p1', activity: { '2026-11-01': { questions: 3, firstTry: 9, ms: -5 }, nonsense: { questions: 1 }, '2026-10-31': 'x' } }] }));
    expect(save.profiles[0].activity).toEqual({ '2026-11-01': { questions: 3, firstTry: 3, ms: 0 } });
  });
});

describe('save status', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('says when the browser will not save at all', () => {
    expect(new StorageManager(new MemoryStore()).status).toBe('memory-only');
  });

  it('notices a failed save (e.g. storage full) and recovers when saving works again', () => {
    let full = true;
    const data = new Map<string, string>();
    const store: KeyValueStore = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        if (full) throw new Error('QuotaExceededError');
        data.set(k, v);
      },
      removeItem: (k) => void data.delete(k),
    };
    const storage = new StorageManager(store);
    expect(storage.status).toBe('ok');
    storage.updateProfile((p) => (p.name = 'Ada'), true);
    expect(storage.status).toBe('write-failed');
    // Progress is still there in memory, so play carries on.
    expect(storage.profile.name).toBe('Ada');
    full = false;
    storage.updateProfile((p) => (p.name = 'Ada B'));
    vi.advanceTimersByTime(500);
    expect(storage.status).toBe('ok');
    expect(data.size).toBe(1);
  });
});

describe('dashboard child summary', () => {
  it('summarises a child who has never played', () => {
    const s = summarizeChild(newProfile('p1', '', '🦊'), 0, library, GARDEN_CURRICULUM, [], NOW);
    expect(s).toMatchObject({ name: 'Player 1', stars: 0, daysSincePlayed: null, nowLearning: null, skillsPassed: 0 });
    expect(s.thisWeek).toEqual({ days: 0, questions: 0, firstTry: 0, minutes: 0 });
    expect(s.recent).toHaveLength(14);
    expect(s.recent.at(-1)?.day).toBe(dayKey(NOW));
  });

  it("totals this week and last week, and says what they're learning", () => {
    const tracker = new LearningTracker();
    tracker.markPresented('seq:2');
    tracker.recordAttempt('seq:2', { kind: 'independent', correct: false, firstTry: true, hintStrength: 0 });
    const profile = {
      ...newProfile('p1', 'Ada', '🐼'),
      learning: tracker.snapshot(),
      activity: {
        [daysAgo(0)]: { questions: 10, firstTry: 8, ms: 6 * 60000 },
        [daysAgo(2)]: { questions: 12, firstTry: 9, ms: 7 * 60000 },
        [daysAgo(9)]: { questions: 5, firstTry: 2, ms: 3 * 60000 },
        [daysAgo(30)]: { questions: 50, firstTry: 50, ms: 0 },
      },
    };
    const s = summarizeChild(profile, 0, library, GARDEN_CURRICULUM, [], NOW);
    expect(s.daysSincePlayed).toBe(0);
    expect(s.thisWeek).toEqual({ days: 2, questions: 22, firstTry: 17, minutes: 13 });
    expect(s.lastWeek).toEqual({ days: 1, questions: 5, firstTry: 2, minutes: 3 });
    expect(s.recent.reduce((n, d) => n + d.questions, 0)).toBe(27);
    expect(s.nowLearning).toBe('Numbers in order to 10');
    expect(s.needsPractice).toHaveLength(1);
  });

  it('counts days since they last played', () => {
    const profile = { ...newProfile('p1', 'Bo', '🐸'), activity: { [daysAgo(3)]: { questions: 4, firstTry: 4, ms: 1000 } } };
    expect(summarizeChild(profile, 0, library, GARDEN_CURRICULUM, [], NOW).daysSincePlayed).toBe(3);
  });
});
