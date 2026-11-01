import type { AudioManager } from '../../audio/AudioManager';
import { OPERATIONS } from '../../content/arithmetic/operations';
import { unitId } from '../../content/arithmetic/ArithmeticContent';
import { buildProgressReport } from '../../learning/report';
import type { MergeResult } from '../../storage/backup';
import { downloadText, pickTextFile } from '../../ui/files';
import type { UIManager } from '../../ui/UIManager';
import { NUMBER_GARDEN } from '../../worlds/worlds';
import type { BackupService } from '../services/BackupService';
import { MAX_PROFILES, type ProfileService } from '../services/ProfileService';
import type { ProgressService } from '../services/ProgressService';
import { withClick, type Navigator } from '../types';

/** The grown-ups' corner of Options: a child's progress report, and saving/loading backups. */
export class GrownUpController {
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

  showProgress(): void {
    const player = this.profiles.get(this.profiles.activeId);
    const otherUnits = OPERATIONS.flatMap((op) => op.units.map((n) => unitId(op, n)));
    this.ui.showProgressReport(
      {
        playerName: player?.name ?? 'Player',
        avatar: player?.avatar ?? '',
        visits: this.progress.worldVisits(NUMBER_GARDEN.id),
        report: buildProgressReport(this.progress.tracker, this.progress.content, NUMBER_GARDEN.curriculum, otherUnits),
      },
      this.click(() => this.nav.openOptions()),
    );
  }

  saveBackup(): void {
    const file = this.backups.createFile();
    downloadText(file.name, file.text);
  }

  loadBackup(): void {
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
    this.ui.showNotice({ icon, title, lines }, this.click(() => this.nav.openOptions()));
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
