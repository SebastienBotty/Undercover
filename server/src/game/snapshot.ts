import type { RoomState } from '../types';
import { rotateTurnOrderFrom } from './clueRound';

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
    // Display-only order for the vote screen's player list: turnOrder rotated to start at
    // voteOrderStartId, which advances one alive player further each fresh vote (not on a
    // tie-breaking runoff) so the same person isn't always shown first. Clue-giving and
    // theme-setting keep using turnOrder itself, untouched.
    voteDisplayOrder: rotateTurnOrderFrom(state.turnOrder, state.voteOrderStartId),
    clues: state.clues,
    winner: state.winner,
    lastEliminatedId: state.lastEliminatedId,
    noEliminationReason: state.noEliminationReason,
    turnDeadline: state.turnDeadline,
    // Non-null only while the current turn-holder is disconnected: the normal clue/theme timer's
    // frozen remaining time, so clients can show that (paused, not ticking) instead of the flat
    // reconnect grace countdown turnDeadline is pointing at during that window.
    pausedTurnRemainingMs: state.pausedTurnRemainingMs,
    // How many alive players have voted so far -- a plain count, never who voted for whom, so
    // watching it live doesn't leak anyone's choice before the vote resolves.
    votedCount: Object.keys(state.votes).length,
    allVotedDeadline: state.allVotedDeadline,
    // Phantom votes from missed clue timers, per target -- shown so players understand why
    // someone might get eliminated with fewer real votes than expected.
    accusationVotes: state.accusationVotes,
    // Non-null only during a tie-breaking runoff, restricting who can be voted for.
    voteCandidateIds: state.voteCandidateIds,
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
