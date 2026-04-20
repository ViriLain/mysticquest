import { describe, expect, it } from 'vitest';
import enemiesJson from '../../src/data/enemies.json';
import itemsJson from '../../src/data/items.json';
import manorJson from '../../src/data/regions/manor.json';
import npcsJson from '../../src/data/npcs.json';
import weaponsJson from '../../src/data/weapons.json';
import { createInitialStore } from '../../src/engine/gameReducer';
import { handleExploringCommand, getAutocompleteSuggestions, parseBatchCount } from '../../src/engine/state/exploring';
import { createPlayer } from '../../src/engine/player';
import type { EnemyDef, ItemDef, NpcDef, RegionData, WeaponDef } from '../../src/engine/types';
import { createWorld, loadRegion } from '../../src/engine/world';

const enemyData = enemiesJson as Record<string, EnemyDef>;
const itemData = itemsJson as Record<string, ItemDef>;
const npcData = npcsJson as Record<string, NpcDef>;
const weaponData = weaponsJson as Record<string, WeaponDef>;

function makeExploringStore() {
  const store = createInitialStore();
  const world = createWorld();
  loadRegion(world, manorJson as RegionData);
  store.world = world;
  store.player = createPlayer();
  return store;
}

function makeDeps(store: ReturnType<typeof makeExploringStore>) {
  return {
    enemyData,
    itemData,
    weaponData,
    npcData,
    refreshHeader: () => {
      store.header.weapon = store.player?.equippedWeapon ? weaponData[store.player.equippedWeapon].name : 'Fists';
    },
    enterRoom: () => true,
    emit: () => {},
    startCombat: () => {},
    checkEndingsForItem: () => {},
    checkChatterbox: () => {},
    checkScholar: () => {},
    checkItemAchievements: () => {},
    goDirection: () => {},
    doSave: () => {},
    doLoadPicker: () => {},
    doMap: () => {},
    doScore: () => {},
    doSettings: () => {},
    doQuit: () => {},
    doAgain: () => {},
    printError: () => {},
  };
}

describe('exploring state', () => {
  it('parses batch counts and caps them at 10', () => {
    expect(parseBatchCount('potion x3')).toEqual(['potion', 3]);
    expect(parseBatchCount('potion x99')).toEqual(['potion', 10]);
  });

  it('offers contextual autocomplete suggestions', () => {
    const store = makeExploringStore();

    expect(getAutocompleteSuggestions(store, 'take r', enemyData, itemData, weaponData, npcData)).toEqual(['Rusty Dagger']);
  });

  it('dispatches commands through handler modules and tracks lastCommand', () => {
    const store = makeExploringStore();

    handleExploringCommand(store, 'take', 'dagger', makeDeps(store));

    expect(store.player?.equippedWeapon).toBe('rusty_dagger');
    expect(store.lastCommand).toBe('take dagger');
  });

  it('skill command outside combat prints helpful message', () => {
    const store = makeExploringStore();
    handleExploringCommand(store, 'skill', 'power strike', makeDeps(store));
    expect(store.typewriterQueue.some(l => l.text.includes('combat'))).toBe(true);
  });

  it('dispatches weapons as a focused inventory command', () => {
    const store = makeExploringStore();
    store.player!.weapons = ['rusty_dagger', 'hrunting'];
    store.player!.equippedWeapon = 'rusty_dagger';

    handleExploringCommand(store, 'weapons', '', makeDeps(store));

    expect(store.typewriterQueue.map(line => line.text)).toContain('=== Weapons ===');
    expect(store.lastCommand).toBeNull();
  });
});
