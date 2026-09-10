import { describe, it, expect } from 'vitest';
import { NOTE_MIN, NOTE_MAX, NOTE_DEFAULT, clampNote, notesAreDistinct, pickRandomThemeSetter } from '../../src/game/notes';

describe('clampNote', () => {
  it('defaults to NOTE_DEFAULT when the host requested no value', () => {
    expect(clampNote(undefined)).toBe(NOTE_DEFAULT);
  });

  it('passes through a value already within [0, 20]', () => {
    expect(clampNote(14)).toBe(14);
  });

  it('clamps values below the minimum', () => {
    expect(clampNote(-5)).toBe(NOTE_MIN);
  });

  it('clamps values above the maximum', () => {
    expect(clampNote(35)).toBe(NOTE_MAX);
  });
});

describe('notesAreDistinct', () => {
  it('returns true when the two notes differ', () => {
    expect(notesAreDistinct(14, 10)).toBe(true);
  });

  it('returns false when the two notes are equal', () => {
    expect(notesAreDistinct(12, 12)).toBe(false);
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
