import { describe, it, expect, beforeEach } from 'vitest';
import { getStoredPseudo, storePseudo } from '@/lib/pseudo';

describe('pseudo storage', () => {
  beforeEach(() => window.localStorage.clear());

  it('returns an empty string when nothing is stored', () => {
    expect(getStoredPseudo()).toBe('');
  });

  it('stores and retrieves a trimmed pseudo', () => {
    storePseudo('  Seb  ');
    expect(getStoredPseudo()).toBe('Seb');
  });
});
