import type { AudioManager } from '../../audio/AudioManager';
import { mixedUnitId, unitId } from '../../content/arithmetic/ArithmeticContent';
import { MULTIPLICATION, operationById, OPERATIONS } from '../../content/arithmetic/operations';
import { MAX_ANSWERS, MIN_ANSWERS, SPEED_LEVELS, type GameModeId } from '../../game/modes';
import type { TableChoice, UIManager } from '../../ui/UIManager';
import { NUMBER_GARDEN } from '../../worlds/worlds';
import type { ProgressService } from '../services/ProgressService';
import type { RewardService } from '../services/RewardService';
import type { SettingsService } from '../services/SettingsService';
import { withClick, type Navigator } from '../types';

const SUBJECT_EXAMPLES: Readonly<Record<string, string>> = { mul: '6 × 4', add: '7 + 3', sub: '9 − 2', div: '12 ÷ 3' };

const TABLE_TITLES: Readonly<Record<string, string>> = {
  mul: 'Pick a times table!',
  add: 'What are we adding?',
  sub: 'What are we taking away?',
  div: 'What are we dividing by?',
};

export const CLASSIC_UNIT = 'classic';

/** Builds the menu screens. Navigation between them goes through the Navigator. */
export class MenuController {
  constructor(
    private readonly nav: Navigator,
    private readonly ui: UIManager,
    private readonly audio: AudioManager,
    private readonly settings: SettingsService,
    private readonly progress: ProgressService,
    private readonly rewards: RewardService,
  ) {}

  private click(action: () => void): () => void {
    return withClick(this.audio, action);
  }

  showMenu(): void {
    this.ui.showMenu({
      worldName: NUMBER_GARDEN.name,
      stars: this.rewards.balance,
      wardrobeHasNew: this.rewards.affordable().length > 0,
      onWorld: this.click(() => this.nav.playWorld()),
      onWardrobe: this.click(() => this.nav.openWardrobe()),
      onPlay: this.click(() => this.nav.openSubjectSelect('play')),
      onLearn: this.click(() => this.nav.openSubjectSelect('learn')),
      onClassic: this.click(() => this.nav.startGame({ mode: 'classic', unitId: CLASSIC_UNIT })),
      onOptions: this.click(() => this.nav.openOptions()),
    });
  }

  showSubjectSelect(mode: GameModeId): void {
    const subjects = OPERATIONS.map((op) => ({ id: op.id, symbol: op.symbol, name: op.name, example: SUBJECT_EXAMPLES[op.id] ?? '' }));
    this.ui.showSubjectSelect(
      mode,
      subjects,
      this.settings.lastSubject,
      (subjectId) =>
        this.click(() => {
          this.settings.rememberSubject(subjectId);
          this.nav.openTableSelect(mode, subjectId);
        })(),
      this.click(() => this.nav.showMenu()),
    );
  }

  showTableSelect(mode: GameModeId, subjectId: string): void {
    const op = operationById(subjectId) ?? MULTIPLICATION;
    const engine = this.progress.engine;
    const choices: TableChoice[] = op.units.map((n) => {
      const id = unitId(op, n);
      let detail: string | null = null;
      if (mode === 'play') {
        const best = this.progress.bestScore('play', id);
        detail = best ? `Best ${best}` : null;
      } else {
        const counts = engine.summarizeUnit(id).counts;
        const total = counts.NEW + counts.LEARNING + counts.PRACTISING + counts.MASTERED;
        detail = counts.NEW < total ? `★ ${counts.MASTERED} / ${total}` : 'New!';
      }
      return { unitId: id, label: op.unitLabel(n), detail };
    });
    if (mode === 'play') {
      const mixed = mixedUnitId(op);
      const best = this.progress.bestScore('play', mixed);
      choices.push({ unitId: mixed, label: 'MIXED', detail: best ? `Best ${best}` : 'All of them', wide: true });
    }
    this.ui.showTableSelect(
      mode,
      TABLE_TITLES[op.id] ?? 'Pick one!',
      choices,
      this.settings.lastUnit(mode),
      (id) => this.click(() => this.nav.startGame({ mode, unitId: id }))(),
      this.click(() => this.nav.openSubjectSelect(mode)),
    );
  }

  showOptions(inGame: boolean): void {
    const opts = this.settings.options;
    this.ui.showOptions(
      {
        speed: opts.speed,
        speedLevels: SPEED_LEVELS,
        walls: opts.walls,
        answerCount: opts.answerCount,
        minAnswers: MIN_ANSWERS,
        maxAnswers: MAX_ANSWERS,
        inGame,
      },
      {
        onSpeed: (speed) => this.settings.setSpeed(speed),
        onWalls: (walls) => {
          this.settings.setWalls(walls);
          this.audio.play('menuSelect');
        },
        onAnswers: (count) => this.settings.setAnswerCount(count),
        onBack: this.click(() => {
          this.progress.flush();
          this.nav.closeOptions();
        }),
      },
    );
  }
}
