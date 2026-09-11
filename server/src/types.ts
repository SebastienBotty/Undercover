export type Role = 'civil' | 'undercover' | 'mrwhite';

export type Phase = 'LOBBY' | 'ROLE_REVEAL' | 'THEME_SELECT' | 'CLUE_ROUND' | 'VOTE' | 'ELIMINATION' | 'END';

export type SimilarityLevel = 'none' | 'close' | 'very_close';

export type GameMode = 'classic' | 'note';

/** Why a vote resolved without eliminating anyone. The only case left once a tie triggers a
 * runoff instead of ending the vote (see tallyVotes) is nobody voting for a candidate at all
 * (everyone abstained, or nobody voted). */
export type NoEliminationReason = 'no_votes';

export interface RoomSettings {
  themes: string[];
  similarityLevel: SimilarityLevel;
  mrWhiteEnabled: boolean;
  /** Which sub-categories (anime series, film, histoire era/domain) to draw characters from, keyed
   * by theme id. A missing/empty entry for a theme means "no filter, draw from all of it". */
  seriesFilter?: Record<string, string[]>;
  /** Whether players get a countdown to submit their clue before being eliminated. Default true. */
  clueTimerEnabled?: boolean;
  /** Clue submission window in seconds, clamped to [30, 90]. Default 30. */
  clueTimerSeconds?: number;
  /** Whether the vote phase resolves on a fixed countdown rather than as soon as everyone has voted. Default true. */
  voteTimerEnabled?: boolean;
  /** Vote window in seconds, clamped to [30, 180]. Default 60. */
  voteTimerSeconds?: number;
  /** How many full clue passes happen before each vote, clamped to [1, 5]. Default 2. */
  cluePassesPerVote?: number;
  /** 'classic' (character-based, default) or 'note' (numeric-note-based). */
  mode?: GameMode;
  /** Note given to Civils in 'note' mode, clamped to [0, 20]. */
  civilNote?: number;
  /** Note given to Undercover in 'note' mode, clamped to [0, 20]. */
  undercoverNote?: number;
  /** Minimum gap between civilNote and undercoverNote in 'note' mode, clamped to [1, 20]. Default 2. */
  noteGapMin?: number;
  /** Maximum gap between civilNote and undercoverNote in 'note' mode, clamped to [noteGapMin, 20]. Default 6. */
  noteGapMax?: number;
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
  /** Phantom votes a player has accumulated by missing their clue timer, keyed by target id --
   * counted alongside real votes in the very next vote tally, then cleared regardless of outcome.
   * Lets a slow/AFK player be caught up on without eliminating them outright for a single timeout. */
  accusationVotes: Record<string, number>;
  /** When non-null, only these player ids can be voted for -- set during a tie-breaking runoff
   * restricted to the previously-tied leaders. Null means any alive player is a valid target
   * (the normal case, and also the fallback once a runoff itself ties again). */
  voteCandidateIds: string[] | null;
  round: number;
  winner: Role | null;
  lastEliminatedId: string | null;
  /** Unix ms timestamp when the current clue/theme submission window closes. Null outside CLUE_ROUND/THEME_SELECT. */
  turnDeadline: number | null;
  /** Unix ms timestamp when the vote auto-resolves early because every alive player has voted.
   * Null until that happens, and reset to null whenever a vote is retracted or the phase changes. */
  allVotedDeadline: number | null;
  /** Why the last vote resolved without eliminating anyone, shown during the ELIMINATION reveal.
   * Null when the last vote did eliminate someone, hasn't resolved yet, or resolved into a
   * tie-breaking runoff (which skips the reveal entirely and jumps straight back into VOTE). */
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
