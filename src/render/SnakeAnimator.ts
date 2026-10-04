import { approach, clamp, shortestAngle, type Vec2 } from '../core/geometry';

export type Emotion =
  | 'NORMAL'
  | 'INTERESTED'
  | 'CONCENTRATING'
  | 'EATING'
  | 'CHEWING'
  | 'HAPPY'
  | 'CELEBRATING'
  | 'EXCITED'
  | 'CONFUSED'
  | 'WORRIED'
  | 'DIZZY';

export type MouthShape = 'smile' | 'grin' | 'flat' | 'wavy' | 'o';

/** Everything the renderer needs to draw the face this frame. All values are smoothed. */
export interface FaceParams {
  eyeScale: number;
  /** Makes one eye bigger than the other (confused look). */
  eyeAsym: number;
  pupilScale: number;
  /** 0 = open, 1 = closed. */
  lid: number;
  /** ^ ^ closed happy eyes. */
  happyEyes: number;
  spiralEyes: number;
  crossEyed: number;
  /** World-space look vector; length 0 means "looking at the player". */
  lookX: number;
  lookY: number;
  mouth: MouthShape;
  mouthOpen: number;
  cheek: number;
  tongue: number;
  tongueHang: number;
  /** -1 worried .. +1 raised/excited. */
  brow: number;
}

interface FaceTarget {
  eyeScale: number;
  eyeAsym: number;
  pupilScale: number;
  lid: number;
  happyEyes: number;
  spiralEyes: number;
  crossEyed: number;
  mouth: MouthShape;
  mouthOpen: number;
  cheek: number;
  tongueHang: number;
  brow: number;
  chewing: boolean;
}

const BASE_FACE: FaceTarget = {
  eyeScale: 1,
  eyeAsym: 0,
  pupilScale: 1,
  lid: 0.12,
  happyEyes: 0,
  spiralEyes: 0,
  crossEyed: 0,
  mouth: 'smile',
  mouthOpen: 0,
  cheek: 0.15,
  tongueHang: 0,
  brow: 0.2,
  chewing: false,
};

const EMOTION_FACES: Readonly<Record<Emotion, Partial<FaceTarget>>> = {
  NORMAL: {},
  INTERESTED: { eyeScale: 1.12, pupilScale: 1.15, lid: 0, mouthOpen: 0.35, brow: 0.6 },
  CONCENTRATING: { eyeScale: 1.02, lid: 0.2, mouth: 'flat', brow: -0.35 },
  EATING: { eyeScale: 1.18, lid: 0, mouthOpen: 1, brow: 0.7 },
  CHEWING: { happyEyes: 0.8, mouth: 'flat', cheek: 1, chewing: true, brow: 0.3 },
  HAPPY: { happyEyes: 1, mouth: 'grin', cheek: 0.6, brow: 0.7 },
  CELEBRATING: { eyeScale: 1.32, pupilScale: 1.25, lid: 0, mouthOpen: 0.85, cheek: 0.7, brow: 1 },
  EXCITED: { eyeScale: 1.12, lid: 0, mouth: 'grin', cheek: 0.4, brow: 0.7 },
  CONFUSED: { eyeAsym: 0.35, pupilScale: 0.8, lid: 0.05, mouth: 'wavy', tongueHang: 1, brow: -0.6 },
  WORRIED: { eyeScale: 1.6, pupilScale: 0.6, lid: 0, crossEyed: 1, mouth: 'o', mouthOpen: 0.15, brow: -1, cheek: 0 },
  DIZZY: { spiralEyes: 1, lid: 0, mouth: 'wavy', tongueHang: 1, brow: -0.3, cheek: 0.2 },
};

export interface AnimatorContext {
  readonly dt: number;
  readonly moving: boolean;
  readonly travelAngle: number;
  /** Offset (in cells) from the head to the nearest tile, if any. */
  readonly nearestTile: Vec2 | null;
  /** Offset (in cells) from the head to the hinted correct answer, if a hint is showing. */
  readonly hintOffset: Vec2 | null;
  readonly hintStrength: number;
  readonly answering: boolean;
  readonly paused: boolean;
  readonly streak: number;
}

interface Bubble {
  readonly text: string;
  age: number;
  readonly duration: number;
}

