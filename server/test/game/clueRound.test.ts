import { describe, it, expect } from 'vitest';
import {
  nextAliveIndex,
  isClueRoundComplete,
  nextRoundAfterVote,
  resolveClueTimerSeconds,
  resolveCluePassesPerVote,
  rotateTurnOrderFrom,
} from '../../src/game/clueRound';

describe('rotateTurnOrderFrom', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('rotates so the given id comes first, wrapping the rest around after it', () => {
    expect(rotateTurnOrderFrom(order, 'c')).toEqual(['c', 'd', 'a', 'b']);
  });

  it('returns the order unchanged when startId is already first', () => {
    expect(rotateTurnOrderFrom(order, 'a')).toEqual(order);
  });

  it('returns the order unchanged when startId is null', () => {
    expect(rotateTurnOrderFrom(order, null)).toEqual(order);
  });

  it('returns the order unchanged when startId is not found in it', () => {
    expect(rotateTurnOrderFrom(order, 'z')).toEqual(order);
  });
});

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

describe('nextRoundAfterVote', () => {
  it('always moves to the very next round', () => {
    expect(nextRoundAfterVote(2)).toBe(3);
    expect(nextRoundAfterVote(4)).toBe(5);
    expect(nextRoundAfterVote(1)).toBe(2);
  });
});

describe('resolveClueTimerSeconds', () => {
  it('defaults to 30s when the host requested no value', () => {
    expect(resolveClueTimerSeconds(undefined)).toBe(30);
  });

  it('passes through a value already within [30, 90]', () => {
    expect(resolveClueTimerSeconds(45)).toBe(45);
  });

  it('clamps values below the 30s minimum', () => {
    expect(resolveClueTimerSeconds(5)).toBe(30);
  });

  it('clamps values above the 90s maximum', () => {
    expect(resolveClueTimerSeconds(200)).toBe(90);
  });
});

describe('resolveCluePassesPerVote', () => {
  it('defaults to 2 when the host requested no value', () => {
    expect(resolveCluePassesPerVote(undefined)).toBe(2);
  });

  it('passes through a value already within [1, 5]', () => {
    expect(resolveCluePassesPerVote(3)).toBe(3);
  });

  it('clamps values below the 1-pass minimum', () => {
    expect(resolveCluePassesPerVote(0)).toBe(1);
  });

  it('clamps values above the 5-pass maximum', () => {
    expect(resolveCluePassesPerVote(20)).toBe(5);
  });
});
