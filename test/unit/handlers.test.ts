import { describe, expect, it } from 'vitest';
import itemsJson from '../../src/data/items.json';
import manorJson from '../../src/data/regions/manor.json';
import weaponsJson from '../../src/data/weapons.json';
import { createInitialStore } from '../../src/engine/gameReducer';
import { handleHelp } from '../../src/engine/handlers/help';
import { handleLook } from '../../src/engine/handlers/look';
import { createPlayer } from '../../src/engine/player';
import type { ItemDef, RegionData, WeaponDef } from '../../src/engine/types';
import { createWorld, loadRegion } from '../../src/engine/world';

const itemData = itemsJson as Record<string, ItemDef>;
const weaponData = weaponsJson as Record<string, WeaponDef>;

describe('read-only handlers', () => {
  it('look adds spacing then renders the current room', () => {
    const store = createInitialStore();
    const world = createWorld();
    loadRegion(world, manorJson as RegionData);
    store.world = world;
    store.player = createPlayer();

    handleLook(store);

    expect(store.typewriterQueue.map(line => line.text).slice(0, 5)).toEqual([
      '',
      '----------------------------------------',
      'Entry',
      '',
      'You are inside the entry room of an old manor. It is reasonably large, with old chairs and a coat rack on the west wall. The walls are upholstered, and an ornate chandelier hangs from the ceiling. A window to the south is the room\'s only source of light.',
    ]);
  });

  it('look auto-searches the current room once', () => {
    const store = createInitialStore();
    const world = createWorld();
    loadRegion(world, {
      rooms: [
        {
          id: 'cache',
          name: 'Cache',
          region: 'test',
          description: 'A cache room.',
          exits: {},
          searchable: true,
          search_items: ['potion'],
        },
      ],
    } as RegionData);
    store.world = world;
    store.player = createPlayer('cache');

    handleLook(store, undefined, itemData, weaponData);

    expect(store.player.searchedRooms.cache).toBe(true);
    expect(world.rooms.cache._ground_loot).toContain('potion');
    expect(store.typewriterQueue.map(line => line.text)).toContain('You find a Potion.');
  });

  it('look in a direction previews without searching the current room', () => {
    const store = createInitialStore();
    const world = createWorld();
    loadRegion(world, {
      rooms: [
        {
          id: 'cache',
          name: 'Cache',
          region: 'test',
          description: 'A cache room.',
          exits: { north: 'next' },
          searchable: true,
          search_items: ['potion'],
        },
        {
          id: 'next',
          name: 'Next Room',
          region: 'test',
          description: 'A previewed room.',
          exits: { south: 'cache' },
        },
      ],
    } as RegionData);
    store.world = world;
    store.player = createPlayer('cache');

    handleLook(store, 'north', itemData, weaponData);

    expect(store.player.searchedRooms.cache).toBeUndefined();
    expect(world.rooms.cache._ground_loot).toBeUndefined();
    expect(store.typewriterQueue.map(line => line.text)).toContain('You see: Next Room');
  });

  it('help renders the command reference text', () => {
    const store = createInitialStore();

    handleHelp(store);

    const lines = store.typewriterQueue.map(line => line.text);
    expect(lines.slice(0, 5)).toEqual([
      '',
      '----------------------------------------',
      '=== COMMANDS ===',
      '',
      ' MOVEMENT',
    ]);
    expect(lines).toContain('  help (?)        - Show this help');
    expect(lines.at(-1)).toBe('----------------------------------------');
  });
});
