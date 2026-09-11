import { describe, it, expect } from 'vitest';
import { selectCharacterPair } from '../../src/characters/selectPair';
import type { Character } from '../../src/characters/types';

const pool: Character[] = [
  { id: 'a', name: 'A', theme: 't1', tags: ['x', 'y', 'z'] },
  { id: 'b', name: 'B', theme: 't1', tags: ['x', 'y', 'w'] }, // 2 shared with A -> close
  { id: 'c', name: 'C', theme: 't1', tags: ['p', 'q', 'r'] }, // 0 shared with A -> none
  { id: 'd', name: 'D', theme: 't2', tags: ['x', 'y', 'z'] }, // different theme
];

describe('selectCharacterPair', () => {
  it('only considers characters from the requested themes', () => {
    const result = selectCharacterPair(pool, ['t1'], 'none', () => 0);
    expect([result.civilCharacter.theme, result.undercoverCharacter.theme]).toEqual(['t1', 't1']);
  });

  it('picks a pair matching the exact requested level when available', () => {
    const result = selectCharacterPair(pool, ['t1'], 'close', () => 0);
    const ids = [result.civilCharacter.id, result.undercoverCharacter.id].sort();
    expect(ids).toEqual(['a', 'b']);
    expect(result.levelUsed).toBe('close');
    expect(result.wasRelaxed).toBe(false);
  });

  it('relaxes toward "none" when no pair matches the requested level', () => {
    const result = selectCharacterPair(pool, ['t1'], 'very_close', () => 0);
    expect(result.wasRelaxed).toBe(true);
    expect(['close', 'none']).toContain(result.levelUsed);
  });

  it('throws when fewer than 2 characters are available in the selected themes', () => {
    expect(() => selectCharacterPair(pool, ['t2'], 'none')).toThrow();
  });

  it('randomly assigns which character goes to civils vs undercover', () => {
    const low = selectCharacterPair(pool, ['t1'], 'none', () => 0);
    const high = selectCharacterPair(pool, ['t1'], 'none', () => 0.99);
    expect(low.civilCharacter.id).not.toBe(high.civilCharacter.id);
  });
});

describe('selectCharacterPair with seriesFilter filtering', () => {
  const animePool: Character[] = [
    { id: 'zoro', name: 'Zoro', theme: 'anime', series: 'one-piece', tags: ['x', 'y', 'z'] },
    { id: 'luffy', name: 'Luffy', theme: 'anime', series: 'one-piece', tags: ['x', 'y', 'w'] },
    { id: 'naruto', name: 'Naruto', theme: 'anime', series: 'naruto', tags: ['p', 'q', 'r'] },
    { id: 'sasuke', name: 'Sasuke', theme: 'anime', series: 'naruto', tags: ['p', 'q', 's'] },
  ];

  it('only picks from the selected series when seriesFilter has entries for the theme', () => {
    // naruto/sasuke share tags 'p' and 'q' (2 shared -> 'close'), so request that level.
    const result = selectCharacterPair(animePool, ['anime'], 'close', () => 0, { anime: ['naruto'] });
    const ids = [result.civilCharacter.id, result.undercoverCharacter.id];
    expect(ids.every((id) => ['naruto', 'sasuke'].includes(id))).toBe(true);
  });

  it('considers every character in the theme when seriesFilter has no entry for it', () => {
    // With very_close requested and no shared tags across series, only same-series pairs match at
    // that level -- an empty/missing filter must still be able to reach across both series' pools.
    expect(() => selectCharacterPair(animePool, ['anime'], 'none', () => 0, {})).not.toThrow();
  });

  it('throws when the selected series has fewer than 2 matching characters', () => {
    expect(() =>
      selectCharacterPair(animePool, ['anime'], 'none', () => 0, { anime: ['death-note'] })
    ).toThrow();
  });

  it('does not apply one theme\'s series filter to another theme', () => {
    const mixedPool: Character[] = [
      ...animePool,
      { id: 'gandalf', name: 'Gandalf', theme: 'films', tags: ['x', 'y', 'z'] },
      { id: 'dumbledore', name: 'Dumbledore', theme: 'films', tags: ['x', 'y', 'w'] }, // 2 shared -> 'close'
    ];
    const result = selectCharacterPair(mixedPool, ['films'], 'close', () => 0, { anime: ['one-piece'] });
    expect([result.civilCharacter.theme, result.undercoverCharacter.theme]).toEqual(['films', 'films']);
  });

  it('filters histoire sub-categories the same way as anime series', () => {
    const historyPool: Character[] = [
      { id: 'napoleon', name: 'Napoléon', theme: 'histoire', series: 'guerre', tags: ['x', 'y', 'z'] },
      { id: 'jeanne', name: "Jeanne d'Arc", theme: 'histoire', series: 'guerre', tags: ['x', 'y', 'w'] },
      { id: 'einstein', name: 'Einstein', theme: 'histoire', series: 'science', tags: ['p', 'q', 'r'] },
      { id: 'curie', name: 'Curie', theme: 'histoire', series: 'science', tags: ['p', 'q', 's'] },
    ];
    const result = selectCharacterPair(historyPool, ['histoire'], 'close', () => 0, { histoire: ['science'] });
    const ids = [result.civilCharacter.id, result.undercoverCharacter.id];
    expect(ids.every((id) => ['einstein', 'curie'].includes(id))).toBe(true);
  });
});

