import type { FaceParams } from './SnakeAnimator';

export type BodyPattern =
  | { readonly kind: 'none' }
  | { readonly kind: 'spots'; readonly color: string; readonly every: number }
  | { readonly kind: 'stripes'; readonly color: string; readonly every: number };

export interface AccessoryDrawInfo {
  /** Head radius in pixels. The context is in the head's local frame: +x points forward. */
  readonly radius: number;
  readonly face: FaceParams;
  readonly time: number;
}

/** Hats, glasses, capes... drawn on top of the head in its local, rotated frame. */
export interface SnakeAccessory {
  readonly id: string;
  draw(ctx: CanvasRenderingContext2D, info: AccessoryDrawInfo): void;
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
  id: 'classic',
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
