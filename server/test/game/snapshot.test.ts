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
      { id: 'p1', name: 'Alice', role: 'civil', character: 'Goku', characterImage: 'https://example.com/goku.jpg', alive: true, connected: true },
      { id: 'p2', name: 'Bob', role: 'undercover', character: 'Vegeta', characterImage: 'https://example.com/vegeta.jpg', alive: true, connected: true },
      { id: 'p3', name: 'Carl', role: 'civil', character: 'Goku', characterImage: 'https://example.com/goku.jpg', alive: false, connected: true },
    ],
    turnOrder: ['p1', 'p2', 'p3'],
    currentTurnIndex: 0,
    clues: [],
    votes: {},
    round: 1,
    winner: null,
    lastEliminatedId: 'p3',
    turnDeadline: null,
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
    expect(other.role).toBeNull();
    expect(other.character).toBeNull();
    expect(other.characterImage).toBeNull();
  });

  it('always reveals role and character for eliminated players', () => {
    const snapshot = buildSnapshot(makeRoom(), 'p1');
    const eliminated = snapshot.players.find((p) => p.id === 'p3')!;
    expect(eliminated.role).toBe('civil');
    expect(eliminated.character).toBe('Goku');
    expect(eliminated.characterImage).toBe('https://example.com/goku.jpg');
  });

  it('reveals everything for everyone once the game has ended', () => {
    const snapshot = buildSnapshot(makeRoom({ phase: 'END' }), 'p1');
    const other = snapshot.players.find((p) => p.id === 'p2')!;
    expect(other.role).toBe('undercover');
    expect(other.character).toBe('Vegeta');
    expect(other.characterImage).toBe('https://example.com/vegeta.jpg');
  });

  it('passes through room-level fields unchanged', () => {
    const room = makeRoom();
    const snapshot = buildSnapshot(room, 'p1');
    expect(snapshot.code).toBe(room.code);
    expect(snapshot.phase).toBe(room.phase);
    expect(snapshot.turnOrder).toEqual(room.turnOrder);
    expect(snapshot.lastEliminatedId).toBe('p3');
  });
});
