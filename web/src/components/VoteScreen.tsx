'use client';
import { useState } from 'react';
import { RoundRecapTable } from './RoundRecapTable';

interface Player {
  id: string;
  name: string;
  alive: boolean;
}

interface Clue {
  playerId: string;
  round: number;
  text: string;
}

interface ThemeEntry { round: number; text: string; }

interface VoteScreenProps {
  players: Player[];
  turnOrder: string[];
  clues: Clue[];
  round: number;
  themes?: ThemeEntry[];
  selfId: string;
  onVote: (targetId: string) => void;
}

export function VoteScreen({ players, turnOrder, clues, round, themes, selfId, onVote }: VoteScreenProps) {
  const [votedForId, setVotedForId] = useState<string | null>(null);
  const votableIds = new Set(players.filter((p) => p.alive && p.id !== selfId).map((p) => p.id));
  const votedFor = players.find((p) => p.id === votedForId);

  function handleVote(targetId: string) {
    setVotedForId(targetId);
    onVote(targetId);
  }

  return (
    <div>
      <span className="eyebrow">Vote</span>
      <h2>Qui soupçonnes-tu ?</h2>
      <RoundRecapTable
        players={players}
        turnOrder={turnOrder}
        clues={clues}
        totalRounds={round}
        votableIds={votableIds}
        selectedId={votedForId}
        onVote={handleVote}
        themes={themes}
      />
      {votedFor && (
        <p className="muted">
          Tu as voté pour <strong>{votedFor.name}</strong>. En attente des autres joueurs...
        </p>
      )}
    </div>
  );
}
