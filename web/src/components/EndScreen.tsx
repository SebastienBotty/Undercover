'use client';
import styles from './EndScreen.module.css';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface Player {
  id: string;
  name: string;
  role: Role | null;
  character: string | null;
  note?: number | null;
}

interface EndScreenProps {
  winner: Role | null;
  players: Player[];
  isHost: boolean;
  onRestart: () => void;
  onLeave: () => void;
}

const WINNER_LABEL: Record<Role, string> = {
  civil: 'Les Civils gagnent !',
  undercover: 'Les Undercover gagnent !',
  mrwhite: 'Mr. White gagne !',
};

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

export function EndScreen({ winner, players, isHost, onRestart, onLeave }: EndScreenProps) {
  return (
    <div>
      <span className="eyebrow">Affaire classée</span>
      <h2>{winner ? WINNER_LABEL[winner] : 'Partie terminée'}</h2>
      <ul className="roster">
        {players.map((p) => (
          <li key={p.id} className="rosterItem">
            <span>{p.name}</span>
            <span className="muted">
              {p.role && <span className={ROLE_CLASS[p.role]}>{ROLE_LABEL[p.role]}</span>}{' '}
              {p.character ? `(${p.character})` : p.note != null ? `(${p.note}/20)` : ''}
            </span>
          </li>
        ))}
      </ul>

      <div className={styles.actions}>
        {isHost ? (
          <button onClick={onRestart} className="btn btnBlock">
            Rejouer
          </button>
        ) : (
          <p className="muted">En attente que l'hôte relance une partie...</p>
        )}
        <button onClick={onLeave} className="btn btnGhost btnBlock">
          Quitter
        </button>
      </div>
    </div>
  );
}
