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

  if (!eliminated) return <p className="muted">Personne n'a été éliminé ce tour-ci.</p>;

  const isSelfMrWhiteAwaitingGuess = eliminated.id === selfId && eliminated.role === 'mrwhite';

  return (
    <div>
      <span className="eyebrow">Verdict</span>
      <h2>
        {eliminated.name} <span className="stamp">Éliminé</span>
      </h2>
      <p className="muted">
        C'était {eliminated.role ? ROLE_LABEL[eliminated.role] : ''}
        {eliminated.character ? ` (${eliminated.character})` : ''}
      </p>

      {isSelfMrWhiteAwaitingGuess && (
        <form
          className="field"
          onSubmit={(e) => {
            e.preventDefault();
            onMrWhiteGuess(guess);
          }}
        >
          <label htmlFor="guess-input">Devine le personnage des Civils</label>
          <input id="guess-input" className="input" value={guess} onChange={(e) => setGuess(e.target.value)} />
          <button type="submit" className="btn btnBlock">
            Deviner
          </button>
        </form>
      )}
    </div>
  );
}
