'use client';
import { useState } from 'react';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface Player {
  id: string;
  name: string;
  alive: boolean;
  role: Role | null;
  character: string | null;
}

interface EliminationScreenProps {
  players: Player[];
  lastEliminatedId: string | null;
  selfId: string;
  onMrWhiteGuess: (guess: string) => void;
}

const ROLE_LABEL: Record<Role, string> = {
  civil: 'un Civil',
  undercover: 'un Undercover',
  mrwhite: 'Mr. White',
};

export function EliminationScreen({ players, lastEliminatedId, selfId, onMrWhiteGuess }: EliminationScreenProps) {
  const [guess, setGuess] = useState('');
  const eliminated = players.find((p) => p.id === lastEliminatedId);

  if (!eliminated) return <p>Personne n'a été éliminé ce tour-ci.</p>;

  const isSelfMrWhiteAwaitingGuess = eliminated.id === selfId && eliminated.role === 'mrwhite';

  return (
    <div>
      <h2>{eliminated.name} a été éliminé(e)</h2>
      <p>
        C'était {eliminated.role ? ROLE_LABEL[eliminated.role] : ''}
        {eliminated.character ? ` (${eliminated.character})` : ''}
      </p>

      {isSelfMrWhiteAwaitingGuess && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onMrWhiteGuess(guess);
          }}
        >
          <label htmlFor="guess-input">Devine le personnage des Civils</label>
          <input id="guess-input" value={guess} onChange={(e) => setGuess(e.target.value)} />
          <button type="submit">Deviner</button>
        </form>
      )}
    </div>
  );
}
