import type { CurriculumDebugInfo } from '../../learning/CurriculumSession';

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
}

/** Only exists when the page is opened with "?debug" in the address. */
export function debugRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('debug');
  } catch {
    return false;
  }
}

const STATUS_MARK = { secure: '■', assumed: '◆', open: '·' } as const;
const KIND_LABEL: Readonly<Record<string, string>> = { probe: 'check', recheck: 're-check', learn: 'learn', review: 'review' };

/**
 * A developer/playtester panel showing what the learning engine is thinking. It is never
 * created for children: only "?debug" in the address turns it on. Press ` (backtick) to hide it.
 */
export class DebugOverlay {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private lastRender = 0;
  private lastKey = '';

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
    this.root.append(bar, this.body);
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

  /** Cheap to call every frame; redraws a few times a second at most. */
  update(view: DebugView): void {
    const now = performance.now();
    if (now - this.lastRender < 250) return;
    this.lastRender = now;
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
      lines.push(` ${(KIND_LABEL[r.kind] ?? r.kind).padEnd(8)} ${r.groupId.padEnd(18)} ${r.itemId.padEnd(12)} ${r.stage.padEnd(11)} ${result}`);
    }
  }
  return lines.join('\n');
}
