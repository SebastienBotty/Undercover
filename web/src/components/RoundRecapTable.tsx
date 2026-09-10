'use client';
import styles from './RoundRecapTable.module.css';

interface Player {
  id: string;
  name: string;
}

interface Clue {
  playerId: string;
  round: number;
  text: string;
}

interface ThemeEntry {
  round: number;
  text: string;
}

interface RoundRecapTableProps {
  players: Player[];
  turnOrder: string[];
  clues: Clue[];
  totalRounds: number;
  currentTurnPlayerId?: string | null;
  votableIds?: Set<string>;
  selectedId?: string | null;
  onVote?: (playerId: string) => void;
  themes?: ThemeEntry[];
}

export function RoundRecapTable({
  players,
  turnOrder,
  clues,
  totalRounds,
  currentTurnPlayerId = null,
  votableIds,
  selectedId = null,
  onVote,
  themes,
}: RoundRecapTableProps) {
  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1);

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.flagCell} />
            <th className={styles.nameCell}>Joueur</th>
            {rounds.map((r) => {
              const theme = themes?.find((t) => t.round === r);
              return (
                <th key={r} className={styles.clueCell}>
                  Manche {r}
                  {theme && <div className={styles.themeSubtitle}>{theme.text}</div>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {turnOrder.map((playerId) => {
            const player = players.find((p) => p.id === playerId);
            if (!player) return null;
            const isTurn = playerId === currentTurnPlayerId;
            const isVotable = votableIds?.has(playerId) ?? false;
            const isSelected = playerId === selectedId;

            return (
              <tr key={playerId} className={isTurn ? styles.rowActive : undefined}>
                <td className={styles.flagCell}>{isTurn && <span aria-label="C'est son tour">🚩</span>}</td>
                <td className={styles.nameCell}>
                  {isVotable ? (
                    <button
                      onClick={() => onVote?.(playerId)}
                      className={`btn btnBlock ${isSelected ? styles.selected : 'btnGhost'}`}
                    >
                      {player.name}
                      {isSelected && <span className={styles.check}> ✓</span>}
                    </button>
                  ) : (
                    player.name
                  )}
                </td>
                {rounds.map((r) => {
                  const clue = clues.find((c) => c.playerId === playerId && c.round === r);
                  return (
                    <td key={r} className={styles.clueCell}>
                      {clue ? clue.text || '(pas de réponse)' : '…'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
