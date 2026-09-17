'use client';
import { useEffect, useState } from 'react';
import { RoundRecapTable } from './RoundRecapTable';
import styles from './ThemeSelectScreen.module.css';

type Role = 'civil' | 'undercover' | 'mrwhite';
interface Player { id: string; name: string; alive?: boolean; connected?: boolean; role?: Role | null; }
interface Clue { playerId: string; round: number; text: string; }
interface ThemeEntry { round: number; playerId: string; text: string; }

interface ThemeSelectScreenProps {
  players: Player[];
  turnOrder: string[];
  clues: Clue[];
  themes?: ThemeEntry[];
  round: number;
  themeSetterId: string | null;
  turnDeadline?: number | null;
  /** Non-null only while the theme-setter is disconnected: their normal timer's frozen remaining
   * time, shown in the header instead of the ticking reconnect grace countdown turnDeadline
   * points at during that window. */
  pausedTurnRemainingMs?: number | null;
  /** Phantom votes accumulated by missing a clue timer, keyed by player id. */
  accusationVotes?: Record<string, number>;
  selfId: string;
  onSubmitTheme: (text: string) => void;
}

const URGENT_THRESHOLD_SECONDS = 10;

export function ThemeSelectScreen({ players, turnOrder, clues, themes, round, themeSetterId, turnDeadline, pausedTurnRemainingMs, accusationVotes, selfId, onSubmitTheme }: ThemeSelectScreenProps) {
  const [draft, setDraft] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const setter = players.find((p) => p.id === themeSetterId);
  const isMyTurn = themeSetterId === selfId;
  // While the setter's disconnected, turnDeadline points at the ticking reconnect grace window,
  // not the normal timer (paused, frozen at pausedTurnRemainingMs) -- the header shows the paused
  // timer so it doesn't look like the theme window itself shrank to whatever the grace happens to
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
      <h2>Thème</h2>
      {round > 1 && (
        <RoundRecapTable
          players={players}
          turnOrder={turnOrder}
          clues={clues}
          themes={themes}
          totalRounds={round - 1}
          accusationVotes={accusationVotes}
        />
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
          <button type="submit" className="btn btnBlock" disabled={!draft.trim()}>Envoyer</button>
        </form>
      ) : (
        <p className="muted">
          En attente du thème de {setter?.name}...
          {setter?.connected === false && secondsLeft !== null && (
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
