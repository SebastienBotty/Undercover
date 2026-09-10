import type { RoomState } from '../types';

export function buildSnapshot(state: RoomState, forPlayerId: string) {
  const revealEverything = state.phase === 'END';
  return {
    type: 'ROOM_STATE' as const,
    code: state.code,
    hostId: state.hostId,
    phase: state.phase,
    settings: state.settings,
    round: state.round,
    currentTurnIndex: state.currentTurnIndex,
    turnOrder: state.turnOrder,
    clues: state.clues,
    winner: state.winner,
    lastEliminatedId: state.lastEliminatedId,
    turnDeadline: state.turnDeadline,
    themeSetterId: state.themeSetterId,
    currentTheme: state.currentTheme,
    themes: state.themes,
    players: state.players.map((p) => {
      const reveal = revealEverything || !p.alive || p.id === forPlayerId;
      return {
        id: p.id,
        name: p.name,
        alive: p.alive,
        connected: p.connected,
        role: reveal ? p.role : null,
        character: reveal ? p.character : null,
        characterImage: reveal ? p.characterImage : null,
        note: reveal ? p.note : null,
      };
    }),
  };
}
