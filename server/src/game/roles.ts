import type { Role, RoomSettings } from '../types';

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function assignRoles(
  playerIds: string[],
  settings: RoomSettings,
  random: () => number = Math.random
): Record<string, Role> {
  if (playerIds.length < 3) {
    throw new Error('At least 3 players are required');
  }
  if (playerIds.length > 10) {
    throw new Error('At most 10 players are allowed');
  }

  const undercoverCount = playerIds.length >= 7 ? 2 : 1;
  const mrWhiteCount = settings.mrWhiteEnabled ? 1 : 0;
  const specialCount = undercoverCount + mrWhiteCount;
  const civilCount = playerIds.length - specialCount;

  if (civilCount <= specialCount) {
    throw new Error('Not enough players to guarantee a civilian majority');
  }

  const shuffled = shuffle(playerIds, random);
  const roles: Record<string, Role> = {};
  let index = 0;
  for (let i = 0; i < undercoverCount; i++, index++) {
    roles[shuffled[index]] = 'undercover';
  }
  for (let i = 0; i < mrWhiteCount; i++, index++) {
    roles[shuffled[index]] = 'mrwhite';
  }
  for (; index < shuffled.length; index++) {
    roles[shuffled[index]] = 'civil';
  }
  return roles;
}

export function buildTurnOrder(playerIds: string[], random: () => number = Math.random): string[] {
  return shuffle(playerIds, random);
}
