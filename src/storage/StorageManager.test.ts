import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LearningTracker } from '../learning/LearningTracker';
import { MemoryStore, parseSaveData, SAVE_KEY, StorageManager } from './StorageManager';

describe('StorageManager', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('round-trips settings, high scores and learning progress', () => {
    const store = new MemoryStore();
    const tracker = new LearningTracker();
    tracker.markIntroduced('mul:6x4');
    tracker.recordAttempt('mul:6x4', { kind: 'independent', correct: true, firstTry: true, hintStrength: 0 });

    const first = new StorageManager(store);
    first.update((d) => {
      d.settings.muted = true;
      d.settings.lastLearnUnit = 'mul:table:6';
      d.highScores['play:mul:table:6'] = 120;
      d.learning = tracker.snapshot();
    });
    // Debounced: nothing written yet, then flushed after the delay.
    expect(store.getItem(SAVE_KEY)).toBeNull();
    vi.advanceTimersByTime(500);
    expect(store.getItem(SAVE_KEY)).not.toBeNull();

    const reloaded = new StorageManager(store);
    expect(reloaded.data.settings.muted).toBe(true);
    expect(reloaded.data.settings.lastLearnUnit).toBe('mul:table:6');
    expect(reloaded.data.highScores['play:mul:table:6']).toBe(120);
    const restored = new LearningTracker(reloaded.data.learning);
    expect(restored.get('mul:6x4')).toEqual(tracker.get('mul:6x4'));
  });

  it('flush writes immediately', () => {
    const store = new MemoryStore();
    const storage = new StorageManager(store);
    storage.update((d) => (d.highScores.x = 5), true);
    expect(JSON.parse(store.getItem(SAVE_KEY)!).highScores.x).toBe(5);
  });

  it('survives corrupt or foreign data', () => {
    expect(parseSaveData('{not json').settings.muted).toBe(false);
    expect(parseSaveData(JSON.stringify({ version: 99 })).highScores).toEqual({});
    const odd = parseSaveData(JSON.stringify({ version: 1, settings: { muted: 'yes', touchControls: 'sideways' }, highScores: { a: -5, b: 10, c: 'x' } }));
    expect(odd.settings.muted).toBe(false);
    expect(odd.settings.touchControls).toBe('auto');
    expect(odd.highScores).toEqual({ b: 10 });
    expect(new LearningTracker({ version: 1, records: 'nope' }).get('mul:2x2').state).toBe('NEW');
  });
});
