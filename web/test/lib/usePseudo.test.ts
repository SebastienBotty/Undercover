import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePseudo } from '@/lib/usePseudo';
import { getStoredPseudo } from '@/lib/pseudo';

describe('usePseudo', () => {
  beforeEach(() => window.localStorage.clear());

  it('reads the initially stored pseudo', () => {
    window.localStorage.setItem('undercover:pseudo', 'Seb');
    const { result } = renderHook(() => usePseudo());
    expect(result.current.pseudo).toBe('Seb');
  });

  it('updates state and persists on setPseudo', () => {
    const { result } = renderHook(() => usePseudo());
    act(() => result.current.setPseudo('Nouveau'));
    expect(result.current.pseudo).toBe('Nouveau');
    expect(getStoredPseudo()).toBe('Nouveau');
  });
});
