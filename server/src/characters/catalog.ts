import type { Character } from './types';
import { SERIES_LABELS } from './seriesLabels';

const THEME_LABELS: Record<string, string> = {
  anime: 'Anime',
  films: 'Films',
  histoire: 'Histoire',
};

export interface SeriesInfo {
  id: string;
  label: string;
  count: number;
}

export interface ThemeInfo {
  id: string;
  label: string;
  count: number;
  series?: SeriesInfo[];
}

export function buildThemeCatalog(characters: Character[]): ThemeInfo[] {
  const themeIds = [...new Set(characters.map((c) => c.theme))];

  return themeIds.map((themeId) => {
    const inTheme = characters.filter((c) => c.theme === themeId);
    const seriesIds = [...new Set(inTheme.map((c) => c.series).filter((s): s is string => Boolean(s)))];

    const series =
      seriesIds.length > 0
        ? seriesIds
            .map((seriesId) => ({
              id: seriesId,
              label: SERIES_LABELS[seriesId] ?? seriesId,
              count: inTheme.filter((c) => c.series === seriesId).length,
            }))
            .sort((a, b) => a.label.localeCompare(b.label))
        : undefined;

    return {
      id: themeId,
      label: THEME_LABELS[themeId] ?? themeId,
      count: inTheme.length,
      series,
    };
  });
}
