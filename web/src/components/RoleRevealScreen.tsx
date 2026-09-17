'use client';
import styles from './RoleRevealScreen.module.css';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface RoleRevealScreenProps {
  role: Role | null;
  character: string | null;
  characterImage?: string | null;
  characterSeries?: string | null;
  note?: number | null;
}

export function RoleRevealScreen({ role, character, characterImage, characterSeries, note }: RoleRevealScreenProps) {
  if (!role) return <p className="muted">Chargement de ton rôle...</p>;

  // Deliberately never says "Civil"/"Undercover" here (or anywhere in this component) -- only
  // Mr. White is told their role outright, above, since they have no character to bluff with
  // instead. Everyone else just sees their own character/note, with no hint of which side it
  // puts them on; that's the whole point of the game.
  const content =
    role === 'mrwhite' ? (
      <>
        <span className="eyebrow">Dossier confidentiel</span>
        <h2>Tu es Mr. White</h2>
        <div className={styles.dossier}>
          <div className={styles.censorBar} />
          <div className={`${styles.censorBar} ${styles.censorBarShort}`} />
          <p className={styles.blank}>Identité classifiée</p>
        </div>
        <p className={styles.helper}>Tu n'as aucun personnage. Bluffe pour ne pas te faire repérer !</p>
      </>
    ) : (
      <>
        <span className="eyebrow">Dossier confidentiel</span>
        <h2>{note != null ? 'Ta note' : 'Ton personnage'}</h2>
        {note != null ? (
          <div className={styles.dossier}>
            <p className={styles.identity}>{note}/20</p>
          </div>
        ) : (
          <div className={`${styles.dossier} ${styles.dossierRow}`}>
            {characterImage && (
              // eslint-disable-next-line @next/next/no-img-element -- hotlinked from arbitrary external sources
              <img
                src={characterImage}
                alt={character ?? 'Personnage'}
                className={styles.photo}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            <div className={styles.dossierText}>
              <div className={styles.censorBar} />
              <p className={styles.identity}>
                {character}
                {characterSeries && <span className={styles.series}> ({characterSeries})</span>}
              </p>
            </div>
          </div>
        )}
      </>
    );

  return (
    <div className={styles.revealWrap}>
      <div className={styles.curtain} aria-hidden="true" />
      <div className={styles.content}>{content}</div>
    </div>
  );
}
