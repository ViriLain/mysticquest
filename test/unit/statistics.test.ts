import { describe, expect, it } from 'vitest';
import { bumpBossDefeated, bumpDeath, bumpEndingReached, loadStats } from '../../src/engine/statistics';

describe('lifetime statistics', () => {
  it('returns zeroed defaults when nothing is stored', () => {
    expect(loadStats()).toEqual({
      version: 1,
      deaths: 0,
      endingsReached: 0,
      bossesDefeated: 0,
    });
  });

  it('persists each counter independently across calls', () => {
    bumpDeath();
    bumpDeath();
    bumpEndingReached();
    bumpBossDefeated();
    bumpBossDefeated();
    bumpBossDefeated();

    expect(loadStats()).toEqual({
      version: 1,
      deaths: 2,
      endingsReached: 1,
      bossesDefeated: 3,
    });
  });

  it('treats corrupted JSON as zeros without throwing', () => {
    localStorage.setItem('mysticquest_statistics', '{not json');
    expect(loadStats().deaths).toBe(0);
    expect(loadStats().endingsReached).toBe(0);
    expect(loadStats().bossesDefeated).toBe(0);
  });

  it('treats missing fields as zeros and fills the rest', () => {
    localStorage.setItem('mysticquest_statistics', JSON.stringify({ deaths: 5 }));
    const stats = loadStats();
    expect(stats.deaths).toBe(5);
    expect(stats.endingsReached).toBe(0);
    expect(stats.bossesDefeated).toBe(0);
  });

  it('treats non-number fields as zeros so a corrupt write cannot leak NaN', () => {
    localStorage.setItem('mysticquest_statistics', JSON.stringify({ deaths: 'oops' }));
    expect(loadStats().deaths).toBe(0);
  });
});
