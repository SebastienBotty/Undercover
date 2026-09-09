'use client';
import { useState } from 'react';
import { usePseudo } from '@/lib/usePseudo';

interface HomeScreenProps {
  onEnterRoom: (code: string, pseudo: string, isHost: boolean) => void;
}

export function HomeScreen({ onEnterRoom }: HomeScreenProps) {
  const { pseudo, setPseudo } = usePseudo();
  const [draftPseudo, setDraftPseudo] = useState(pseudo);
  const [joinCode, setJoinCode] = useState('');

  if (!pseudo) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draftPseudo.trim()) setPseudo(draftPseudo);
        }}
      >
        <label htmlFor="pseudo-input">Choisis un pseudo</label>
        <input id="pseudo-input" value={draftPseudo} onChange={(e) => setDraftPseudo(e.target.value)} />
        <button type="submit">Continuer</button>
      </form>
    );
  }

  async function handleCreateRoom() {
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? '';
    const res = await fetch(`${serverUrl}/api/create-room`, { method: 'POST' });
    const { code } = (await res.json()) as { code: string };
    onEnterRoom(code, pseudo, true);
  }

  function handleJoinRoom() {
    onEnterRoom(joinCode.trim().toUpperCase(), pseudo, false);
  }

  return (
    <div>
      <p>Pseudo : {pseudo} <button onClick={() => setPseudo('')}>changer</button></p>
      <button onClick={handleCreateRoom}>Créer une salle</button>
      <div>
        <label htmlFor="join-code-input">Code de la salle</label>
        <input id="join-code-input" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
        <button onClick={handleJoinRoom}>Rejoindre</button>
      </div>
    </div>
  );
}
