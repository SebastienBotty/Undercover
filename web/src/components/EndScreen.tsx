'use client';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface Player {
  id: string;
  name: string;
  role: Role | null;
  character: string | null;
}

interface EndScreenProps {
  winner: Role | null;
  players: Player[];
  onReplay: () => void;
}

const WINNER_LABEL: Record<Role, string> = {
  civil: 'Les Civils gagnent !',
  undercover: 'Les Undercover gagnent !',
  mrwhite: 'Mr. White gagne !',
};

export function EndScreen({ winner, players, onReplay }: EndScreenProps) {
  return (
    <div>
      <span className="eyebrow">Affaire classée</span>
      <h2>{winner ? WINNER_LABEL[winner] : 'Partie terminée'}</h2>
      <ul className="roster">
        {players.map((p) => (
          <li key={p.id} className="rosterItem">
            <span>{p.name}</span>
            <span className="muted">
              {p.role} {p.character ? `(${p.character})` : ''}
            </span>
          </li>
        ))}
      </ul>
      <button onClick={onReplay} className="btn btnGhost btnBlock">
        Quitter
      </button>
    </div>
  );
}
