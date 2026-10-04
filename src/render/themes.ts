export type ArenaThemeId = 'sky' | 'garden';

/** The look of a world. New worlds (jungle, space...) are new entries here. */
export interface ArenaTheme {
  readonly id: ArenaThemeId;
  readonly backgroundTop: string;
  readonly backgroundBottom: string;
  readonly boardLight: string;
  readonly boardDark: string;
  /** Small decorations drawn on the board (purely visual, never gameplay). */
  readonly decorations: 'none' | 'flowers';
  /** Rolling hills along the bottom of the backdrop. */
  readonly hills: readonly string[] | null;
}

export const THEMES: Readonly<Record<ArenaThemeId, ArenaTheme>> = {
  sky: {
    id: 'sky',
    backgroundTop: '#3a8dde',
    backgroundBottom: '#5b4bd6',
    boardLight: '#d4f0ff',
    boardDark: '#c2e8fd',
    decorations: 'none',
    hills: null,
  },
  garden: {
    id: 'garden',
    backgroundTop: '#7fd4ff',
    backgroundBottom: '#c7f0ff',
    boardLight: '#e6f8cf',
    boardDark: '#d6f1b6',
    decorations: 'flowers',
    hills: ['#8fd46a', '#6cbf4d'],
  },
};
