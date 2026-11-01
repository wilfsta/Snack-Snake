import { describe, expect, it } from 'vitest';
import { MemoryStore, StorageManager } from '../../storage/StorageManager';
import { ProgressService, VISIT_RESUME_MS } from './ProgressService';

function setup() {
  const store = new MemoryStore();
  const storage = new StorageManager(store);
  return { store, storage, progress: new ProgressService(storage) };
}

describe('unfinished visits', () => {
  it('carries on a visit left a little while ago, even after the page is reloaded', () => {
    const { store, storage, progress } = setup();
    progress.saveVisit({ worldId: 'garden', done: 5, stars: 7, newPlants: 1 }, 1000);
    storage.flush();
    const reloaded = new ProgressService(new StorageManager(store));
    expect(reloaded.unfinishedVisit('garden', 12, 1000 + 60_000)).toEqual({ worldId: 'garden', done: 5, stars: 7, newPlants: 1, at: 1000 });
  });

  it('starts fresh after a long break, in another world, or once the visit is complete', () => {
    const { progress } = setup();
    progress.saveVisit({ worldId: 'garden', done: 5, stars: 7, newPlants: 0 }, 1000);
    expect(progress.unfinishedVisit('garden', 12, 1000 + VISIT_RESUME_MS + 1)).toBeNull();
    expect(progress.unfinishedVisit('other', 12, 2000)).toBeNull();
    expect(progress.unfinishedVisit('garden', 5, 2000)).toBeNull();
  });

  it('forgets the visit once it has been finished', () => {
    const { progress } = setup();
    progress.saveVisit({ worldId: 'garden', done: 3, stars: 2, newPlants: 0 }, 1000);
    progress.clearVisit();
    expect(progress.unfinishedVisit('garden', 12, 2000)).toBeNull();
  });
});
