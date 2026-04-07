import { describe, expect, it } from 'vitest';
import manorJson from '../../src/data/regions/manor.json';
import { addDynamicExit, createWorld, getExits, getLivingEnemies, loadRegion, markEnemyDead } from '../../src/engine/world';
import type { RegionData } from '../../src/engine/types';

describe('world helpers', () => {
  it('loads a region into rooms and region indexes', () => {
    const world = createWorld();

    loadRegion(world, manorJson as RegionData);

    expect(world.rooms.manor_entry?.name).toBe('Entry');
    expect(world.regions.manor).toContain('manor_entry');
    expect(world.regions.manor).toContain('manor_main_hall');
  });

  it('merges static and dynamic exits', () => {
    const world = createWorld();
    loadRegion(world, manorJson as RegionData);

    addDynamicExit(world, 'manor_entry', 'east', 'secret_room');

    expect(getExits(world, 'manor_entry')).toEqual({
      north: 'manor_entrance_hall',
      south: 'manor_yard',
      east: 'secret_room',
    });
  });

  it('marks enemies dead and filters them from living-enemy lookups', () => {
    const world = createWorld();
    loadRegion(world, manorJson as RegionData);

    expect(getLivingEnemies(world, 'manor_entry')).toEqual(['shadow_rat']);

    markEnemyDead(world, 'manor_entry', 'shadow_rat');

    expect(world.rooms.manor_entry?._dead_enemies).toEqual({ shadow_rat: true });
    expect(getLivingEnemies(world, 'manor_entry')).toEqual([]);
  });

  it('loads independent room objects for separate worlds', () => {
    const firstWorld = createWorld();
    loadRegion(firstWorld, manorJson as RegionData);
    firstWorld.rooms.manor_entry._ground_loot = ['small_potion'];

    const secondWorld = createWorld();
    loadRegion(secondWorld, manorJson as RegionData);

    expect(secondWorld.rooms.manor_entry._ground_loot).toBeUndefined();
  });
});
