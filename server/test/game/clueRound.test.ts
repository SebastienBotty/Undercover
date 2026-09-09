import { describe, it, expect } from 'vitest';
import { nextAliveIndex, isClueRoundComplete } from '../../src/game/clueRound';

describe('nextAliveIndex', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('returns the next index when everyone is alive', () => {
    expect(nextAliveIndex(order, new Set(order), 0)).toBe(1);
  });

  it('skips eliminated players', () => {
    expect(nextAliveIndex(order, new Set(['a', 'c']), 0)).toBe(2);
  });

  it('wraps around to the start of the order', () => {
    expect(nextAliveIndex(order, new Set(order), 3)).toBe(0);
  });

  it('starting from -1 returns the first alive player', () => {
    expect(nextAliveIndex(order, new Set(['b', 'd']), -1)).toBe(1);
  });

  it('throws if no alive players remain in the order', () => {
    expect(() => nextAliveIndex(order, new Set(), 0)).toThrow();
  });
});

describe('isClueRoundComplete', () => {
  it('is false until every alive player has submitted a clue for the round', () => {
    const clues = [{ playerId: 'a', round: 1, text: 'x' }];
    expect(isClueRoundComplete(clues, 1, new Set(['a', 'b']))).toBe(false);
  });

  it('is true once every alive player has submitted', () => {
    const clues = [
      { playerId: 'a', round: 1, text: 'x' },
      { playerId: 'b', round: 1, text: 'y' },
    ];
    expect(isClueRoundComplete(clues, 1, new Set(['a', 'b']))).toBe(true);
  });

  it('ignores clues from other rounds', () => {
    const clues = [{ playerId: 'a', round: 1, text: 'x' }];
    expect(isClueRoundComplete(clues, 2, new Set(['a']))).toBe(false);
  });

  it('ignores eliminated players not in the alive set', () => {
    const clues = [{ playerId: 'a', round: 1, text: 'x' }];
    expect(isClueRoundComplete(clues, 1, new Set(['a']))).toBe(true);
  });
});
