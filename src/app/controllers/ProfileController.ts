import type { AudioManager } from '../../audio/AudioManager';
import { MAX_NAME_LENGTH } from '../../storage/StorageManager';
import type { UIManager } from '../../ui/UIManager';
import { AVATARS, type ProfileService } from '../services/ProfileService';
import { withClick, type Navigator } from '../types';

/** "Who's playing?", adding a player, and grown-up editing/deleting of players. */
export class ProfileController {
  constructor(
    private readonly nav: Navigator,
    private readonly ui: UIManager,
    private readonly audio: AudioManager,
    private readonly profiles: ProfileService,
  ) {}

  private click(action: () => void): () => void {
    return withClick(this.audio, action);
  }

  /** @param allowBack false on start-up, when a child must choose who they are first. */
  showPicker(allowBack = true): void {
    this.ui.showProfilePicker(
      this.profiles.list(),
      this.profiles.canAdd,
      {
        onPick: (id) => this.click(() => this.nav.switchPlayer(id))(),
        onAdd: this.click(() => this.showEditor(null, allowBack)),
        onEdit: (id) => this.click(() => this.showEditor(id, allowBack))(),
        onBack: this.click(() => this.nav.showMenu()),
      },
      allowBack,
    );
  }

  private showEditor(id: string | null, allowBack: boolean): void {
    const existing = id ? this.profiles.get(id) : undefined;
    const used = new Set(this.profiles.list().map((p) => p.avatar));
    // New players get the first picture nobody is using yet.
    const avatar = existing?.avatar ?? AVATARS.find((a) => !used.has(a)) ?? AVATARS[0];
    this.ui.showProfileEditor(
      {
        title: existing ? 'Change player' : 'New player',
        name: id ? this.profiles.rawName(id) : '',
        avatar,
        avatars: AVATARS,
        maxNameLength: MAX_NAME_LENGTH,
        canDelete: !!existing && this.profiles.count > 1,
      },
      {
        onSave: (name, chosen) =>
          this.click(() => {
            if (id) {
              this.profiles.edit(id, name, chosen);
              this.showPicker(allowBack);
            } else {
              const created = this.profiles.create(name, chosen);
              // A brand-new player goes straight in: they are now the active one.
              if (created) this.nav.switchPlayer(created);
              else this.showPicker(allowBack);
            }
          })(),
        onDelete: this.click(() => existing && this.confirmDelete(existing.id, existing.name, allowBack)),
        onCancel: this.click(() => this.showPicker(allowBack)),
      },
    );
  }

  private confirmDelete(id: string, name: string, allowBack: boolean): void {
    this.ui.showConfirm(
      {
        icon: '🗑',
        title: `Delete ${name}?`,
        message: 'All their stars, garden, outfits and progress will be gone for good.',
        confirmLabel: '🗑 Delete',
        cancelLabel: 'Keep',
      },
      this.click(() => {
        const wasActive = this.profiles.activeId === id;
        this.profiles.remove(id);
        // If the active player was deleted, someone else is now active: load their progress.
        if (wasActive) this.nav.reloadPlayer();
        this.showPicker(allowBack);
      }),
      this.click(() => this.showEditor(id, allowBack)),
    );
  }
}
