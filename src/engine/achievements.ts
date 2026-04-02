const STORAGE_KEY = 'mysticquest_achievements';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_blood', name: 'First Blood', description: 'Defeat your first enemy' },
  { id: 'exterminator', name: 'Exterminator', description: 'Defeat 50 enemies total' },
  { id: 'boss_slayer', name: 'Boss Slayer', description: 'Defeat any boss' },
  { id: 'king_slayer', name: 'King Slayer', description: 'Defeat the Evil King' },
  { id: 'collector', name: 'The Collector', description: 'Find all 4 mushrooms' },
  { id: 'fully_loaded', name: 'Fully Loaded', description: 'Carry 10+ items at once' },
  { id: 'dungeon_crawler', name: 'Dungeon Crawler', description: 'Reach dungeon floor 5' },
  { id: 'dungeon_master', name: 'Dungeon Master', description: 'Reach dungeon floor 20' },
  { id: 'explorer', name: 'Explorer', description: 'Visit 80% of story rooms' },
  { id: 'scholar', name: 'Scholar', description: 'Learn 5 skills' },
  { id: 'master', name: 'Master', description: 'Reach level 15' },
  { id: 'all_endings', name: 'All Endings', description: 'Trigger all 4 endings' },
  { id: 'chatterbox', name: 'Chatterbox', description: 'Talk to all 4 NPCs' },
];

interface AchievementStore {
  [id: string]: { unlocked: boolean; timestamp: number };
}

let cache: AchievementStore | null = null;

function loadStore(): AchievementStore {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? JSON.parse(raw) : {};
  } catch {
    cache = {};
  }
  return cache!;
}

function saveStore(store: AchievementStore): void {
  cache = store;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function isUnlocked(id: string): boolean {
  return loadStore()[id]?.unlocked === true;
}

// Returns the achievement name if newly unlocked, null if already had it or doesn't exist
export function tryUnlock(id: string): string | null {
  const store = loadStore();
  if (store[id]?.unlocked) return null;
  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (!def) return null;
  store[id] = { unlocked: true, timestamp: Date.now() };
  saveStore(store);
  return def.name;
}

export function getAll(): Array<AchievementDef & { unlocked: boolean }> {
  const store = loadStore();
  return ACHIEVEMENTS.map(a => ({ ...a, unlocked: !!store[a.id]?.unlocked }));
}

// Count total unlocked
export function unlockedCount(): number {
  const store = loadStore();
  return Object.values(store).filter(v => v.unlocked).length;
}
