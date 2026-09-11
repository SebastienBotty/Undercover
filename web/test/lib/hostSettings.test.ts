import { describe, it, expect, beforeEach } from 'vitest';
import { getStoredHostSettings, storeHostSettings } from '@/lib/hostSettings';

describe('host settings storage', () => {
  beforeEach(() => window.localStorage.clear());

  it('returns sensible defaults when nothing is stored', () => {
    const settings = getStoredHostSettings();
    expect(settings).toEqual({
      themes: [],
      similarityLevel: 'close',
      mrWhiteEnabled: false,
      seriesFilter: {},
      clueTimerEnabled: true,
      clueTimerSeconds: 30,
      voteTimerEnabled: true,
      voteTimerSeconds: 60,
      cluePassesPerVote: 2,
      mode: 'classic',
      noteGapMin: 2,
      noteGapMax: 6,
      revealRoleOnElimination: true,
    });
  });

  it('stores and retrieves the last used settings', () => {
    storeHostSettings({
      themes: ['anime', 'films'],
      similarityLevel: 'very_close',
      mrWhiteEnabled: true,
      seriesFilter: { anime: ['one-piece', 'naruto'] },
      clueTimerEnabled: false,
      clueTimerSeconds: 45,
      voteTimerEnabled: false,
      voteTimerSeconds: 90,
      cluePassesPerVote: 3,
      mode: 'note',
      noteGapMin: 3,
      noteGapMax: 8,
      revealRoleOnElimination: false,
    });
    expect(getStoredHostSettings()).toEqual({
      themes: ['anime', 'films'],
      similarityLevel: 'very_close',
      mrWhiteEnabled: true,
      seriesFilter: { anime: ['one-piece', 'naruto'] },
      clueTimerEnabled: false,
      clueTimerSeconds: 45,
      voteTimerEnabled: false,
      voteTimerSeconds: 90,
      cluePassesPerVote: 3,
      mode: 'note',
      noteGapMin: 3,
      noteGapMax: 8,
      revealRoleOnElimination: false,
    });
  });

  it('defaults mode and note fields for settings stored before those fields existed', () => {
    window.localStorage.setItem(
      'undercover:hostSettings',
      JSON.stringify({ themes: ['anime'], similarityLevel: 'close', mrWhiteEnabled: false })
    );
    const settings = getStoredHostSettings();
    expect(settings.seriesFilter).toEqual({});
    expect(settings.clueTimerEnabled).toBe(true);
    expect(settings.clueTimerSeconds).toBe(30);
    expect(settings.voteTimerEnabled).toBe(true);
    expect(settings.voteTimerSeconds).toBe(60);
    expect(settings.cluePassesPerVote).toBe(2);
    expect(settings.mode).toBe('classic');
    expect(settings.revealRoleOnElimination).toBe(true);
  });
});
