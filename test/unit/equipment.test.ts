import { describe, expect, it } from 'vitest';
import accessoriesJson from '../../src/data/accessories.json';
import armorJson from '../../src/data/armor.json';
import itemsJson from '../../src/data/items.json';
import weaponsJson from '../../src/data/weapons.json';
import enemiesJson from '../../src/data/enemies.json';
import { createInitialStore } from '../../src/engine/gameReducer';
import { handleDrop } from '../../src/engine/handlers/drop';
import { handleExamine } from '../../src/engine/handlers/examine';
import { handleTake } from '../../src/engine/handlers/take';
import { handleUse } from '../../src/engine/handlers/use';
import { handleSearch } from '../../src/engine/handlers/search';
import { createPlayer, totalDefense } from '../../src/engine/player';
import type {
  AccessoryDef, ArmorDef, EnemyDef, ItemDef, RegionData, WeaponDef,
} from '../../src/engine/types';
import { createWorld, loadRegion } from '../../src/engine/world';

const itemData = itemsJson as Record<string, ItemDef>;
const weaponData = weaponsJson as Record<string, WeaponDef>;
const enemyData = enemiesJson as Record<string, EnemyDef>;
const armorData = armorJson as Record<string, ArmorDef>;
const accessoryData = accessoriesJson as Record<string, AccessoryDef>;

function makeStore(roomOverrides: Partial<import('../../src/engine/types').RoomDef> = {}) {
  const store = createInitialStore();
  const world = createWorld();
  loadRegion(world, {
    rooms: [
      {
        id: 'test_room',
        name: 'Test Room',
        region: 'test',
        description: 'A test room.',
        exits: {},
        ...roomOverrides,
      },
    ],
  } as RegionData);
  store.world = world;
  store.player = createPlayer('test_room');
  return store;
}

const noop = () => {};

