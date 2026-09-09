import { describe, it, expect } from 'vitest';
import { assignRoles, buildTurnOrder } from '../../src/game/roles';
import type { RoomSettings } from '../../src/types';

const settings: RoomSettings = { themes: ['anime'], similarityLevel: 'close', mrWhiteEnabled: false };

describe('assignRoles', () => {
  it('throws with fewer than 3 players', () => {
    expect(() => assignRoles(['a', 'b'], settings)).toThrow();
  });

  it('throws with more than 10 players', () => {
    const ids = Array.from({ length: 11 }, (_, i) => `p${i}`);
    expect(() => assignRoles(ids, settings)).toThrow();
  });

  it('assigns exactly 1 undercover for 3-6 players', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const roles = assignRoles(ids, settings, () => 0);
    const count = Object.values(roles).filter((r) => r === 'undercover').length;
    expect(count).toBe(1);
  });

  it('assigns exactly 2 undercover for 7-10 players', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `p${i}`);
    const roles = assignRoles(ids, settings, () => 0);
    const count = Object.values(roles).filter((r) => r === 'undercover').length;
    expect(count).toBe(2);
  });

  it('assigns exactly 1 Mr. White when enabled', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const roles = assignRoles(ids, { ...settings, mrWhiteEnabled: true }, () => 0);
    const count = Object.values(roles).filter((r) => r === 'mrwhite').length;
    expect(count).toBe(1);
  });

  it('assigns no Mr. White when disabled', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const roles = assignRoles(ids, settings, () => 0);
    expect(Object.values(roles)).not.toContain('mrwhite');
  });

  it('gives every remaining player the civil role', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const roles = assignRoles(ids, settings, () => 0);
    const civilCount = Object.values(roles).filter((r) => r === 'civil').length;
    expect(civilCount).toBe(4);
  });

  it('throws if there would not be a civilian majority', () => {
    // 3 players + Mr. White enabled -> 1 undercover + 1 mrwhite = 2 specials, only 1 civil left, which is fine (1 > 2 is false, so this should throw)
    expect(() => assignRoles(['a', 'b', 'c'], { ...settings, mrWhiteEnabled: true })).toThrow();
  });
});

describe('buildTurnOrder', () => {
  it('returns all player ids exactly once', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const order = buildTurnOrder(ids, () => 0.5);
    expect([...order].sort()).toEqual([...ids].sort());
  });
});
