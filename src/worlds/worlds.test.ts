import { describe, expect, it } from 'vitest';
import { createContentLibrary } from '../content/ContentLibrary';
import { objectPicture } from '../content/counting/CountingContent';
import { seededRng } from '../core/random';
import { measureTile } from '../game/tiles';
import { curriculumGroups, curriculumItems, probeItems, validateCurriculum } from '../learning/curriculum';
import { GARDEN_CURRICULUM } from './gardenCurriculum';
import { NUMBER_GARDEN, WORLDS } from './worlds';

const library = createContentLibrary();

describe('Number Garden curriculum', () => {
  it('is structurally valid: unique ids, every item has content, probes belong to their group', () => {
    for (const world of WORLDS) expect(validateCurriculum(world.curriculum, (id) => library.ownsItem(id))).toEqual([]);
  });

  it('goes from counting, through number sense, bonds, adding and taking away, to multiplication', () => {
    expect(GARDEN_CURRICULUM.stages.map((s) => s.id)).toEqual(['quantity', 'number-sense', 'bonds', 'addition', 'subtraction', 'multiplication']);
    const groups = curriculumGroups(GARDEN_CURRICULUM).map((g) => g.id);
    expect(groups[0]).toBe('count-to-5');
    // Concepts behind multiplication come before any times-table facts.
    for (const idea of ['equal-groups', 'repeated-addition', 'count-in-2s', 'count-in-5s', 'count-in-10s', 'groups-to-times']) {
      expect(groups.indexOf(idea)).toBeGreaterThan(groups.indexOf('sub-to-20'));
      expect(groups.indexOf(idea)).toBeLessThan(groups.indexOf('times-2'));
    }
    expect(groups.slice(-3).sort()).toEqual(['times-10', 'times-2', 'times-5']);
  });

  it('every item builds a valid challenge with unique answers and exactly one right one', () => {
    let seed = 1;
    for (const id of curriculumItems(GARDEN_CURRICULUM)) {
      for (const stage of ['introduce', 'independent'] as const) {
        const ch = library.createChallenge(id, { challengeId: `c${seed}`, stage, hintStrength: 0, distractorCount: 2, rng: seededRng(seed++) });
        const labels = [ch.correctAnswer.label, ...ch.distractors.map((d) => d.label)];
        expect(ch.distractors.length, id).toBeGreaterThanOrEqual(1);
        expect(new Set(labels).size, id).toBe(labels.length);
        expect(ch.prompt.length, id).toBeGreaterThan(0);
        // Tiles must fit on a phone-sized arena (14 cells wide).
        expect(measureTile('question', ch.prompt).w, id).toBeLessThanOrEqual(8);
        expect(measureTile('fact', ch.statement).w, id).toBeLessThanOrEqual(12);
        for (const l of labels) expect(measureTile('answer', l).w, `${id} ${l}`).toBeLessThanOrEqual(6);
      }
    }
  });

  it('no Garden question needs reading: only numerals, symbols and pictures', () => {
    const LETTERS = /[A-Za-z]/;
    let seed = 1;
    for (const id of curriculumItems(GARDEN_CURRICULUM)) {
      for (const stage of ['introduce', 'guided', 'independent'] as const) {
        const ch = library.createChallenge(id, { challengeId: 'x', stage, hintStrength: 0.5, distractorCount: 2, rng: seededRng(seed++) });
        const shown = [ch.prompt, ch.askAs ?? '', ch.statement, ch.correctAnswer.label, ...ch.distractors.map((d) => d.label)];
        for (const text of shown) expect(LETTERS.test(text), `${id}: "${text}"`).toBe(false);
      }
    }
  });

  it('questions never ask a child to count more than 5 objects while steering', () => {
    const OBJECT = /🍎|●|🔴|🖐|☝|✌/gu;
    let seed = 1;
    for (const id of curriculumItems(GARDEN_CURRICULUM)) {
      for (let i = 0; i < 4; i++) {
        const ch = library.createChallenge(id, { challengeId: 'x', stage: 'independent', hintStrength: 0, distractorCount: 2, rng: seededRng(seed++) });
        const objects = (s: string) => (s.match(OBJECT) ?? []).length + (s.includes('🖐') ? 4 : 0);
        expect(objects(ch.prompt), `${id}: ${ch.prompt}`).toBeLessThanOrEqual(5);
        for (const option of [ch.correctAnswer, ...ch.distractors]) expect(objects(option.label), `${id} answer`).toBeLessThanOrEqual(5);
      }
    }
  });

  it('keeps the old Garden item ids where they are still used, so earlier progress counts', () => {
    const items = new Set(curriculumItems(GARDEN_CURRICULUM));
    for (let n = 1; n <= 5; n++) expect(items.has(`count:${n}`)).toBe(true);
    // Old path: adding 1..5 within 10.
    for (let add = 1; add <= 5; add++) for (let k = 1; k + add <= 10; k++) expect(items.has(`add:${add}+${k}`)).toBe(true);
  });

  it('every group has representative probe items', () => {
    for (const g of curriculumGroups(GARDEN_CURRICULUM)) {
      expect(probeItems(g).length, g.id).toBeGreaterThanOrEqual(Math.min(2, g.itemIds.length));
    }
  });

  it('the world uses the curriculum and keeps young-friendly settings', () => {
    expect(NUMBER_GARDEN.curriculum).toBe(GARDEN_CURRICULUM);
    expect(NUMBER_GARDEN.answerCount).toBe(3);
  });
});

describe('quantity pictures', () => {
  it('counting can show apples in rows of five', () => {
    expect(objectPicture(3)).toBe('🍎🍎🍎');
    expect(objectPicture(7)).toBe('🍎🍎🍎🍎🍎\n🍎🍎');
  });

  it('the same quantity appears in different representations', () => {
    const shown = new Set<string>();
    for (let seed = 1; seed < 60; seed++) {
      shown.add(library.createChallenge('count:7', { challengeId: 'x', stage: 'independent', hintStrength: 0, distractorCount: 2, rng: seededRng(seed) }).prompt);
    }
    expect(shown.size).toBeGreaterThanOrEqual(3);
    // Introductions always use apples.
    const intro = library.createChallenge('count:7', { challengeId: 'x', stage: 'introduce', hintStrength: 0, distractorCount: 2, rng: seededRng(3) });
    expect(intro.prompt).toBe(objectPicture(7));
  });

  it('matching a numeral offers pictures that differ only in amount', () => {
    const ch = library.createChallenge('match:6', { challengeId: 'x', stage: 'independent', hintStrength: 0, distractorCount: 2, rng: seededRng(5) });
    expect(ch.prompt).toBe('6');
    // Filled markers in any of the picture styles (dots, dice, frame counters).
    const picCount = (pic: string) => [...pic].filter((c) => c === '●' || c === '🔴').length;
    expect(picCount(ch.correctAnswer.label)).toBe(6);
    for (const d of ch.distractors) expect(picCount(d.label)).not.toBe(6);
  });
});
