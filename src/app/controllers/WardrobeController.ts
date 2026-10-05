import type { AudioManager } from '../../audio/AudioManager';
import { SnakeAnimator } from '../../render/SnakeAnimator';
import { SnakeRenderer } from '../../render/SnakeRenderer';
import { WARDROBE } from '../../rewards/catalog';
import type { UIManager, WardrobeItemView, WardrobeView } from '../../ui/UIManager';
import type { RewardService } from '../services/RewardService';
import { withClick, type Navigator } from '../types';

/** Sid's wardrobe: spend stars on hats, glasses and patterns, with a live preview of Sid. */
export class WardrobeController {
  private readonly animator = new SnakeAnimator();
  private readonly renderer = new SnakeRenderer();
  private canvas: HTMLCanvasElement | null = null;
  private rafId: number | null = null;
  private last = 0;

  constructor(
    private readonly nav: Navigator,
    private readonly ui: UIManager,
    private readonly audio: AudioManager,
    private readonly rewards: RewardService,
  ) {}

  show(): void {
    this.canvas = this.ui.showWardrobe(this.view(), {
      onItem: (id) => this.choose(id),
      onPlay: withClick(this.audio, () => this.nav.playWorld()),
      onBack: withClick(this.audio, () => this.nav.showMenu()),
    });
    this.animator.reset(0);
    this.animator.say(this.rewards.balance > 0 ? 'Ooh, shopping!' : 'Hello!', 1.4);
    this.startPreview();
  }

  private view(): WardrobeView {
    const state = this.rewards.state;
    const balance = this.rewards.balance;
    const items: WardrobeItemView[] = WARDROBE.map((item) => {
      const owned = state.owned.includes(item.id);
      const equipped = state.equipped[item.slot] === item.id;
      const status = equipped ? 'equipped' : owned ? 'owned' : item.price <= balance ? 'buyable' : 'locked';
      return { id: item.id, icon: item.icon, name: item.name, price: item.price, state: status };
    });
    return { balance, items };
  }

  private choose(id: string): void {
    this.audio.unlock();
    const owned = this.rewards.state.owned.includes(id);
    if (owned) {
      this.rewards.equip(id);
      this.audio.play('menuSelect');
      this.animator.celebrate(0);
    } else {
      const result = this.rewards.buy(id);
      if (result.ok) {
        this.audio.play('learnAchievement');
        this.animator.celebrate(3);
        this.animator.say('Wow!', 1.2);
        this.ui.announce('New thing for Sid!');
      } else {
        // Not enough stars yet: a friendly "not yet", never a telling-off.
        this.audio.play('bonk');
        this.ui.shakeWardrobeItem(id);
        this.animator.say(`⭐ ${result.missing} more!`, 1.4);
      }
    }
    this.ui.updateWardrobe(this.view());
  }

  private startPreview(): void {
    this.stopPreview();
    this.last = performance.now();
    const frame = (now: number) => {
      const canvas = this.canvas;
      // Stop as soon as the wardrobe screen has gone.
      if (!canvas || !canvas.isConnected) {
        this.stopPreview();
        return;
      }
      const dt = Math.min((now - this.last) / 1000, 0.1);
      this.last = now;
      this.animator.update({
        dt,
        moving: true,
        travelAngle: 0,
        nearestTile: null,
        hintOffset: null,
        hintStrength: 0,
        answering: false,
        paused: false,
        streak: 0,
      });
      this.draw(canvas);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  private stopPreview(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private draw(canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cell = Math.min(h * 0.42, w / 6.5);
    this.renderer.drawPortrait(ctx, w * 0.68, h * 0.6, cell, this.animator, this.rewards.skin());
    this.renderer.drawStandaloneOverlays(ctx, w * 0.68, h * 0.6, cell, w, this.animator);
  }
}
