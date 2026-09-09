import { describe, it, expect, beforeEach } from 'vitest';
import { getStoredHostSettings, storeHostSettings } from '@/lib/hostSettings';

describe('host settings storage', () => {
  beforeEach(() => window.localStorage.clear());

  it('returns sensible defaults when nothing is stored', () => {
    const settings = getStoredHostSettings();
    expect(settings).toEqual({ themes: [], similarityLevel: 'close', mrWhiteEnabled: false, animeSeries: [] });
  });

  it('stores and retrieves the last used settings', () => {
    storeHostSettings({
      themes: ['anime', 'films'],
      similarityLevel: 'very_close',
      mrWhiteEnabled: true,
      animeSeries: ['one-piece', 'naruto'],
    });
    expect(getStoredHostSettings()).toEqual({
      themes: ['anime', 'films'],
      similarityLevel: 'very_close',
      mrWhiteEnabled: true,
      animeSeries: ['one-piece', 'naruto'],
    });
  });

  it('defaults animeSeries to an empty array for settings stored before this field existed', () => {
    window.localStorage.setItem(
      'undercover:hostSettings',
      JSON.stringify({ themes: ['anime'], similarityLevel: 'close', mrWhiteEnabled: false })
    );
    expect(getStoredHostSettings().animeSeries).toEqual([]);
  });
});
