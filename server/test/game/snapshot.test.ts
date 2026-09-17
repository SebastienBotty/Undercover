import { describe, it, expect } from 'vitest';
import { buildSnapshot } from '../../src/game/snapshot';
import type { RoomState } from '../../src/types';

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: 'ABCDE',
    hostId: 'p1',
    phase: 'CLUE_ROUND',
    settings: { themes: ['anime'], similarityLevel: 'close', mrWhiteEnabled: false },
    players: [
      { id: 'p1', name: 'Alice', role: 'civil', character: 'Goku', characterImage: 'https://example.com/goku.jpg', characterSeries: 'Dragon Ball', note: null, alive: true, connected: true },
      { id: 'p2', name: 'Bob', role: 'undercover', character: 'Vegeta', characterImage: 'https://example.com/vegeta.jpg', characterSeries: 'Dragon Ball', note: null, alive: true, connected: true },
      { id: 'p3', name: 'Carl', role: 'civil', character: 'Goku', characterImage: 'https://example.com/goku.jpg', characterSeries: 'Dragon Ball', note: null, alive: false, connected: true },
    ],
    turnOrder: ['p1', 'p2', 'p3'],
    currentTurnIndex: 0,
    clues: [],
    votes: {},
    accusationVotes: {},
    voteCandidateIds: null,
    voteOrderStartId: null,
    round: 1,
    winner: null,
    lastEliminatedId: 'p3',
    turnDeadline: null,
    pausedTurnRemainingMs: null,
    allVotedDeadline: null,
    noEliminationReason: null,
    themeSetterId: null,
    currentTheme: null,
    themes: [],
    bannedClientIds: [],
    leftClientIds: [],
    ...overrides,
  };
}

