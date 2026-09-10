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
      { id: 'p1', name: 'Alice', role: 'civil', character: 'Goku', characterImage: 'https://example.com/goku.jpg', note: null, alive: true, connected: true },
      { id: 'p2', name: 'Bob', role: 'undercover', character: 'Vegeta', characterImage: 'https://example.com/vegeta.jpg', note: null, alive: true, connected: true },
      { id: 'p3', name: 'Carl', role: 'civil', character: 'Goku', characterImage: 'https://example.com/goku.jpg', note: null, alive: false, connected: true },
    ],
    turnOrder: ['p1', 'p2', 'p3'],
    currentTurnIndex: 0,
    clues: [],
    votes: {},
    round: 1,
    winner: null,
    lastEliminatedId: 'p3',
    turnDeadline: null,
    themeSetterId: null,
    currentTheme: null,
    themes: [],
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

  it('reveals note only for the requesting player among the alive players, mirroring character', () => {
    const room = makeRoom({
      players: [
        { id: 'p1', name: 'Alice', role: 'civil', character: null, characterImage: null, note: 14, alive: true, connected: true },
        { id: 'p2', name: 'Bob', role: 'undercover', character: null, characterImage: null, note: 10, alive: true, connected: true },
        { id: 'p3', name: 'Carl', role: 'civil', character: null, characterImage: null, note: 14, alive: false, connected: true },
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
