import type { WorldState, RoomDef, RegionData } from './types';

export function createWorld(): WorldState {
  return { rooms: {}, regions: {} };
}

export function loadRegion(world: WorldState, data: RegionData): void {
  if (!data || !data.rooms) return;
  for (const room of data.rooms) {
    world.rooms[room.id] = room;
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
