import { describe, it, expect } from 'vitest';
import {
  tallyVotes,
  checkWinCondition,
  checkMrWhiteGuess,
  checkMrWhiteNoteGuess,
  resolveVoteTimerSeconds,
} from '../../src/game/voting';

describe('tallyVotes', () => {
  it('eliminates the player with the most votes when it is an absolute majority of alive players', () => {
    const result = tallyVotes({ a: 'c', b: 'c', c: 'a' }, 3);
    expect(result).toEqual({ eliminatedId: 'c', reason: null });
  });

  it('returns reason "tie" when two players are equally voted', () => {
    const result = tallyVotes({ a: 'b', b: 'a' }, 2);
    expect(result.reason).toBe('tie');
    expect(result.eliminatedId).toBeNull();
  });

  it('returns reason "tie" for a three-way split with no single leader', () => {
    const result = tallyVotes({ a: 'b', b: 'c', c: 'a' }, 3);
    expect(result.reason).toBe('tie');
    expect(result.eliminatedId).toBeNull();
  });

  it('excludes abstentions (null) from the tally', () => {
    const result = tallyVotes({ a: 'b', b: null, c: 'b' }, 3);
    expect(result).toEqual({ eliminatedId: 'b', reason: null });
  });

  it('returns reason "no_votes" when every submitted vote was an abstention', () => {
    const result = tallyVotes({ a: null, b: null }, 2);
    expect(result).toEqual({ eliminatedId: null, reason: 'no_votes' });
  });

  it('returns reason "no_votes" when nobody voted at all', () => {
    const result = tallyVotes({}, 3);
    expect(result).toEqual({ eliminatedId: null, reason: 'no_votes' });
  });

  it('returns reason "no_majority" when a lone candidate leads but doesn\'t have half the alive players behind them (1 vote out of 4 alive, 3 abstaining)', () => {
    const result = tallyVotes({ a: 'x', b: null, c: null, d: null }, 4);
    expect(result).toEqual({ eliminatedId: null, reason: 'no_majority' });
  });

  it('returns reason "no_majority" for an exact half (2 of 4 alive players), which is not a strict majority', () => {
    const result = tallyVotes({ a: 'x', b: 'x', c: null, d: null }, 4);
    expect(result).toEqual({ eliminatedId: null, reason: 'no_majority' });
  });

  it('eliminates once the leader crosses strictly past half of alive players (3 of 4)', () => {
    const result = tallyVotes({ a: 'x', b: 'x', c: 'x', d: null }, 4);
    expect(result).toEqual({ eliminatedId: 'x', reason: null });
  });

  it('still requires the majority even when only some alive players have a votes entry at all', () => {
    // Simulates a vote resolving with stragglers who never submitted anything -- aliveCount (5)
    // is what matters, not the size of the votes record itself.
    const result = tallyVotes({ a: 'x' }, 5);
    expect(result).toEqual({ eliminatedId: null, reason: 'no_majority' });
  });
});

describe('resolveVoteTimerSeconds', () => {
  it('defaults to 60s when the host requested no value', () => {
    expect(resolveVoteTimerSeconds(undefined)).toBe(60);
  });

  it('passes through a value already within [30, 180]', () => {
    expect(resolveVoteTimerSeconds(90)).toBe(90);
  });

  it('clamps values below the 30s minimum', () => {
    expect(resolveVoteTimerSeconds(5)).toBe(30);
  });

  it('clamps values above the 180s maximum', () => {
    expect(resolveVoteTimerSeconds(600)).toBe(180);
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

describe('checkMrWhiteNoteGuess', () => {
  it('matches an exact numeric guess, ignoring surrounding whitespace', () => {
    expect(checkMrWhiteNoteGuess('14', 14)).toBe(true);
    expect(checkMrWhiteNoteGuess('  14 ', 14)).toBe(true);
  });

  it('returns false for a wrong guess', () => {
    expect(checkMrWhiteNoteGuess('12', 14)).toBe(false);
  });

  it('returns false for a non-numeric guess', () => {
    expect(checkMrWhiteNoteGuess('quatorze', 14)).toBe(false);
  });
});
