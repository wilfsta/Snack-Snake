import type { CurriculumDebugInfo } from '../../learning/CurriculumSession';
import { GARDEN_ANSWER_CHOICES, THINKING_SCALES, type PlaytestSettings } from './playtest';
import { formatNote, type VisitNote } from './playtestLog';

export interface DebugView {
  readonly player: string;
  readonly appState: string;
  readonly mode: string | null;
  readonly phase: string | null;
  readonly stars: number;
  readonly curriculum: CurriculumDebugInfo | null;
  /** True when the curriculum info is a preview (not inside the world right now). */
  readonly preview: boolean;
}

export interface DebugActions {
  resetLearning(): void;
  resetEverything(): void;
  playtest(): PlaytestSettings;
  setPlaytest(change: Partial<PlaytestSettings>): void;
  notes(): readonly VisitNote[];
  commentOnLastVisit(text: string): void;
  clearNotes(): void;
}

/** Only exists when the page is opened with "?debug" in the address. */
export function debugRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('debug');
  } catch {
    return false;
  }
}

/** How many visits the panel lists (Copy takes them all). */
const NOTES_SHOWN = 3;

const STATUS_MARK = { secure: '■', assumed: '◆', open: '·' } as const;
const KIND_LABEL: Readonly<Record<string, string>> = { probe: 'check', recheck: 're-check', learn: 'learn', review: 'review', comeback: 'again' };

/**
 * A developer/playtester panel showing what the learning engine is thinking. It is never
 * created for children: only "?debug" in the address turns it on. Press ` (backtick) to hide it.
 */
export class DebugOverlay {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private lastRender = 0;
  private lastKey = '';
  private readonly playtestBox: HTMLElement;
  private readonly notesBox: HTMLElement;
  private readonly notesList: HTMLElement;
  private lastNotesKey = '';

