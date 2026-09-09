export type SimilarityLevel = 'none' | 'close' | 'very_close';

export interface RoomSettings {
  themes: string[];
  similarityLevel: SimilarityLevel;
  mrWhiteEnabled: boolean;
  /** Which anime series to draw characters from when 'anime' is in themes. Empty = all. */
  animeSeries: string[];
}

const STORAGE_KEY = 'undercover:hostSettings';

const DEFAULT_SETTINGS: RoomSettings = {
  themes: [],
  similarityLevel: 'close',
  mrWhiteEnabled: false,
  animeSeries: [],
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
