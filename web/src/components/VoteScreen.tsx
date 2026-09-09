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
      <h2>Qui soupçonnes-tu ?</h2>
      <ul>
        {targets.map((p) => (
          <li key={p.id}>
            <button onClick={() => onVote(p.id)}>{p.name}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
