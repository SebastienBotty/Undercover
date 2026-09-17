'use client';
import type { KeyboardEvent } from 'react';
import styles from './RoundRecapTable.module.css';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface Player {
  id: string;
  name: string;
  /** Absent/undefined treated as alive -- callers that don't track elimination just omit it. */
  alive?: boolean;
  /** Absent/undefined treated as connected -- callers that don't track it just omit it. */
  connected?: boolean;
  /** Only ever non-null for an eliminated player whose role the server chose to reveal. */
  role?: Role | null;
}

const ROLE_LABEL: Record<Role, string> = {
  civil: 'Civil',
  undercover: 'Undercover',
  mrwhite: 'Mr. White',
};

const ROLE_CLASS: Record<Role, string> = {
  civil: styles.roleCivil,
  undercover: styles.roleUndercover,
  mrwhite: styles.roleMrwhite,
};

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
  /** Phantom votes accumulated by missing a clue timer, keyed by player id. */
  accusationVotes?: Record<string, number>;
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
  accusationVotes,
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
            const isAlive = player.alive ?? true;
            const isDisconnected = player.connected === false;
            const revealedRole = !isAlive ? player.role : null;
            const accusationCount = accusationVotes?.[playerId] ?? 0;

            const rowClass = [
              isTurn && styles.rowActive,
              !isAlive && styles.rowEliminated,
              isVotable && styles.votableRow,
              isVotable && isSelected && styles.votableRowSelected,
            ]
              .filter(Boolean)
              .join(' ') || undefined;

            function handleRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>) {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              onVote?.(playerId);
            }

            return (
              <tr
                key={playerId}
                className={rowClass}
                {...(isVotable
                  ? {
                      role: 'button' as const,
                      tabIndex: 0,
                      'aria-pressed': isSelected,
                      onClick: () => onVote?.(playerId),
                      onKeyDown: handleRowKeyDown,
                    }
                  : {})}
              >
                <td className={styles.flagCell}>{isTurn && <span aria-label="C'est son tour">🚩</span>}</td>
                <td className={styles.nameCell}>
                  {player.name}
                  {isVotable && (
                    // Always rendered (space reserved via visibility, not display) so selecting
                    // a player doesn't widen its cell and shift the whole column's width.
                    <span className={`${styles.check}${isSelected ? ` ${styles.checkVisible}` : ''}`} aria-hidden="true">
                      {' '}✓
                    </span>
                  )}
                  {!isAlive && <span className={`stamp ${styles.inlineStamp}`}>Éliminé</span>}
                  {isDisconnected && <span className={`stamp ${styles.inlineStamp}`}>Déconnecté</span>}
                  {accusationCount > 0 && (
                    <span
                      className={`stamp ${styles.inlineStamp} ${styles.accusationStamp}`}
                      title="Vote(s) d'accusation accumulé(s) pour indice(s) manqué(s)"
                    >
                      +{accusationCount} vote{accusationCount > 1 ? 's' : ''}
                    </span>
                  )}
                  {revealedRole && (
                    <span className={`${styles.roleTag} ${ROLE_CLASS[revealedRole]}`}>{ROLE_LABEL[revealedRole]}</span>
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
