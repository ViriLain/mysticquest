import type { WorldState, RoomDef, RegionData } from './types';
import manorJson from '../data/regions/manor.json';
import wildsJson from '../data/regions/wilds.json';
import darknessJson from '../data/regions/darkness.json';
import wastesJson from '../data/regions/wastes.json';
import hiddenJson from '../data/regions/hidden.json';

export function createWorld(): WorldState {
  return { rooms: {}, regions: {} };
}

// Build a fresh story-mode world with every region loaded.
export function createStoryWorld(): WorldState {
  const world = createWorld();
  loadRegion(world, manorJson as unknown as RegionData);
  loadRegion(world, wildsJson as unknown as RegionData);
  loadRegion(world, darknessJson as unknown as RegionData);
  loadRegion(world, wastesJson as unknown as RegionData);
  loadRegion(world, hiddenJson as unknown as RegionData);
  return world;
}

export function loadRegion(world: WorldState, data: RegionData): void {
  if (!data || !data.rooms) return;
  for (const room of data.rooms) {
    world.rooms[room.id] = {
      ...room,
      exits: { ...room.exits },
      items: room.items ? [...room.items] : undefined,
      weapons: room.weapons ? [...room.weapons] : undefined,
      enemies: room.enemies ? [...room.enemies] : undefined,
      search_items: room.search_items ? [...room.search_items] : undefined,
      npcs: room.npcs ? [...room.npcs] : undefined,
      _dead_enemies: room._dead_enemies ? { ...room._dead_enemies } : undefined,
      _dynamic_exits: room._dynamic_exits ? { ...room._dynamic_exits } : undefined,
      _ground_loot: room._ground_loot ? [...room._ground_loot] : undefined,
      _ground_weapons: room._ground_weapons ? [...room._ground_weapons] : undefined,
    };
    if (!world.regions[room.region]) {
      world.regions[room.region] = [];
    }
    world.regions[room.region].push(room.id);
  }
}

export function getRoom(world: WorldState, roomId: string): RoomDef | undefined {
  return world.rooms[roomId];
}

export function getExits(world: WorldState, roomId: string): Record<string, string> {
  const room = world.rooms[roomId];
  if (!room) return {};
  const exits: Record<string, string> = {};
  if (room.exits) {
    for (const [dir, target] of Object.entries(room.exits)) {
      exits[dir] = target;
    }
  }
  if (room._dynamic_exits) {
    for (const [dir, target] of Object.entries(room._dynamic_exits)) {
      exits[dir] = target;
    }
  }
  return exits;
}

export function getAdjacentRoom(world: WorldState, roomId: string, direction: string): string | undefined {
  return getExits(world, roomId)[direction];
}

export function getLivingEnemies(world: WorldState, roomId: string): string[] {
  const room = world.rooms[roomId];
  if (!room || !room.enemies) return [];
  return room.enemies.filter(eid => !room._dead_enemies?.[eid]);
}

export function markEnemyDead(world: WorldState, roomId: string, enemyId: string): void {
  const room = world.rooms[roomId];
  if (!room) return;
  if (!room._dead_enemies) room._dead_enemies = {};
  room._dead_enemies[enemyId] = true;
}

export function addDynamicExit(world: WorldState, roomId: string, direction: string, targetRoomId: string): void {
  const room = world.rooms[roomId];
  if (!room) return;
  if (!room._dynamic_exits) room._dynamic_exits = {};
  room._dynamic_exits[direction] = targetRoomId;
}

export function nonHiddenRoomCount(world: WorldState): number {
  let count = 0;
  for (const room of Object.values(world.rooms)) {
    if (room.region !== 'hidden') count++;
  }
  return count;
}