  constructor(actions: DebugActions) {
    this.root = document.createElement('aside');
    this.root.className = 'debug-overlay';
    this.root.setAttribute('aria-hidden', 'true');
    const bar = document.createElement('div');
    bar.className = 'debug-bar';
    const title = document.createElement('strong');
    title.textContent = '🛠 Learning engine';
    const learn = this.button('Reset learning', () => {
      if (window.confirm('Reset this player’s learning progress? (Stars and outfits are kept.)')) actions.resetLearning();
    });
    const all = this.button('Reset player', () => {
      if (window.confirm('Reset this player’s learning, stars, garden, outfits and visits?')) actions.resetEverything();
    });
    const hide = this.button('–', () => this.root.classList.toggle('collapsed'));
    bar.append(title, learn, all, hide);
    this.body = document.createElement('pre');
    this.body.className = 'debug-body';
    this.playtestBox = document.createElement('div');
    this.playtestBox.className = 'debug-playtest';
    this.renderPlaytest(actions);
    this.notesList = document.createElement('div');
    this.notesList.className = 'debug-notes-list';
    this.notesBox = this.buildNotes(actions);
    this.root.append(bar, this.playtestBox, this.notesBox, this.body);
    document.body.append(this.root);
    window.addEventListener('keydown', (e) => {
      if (e.key === '`') this.root.classList.toggle('collapsed');
    });
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.tabIndex = -1; // never part of the children's keyboard/gamepad navigation
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  /**
   * Playtest switches for comparing versions with a real child. They apply from the next
   * Number Garden visit (go back to the menu and press play again).
   */
  private renderPlaytest(actions: DebugActions): void {
    const now = actions.playtest();
    const row = (label: string, choices: readonly { text: string; active: boolean; pick: () => void }[]) => {
      const line = document.createElement('div');
      line.className = 'debug-row';
      const name = document.createElement('span');
      name.textContent = label;
      line.append(name);
      for (const c of choices) {
        const b = this.button(c.text, () => {
          c.pick();
          this.renderPlaytest(actions);
        });
        if (c.active) b.classList.add('on');
        line.append(b);
      }
      return line;
    };
    const note = document.createElement('div');
    note.className = 'debug-note';
    note.textContent = 'Playtest – applies from the next Garden visit';
    this.playtestBox.replaceChildren(
      note,
      row('Sid while thinking', [
        { text: 'Slows down', active: now.sidWhileThinking === 'slow', pick: () => actions.setPlaytest({ sidWhileThinking: 'slow' }) },
        { text: 'Stops', active: now.sidWhileThinking === 'stop', pick: () => actions.setPlaytest({ sidWhileThinking: 'stop' }) },
      ]),
      row(
        'Thinking time',
        THINKING_SCALES.map((f) => ({ text: `${Math.round(f * 100)}%`, active: now.thinkingScale === f, pick: () => actions.setPlaytest({ thinkingScale: f }) })),
      ),
      row(
        'Garden answers',
        GARDEN_ANSWER_CHOICES.map((n) => ({ text: String(n), active: now.gardenAnswers === n, pick: () => actions.setPlaytest({ gardenAnswers: n }) })),
      ),
    );
  }

  /** Notes on recent Garden visits, a comment on the latest, and Copy to take them away. */
  private buildNotes(actions: DebugActions): HTMLElement {
    const box = document.createElement('div');
    box.className = 'debug-playtest debug-visits';
    const title = document.createElement('div');
    title.className = 'debug-note';
    title.textContent = 'Visit notes';
    const comment = this.button('Note on last visit', () => {
      const last = actions.notes().at(-1);
      if (!last) return;
      const text = window.prompt('What did you notice in the last visit?', last.note);
      if (text !== null) actions.commentOnLastVisit(text);
      this.renderNotes(actions.notes(), true);
    });
    const copy = this.button('Copy all', () => {
      const text = actions.notes().map(formatNote).join('\n');
      if (!text) return;
      // No clipboard access (e.g. not https): show the text so it can be copied by hand.
      const byHand = () => window.prompt('Copy these notes:', text);
      if (!navigator.clipboard) {
        byHand();
        return;
      }
      navigator.clipboard.writeText(text).then(() => {
        copy.textContent = 'Copied ✓';
        setTimeout(() => (copy.textContent = 'Copy all'), 1500);
      }, byHand);
    });
    const clear = this.button('Clear', () => {
      if (!window.confirm('Delete all visit notes on this device?')) return;
      actions.clearNotes();
      this.renderNotes(actions.notes(), true);
    });
    const row = document.createElement('div');
    row.className = 'debug-row';
    row.append(comment, copy, clear);
    box.append(title, this.notesList, row);
    this.notesActions = actions;
    this.renderNotes(actions.notes(), true);
    return box;
  }

  private notesActions: DebugActions | null = null;

  private renderNotes(notes: readonly VisitNote[], force = false): void {
    const key = notes.length === 0 ? '' : `${notes.length}/${notes.at(-1)?.endedAt}/${notes.at(-1)?.note}`;
    if (!force && key === this.lastNotesKey) return;
    this.lastNotesKey = key;
    const lines = notes.slice(-NOTES_SHOWN).map((n) => {
      const line = document.createElement('div');
      line.textContent = formatNote(n);
      return line;
    });
    if (lines.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'None yet – each Garden visit is noted here.';
      lines.push(empty);
    } else if (notes.length > NOTES_SHOWN) {
      const more = document.createElement('div');
      more.textContent = `(+${notes.length - NOTES_SHOWN} earlier)`;
      lines.unshift(more);
    }
    this.notesList.replaceChildren(...lines);
  }

  /** Cheap to call every frame; redraws a few times a second at most. */
  update(view: DebugView): void {
    const now = performance.now();
    if (now - this.lastRender < 250) return;
    this.lastRender = now;
    if (this.notesActions) this.renderNotes(this.notesActions.notes());
    const text = format(view);
    if (text === this.lastKey) return;
    this.lastKey = text;
    this.body.textContent = text;
  }
}

function format(v: DebugView): string {
  const lines: string[] = [];
  lines.push(`player  ${v.player}   ⭐ ${v.stars}`);
  lines.push(`state   ${v.appState}${v.mode ? `  mode ${v.mode}` : ''}${v.phase ? `  phase ${v.phase}` : ''}`);
  const c = v.curriculum;
  if (!c) return lines.join('\n');
  lines.push('');
  lines.push(`${c.curriculumId}${v.preview ? '  (preview – start the Garden to see live decisions)' : ''}`);
  lines.push(`frontier  ${c.frontier}/${c.groupCount}  ${c.frontierGroup}`);
  lines.push(`confidence ${c.confidence}   run ${c.streak}   checks this visit ${c.probesAsked}`);
  lines.push(c.explore ? `exploring  ${c.explore.lo} … [${c.explore.target}] … ${c.explore.hi}   right here: ${c.explore.atTarget}` : 'exploring  no (teaching at the frontier)');
  if (c.pendingRecheck) lines.push(`next       re-check ${c.pendingRecheck}`);
  if (c.comebacks.length > 0) lines.push(`again soon ${c.comebacks.join(', ')}  (missed this visit)`);
  lines.push('');
  lines.push('groups  ■ secure  ◆ assumed (p=probed i=implied, +confirms −doubts)  · open');
  for (const g of c.groups) {
    const extra = g.status === 'assumed' ? ` ${g.how === 'implied' ? 'i' : 'p'} +${g.confirms} −${g.doubts}` : '';
    const here = g.id === c.frontierGroup ? '  ◀ frontier' : '';
    lines.push(` ${STATUS_MARK[g.status]} ${g.id.padEnd(18)} ${String(g.known).padStart(2)}/${String(g.size).padEnd(3)}${extra}${here}`);
  }
  if (c.recent.length > 0) {
    lines.push('');
    lines.push('recent questions (newest last)');
    for (const r of c.recent) {
      const result = r.result === null ? (r.stage === 'introduce' ? 'taught' : '…') : r.result ? '✓' : '✗';
      lines.push(` ${(KIND_LABEL[r.kind] ?? r.kind).padEnd(8)} ${r.groupId.padEnd(18)} ${r.itemId.padEnd(12)} ${r.stage.padEnd(11)} ${result}${r.why ? `  ← ${r.why}` : ''}`);
    }
  }
  return lines.join('\n');
}
