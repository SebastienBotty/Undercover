'use client';
import styles from './RoleRevealScreen.module.css';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface RoleRevealScreenProps {
  role: Role | null;
  character: string | null;
  characterImage?: string | null;
  note?: number | null;
}

const ROLE_LABEL: Record<Role, string> = {
  civil: 'Civil',
  undercover: 'Undercover',
  mrwhite: 'Mr. White',
};

export function RoleRevealScreen({ role, character, characterImage, note }: RoleRevealScreenProps) {
  if (!role) return <p className="muted">Chargement de ton rôle...</p>;

  if (role === 'mrwhite') {
    return (
      <div>
        <span className="eyebrow">Dossier confidentiel</span>
        <h2>Tu es Mr. White</h2>
        <div className={styles.dossier}>
          <div className={styles.censorBar} />
          <div className={`${styles.censorBar} ${styles.censorBarShort}`} />
          <p className={styles.blank}>Identité classifiée</p>
        </div>
        <p className={styles.helper}>Tu n'as aucun personnage. Bluffe pour ne pas te faire repérer !</p>
      </div>
    );
  }

  return (
    <div>
      <span className="eyebrow">Dossier confidentiel</span>
      <h2>
        Tu es{' '}
        <span className={role === 'undercover' ? styles.roleUndercover : undefined}>
          {ROLE_LABEL[role]}
        </span>
      </h2>
      {note != null ? (
        <div className={styles.dossier}>
          <p className={styles.identity}>Ta note : {note}/20</p>
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
            <p className={styles.identity}>{character}</p>
          </div>
        </div>
      )}
    </div>
  );
}
