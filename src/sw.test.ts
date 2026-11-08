import { describe, expect, it } from 'vitest';
import template from './sw.js?raw';

/** Runs src/sw.js against a pretend browser and fires its "activate" step. */
async function activateWith(existing: string[]): Promise<string[]> {
  const source = template
    .replace("'snack-snake-__BUILD__'", "'snack-snake-new'")
    .replace('= __FILES__;', '= [];');
  const names = new Set(existing);
  const handlers = new Map<string, (event: unknown) => void>();
  const self = {
    addEventListener: (type: string, f: (event: unknown) => void) => handlers.set(type, f),
    clients: { claim: async () => undefined },
    registration: { scope: 'https://example.github.io/Snack-Snake/' },
  };
  const caches = {
    keys: async () => [...names],
    delete: async (name: string) => names.delete(name),
  };
  new Function('self', 'caches', source)(self, caches);
  let done: Promise<unknown> = Promise.resolve();
  handlers.get('activate')!({ waitUntil: (p: Promise<unknown>) => (done = p) });
  await done;
  return [...names].sort();
}

describe('offline cache', () => {
  it("deletes this game's old caches but leaves other sites' caches alone", async () => {
    const left = await activateWith(['snack-snake-new', 'snack-snake-v1', 'snack-snake-0123abcd', 'other-game-v3', 'workbox-precache']);
    expect(left).toEqual(['other-game-v3', 'snack-snake-new', 'workbox-precache']);
  });
});
