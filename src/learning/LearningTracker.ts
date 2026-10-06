import {
  createMasteryRecord,
  sanitizeRecord,
  withAttempt,
  withIntroduction,
  withPresentation,
  type AttemptInput,
  type MasteryRecord,
  type MasteryState,
} from './mastery';
import { sanitizeCurriculumState, type CurriculumState } from './placement';

export interface UnitProgress {
  /** How many items (in curriculum order) have been unlocked for learning. */
  readonly unlocked: number;
  readonly sessionsCompleted: number;
}

export interface LearningSnapshot {
  readonly version: 1;
  readonly step: number;
  readonly records: Readonly<Record<string, MasteryRecord>>;
  readonly units: Readonly<Record<string, UnitProgress>>;
  /** Per-curriculum placement evidence (which skill groups are provisionally known). */
  readonly curricula?: Readonly<Record<string, CurriculumState>>;
}

export type MasteryCounts = Record<MasteryState, number>;

/**
 * Owns all mastery records and per-unit progress. Pure bookkeeping: it does not decide what
 * to ask next (that is the LearningEngine's job) and it does not know how data is persisted.
 */
export class LearningTracker {
  private readonly records = new Map<string, MasteryRecord>();
  private readonly units = new Map<string, UnitProgress>();
  private readonly curricula = new Map<string, CurriculumState>();
  private step = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    snapshot?: unknown,
    private readonly clock: () => number = Date.now,
  ) {
    const clean = LearningTracker.sanitize(snapshot);
    if (clean) {
      this.step = clean.step;
      for (const [id, rec] of Object.entries(clean.records)) this.records.set(id, rec);
      for (const [id, unit] of Object.entries(clean.units)) this.units.set(id, unit);
      for (const [id, state] of Object.entries(clean.curricula ?? {})) this.curricula.set(id, state);
    }
  }

  get currentStep(): number {
    return this.step;
  }

  get(itemId: string): MasteryRecord {
    return this.records.get(itemId) ?? createMasteryRecord(itemId);
  }

  getAll(itemIds: readonly string[]): MasteryRecord[] {
    return itemIds.map((id) => this.get(id));
  }

  markPresented(itemId: string): void {
    this.records.set(itemId, withPresentation(this.get(itemId), this.step));
    this.step++;
    this.changed();
  }

  markIntroduced(itemId: string): void {
    this.records.set(itemId, withIntroduction(this.get(itemId), this.clock()));
    this.changed();
  }

  recordAttempt(itemId: string, attempt: AttemptInput): MasteryRecord {
    const next = withAttempt(this.get(itemId), attempt, this.clock());
    this.records.set(itemId, next);
    this.changed();
    return next;
  }

  unitProgress(unitId: string, initialUnlocked: number): UnitProgress {
    return this.units.get(unitId) ?? { unlocked: initialUnlocked, sessionsCompleted: 0 };
  }

  setUnitProgress(unitId: string, progress: UnitProgress): void {
    this.units.set(unitId, progress);
    this.changed();
  }

  curriculumState(curriculumId: string): CurriculumState {
    return this.curricula.get(curriculumId) ?? { assumed: {} };
  }

  setCurriculumState(curriculumId: string, state: CurriculumState): void {
    this.curricula.set(curriculumId, state);
    this.changed();
  }

  countStates(itemIds: readonly string[]): MasteryCounts {
    const counts: MasteryCounts = { NEW: 0, LEARNING: 0, PRACTISING: 0, MASTERED: 0 };
    for (const id of itemIds) counts[this.get(id).state]++;
    return counts;
  }

  snapshot(): LearningSnapshot {
    return {
      version: 1,
      step: this.step,
      records: Object.fromEntries(this.records),
      units: Object.fromEntries(this.units),
      curricula: Object.fromEntries(this.curricula),
    };
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }

  /** Validates untrusted persisted data. Returns null if it is unusable. */
  static sanitize(raw: unknown): LearningSnapshot | null {
    if (!raw || typeof raw !== 'object') return null;
    const src = raw as Record<string, unknown>;
    if (src.version !== 1) return null;
    const records: Record<string, MasteryRecord> = {};
    if (src.records && typeof src.records === 'object') {
      for (const [id, rec] of Object.entries(src.records as Record<string, unknown>)) {
        records[id] = sanitizeRecord(id, rec);
      }
    }
    const units: Record<string, UnitProgress> = {};
    if (src.units && typeof src.units === 'object') {
      for (const [id, unit] of Object.entries(src.units as Record<string, unknown>)) {
        if (!unit || typeof unit !== 'object') continue;
        const u = unit as Record<string, unknown>;
        const unlocked = typeof u.unlocked === 'number' && u.unlocked >= 0 ? Math.floor(u.unlocked) : 0;
        const sessionsCompleted = typeof u.sessionsCompleted === 'number' ? Math.max(0, Math.floor(u.sessionsCompleted)) : 0;
        if (unlocked > 0) units[id] = { unlocked, sessionsCompleted };
      }
    }
    const curricula: Record<string, CurriculumState> = {};
    if (src.curricula && typeof src.curricula === 'object') {
      for (const [id, state] of Object.entries(src.curricula as Record<string, unknown>)) curricula[id] = sanitizeCurriculumState(state);
    }
    const step = typeof src.step === 'number' && Number.isFinite(src.step) ? Math.max(0, Math.floor(src.step)) : 0;
    return { version: 1, step, records, units, curricula };
  }
}
