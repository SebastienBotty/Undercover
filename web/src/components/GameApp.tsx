'use client';
import { useEffect, useRef, useState } from 'react';
import { useGameSocket } from '@/lib/useGameSocket';
import { getOrCreateClientId } from '@/lib/clientId';
import { LobbyScreen } from '@/components/LobbyScreen';
import { RoleRevealScreen } from '@/components/RoleRevealScreen';
import { ClueRoundScreen } from '@/components/ClueRoundScreen';
import { VoteScreen } from '@/components/VoteScreen';
import { EliminationScreen } from '@/components/EliminationScreen';
import { EndScreen } from '@/components/EndScreen';
import { getStoredHostSettings, storeHostSettings, type RoomSettings } from '@/lib/hostSettings';

interface GameAppProps {
  roomCode: string;
  pseudo: string;
  isHost: boolean;
  onLeaveRoom: () => void;
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
      setErrorMessage(lastMessage.message);
    }
  }, [lastMessage]);

  if (status === 'connecting' || status === 'idle') {
    return (
      <main className="shell">
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
  }

  function handleStart() {
    send({ type: 'START_GAME', settings });
  }

  function renderPhase() {
    if (!roomState) return <p className="muted">En attente des données de la salle...</p>;
    if (roomState.phase === 'LOBBY') {
      return (
        <LobbyScreen
          isHost={roomState.hostId === getOrCreateClientId()}
          code={roomState.code ?? roomCode}
          players={roomState.players}
          settings={settings}
          onStart={handleStart}
          onSettingsChange={handleSettingsChange}
        />
      );
    }
    if (roomState.phase === 'ROLE_REVEAL') {
      const me = roomState.players.find((p: any) => p.id === getOrCreateClientId());
      return <RoleRevealScreen role={me?.role ?? null} character={me?.character ?? null} />;
    }
    if (roomState.phase === 'CLUE_ROUND') {
      return (
        <ClueRoundScreen
          players={roomState.players}
          turnOrder={roomState.turnOrder}
          currentTurnIndex={roomState.currentTurnIndex}
          clues={roomState.clues}
          round={roomState.round}
          selfId={getOrCreateClientId()}
          onSubmitClue={(text) => send({ type: 'SUBMIT_CLUE', text })}
        />
      );
    }
    if (roomState.phase === 'VOTE') {
      return (
        <VoteScreen
          players={roomState.players}
          selfId={getOrCreateClientId()}
          onVote={(targetId) => send({ type: 'SUBMIT_VOTE', targetId })}
        />
      );
    }
    if (roomState.phase === 'ELIMINATION') {
      return (
        <EliminationScreen
          players={roomState.players}
          lastEliminatedId={roomState.lastEliminatedId}
          selfId={getOrCreateClientId()}
          onMrWhiteGuess={(guess) => send({ type: 'MR_WHITE_GUESS', guess })}
        />
      );
    }
    if (roomState.phase === 'END') {
      return <EndScreen winner={roomState.winner} players={roomState.players} onReplay={onLeaveRoom} />;
    }
    return <p className="muted">Connecté ({roomState.phase})</p>; // fallback for phases not wired up yet
  }

  return (
    <main className="shell">
      <div className="card">
        {errorMessage && (
          <p role="alert" className="alert">
            {errorMessage}
          </p>
        )}
        {renderPhase()}
      </div>
    </main>
  );
}
