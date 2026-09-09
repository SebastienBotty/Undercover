'use client';
import { useState } from 'react';
import styles from './VoteScreen.module.css';

interface Player {
  id: string;
  name: string;
  alive: boolean;
}

interface VoteScreenProps {
  players: Player[];
  selfId: string;
  onVote: (targetId: string) => void;
}

export function VoteScreen({ players, selfId, onVote }: VoteScreenProps) {
  const [votedForId, setVotedForId] = useState<string | null>(null);
  const targets = players.filter((p) => p.alive && p.id !== selfId);
  const votedFor = targets.find((p) => p.id === votedForId);

  function handleVote(targetId: string) {
    setVotedForId(targetId);
    onVote(targetId);
  }

  return (
    <div>
      <span className="eyebrow">Vote</span>
      <h2>Qui soupçonnes-tu ?</h2>
      <ul className="roster">
        {targets.map((p) => {
          const isSelected = p.id === votedForId;
          return (
            <li key={p.id}>
              <button
                onClick={() => handleVote(p.id)}
                className={`btn btnBlock ${isSelected ? styles.selected : 'btnGhost'}`}
              >
                {p.name}
                {isSelected && <span className={styles.check}> ✓</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {votedFor && (
        <p className="muted">
          Tu as voté pour <strong>{votedFor.name}</strong>. En attente des autres joueurs...
        </p>
      )}
    </div>
  );
}
