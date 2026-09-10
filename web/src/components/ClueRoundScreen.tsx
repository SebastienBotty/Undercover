'use client';
import { useEffect, useState } from 'react';
import { RoundRecapTable } from './RoundRecapTable';
import styles from './ClueRoundScreen.module.css';

interface Player { id: string; name: string; }
interface Clue { playerId: string; round: number; text: string; }
interface ThemeEntry { round: number; text: string; }

interface ClueRoundScreenProps {
  players: Player[];
  turnOrder: string[];
  currentTurnIndex: number;
  clues: Clue[];
  round: number;
  turnDeadline?: number | null;
  themes?: ThemeEntry[];
  currentTheme?: string | null;
  selfId: string;
  onSubmitClue: (text: string) => void;
}

const URGENT_THRESHOLD_SECONDS = 10;

export function ClueRoundScreen({ players, turnOrder, currentTurnIndex, clues, round, turnDeadline, themes, currentTheme, selfId, onSubmitClue }: ClueRoundScreenProps) {
  const [draft, setDraft] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const currentPlayerId = turnOrder[currentTurnIndex];
  const currentPlayer = players.find((p) => p.id === currentPlayerId);
  const isMyTurn = currentPlayerId === selfId;

  useEffect(() => {
    if (!turnDeadline) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000)));
    tick();
    const intervalId = setInterval(tick, 250);
    return () => clearInterval(intervalId);
  }, [turnDeadline]);

  return (
    <div>
      <div className={styles.header}>
        <span className="eyebrow">Manche {round}</span>
        {secondsLeft !== null && (
          <span className={`${styles.timer}${secondsLeft <= URGENT_THRESHOLD_SECONDS ? ` ${styles.timerUrgent}` : ''}`}>
            ⏱ {secondsLeft}s
          </span>
        )}
      </div>
      <h2>Indices</h2>
      {currentTheme && <p className="muted">Thème : <strong>{currentTheme}</strong></p>}
      <RoundRecapTable
        players={players}
        turnOrder={turnOrder}
        clues={clues}
        totalRounds={round}
        currentTurnPlayerId={currentPlayerId}
        themes={themes}
      />
      {isMyTurn ? (
        <form className="field" onSubmit={(e) => { e.preventDefault(); onSubmitClue(draft); setDraft(''); }}>
          <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ton indice" />
          <button type="submit" className="btn btnBlock">Envoyer</button>
        </form>
      ) : (
        <p className="muted">Au tour de {currentPlayer?.name}...</p>
      )}
    </div>
  );
}
