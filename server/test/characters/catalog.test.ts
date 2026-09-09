import { describe, it, expect } from 'vitest';
import { buildThemeCatalog } from '../../src/characters/catalog';
import type { Character } from '../../src/characters/types';

const characters: Character[] = [
  { id: 'a', name: 'A', theme: 'anime', series: 'one-piece', tags: [] },
  { id: 'b', name: 'B', theme: 'anime', series: 'one-piece', tags: [] },
  { id: 'c', name: 'C', theme: 'anime', series: 'naruto', tags: [] },
  { id: 'd', name: 'D', theme: 'films', tags: [] },
  { id: 'e', name: 'E', theme: 'films', tags: [] },
];

describe('buildThemeCatalog', () => {
  it('counts characters per theme', () => {
    const catalog = buildThemeCatalog(characters);
    const anime = catalog.find((t) => t.id === 'anime')!;
    const films = catalog.find((t) => t.id === 'films')!;
    expect(anime.count).toBe(3);
    expect(films.count).toBe(2);
  });

  it('groups anime characters by series with per-series counts', () => {
    const catalog = buildThemeCatalog(characters);
    const anime = catalog.find((t) => t.id === 'anime')!;
    expect(anime.series).toEqual([
      { id: 'naruto', label: 'Naruto', count: 1 },
      { id: 'one-piece', label: 'One Piece', count: 2 },
    ]);
  });

  it('omits the series field for themes with no series-tagged characters', () => {
    const catalog = buildThemeCatalog(characters);
    const films = catalog.find((t) => t.id === 'films')!;
    expect(films.series).toBeUndefined();
  });

  it('falls back to the raw slug as the label for a series with no known display name', () => {
    const withUnknownSeries: Character[] = [{ id: 'x', name: 'X', theme: 'anime', series: 'unknown-show', tags: [] }];
    const catalog = buildThemeCatalog(withUnknownSeries);
    expect(catalog[0].series).toEqual([{ id: 'unknown-show', label: 'unknown-show', count: 1 }]);
  });
});
