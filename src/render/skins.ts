import { ACCESSORIES } from './accessories';
import type { FaceParams } from './SnakeAnimator';

export type BodyPattern =
  | { readonly kind: 'none' }
  | { readonly kind: 'spots'; readonly color: string; readonly every: number }
  | { readonly kind: 'stripes'; readonly color: string; readonly every: number }
  | { readonly kind: 'rainbow' };

export interface AccessoryDrawInfo {
  /** Head radius in pixels. The context is in the head's local frame: +x points forward. */
  readonly radius: number;
  readonly face: FaceParams;
  readonly time: number;
}

export interface UprightDrawInfo {
  /** Head centre in canvas pixels; the context is not rotated (hats stay upright). */
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly face: FaceParams;
  readonly time: number;
}

/** Hats, glasses, capes... Implement either or both drawing hooks. */
export interface SnakeAccessory {
  readonly id: string;
  /** Drawn in the head's rotated frame (e.g. glasses on the eyes). */
  draw?(ctx: CanvasRenderingContext2D, info: AccessoryDrawInfo): void;
  /** Drawn upright on top of the head (e.g. hats). */
  drawUpright?(ctx: CanvasRenderingContext2D, info: UprightDrawInfo): void;
}

/**
 * Everything visual about a snake character. The renderer reads only from here, so new
 * characters (pirate, robot, space snake...) are new data + optional accessories, not new code paths.
 */
export interface SnakeSkin {
  readonly id: string;
  readonly name: string;
  readonly body: string;
  readonly outline: string;
  readonly highlight: string;
  readonly pattern: BodyPattern;
  readonly eyeWhite: string;
  readonly pupil: string;
  readonly cheek: string;
  readonly mouth: string;
  readonly tongue: string;
  /** Head size relative to a cell. */
  readonly headScale: number;
  /** Body thickness relative to a cell, at the neck. */
  readonly bodyScale: number;
  readonly accessories: readonly SnakeAccessory[];
}

export const CLASSIC_SKIN: SnakeSkin = {
  id: 'skin:classic',
  name: 'Sid the Snake',
  body: '#4fcf4a',
  outline: '#1f6b2a',
  highlight: '#b9f7a0',
  pattern: { kind: 'spots', color: '#2fa543', every: 6 },
  eyeWhite: '#ffffff',
  pupil: '#1b1b2f',
  cheek: '#ff8fb1',
  mouth: '#7a1f35',
  tongue: '#ff4f7b',
  headScale: 1.08,
  bodyScale: 1,
  accessories: [],
};

export const DEFAULT_SKIN = CLASSIC_SKIN;

/** Body patterns from Sid's wardrobe. */
export const SKINS: Readonly<Record<string, SnakeSkin>> = {
  'skin:classic': CLASSIC_SKIN,
  'skin:stripes': {
    ...CLASSIC_SKIN,
    id: 'skin:stripes',
    body: '#ff9f1c',
    outline: '#7a3e00',
    highlight: '#ffd08a',
    pattern: { kind: 'stripes', color: '#3a2200', every: 5 },
  },
  'skin:bee': {
    ...CLASSIC_SKIN,
    id: 'skin:bee',
    body: '#ffd23f',
    outline: '#4d3a00',
    highlight: '#fff3b0',
    pattern: { kind: 'stripes', color: '#2b2b2b', every: 4 },
  },
  'skin:watermelon': {
    ...CLASSIC_SKIN,
    id: 'skin:watermelon',
    body: '#ff5d73',
    outline: '#1e7a3a',
    highlight: '#ffb3be',
    pattern: { kind: 'spots', color: '#2b1b1b', every: 5 },
    cheek: '#ffffff',
  },
  'skin:rainbow': {
    ...CLASSIC_SKIN,
    id: 'skin:rainbow',
    body: '#7b5cff',
    outline: '#3d2a9e',
    highlight: '#ffffff',
    pattern: { kind: 'rainbow' },
  },
};

/** Sid as currently dressed: a body pattern plus any hat and glasses. */
export function composeSkin(skinId: string, hatId: string | null, faceId: string | null): SnakeSkin {
  const base = SKINS[skinId] ?? CLASSIC_SKIN;
  const accessories = [faceId, hatId].map((id) => (id ? ACCESSORIES[id] : undefined)).filter((a): a is SnakeAccessory => !!a);
  return { ...base, accessories };
}