interface Bulge {
  dist: number;
  size: number;
}

/**
 * The snake's personality: emotions, blinking, glances, tongue flicks, swallow bulges,
 * head lean and the cartoon death. Purely visual - it never touches gameplay state.
 */
export class SnakeAnimator {
  readonly face: FaceParams = {
    eyeScale: 1,
    eyeAsym: 0,
    pupilScale: 1,
    lid: 0,
    happyEyes: 0,
    spiralEyes: 0,
    crossEyed: 0,
    lookX: 1,
    lookY: 0,
    mouth: 'smile',
    mouthOpen: 0,
    cheek: 0,
    tongue: 0,
    tongueHang: 0,
    brow: 0,
  };
  emotion: Emotion = 'NORMAL';
  headAngle = 0;
  /** Extra rotation from turning (lean into turns) and head shakes. */
  headTilt = 0;
  /** 0..1 how much the body is slithering. */
  wiggle = 0;
  /** Squash/stretch impulse; positive = stretched along travel. */
  stretch = 0;
  /** 0..1 dizzy stars around the head. */
  stars = 0;
  /** Swells the tail briefly when a new segment grows. */
  tailGrow = 0;
  bubble: Bubble | null = null;
  readonly bulges: Bulge[] = [];

  private clock = 0;
  private sequence: { emotion: Emotion; duration: number }[] = [];
  private transient: { emotion: Emotion; remaining: number } | null = null;
  private blinkIn = 2.5;
  private blinkT = -1;
  private tongueIn = 3;
  private tongueT = -1;
  private glanceIn = 3;
  private glanceT = -1;
  private shakeT = 0;
  private deathT: number | null = null;
  private initialised = false;

  /** 0..1 through the death animation, or null while alive. */
  get deathProgress(): number | null {
    return this.deathT === null ? null : clamp(this.deathT / 2.7, 0, 1);
  }

  get time(): number {
    return this.clock;
  }

  reset(angle = 0): void {
    this.sequence = [];
    this.transient = null;
    this.deathT = null;
    this.bubble = null;
    this.bulges.length = 0;
    this.stars = 0;
    this.stretch = 0;
    this.tailGrow = 0;
    this.shakeT = 0;
    this.headAngle = angle;
    this.headTilt = 0;
    this.initialised = true;
  }

  // ---- Triggers ---------------------------------------------------------------------------

  /** Question (or menu snack) eaten: gulp, puff cheeks, chew. */
  eat(): void {
    this.play([
      { emotion: 'EATING', duration: 0.16 },
      { emotion: 'CHEWING', duration: 0.65 },
    ]);
    this.bulges.push({ dist: 0, size: 0.16 });
    this.stretch = -0.12;
  }

  /** A learning fact collected. */
  collectFact(): void {
    this.play([
      { emotion: 'EATING', duration: 0.16 },
      { emotion: 'CHEWING', duration: 0.5 },
      { emotion: 'HAPPY', duration: 1.4 },
    ]);
    this.bulges.push({ dist: 0, size: 0.18 });
  }

  celebrate(streak: number): void {
    this.play([
      { emotion: 'EATING', duration: 0.12 },
      { emotion: 'CELEBRATING', duration: 0.45 },
      { emotion: 'HAPPY', duration: streak >= 3 ? 1.2 : 0.8 },
    ]);
    this.bulges.push({ dist: 0, size: 0.2 });
    this.stretch = 0.22;
    this.tailGrow = 1;
    if (streak >= 3 && streak % 3 === 0) this.say(streak >= 9 ? 'UNSTOPPABLE!' : streak >= 6 ? 'On fire!' : 'Yum yum!', 1.1);
  }

  /** Wrong answer in Learn mode: spit it out, shake head, look silly. */
  spitOut(): void {
    this.play([
      { emotion: 'EATING', duration: 0.12 },
      { emotion: 'CONFUSED', duration: 0.95 },
    ]);
    this.shakeT = 0.6;
    this.stretch = -0.15;
    const lines = ['Bleurgh!', 'Pthoo!', 'Yuck!', 'Blech!', 'Ptooey!'];
    this.say(lines[Math.floor(Math.random() * lines.length)], 1.0);
  }

