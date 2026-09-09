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
