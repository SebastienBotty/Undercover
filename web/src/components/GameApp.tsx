'use client';
import { useEffect, useRef, useState } from 'react';
import { useGameSocket } from '@/lib/useGameSocket';
import { getOrCreateClientId } from '@/lib/clientId';

interface GameAppProps {
  roomCode: string;
  pseudo: string;
  isHost: boolean;
}

export function GameApp({ roomCode, pseudo, isHost }: GameAppProps) {
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? '';
  const wsUrl = `${serverUrl.replace(/^http/, 'ws')}/ws?code=${roomCode}`;
  const { status, lastMessage, send } = useGameSocket(wsUrl);
  const [roomState, setRoomState] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
    return <p>Connexion à la salle {roomCode}...</p>;
  }

  function renderPhase() {
    if (!roomState) return <p>En attente des données de la salle...</p>;
    if (roomState.phase === 'LOBBY') return <p>En attente dans le lobby...</p>; // replaced by LobbyScreen in Task 13
    return <p>Connecté ({roomState.phase})</p>; // fallback for phases not wired up yet
  }

  return (
    <div>
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {renderPhase()}
    </div>
  );
}
