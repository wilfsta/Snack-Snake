/**
 * A curriculum is an ordered journey of skill groups, gathered into stages. It only describes
 * *what* there is to learn and in which order; the CurriculumSession decides *how* to move
 * through it (introduce, practise, probe forward, fast-track, revisit).
 *
 *   Curriculum ─ stages ─ skill groups ─ item ids (resolved by LearningContent)
 *
 * Each group is assumed to build on the groups before it, so evidence that a child can do a
 * later group is also (provisional) evidence about the earlier ones.
 */
export interface SkillGroup {
  readonly id: string;
  /** Grown-up description; never shown to children. */
  readonly title: string;
  /** Items in teaching order. */
  readonly itemIds: readonly string[];
  /**
   * Representative items used to check quietly whether a child already knows this group.
   * Defaults to a spread from easy to hard across the group.
   */
  readonly probeItemIds?: readonly string[];
}

export interface CurriculumStage {
  readonly id: string;
  readonly title: string;
  readonly groups: readonly SkillGroup[];
}

export interface Curriculum {
  readonly id: string;
  readonly title: string;
  readonly stages: readonly CurriculumStage[];
}

/** All skill groups in journey order. */
export function curriculumGroups(curriculum: Curriculum): SkillGroup[] {
  return curriculum.stages.flatMap((s) => s.groups);
}

/** Every item in the curriculum, in journey order. */
export function curriculumItems(curriculum: Curriculum): string[] {
  return curriculumGroups(curriculum).flatMap((g) => g.itemIds);
}

/** Items used to probe a group: explicit ones, or a spread across it (an easy, a middle and a hard one). */
export function probeItems(group: SkillGroup): readonly string[] {
  if (group.probeItemIds && group.probeItemIds.length > 0) return group.probeItemIds;
  const ids = group.itemIds;
  if (ids.length <= 3) return ids;
  const picks = [0.25, 0.55, 0.85].map((f) => ids[Math.min(ids.length - 1, Math.floor(f * ids.length))]);
  return [...new Set(picks)];
}

/** Structural problems with a curriculum (empty means valid). */
export function validateCurriculum(curriculum: Curriculum, ownsItem: (itemId: string) => boolean): string[] {
  const errors: string[] = [];
  const groupIds = new Set<string>();
  const itemIds = new Set<string>();
  for (const group of curriculumGroups(curriculum)) {
    if (groupIds.has(group.id)) errors.push(`duplicate group id ${group.id}`);
    groupIds.add(group.id);
    if (group.itemIds.length === 0) errors.push(`group ${group.id} is empty`);
    for (const id of group.itemIds) {
      if (itemIds.has(id)) errors.push(`item ${id} appears more than once`);
      itemIds.add(id);
      if (!ownsItem(id)) errors.push(`item ${id} in ${group.id} has no content`);
    }
    for (const id of group.probeItemIds ?? []) {
      if (!group.itemIds.includes(id)) errors.push(`probe ${id} is not part of group ${group.id}`);
    }
  }
  return errors;
}
