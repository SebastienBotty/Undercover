export type SimilarityLevel = 'none' | 'close' | 'very_close';

export type GameMode = 'classic' | 'note';

export const CLUE_TIMER_MIN_SECONDS = 30;
export const CLUE_TIMER_MAX_SECONDS = 90;
export const CLUE_TIMER_DEFAULT_SECONDS = 30;

export const VOTE_TIMER_MIN_SECONDS = 30;
export const VOTE_TIMER_MAX_SECONDS = 180;
export const VOTE_TIMER_DEFAULT_SECONDS = 60;

export interface RoomSettings {
  themes: string[];
  similarityLevel: SimilarityLevel;
  mrWhiteEnabled: boolean;
  /** Which anime series to draw characters from when 'anime' is in themes. Empty = all. */
  animeSeries: string[];
  /** Whether players get a countdown to submit their clue before being eliminated. */
  clueTimerEnabled: boolean;
  /** Clue submission window in seconds, between CLUE_TIMER_MIN_SECONDS and CLUE_TIMER_MAX_SECONDS. */
  clueTimerSeconds: number;
  /** Whether the vote phase resolves on a fixed countdown rather than as soon as everyone has voted. */
  voteTimerEnabled: boolean;
  /** Vote window in seconds, between VOTE_TIMER_MIN_SECONDS and VOTE_TIMER_MAX_SECONDS. */
  voteTimerSeconds: number;
  /** 'classic' (character-based) or 'note' (numeric-note-based). */
  mode: GameMode;
  /** Whether an eliminated player's role/character/note is revealed to the other players. */
  revealRoleOnElimination: boolean;
}

const STORAGE_KEY = 'undercover:hostSettings';

const DEFAULT_SETTINGS: RoomSettings = {
  themes: [],
  similarityLevel: 'close',
  mrWhiteEnabled: false,
  animeSeries: [],
  clueTimerEnabled: true,
  clueTimerSeconds: CLUE_TIMER_DEFAULT_SECONDS,
  voteTimerEnabled: true,
  voteTimerSeconds: VOTE_TIMER_DEFAULT_SECONDS,
  mode: 'classic',
  revealRoleOnElimination: true,
};

export function getStoredHostSettings(): RoomSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function storeHostSettings(settings: RoomSettings): void {
  // Guard against SSR/build-time calls, where `window` doesn't exist yet.
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// The server's RoomSettings only guarantees themes/similarityLevel/mrWhiteEnabled -- fill in the
// rest with defaults so non-host viewers can render a room's live settings safely.
export function normalizeSettings(settings: Partial<RoomSettings> | null | undefined): RoomSettings {
  return { ...DEFAULT_SETTINGS, ...settings };
}
