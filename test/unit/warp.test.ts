import { describe, expect, it } from 'vitest';
import { bfsDistance, warpCost, WARP_HUBS, getWarpTargets } from '../../src/engine/warp';
import { createWorld, loadRegion } from '../../src/engine/world';
import { createPlayer } from '../../src/engine/player';
import manorJson from '../../src/data/regions/manor.json';
import wildsJson from '../../src/data/regions/wilds.json';
import type { RegionData } from '../../src/engine/types';

function makeWorld() {
  const world = createWorld();
  loadRegion(world, manorJson as RegionData);
  loadRegion(world, wildsJson as RegionData);
  return world;
}

describe('warp module', () => {
  describe('bfsDistance', () => {
    it('returns 0 for same room', () => {
      const world = makeWorld();
      expect(bfsDistance(world, 'manor_entry', 'manor_entry')).toBe(0);
    });

    it('returns 1 for adjacent rooms', () => {
      const world = makeWorld();
      expect(bfsDistance(world, 'manor_entry', 'manor_entrance_hall')).toBe(1);
    });

    it('returns correct multi-hop distance', () => {
      const world = makeWorld();
      expect(bfsDistance(world, 'manor_entry', 'manor_main_hall')).toBe(2);
    });

    it('returns null for unreachable room', () => {
      const world = createWorld();
      loadRegion(world, manorJson as RegionData);
      expect(bfsDistance(world, 'manor_entry', 'wilds_forest_entrance')).toBeNull();
    });

    it('traverses _dynamic_exits', () => {
      const world = makeWorld();
      // Inject a dynamic exit shortcut: entry -> main_hall directly
      world.rooms['manor_entry']._dynamic_exits = { secret: 'manor_main_hall' };
      expect(bfsDistance(world, 'manor_entry', 'manor_main_hall')).toBe(1);
    });
  });

  describe('warpCost', () => {
    it('returns 0 for hub rooms', () => {
      for (const hub of WARP_HUBS) {
        expect(warpCost(5, hub)).toBe(0);
      }
    });

    it('returns 2 * distance for non-hub rooms', () => {
      expect(warpCost(3, 'manor_entry')).toBe(6);
      expect(warpCost(1, 'manor_library')).toBe(2);
    });
  });

  describe('getWarpTargets', () => {
    it('returns visited rooms with costs sorted by region then name', () => {
      const world = makeWorld();
      const player = createPlayer();
      player.visitedRooms['manor_entry'] = true;
      player.visitedRooms['manor_main_hall'] = true;

      const targets = getWarpTargets(player, world);
      expect(targets.length).toBe(2);
      expect(targets[0].roomId).toBe('manor_entry');
      expect(targets[1].roomId).toBe('manor_main_hall');
      expect(targets[1].isHub).toBe(true);
      expect(targets[1].cost).toBe(0);
    });
  });
});
