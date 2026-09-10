export const NOTE_MIN = 0;
export const NOTE_MAX = 20;
/** Undercover's note is always within this many points of Civil's, so the two stay comparable. */
export const MAX_NOTE_GAP = 6;

/** The note only carries deduction value if Civils and Undercover actually differ. */
export function notesAreDistinct(civilNote: number, undercoverNote: number): boolean {
  return civilNote !== undercoverNote;
}

function randomNote(random: () => number): number {
  return Math.floor(random() * (NOTE_MAX - NOTE_MIN + 1)) + NOTE_MIN;
}

/**
 * Picks two distinct random notes in [0, 20] for Civils and Undercover, at most MAX_NOTE_GAP
 * apart -- the host never chooses these directly. Civil's note is drawn first (uniform over the
 * full range); Undercover's is then drawn uniformly from the window around it, clamped to
 * [0, 20], re-drawing only on the rare exact collision.
 */
export function generateDistinctNotes(random: () => number = Math.random): { civilNote: number; undercoverNote: number } {
  const civilNote = randomNote(random);
  const low = Math.max(NOTE_MIN, civilNote - MAX_NOTE_GAP);
  const high = Math.min(NOTE_MAX, civilNote + MAX_NOTE_GAP);
  let undercoverNote = civilNote;
  while (!notesAreDistinct(civilNote, undercoverNote)) {
    undercoverNote = Math.floor(random() * (high - low + 1)) + low;
  }
  return { civilNote, undercoverNote };
}

/** Uniform random pick among currently alive players, used to designate the theme-setter each round. */
export function pickRandomThemeSetter(aliveIds: string[], random: () => number = Math.random): string {
  const index = Math.floor(random() * aliveIds.length);
  return aliveIds[index];
}
