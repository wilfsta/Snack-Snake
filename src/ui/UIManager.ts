import type { Direction } from '../core/geometry';
import type { GameModeId } from '../game/modes';
import type { MasteryState } from '../learning/mastery';
import type { TouchControlsPreference } from '../storage/StorageManager';
import { button, el } from './dom';
import { findNeighbour } from './spatialNav';

export interface TableChoice {
  readonly unitId: string;
  readonly label: string;
  readonly detail: string | null;
  readonly wide?: boolean;
}

export interface MenuHandlers {
  readonly worldName: string;
  /** The player whose turn it is. */
  readonly player: { readonly name: string; readonly avatar: string };
  onPlayer(): void;
  readonly stars: number;
  /** Something new can be bought: make the wardrobe button call for attention. */
  readonly wardrobeHasNew: boolean;
  onWorld(): void;
  onWardrobe(): void;
  onPlay(): void;
  onLearn(): void;
  onClassic(): void;
  onOptions(): void;
}

export interface PlayerCardView {
  readonly id: string;
  readonly name: string;
  readonly avatar: string;
  readonly stars: number;
  readonly active: boolean;
}

export interface ProfilePickerHandlers {
  onPick(id: string): void;
  onAdd(): void;
  onEdit(id: string): void;
  onBack(): void;
}

export interface ProfileEditorView {
  readonly title: string;
  readonly name: string;
  readonly avatar: string;
  readonly avatars: readonly string[];
  readonly maxNameLength: number;
  /** Shown only when editing an existing player who is not the last one. */
  readonly canDelete: boolean;
}

export interface ProfileEditorHandlers {
  onSave(name: string, avatar: string): void;
  onDelete(): void;
  onCancel(): void;
}

export interface ConfirmView {
  readonly icon: string;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

export interface GardenVisitView {
  readonly starsThisVisit: number;
  readonly balance: number;
  /** Everything growing in the garden; the last `newCount` of them are new this visit. */
  readonly plants: readonly string[];
  readonly newCount: number;
  readonly starsToNextPlant: number | null;
  /** Icons of wardrobe items that can be bought right now. */
  readonly affordableIcons: readonly string[];
}

export interface GardenVisitHandlers {
  onContinue(): void;
  onWardrobe(): void;
  onHome(): void;
}

export type WardrobeItemState = 'equipped' | 'owned' | 'buyable' | 'locked';

export interface WardrobeItemView {
  readonly id: string;
  readonly icon: string;
  readonly name: string;
  readonly price: number;
  readonly state: WardrobeItemState;
}

export interface WardrobeView {
  readonly balance: number;
  readonly items: readonly WardrobeItemView[];
}

export interface WardrobeHandlers {
  onItem(id: string): void;
  onPlay(): void;
  onBack(): void;
}

export interface SubjectChoice {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly example: string;
}

export interface OptionsView {
  readonly speed: number;
  readonly speedLevels: readonly { readonly label: string; readonly icon: string }[];
  readonly walls: 'wrap' | 'solid';
  readonly answerCount: number;
  readonly minAnswers: number;
  readonly maxAnswers: number;
  readonly inGame: boolean;
}

export interface OptionsHandlers {
  onSpeed(level: number): void;
  onWalls(walls: 'wrap' | 'solid'): void;
  onAnswers(count: number): void;
  onBack(): void;
}

export interface GameOverView {
  readonly title: string;
  readonly reason: string;
  readonly reveal: { readonly statement: string; readonly wrongLabel: string | null } | null;
  readonly score: number;
  readonly best: number;
  readonly newBest: boolean;
  readonly correct: number;
  readonly bestStreak: number;
}

export interface SessionCompleteView {
  readonly title: string;
  readonly counts: Readonly<Record<MasteryState, number>>;
  readonly items: readonly { readonly short: string; readonly state: MasteryState }[];
  readonly correctThisSession: number;
  readonly newlyMastered: number;
}

export interface HudView {
  readonly mode: GameModeId;
  readonly unitLabel: string;
  readonly score: number;
  readonly streak: number;
  readonly best: number;
  readonly question: string | null;
  readonly progress: { readonly done: number; readonly total: number } | null;
}

export interface UIHooks {
  onToggleMute(): void;
  onCycleTouchControls(): void;
  onPauseButton(): void;
  onTeachingTap(): void;
  onFocusMove(): void;
}

const STATE_LABEL: Readonly<Record<MasteryState, string>> = {
  MASTERED: 'Mastered',
  PRACTISING: 'Practising',
  LEARNING: 'Learning',
  NEW: 'New',
};
const STATE_ICON: Readonly<Record<MasteryState, string>> = {
  MASTERED: '★',
  PRACTISING: '◆',
  LEARNING: '●',
  NEW: '○',
};

const TOUCH_LABEL: Readonly<Record<TouchControlsPreference, string>> = {
  auto: 'Touch pad: Auto',
  on: 'Touch pad: On',
  off: 'Touch pad: Off',
};

function $(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node;
}

/**
 * All DOM-based UI: menus, overlays, HUD, teaching banner. The canvas is drawn elsewhere.
 * Screens are real <button>s, so keyboard, screen readers and focus styles work for free;
 * gamepad/arrow navigation moves focus spatially.
 */
export class UIManager {
  private readonly screens = $('screens');
  private readonly hud = $('hud');
  private readonly teach = $('teach');
  private readonly toast = $('toast');
  private readonly live = $('live');
  private readonly controller = $('controller-indicator');
  private readonly app = $('app');
  private current: HTMLElement | null = null;
  private backAction: (() => void) | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private hudCache = '';
  private muted = false;
  private touchPref: TouchControlsPreference = 'auto';

