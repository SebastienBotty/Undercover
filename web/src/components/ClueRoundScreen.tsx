'use client';
import { useEffect, useState } from 'react';
import { RoundRecapTable } from './RoundRecapTable';
import styles from './ClueRoundScreen.module.css';

type Role = 'civil' | 'undercover' | 'mrwhite';
interface Player { id: string; name: string; alive?: boolean; connected?: boolean; role?: Role | null; }
interface Clue { playerId: string; round: number; text: string; }
interface ThemeEntry { round: number; text: string; }

interface ClueRoundScreenProps {
  players: Player[];
  turnOrder: string[];
  currentTurnIndex: number;
  clues: Clue[];
  round: number;
  turnDeadline?: number | null;
  /** Non-null only while the current turn-holder is disconnected: their normal timer's frozen
   * remaining time, shown in the header instead of the ticking reconnect grace countdown
   * turnDeadline points at during that window. */
  pausedTurnRemainingMs?: number | null;
  themes?: ThemeEntry[];
  currentTheme?: string | null;
  /** Phantom votes accumulated by missing a clue timer, keyed by player id. */
  accusationVotes?: Record<string, number>;
  selfId: string;
  onSubmitClue: (text: string) => void;
}

const URGENT_THRESHOLD_SECONDS = 10;

export function ClueRoundScreen({ players, turnOrder, currentTurnIndex, clues, round, turnDeadline, pausedTurnRemainingMs, themes, currentTheme, accusationVotes, selfId, onSubmitClue }: ClueRoundScreenProps) {
  const [draft, setDraft] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const currentPlayerId = turnOrder[currentTurnIndex];
  const currentPlayer = players.find((p) => p.id === currentPlayerId);
  const isMyTurn = currentPlayerId === selfId;
  // While someone's disconnected, turnDeadline points at the ticking reconnect grace window, not
  // the normal timer (paused, frozen at pausedTurnRemainingMs) -- the header shows the paused
  // timer so it doesn't look like the clue window itself shrank to whatever the grace happens to
  // be; the reconnect badge next to their name (below) shows the actual ticking grace instead.
  const headerSecondsLeft = pausedTurnRemainingMs != null ? Math.ceil(pausedTurnRemainingMs / 1000) : secondsLeft;

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
        {headerSecondsLeft !== null && (
          <span className={`${styles.timer}${headerSecondsLeft <= URGENT_THRESHOLD_SECONDS ? ` ${styles.timerUrgent}` : ''}`}>
            ⏱ {headerSecondsLeft}s
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
        accusationVotes={accusationVotes}
      />
      {isMyTurn ? (
        <form className="field" onSubmit={(e) => { e.preventDefault(); onSubmitClue(draft); setDraft(''); }}>
          <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ton indice" />
          <button type="submit" className="btn btnBlock">Envoyer</button>
        </form>
      ) : (
        <p className="muted">
          Au tour de {currentPlayer?.name}...
          {currentPlayer?.connected === false && secondsLeft !== null && (
            <span
              className={`${styles.timer} ${styles.reconnectTimer}`}
              title="Déconnecté -- son tour sera passé si personne ne le voit revenir à temps"
            >
              ⏳ {secondsLeft}s
            </span>
          )}
        </p>
      )}
    </div>
  );
}
