import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
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
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} onLeaveRoom={() => {}} />);
    expect(screen.getByText(/connexion/i)).toBeInTheDocument();
  });

  it('sends JOIN_ROOM once the socket opens', () => {
    const send = vi.fn();
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(mockSocket({ status: 'open', send }));
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} onLeaveRoom={() => {}} />);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'JOIN_ROOM', code: 'ABCDE', name: 'Seb' }));
  });

  it('renders the lobby screen when the room state phase is LOBBY', () => {
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({ status: 'open', lastMessage: { type: 'ROOM_STATE', phase: 'LOBBY', code: 'ABCDE', players: [] } })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} onLeaveRoom={() => {}} />);
    expect(screen.getByText(/joueurs/i)).toBeInTheDocument();
  });

  it('shows the error message when an ERROR message is received', () => {
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({ status: 'open', lastMessage: { type: 'ERROR', code: 'NAME_TAKEN', message: 'Ce pseudo est déjà pris' } })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} onLeaveRoom={() => {}} />);
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
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} onLeaveRoom={() => {}} />);
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
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} onLeaveRoom={() => {}} />);
    expect(screen.getByText('Goku')).toBeInTheDocument();
  });

  it('renders ClueRoundScreen and sends SUBMIT_CLUE on submit', () => {
    window.localStorage.setItem('undercover:clientId', 'p1');
    const send = vi.fn();
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({
        status: 'open',
        send,
        lastMessage: {
          type: 'ROOM_STATE',
          phase: 'CLUE_ROUND',
          hostId: 'p1',
          turnOrder: ['p1', 'p2'],
          currentTurnIndex: 0,
          clues: [],
          round: 1,
          players: [
            { id: 'p1', name: 'Alice', alive: true, connected: true },
            { id: 'p2', name: 'Bob', alive: true, connected: true },
          ],
        },
      })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Alice" isHost={false} onLeaveRoom={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/ton indice/i), { target: { value: 'fort' } });
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));
    expect(send).toHaveBeenCalledWith({ type: 'SUBMIT_CLUE', text: 'fort' });
  });

  it('renders VoteScreen and sends SUBMIT_VOTE on vote', () => {
    window.localStorage.setItem('undercover:clientId', 'p1');
    const send = vi.fn();
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({
        status: 'open',
        send,
        lastMessage: {
          type: 'ROOM_STATE',
          phase: 'VOTE',
          hostId: 'p1',
          turnOrder: ['p1', 'p2'],
          clues: [],
          round: 1,
          players: [
            { id: 'p1', name: 'Alice', alive: true, connected: true },
            { id: 'p2', name: 'Bob', alive: true, connected: true },
          ],
        },
      })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Alice" isHost={false} onLeaveRoom={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bob' }));
    expect(send).toHaveBeenCalledWith({ type: 'SUBMIT_VOTE', targetId: 'p2' });
  });

  it('renders EliminationScreen and sends MR_WHITE_GUESS on guess', () => {
    window.localStorage.setItem('undercover:clientId', 'p2');
    const send = vi.fn();
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({
        status: 'open',
        send,
        lastMessage: {
          type: 'ROOM_STATE',
          phase: 'ELIMINATION',
          hostId: 'p1',
          lastEliminatedId: 'p2',
          players: [
            { id: 'p1', name: 'Alice', alive: true, connected: true, role: null, character: null },
            { id: 'p2', name: 'Bob', alive: false, connected: true, role: 'mrwhite', character: null },
          ],
        },
      })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Bob" isHost={false} onLeaveRoom={() => {}} />);
    fireEvent.change(screen.getByLabelText(/devine le personnage/i), { target: { value: 'Goku' } });
    fireEvent.click(screen.getByRole('button', { name: /deviner/i }));
    expect(send).toHaveBeenCalledWith({ type: 'MR_WHITE_GUESS', guess: 'Goku' });
  });

  it('renders EndScreen and calls onLeaveRoom when quit is clicked', () => {
    const onLeaveRoom = vi.fn();
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({
        status: 'open',
        lastMessage: {
          type: 'ROOM_STATE',
          phase: 'END',
          winner: 'civil',
          players: [{ id: 'p1', name: 'Alice', role: 'civil', character: 'Goku' }],
        },
      })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} onLeaveRoom={onLeaveRoom} />);
    fireEvent.click(screen.getByRole('button', { name: /quitter/i }));
    expect(onLeaveRoom).toHaveBeenCalled();
  });

  it('sends RESTART_GAME when the host clicks Rejouer on the end screen', () => {
    window.localStorage.setItem('undercover:clientId', 'p1');
    const send = vi.fn();
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({
        status: 'open',
        send,
        lastMessage: {
          type: 'ROOM_STATE',
          phase: 'END',
          hostId: 'p1',
          winner: 'civil',
          players: [{ id: 'p1', name: 'Alice', role: 'civil', character: 'Goku' }],
        },
      })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Alice" isHost={false} onLeaveRoom={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /rejouer/i }));
    expect(send).toHaveBeenCalledWith({ type: 'RESTART_GAME' });
  });
});
