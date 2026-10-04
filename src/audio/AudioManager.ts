export type SoundId =
  | 'menuMove'
  | 'menuSelect'
  | 'questionEaten'
  | 'chew'
  | 'answersAppear'
  | 'correct'
  | 'grow'
  | 'streak'
  | 'incorrect'
  | 'spit'
  | 'gameOver'
  | 'learnAchievement'
  | 'factLearned'
  | 'bonk'
  | 'pause';

interface Tone {
  readonly freq: number;
  readonly to?: number;
  readonly dur: number;
  readonly type?: OscillatorType;
  readonly gain?: number;
  readonly delay?: number;
}

/**
 * Placeholder sounds synthesised with WebAudio, so the game has feedback with zero assets.
 * Register a real file with `registerAsset(id, url)` and it replaces the synth for that sound.
 */
const RECIPES: Readonly<Record<SoundId, readonly Tone[]>> = {
  menuMove: [{ freq: 660, dur: 0.05, type: 'triangle', gain: 0.1 }],
  menuSelect: [{ freq: 520, to: 880, dur: 0.12, type: 'triangle', gain: 0.18 }],
  questionEaten: [{ freq: 300, to: 640, dur: 0.12, type: 'square', gain: 0.08 }],
  chew: [
    { freq: 190, dur: 0.05, type: 'square', gain: 0.06, delay: 0.1 },
    { freq: 170, dur: 0.05, type: 'square', gain: 0.06, delay: 0.22 },
    { freq: 185, dur: 0.05, type: 'square', gain: 0.06, delay: 0.34 },
  ],
  answersAppear: [
    { freq: 700, to: 1000, dur: 0.05, type: 'sine', gain: 0.07 },
    { freq: 800, to: 1100, dur: 0.05, type: 'sine', gain: 0.07, delay: 0.09 },
    { freq: 900, to: 1200, dur: 0.05, type: 'sine', gain: 0.07, delay: 0.18 },
  ],
  correct: [
    { freq: 523, dur: 0.1, type: 'triangle', gain: 0.2 },
    { freq: 659, dur: 0.1, type: 'triangle', gain: 0.2, delay: 0.09 },
    { freq: 784, dur: 0.2, type: 'triangle', gain: 0.2, delay: 0.18 },
  ],
  grow: [{ freq: 220, to: 440, dur: 0.16, type: 'sine', gain: 0.14, delay: 0.2 }],
  streak: [
    { freq: 784, dur: 0.08, type: 'square', gain: 0.07, delay: 0.3 },
    { freq: 988, dur: 0.08, type: 'square', gain: 0.07, delay: 0.38 },
    { freq: 1175, dur: 0.08, type: 'square', gain: 0.07, delay: 0.46 },
    { freq: 1568, dur: 0.16, type: 'square', gain: 0.07, delay: 0.54 },
  ],
  incorrect: [{ freq: 320, to: 170, dur: 0.3, type: 'sawtooth', gain: 0.08 }],
  spit: [
    { freq: 520, to: 140, dur: 0.18, type: 'square', gain: 0.07 },
    { freq: 260, to: 300, dur: 0.12, type: 'triangle', gain: 0.08, delay: 0.25 },
  ],
  gameOver: [
    { freq: 392, dur: 0.22, type: 'triangle', gain: 0.16 },
    { freq: 370, dur: 0.22, type: 'triangle', gain: 0.16, delay: 0.26 },
    { freq: 349, dur: 0.22, type: 'triangle', gain: 0.16, delay: 0.52 },
    { freq: 330, to: 290, dur: 0.6, type: 'triangle', gain: 0.16, delay: 0.78 },
  ],
  learnAchievement: [
    { freq: 784, dur: 0.1, type: 'triangle', gain: 0.15 },
    { freq: 988, dur: 0.1, type: 'triangle', gain: 0.15, delay: 0.1 },
    { freq: 1175, dur: 0.1, type: 'triangle', gain: 0.15, delay: 0.2 },
    { freq: 1568, dur: 0.3, type: 'triangle', gain: 0.15, delay: 0.3 },
  ],
  factLearned: [
    { freq: 660, dur: 0.12, type: 'sine', gain: 0.16 },
    { freq: 880, dur: 0.2, type: 'sine', gain: 0.16, delay: 0.12 },
  ],
  bonk: [{ freq: 150, to: 90, dur: 0.16, type: 'square', gain: 0.1 }],
  pause: [{ freq: 440, dur: 0.08, type: 'triangle', gain: 0.12 }],
};

export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly assets = new Map<SoundId, string>();
  private readonly buffers = new Map<SoundId, AudioBuffer>();
  private mutedState: boolean;
  private readonly listeners = new Set<(muted: boolean) => void>();

  constructor(muted = false) {
    this.mutedState = muted;
  }

  get muted(): boolean {
    return this.mutedState;
  }

  setMuted(muted: boolean): void {
    this.mutedState = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.55;
    for (const l of this.listeners) l(muted);
  }

  toggleMuted(): boolean {
    this.setMuted(!this.mutedState);
    return this.mutedState;
  }

  onMutedChange(listener: (muted: boolean) => void): void {
    this.listeners.add(listener);
  }

  /** Swap a synthesised placeholder for a real audio file. */
  registerAsset(id: SoundId, url: string): void {
    this.assets.set(id, url);
    if (this.context) void this.load(id, url);
  }

  /** Browsers only allow audio after a user gesture; call this from input handlers. */
  unlock(): void {
    if (!this.context) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.context = new Ctor();
      } catch {
        return;
      }
      this.master = this.context.createGain();
      this.master.gain.value = this.mutedState ? 0 : 0.55;
      this.master.connect(this.context.destination);
      for (const [id, url] of this.assets) void this.load(id, url);
    }
    if (this.context.state === 'suspended') void this.context.resume();
  }

  play(id: SoundId): void {
    if (this.mutedState || !this.context || !this.master || this.context.state !== 'running') return;
    const buffer = this.buffers.get(id);
    if (buffer) {
      const src = this.context.createBufferSource();
      src.buffer = buffer;
      src.connect(this.master);
      src.start();
      return;
    }
    const now = this.context.currentTime;
    for (const tone of RECIPES[id]) this.playTone(tone, now);
  }

  private playTone(tone: Tone, now: number): void {
    const ctx = this.context;
    if (!ctx || !this.master) return;
    const start = now + (tone.delay ?? 0);
    const end = start + tone.dur;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type ?? 'sine';
    osc.frequency.setValueAtTime(tone.freq, start);
    if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, end);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(tone.gain ?? 0.15, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(end + 0.02);
  }

  private async load(id: SoundId, url: string): Promise<void> {
    if (!this.context) return;
    try {
      const response = await fetch(url);
      const data = await response.arrayBuffer();
      this.buffers.set(id, await this.context.decodeAudioData(data));
    } catch {
      // Keep the synthesised placeholder if the asset fails to load.
    }
  }
}
