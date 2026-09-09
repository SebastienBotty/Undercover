const STORAGE_KEY = 'undercover:pseudo';

export function getStoredPseudo(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(STORAGE_KEY) ?? '';
}

export function storePseudo(pseudo: string): void {
  window.localStorage.setItem(STORAGE_KEY, pseudo.trim());
}
