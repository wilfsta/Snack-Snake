import { clamp, easeOutCubic, lerp, type Vec2 } from '../core/geometry';
import { drawStar, FONT_STACK, type Layout } from './layout';
import { drawTile, type TileLike } from './tileRenderer';

type ParticleShape = 'dot' | 'star' | 'confetti';

interface Particle {
  shape: ParticleShape;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  gravity: number;
}

interface TextPop {
  text: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface TileGhost {
  tile: TileLike;
  mode: 'suck' | 'spit';
  from: Vec2;
  to: Vec2;
  life: number;
  maxLife: number;
  spin: number;
}

const PARTY_COLORS = ['#ff5d8f', '#ffd23f', '#3ec1ff', '#7bdc4c', '#b07cff', '#ff9a3c'];

/**
 * Particles, score pop-ups, and "ghost" tiles being sucked in or spat out.
 * All positions are in grid units so effects scale with the arena.
 */
export class Effects {
  private particles: Particle[] = [];
  private texts: TextPop[] = [];
  private ghosts: TileGhost[] = [];

  clear(): void {
    this.particles = [];
    this.texts = [];
    this.ghosts = [];
  }

  burst(at: Vec2, count: number, opts: { shapes?: ParticleShape[]; colors?: string[]; speed?: number } = {}): void {
    const shapes = opts.shapes ?? ['star', 'confetti', 'dot'];
    const colors = opts.colors ?? PARTY_COLORS;
    const speed = opts.speed ?? 6;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        shape: shapes[i % shapes.length],
        x: at.x,
        y: at.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - speed * 0.35,
        life: 0,
        maxLife: 0.6 + Math.random() * 0.6,
        size: 0.1 + Math.random() * 0.14,
        color: colors[i % colors.length],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 12,
        gravity: 9,
      });
    }
  }

  /** Little puffs, e.g. where tail segments were bitten off. */
  poof(cells: readonly Vec2[]): void {
    for (const cell of cells) {
      this.burst({ x: cell.x + 0.5, y: cell.y + 0.5 }, 3, { shapes: ['dot'], colors: ['#ffffff', '#c8f5b8'], speed: 2.5 });
    }
  }

  popText(at: Vec2, text: string, color = '#ffffff', size = 0.8, duration = 1.1): void {
    this.texts.push({ text, x: at.x, y: at.y, life: 0, maxLife: duration, color, size });
  }

  suck(tile: TileLike, mouth: Vec2): void {
    this.ghosts.push({
      tile,
      mode: 'suck',
      from: { x: tile.x + tile.w / 2, y: tile.y + tile.h / 2 },
      to: mouth,
      life: 0,
      maxLife: 0.28,
      spin: (Math.random() - 0.5) * 2,
    });
  }

  spit(tile: TileLike, mouth: Vec2, angle: number): void {
    const dist = 2.6;
    this.ghosts.push({
      tile,
      mode: 'spit',
      from: mouth,
      to: { x: mouth.x - Math.cos(angle) * dist, y: mouth.y - Math.sin(angle) * dist - 1.2 },
      life: 0,
      maxLife: 0.75,
      spin: (Math.random() < 0.5 ? -1 : 1) * 5,
    });
    this.burst(mouth, 6, { shapes: ['dot'], colors: ['#ffffff', '#bfe9ff'], speed: 3.5 });
  }

  update(dtSeconds: number): void {
    for (const p of this.particles) {
      p.life += dtSeconds;
      p.vy += p.gravity * dtSeconds;
      p.vx *= Math.exp(-1.5 * dtSeconds);
      p.x += p.vx * dtSeconds;
      p.y += p.vy * dtSeconds;
      p.rot += p.vr * dtSeconds;
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife);
    for (const t of this.texts) {
      t.life += dtSeconds;
      t.y -= dtSeconds * 1.1;
    }
    this.texts = this.texts.filter((t) => t.life < t.maxLife);
    for (const g of this.ghosts) g.life += dtSeconds;
    this.ghosts = this.ghosts.filter((g) => g.life < g.maxLife);
  }

  draw(ctx: CanvasRenderingContext2D, layout: Layout): void {
    const c = layout.cell;
    for (const g of this.ghosts) {
      const t = clamp(g.life / g.maxLife, 0, 1);
      const e = easeOutCubic(t);
      const x = lerp(g.from.x, g.to.x, e);
      const y = lerp(g.from.y, g.to.y, e) + (g.mode === 'spit' ? 4 * t * t : 0);
      const scale = g.mode === 'suck' ? 1 - e * 0.9 : 1 - t * 0.4;
      const cx = g.tile.x + g.tile.w / 2;
      const cy = g.tile.y + g.tile.h / 2;
      drawTile(ctx, layout, g.tile, 0, {
        scale,
        dx: x - cx,
        dy: y - cy,
        rotation: g.spin * t,
        alpha: g.mode === 'spit' ? 1 - t : 1,
        bob: false,
      });
    }

    for (const p of this.particles) {
      const alpha = 1 - clamp(p.life / p.maxLife, 0, 1);
      const x = layout.ox + p.x * c;
      const y = layout.oy + p.y * c;
      const s = p.size * c;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.shape === 'star') {
        drawStar(ctx, x, y, s * 1.3, s * 0.55, p.rot);
        ctx.fill();
      } else if (p.shape === 'confetti') {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot);
        ctx.fillRect(-s, -s * 0.4, s * 2, s * 0.8);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, s * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.life / t.maxLife;
      const pop = Math.min(1, t.life / 0.12);
      const size = t.size * c * (0.7 + 0.3 * pop);
      ctx.globalAlpha = 1 - clamp((k - 0.7) / 0.3, 0, 1);
      ctx.font = `700 ${size}px ${FONT_STACK}`;
      const x = clamp(layout.ox + t.x * c, layout.ox + size * 2, layout.ox + layout.cols * c - size * 2);
      const y = Math.max(layout.oy + size, layout.oy + t.y * c);
      ctx.lineWidth = Math.max(3, size * 0.18);
      ctx.strokeStyle = '#2b2d5c';
      ctx.lineJoin = 'round';
      ctx.strokeText(t.text, x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, x, y);
    }
    ctx.globalAlpha = 1;
  }
}
