import { describe, it, expect } from 'vitest';
import { NOTE_MIN, NOTE_MAX, MAX_NOTE_GAP, notesAreDistinct, generateDistinctNotes, pickRandomThemeSetter } from '../../src/game/notes';

describe('notesAreDistinct', () => {
  it('returns true when the two notes differ', () => {
    expect(notesAreDistinct(14, 10)).toBe(true);
  });

  it('returns false when the two notes are equal', () => {
    expect(notesAreDistinct(12, 12)).toBe(false);
  });
});

describe('generateDistinctNotes', () => {
  it('returns two distinct notes within [0, 20], at most MAX_NOTE_GAP apart', () => {
    for (let i = 0; i < 200; i++) {
      const { civilNote, undercoverNote } = generateDistinctNotes(Math.random);
      expect(civilNote).toBeGreaterThanOrEqual(NOTE_MIN);
      expect(civilNote).toBeLessThanOrEqual(NOTE_MAX);
      expect(undercoverNote).toBeGreaterThanOrEqual(NOTE_MIN);
      expect(undercoverNote).toBeLessThanOrEqual(NOTE_MAX);
      expect(civilNote).not.toBe(undercoverNote);
      expect(Math.abs(civilNote - undercoverNote)).toBeLessThanOrEqual(MAX_NOTE_GAP);
    }
  });

  it('uses the injected random function deterministically', () => {
    // civilNote: floor(0 * 21) = 0. Window around 0 clamped to [0, 6] (width 7).
    // undercoverNote: floor(0.5 * 7) + 0 = 3.
    const values = [0, 0.5];
    let i = 0;
    const scripted = () => values[i++];
    const { civilNote, undercoverNote } = generateDistinctNotes(scripted);
    expect(civilNote).toBe(0);
    expect(undercoverNote).toBe(3);
  });

  it('re-draws the undercover note until it differs from the civil note', () => {
    // civilNote: floor(0.5 * 21) = 10. Window [4, 16] (width 13).
    // First draw (0.5 -> floor(6.5)+4 = 10) collides with civilNote; second draw (0.9 -> 15) is used instead.
    const values = [0.5, 0.5, 0.9];
    let i = 0;
    const scripted = () => values[i++];
    const { civilNote, undercoverNote } = generateDistinctNotes(scripted);
    expect(civilNote).toBe(10);
    expect(undercoverNote).toBe(15);
  });
});

describe('pickRandomThemeSetter', () => {
  it('picks the only alive player when there is just one', () => {
    expect(pickRandomThemeSetter(['a'], () => 0)).toBe('a');
  });

  it('uses the injected random function to pick among alive players', () => {
    const aliveIds = ['a', 'b', 'c'];
    expect(pickRandomThemeSetter(aliveIds, () => 0)).toBe('a');
    expect(pickRandomThemeSetter(aliveIds, () => 0.5)).toBe('b');
    expect(pickRandomThemeSetter(aliveIds, () => 0.99)).toBe('c');
  });
});
