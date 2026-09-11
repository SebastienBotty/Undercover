export const NOTE_MIN = 0;
export const NOTE_MAX = 20;
/** Default lower bound for the note gap (how far apart Civil's and Undercover's notes are). */
export const NOTE_GAP_DEFAULT_MIN = 2;
/** Default upper bound for the note gap, so the two stay comparable. */
export const NOTE_GAP_DEFAULT_MAX = 6;
/** The host can't set the gap lower than this -- the two notes must always be different. */
export const NOTE_GAP_MIN_ALLOWED = 1;
/** ...or higher than this. At NOTE_MAX, a civilNote drawn at either extreme (0 or 20) still has
 * exactly one valid undercoverNote candidate left inside [0, 20], so the draw never dead-ends. */
export const NOTE_GAP_MAX_ALLOWED = NOTE_MAX;

function randomNote(random: () => number): number {
  return Math.floor(random() * (NOTE_MAX - NOTE_MIN + 1)) + NOTE_MIN;
}

/** Clamps the host's requested [min, max] note gap into a range that's always satisfiable --
 * min within [NOTE_GAP_MIN_ALLOWED, NOTE_GAP_MAX_ALLOWED], and max within [min, NOTE_GAP_MAX_ALLOWED]
 * so it can never end up below the (possibly-clamped) min. */
export function resolveNoteGap(
  requestedMin: number | undefined,
  requestedMax: number | undefined
): { min: number; max: number } {
  const min = Math.min(
    NOTE_GAP_MAX_ALLOWED,
    Math.max(NOTE_GAP_MIN_ALLOWED, requestedMin ?? NOTE_GAP_DEFAULT_MIN)
  );
  const max = Math.min(NOTE_GAP_MAX_ALLOWED, Math.max(min, requestedMax ?? NOTE_GAP_DEFAULT_MAX));
  return { min, max };
}

/**
 * Picks two random notes in [0, 20] for Civils and Undercover, between gapMin and gapMax points
 * apart. Civil's note is drawn first (uniform over the full range); Undercover's is then drawn
 * uniformly among the values at a valid distance from it. Pass gapMin/gapMax through
 * resolveNoteGap first -- that's what guarantees the candidate set is never empty, even at the
 * extremes (civilNote 0 or 20).
 */
export function generateDistinctNotes(
  random: () => number = Math.random,
  gapMin: number = NOTE_GAP_DEFAULT_MIN,
  gapMax: number = NOTE_GAP_DEFAULT_MAX
): { civilNote: number; undercoverNote: number } {
  const civilNote = randomNote(random);
  const candidates: number[] = [];
  for (let candidate = NOTE_MIN; candidate <= NOTE_MAX; candidate++) {
    const gap = Math.abs(candidate - civilNote);
    if (gap >= gapMin && gap <= gapMax) {
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
