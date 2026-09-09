'use client';

interface Player {
  id: string;
  name: string;
  alive: boolean;
}

interface VoteScreenProps {
  players: Player[];
  selfId: string;
  onVote: (targetId: string) => void;
}

export function VoteScreen({ players, selfId, onVote }: VoteScreenProps) {
  const targets = players.filter((p) => p.alive && p.id !== selfId);
  return (
    <div>
      <span className="eyebrow">Vote</span>
      <h2>Qui soupçonnes-tu ?</h2>
      <ul className="roster">
        {targets.map((p) => (
          <li key={p.id}>
            <button onClick={() => onVote(p.id)} className="btn btnGhost btnBlock">
              {p.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
