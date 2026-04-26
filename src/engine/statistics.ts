// Lifetime player statistics — counters that survive across runs and saves.
// Distinct from dungeon score (per-run) and player stats (per-character).
//
// Backed by a single localStorage key. Schema-versioned so adding fields later
// is non-breaking (new fields default to 0; older clients ignore unknown
// keys when they round-trip the data).

const STORAGE_KEY = 'mysticquest_statistics';

export interface LifetimeStats {
  version: 1;
  deaths: number;
  endingsReached: number;
  bossesDefeated: number;
}

const DEFAULTS: LifetimeStats = {
  version: 1,
  deaths: 0,
  endingsReached: 0,
  bossesDefeated: 0,
};

function clone(): LifetimeStats {
  return { ...DEFAULTS };
}

export function loadStats(): LifetimeStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone();
    const parsed = JSON.parse(raw) as Partial<LifetimeStats> | null;
    if (!parsed || typeof parsed !== 'object') return clone();
    return {
      version: 1,
      deaths: typeof parsed.deaths === 'number' ? parsed.deaths : 0,
      endingsReached: typeof parsed.endingsReached === 'number' ? parsed.endingsReached : 0,
      bossesDefeated: typeof parsed.bossesDefeated === 'number' ? parsed.bossesDefeated : 0,
    };
  } catch {
    return clone();
  }
}

function saveStats(stats: LifetimeStats): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Storage full or unavailable — counter just doesn't persist this run.
  }
}

export function bumpDeath(): void {
  const stats = loadStats();
  stats.deaths++;
  saveStats(stats);
}

export function bumpEndingReached(): void {
  const stats = loadStats();
  stats.endingsReached++;
  saveStats(stats);
}

export function bumpBossDefeated(): void {
  const stats = loadStats();
  stats.bossesDefeated++;
  saveStats(stats);
}