describe('selectCharacterPair attribute swap', () => {
  const luffy: Character = {
    id: 'luffy',
    name: 'Luffy',
    theme: 'anime',
    series: 'one-piece',
    tags: ['x', 'y', 'z'],
    attributes: ['Caoutchouc', 'Capitaine'],
  };
  const zoro: Character = {
    id: 'zoro',
    name: 'Zoro',
    theme: 'anime',
    series: 'one-piece',
    tags: ['x', 'y', 'w'],
  };
  const pairPool: Character[] = [luffy, zoro];

  it('replaces the undercover word with one of the civil character\'s attributes when the roll lands under 15%', () => {
    // 2 shared tags ('x','y') -> 'close'. random() sequence: pick pair -> civilFirst (0 < 0.5 =>
    // luffy is civil) -> swap roll (0 < 0.15) -> attribute index (0).
    const result = selectCharacterPair(pairPool, ['anime'], 'close', () => 0);
    expect(result.civilCharacter.id).toBe('luffy');
    expect(result.undercoverCharacter.name).toBe('Caoutchouc');
    expect(result.undercoverCharacter.image).toBeUndefined();
    expect(result.undercoverCharacter.series).toBeUndefined();
  });

  it('keeps the normal second character when the roll lands over 15%', () => {
    // civilFirst (0.99 < 0.5 => false) makes zoro (no attributes) the civil character here, so no
    // swap roll even happens -- luffy stays the plain undercover word.
    const result = selectCharacterPair(pairPool, ['anime'], 'close', () => 0.99);
    expect(result.civilCharacter.id).toBe('zoro');
    expect(result.undercoverCharacter.id).toBe('luffy');
  });

  it('never swaps when the civil character has no attributes', () => {
    const noAttrPool: Character[] = [
      { id: 'a', name: 'A', theme: 'anime', tags: ['x', 'y', 'z'] },
      { id: 'b', name: 'B', theme: 'anime', tags: ['x', 'y', 'w'] },
    ];
    const result = selectCharacterPair(noAttrPool, ['anime'], 'close', () => 0);
    expect(result.undercoverCharacter.id).toBe('b');
  });

  it('never swaps outside the anime theme, even with attributes present', () => {
    const historyPool: Character[] = [
      { id: 'napoleon', name: 'Napoléon', theme: 'histoire', tags: ['x', 'y', 'z'], attributes: ['Empereur'] },
      { id: 'jeanne', name: "Jeanne d'Arc", theme: 'histoire', tags: ['x', 'y', 'w'] },
    ];
    const result = selectCharacterPair(historyPool, ['histoire'], 'close', () => 0);
    expect(result.undercoverCharacter.id).toBe('jeanne');
  });
});
