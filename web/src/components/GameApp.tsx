'use client';
import { useEffect, useRef, useState } from 'react';
import { useGameSocket } from '@/lib/useGameSocket';
import { getOrCreateClientId } from '@/lib/clientId';
import { LobbyScreen } from '@/components/LobbyScreen';
import { RoleRevealScreen } from '@/components/RoleRevealScreen';
import { ThemeSelectScreen } from '@/components/ThemeSelectScreen';
import { ClueRoundScreen } from '@/components/ClueRoundScreen';
import { VoteScreen } from '@/components/VoteScreen';
import { EliminationScreen } from '@/components/EliminationScreen';
import { EndScreen } from '@/components/EndScreen';
import { RoleBanner } from '@/components/RoleBanner';
import { RoomCodeBadge } from '@/components/RoomCodeBadge';
import { LeaveGameButton } from '@/components/LeaveGameButton';
import { HostPlayerControls } from '@/components/HostPlayerControls';
import { getStoredHostSettings, storeHostSettings, normalizeSettings, type RoomSettings } from '@/lib/hostSettings';

const PHASES_WITH_ROLE_BANNER = ['THEME_SELECT', 'CLUE_ROUND', 'VOTE', 'ELIMINATION'];

interface GameAppProps {
  roomCode: string;
  pseudo: string;
  isHost: boolean;
  onLeaveRoom: (notice?: string) => void;
}

