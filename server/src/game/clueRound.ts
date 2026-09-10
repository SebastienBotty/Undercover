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
 * Round after an elimination that guarantees a full CLUE_ROUNDS_PER_VOTE pair follows.
 * A vote only ever triggers once an even round completes, so bumping from an even round
 * simply moves to the next odd one. But a clue-timeout elimination can now happen mid-pair,
 * i.e. from an odd round -- resuming at `round + 1` (even) would let the next vote fire after
 * a single clue pass instead of two, so an odd round jumps ahead to the next odd one instead.
 */
export function nextOddRound(round: number): number {
  return round % 2 === 0 ? round + 1 : round + 2;
}

export const CLUE_TIMER_MIN_SECONDS = 30;
export const CLUE_TIMER_MAX_SECONDS = 90;
export const CLUE_TIMER_DEFAULT_SECONDS = 30;

/** Clamps the host's requested clue-timer duration into the [30, 90]s range the slider allows. */
export function resolveClueTimerSeconds(requestedSeconds: number | undefined): number {
  const value = requestedSeconds ?? CLUE_TIMER_DEFAULT_SECONDS;
  return Math.min(CLUE_TIMER_MAX_SECONDS, Math.max(CLUE_TIMER_MIN_SECONDS, value));
}
