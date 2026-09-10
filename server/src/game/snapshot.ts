import type { RoomState } from '../types';

export function buildSnapshot(state: RoomState, forPlayerId: string) {
  const revealEverything = state.phase === 'END';
  const revealEliminated = state.settings.revealRoleOnElimination ?? true;
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
    noEliminationReason: state.noEliminationReason,
    turnDeadline: state.turnDeadline,
    // How many alive players have voted so far -- a plain count, never who voted for whom, so
    // watching it live doesn't leak anyone's choice before the vote resolves.
    votedCount: Object.keys(state.votes).length,
    allVotedDeadline: state.allVotedDeadline,
    themeSetterId: state.themeSetterId,
    currentTheme: state.currentTheme,
    themes: state.themes,
    players: state.players.map((p) => {
      const reveal = revealEverything || p.id === forPlayerId || (!p.alive && revealEliminated);
      return {
        id: p.id,
        name: p.name,
        alive: p.alive,
        connected: p.connected,
        role: reveal ? p.role : null,
        character: reveal ? p.character : null,
        characterImage: reveal ? p.characterImage : null,
        characterSeries: reveal ? p.characterSeries : null,
        note: reveal ? p.note : null,
      };
    }),
  };
}
