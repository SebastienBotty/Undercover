'use client';
import { useEffect, useState } from 'react';
import { RoundRecapTable } from './RoundRecapTable';
import styles from './ThemeSelectScreen.module.css';

interface Player { id: string; name: string; }
interface Clue { playerId: string; round: number; text: string; }
interface ThemeEntry { round: number; playerId: string; text: string; }

interface ThemeSelectScreenProps {
  players: Player[];
  turnOrder: string[];
  clues: Clue[];
  themes: ThemeEntry[];
  round: number;
  themeSetterId: string | null;
  turnDeadline?: number | null;
  selfId: string;
  onSubmitTheme: (text: string) => void;
}

const URGENT_THRESHOLD_SECONDS = 10;

export function ThemeSelectScreen({ players, turnOrder, clues, themes, round, themeSetterId, turnDeadline, selfId, onSubmitTheme }: ThemeSelectScreenProps) {
  const [draft, setDraft] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const setter = players.find((p) => p.id === themeSetterId);
  const isMyTurn = themeSetterId === selfId;

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
      {secondsLeft !== null && (
        <div className={styles.header}>
          <span className={`${styles.timer}${secondsLeft <= URGENT_THRESHOLD_SECONDS ? ` ${styles.timerUrgent}` : ''}`}>
            ⏱ {secondsLeft}s
          </span>
        </div>
      )}
      <h2>Thème</h2>
      {round > 1 && (
        <RoundRecapTable players={players} turnOrder={turnOrder} clues={clues} themes={themes} totalRounds={round - 1} />
      )}
      {isMyTurn ? (
        <form className="field" onSubmit={(e) => { e.preventDefault(); onSubmitTheme(draft); setDraft(''); }}>
          <label htmlFor="theme-input">Propose un thème</label>
          <input
            id="theme-input"
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ex. La puissance d'un épéiste de One Piece"
          />
          <button type="submit" className="btn btnBlock">Envoyer</button>
        </form>
      ) : (
        <p className="muted">En attente du thème de {setter?.name}...</p>
      )}
    </div>
  );
}