describe('buildSnapshot', () => {
  it('reveals role and character only for the requesting player among the alive players', () => {
    const snapshot = buildSnapshot(makeRoom(), 'p1');
    const me = snapshot.players.find((p) => p.id === 'p1')!;
    const other = snapshot.players.find((p) => p.id === 'p2')!;
    expect(me.role).toBe('civil');
    expect(me.character).toBe('Goku');
    expect(me.characterImage).toBe('https://example.com/goku.jpg');
    expect(me.characterSeries).toBe('Dragon Ball');
    expect(other.role).toBeNull();
    expect(other.character).toBeNull();
    expect(other.characterImage).toBeNull();
    expect(other.characterSeries).toBeNull();
  });

  it('reveals role and character for eliminated players by default', () => {
    const snapshot = buildSnapshot(makeRoom(), 'p1');
    const eliminated = snapshot.players.find((p) => p.id === 'p3')!;
    expect(eliminated.role).toBe('civil');
    expect(eliminated.character).toBe('Goku');
    expect(eliminated.characterImage).toBe('https://example.com/goku.jpg');
  });

  it('hides an eliminated player role/character from others when revealRoleOnElimination is off, but not from themselves', () => {
    const room = makeRoom({
      settings: { themes: ['anime'], similarityLevel: 'close', mrWhiteEnabled: false, revealRoleOnElimination: false },
    });
    const forOther = buildSnapshot(room, 'p1');
    const eliminatedForOther = forOther.players.find((p) => p.id === 'p3')!;
    expect(eliminatedForOther.role).toBeNull();
    expect(eliminatedForOther.character).toBeNull();
    expect(eliminatedForOther.characterImage).toBeNull();

    const forSelf = buildSnapshot(room, 'p3');
    const eliminatedForSelf = forSelf.players.find((p) => p.id === 'p3')!;
    expect(eliminatedForSelf.role).toBe('civil');
    expect(eliminatedForSelf.character).toBe('Goku');
  });

  it('still reveals everyone at END even when revealRoleOnElimination is off', () => {
    const room = makeRoom({
      phase: 'END',
      settings: { themes: ['anime'], similarityLevel: 'close', mrWhiteEnabled: false, revealRoleOnElimination: false },
    });
    const snapshot = buildSnapshot(room, 'p1');
    const eliminated = snapshot.players.find((p) => p.id === 'p3')!;
    expect(eliminated.role).toBe('civil');
    expect(eliminated.character).toBe('Goku');
  });

  it('reveals everything for everyone once the game has ended', () => {
    const snapshot = buildSnapshot(makeRoom({ phase: 'END' }), 'p1');
    const other = snapshot.players.find((p) => p.id === 'p2')!;
    expect(other.role).toBe('undercover');
    expect(other.character).toBe('Vegeta');
    expect(other.characterImage).toBe('https://example.com/vegeta.jpg');
  });

  it('passes through room-level fields unchanged', () => {
    const room = makeRoom({ themeSetterId: 'p1', currentTheme: 'La force', themes: [{ round: 1, playerId: 'p1', text: 'La force' }] });
    const snapshot = buildSnapshot(room, 'p1');
    expect(snapshot.code).toBe(room.code);
    expect(snapshot.phase).toBe(room.phase);
    expect(snapshot.turnOrder).toEqual(room.turnOrder);
    expect(snapshot.lastEliminatedId).toBe('p3');
    expect(snapshot.themeSetterId).toBe('p1');
    expect(snapshot.currentTheme).toBe('La force');
    expect(snapshot.themes).toEqual([{ round: 1, playerId: 'p1', text: 'La force' }]);
  });

  it('exposes a plain vote count (not who voted for whom) and the all-voted grace deadline', () => {
    const room = makeRoom({ votes: { p1: 'p2', p2: null }, allVotedDeadline: 1234 });
    const snapshot = buildSnapshot(room, 'p1');
    expect(snapshot.votedCount).toBe(2);
    expect(snapshot.allVotedDeadline).toBe(1234);
    expect(snapshot).not.toHaveProperty('votes');
  });

  it('passes through the no-elimination reason', () => {
    const snapshot = buildSnapshot(makeRoom({ noEliminationReason: 'no_votes' }), 'p1');
    expect(snapshot.noEliminationReason).toBe('no_votes');
  });

  it('passes through accusationVotes and voteCandidateIds unchanged', () => {
    const room = makeRoom({ accusationVotes: { p2: 2 }, voteCandidateIds: ['p1', 'p2'] });
    const snapshot = buildSnapshot(room, 'p1');
    expect(snapshot.accusationVotes).toEqual({ p2: 2 });
    expect(snapshot.voteCandidateIds).toEqual(['p1', 'p2']);
  });

  it('passes through pausedTurnRemainingMs unchanged', () => {
    const snapshot = buildSnapshot(makeRoom({ pausedTurnRemainingMs: 45_000 }), 'p1');
    expect(snapshot.pausedTurnRemainingMs).toBe(45_000);
  });

  it('rotates voteDisplayOrder to start at voteOrderStartId, leaving turnOrder itself untouched', () => {
    const snapshot = buildSnapshot(makeRoom({ turnOrder: ['p1', 'p2', 'p3'], voteOrderStartId: 'p2' }), 'p1');
    expect(snapshot.turnOrder).toEqual(['p1', 'p2', 'p3']);
    expect(snapshot.voteDisplayOrder).toEqual(['p2', 'p3', 'p1']);
  });

  it('makes voteDisplayOrder match turnOrder when no vote has opened yet (voteOrderStartId null)', () => {
    const snapshot = buildSnapshot(makeRoom({ turnOrder: ['p1', 'p2', 'p3'], voteOrderStartId: null }), 'p1');
    expect(snapshot.voteDisplayOrder).toEqual(['p1', 'p2', 'p3']);
  });

  it('reveals note only for the requesting player among the alive players, mirroring character', () => {
    const room = makeRoom({
      players: [
        { id: 'p1', name: 'Alice', role: 'civil', character: null, characterImage: null, characterSeries: null, note: 14, alive: true, connected: true },
        { id: 'p2', name: 'Bob', role: 'undercover', character: null, characterImage: null, characterSeries: null, note: 10, alive: true, connected: true },
        { id: 'p3', name: 'Carl', role: 'civil', character: null, characterImage: null, characterSeries: null, note: 14, alive: false, connected: true },
      ],
    });
    const snapshot = buildSnapshot(room, 'p1');
    const me = snapshot.players.find((p) => p.id === 'p1')!;
    const other = snapshot.players.find((p) => p.id === 'p2')!;
    const eliminated = snapshot.players.find((p) => p.id === 'p3')!;
    expect(me.note).toBe(14);
    expect(other.note).toBeNull();
    expect(eliminated.note).toBe(14);
  });
});
