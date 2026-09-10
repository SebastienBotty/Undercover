import { describe, it, expect } from 'vitest';
import { NOTE_MIN, NOTE_MAX, MIN_NOTE_GAP, MAX_NOTE_GAP, generateDistinctNotes, pickRandomThemeSetter } from '../../src/game/notes';

describe('generateDistinctNotes', () => {
  it('returns two notes within [0, 20], between MIN_NOTE_GAP and MAX_NOTE_GAP apart', () => {
    for (let i = 0; i < 200; i++) {
      const { civilNote, undercoverNote } = generateDistinctNotes(Math.random);
      expect(civilNote).toBeGreaterThanOrEqual(NOTE_MIN);
      expect(civilNote).toBeLessThanOrEqual(NOTE_MAX);
      expect(undercoverNote).toBeGreaterThanOrEqual(NOTE_MIN);
      expect(undercoverNote).toBeLessThanOrEqual(NOTE_MAX);
      const gap = Math.abs(civilNote - undercoverNote);
      expect(gap).toBeGreaterThanOrEqual(MIN_NOTE_GAP);
      expect(gap).toBeLessThanOrEqual(MAX_NOTE_GAP);
    }
  });

  it('uses the injected random function deterministically', () => {
    // civilNote: floor(0 * 21) = 0. Valid candidates (gap 2-6, clamped to [0, 20]): [2, 3, 4, 5, 6].
    // undercoverNote: floor(0.5 * 5) = index 2 -> 4.
    const values = [0, 0.5];
    let i = 0;
    const scripted = () => values[i++];
    const { civilNote, undercoverNote } = generateDistinctNotes(scripted);
    expect(civilNote).toBe(0);
    expect(undercoverNote).toBe(4);
  });

  it('can land on the far side of the gap window', () => {
    // civilNote: floor(0.5 * 21) = 10. Valid candidates: [4,5,6,7,8, 12,13,14,15,16] (10 values).
    // undercoverNote: floor(0.9 * 10) = index 9 -> 16.
    const values = [0.5, 0.9];
    let i = 0;
    const scripted = () => values[i++];
    const { civilNote, undercoverNote } = generateDistinctNotes(scripted);
    expect(civilNote).toBe(10);
    expect(undercoverNote).toBe(16);
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
