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
      <h2>{winner ? WINNER_LABEL[winner] : 'Partie terminée'}</h2>
      <ul>
        {players.map((p) => (
          <li key={p.id}>
            {p.name} — {p.role} {p.character ? `(${p.character})` : ''}
          </li>
        ))}
      </ul>
      <button onClick={onReplay}>Quitter</button>
    </div>
  );
}
