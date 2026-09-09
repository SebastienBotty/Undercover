'use client';
import { useState } from 'react';
import { getStoredPseudo, storePseudo } from './pseudo';

export function usePseudo() {
  const [pseudo, setPseudoState] = useState(() => getStoredPseudo());

  function setPseudo(value: string) {
    const trimmed = value.trim();
    storePseudo(trimmed);
    setPseudoState(trimmed);
  }

  return { pseudo, setPseudo };
}
