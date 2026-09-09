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
