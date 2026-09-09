import { describe, it, expect, beforeEach } from 'vitest';
import { getStoredHostSettings, storeHostSettings } from '@/lib/hostSettings';

describe('host settings storage', () => {
  beforeEach(() => window.localStorage.clear());

  it('returns sensible defaults when nothing is stored', () => {
    const settings = getStoredHostSettings();
    expect(settings).toEqual({ themes: [], similarityLevel: 'close', mrWhiteEnabled: false });
  });

  it('stores and retrieves the last used settings', () => {
    storeHostSettings({ themes: ['anime', 'films'], similarityLevel: 'very_close', mrWhiteEnabled: true });
    expect(getStoredHostSettings()).toEqual({
      themes: ['anime', 'films'],
      similarityLevel: 'very_close',
      mrWhiteEnabled: true,
    });
  });
});