  /** Learn mode self-bite. */
  ouch(): void {
    this.play([{ emotion: 'DIZZY', duration: 0.9 }]);
    this.shakeT = 0.4;
    this.say('Ouch!', 0.9);
  }

  bonk(): void {
    this.play([{ emotion: 'DIZZY', duration: 0.6 }]);
    this.say('Boing!', 0.6);
  }

  /** Cartoon death: freeze, huge eyes, "Uh-oh!", wobble, dizzy stars, collapse into a pile. */
  die(): void {
    this.deathT = 0;
    this.play([
      { emotion: 'WORRIED', duration: 0.95 },
      { emotion: 'DIZZY', duration: 999 },
    ]);
    this.say('Uh-oh!', 1.3);
    this.bulges.length = 0;
  }

  grow(): void {
    this.tailGrow = 1;
  }

  say(text: string, duration: number): void {
    this.bubble = { text, age: 0, duration };
  }

  private play(seq: { emotion: Emotion; duration: number }[]): void {
    const [first, ...rest] = seq;
    this.transient = first ? { emotion: first.emotion, remaining: first.duration } : null;
    this.sequence = rest;
  }

  // ---- Per-frame update -------------------------------------------------------------------

  update(ctx: AnimatorContext): void {
    const dt = ctx.dt;
    this.clock += dt;
    if (!this.initialised) this.reset(ctx.travelAngle);

    if (this.transient) {
      this.transient.remaining -= dt;
      if (this.transient.remaining <= 0) {
        const next = this.sequence.shift();
        this.transient = next ? { emotion: next.emotion, remaining: next.duration } : null;
      }
    }
    this.emotion = this.transient?.emotion ?? this.baseEmotion(ctx);

    const target: FaceTarget = { ...BASE_FACE, ...EMOTION_FACES[this.emotion] };
    if (ctx.paused && this.deathT === null) {
      // Paused: looks up at the player, a little impatient.
      target.eyeScale = 1.12;
      target.lid = 0.25 + 0.15 * Math.max(0, Math.sin(this.clock * 1.3));
      target.mouth = 'flat';
      target.brow = -0.2;
    }
    if (ctx.streak >= 5 && this.emotion === 'NORMAL') target.cheek = 0.5;

    const f = this.face;
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    const s = k(14);
    f.eyeScale += (target.eyeScale - f.eyeScale) * s;
    f.eyeAsym += (target.eyeAsym - f.eyeAsym) * s;
    f.pupilScale += (target.pupilScale - f.pupilScale) * s;
    f.happyEyes += (target.happyEyes - f.happyEyes) * k(18);
    f.spiralEyes += (target.spiralEyes - f.spiralEyes) * k(10);
    f.crossEyed += (target.crossEyed - f.crossEyed) * k(10);
    f.cheek += (target.cheek - f.cheek) * k(12);
    f.tongueHang += (target.tongueHang - f.tongueHang) * k(8);
    f.brow += (target.brow - f.brow) * s;
    f.mouth = target.mouth;
    const chew = target.chewing ? 0.5 + 0.5 * Math.sin(this.clock * 24) : 0;
    f.mouthOpen += (Math.max(target.mouthOpen, chew * 0.45) - f.mouthOpen) * k(target.chewing ? 30 : 16);

    this.updateBlink(dt, target.lid, ctx);
    this.updateTongue(dt);
    this.updateLook(dt, ctx);
    this.updateHead(dt, ctx);

    this.wiggle = approach(this.wiggle, ctx.moving && this.deathT === null ? 1 : 0, 5, dt);
    this.stretch = approach(this.stretch, 0, 7, dt);
    this.tailGrow = approach(this.tailGrow, 0, 3, dt);
    this.stars = approach(this.stars, this.emotion === 'DIZZY' ? 1 : 0, 6, dt);

    for (const b of this.bulges) {
      b.dist += dt * 7;
      b.size *= Math.exp(-dt * 0.35);
    }
    while (this.bulges.length > 0 && this.bulges[0].dist > 80) this.bulges.shift();

    if (this.bubble) {
      this.bubble.age += dt;
      if (this.bubble.age >= this.bubble.duration) this.bubble = null;
    }
    if (this.deathT !== null) this.deathT += dt;
  }

