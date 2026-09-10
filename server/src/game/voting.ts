import type { Role, NoEliminationReason } from '../types';

export const VOTE_TIMER_MIN_SECONDS = 30;
export const VOTE_TIMER_MAX_SECONDS = 180;
export const VOTE_TIMER_DEFAULT_SECONDS = 60;

/** Grace period before the vote auto-resolves once every alive player has voted, so a change of
 * mind still has a moment to register -- ends the vote early even if the main timer isn't done. */
export const ALL_VOTED_GRACE_MS = 3_000;

/** Clamps the host's requested vote-timer duration into the [30, 180]s range the slider allows. */
export function resolveVoteTimerSeconds(requestedSeconds: number | undefined): number {
  const value = requestedSeconds ?? VOTE_TIMER_DEFAULT_SECONDS;
  return Math.min(VOTE_TIMER_MAX_SECONDS, Math.max(VOTE_TIMER_MIN_SECONDS, value));
}

/** Tallies votes and decides who (if anyone) gets eliminated. Elimination requires an absolute
 * majority of the votes among ALIVE players (strictly more than half of `aliveCount`) -- not just
 * a plurality among ballots actually cast, so e.g. 1 vote out of 4 alive players (the other 3
 * abstaining) never eliminates anyone even though that candidate technically "leads". */
export function tallyVotes(
  votes: Record<string, string | null>,
  aliveCount: number
): { eliminatedId: string | null; reason: NoEliminationReason | null } {
  const counts = new Map<string, number>();
  for (const targetId of Object.values(votes)) {
    if (targetId === null) continue; // abstained -- doesn't count toward anyone
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  }

  if (counts.size === 0) {
    return { eliminatedId: null, reason: 'no_votes' };
  }

  let maxCount = -1;
  let leaders: string[] = [];
  for (const [id, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      leaders = [id];
    } else if (count === maxCount) {
      leaders.push(id);
    }
  }

  if (leaders.length !== 1) {
    return { eliminatedId: null, reason: 'tie' };
  }
  if (maxCount * 2 <= aliveCount) {
    return { eliminatedId: null, reason: 'no_majority' };
  }
  return { eliminatedId: leaders[0], reason: null };
}

export function checkWinCondition(players: { role: Role; alive: boolean }[]): Role | null {
  const aliveCivils = players.filter((p) => p.role === 'civil' && p.alive).length;
  const aliveUndercover = players.filter((p) => p.role === 'undercover' && p.alive).length;
  const aliveMrWhite = players.filter((p) => p.role === 'mrwhite' && p.alive).length;

  if (aliveUndercover === 0 && aliveMrWhite === 0) {
    return 'civil';
  }
  if (aliveCivils === 0 && aliveUndercover === 0 && aliveMrWhite > 0) {
    return 'mrwhite';
  }
  if (aliveUndercover > 0 && aliveUndercover + aliveMrWhite >= aliveCivils) {
    return 'undercover';
  }
  return null;
}

export function checkMrWhiteGuess(guess: string, civilCharacterName: string): boolean {
  const normalize = (s: string) => s.trim().toLowerCase();
  return normalize(guess) === normalize(civilCharacterName);
}

export function checkMrWhiteNoteGuess(guess: string, civilNote: number): boolean {
  const parsed = Number(guess.trim());
  return Number.isFinite(parsed) && parsed === civilNote;
}
