import { ADDITION, MULTIPLICATION, SUBTRACTION } from '../content/arithmetic/operations';
import type { Curriculum, SkillGroup } from '../learning/curriculum';

/**
 * The Number Garden journey: from first counting to the foundations of multiplication.
 *
 * Skill groups, not one long list: recognising seven apples, matching the numeral 7 to a
 * picture and knowing "one more than 6" are different abilities, so each has its own group.
 * Item ids for counting and adding are the same as before, so earlier Garden progress carries over.
 */

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** All (k, n) pairs (k + n = total) with a total in [min, max], n between nMin and nMax. */
function sums(min: number, max: number, nMin: number, nMax: number, kMax = 12): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let total = min; total <= max; total++) {
    for (let n = nMin; n <= nMax; n++) {
      const k = total - n;
      if (k >= 1 && k <= kMax) out.push([n, k]);
    }
  }
  return out;
}

const addItems = (pairs: Array<[number, number]>) => pairs.map(([n, k]) => ADDITION.itemId(n, k));
const subItems = (pairs: Array<[number, number]>) => pairs.map(([n, k]) => SUBTRACTION.itemId(n, k));

const PAIRS = [
  [2, 2],
  [3, 2],
  [2, 3],
  [4, 2],
  [3, 3],
  [2, 5],
] as const;

function group(id: string, title: string, itemIds: string[], probeItemIds?: string[]): SkillGroup {
  return { id, title, itemIds, probeItemIds };
}

export const GARDEN_CURRICULUM: Curriculum = {
  id: 'garden',
  title: 'Number Garden',
  stages: [
    {
      id: 'number-sense',
      title: 'Number sense with numerals',
      // Playtesting: counting objects while steering Sid is too much at once, and not every child can
      // read. The Garden uses only numerals and sums – no pictures to count, no words to read.
      groups: [
        group('missing-number', 'Numbers in order to 10', range(1, 7).map((s) => `seq:${s}`), ['seq:2', 'seq:5', 'seq:7']),
        group('one-more', 'One more', range(1, 9).map((n) => `onemore:${n}`), ['onemore:4', 'onemore:8', 'onemore:6']),
        group('one-less', 'One less', range(2, 10).map((n) => `oneless:${n}`), ['oneless:5', 'oneless:9', 'oneless:7']),
      ],
    },
    {
      id: 'bonds',
      title: 'Number bonds',
      groups: [
        group('bonds-to-5', 'Number bonds to 5', range(1, 4).map((a) => `bond:5:${a}`), ['bond:5:2', 'bond:5:4', 'bond:5:1']),
        group('bonds-to-10', 'Number bonds to 10', range(1, 9).map((a) => `bond:10:${a}`), ['bond:10:3', 'bond:10:7', 'bond:10:6']),
      ],
    },
    {
      id: 'addition',
      title: 'Addition',
      groups: [
        group('add-to-5', 'Adding within 5', addItems(sums(2, 5, 1, 4)), [ADDITION.itemId(2, 2), ADDITION.itemId(1, 3), ADDITION.itemId(2, 3)]),
        group('add-to-10', 'Adding within 10', addItems(sums(6, 10, 1, 5)), [ADDITION.itemId(3, 4), ADDITION.itemId(2, 6), ADDITION.itemId(4, 5)]),
        group('add-to-20', 'Adding within 20 (crossing 10)', addItems(sums(11, 18, 2, 9, 9)), [ADDITION.itemId(3, 8), ADDITION.itemId(6, 7), ADDITION.itemId(5, 9)]),
      ],
    },
    {
      id: 'subtraction',
      title: 'Subtraction',
      groups: [
        group('sub-to-5', 'Taking away within 5', subItems(sums(2, 5, 1, 4)), [SUBTRACTION.itemId(1, 3), SUBTRACTION.itemId(2, 2), SUBTRACTION.itemId(2, 3)]),
        group('sub-to-10', 'Taking away within 10', subItems(sums(6, 10, 1, 5)), [SUBTRACTION.itemId(3, 4), SUBTRACTION.itemId(2, 6), SUBTRACTION.itemId(4, 5)]),
        group('sub-to-20', 'Taking away within 20', subItems(sums(11, 18, 2, 9, 9)), [SUBTRACTION.itemId(3, 8), SUBTRACTION.itemId(6, 7), SUBTRACTION.itemId(5, 9)]),
      ],
    },
    {
      id: 'multiplication',
      title: 'Foundations of multiplication',
      groups: [
        group('repeated-addition', 'Repeated addition', PAIRS.map(([g, s]) => `repadd:${g}:${s}`)),
        group('count-in-2s', 'Counting in 2s', range(1, 6).map((p) => `skip:2:${p}`)),
        group('count-in-10s', 'Counting in 10s', range(1, 6).map((p) => `skip:10:${p}`)),
        group('count-in-5s', 'Counting in 5s', range(1, 6).map((p) => `skip:5:${p}`)),
        group('groups-to-times', 'Groups of = times', PAIRS.map(([g, s]) => `link:${g}:${s}`)),
        group('times-2', '2 times table', range(1, 10).map((k) => MULTIPLICATION.itemId(2, k)), [MULTIPLICATION.itemId(2, 3), MULTIPLICATION.itemId(2, 7), MULTIPLICATION.itemId(2, 5)]),
        group('times-10', '10 times table', range(1, 10).map((k) => MULTIPLICATION.itemId(10, k)), [MULTIPLICATION.itemId(10, 3), MULTIPLICATION.itemId(10, 8), MULTIPLICATION.itemId(10, 6)]),
        group('times-5', '5 times table', range(1, 10).map((k) => MULTIPLICATION.itemId(5, k)), [MULTIPLICATION.itemId(5, 3), MULTIPLICATION.itemId(5, 7), MULTIPLICATION.itemId(5, 6)]),
      ],
    },
  ],
};
