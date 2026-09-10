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

  it('keeps the room code badge visible even before the room state arrives', () => {
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(mockSocket({ status: 'connecting' }));
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} onLeaveRoom={() => {}} />);
    expect(screen.getByText('ABCDE')).toBeInTheDocument();
  });

  it('keeps the room code badge visible during an in-progress phase, not just the lobby', () => {
    window.localStorage.setItem('undercover:clientId', 'p1');
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({
        status: 'open',
        lastMessage: {
          type: 'ROOM_STATE',
          phase: 'CLUE_ROUND',
          code: 'ABCDE',
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
    expect(screen.getByText('ABCDE')).toBeInTheDocument();
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
    expect(screen.getByRole('heading', { name: /joueurs/i })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /^quitter$/i }));
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

  it('renders ThemeSelectScreen during THEME_SELECT and sends SUBMIT_THEME on submit', () => {
    window.localStorage.setItem('undercover:clientId', 'p1');
    const send = vi.fn();
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({
        status: 'open',
        send,
        lastMessage: {
          type: 'ROOM_STATE',
          phase: 'THEME_SELECT',
          hostId: 'p1',
          settings: { mode: 'note' },
          turnOrder: ['p1', 'p2'],
          themeSetterId: 'p1',
          currentTheme: null,
          themes: [],
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
    fireEvent.change(screen.getByLabelText(/propose un thème/i), { target: { value: 'La force' } });
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));
    expect(send).toHaveBeenCalledWith({ type: 'SUBMIT_THEME', text: 'La force' });
  });

  it('leaves the room with the kicked notice instead of showing a plain alert when kicked', () => {
    const onLeaveRoom = vi.fn();
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({ status: 'open', lastMessage: { type: 'ERROR', code: 'KICKED', message: "L'hôte t'a exclu de la salle" } })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} onLeaveRoom={onLeaveRoom} />);
    expect(onLeaveRoom).toHaveBeenCalledWith("L'hôte t'a exclu de la salle");
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lets the host kick a player during an active phase via the host player controls, with no confirmation', () => {
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
    fireEvent.click(screen.getByRole('button', { name: /gérer les joueurs/i }));
    fireEvent.click(screen.getByRole('button', { name: /exclure bob/i }));
    expect(send).toHaveBeenCalledWith({ type: 'KICK_PLAYER', playerId: 'p2' });
  });

  it('gives non-hosts no access to the host player controls', () => {
    window.localStorage.setItem('undercover:clientId', 'p2');
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({
        status: 'open',
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
    render(<GameApp roomCode="ABCDE" pseudo="Bob" isHost={false} onLeaveRoom={() => {}} />);
    expect(screen.queryByRole('button', { name: /gérer les joueurs/i })).not.toBeInTheDocument();
  });

  it('does not show the host player controls in the lobby (it has its own kick buttons)', () => {
    window.localStorage.setItem('undercover:clientId', 'p1');
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({
        status: 'open',
        lastMessage: {
          type: 'ROOM_STATE',
          phase: 'LOBBY',
          hostId: 'p1',
          players: [{ id: 'p1', name: 'Alice', alive: true, connected: true }],
        },
      })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Alice" isHost={false} onLeaveRoom={() => {}} />);
    expect(screen.queryByRole('button', { name: /gérer les joueurs/i })).not.toBeInTheDocument();
  });

  it('shows the note instead of the character during ROLE_REVEAL in note mode', () => {
    window.localStorage.setItem('undercover:clientId', 'c1');
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({
        status: 'open',
        lastMessage: {
          type: 'ROOM_STATE',
          phase: 'ROLE_REVEAL',
          hostId: 'c1',
          settings: { mode: 'note' },
          players: [{ id: 'c1', name: 'Seb', alive: true, connected: true, role: 'civil', character: null, note: 14 }],
        },
      })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} onLeaveRoom={() => {}} />);
    expect(screen.getByText(/ta note : 14\/20/i)).toBeInTheDocument();
  });

  it('offers a leave-game button before the room state has even arrived', () => {
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(mockSocket({ status: 'connecting' }));
    const onLeaveRoom = vi.fn();
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} onLeaveRoom={onLeaveRoom} />);
    fireEvent.click(screen.getByRole('button', { name: /quitter la partie/i }));
    expect(onLeaveRoom).toHaveBeenCalledWith();
  });

  it('offers every player (not just the host) a leave-game button during an active phase, sending LEAVE_ROOM before leaving', () => {
    window.localStorage.setItem('undercover:clientId', 'p2');
    const onLeaveRoom = vi.fn();
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
    render(<GameApp roomCode="ABCDE" pseudo="Bob" isHost={false} onLeaveRoom={onLeaveRoom} />);
    fireEvent.click(screen.getByRole('button', { name: /quitter la partie/i }));
    expect(send).toHaveBeenCalledWith({ type: 'LEAVE_ROOM' });
    expect(onLeaveRoom).toHaveBeenCalledWith();
  });

  it('does not try to send LEAVE_ROOM when the socket is not open yet', () => {
    const onLeaveRoom = vi.fn();
    const send = vi.fn();
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(mockSocket({ status: 'connecting', send }));
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} onLeaveRoom={onLeaveRoom} />);
    fireEvent.click(screen.getByRole('button', { name: /quitter la partie/i }));
    expect(send).not.toHaveBeenCalled();
    expect(onLeaveRoom).toHaveBeenCalledWith();
  });

  it('sends LEAVE_ROOM before leaving from the end screen too', () => {
    window.localStorage.setItem('undercover:clientId', 'p1');
    const onLeaveRoom = vi.fn();
    const send = vi.fn();
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({
        status: 'open',
        send,
        lastMessage: {
          type: 'ROOM_STATE',
          phase: 'END',
          winner: 'civil',
          players: [{ id: 'p1', name: 'Alice', role: 'civil', character: 'Goku' }],
        },
      })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} onLeaveRoom={onLeaveRoom} />);
    fireEvent.click(screen.getByRole('button', { name: /^quitter$/i }));
    expect(send).toHaveBeenCalledWith({ type: 'LEAVE_ROOM' });
    expect(onLeaveRoom).toHaveBeenCalledWith();
  });

  it('leaves the room when a rejoin attempt is rejected as BANNED (host kick or a past voluntary leave)', () => {
    const onLeaveRoom = vi.fn();
    vi.spyOn(socketModule, 'useGameSocket').mockReturnValue(
      mockSocket({ status: 'open', lastMessage: { type: 'ERROR', code: 'BANNED', message: 'Tu ne peux pas rejoindre cette salle' } })
    );
    render(<GameApp roomCode="ABCDE" pseudo="Seb" isHost={false} onLeaveRoom={onLeaveRoom} />);
    expect(onLeaveRoom).toHaveBeenCalledWith('Tu ne peux pas rejoindre cette salle');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
