export type Role = 'civil' | 'undercover' | 'mrwhite';

export type Phase = 'LOBBY' | 'ROLE_REVEAL' | 'THEME_SELECT' | 'CLUE_ROUND' | 'VOTE' | 'ELIMINATION' | 'END';

export type SimilarityLevel = 'none' | 'close' | 'very_close';

export type GameMode = 'classic' | 'note';

export interface RoomSettings {
  themes: string[];
  similarityLevel: SimilarityLevel;
  mrWhiteEnabled: boolean;
  /** Which anime series to draw characters from when 'anime' is in themes. Empty/omitted = all. */
  animeSeries?: string[];
  /** Whether players get a countdown to submit their clue before being eliminated. Default true. */
  clueTimerEnabled?: boolean;
  /** Clue submission window in seconds, clamped to [30, 90]. Default 60. */
  clueTimerSeconds?: number;
  /** 'classic' (character-based, default) or 'note' (numeric-note-based). */
  mode?: GameMode;
  /** Note given to Civils in 'note' mode, clamped to [0, 20]. */
  civilNote?: number;
  /** Note given to Undercover in 'note' mode, clamped to [0, 20]. */
  undercoverNote?: number;
}

export interface Player {
  id: string; // equals the client's persisted clientId
  name: string;
  role: Role | null;
  character: string | null;
  characterImage: string | null;
  /** Numeric note in 'note' mode, null otherwise (and always null for Mr. White). */
  note: number | null;
  alive: boolean;
  connected: boolean;
}

export interface Clue {
  playerId: string;
  round: number;
  text: string;
}

export interface ThemeEntry {
  round: number;
  playerId: string;
  text: string;
}

export interface RoomState {
  code: string;
  hostId: string;
  phase: Phase;
  settings: RoomSettings;
  players: Player[];
  turnOrder: string[];
  currentTurnIndex: number;
  clues: Clue[];
  votes: Record<string, string>;
  round: number;
  winner: Role | null;
  lastEliminatedId: string | null;
  /** Unix ms timestamp when the current clue/theme submission window closes. Null outside CLUE_ROUND/THEME_SELECT. */
  turnDeadline: number | null;
  /** Player designated to submit the theme this round ('note' mode only). Null outside THEME_SELECT. */
  themeSetterId: string | null;
  /** Theme submitted for the round currently in progress ('note' mode only). */
  currentTheme: string | null;
  /** History of every theme submitted so far, one per round ('note' mode only). */
  themes: ThemeEntry[];
}
