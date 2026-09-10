export const NOTE_MIN = 0;
export const NOTE_MAX = 20;
/** Undercover's note is always at least this many points away from Civil's... */
export const MIN_NOTE_GAP = 2;
/** ...and at most this many, so the two stay comparable. */
export const MAX_NOTE_GAP = 6;

function randomNote(random: () => number): number {
  return Math.floor(random() * (NOTE_MAX - NOTE_MIN + 1)) + NOTE_MIN;
}

/**
 * Picks two random notes in [0, 20] for Civils and Undercover, between MIN_NOTE_GAP and
 * MAX_NOTE_GAP points apart -- the host never chooses these directly. Civil's note is drawn
 * first (uniform over the full range); Undercover's is then drawn uniformly among the values at
 * a valid distance from it. That set is never empty: even at the extremes (civilNote 0 or 20),
 * [MIN_NOTE_GAP, MAX_NOTE_GAP] leaves several candidates within [0, 20].
 */
export function generateDistinctNotes(random: () => number = Math.random): { civilNote: number; undercoverNote: number } {
  const civilNote = randomNote(random);
  const candidates: number[] = [];
  for (let candidate = NOTE_MIN; candidate <= NOTE_MAX; candidate++) {
    const gap = Math.abs(candidate - civilNote);
    if (gap >= MIN_NOTE_GAP && gap <= MAX_NOTE_GAP) {
      candidates.push(candidate);
    }
  }
  const undercoverNote = candidates[Math.floor(random() * candidates.length)];
  return { civilNote, undercoverNote };
}

/** Uniform random pick among currently alive players, used to designate the theme-setter each round. */
export function pickRandomThemeSetter(aliveIds: string[], random: () => number = Math.random): string {
  const index = Math.floor(random() * aliveIds.length);
  return aliveIds[index];
}