export function GameApp({ roomCode, pseudo, isHost, onLeaveRoom }: GameAppProps) {
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? '';
  const wsUrl = `${serverUrl.replace(/^http/, 'ws')}/ws?code=${roomCode}`;
  const { status, lastMessage, send } = useGameSocket(wsUrl);
  const [roomState, setRoomState] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<RoomSettings>(() => getStoredHostSettings());
  const joinedRef = useRef(false);

  useEffect(() => {
    if (status === 'open' && !joinedRef.current) {
      send({ type: 'JOIN_ROOM', code: roomCode, name: pseudo, clientId: getOrCreateClientId(), isHost });
      joinedRef.current = true;
    }
    if (status !== 'open') {
      joinedRef.current = false;
    }
  }, [status, roomCode, pseudo, send]);

  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === 'ROOM_STATE') {
      setRoomState(lastMessage);
      setErrorMessage(null);
    } else if (lastMessage.type === 'ERROR') {
      if (lastMessage.code === 'KICKED' || lastMessage.code === 'BANNED') {
        // KICKED: the server is about to close this socket. BANNED: a join/rejoin attempt was
        // flatly rejected (host kick or the player's own past voluntary leave). Either way, leave
        // the room outright instead of flashing an alert over a screen the player can't act on.
        onLeaveRoom(lastMessage.message);
        return;
      }
      setErrorMessage(lastMessage.message);
    }
  }, [lastMessage, onLeaveRoom]);

  // Sent right before actually leaving, so the server can tell a deliberate departure apart from
  // merely losing connection -- only a deliberate leave permanently bans the client id from
  // rejoining (see server/src/GameRoom.ts's handleLeaveRoom).
  function handleLeaveVoluntarily() {
    if (status === 'open') {
      send({ type: 'LEAVE_ROOM' });
    }
    onLeaveRoom();
  }

  if (status === 'connecting' || status === 'idle') {
    return (
      <main className="shell">
        <RoomCodeBadge code={roomCode} />
        <LeaveGameButton onLeave={handleLeaveVoluntarily} />
        <div className="card">
          <span className="eyebrow">Undercover</span>
          <p className="muted">Connexion à la salle {roomCode}...</p>
        </div>
      </main>
    );
  }

  function handleSettingsChange(next: RoomSettings) {
    setSettings(next);
    storeHostSettings(next);
    send({ type: 'UPDATE_SETTINGS', settings: next });
  }

  function handleStart() {
    send({ type: 'START_GAME', settings });
  }

  const me = roomState ? roomState.players.find((p: any) => p.id === getOrCreateClientId()) ?? null : null;
  const amHost = roomState?.hostId === getOrCreateClientId();
  const lobbySettings = amHost ? settings : normalizeSettings(roomState?.settings);

  function renderPhase() {
    if (!roomState) return <p className="muted">En attente des données de la salle...</p>;
    if (roomState.phase === 'LOBBY') {
      return (
        <LobbyScreen
          isHost={amHost}
          code={roomState.code ?? roomCode}
          players={roomState.players}
          settings={lobbySettings}
          selfId={getOrCreateClientId()}
          onStart={handleStart}
          onSettingsChange={handleSettingsChange}
          onKickPlayer={(playerId) => send({ type: 'KICK_PLAYER', playerId })}
        />
      );
    }
    if (roomState.phase === 'ROLE_REVEAL') {
      return (
        <RoleRevealScreen
          role={me?.role ?? null}
          character={me?.character ?? null}
          characterImage={me?.characterImage ?? null}
          characterSeries={me?.characterSeries ?? null}
          note={me?.note ?? null}
        />
      );
    }
    if (roomState.phase === 'THEME_SELECT') {
      return (
        <ThemeSelectScreen
          players={roomState.players}
          turnOrder={roomState.turnOrder}
          clues={roomState.clues}
          themes={roomState.themes}
          round={roomState.round}
          themeSetterId={roomState.themeSetterId}
          turnDeadline={roomState.turnDeadline}
          selfId={getOrCreateClientId()}
          onSubmitTheme={(text) => send({ type: 'SUBMIT_THEME', text })}
        />
      );
    }
    if (roomState.phase === 'CLUE_ROUND') {
      return (
        <ClueRoundScreen
          players={roomState.players}
          turnOrder={roomState.turnOrder}
          currentTurnIndex={roomState.currentTurnIndex}
          clues={roomState.clues}
          round={roomState.round}
          turnDeadline={roomState.turnDeadline}
          themes={roomState.themes}
          currentTheme={roomState.currentTheme}
          selfId={getOrCreateClientId()}
          onSubmitClue={(text) => send({ type: 'SUBMIT_CLUE', text })}
        />
      );
    }
    if (roomState.phase === 'VOTE') {
      return (
        <VoteScreen
          players={roomState.players}
          turnOrder={roomState.turnOrder}
          clues={roomState.clues}
          round={roomState.round}
          themes={roomState.themes}
          turnDeadline={roomState.turnDeadline}
          voteDurationSeconds={roomState.settings?.voteTimerSeconds}
          votedCount={roomState.votedCount}
          allVotedDeadline={roomState.allVotedDeadline}
          selfId={getOrCreateClientId()}
          onVote={(targetId) => send({ type: 'SUBMIT_VOTE', targetId })}
          onRetractVote={() => send({ type: 'RETRACT_VOTE' })}
        />
      );
    }
    if (roomState.phase === 'ELIMINATION') {
      return (
        <EliminationScreen
          players={roomState.players}
          lastEliminatedId={roomState.lastEliminatedId}
          noEliminationReason={roomState.noEliminationReason}
          selfId={getOrCreateClientId()}
          mode={roomState.settings?.mode}
          onMrWhiteGuess={(guess) => send({ type: 'MR_WHITE_GUESS', guess })}
        />
      );
    }
    if (roomState.phase === 'END') {
      return (
        <EndScreen
          winner={roomState.winner}
          players={roomState.players}
          isHost={roomState.hostId === getOrCreateClientId()}
          onRestart={() => send({ type: 'RESTART_GAME' })}
          onLeave={handleLeaveVoluntarily}
        />
      );
    }
    return <p className="muted">Connecté ({roomState.phase})</p>; // fallback for phases not wired up yet
  }

  return (
    <main className="shell">
      <RoomCodeBadge code={roomState?.code ?? roomCode} />
      <LeaveGameButton onLeave={handleLeaveVoluntarily} />
      <div className={`card${roomState?.phase === 'LOBBY' ? ' cardWide' : ''}`}>
        {errorMessage && (
          <p role="alert" className="alert">
            {errorMessage}
          </p>
        )}
        {amHost && roomState && roomState.phase !== 'LOBBY' && roomState.phase !== 'END' && (
          <HostPlayerControls
            players={roomState.players}
            selfId={getOrCreateClientId()}
            onKickPlayer={(playerId) => send({ type: 'KICK_PLAYER', playerId })}
          />
        )}
        {roomState && PHASES_WITH_ROLE_BANNER.includes(roomState.phase) && (
          <RoleBanner
            role={me?.role ?? null}
            character={me?.character ?? null}
            characterImage={me?.characterImage ?? null}
            characterSeries={me?.characterSeries ?? null}
            note={me?.note ?? null}
          />
        )}
        {renderPhase()}
      </div>
    </main>
  );
}
