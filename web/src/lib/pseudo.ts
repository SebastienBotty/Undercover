const STORAGE_KEY = 'undercover:pseudo';

export function getStoredPseudo(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(STORAGE_KEY) ?? '';
}

export function storePseudo(pseudo: string): void {
  // Guard against SSR/build-time calls, where `window` doesn't exist yet.
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, pseudo.trim());
}
