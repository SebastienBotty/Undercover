'use client';
import { useState } from 'react';
import { HomeScreen } from '@/components/HomeScreen';
import { GameApp } from '@/components/GameApp';

export default function Page() {
  const [room, setRoom] = useState<{ code: string; pseudo: string; isHost: boolean } | null>(null);
  const [leaveNotice, setLeaveNotice] = useState<string | null>(null);

  function handleEnterRoom(code: string, pseudo: string, isHost: boolean) {
    setLeaveNotice(null);
    setRoom({ code, pseudo, isHost });
  }

  function handleLeaveRoom(notice?: string) {
    setRoom(null);
    setLeaveNotice(notice ?? null);
  }

  if (!room) {
    return <HomeScreen onEnterRoom={handleEnterRoom} notice={leaveNotice} />;
  }

  return <GameApp roomCode={room.code} pseudo={room.pseudo} isHost={room.isHost} onLeaveRoom={handleLeaveRoom} />;
}
