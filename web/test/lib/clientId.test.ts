import { describe, it, expect, beforeEach } from 'vitest';
import { getOrCreateClientId } from '@/lib/clientId';

describe('getOrCreateClientId', () => {
  beforeEach(() => window.localStorage.clear());

  it('returns the same id on every call', () => {
    const first = getOrCreateClientId();
    const second = getOrCreateClientId();
    expect(second).toBe(first);
  });

  it('persists the id across a simulated reload (new call after clearing local state but not storage)', () => {
    const id = getOrCreateClientId();
    expect(window.localStorage.getItem('undercover:clientId')).toBe(id);
  });
});
