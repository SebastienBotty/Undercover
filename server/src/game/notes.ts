export const NOTE_MIN = 0;
export const NOTE_MAX = 20;
export const NOTE_DEFAULT = 10;

/** Clamps the host's requested note into the [0, 20] range the note fields allow. */
export function clampNote(value: number | undefined): number {
  const v = value ?? NOTE_DEFAULT;
  return Math.min(NOTE_MAX, Math.max(NOTE_MIN, v));
}

/** The note only carries deduction value if Civils and Undercover actually differ. */
export function notesAreDistinct(civilNote: number, undercoverNote: number): boolean {
  return civilNote !== undercoverNote;
}

/** Uniform random pick among currently alive players, used to designate the theme-setter each round. */
export function pickRandomThemeSetter(aliveIds: string[], random: () => number = Math.random): string {
  const index = Math.floor(random() * aliveIds.length);
  return aliveIds[index];
}
