import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialStore } from '../../src/engine/gameReducer';
import { tryUnlock } from '../../src/engine/achievements';
import { showAchievements, showInventory, showJournal, showScore, showSkills, showStats } from '../../src/engine/handlers/info';
import { createPlayer } from '../../src/engine/player';

describe('info handlers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders inventory and stats from player state', () => {
    const store = createInitialStore();
    const player = createPlayer();
    player.weapons = ['rusty_dagger'];
    player.equippedWeapon = 'rusty_dagger';
    player.inventory = { potion: 2 };
    player.keyItems = { rusty_key: true };
    player.equippedShield = 'iron_shield';
    player.level = 2;
    player.xp = 7;
    player.skillPoints = 1;
    player.skills.iron_will = true;
    player.visitedRooms = { manor_entry: true, manor_main_hall: true };
    store.player = player;

    showInventory(store);
    showStats(store);

    const lines = store.typewriterQueue.map(line => line.text);
    expect(lines).toContain('=== Inventory ===');
    expect(lines).toContain('[+] Weapon: Rusty Dagger (+2 ATK)');
    expect(lines).toContain('[=] Shield: Iron Shield (+3 DEF)');
    expect(lines).toContain('[*] Potion x2');
    expect(lines).toContain('[#] Rusty Key [key]');
    expect(lines).toContain('=== Stats ===');
    expect(lines).toContain('Level: 2');
    expect(lines).toContain('Gold: 0');
    expect(lines).toContain('XP: 7/50');
    expect(lines).toContain('Rooms visited: 2');
    expect(lines).toContain('Skill Points: 1');
    expect(lines).toContain('Skills: Iron Will');
  });

  it('renders journal entries and dungeon score', () => {
    const store = createInitialStore();
    const player = createPlayer();
    player.journalEntries = [{ type: 'item', text: 'Found Potion', timestamp: 123 }];
    store.player = player;
    store.gameMode = 'dungeon';
    store.dungeon = {
      seed: 42,
      floor: 3,
      score: { floorsCleared: 2, enemiesKilled: 5, itemsFound: 4, totalXp: 0 },
      floorEnemies: {},
      dungeonPerks: [],
    };

    showJournal(store);
    showScore(store);

    const lines = store.typewriterQueue.map(line => line.text);
    expect(lines).toContain('=== Journal ===');
    expect(lines.some(line => line.includes('Found Potion'))).toBe(true);
    expect(lines).toContain('=== Dungeon Score ===');
    expect(lines).toContain('Floor: 3');
    expect(lines).toContain('Seed: 42');
  });

  it('renders skills and achievements', () => {
    const store = createInitialStore();
    const player = createPlayer();
    player.skillPoints = 1;
    player.skills.iron_will = true;
    store.player = player;
    tryUnlock('first_blood');

    showSkills(store);
    showAchievements(store);

    const lines = store.typewriterQueue.map(line => line.text);
    expect(lines).toContain('=== Skill Tree ===');
    expect(lines.some(line => line.includes('Iron Will'))).toBe(true);
    expect(lines).toContain('=== Achievements ===');
    expect(lines.some(line => line.includes('First Blood'))).toBe(true);
  });
});
