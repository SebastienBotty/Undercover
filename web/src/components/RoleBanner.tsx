'use client';
import styles from './RoleBanner.module.css';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface RoleBannerProps {
  role: Role | null;
  character: string | null;
  characterImage?: string | null;
  characterSeries?: string | null;
  note?: number | null;
}

export function RoleBanner({ role, character, characterImage, characterSeries, note }: RoleBannerProps) {
  if (!role) return null;

  // Deliberately never shows "Civil"/"Undercover" (or any styling that would give it away) --
  // only Mr. White is told their role outright, since they have no character to bluff with
  // instead. Seeing only your own character/note, with no hint of which side it puts you on, is
  // the whole point of the game.
  if (role === 'mrwhite') {
    return (
      <div className={styles.banner}>
        <span className={styles.word}>Tu es Mr. White</span>
      </div>
    );
  }

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
      {character && (
        <span className={styles.word}>
          {character}
          {characterSeries && <span className={styles.series}> ({characterSeries})</span>}
        </span>
      )}
      {note != null && <span className={styles.word}>{note}/20</span>}
    </div>
  );
}
