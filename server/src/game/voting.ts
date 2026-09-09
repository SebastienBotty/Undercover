import type { Role } from '../types';

export function tallyVotes(votes: Record<string, string>): { eliminatedId: string | null; tie: boolean } {
  const counts = new Map<string, number>();
  for (const targetId of Object.values(votes)) {
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
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
    return { eliminatedId: null, tie: true };
  }
  return { eliminatedId: leaders[0], tie: false };
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
