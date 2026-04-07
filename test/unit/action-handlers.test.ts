import { describe, expect, it } from 'vitest';
import enemiesJson from '../../src/data/enemies.json';
import itemsJson from '../../src/data/items.json';
import manorJson from '../../src/data/regions/manor.json';
import weaponsJson from '../../src/data/weapons.json';
import { createInitialStore } from '../../src/engine/gameReducer';
import { handleAttack } from '../../src/engine/handlers/attack';
import { handleDrop } from '../../src/engine/handlers/drop';
import { handleExamine } from '../../src/engine/handlers/examine';
import { handleSearch } from '../../src/engine/handlers/search';
import { handleTake } from '../../src/engine/handlers/take';
import { handleUse } from '../../src/engine/handlers/use';
import { createPlayer } from '../../src/engine/player';
import type { EnemyDef, ItemDef, RegionData, WeaponDef } from '../../src/engine/types';
import { createWorld, loadRegion } from '../../src/engine/world';

const itemData = itemsJson as Record<string, ItemDef>;
const weaponData = weaponsJson as Record<string, WeaponDef>;
const enemyData = enemiesJson as Record<string, EnemyDef>;

function makeStoryStore() {
  const store = createInitialStore();
  const world = createWorld();
  loadRegion(world, manorJson as RegionData);
  store.world = world;
  store.player = createPlayer();
  return store;
}

describe('action handlers', () => {
  it('take moves a room weapon into inventory and equips it', () => {
    const store = makeStoryStore();
    const journal: string[] = [];

    handleTake(
      store,
      'dagger',
      itemData,
      weaponData,
      (_type, text) => journal.push(text),
      () => {},
      () => {
        store.header.weapon = store.player?.equippedWeapon ? weaponData[store.player.equippedWeapon].name : 'Fists';
      },
    );

    expect(store.player?.weapons).toContain('rusty_dagger');
    expect(store.player?.equippedWeapon).toBe('rusty_dagger');
    expect(store.world?.rooms.manor_entry.weapons).toEqual([]);
    expect(journal).toContain('Found Rusty Dagger');
  });

  it('drop removes an equipped weapon and clears the header through refreshHeader', () => {
    const store = makeStoryStore();
    store.player!.weapons = ['rusty_dagger'];
    store.player!.equippedWeapon = 'rusty_dagger';
    store.header.weapon = 'Rusty Dagger';

    handleDrop(store, 'dagger', itemData, weaponData, () => {
      store.header.weapon = store.player?.equippedWeapon ? weaponData[store.player.equippedWeapon].name : 'Fists';
    });

    expect(store.player?.weapons).toEqual([]);
    expect(store.player?.equippedWeapon).toBeNull();
    expect(store.header.weapon).toBe('Fists');
    expect(store.world?.rooms.manor_entry._ground_weapons).toEqual(['rusty_dagger']);
  });

  it('examine describes an enemy in the current room', () => {
    const store = makeStoryStore();

    handleExamine(store, 'rat', enemyData, itemData, weaponData);

    const lines = store.typewriterQueue.map(line => line.text);
    expect(lines).toContain('[!] === Shadow Rat ===');
    expect(lines).toContain('HP: 10  ATK: 3  DEF: 1  XP: 8');
  });

  it('use equips a weapon and consumes a potion', () => {
    const store = makeStoryStore();
    store.player!.weapons = ['rusty_dagger'];
    store.player!.inventory = { potion: 1 };
    store.player!.hp = 10;

    handleUse(store, 'dagger', itemData, weaponData, () => {
      store.header.weapon = store.player?.equippedWeapon ? weaponData[store.player.equippedWeapon].name : 'Fists';
    }, () => {});
    handleUse(store, 'potion', itemData, weaponData, () => {}, () => {});

    expect(store.player?.equippedWeapon).toBe('rusty_dagger');
    expect(store.header.weapon).toBe('Rusty Dagger');
    expect(store.player?.hp).toBe(30);
    expect(store.player?.inventory.potion).toBeUndefined();
  });

  it('search marks the room searched and grants hidden items', () => {
    const store = makeStoryStore();

    handleSearch(store, itemData);

    expect(store.player?.searchedRooms.manor_entry).toBe(true);
    expect(store.player?.keyItems.rusty_key).toBe(true);
    expect(store.typewriterQueue.map(line => line.text)).toContain('You find a Rusty Key!');
  });

  it('attack resolves an enemy and forwards it to startCombat', () => {
    const store = makeStoryStore();
    const started: string[] = [];

    handleAttack(store, 'rat', enemyData, enemyId => started.push(enemyId));

    expect(started).toEqual(['shadow_rat']);
  });
});
