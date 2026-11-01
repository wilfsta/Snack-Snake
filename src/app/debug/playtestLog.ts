import type { SessionEvent } from '../../game/SnakeSession';
import { parsePlaytest, type PlaytestSettings } from './playtest';

/**
 * Notes on each Number Garden visit during a playtest: how far the child got, what went wrong,
 * how often Sid bumped into things, plus a grown-up's own comment. Only kept with "?debug", on
 * this device, so playtests can be compared afterwards ("Copy" in the debug panel).
 */
export interface VisitNote {
  readonly startedAt: number;
  readonly endedAt: number;
  readonly player: string;
  /** Carried on from a visit that had been interrupted. */
  readonly resumed: boolean;
  /** Reached the end-of-visit screen (false: left early, or still going). */
  readonly finished: boolean;
  /** Questions answered (each ends with the right answer, after any wrong ones). */
  readonly questions: number;
  readonly rightFirstTime: number;
  /** Questions asked with a hint showing. */
  readonly hinted: number;
  /** New facts shown. */
  readonly taught: number;
  /** Facts whose first answer was wrong, in order. */
  readonly missed: readonly string[];
  readonly wrongAnswers: number;
  /** Times Sid bit his tail or bumped a wall. */
  readonly bumps: number;
  readonly settings: PlaytestSettings;
  readonly note: string;
}

/** Builds one visit's note from the game's events. */
export class VisitRecorder {
  private note: VisitNote;

  constructor(player: string, settings: PlaytestSettings, resumed: boolean, now = Date.now()) {
    this.note = {
      startedAt: now,
      endedAt: now,
      player,
      resumed,
      finished: false,
      questions: 0,
      rightFirstTime: 0,
      hinted: 0,
      taught: 0,
      missed: [],
      wrongAnswers: 0,
      bumps: 0,
      settings,
      note: '',
    };
  }

  get current(): VisitNote {
    return this.note;
  }

  /** Returns true when the event changed the note. */
  observe(event: SessionEvent, now = Date.now()): boolean {
    const n = this.note;
    switch (event.type) {
      case 'correct':
        this.note = {
          ...n,
          questions: n.questions + 1,
          rightFirstTime: n.rightFirstTime + (event.firstTry ? 1 : 0),
          hinted: n.hinted + (event.challenge.stage === 'guided' ? 1 : 0),
        };
        break;
      case 'wrong': {
        const fact = event.challenge.statement.replace(/\n/g, ' ');
        const missed = event.attempt === 1 && !n.missed.includes(fact) ? [...n.missed, fact] : n.missed;
        this.note = { ...n, wrongAnswers: n.wrongAnswers + 1, missed };
        break;
      }
      case 'factCollected':
        this.note = { ...n, taught: n.taught + 1 };
        break;
      case 'selfBite':
      case 'bonk':
        this.note = { ...n, bumps: n.bumps + 1 };
        break;
      default:
        return false;
    }
    this.note = { ...this.note, endedAt: now };
    return true;
  }

  finish(now = Date.now()): VisitNote {
    this.note = { ...this.note, finished: true, endedAt: now };
    return this.note;
  }
}

const KEY = 'snack-snake.playtest-notes';
/** Oldest notes are dropped beyond this. */
export const MAX_NOTES = 40;

function parseNote(raw: unknown): VisitNote | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  if (typeof r.startedAt !== 'number') return null;
  return {
    startedAt: r.startedAt,
    endedAt: num(r.endedAt) || r.startedAt,
    player: typeof r.player === 'string' ? r.player : '?',
    resumed: r.resumed === true,
    finished: r.finished === true,
    questions: num(r.questions),
    rightFirstTime: num(r.rightFirstTime),
    hinted: num(r.hinted),
    taught: num(r.taught),
    missed: Array.isArray(r.missed) ? r.missed.filter((m): m is string => typeof m === 'string') : [],
    wrongAnswers: num(r.wrongAnswers),
    bumps: num(r.bumps),
    settings: parsePlaytest(r.settings),
    note: typeof r.note === 'string' ? r.note : '',
  };
}

export function parseNotes(text: string | null): VisitNote[] {
  if (!text) return [];
  try {
    const raw: unknown = JSON.parse(text);
    return Array.isArray(raw) ? raw.map(parseNote).filter((n): n is VisitNote => n !== null) : [];
  } catch {
    return [];
  }
}

export class PlaytestLog {
  private list: VisitNote[] = [];

  /** `enabled` is false for normal play: then nothing is read, recorded or written. */
  constructor(private readonly enabled: boolean) {
    if (!enabled) return;
    try {
      this.list = parseNotes(window.localStorage.getItem(KEY));
    } catch {
      this.list = [];
    }
  }

  get active(): boolean {
    return this.enabled;
  }

  /** Oldest first. */
  get notes(): readonly VisitNote[] {
    return this.list;
  }

  /** Adds a visit's note, or updates it if it is already there (same start time). */
  save(note: VisitNote): void {
    if (!this.enabled) return;
    const i = this.list.findIndex((n) => n.startedAt === note.startedAt);
    // Keep any comment typed while the visit was still going.
    if (i !== -1) this.list[i] = { ...note, note: this.list[i].note || note.note };
    else this.list = [...this.list, note].slice(-MAX_NOTES);
    this.write();
  }

  /** A grown-up's comment on the latest visit. */
  comment(text: string): void {
    const last = this.list.at(-1);
    if (!last) return;
    this.list[this.list.length - 1] = { ...last, note: text.trim() };
    this.write();
  }

  clear(): void {
    this.list = [];
    this.write();
  }

  private write(): void {
    if (!this.enabled) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.list));
    } catch {
      // Storage blocked: the notes still last until the page is closed.
    }
  }
}

/** One readable line per visit, e.g. for pasting into a message or spreadsheet notes. */
export function formatNote(n: VisitNote): string {
  const when = new Date(n.startedAt);
  const pad = (v: number) => String(v).padStart(2, '0');
  const minutes = Math.max(0, Math.round((n.endedAt - n.startedAt) / 60000));
  const s = n.settings;
  const parts = [
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`,
    n.player,
    `${minutes} min`,
    n.finished ? 'finished' : 'left early',
    n.resumed ? 'carried on' : null,
    `${n.rightFirstTime}/${n.questions} right first time`,
    n.hinted ? `${n.hinted} with a hint` : null,
    n.taught ? `${n.taught} new` : null,
    `${n.bumps} bumps`,
    n.missed.length ? `missed: ${n.missed.join('; ')}` : null,
    `[Sid ${s.sidWhileThinking === 'stop' ? 'stops' : 'slows'}, thinking ${Math.round(s.thinkingScale * 100)}%, ${s.gardenAnswers} answers]`,
    n.note ? `note: ${n.note}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}