  private baseEmotion(ctx: AnimatorContext): Emotion {
    if (this.deathT !== null) return 'DIZZY';
    const near = ctx.nearestTile;
    const nearDist = near ? Math.hypot(near.x, near.y) : Infinity;
    if (nearDist < 3.2) return 'INTERESTED';
    if (ctx.answering) return 'CONCENTRATING';
    if (ctx.streak >= 5) return 'EXCITED';
    return 'NORMAL';
  }

  private updateBlink(dt: number, lidTarget: number, ctx: AnimatorContext): void {
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      if (this.blinkT > 0.16) this.blinkT = -1;
    } else {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) {
        this.blinkT = 0;
        this.blinkIn = (ctx.paused ? 1.4 : 2.2) + Math.random() * 3;
        // Occasional double blink for character.
        if (Math.random() < 0.2) this.blinkIn = 0.3;
      }
    }
    const blink = this.blinkT >= 0 ? Math.sin((this.blinkT / 0.16) * Math.PI) : 0;
    const noBlink = this.face.spiralEyes > 0.5 || this.face.happyEyes > 0.5 || this.emotion === 'WORRIED';
    const target = Math.max(lidTarget, noBlink ? 0 : blink);
    this.face.lid = this.blinkT >= 0 ? target : approach(this.face.lid, target, 14, dt);
  }

  private updateTongue(dt: number): void {
    const allowed = this.emotion === 'NORMAL' || this.emotion === 'INTERESTED' || this.emotion === 'EXCITED';
    if (this.tongueT >= 0) {
      this.tongueT += dt;
      if (this.tongueT > 0.42) this.tongueT = -1;
    } else if (allowed) {
      this.tongueIn -= dt;
      if (this.tongueIn <= 0) {
        this.tongueT = 0;
        this.tongueIn = 2.5 + Math.random() * 4;
      }
    }
    const t = this.tongueT;
    this.face.tongue = t >= 0 ? Math.sin((t / 0.42) * Math.PI) * (0.75 + 0.25 * Math.sin(t * 60)) : 0;
  }

  private updateLook(dt: number, ctx: AnimatorContext): void {
    let lx = Math.cos(this.headAngle) * 0.8;
    let ly = Math.sin(this.headAngle) * 0.8;

    // Hint: the snake occasionally sneaks a glance at the right answer.
    if (this.glanceT >= 0) {
      this.glanceT += dt;
      if (this.glanceT > 0.75) this.glanceT = -1;
    } else if (ctx.hintOffset && ctx.hintStrength > 0) {
      this.glanceIn -= dt;
      if (this.glanceIn <= 0) {
        this.glanceT = 0;
        this.glanceIn = 4.5 - 2.5 * clamp(ctx.hintStrength, 0, 1) + Math.random();
      }
    }

    const glanceAt = this.glanceT >= 0 && ctx.hintOffset ? ctx.hintOffset : null;
    const near = ctx.nearestTile;
    const lookAt = glanceAt ?? (near && Math.hypot(near.x, near.y) < 5 ? near : null);
    if (lookAt) {
      const len = Math.hypot(lookAt.x, lookAt.y) || 1;
      lx = lookAt.x / len;
      ly = lookAt.y / len;
    }
    if (ctx.paused) {
      lx = Math.sin(this.clock * 0.9) * 0.15;
      ly = 0;
    }
    this.face.lookX = approach(this.face.lookX, lx, 12, dt);
    this.face.lookY = approach(this.face.lookY, ly, 12, dt);
  }

  private updateHead(dt: number, ctx: AnimatorContext): void {
    if (this.deathT !== null) {
      this.headTilt = Math.sin(this.clock * 9) * 0.25 * (1 - clamp(this.deathT / 1.2, 0, 1));
      return;
    }
    const diff = shortestAngle(this.headAngle, ctx.travelAngle);
    const before = this.headAngle;
    this.headAngle += diff * (1 - Math.exp(-16 * dt));
    const angularVelocity = dt > 0 ? shortestAngle(before, this.headAngle) / dt : 0;
    // Lean a little further into turns, then settle.
    let tilt = clamp(angularVelocity * 0.045, -0.35, 0.35);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      tilt += Math.sin(this.clock * 34) * 0.35 * clamp(this.shakeT / 0.6, 0, 1);
    }
    this.headTilt = approach(this.headTilt, tilt, 20, dt);
  }
}
