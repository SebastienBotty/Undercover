'use client';
import { useState } from 'react';
import { HomeScreen } from '@/components/HomeScreen';
import { GameApp } from '@/components/GameApp';

export default function Page() {
  const [room, setRoom] = useState<{ code: string; pseudo: string; isHost: boolean } | null>(null);

  if (!room) {
    return <HomeScreen onEnterRoom={(code, pseudo, isHost) => setRoom({ code, pseudo, isHost })} />;
  }

  return <GameApp roomCode={room.code} pseudo={room.pseudo} isHost={room.isHost} />;
}
