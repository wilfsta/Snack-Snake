export type WardrobeSlot = 'hat' | 'face' | 'skin';

/** Something Sid can wear, bought with stars. Purely cosmetic. */
export interface WardrobeItem {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly slot: WardrobeSlot;
  readonly price: number;
}

/**
 * Priced so a first garden visit (~12–18 stars) buys something straight away, and the
 * fanciest things take a few visits to save up for.
 */
export const WARDROBE: readonly WardrobeItem[] = [
  { id: 'skin:classic', name: 'Classic Sid', icon: '🐍', slot: 'skin', price: 0 },
  { id: 'hat:cap', name: 'Cap', icon: '🧢', slot: 'hat', price: 5 },
  { id: 'face:shades', name: 'Sunglasses', icon: '🕶️', slot: 'face', price: 8 },
  { id: 'hat:bow', name: 'Bow', icon: '🎀', slot: 'hat', price: 10 },
  { id: 'skin:stripes', name: 'Tiger stripes', icon: '🐯', slot: 'skin', price: 14 },
  { id: 'hat:tophat', name: 'Top hat', icon: '🎩', slot: 'hat', price: 16 },
  { id: 'skin:bee', name: 'Bumble bee', icon: '🐝', slot: 'skin', price: 20 },
  { id: 'hat:pirate', name: 'Pirate hat', icon: '🏴‍☠️', slot: 'hat', price: 24 },
  { id: 'skin:watermelon', name: 'Watermelon', icon: '🍉', slot: 'skin', price: 28 },
  { id: 'hat:crown', name: 'Crown', icon: '👑', slot: 'hat', price: 34 },
  { id: 'skin:rainbow', name: 'Rainbow', icon: '🌈', slot: 'skin', price: 45 },
];

export const DEFAULT_SKIN_ID = 'skin:classic';

export function wardrobeItem(id: string): WardrobeItem | undefined {
  return WARDROBE.find((item) => item.id === id);
}

/**
 * Things that grow in the Number Garden, in order. Each one appears as the child earns
 * stars in the garden, so learning progress becomes something they can see.
 */
export const GARDEN_PLANTS: readonly string[] = [
  '🌱', '🌷', '🌻', '🌼', '🌳', '🦋', '🍄', '🌹', '🐝', '🌸',
  '🐞', '🌲', '🌺', '🐦', '🍓', '🐌', '🌵', '🐿️', '🌾', '🦔',
];
