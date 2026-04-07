import { describe, expect, it } from 'vitest';
import enemiesJson from '../../src/data/enemies.json';
import itemsJson from '../../src/data/items.json';
import manorJson from '../../src/data/regions/manor.json';
import weaponsJson from '../../src/data/weapons.json';
import { createCombat } from '../../src/engine/combat';
import { createInitialStore } from '../../src/engine/gameReducer';
import { handleCombatCommand } from '../../src/engine/state/combat';
import { createPlayer } from '../../src/engine/player';
import type { EnemyDef, ItemDef, RegionData, WeaponDef } from '../../src/engine/types';
import { createWorld, getRoom, loadRegion } from '../../src/engine/world';

const enemyData = enemiesJson as Record<string, EnemyDef>;
const itemData = itemsJson as Record<string, ItemDef>;
const weaponData = weaponsJson as Record<string, WeaponDef>;

function makeCombatStore() {
  const store = createInitialStore();
  const world = createWorld();
  loadRegion(world, manorJson as RegionData);
  store.world = world;
  store.player = createPlayer();
  store.player.hp = 5;
  store.player.inventory = { small_potion: 1 };
  store.combat = createCombat(store.player, 'shadow_rat', enemyData);
  store.combatEnemyId = 'shadow_rat';
  store.state = 'combat';
  return store;
}

describe('combat state', () => {
  it('uses a combat consumable, refreshes the header, and stays in combat', () => {
    const store = makeCombatStore();
    let refreshes = 0;

    handleCombatCommand(store, 'use', 'small potion', {
      itemData,
      weaponData,
      enemyData,
      refreshHeader: () => {
        refreshes++;
      },
      addJournal: () => {},
      checkEndingsForBoss: () => {},
      checkAchievement: () => {},
      startGameover: () => {},
      getRoom: id => getRoom(store.world!, id),
    });

    expect(store.player?.inventory.small_potion).toBeUndefined();
    expect(store.player?.hp).toBeGreaterThan(5);
    expect(store.state).toBe('combat');
    expect(refreshes).toBe(1);
  });
});
