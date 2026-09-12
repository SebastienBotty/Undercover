'use client';
import { useState } from 'react';
import { usePseudo } from '@/lib/usePseudo';
import { RulesButton } from '@/components/RulesButton';
import styles from './HomeScreen.module.css';

interface HomeScreenProps {
  onEnterRoom: (code: string, pseudo: string, isHost: boolean) => void;
  /** Shown once, e.g. right after being kicked from a room -- purely informational. */
  notice?: string | null;
}

export function HomeScreen({ onEnterRoom, notice }: HomeScreenProps) {
  const { pseudo, setPseudo } = usePseudo();
  const [draftPseudo, setDraftPseudo] = useState(pseudo);
  const [joinCode, setJoinCode] = useState('');
  const [createRoomError, setCreateRoomError] = useState<string | null>(null);

  if (!pseudo) {
    return (
      <main className="shell">
        <RulesButton />
        <div className="card">
          <span className="eyebrow">Jeu de société en ligne</span>
          <h1 className={styles.title}>Undercover</h1>
          <p className={`muted ${styles.pitch}`}>
            Chacun reçoit un personnage secret. Un ou plusieurs joueurs sont des <strong>Undercover</strong> avec
            un personnage légèrement différent — donnez des indices à tour de rôle, puis votez pour les démasquer
            avant qu&apos;ils ne l&apos;emportent. Gratuit, sans inscription, jouable direct dans le navigateur.
          </p>
          <hr className="divider" />
          <h2>Qui es-tu ce soir ?</h2>
          <form
            className="field"
            onSubmit={(e) => {
              e.preventDefault();
              if (draftPseudo.trim()) setPseudo(draftPseudo);
            }}
          >
            <label htmlFor="pseudo-input">Choisis un pseudo</label>
            <input
              id="pseudo-input"
              className="input"
              value={draftPseudo}
              onChange={(e) => setDraftPseudo(e.target.value)}
            />
            <button type="submit" className="btn btnBlock">
              Continuer
            </button>
          </form>
        </div>
      </main>
    );
  }

  async function handleCreateRoom() {
    setCreateRoomError(null);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? '';
      const res = await fetch(`${serverUrl}/api/create-room`, { method: 'POST' });
      const { code } = (await res.json()) as { code: string };
      onEnterRoom(code, pseudo, true);
    } catch {
      setCreateRoomError('Impossible de créer la salle. Vérifie ta connexion et réessaie.');
    }
  }

  function handleJoinRoom() {
    onEnterRoom(joinCode.trim().toUpperCase(), pseudo, false);
  }

  return (
    <main className="shell">
      <RulesButton />
      <div className="card">
        <span className="eyebrow">Undercover</span>
        <h2>Prêt à jouer, {pseudo} ?</h2>
        <p className="muted">
          <button className="btnGhost btn" onClick={() => setPseudo('')}>changer de pseudo</button>
        </p>

        {notice && (
          <p role="alert" className="alert">
            {notice}
          </p>
        )}

        <button onClick={handleCreateRoom} className="btn btnBlock">
          Créer une salle
        </button>
        {createRoomError && (
          <p role="alert" className="alert">
            {createRoomError}
          </p>
        )}

        <hr className="divider" />

        <h2>Rejoindre une salle</h2>
        <div className="field">
          <label htmlFor="join-code-input">Code de la salle</label>
          <input
            id="join-code-input"
            className="input"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
          <button onClick={handleJoinRoom} className="btn btnGhost btnBlock">
            Rejoindre
          </button>
        </div>
      </div>
    </main>
  );
}
