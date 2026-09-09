import { describe, it, expect } from 'vitest';
import { tallyVotes, checkWinCondition, checkMrWhiteGuess } from '../../src/game/voting';

describe('tallyVotes', () => {
  it('eliminates the player with the most votes', () => {
    const result = tallyVotes({ a: 'c', b: 'c', c: 'a' });
    expect(result).toEqual({ eliminatedId: 'c', tie: false });
  });

  it('returns a tie when two players are equally voted', () => {
    const result = tallyVotes({ a: 'b', b: 'a' });
    expect(result.tie).toBe(true);
    expect(result.eliminatedId).toBeNull();
  });
});

describe('checkWinCondition', () => {
  it('returns null while the game should continue', () => {
    const players = [
      { role: 'civil' as const, alive: true },
      { role: 'civil' as const, alive: true },
      { role: 'undercover' as const, alive: true },
    ];
    expect(checkWinCondition(players)).toBeNull();
  });

  it('returns civil when all undercover and mrwhite are eliminated', () => {
    const players = [
      { role: 'civil' as const, alive: true },
      { role: 'undercover' as const, alive: false },
    ];
    expect(checkWinCondition(players)).toBe('civil');
  });

  it('returns undercover when undercover count reaches civil count', () => {
    const players = [
      { role: 'civil' as const, alive: true },
      { role: 'undercover' as const, alive: true },
      { role: 'civil' as const, alive: false },
    ];
    expect(checkWinCondition(players)).toBe('undercover');
  });
});

describe('checkMrWhiteGuess', () => {
  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(checkMrWhiteGuess('  Goku ', 'Goku')).toBe(true);
    expect(checkMrWhiteGuess('goku', 'Goku')).toBe(true);
  });

  it('returns false for a wrong guess', () => {
    expect(checkMrWhiteGuess('Vegeta', 'Goku')).toBe(false);
  });
});
