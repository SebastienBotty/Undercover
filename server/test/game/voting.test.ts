import { describe, it, expect } from 'vitest';
import {
  tallyVotes,
  checkWinCondition,
  checkMrWhiteGuess,
  checkMrWhiteNoteGuess,
  resolveVoteTimerSeconds,
} from '../../src/game/voting';

describe('tallyVotes', () => {
  it('eliminates the player with the most votes (plurality, no majority required)', () => {
    const result = tallyVotes({ a: 'c', b: 'c', c: 'a' });
    expect(result).toEqual({ eliminatedId: 'c', reason: null, leaders: ['c'] });
  });

  it('eliminates a lone leader even with just 1 vote out of many alive players', () => {
    // No more "no_majority" outcome -- a single vote against an otherwise-untouched field still
    // wins outright as long as nobody else has as many.
    const result = tallyVotes({ a: 'x', b: null, c: null, d: null });
    expect(result).toEqual({ eliminatedId: 'x', reason: null, leaders: ['x'] });
  });

  it('returns no elimination (reason null) and the tied leaders when two players are equally voted', () => {
    const result = tallyVotes({ a: 'b', b: 'a' });
    expect(result.eliminatedId).toBeNull();
    expect(result.reason).toBeNull();
    expect(result.leaders.sort()).toEqual(['a', 'b']);
  });

  it('returns the tied leaders for a three-way split with no single leader', () => {
    const result = tallyVotes({ a: 'b', b: 'c', c: 'a' });
    expect(result.eliminatedId).toBeNull();
    expect(result.leaders.sort()).toEqual(['a', 'b', 'c']);
  });

  it('excludes abstentions (null) from the tally', () => {
    const result = tallyVotes({ a: 'b', b: null, c: 'b' });
    expect(result).toEqual({ eliminatedId: 'b', reason: null, leaders: ['b'] });
  });

  it('returns reason "no_votes" (and no leaders) when every submitted vote was an abstention', () => {
    const result = tallyVotes({ a: null, b: null });
    expect(result).toEqual({ eliminatedId: null, reason: 'no_votes', leaders: [] });
  });

  it('returns reason "no_votes" when nobody voted at all', () => {
    const result = tallyVotes({});
    expect(result).toEqual({ eliminatedId: null, reason: 'no_votes', leaders: [] });
  });

  it('adds accusation votes on top of real ballots before comparing', () => {
    // Only 1 real vote for 'y', but 'x' carries 2 accusation votes from missed clue timers --
    // 'x' should still lose to nobody, i.e. win the (unwanted) plurality.
    const result = tallyVotes({ a: 'y' }, { x: 2 });
    expect(result).toEqual({ eliminatedId: 'x', reason: null, leaders: ['x'] });
  });

  it('lets accusation votes turn what would be a tie into a clear leader', () => {
    const result = tallyVotes({ a: 'x', b: 'y' }, { x: 1 });
    expect(result).toEqual({ eliminatedId: 'x', reason: null, leaders: ['x'] });
  });

  it('ignores a non-positive accusation count', () => {
    const result = tallyVotes({ a: 'y' }, { x: 0 });
    expect(result).toEqual({ eliminatedId: 'y', reason: null, leaders: ['y'] });
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
