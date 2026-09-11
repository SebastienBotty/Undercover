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

/** Tallies votes and decides who (if anyone) gets eliminated. Whoever has the most votes is
 * eliminated outright (a plurality, not an absolute majority) -- accusationVotes (accumulated by
 * missing a clue timer) are added on top of real ballots before comparing. A tie among the
 * leaders resolves to no elimination this tally, with `leaders` telling the caller who to run the
 * tie-breaking revote between. */
export function tallyVotes(
  votes: Record<string, string | null>,
  accusationVotes: Record<string, number> = {}
): { eliminatedId: string | null; reason: NoEliminationReason | null; leaders: string[] } {
  const counts = new Map<string, number>();
  for (const targetId of Object.values(votes)) {
    if (targetId === null) continue; // abstained -- doesn't count toward anyone
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  }
  for (const [targetId, extra] of Object.entries(accusationVotes)) {
    if (extra <= 0) continue;
    counts.set(targetId, (counts.get(targetId) ?? 0) + extra);
  }

  if (counts.size === 0) {
    return { eliminatedId: null, reason: 'no_votes', leaders: [] };
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
    return { eliminatedId: null, reason: null, leaders };
  }
  return { eliminatedId: leaders[0], reason: null, leaders };
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
