import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { GameApp } from '@/components/GameApp';
import * as socketModule from '@/lib/useGameSocket';

function mockSocket(overrides: Partial<socketModule.UseGameSocketResult> = {}) {
  return {
    status: 'idle',
    lastMessage: null,
    send: vi.fn(),
    ...overrides,
  } as socketModule.UseGameSocketResult;
}

describe('GameApp', () => {
  beforeEach(() => window.localStorage.clear());

  it('shows a connecting message before the socket opens', () => {
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(mockSocket({ status: 'connecting' }));
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} />);
    expect(screen.getByText(/connexion/i)).toBeInTheDocument();
  });

  it('sends JOIN_ROOM once the socket opens', () => {
    const send = vi.fn();
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(mockSocket({ status: 'open', send }));
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} />);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'JOIN_ROOM', code: 'ABCDE', name: 'Seb' }));
  });

  it('renders the lobby placeholder when the room state phase is LOBBY', () => {
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({ status: 'open', lastMessage: { type: 'ROOM_STATE', phase: 'LOBBY', players: [] } })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} />);
    expect(screen.getByText(/lobby/i)).toBeInTheDocument();
  });

  it('shows the error message when an ERROR message is received', () => {
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({ status: 'open', lastMessage: { type: 'ERROR', code: 'NAME_TAKEN', message: 'Ce pseudo est déjà pris' } })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Ce pseudo est déjà pris');
  });

  it('renders LobbyScreen with the host flag set when hostId matches the client id', () => {
    window.localStorage.setItem('undercover:clientId', 'c1');
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({
        status: 'open',
        lastMessage: { type: 'ROOM_STATE', phase: 'LOBBY', hostId: 'c1', players: [{ id: 'c1', name: 'Seb', alive: true, connected: true }] },
      })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} />);
    expect(screen.getByRole('button', { name: /lancer la partie/i })).toBeInTheDocument();
  });

  it('renders RoleRevealScreen with the current player private card during ROLE_REVEAL', () => {
    window.localStorage.setItem('undercover:clientId', 'c1');
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({
        status: 'open',
        lastMessage: {
          type: 'ROOM_STATE',
          phase: 'ROLE_REVEAL',
          hostId: 'c1',
          players: [{ id: 'c1', name: 'Seb', alive: true, connected: true, role: 'civil', character: 'Goku' }],
        },
      })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} />);
    expect(screen.getByText('Goku')).toBeInTheDocument();
  });
});
