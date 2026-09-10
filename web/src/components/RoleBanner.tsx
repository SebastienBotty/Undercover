'use client';
import styles from './RoleBanner.module.css';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface RoleBannerProps {
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

export function RoleBanner({ role, character, characterImage, note }: RoleBannerProps) {
  if (!role) return null;

  return (
    <div className={styles.banner}>
      {characterImage && note == null && (
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
      <span className="muted">Ton rôle : </span>
      <span className={role === 'undercover' ? styles.undercover : styles.role}>{ROLE_LABEL[role]}</span>
      {character && <span className={styles.word}> — {character}</span>}
      {note != null && <span className={styles.word}> — {note}/20</span>}
    </div>
  );
}
