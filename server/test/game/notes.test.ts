import { describe, it, expect } from 'vitest';
import {
  NOTE_MIN,
  NOTE_MAX,
  NOTE_GAP_DEFAULT_MIN,
  NOTE_GAP_DEFAULT_MAX,
  NOTE_GAP_MIN_ALLOWED,
  NOTE_GAP_MAX_ALLOWED,
  generateDistinctNotes,
  resolveNoteGap,
  pickRandomThemeSetter,
} from '../../src/game/notes';

describe('generateDistinctNotes', () => {
  it('returns two notes within [0, 20], between the default 2 and 6 points apart when no gap is given', () => {
    for (let i = 0; i < 200; i++) {
      const { civilNote, undercoverNote } = generateDistinctNotes(Math.random);
      expect(civilNote).toBeGreaterThanOrEqual(NOTE_MIN);
      expect(civilNote).toBeLessThanOrEqual(NOTE_MAX);
      expect(undercoverNote).toBeGreaterThanOrEqual(NOTE_MIN);
      expect(undercoverNote).toBeLessThanOrEqual(NOTE_MAX);
      const gap = Math.abs(civilNote - undercoverNote);
      expect(gap).toBeGreaterThanOrEqual(NOTE_GAP_DEFAULT_MIN);
      expect(gap).toBeLessThanOrEqual(NOTE_GAP_DEFAULT_MAX);
    }
  });

  it('honors a host-chosen gap range', () => {
    for (let i = 0; i < 200; i++) {
      const { civilNote, undercoverNote } = generateDistinctNotes(Math.random, 10, 15);
      const gap = Math.abs(civilNote - undercoverNote);
      expect(gap).toBeGreaterThanOrEqual(10);
      expect(gap).toBeLessThanOrEqual(15);
    }
  });

  it('never dead-ends even at the extreme allowed gap (1 to 20), including when civilNote lands on an extreme', () => {
    // random() = 0 draws civilNote = 0, the extreme where the candidate window is tightest.
    const values = [0, 0.5];
    let i = 0;
    const scripted = () => values[i++];
    const { civilNote, undercoverNote } = generateDistinctNotes(scripted, NOTE_GAP_MIN_ALLOWED, NOTE_GAP_MAX_ALLOWED);
    expect(civilNote).toBe(0);
    expect(undercoverNote).toBeGreaterThanOrEqual(NOTE_MIN);
    expect(undercoverNote).toBeLessThanOrEqual(NOTE_MAX);
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

describe('resolveNoteGap', () => {
  it('defaults to [2, 6] when the host requested nothing', () => {
    expect(resolveNoteGap(undefined, undefined)).toEqual({ min: NOTE_GAP_DEFAULT_MIN, max: NOTE_GAP_DEFAULT_MAX });
  });

  it('passes through a valid host-requested range', () => {
    expect(resolveNoteGap(4, 10)).toEqual({ min: 4, max: 10 });
  });

  it('clamps min below 1 up to 1 (the notes must always be different)', () => {
    expect(resolveNoteGap(0, 6)).toEqual({ min: 1, max: 6 });
    expect(resolveNoteGap(-5, 6)).toEqual({ min: 1, max: 6 });
  });

  it('clamps max above 20 down to 20', () => {
    expect(resolveNoteGap(2, 999)).toEqual({ min: 2, max: 20 });
  });

  it('pulls max back up to min when the host requested max < min, rather than producing an impossible range', () => {
    expect(resolveNoteGap(10, 3)).toEqual({ min: 10, max: 10 });
  });

  it('clamps a min requested above the allowed ceiling down to it', () => {
    expect(resolveNoteGap(50, 60)).toEqual({ min: NOTE_GAP_MAX_ALLOWED, max: NOTE_GAP_MAX_ALLOWED });
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
