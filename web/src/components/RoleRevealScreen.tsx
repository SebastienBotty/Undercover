'use client';
import styles from './RoleRevealScreen.module.css';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface RoleRevealScreenProps {
  role: Role | null;
  character: string | null;
}

const ROLE_LABEL: Record<Role, string> = {
  civil: 'Civil',
  undercover: 'Undercover',
  mrwhite: 'Mr. White',
};

export function RoleRevealScreen({ role, character }: RoleRevealScreenProps) {
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
      <div className={styles.dossier}>
        <div className={styles.censorBar} />
        <p className={styles.identity}>{character}</p>
      </div>
    </div>
  );
}
