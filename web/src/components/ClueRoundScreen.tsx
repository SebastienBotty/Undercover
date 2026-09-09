'use client';
import { useState } from 'react';
import styles from './ClueRoundScreen.module.css';

interface Player {
  id: string;
  name: string;
}

interface Clue {
  playerId: string;
  round: number;
  text: string;
}

interface ClueRoundScreenProps {
  players: Player[];
  turnOrder: string[];
  currentTurnIndex: number;
  clues: Clue[];
  round: number;
  selfId: string;
  onSubmitClue: (text: string) => void;
}

export function ClueRoundScreen({ players, turnOrder, currentTurnIndex, clues, round, selfId, onSubmitClue }: ClueRoundScreenProps) {
  const [draft, setDraft] = useState('');
  const currentPlayerId = turnOrder[currentTurnIndex];
  const currentPlayer = players.find((p) => p.id === currentPlayerId);
  const isMyTurn = currentPlayerId === selfId;
  const roundClues = clues.filter((c) => c.round === round);

  return (
    <div>
      <span className="eyebrow">Manche {round}</span>
      <h2>Indices</h2>
      <table className={styles.table}>
        <tbody>
          {turnOrder.map((playerId) => {
            const player = players.find((p) => p.id === playerId);
            if (!player) return null;
            const clue = roundClues.find((c) => c.playerId === playerId);
            const isTurn = playerId === currentPlayerId;
            return (
              <tr key={playerId} className={isTurn ? styles.rowActive : undefined}>
                <td className={styles.flagCell}>{isTurn && <span aria-label="C'est son tour">🚩</span>}</td>
                <td className={styles.nameCell}>{player.name}</td>
                <td className={styles.clueCell}>{clue ? clue.text || '(pas de réponse)' : '…'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {isMyTurn ? (
        <form
          className="field"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitClue(draft);
            setDraft('');
          }}
        >
          <input
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ton indice"
          />
          <button type="submit" className="btn btnBlock">
            Envoyer
          </button>
        </form>
      ) : (
        <p className="muted">Au tour de {currentPlayer?.name}...</p>
      )}
    </div>
  );
}
