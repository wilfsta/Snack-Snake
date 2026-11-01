import { seededRng } from '../core/random';
import { curriculumGroups, type Curriculum } from './curriculum';
import type { LearningTracker } from './LearningTracker';
import { groupSecure, itemKnown } from './placement';
import { practiceTargets, type PracticeReason } from './practice';
import type { LearningContent } from './types';

/**
 * A grown-up's view of how a child is doing: which skills are secure, which are being learnt,
 * and which facts need more practice. Read-only; never shown to children.
 */
export type SkillStatus = 'secure' | 'assumed' | 'learning' | 'started' | 'not-started';

export interface SkillReport {
  readonly id: string;
  readonly title: string;
  readonly status: SkillStatus;
  readonly known: number;
  readonly size: number;
}

export interface StageReport {
  readonly title: string;
  readonly skills: readonly SkillReport[];
}

export interface PracticeFact {
  readonly label: string;
  readonly reason: PracticeReason;
}

export interface UnitReport {
  readonly title: string;
  readonly mastered: number;
  readonly started: number;
  readonly size: number;
}

export interface ProgressReport {
  readonly curriculumTitle: string;
  readonly stages: readonly StageReport[];
  /** Skills learnt or shown to be known, out of all of them. */
  readonly skillsPassed: number;
  readonly skillCount: number;
  /** Facts that most need practice, most urgent first. */
  readonly practice: readonly PracticeFact[];
  /** Questions answered with no hint, and how many of those were right. */
  readonly unaidedAnswers: number;
  readonly unaidedCorrect: number;
  /** Other units (e.g. times tables in Learn mode) the child has started. */
  readonly otherUnits: readonly UnitReport[];
}

const PRACTICE_SHOWN = 8;

export function buildProgressReport(
  tracker: LearningTracker,
  content: LearningContent,
  curriculum: Curriculum,
  otherUnitIds: readonly string[] = [],
): ProgressReport {
  const assumed = tracker.curriculumState(curriculum.id).assumed;
  const groups = curriculumGroups(curriculum);
  const passed = (i: number) => groupSecure(tracker.getAll(groups[i].itemIds)) || assumed[groups[i].id] !== undefined;
  const frontier = groups.findIndex((_, i) => !passed(i));

  const stages = curriculum.stages.map((stage) => ({
    title: stage.title,
    skills: stage.groups.map((group) => {
      const records = tracker.getAll(group.itemIds);
      const index = groups.indexOf(group);
      let status: SkillStatus;
      if (groupSecure(records)) status = 'secure';
      else if (assumed[group.id]) status = 'assumed';
      else if (index === frontier) status = 'learning';
      else if (records.some((r) => r.timesPresented > 0)) status = 'started';
      else status = 'not-started';
      return { id: group.id, title: group.title, status, known: records.filter(itemKnown).length, size: group.itemIds.length };
    }),
  }));

  const records = Object.values(tracker.snapshot().records);
  const practice = practiceTargets(records, tracker.currentStep, PRACTICE_SHOWN).map((need) => ({ label: factLabel(content, need.itemId), reason: need.reason }));

  const otherUnits: UnitReport[] = [];
  for (const unitId of otherUnitIds) {
    const unit = content.getUnit(unitId);
    if (!unit) continue;
    const counts = tracker.countStates(unit.itemIds);
    const size = unit.itemIds.length;
    if (counts.NEW === size) continue;
    otherUnits.push({ title: unit.title, mastered: counts.MASTERED, started: size - counts.NEW, size });
  }

  return {
    curriculumTitle: curriculum.title,
    stages,
    skillsPassed: groups.filter((_, i) => passed(i)).length,
    skillCount: groups.length,
    practice,
    unaidedAnswers: records.reduce((n, r) => n + r.independentAttempts, 0),
    unaidedCorrect: records.reduce((n, r) => n + r.independentCorrect, 0),
    otherUnits,
  };
}

/** A readable fact ("4 + 3 = 7", "3, 4, 5"): the challenge's own statement, since some ids aren't readable. */
function factLabel(content: LearningContent, itemId: string): string {
  try {
    const challenge = content.createChallenge(itemId, { challengeId: 'report', stage: 'introduce', hintStrength: 0, distractorCount: 0, rng: seededRng(1) });
    return challenge.statement.replace(/\n/g, ' ');
  } catch {
    return content.describeItem(itemId).full;
  }
}
