'use client';
import { useState } from 'react';

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
      <h2>Manche {round}</h2>
      <ul>
        {roundClues.map((c) => {
          const player = players.find((p) => p.id === c.playerId);
          return (
            <li key={c.playerId}>
              {player?.name}: {c.text || '(pas de réponse)'}
            </li>
          );
        })}
      </ul>

      {isMyTurn ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitClue(draft);
            setDraft('');
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ton indice" />
          <button type="submit">Envoyer</button>
        </form>
      ) : (
        <p>Au tour de {currentPlayer?.name}...</p>
      )}
    </div>
  );
}
