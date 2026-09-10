'use client';
import { useState } from 'react';
import styles from './HostPlayerControls.module.css';

interface Player {
  id: string;
  name: string;
  alive?: boolean;
}

interface HostPlayerControlsProps {
  players: Player[];
  selfId: string;
  onKickPlayer: (playerId: string) => void;
}

/** Host-only, collapsed-by-default panel letting the host exclude a player at any point during
 * the game (not just from the lobby's own player list). */
export function HostPlayerControls({ players, selfId, onKickPlayer }: HostPlayerControlsProps) {
  const [open, setOpen] = useState(false);
  const others = players.filter((p) => p.id !== selfId);

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={`btnGhost btn ${styles.toggle}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Gérer les joueurs {open ? '▴' : '▾'}
      </button>
      {open && (
        <ul className={styles.list}>
          {others.map((p) => (
            <li key={p.id} className={styles.row}>
              <span className={p.alive === false ? styles.eliminatedName : undefined}>{p.name}</span>
              <button
                type="button"
                aria-label={`Exclure ${p.name}`}
                className={`btnGhost btn ${styles.kickButton}`}
                onClick={() => onKickPlayer(p.id)}
              >
                Exclure
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