describe('armor and accessory equipment', () => {
  describe('use (equip)', () => {
    it('equips armor from inventory', () => {
      const store = makeStore();
      store.player!.inventory = { chainmail: 1 };

      handleUse(store, 'chainmail', itemData, weaponData, noop, noop, armorData, accessoryData);

      expect(store.player!.equippedArmor).toBe('chainmail');
      const lines = store.typewriterQueue.map(l => l.text);
      expect(lines).toContain('You equip the Chainmail.');
    });

    it('equips accessory from inventory', () => {
      const store = makeStore();
      store.player!.inventory = { keen_eye_ring: 1 };

      handleUse(store, 'keen eye ring', itemData, weaponData, noop, noop, armorData, accessoryData);

      expect(store.player!.equippedAccessory).toBe('keen_eye_ring');
      const lines = store.typewriterQueue.map(l => l.text);
      expect(lines).toContain('You equip the Keen Eye Ring.');
    });

    it('swapping armor replaces the equipped slot', () => {
      const store = makeStore();
      store.player!.inventory = { chainmail: 1, leather_vest: 1 };
      store.player!.equippedArmor = 'leather_vest';

      handleUse(store, 'chainmail', itemData, weaponData, noop, noop, armorData, accessoryData);

      expect(store.player!.equippedArmor).toBe('chainmail');
    });

    it('matches armor by match_words', () => {
      const store = makeStore();
      store.player!.inventory = { chainmail: 1 };

      handleUse(store, 'chain', itemData, weaponData, noop, noop, armorData, accessoryData);

      expect(store.player!.equippedArmor).toBe('chainmail');
    });
  });

  describe('drop', () => {
    it('drops equipped armor and clears the slot', () => {
      const store = makeStore();
      store.player!.inventory = { chainmail: 1 };
      store.player!.equippedArmor = 'chainmail';

      handleDrop(store, 'chainmail', itemData, weaponData, noop, armorData, accessoryData);

      expect(store.player!.equippedArmor).toBeNull();
      expect(store.player!.inventory.chainmail).toBeUndefined();
      expect(store.world!.rooms.test_room._ground_loot).toContain('chainmail');
    });

    it('drops equipped accessory and clears the slot', () => {
      const store = makeStore();
      store.player!.inventory = { keen_eye_ring: 1 };
      store.player!.equippedAccessory = 'keen_eye_ring';

      handleDrop(store, 'keen eye ring', itemData, weaponData, noop, armorData, accessoryData);

      expect(store.player!.equippedAccessory).toBeNull();
      expect(store.player!.inventory.keen_eye_ring).toBeUndefined();
      expect(store.world!.rooms.test_room._ground_loot).toContain('keen_eye_ring');
    });
  });

  describe('take', () => {
    it('takes armor from room.armor and auto-equips', () => {
      const store = makeStore({ armor: ['chainmail'] });

      handleTake(
        store, 'chainmail', itemData, weaponData, noop, noop, armorData, accessoryData,
      );

      expect(store.player!.inventory.chainmail).toBe(1);
      expect(store.player!.equippedArmor).toBe('chainmail');
      expect(store.world!.rooms.test_room.armor).toEqual([]);
      const lines = store.typewriterQueue.map(l => l.text);
      expect(lines).toContain('You pick up the Chainmail.');
      expect(lines).toContain('You equip the Chainmail.');
    });

    it('does not auto-equip armor when a piece is already equipped', () => {
      const store = makeStore({ armor: ['chainmail'] });
      store.player!.equippedArmor = 'leather_vest';

      handleTake(
        store, 'chainmail', itemData, weaponData, noop, noop, armorData, accessoryData,
      );

      expect(store.player!.inventory.chainmail).toBe(1);
      expect(store.player!.equippedArmor).toBe('leather_vest');
    });

    it('takes accessory from ground loot and auto-equips', () => {
      const store = makeStore();
      store.world!.rooms.test_room._ground_loot = ['keen_eye_ring'];

      handleTake(
        store, 'keen eye ring', itemData, weaponData, noop, noop, armorData, accessoryData,
      );

      expect(store.player!.inventory.keen_eye_ring).toBe(1);
      expect(store.player!.equippedAccessory).toBe('keen_eye_ring');
      expect(store.world!.rooms.test_room._ground_loot).not.toContain('keen_eye_ring');
    });
  });

  describe('search', () => {
    it('reveals an accessory as ground loot', () => {
      const store = makeStore({ searchable: true, search_items: ['keen_eye_ring'] });

      handleSearch(store, itemData, weaponData, armorData, accessoryData);

      expect(store.world!.rooms.test_room._ground_loot).toContain('keen_eye_ring');
      const lines = store.typewriterQueue.map(l => l.text);
      expect(lines).toContain('You find a Keen Eye Ring.');
    });

    it('reveals armor as ground loot', () => {
      const store = makeStore({ searchable: true, search_items: ['shadow_plate'] });

      handleSearch(store, itemData, weaponData, armorData, accessoryData);

      expect(store.world!.rooms.test_room._ground_loot).toContain('shadow_plate');
      const lines = store.typewriterQueue.map(l => l.text);
      expect(lines).toContain('You find a Shadow Plate.');
    });
  });

  describe('examine', () => {
    it('shows armor defense value', () => {
      const store = makeStore();
      store.player!.inventory = { chainmail: 1 };

      handleExamine(
        store, 'chainmail', enemyData, itemData, weaponData, armorData, accessoryData,
      );

      const lines = store.typewriterQueue.map(l => l.text);
      expect(lines.some(l => l.includes('Chainmail'))).toBe(true);
      expect(lines).toContain('Defense: +4');
    });

    it('shows equipped tag for worn armor', () => {
      const store = makeStore();
      store.player!.inventory = { chainmail: 1 };
      store.player!.equippedArmor = 'chainmail';

      handleExamine(
        store, 'chainmail', enemyData, itemData, weaponData, armorData, accessoryData,
      );

      const lines = store.typewriterQueue.map(l => l.text);
      expect(lines).toContain('(currently equipped)');
    });

    it('shows accessory modifier info', () => {
      const store = makeStore();
      store.player!.inventory = { keen_eye_ring: 1 };

      handleExamine(
        store, 'keen eye ring', enemyData, itemData, weaponData, armorData, accessoryData,
      );

      const lines = store.typewriterQueue.map(l => l.text);
      expect(lines.some(l => l.includes('Keen Eye Ring'))).toBe(true);
      expect(lines).toContain('+8 crit_chance');
    });

    it('shows equipped tag for worn accessory', () => {
      const store = makeStore();
      store.player!.inventory = { keen_eye_ring: 1 };
      store.player!.equippedAccessory = 'keen_eye_ring';

      handleExamine(
        store, 'keen eye ring', enemyData, itemData, weaponData, armorData, accessoryData,
      );

      const lines = store.typewriterQueue.map(l => l.text);
      expect(lines).toContain('(currently equipped)');
    });

    it('examines armor on the ground in a room', () => {
      const store = makeStore({ armor: ['shadow_plate'] });

      handleExamine(
        store, 'shadow plate', enemyData, itemData, weaponData, armorData, accessoryData,
      );

      const lines = store.typewriterQueue.map(l => l.text);
      expect(lines.some(l => l.includes('Shadow Plate'))).toBe(true);
      expect(lines).toContain('Defense: +6');
    });
  });

  describe('totalDefense', () => {
    it('includes armor defense', () => {
      const player = createPlayer();
      player.equippedArmor = 'chainmail';

      const def = totalDefense(player, itemData, armorData);

      // Base defense (2) + chainmail (4)
      expect(def).toBe(6);
    });

    it('stacks with shield defense', () => {
      const player = createPlayer();
      player.equippedShield = 'iron_shield';
      player.equippedArmor = 'leather_vest';

      const def = totalDefense(player, itemData, armorData);

      // Base defense (2) + iron_shield (3) + leather_vest (2)
      expect(def).toBe(7);
    });

    it('returns base defense when no armor data provided', () => {
      const player = createPlayer();
      player.equippedArmor = 'chainmail';

      const def = totalDefense(player, itemData);

      // No armorData param — armor not counted
      expect(def).toBe(2);
    });
  });
});
