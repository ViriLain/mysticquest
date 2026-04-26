import { describe, expect, it } from 'vitest';
import { loadCommandHistory, saveCommandHistory } from '../../src/engine/command-history';
import { input, newGame } from '../fixtures/mock-input';
import { createInitialStore } from '../../src/engine/gameReducer';

describe('command history persistence', () => {
  it('returns an empty array when nothing is stored', () => {
    expect(loadCommandHistory()).toEqual([]);
  });

  it('round-trips a small history through save/load', () => {
    saveCommandHistory(['look', 'go north', 'take potion']);
    expect(loadCommandHistory()).toEqual(['look', 'go north', 'take potion']);
  });

  it('clamps stored history to the most recent 50 entries', () => {
    const big = Array.from({ length: 75 }, (_, i) => `cmd${i}`);
    saveCommandHistory(big);
    const loaded = loadCommandHistory();
    expect(loaded).toHaveLength(50);
    expect(loaded[0]).toBe('cmd25');
    expect(loaded[49]).toBe('cmd74');
  });

  it('returns [] on corrupted JSON', () => {
    localStorage.setItem('mysticquest_command_history', '{not json');
    expect(loadCommandHistory()).toEqual([]);
  });

  it('skips non-string entries in stored history', () => {
    localStorage.setItem('mysticquest_command_history', JSON.stringify(['look', 42, null, 'go north']));
    expect(loadCommandHistory()).toEqual(['look', 'go north']);
  });

  it('returns [] when the stored value is not an array', () => {
    localStorage.setItem('mysticquest_command_history', JSON.stringify({ not: 'an array' }));
    expect(loadCommandHistory()).toEqual([]);
  });

  it('persists exploring-state commands so a fresh store loads them', () => {
    let s = newGame();
    s = input(s, 'look');
    s = input(s, 'inventory');

    expect(s.commandHistory).toEqual(['look', 'inventory']);
    // localStorage was written, so a brand-new store sees the same history.
    const fresh = createInitialStore();
    expect(fresh.commandHistory).toEqual(['look', 'inventory']);
  });
});
