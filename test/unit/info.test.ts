import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialStore } from '../../src/engine/gameReducer';
import { tryUnlock } from '../../src/engine/achievements';
import * as C from '../../src/engine/constants';
import { showAchievements, showInventory, showJournal, showSkills, showStats, showWeapons } from '../../src/engine/handlers/info';
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
    expect(lines).toContain('[+] Weapon: [Blade] Rusty Dagger (+2 ATK)');
    expect(lines).toContain('[=] Shield: Iron Shield (+3 DEF)');
    expect(lines).toContain('[*] Potion x2 (+25 HP)');
    expect(lines).toContain('[#] Rusty Key [key]');
    expect(lines).toContain('=== Stats ===');
    expect(lines).toContain('Level: 2');
    expect(lines).toContain('Gold: 0');
    expect(lines).toContain('XP: 7/50');
    expect(lines).toContain('Rooms visited: 2');
    expect(lines).toContain('Skill Points: 1');
    expect(lines).toContain('Skills: Iron Will');
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

  it('renders equipped weapon first, then other weapons by attack descending', () => {
    const store = createInitialStore();
    const player = createPlayer();
    player.weapons = ['rusty_dagger', 'hrunting', 'ragnarok', 'spear'];
    player.equippedWeapon = 'hrunting';
    store.player = player;

    showInventory(store);

    const lines = store.typewriterQueue.map(line => line.text);
    const equippedIdx = lines.findIndex(line => line.includes('Weapon: [Magic] Hrunting (+12 ATK)'));
    const ragnarokIdx = lines.findIndex(line => line.includes('[Magic] Ragnarok (+35 ATK)'));
    const spearIdx = lines.findIndex(line => line.includes('[Pierce] Spear (+10 ATK)'));
    const daggerIdx = lines.findIndex(line => line.includes('[Blade] Rusty Dagger (+2 ATK)'));
    expect(equippedIdx).toBeGreaterThan(-1);
    expect(ragnarokIdx).toBeGreaterThan(equippedIdx);
    expect(spearIdx).toBeGreaterThan(ragnarokIdx);
    expect(daggerIdx).toBeGreaterThan(spearIdx);
  });

  it('uses magic color for magic weapons in inventory and focused weapon list', () => {
    const store = createInitialStore();
    const player = createPlayer();
    player.weapons = ['hrunting', 'spear'];
    player.equippedWeapon = 'spear';
    store.player = player;

    showInventory(store);
    showWeapons(store);

    const magicLines = store.typewriterQueue.filter(line => line.text.includes('[Magic] Hrunting'));
    expect(magicLines.length).toBeGreaterThan(0);
    expect(magicLines.every(line => line.color === C.MAGIC_COLOR)).toBe(true);
    expect(store.typewriterQueue.map(line => line.text)).toContain('=== Weapons ===');
  });

  it('includes accessory modifiers in visible stats', () => {
    const store = createInitialStore();
    const player = createPlayer();
    player.equippedAccessory = 'berserker_tooth';
    store.player = player;

    showStats(store);

    const lines = store.typewriterQueue.map(line => line.text);
    expect(lines).toContain('Attack: 8');
    expect(lines).toContain('Defense: 1');
  });

  describe('showJournal', () => {
    it('renders empty state when no objectives are active', () => {
      const store = createInitialStore();
      store.player = createPlayer();
      showJournal(store);
      const text = store.typewriterQueue.map(l => l.text).join('\n');
      expect(text).toContain('=== Journal ===');
      expect(text).toContain('(no entries yet — explore the world)');
    });

    it('renders active objectives with [ ] prefix and hint line', () => {
      const store = createInitialStore();
      store.player = createPlayer();
      store.player.objectives = { the_diner_mystery: 'active' };
      showJournal(store);
      const text = store.typewriterQueue.map(l => l.text).join('\n');
      expect(text).toMatch(/\[ \] The Diner Mystery/);
      expect(text).toContain('Sir Whiskers mentioned something about the diner');
    });

    it('renders completed objectives with [X] prefix and completion_text', () => {
      const store = createInitialStore();
      store.player = createPlayer();
      store.player.objectives = { defeat_evil_king: 'complete' };
      showJournal(store);
      const text = store.typewriterQueue.map(l => l.text).join('\n');
      expect(text).toMatch(/\[X\] The Hero's Path/);
      expect(text).toContain('The Evil King has fallen.');
    });

    it('renders active objectives above completed ones', () => {
      const store = createInitialStore();
      store.player = createPlayer();
      store.player.objectives = {
        defeat_evil_king: 'complete',
        the_diner_mystery: 'active',
      };
      showJournal(store);
      const lines = store.typewriterQueue.map(l => l.text);
      const activeIdx = lines.findIndex(l => l.includes('[ ] The Diner Mystery'));
      const completeIdx = lines.findIndex(l => l.includes("[X] The Hero's Path"));
      expect(activeIdx).toBeGreaterThan(-1);
      expect(completeIdx).toBeGreaterThan(-1);
      expect(activeIdx).toBeLessThan(completeIdx);
    });

    it('renders objectives in player-discovery order, not OBJECTIVES list order', () => {
      const store = createInitialStore();
      store.player = createPlayer();
      // Assign in reverse relative to the JSON file order: the Diner Mystery
      // is index 1 in objectives.json, find_ancient_map is index 2. Assign
      // find_ancient_map first so it should render before the_diner_mystery.
      store.player.objectives = {};
      store.player.objectives.find_ancient_map = 'active';
      store.player.objectives.the_diner_mystery = 'active';
      showJournal(store);
      const lines = store.typewriterQueue.map(l => l.text);
      const mapIdx = lines.findIndex(l => l.includes('The Ancient Map'));
      const dinerIdx = lines.findIndex(l => l.includes('The Diner Mystery'));
      expect(mapIdx).toBeGreaterThan(-1);
      expect(dinerIdx).toBeGreaterThan(-1);
      expect(mapIdx).toBeLessThan(dinerIdx);
    });
  });
});