  private readonly hudUnit = $('hud-unit');
  private readonly hudScore = $('hud-score');
  private readonly hudScoreBox = $('hud-score-box');
  private readonly hudStreak = $('hud-streak');
  private readonly hudStreakBox = $('hud-streak-box');
  private readonly hudBest = $('hud-best');
  private readonly hudBestBox = $('hud-best-box');
  private readonly hudQuestion = $('hud-question');
  private readonly hudProgress = $('hud-progress');

  constructor(private readonly hooks: UIHooks) {
    $('hud-pause').addEventListener('click', () => hooks.onPauseButton());
    window.addEventListener('resize', () => this.fitScreen());
    // Webfont arrival changes text sizes, so re-fit once fonts are ready.
    void document.fonts?.ready.then(() => this.fitScreen());
    this.teach.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      hooks.onTeachingTap();
    });
  }

  // ---- Screens ------------------------------------------------------------------------------

  hasScreen(): boolean {
    return this.current !== null;
  }

  clearScreen(): void {
    this.screens.replaceChildren();
    this.screens.hidden = true;
    this.current = null;
    this.backAction = null;
  }

  /**
   * The front door. A young child should be able to start playing without reading anything:
   * one huge, picture-led button into the world. Other modes sit quietly underneath.
   */
  showMenu(h: MenuHandlers): void {
    const world = button(
      el(
        'span',
        { class: 'world-card' },
        el('span', { class: 'world-art', text: '🌻🐍🍎', attrs: { 'aria-hidden': 'true' } }),
        el('span', { class: 'world-name', text: h.worldName }),
        el('span', { class: 'world-go', text: '▶' }),
      ),
      'world-btn',
      h.onWorld,
      { 'data-autofocus': '', 'aria-label': `Play ${h.worldName}` },
    );
    const player = button(
      el(
        'span',
        { class: 'player-chip' },
        el('span', { class: 'player-avatar', text: h.player.avatar, attrs: { 'aria-hidden': 'true' } }),
        el('span', { class: 'player-name', text: h.player.name }),
      ),
      'player-btn',
      h.onPlayer,
      { 'aria-label': `Playing as ${h.player.name}. Change player` },
    );
    const screen = el(
      'div',
      { class: 'screen menu-screen' },
      player,
      el(
        'h1',
        { class: 'logo', attrs: { 'aria-label': 'Snack Snake' } },
        el('span', { class: 'logo-a', text: 'Snack' }),
        el('span', { class: 'logo-b', text: 'Snake' }),
      ),
      world,
      button(
        el(
          'span',
          { class: 'wardrobe-card' },
          el('span', { class: 'wardrobe-art', text: '🐍🎩', attrs: { 'aria-hidden': 'true' } }),
          el('span', { class: 'star-count', text: `⭐ ${h.stars}` }),
          h.wardrobeHasNew ? el('span', { class: 'new-badge', text: '!' }) : null,
        ),
        `wardrobe-btn${h.wardrobeHasNew ? ' has-new' : ''}`,
        h.onWardrobe,
        { 'aria-label': `Sid's wardrobe, ${h.stars} stars${h.wardrobeHasNew ? ', something new to get' : ''}` },
      ),
      el(
        'div',
        { class: 'more-games', attrs: { role: 'group', 'aria-label': 'More games' } },
        button(this.smallMode('🏆', 'Play'), 'mini-mode mode-play', h.onPlay),
        button(this.smallMode('🌱', 'Learn'), 'mini-mode mode-learn', h.onLearn),
        button(this.smallMode('🍎', 'Classic'), 'mini-mode mode-classic', h.onClassic),
      ),
      this.settingsRow(h.onOptions),
    );
    this.show(screen, null);
  }

  private smallMode(icon: string, title: string): HTMLElement {
    return el(
      'span',
      { class: 'mini-card' },
      el('span', { class: 'mini-icon', text: icon, attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'mini-title', text: title }),
    );
  }

  showSubjectSelect(
    mode: GameModeId,
    subjects: readonly SubjectChoice[],
    focusId: string | null,
    onPick: (subjectId: string) => void,
    onBack: () => void,
  ): void {
    const grid = el('div', { class: 'subject-grid' });
    for (const s of subjects) {
      const attrs: Record<string, string> = { 'aria-label': s.name };
      if (s.id === focusId) attrs['data-autofocus'] = '';
      grid.append(
        button(
          el(
            'span',
            { class: 'subject-card' },
            el('span', { class: 'subject-symbol', text: s.symbol, attrs: { 'aria-hidden': 'true' } }),
            el('span', { class: 'subject-name', text: s.name }),
            el('span', { class: 'subject-example', text: s.example }),
          ),
          `subject-btn subject-${s.id}`,
          () => onPick(s.id),
          attrs,
        ),
      );
    }
    if (!grid.querySelector('[data-autofocus]')) grid.firstElementChild?.setAttribute('data-autofocus', '');
    const screen = el(
      'div',
      { class: `screen table-screen ${mode}` },
      el(
        'div',
        { class: 'screen-header' },
        button('◀ Back', 'back-btn', onBack, { 'aria-label': 'Back to menu' }),
        el('h2', { text: mode === 'play' ? 'What shall we play?' : 'What shall we learn?' }),
      ),
      grid,
    );
    this.show(screen, onBack);
  }

  showOptions(view: OptionsView, handlers: OptionsHandlers): void {
    const speedName = el('span', { class: 'option-value' });
    const setSpeedName = (i: number) => {
      const lvl = view.speedLevels[i];
      speedName.textContent = lvl ? `${lvl.icon} ${lvl.label}` : '';
    };
    setSpeedName(view.speed);
    const speed = this.slider(0, view.speedLevels.length - 1, view.speed, 'Snake speed', (v) => {
      setSpeedName(v);
      handlers.onSpeed(v);
    });
    const ticks = el('div', { class: 'slider-ticks', attrs: { 'aria-hidden': 'true' } }, ...view.speedLevels.map((l) => el('span', { text: l.icon })));

    const wrapBtn = button('🌀 Wrap around', 'seg-btn', () => setWalls('wrap'));
    const solidBtn = button('🧱 Walls', 'seg-btn', () => setWalls('solid'));
    const wallsNote = el('p', { class: 'option-note' });
    const setWalls = (walls: 'wrap' | 'solid', notify = true) => {
      wrapBtn.setAttribute('aria-pressed', String(walls === 'wrap'));
      solidBtn.setAttribute('aria-pressed', String(walls === 'solid'));
      wallsNote.textContent =
        walls === 'wrap'
          ? 'Go off one side and pop out the other.'
          : 'Hitting a wall ends the game! (In Learn mode Sid just bounces off.)';
      if (notify) handlers.onWalls(walls);
    };
    setWalls(view.walls, false);

    const answersName = el('span', { class: 'option-value' });
    const setAnswersName = (n: number) => (answersName.textContent = `${n} answers`);
    setAnswersName(view.answerCount);
    const answers = this.slider(view.minAnswers, view.maxAnswers, view.answerCount, 'Answers on screen', (v) => {
      setAnswersName(v);
      handlers.onAnswers(v);
    });
    const answerTicks = el(
      'div',
      { class: 'slider-ticks', attrs: { 'aria-hidden': 'true' } },
      el('span', { text: 'Easier' }),
      el('span', { text: 'Harder' }),
    );

    const screen = el(
      'div',
      { class: 'screen overlay-screen' },
      el(
        'div',
        { class: 'card wide-card options-card' },
        el('h2', { text: '⚙ Options' }),
        el(
          'div',
          { class: 'option-group' },
          el('div', { class: 'option-label' }, el('span', { text: 'Snake speed' }), speedName),
          speed,
          ticks,
        ),
        el(
          'div',
          { class: 'option-group' },
          el('div', { class: 'option-label' }, el('span', { text: 'Edges' })),
          el('div', { class: 'segmented', attrs: { role: 'group', 'aria-label': 'Edges' } }, wrapBtn, solidBtn),
          wallsNote,
        ),
        el(
          'div',
          { class: 'option-group' },
          el('div', { class: 'option-label' }, el('span', { text: 'Answers on screen' }), answersName),
          answers,
          answerTicks,
        ),
        this.settingsRow(null, true),
        view.inGame ? el('p', { class: 'option-note', text: 'Speed and edges change from the next game.' }) : null,
        button('✓ Done', 'big-btn primary', handlers.onBack),
      ),
    );
    speed.setAttribute('data-autofocus', '');
    this.show(screen, handlers.onBack);
  }

  private slider(min: number, max: number, value: number, label: string, onChange: (v: number) => void): HTMLInputElement {
    const input = el('input', {
      class: 'slider',
      attrs: { type: 'range', min: String(min), max: String(max), step: '1', value: String(value), 'aria-label': label },
    });
    input.addEventListener('input', () => onChange(Number(input.value)));
    return input;
  }

  showTableSelect(
    mode: GameModeId,
    title: string,
    choices: readonly TableChoice[],
    focusUnit: string | null,
    onPick: (unitId: string) => void,
    onBack: () => void,
  ): void {
    const grid = el('div', { class: 'table-grid' });
    for (const choice of choices) {
      const attrs: Record<string, string> = { 'aria-label': `${choice.label}${choice.detail ? `, ${choice.detail}` : ''}` };
      if (choice.unitId === focusUnit) attrs['data-autofocus'] = '';
      grid.append(
        button(
          el('span', {}, el('span', { class: 'table-label', text: choice.label }), choice.detail ? el('span', { class: 'table-detail', text: choice.detail }) : null),
          `table-btn${choice.wide ? ' wide' : ''} ${mode}`,
          () => onPick(choice.unitId),
          attrs,
        ),
      );
    }
    if (!grid.querySelector('[data-autofocus]')) grid.firstElementChild?.setAttribute('data-autofocus', '');
    const screen = el(
      'div',
      { class: `screen table-screen ${mode}` },
      el(
        'div',
        { class: 'screen-header' },
        button('◀ Back', 'back-btn', onBack, { 'aria-label': 'Back' }),
        el('h2', { text: title }),
      ),
      grid,
    );
    this.show(screen, onBack);
  }

  showPause(onResume: () => void, onRestart: () => void, onMenu: () => void, onOptions: () => void): void {
    const screen = el(
      'div',
      { class: 'screen overlay-screen' },
      el(
        'div',
        { class: 'card' },
        el('h2', { text: 'Paused' }),
        el('p', { class: 'muted', text: 'Sid is waiting for you…' }),
        el(
          'div',
          { class: 'stack' },
          button('▶ Keep going', 'big-btn primary', onResume, { 'data-autofocus': '' }),
          button('↻ Start again', 'big-btn', onRestart),
          button('⌂ Menu', 'big-btn', onMenu),
        ),
        this.settingsRow(onOptions),
      ),
    );
    this.show(screen, onResume);
  }

  showGameOver(view: GameOverView, onRetry: () => void, onChangeTable: () => void, onMenu: () => void): void {
    const reveal = view.reveal
      ? el(
          'div',
          { class: 'reveal' },
          el('div', { class: 'reveal-label', text: 'The answer was' }),
          el('div', { class: 'reveal-fact' }, el('span', { class: 'tick', text: '✓', attrs: { 'aria-hidden': 'true' } }), view.reveal.statement),
          view.reveal.wrongLabel
            ? el('div', { class: 'reveal-wrong' }, el('span', { class: 'cross', text: '✗', attrs: { 'aria-hidden': 'true' } }), `You picked ${view.reveal.wrongLabel}`)
            : null,
        )
      : null;
    const screen = el(
      'div',
      { class: 'screen overlay-screen' },
      el(
        'div',
        { class: 'card' },
        el('h2', { class: 'wobble', text: view.title }),
        el('p', { class: 'muted', text: view.reason }),
        reveal,
        el(
          'div',
          { class: 'stats' },
          this.stat('Score', String(view.score)),
          this.stat('Correct', String(view.correct)),
          this.stat('Best streak', String(view.bestStreak)),
          this.stat('High score', String(view.best)),
        ),
        view.newBest ? el('div', { class: 'new-best', text: '🎉 New high score! 🎉' }) : null,
        el(
          'div',
          { class: 'stack' },
          button('↻ Play again', 'big-btn primary', onRetry, { 'data-autofocus': '' }),
          button('▦ Change table', 'big-btn', onChangeTable),
          button('⌂ Menu', 'big-btn', onMenu),
        ),
      ),
    );
    this.show(screen, onMenu);
    this.announce(`Game over. ${view.reveal ? `The answer was ${view.reveal.statement}.` : ''} Score ${view.score}.`);
  }

  showSessionComplete(view: SessionCompleteView, onContinue: () => void, onChangeTable: () => void, onPlay: () => void): void {
    const gems = el('div', { class: 'gem-grid' });
    for (const item of view.items) {
      gems.append(
        el(
          'div',
          { class: `gem gem-${item.state.toLowerCase()}`, attrs: { title: `${item.short}: ${STATE_LABEL[item.state]}` } },
          el('span', { class: 'gem-icon', text: STATE_ICON[item.state], attrs: { 'aria-hidden': 'true' } }),
          el('span', { class: 'gem-text', text: item.short }),
        ),
      );
    }
    const order: MasteryState[] = ['MASTERED', 'PRACTISING', 'LEARNING', 'NEW'];
    const legend = el('div', { class: 'legend' });
    for (const state of order) {
      legend.append(
        el(
          'div',
          { class: `legend-item gem-${state.toLowerCase()}` },
          el('span', { class: 'legend-icon', text: STATE_ICON[state], attrs: { 'aria-hidden': 'true' } }),
          el('span', { class: 'legend-count', text: String(view.counts[state]) }),
          el('span', { class: 'legend-label', text: STATE_LABEL[state] }),
        ),
      );
    }
    const screen = el(
      'div',
      { class: 'screen overlay-screen' },
      el(
        'div',
        { class: 'card wide-card' },
        el('h2', { text: 'Brilliant learning!' }),
        el('div', { class: 'unit-title', text: view.title }),
        legend,
        gems,
        view.newlyMastered > 0
          ? el('div', { class: 'new-best', text: `⭐ ${view.newlyMastered} new star${view.newlyMastered === 1 ? '' : 's'} collected! ⭐` })
          : null,
        el(
          'div',
          { class: 'row-buttons' },
          button('▶ Keep learning', 'big-btn primary', onContinue, { 'data-autofocus': '' }),
          button('▦ Change table', 'big-btn', onChangeTable),
          button('🏆 Play', 'big-btn', onPlay),
        ),
      ),
    );
    this.show(screen, onChangeTable);
    this.announce(`${view.title}. ${view.counts.MASTERED} mastered, ${view.counts.PRACTISING} practising, ${view.counts.LEARNING} learning, ${view.counts.NEW} new.`);
  }

  /**
   * Scales the open screen down (never up) so it always fits the window, however small the
   * window is or however far the browser is zoomed in.
   */
  fitScreen(): void {
    const screen = this.current;
    if (!screen) return;
    screen.style.setProperty('zoom', '1');
    const style = getComputedStyle(this.screens);
    const availW = this.screens.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availH = this.screens.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const rect = screen.getBoundingClientRect();
    const needW = Math.max(rect.width, screen.scrollWidth);
    const needH = Math.max(rect.height, screen.scrollHeight);
    if (needW <= 0 || needH <= 0) return;
    const scale = Math.min(1, availW / needW, availH / needH);
    screen.style.setProperty('zoom', String(Math.max(0.25, Math.floor(scale * 100) / 100)));
  }

  private show(screen: HTMLElement, back: (() => void) | null): void {
    this.screens.replaceChildren(screen);
    this.screens.hidden = false;
    this.current = screen;
    this.backAction = back;
    this.fitScreen();
    const target = screen.querySelector<HTMLElement>('[data-autofocus]') ?? screen.querySelector<HTMLElement>('button');
    target?.focus({ preventScroll: true });
  }

  /**
   * "Who's playing?" – big animal pictures so each child can find themselves without reading.
   * Editing is a small pencil on each card, aimed at grown-ups.
   */
  showProfilePicker(players: readonly PlayerCardView[], canAdd: boolean, h: ProfilePickerHandlers, allowBack: boolean): void {
    const grid = el('div', { class: 'player-grid' });
    for (const p of players) {
      const card = el('div', { class: `player-card${p.active ? ' active' : ''}` });
      const pick = button(
        el(
          'span',
          { class: 'player-card-inner' },
          el('span', { class: 'player-card-avatar', text: p.avatar, attrs: { 'aria-hidden': 'true' } }),
          el('span', { class: 'player-card-name', text: p.name }),
          el('span', { class: 'player-card-stars', text: `⭐ ${p.stars}` }),
        ),
        'player-pick',
        () => h.onPick(p.id),
        { 'aria-label': `${p.name}, ${p.stars} stars`, ...(p.active ? { 'data-autofocus': '' } : {}) },
      );
      const edit = button('✏️', 'player-edit', () => h.onEdit(p.id), { 'aria-label': `Change ${p.name}` });
      card.append(pick, edit);
      grid.append(card);
    }
    if (canAdd) {
      grid.append(
        el(
          'div',
          { class: 'player-card add' },
          button(
            el('span', { class: 'player-card-inner' }, el('span', { class: 'player-card-avatar', text: '＋' }), el('span', { class: 'player-card-name', text: 'New player' })),
            'player-pick',
            h.onAdd,
            { 'aria-label': 'Add a new player' },
          ),
        ),
      );
    }
    const screen = el(
      'div',
      { class: 'screen table-screen' },
      el(
        'div',
        { class: 'screen-header' },
        allowBack ? button('◀ Back', 'back-btn', h.onBack, { 'aria-label': 'Back' }) : el('span', {}),
        el('h2', { text: "Who's playing? 👋" }),
      ),
      grid,
    );
    this.show(screen, allowBack ? h.onBack : null);
  }

  showProfileEditor(view: ProfileEditorView, h: ProfileEditorHandlers): void {
    let avatar = view.avatar;
    const preview = el('div', { class: 'editor-avatar', text: avatar, attrs: { 'aria-hidden': 'true' } });
    const nameInput = el('input', {
      class: 'name-input',
      attrs: {
        type: 'text',
        value: view.name,
        maxlength: String(view.maxNameLength),
        placeholder: 'Name (optional)',
        'aria-label': 'Name',
        autocomplete: 'off',
        spellcheck: 'false',
      },
    });
    const picks = el('div', { class: 'avatar-grid', attrs: { role: 'group', 'aria-label': 'Choose a picture' } });
    const buttons: HTMLButtonElement[] = [];
    for (const a of view.avatars) {
      const b = button(a, `avatar-btn${a === avatar ? ' chosen' : ''}`, () => {
        avatar = a;
        preview.textContent = a;
        for (const other of buttons) {
          other.classList.toggle('chosen', other === b);
          other.setAttribute('aria-pressed', String(other === b));
        }
      }, { 'aria-pressed': String(a === avatar), 'aria-label': `Picture ${a}` });
      if (a === avatar) b.setAttribute('data-autofocus', '');
      buttons.push(b);
      picks.append(b);
    }
    const save = () => h.onSave(nameInput.value, avatar);
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save();
      }
    });
    const screen = el(
      'div',
      { class: 'screen overlay-screen' },
      el(
        'div',
        { class: 'card wide-card' },
        el('h2', { text: view.title }),
        el('div', { class: 'editor-top' }, preview, nameInput),
        picks,
        el(
          'div',
          { class: 'row-buttons' },
          button('✓ Save', 'big-btn primary', save),
          button('✕ Cancel', 'big-btn', h.onCancel),
        ),
        view.canDelete ? button('🗑 Delete player', 'small-btn danger', h.onDelete) : null,
      ),
    );
    this.show(screen, h.onCancel);
  }

  /** A grown-up style "are you sure?" – the safe choice is focused first. */
  showConfirm(view: ConfirmView, onConfirm: () => void, onCancel: () => void): void {
    const screen = el(
      'div',
      { class: 'screen overlay-screen' },
      el(
        'div',
        { class: 'card' },
        el('div', { class: 'confirm-icon', text: view.icon, attrs: { 'aria-hidden': 'true' } }),
        el('h2', { text: view.title }),
        el('p', { class: 'muted', text: view.message }),
        el(
          'div',
          { class: 'row-buttons' },
          button(view.cancelLabel, 'big-btn primary', onCancel, { 'data-autofocus': '' }),
          button(view.confirmLabel, 'big-btn danger', onConfirm),
        ),
      ),
    );
    this.show(screen, onCancel);
  }

  /** End of a garden visit: stars earned, the garden (new plants pop in), and Sid's shopping. No reading needed. */
  showGardenVisit(view: GardenVisitView, h: GardenVisitHandlers): void {
    const garden = el('div', { class: 'garden-plot', attrs: { role: 'img', 'aria-label': `Your garden has ${view.plants.length} things growing` } });
    const firstNew = view.plants.length - view.newCount;
    view.plants.forEach((plant, i) => {
      const p = el('span', { class: `plant${i >= firstNew ? ' new' : ''}`, text: plant });
      if (i >= firstNew) p.style.animationDelay = `${600 + (i - firstNew) * 450}ms`;
      garden.append(p);
    });
    if (view.starsToNextPlant !== null) {
      garden.append(
        el('span', { class: 'plant next', attrs: { title: 'Next' } }, el('span', { class: 'next-mark', text: '?' }), el('span', { class: 'next-cost', text: `⭐${view.starsToNextPlant}` })),
      );
    }
    if (view.plants.length === 0 && view.starsToNextPlant === null) garden.append(el('span', { class: 'plant', text: '🌱' }));

    const shop = button(
      el(
        'span',
        { class: 'wardrobe-card' },
        el('span', { class: 'wardrobe-art', text: '🐍🎩', attrs: { 'aria-hidden': 'true' } }),
        view.affordableIcons.length > 0
          ? el('span', { class: 'can-buy', text: view.affordableIcons.slice(0, 3).join(' ') })
          : el('span', { class: 'star-count', text: `⭐ ${view.balance}` }),
      ),
      `wardrobe-btn${view.affordableIcons.length > 0 ? ' has-new' : ''}`,
      h.onWardrobe,
      { 'aria-label': "Sid's wardrobe" },
    );

    const screen = el(
      'div',
      { class: 'screen overlay-screen' },
      el(
        'div',
        { class: 'card wide-card garden-card' },
        el('div', { class: 'big-stars', text: `⭐ +${view.starsThisVisit}`, attrs: { 'aria-label': `${view.starsThisVisit} stars this time` } }),
        garden,
        view.newCount > 0 ? el('div', { class: 'new-best', text: '🌱 ✨' }) : null,
        shop,
        el(
          'div',
          { class: 'row-buttons' },
          button('▶', 'big-btn primary play-big', h.onContinue, { 'data-autofocus': '', 'aria-label': 'Keep playing' }),
          button('⌂', 'big-btn', h.onHome, { 'aria-label': 'Home' }),
        ),
      ),
    );
    this.show(screen, h.onHome);
    this.announce(`${view.starsThisVisit} stars! ${view.newCount > 0 ? 'Something new grew in your garden.' : ''}`);
  }

  private wardrobeButtons = new Map<string, HTMLButtonElement>();
  private wardrobeBalance: HTMLElement | null = null;

  /** Sid's wardrobe. Returns the canvas for the live preview of Sid. */
  showWardrobe(view: WardrobeView, h: WardrobeHandlers): HTMLCanvasElement {
    const preview = el('canvas', { class: 'sid-preview', attrs: { 'aria-label': 'Sid wearing the chosen outfit', role: 'img' } });
    this.wardrobeBalance = el('div', { class: 'big-stars', text: `⭐ ${view.balance}` });
    this.wardrobeButtons.clear();
    const grid = el('div', { class: 'wardrobe-grid' });
    view.items.forEach((item, i) => {
      const b = button(el('span', {}), 'wear-btn', () => h.onItem(item.id));
      if (i === 0) b.setAttribute('data-autofocus', '');
      this.wardrobeButtons.set(item.id, b);
      grid.append(b);
    });
    const screen = el(
      'div',
      { class: 'screen overlay-screen' },
      el(
        'div',
        { class: 'card wide-card wardrobe-card-screen' },
        el('div', { class: 'wardrobe-top' }, preview, this.wardrobeBalance),
        grid,
        el(
          'div',
          { class: 'row-buttons' },
          button('▶', 'big-btn primary play-big', h.onPlay, { 'aria-label': 'Play in the garden' }),
          button('⌂', 'big-btn', h.onBack, { 'aria-label': 'Home' }),
        ),
      ),
    );
    this.updateWardrobe(view);
    this.show(screen, h.onBack);
    return preview;
  }

  updateWardrobe(view: WardrobeView): void {
    if (this.wardrobeBalance) this.wardrobeBalance.textContent = `⭐ ${view.balance}`;
    for (const item of view.items) {
      const b = this.wardrobeButtons.get(item.id);
      if (!b) continue;
      b.className = `wear-btn ${item.state}`;
      const status =
        item.state === 'equipped' ? '✓' : item.state === 'owned' ? '' : item.price === 0 ? '' : `⭐${item.price}`;
      const parts: Node[] = [
        el('span', { class: 'wear-icon', text: item.icon, attrs: { 'aria-hidden': 'true' } }),
        el('span', { class: 'wear-status', text: status }),
      ];
      if (item.state === 'locked') parts.push(el('span', { class: 'wear-lock', text: '🔒', attrs: { 'aria-hidden': 'true' } }));
      b.replaceChildren(...parts);
      const label = {
        equipped: `${item.name}, wearing`,
        owned: `${item.name}, put on`,
        buyable: `${item.name}, get for ${item.price} stars`,
        locked: `${item.name}, needs ${item.price} stars`,
      }[item.state];
      b.setAttribute('aria-label', label);
      b.setAttribute('aria-pressed', String(item.state === 'equipped'));
    }
  }

  /** Little "not yet" wiggle on a wardrobe item. */
  shakeWardrobeItem(id: string): void {
    const b = this.wardrobeButtons.get(id);
    if (!b) return;
    b.classList.remove('shake');
    void b.offsetWidth;
    b.classList.add('shake');
  }

  private stat(label: string, value: string): HTMLElement {
    return el('div', { class: 'stat' }, el('div', { class: 'stat-value', text: value }), el('div', { class: 'stat-label', text: label }));
  }

  private settingsRow(onOptions: (() => void) | null, includeTouch = false): HTMLElement {
    const mute = button(this.muted ? '🔇 Sound off' : '🔊 Sound on', 'small-btn sound-toggle', () => this.hooks.onToggleMute(), {
      'aria-pressed': String(!this.muted),
    });
    const row = el('div', { class: 'settings-row' }, mute);
    if (includeTouch) row.append(button(TOUCH_LABEL[this.touchPref], 'small-btn touch-toggle', () => this.hooks.onCycleTouchControls()));
    if (onOptions) row.append(button('⚙ Options', 'small-btn', onOptions));
    return row;
  }

  // ---- Navigation ----------------------------------------------------------------------------

  navigate(direction: Direction): void {
    if (!this.current) return;
    const active = document.activeElement as HTMLElement | null;
    // Sliders: left/right change the value, up/down move between options.
    if (active instanceof HTMLInputElement && active.type === 'range' && (direction === 'left' || direction === 'right')) {
      const before = active.value;
      if (direction === 'right') active.stepUp();
      else active.stepDown();
      if (active.value !== before) {
        active.dispatchEvent(new Event('input', { bubbles: true }));
        this.hooks.onFocusMove();
      }
      return;
    }
    const buttons = [...this.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')];
    if (buttons.length === 0) return;
    if (!active || !buttons.includes(active)) {
      buttons[0].focus();
      return;
    }
    const next = findNeighbour(active, buttons, direction);
    if (next) {
      next.focus();
      this.hooks.onFocusMove();
    }
  }

  activateFocused(): void {
    if (!this.current) return;
    const active = document.activeElement;
    if (active instanceof HTMLButtonElement && this.current.contains(active)) active.click();
    else this.current.querySelector<HTMLElement>('button')?.focus();
  }

  back(): void {
    this.backAction?.();
  }

  // ---- Settings display -------------------------------------------------------------------------

  setMuted(muted: boolean): void {
    this.muted = muted;
    for (const b of document.querySelectorAll<HTMLButtonElement>('.sound-toggle')) {
      b.textContent = muted ? '🔇 Sound off' : '🔊 Sound on';
      b.setAttribute('aria-pressed', String(!muted));
    }
  }

  setTouchPreference(pref: TouchControlsPreference): void {
    this.touchPref = pref;
    for (const b of document.querySelectorAll<HTMLButtonElement>('.touch-toggle')) b.textContent = TOUCH_LABEL[pref];
  }

  setTouchControlsVisible(visible: boolean): void {
    this.app.classList.toggle('show-touch', visible);
  }

  /** Shows "Controller connected" briefly, then shrinks to a small icon so it never covers buttons. */
  setControllerConnected(connected: boolean): void {
    const wasHidden = this.controller.hidden;
    this.controller.hidden = !connected;
    if (!connected || !wasHidden) return;
    this.controller.classList.remove('compact');
    if (this.controllerTimer) clearTimeout(this.controllerTimer);
    this.controllerTimer = setTimeout(() => this.controller.classList.add('compact'), 3000);
  }

  private controllerTimer: ReturnType<typeof setTimeout> | null = null;

  // ---- HUD -------------------------------------------------------------------------------------

  setHudVisible(visible: boolean): void {
    this.hud.hidden = !visible;
    this.app.classList.toggle('in-game', visible);
    this.hudCache = '';
  }

  updateHud(view: HudView): void {
    const key = JSON.stringify(view);
    if (key === this.hudCache) return;
    this.hudCache = key;
    this.hudUnit.textContent = view.unitLabel;
    this.hudScore.textContent = String(view.score);
    this.hudStreak.textContent = String(view.streak);
    this.hudBest.textContent = String(view.best);
    // Garden: just a star count (the score chip). No scores, records or streaks to worry about.
    this.hudScoreBox.hidden = view.mode === 'learn';
    this.hudBestBox.hidden = view.mode === 'learn' || view.mode === 'garden';
    this.hudStreakBox.hidden = view.mode === 'classic' || view.mode === 'garden';
    this.hudStreakBox.classList.toggle('hot', view.streak >= 3);
    this.hudQuestion.textContent = view.question ? `${view.question.replace(/\n/g, '')} = ?` : '';
    this.hudQuestion.classList.toggle('visible', !!view.question);

    this.hudProgress.hidden = !view.progress;
    if (view.progress) {
      const { done, total } = view.progress;
      const dots: HTMLElement[] = [];
      for (let i = 0; i < total; i++) dots.push(el('span', { class: `dot${i < done ? ' done' : ''}` }));
      this.hudProgress.replaceChildren(...dots);
      this.hudProgress.setAttribute('aria-label', `${done} of ${total} done`);
    }
  }

  // ---- Teaching banner -------------------------------------------------------------------------

  get teachingVisible(): boolean {
    return !this.teach.hidden;
  }

  showTeaching(statement: string, caption: string | null, steps: readonly string[], stepIntervalMs: number): void {
    const chips = el('div', { class: 'teach-chips' });
    steps.forEach((step, i) => {
      const chip = el('span', { class: 'chip', text: step });
      chip.style.animationDelay = `${900 + i * stepIntervalMs}ms`;
      if (i === steps.length - 1) chip.classList.add('last');
      chips.append(chip);
    });
    const parts: Node[] = [
      el('div', { class: 'teach-tag', text: '✨ New fact! ✨' }),
      el('div', { class: 'teach-fact', text: statement }),
    ];
    if (caption && steps.length > 0) parts.push(el('div', { class: 'teach-caption', text: caption }));
    parts.push(chips, el('div', { class: 'teach-hint', text: 'Tap or press ✕ / Enter to carry on' }));
    this.teach.replaceChildren(...parts);
    this.teach.hidden = false;
    this.announce(`New fact: ${statement}`);
  }

  hideTeaching(): void {
    this.teach.hidden = true;
    this.teach.replaceChildren();
  }

  // ---- Messages --------------------------------------------------------------------------------

  flash(message: string, tone: 'good' | 'gentle' = 'good'): void {
    this.toast.textContent = message;
    this.toast.className = `toast show ${tone}`;
    this.toast.hidden = false;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast.className = 'toast';
      this.toast.hidden = true;
    }, 1600);
    this.announce(message);
  }

  announce(text: string): void {
    this.live.textContent = '';
    // Re-set on the next frame so screen readers announce repeated messages.
    requestAnimationFrame(() => (this.live.textContent = text));
  }
}
