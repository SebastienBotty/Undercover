'use client';
import { useState } from 'react';
import styles from './EliminationScreen.module.css';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface Player {
  id: string;
  name: string;
  alive: boolean;
  role: Role | null;
  character: string | null;
  note?: number | null;
}

type NoEliminationReason = 'no_votes';

interface EliminationScreenProps {
  players: Player[];
  lastEliminatedId: string | null;
  /** Why the vote didn't eliminate anyone, when it didn't -- shown instead of the generic message. */
  noEliminationReason?: NoEliminationReason | null;
  selfId: string;
  mode?: 'classic' | 'note';
  onMrWhiteGuess: (guess: string) => void;
}

const NO_ELIMINATION_LABEL: Record<NoEliminationReason, string> = {
  no_votes: "Personne n'a voté",
};

const ROLE_LABEL: Record<Role, string> = {
  civil: 'un Civil',
  undercover: 'un Undercover',
  mrwhite: 'Mr. White',
};

const ROLE_CLASS: Record<Role, string> = {
  civil: styles.roleCivil,
  undercover: styles.roleUndercover,
  mrwhite: styles.roleMrwhite,
};

export function EliminationScreen({
  players,
  lastEliminatedId,
  noEliminationReason,
  selfId,
  mode = 'classic',
  onMrWhiteGuess,
}: EliminationScreenProps) {
  const [guess, setGuess] = useState('');
  const eliminated = players.find((p) => p.id === lastEliminatedId);

  if (!eliminated) {
    return (
      <div>
        <span className="eyebrow">Verdict</span>
        <h2>Personne n&apos;est éliminé</h2>
        <p className="muted">
          {noEliminationReason
            ? `${NO_ELIMINATION_LABEL[noEliminationReason]} : personne n'a été éliminé ce tour-ci.`
            : "Personne n'a été éliminé ce tour-ci."}
        </p>
      </div>
    );
  }

  const isSelf = eliminated.id === selfId;
  const isSelfMrWhiteAwaitingGuess = isSelf && eliminated.role === 'mrwhite';
  const revealedDetail = eliminated.character
    ? ` (${eliminated.character})`
    : eliminated.note != null
      ? ` (${eliminated.note}/20)`
      : '';

  return (
    <div>
      <span className="eyebrow">Verdict</span>
      <h2 className={isSelf ? styles.selfEliminated : undefined}>
        {isSelf ? (
          'Tu as été éliminé'
        ) : (
          <>
            {eliminated.name} <span className="stamp">Éliminé</span>
          </>
        )}
      </h2>
      {eliminated.role && (
        <p className="muted">
          C'était <span className={ROLE_CLASS[eliminated.role]}>{ROLE_LABEL[eliminated.role]}</span>
          {revealedDetail}
        </p>
      )}

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
