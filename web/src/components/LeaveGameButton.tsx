'use client';
import styles from './LeaveGameButton.module.css';

interface LeaveGameButtonProps {
  onLeave: () => void;
}

/** Always available, at any phase, for any player (host or not) -- lets them walk away from the
 * room outright instead of just closing the tab. */
export function LeaveGameButton({ onLeave }: LeaveGameButtonProps) {
  return (
    <button type="button" className={styles.button} onClick={onLeave}>
      Quitter la partie
    </button>
  );
}
