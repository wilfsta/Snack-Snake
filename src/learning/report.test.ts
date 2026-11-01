import { describe, expect, it } from 'vitest';
import { createContentLibrary } from '../content/ContentLibrary';
import { GARDEN_CURRICULUM } from '../worlds/gardenCurriculum';
import { curriculumGroups } from './curriculum';
import { LearningTracker } from './LearningTracker';
import { buildProgressReport } from './report';

const library = createContentLibrary();
const GROUPS = curriculumGroups(GARDEN_CURRICULUM);

function answer(tracker: LearningTracker, itemId: string, correct: boolean): void {
  tracker.markPresented(itemId);
  tracker.recordAttempt(itemId, { kind: 'independent', correct, firstTry: true, hintStrength: 0 });
}

const skill = (report: ReturnType<typeof buildProgressReport>, id: string) => report.stages.flatMap((s) => s.skills).find((g) => g.id === id);

describe('progress report', () => {
  it('shows a brand-new child at the start of the journey', () => {
    const report = buildProgressReport(new LearningTracker(), library, GARDEN_CURRICULUM);
    expect(report.skillsPassed).toBe(0);
    expect(report.skillCount).toBe(GROUPS.length);
    expect(skill(report, GROUPS[0].id)?.status).toBe('learning');
    expect(skill(report, GROUPS[1].id)?.status).toBe('not-started');
    expect(report.practice).toEqual([]);
    expect(report.unaidedAnswers).toBe(0);
  });

  it('marks learnt, skipped and current skills', () => {
    const tracker = new LearningTracker();
    for (const id of GROUPS[0].itemIds) answer(tracker, id, true);
    tracker.setCurriculumState(GARDEN_CURRICULUM.id, { assumed: { [GROUPS[1].id]: { how: 'probe', since: 0, confirms: 0, doubts: 0 } } });
    const report = buildProgressReport(tracker, library, GARDEN_CURRICULUM);
    expect(skill(report, GROUPS[0].id)?.status).toBe('secure');
    expect(skill(report, GROUPS[1].id)?.status).toBe('assumed');
    expect(skill(report, GROUPS[2].id)?.status).toBe('learning');
    expect(report.skillsPassed).toBe(2);
    expect(report.unaidedAnswers).toBe(GROUPS[0].itemIds.length);
    expect(report.unaidedCorrect).toBe(GROUPS[0].itemIds.length);
  });

  it('lists facts that went wrong, in readable words', () => {
    const tracker = new LearningTracker();
    answer(tracker, 'seq:3', false);
    answer(tracker, 'add:4+3', true);
    const report = buildProgressReport(tracker, library, GARDEN_CURRICULUM);
    expect(report.practice).toHaveLength(1);
    expect(report.practice[0].reason).toBe('shaky');
    expect(report.practice[0].label).not.toContain('seq:');
  });

  it('includes only the other units a child has started', () => {
    const tracker = new LearningTracker();
    const unit = library.getUnit('mul:table:3');
    if (!unit) throw new Error('missing unit');
    answer(tracker, unit.itemIds[0], true);
    const report = buildProgressReport(tracker, library, GARDEN_CURRICULUM, ['mul:table:3', 'mul:table:4']);
    expect(report.otherUnits).toEqual([{ title: unit.title, mastered: 0, started: 1, size: unit.itemIds.length }]);
  });
});
