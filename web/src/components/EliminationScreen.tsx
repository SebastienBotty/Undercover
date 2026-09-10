'use client';
import { useState } from 'react';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface Player {
  id: string;
  name: string;
  alive: boolean;
  role: Role | null;
  character: string | null;
  note?: number | null;
}

interface EliminationScreenProps {
  players: Player[];
  lastEliminatedId: string | null;
  selfId: string;
  mode?: 'classic' | 'note';
  onMrWhiteGuess: (guess: string) => void;
}

const ROLE_LABEL: Record<Role, string> = {
  civil: 'un Civil',
  undercover: 'un Undercover',
  mrwhite: 'Mr. White',
};

export function EliminationScreen({ players, lastEliminatedId, selfId, mode = 'classic', onMrWhiteGuess }: EliminationScreenProps) {
  const [guess, setGuess] = useState('');
  const eliminated = players.find((p) => p.id === lastEliminatedId);

  if (!eliminated) return <p className="muted">Personne n'a été éliminé ce tour-ci.</p>;

  const isSelfMrWhiteAwaitingGuess = eliminated.id === selfId && eliminated.role === 'mrwhite';
  const revealedDetail = eliminated.character
    ? ` (${eliminated.character})`
    : eliminated.note != null
      ? ` (${eliminated.note}/20)`
      : '';

  return (
    <div>
      <span className="eyebrow">Verdict</span>
      <h2>
        {eliminated.name} <span className="stamp">Éliminé</span>
      </h2>
      <p className="muted">
        C'était {eliminated.role ? ROLE_LABEL[eliminated.role] : ''}
        {revealedDetail}
      </p>

      {isSelfMrWhiteAwaitingGuess && (
        <form
          className="field"
          onSubmit={(e) => {
            e.preventDefault();
            onMrWhiteGuess(guess);
          }}
        >
          {mode === 'note' ? (
            <>
              <label htmlFor="guess-input">Devine la note des Civils (0-20)</label>
              <input
                id="guess-input"
                type="number"
                min={0}
                max={20}
                className="input"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
              />
            </>
          ) : (
            <>
              <label htmlFor="guess-input">Devine le personnage des Civils</label>
              <input id="guess-input" className="input" value={guess} onChange={(e) => setGuess(e.target.value)} />
            </>
          )}
          <button type="submit" className="btn btnBlock">
            Deviner
          </button>
        </form>
      )}
    </div>
  );
}
