import type { Clue } from '../types';

export function nextAliveIndex(turnOrder: string[], alivePlayerIds: Set<string>, fromIndex: number): number {
  for (let step = 1; step <= turnOrder.length; step++) {
    const idx = (fromIndex + step) % turnOrder.length;
    if (alivePlayerIds.has(turnOrder[idx])) {
      return idx;
    }
  }
  throw new Error('No alive players left in the turn order');
}

export function isClueRoundComplete(clues: Pick<Clue, 'playerId' | 'round'>[], round: number, alivePlayerIds: Set<string>): boolean {
  const submitted = new Set(clues.filter((c) => c.round === round).map((c) => c.playerId));
  for (const id of alivePlayerIds) {
    if (!submitted.has(id)) return false;
  }
  return true;
}

/**
 * Round to resume at once a vote has been resolved (elimination or a no-op "no_votes"). A vote
 * is only ever reached right at a clean multiple of the host's configured passes-per-vote (see
 * finishClueRound), and a clue-timeout no longer short-circuits straight to elimination mid-pair
 * (it now just records an accusation and continues the round normally) -- so `round` is always
 * exactly at that boundary here, and resuming at the very next round always starts a fresh group.
 */
export function nextRoundAfterVote(round: number): number {
  return round + 1;
}

export const CLUE_TIMER_MIN_SECONDS = 30;
export const CLUE_TIMER_MAX_SECONDS = 90;
export const CLUE_TIMER_DEFAULT_SECONDS = 30;

/** Clamps the host's requested clue-timer duration into the [30, 90]s range the slider allows. */
export function resolveClueTimerSeconds(requestedSeconds: number | undefined): number {
  const value = requestedSeconds ?? CLUE_TIMER_DEFAULT_SECONDS;
  return Math.min(CLUE_TIMER_MAX_SECONDS, Math.max(CLUE_TIMER_MIN_SECONDS, value));
}

export const CLUE_PASSES_MIN = 1;
export const CLUE_PASSES_MAX = 5;
export const CLUE_PASSES_DEFAULT = 2;

/** Clamps the host's requested clue-passes-per-vote into the [1, 5] range the slider allows. */
export function resolveCluePassesPerVote(requestedPasses: number | undefined): number {
  const value = requestedPasses ?? CLUE_PASSES_DEFAULT;
  return Math.min(CLUE_PASSES_MAX, Math.max(CLUE_PASSES_MIN, value));
}
