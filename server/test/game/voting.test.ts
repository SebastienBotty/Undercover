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

  it('returns mrwhite (not undercover) when only Mr. White survives, with no civils or undercover left', () => {
    // Regression test for the false-positive: 0 alive civils and 0 alive undercover used to
    // satisfy `aliveUndercover >= aliveCivils` (0 >= 0), incorrectly declaring an undercover win.
    const players = [
      { role: 'mrwhite' as const, alive: true },
      { role: 'civil' as const, alive: false },
      { role: 'undercover' as const, alive: false },
    ];
    expect(checkWinCondition(players)).toBe('mrwhite');
  });

  it('returns undercover via parity when undercover + mrwhite together match alive civils', () => {
    const players = [
      { role: 'civil' as const, alive: true },
      { role: 'civil' as const, alive: true },
      { role: 'undercover' as const, alive: true },
      { role: 'mrwhite' as const, alive: true },
    ];
    expect(checkWinCondition(players)).toBe('undercover');
  });

  it('returns null (game continues) when only civils and an uncaught Mr. White remain and civils still outnumber', () => {
    const players = [
      { role: 'civil' as const, alive: true },
      { role: 'civil' as const, alive: true },
      { role: 'civil' as const, alive: false },
      { role: 'mrwhite' as const, alive: true },
      { role: 'undercover' as const, alive: false },
    ];
    expect(checkWinCondition(players)).toBeNull();
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
