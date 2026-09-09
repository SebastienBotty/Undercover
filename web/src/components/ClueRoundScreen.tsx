'use client';
import { useState } from 'react';
import { RoundRecapTable } from './RoundRecapTable';

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

  return (
    <div>
      <span className="eyebrow">Manche {round}</span>
      <h2>Indices</h2>
      <RoundRecapTable
        players={players}
        turnOrder={turnOrder}
        clues={clues}
        totalRounds={round}
        currentTurnPlayerId={currentPlayerId}
      />

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
