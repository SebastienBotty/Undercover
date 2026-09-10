export type Role = 'civil' | 'undercover' | 'mrwhite';

export type Phase = 'LOBBY' | 'ROLE_REVEAL' | 'THEME_SELECT' | 'CLUE_ROUND' | 'VOTE' | 'ELIMINATION' | 'END';

export type SimilarityLevel = 'none' | 'close' | 'very_close';

export type GameMode = 'classic' | 'note';

/** Why a vote resolved without eliminating anyone. 'no_votes' when nobody voted for a candidate
 * (everyone abstained, or nobody voted at all); 'tie' when two or more candidates share the lead;
 * 'no_majority' when a single candidate leads but their votes don't add up to a strict majority
 * of alive players (e.g. 1 vote out of 4 alive players, the other 3 abstaining). */
export type NoEliminationReason = 'tie' | 'no_votes' | 'no_majority';

export interface RoomSettings {
  themes: string[];
  similarityLevel: SimilarityLevel;
  mrWhiteEnabled: boolean;
  /** Which anime series to draw characters from when 'anime' is in themes. Empty/omitted = all. */
  animeSeries?: string[];
  /** Whether players get a countdown to submit their clue before being eliminated. Default true. */
  clueTimerEnabled?: boolean;
  /** Clue submission window in seconds, clamped to [30, 90]. Default 30. */
  clueTimerSeconds?: number;
  /** Whether the vote phase resolves on a fixed countdown rather than as soon as everyone has voted. Default true. */
  voteTimerEnabled?: boolean;
  /** Vote window in seconds, clamped to [30, 180]. Default 60. */
  voteTimerSeconds?: number;
  /** 'classic' (character-based, default) or 'note' (numeric-note-based). */
  mode?: GameMode;
  /** Note given to Civils in 'note' mode, clamped to [0, 20]. */
  civilNote?: number;
  /** Note given to Undercover in 'note' mode, clamped to [0, 20]. */
  undercoverNote?: number;
  /** Whether an eliminated player's role/character/note is revealed to the other players. Default true. */
  revealRoleOnElimination?: boolean;
}

export interface Player {
  id: string; // equals the client's persisted clientId
  name: string;
  role: Role | null;
  character: string | null;
  characterImage: string | null;
  /** Human-readable source work (e.g. "One Piece") for anime characters, null otherwise. */
  characterSeries: string | null;
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
  /** null means the player explicitly abstained. A missing entry means they haven't acted yet. */
  votes: Record<string, string | null>;
  round: number;
  winner: Role | null;
  lastEliminatedId: string | null;
  /** Unix ms timestamp when the current clue/theme submission window closes. Null outside CLUE_ROUND/THEME_SELECT. */
  turnDeadline: number | null;
  /** Unix ms timestamp when the vote auto-resolves early because every alive player has voted.
   * Null until that happens, and reset to null whenever a vote is retracted or the phase changes. */
  allVotedDeadline: number | null;
  /** Why the last vote resolved without eliminating anyone ('tie' or 'no_votes'), shown during the
   * ELIMINATION reveal. Null when the last vote did eliminate someone, or hasn't resolved yet. */
  noEliminationReason: NoEliminationReason | null;
  /** Player designated to submit the theme this round ('note' mode only). Null outside THEME_SELECT. */
  themeSetterId: string | null;
  /** Theme submitted for the round currently in progress ('note' mode only). */
  currentTheme: string | null;
  /** History of every theme submitted so far, one per round ('note' mode only). */
  themes: ThemeEntry[];
  /** Client ids permanently rejected on any future JOIN_ROOM attempt (host kick or the player's
   * own explicit LEAVE_ROOM), including across a RESTART_GAME back to LOBBY. A player who merely
   * loses connection (closed tab, dropped network) is NOT added here -- they can always rejoin. */
  bannedClientIds: string[];
}
