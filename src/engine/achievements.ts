import * as C from './constants';
import { addLine, emitSound } from './output';
import { hasItem, hasKeyItem } from './player';
import type { GameStore } from './types';

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

// Store-aware wrapper: unlock an achievement and announce it in the terminal.
export function checkAchievement(store: GameStore, id: string): void {
  const name = tryUnlock(id);
  if (name) {
    addLine(store, '');
    addLine(store, `[Achievement Unlocked: ${name}]`, C.CHOICE_COLOR);
    emitSound(store, 'achievement');
  }
}

const COLLECTOR_MUSHROOMS = ['red_mushroom', 'blue_mushroom', 'green_mushroom', 'gold_mushroom'];

// Re-check item-count-driven achievements (fully_loaded, collector).
export function checkItemAchievements(store: GameStore): void {
  if (!store.player) return;
  const invCount = Object.values(store.player.inventory).reduce((a, b) => a + b, 0);
  const keyCount = Object.keys(store.player.keyItems).length;
  const weaponCount = store.player.weapons.length;
  if (invCount + keyCount + weaponCount >= 10) {
    checkAchievement(store, 'fully_loaded');
  }
  if (COLLECTOR_MUSHROOMS.every(m => hasItem(store.player!, m) || hasKeyItem(store.player!, m))) {
    checkAchievement(store, 'collector');
  }
}
