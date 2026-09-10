'use client';
import { useState } from 'react';
import { copyToClipboard } from '@/lib/clipboard';
import styles from './RoomCodeBadge.module.css';

interface RoomCodeBadgeProps {
  code: string;
}

export function RoomCodeBadge({ code }: RoomCodeBadgeProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    const ok = await copyToClipboard(code);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" className={styles.badge} onClick={handleClick} aria-label="Copier le code de la salle">
      <span className={styles.label}>Salle</span>
      <span className={styles.code}>{copied ? 'Copié !' : code}</span>
    </button>
  );
}
