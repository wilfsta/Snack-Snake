import type { AudioManager } from '../../audio/AudioManager';
import { unitId } from '../../content/arithmetic/ArithmeticContent';
import { OPERATIONS } from '../../content/arithmetic/operations';
import { randInt, defaultRng } from '../../core/random';
import type { MergeResult } from '../../storage/backup';
import { downloadText, pickTextFile } from '../../ui/files';
import type { UIManager } from '../../ui/UIManager';
import { NUMBER_GARDEN } from '../../worlds/worlds';
import { saveWarning, type BackupService } from '../services/BackupService';
import { summarizeChild } from '../services/dashboard';
import { MAX_PROFILES, type ProfileService } from '../services/ProfileService';
import type { ProgressService } from '../services/ProgressService';
import { withClick, type Navigator } from '../types';

/** After answering the grown-ups' check, it isn't asked again for this long. */
const GATE_OPEN_MS = 10 * 60 * 1000;

const OTHER_UNITS = OPERATIONS.flatMap((op) => op.units.map((n) => unitId(op, n)));

/**
 * The grown-ups' area, behind a simple check: a dashboard of every child, each child's full
 * progress report, backups, and what the game does (and doesn't do) with children's data.
 */
export class GrownUpController {
  private openUntil = 0;

  constructor(
    private readonly nav: Navigator,
    private readonly ui: UIManager,
    private readonly audio: AudioManager,
    private readonly progress: ProgressService,
    private readonly profiles: ProfileService,
    private readonly backups: BackupService,
  ) {}

  private click(action: () => void): () => void {
    return withClick(this.audio, action);
  }

  /** The way in: the check first (unless answered a few minutes ago), then the dashboard. */
  enter(): void {
    if (Date.now() < this.openUntil) this.showDashboard();
    else this.askGate(false);
  }

  private askGate(retry: boolean): void {
    const a = randInt(defaultRng, 6, 9);
    const b = randInt(defaultRng, 6, 9);
    this.ui.showParentGate(
      { question: `${a} × ${b}`, retry },
      {
        onAnswer: (text) => {
          if (Number(text.trim()) === a * b) {
            this.openUntil = Date.now() + GATE_OPEN_MS;
            this.audio.play('menuSelect');
            this.showDashboard();
          } else {
            this.audio.play('incorrect');
            this.askGate(true);
          }
        },
        onCancel: this.click(() => this.nav.openOptions()),
      },
    );
  }

  showDashboard(): void {
    // Make sure the summaries include everything played so far.
    this.progress.flush();
    const children = this.profiles.all().map((p, i) => summarizeChild(p, i, this.progress.content, NUMBER_GARDEN.curriculum, OTHER_UNITS));
    this.ui.showDashboard(
      { children, saveWarning: saveWarning(this.backups.status) },
      {
        onDetails: (id) => this.click(() => this.showReport(id))(),
        onSaveBackup: this.click(() => this.saveBackup()),
        onLoadBackup: this.click(() => this.loadBackup()),
        onAbout: this.click(() => this.showAbout()),
        onBack: this.click(() => this.nav.openOptions()),
      },
    );
  }

  private showReport(id: string): void {
    const all = this.profiles.all();
    const index = all.findIndex((p) => p.id === id);
    if (index === -1) return this.showDashboard();
    const profile = all[index];
    const summary = summarizeChild(profile, index, this.progress.content, NUMBER_GARDEN.curriculum, OTHER_UNITS);
    this.ui.showProgressReport(
      { playerName: summary.name, avatar: profile.avatar, visits: profile.worldVisits[NUMBER_GARDEN.id] ?? 0, report: summary.report },
      this.click(() => this.showDashboard()),
    );
  }

  private showAbout(): void {
    this.notice('🔒', 'About & privacy', [
      'Snack Snake has no accounts, no adverts, no in-app purchases and no tracking.',
      'Names, stars and learning progress are stored only in this browser on this device. Nothing is sent anywhere.',
      'A backup file is the only copy that leaves the browser, and only when you save one.',
    ]);
  }

  private saveBackup(): void {
    const file = this.backups.createFile();
    downloadText(file.name, file.text);
  }

  private loadBackup(): void {
    pickTextFile(
      '.json,application/json',
      (text) => {
        const result = this.backups.load(text);
        if (!result) {
          this.notice('🤔', "That's not a backup", ['Choose a file saved with “Save a backup” (its name starts with snack-snake-backup).']);
          return;
        }
        // The active player may have been replaced by a newer copy, or be someone else now.
        this.nav.reloadPlayer();
        this.notice('📂', 'Backup loaded', describe(result));
      },
      () => this.notice('😕', "Couldn't read that file", ['Please try again.']),
    );
  }

  private notice(icon: string, title: string, lines: readonly string[]): void {
    this.ui.showNotice({ icon, title, lines }, this.click(() => this.showDashboard()));
  }
}

function describe(r: MergeResult): string[] {
  const names = (list: readonly string[]) => list.join(', ');
  const lines: string[] = [];
  if (r.added.length) lines.push(`Added: ${names(r.added)}.`);
  if (r.updated.length) lines.push(`Brought up to date: ${names(r.updated)}.`);
  if (r.unchanged.length) lines.push(`Already up to date here: ${names(r.unchanged)}.`);
  if (r.skipped.length) lines.push(`No room for: ${names(r.skipped)} (${MAX_PROFILES} players at most).`);
  return lines;
}
