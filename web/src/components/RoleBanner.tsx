'use client';
import styles from './RoleBanner.module.css';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface RoleBannerProps {
  role: Role | null;
  character: string | null;
}

const ROLE_LABEL: Record<Role, string> = {
  civil: 'Civil',
  undercover: 'Undercover',
  mrwhite: 'Mr. White',
};

export function RoleBanner({ role, character }: RoleBannerProps) {
  if (!role) return null;

  return (
    <div className={styles.banner}>
      <span className="muted">Ton rôle : </span>
      <span className={role === 'undercover' ? styles.undercover : styles.role}>{ROLE_LABEL[role]}</span>
      {character && <span className={styles.word}> — {character}</span>}
    </div>
  );
}
