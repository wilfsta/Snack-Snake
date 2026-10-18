import { describe, expect, it } from 'vitest';
import { DEFAULT_PACING, scalePacing } from '../../learning/pacing';
import { DEFAULT_PLAYTEST, parsePlaytest, PlaytestStore } from './playtest';

describe('playtest settings', () => {
  it('normal play (no ?debug) always uses the defaults and cannot be changed', () => {
    const store = new PlaytestStore(false);
    expect(store.active).toBe(false);
    store.update({ sidWhileThinking: 'stop', thinkingScale: 2, gardenAnswers: 2 });
    expect(store.settings).toEqual(DEFAULT_PLAYTEST);
  });

  it('the defaults are today’s Garden: Sid slows down, normal thinking time, 3 answers', () => {
    expect(DEFAULT_PLAYTEST).toEqual({ sidWhileThinking: 'slow', thinkingScale: 1, gardenAnswers: 3 });
  });

  it('only accepts known values', () => {
    expect(parsePlaytest({ sidWhileThinking: 'stop', thinkingScale: 1.5, gardenAnswers: 4 })).toEqual({ sidWhileThinking: 'stop', thinkingScale: 1.5, gardenAnswers: 4 });
    expect(parsePlaytest({ sidWhileThinking: 'fly', thinkingScale: 9, gardenAnswers: 6 })).toEqual(DEFAULT_PLAYTEST);
    expect(parsePlaytest('nonsense')).toEqual(DEFAULT_PLAYTEST);
  });

  it('thinking time scales every stage', () => {
    const longer = scalePacing(DEFAULT_PACING, 1.5);
    expect(longer.thinkingMs.new).toBe(4800);
    expect(longer.thinkingMs.mastered).toBe(2250);
    expect(scalePacing(DEFAULT_PACING, 1)).toEqual(DEFAULT_PACING);
  });
});
