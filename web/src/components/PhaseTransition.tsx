'use client';
import styles from './PhaseTransition.module.css';

interface PhaseTransitionProps {
  /** Remount key -- the curtain animation only replays when this value changes (e.g. game phase).
   * Null renders no curtain at all -- used before the first real trigger has happened, so the
   * curtain's own first-ever mount doesn't play a spurious animation on top of that first trigger. */
  phaseKey: string | null;
  children: React.ReactNode;
}

export function PhaseTransition({ phaseKey, children }: PhaseTransitionProps) {
  return (
    <>
      {/* Keyed so React remounts a fresh node (and replays the CSS animation) on every phase
          change -- fixed to the viewport, not the card, so it covers the whole window. */}
      {phaseKey !== null && <div className={styles.curtain} aria-hidden="true" key={phaseKey} />}
      {children}
    </>
  );
}
