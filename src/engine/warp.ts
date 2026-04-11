import type { PlayerState, WorldState } from './types';
import { getRoom } from './world';

export const WARP_HUBS = new Set([
  'manor_main_hall',
  'wilds_central_forest',
  'darkness_abyss',
  'wastes_path',
]);

export interface WarpTarget {
  roomId: string;
  name: string;
  region: string;
  isHub: boolean;
  cost: number;
}

export function bfsDistance(world: WorldState, fromRoom: string, toRoom: string): number | null {
  if (fromRoom === toRoom) return 0;
  if (!world.rooms[fromRoom] || !world.rooms[toRoom]) return null;

  const visited = new Set<string>([fromRoom]);
  const queue: Array<[string, number]> = [[fromRoom, 0]];

  while (queue.length > 0) {
    const [roomId, dist] = queue.shift()!;
    const room = world.rooms[roomId];
    if (!room) continue;

    const exits = { ...room.exits, ...room._dynamic_exits };
    for (const targetId of Object.values(exits)) {
      if (targetId === toRoom) return dist + 1;
      if (!visited.has(targetId) && world.rooms[targetId]) {
        visited.add(targetId);
        queue.push([targetId, dist + 1]);
      }
    }
  }

  return null;
}

export function warpCost(distance: number, targetRoom: string): number {
  if (WARP_HUBS.has(targetRoom)) return 0;
  return 2 * distance;
}

export function getWarpTargets(player: PlayerState, world: WorldState): WarpTarget[] {
  const targets: WarpTarget[] = [];

  for (const roomId of Object.keys(player.visitedRooms)) {
    const room = getRoom(world, roomId);
    if (!room) continue;

    const distance = bfsDistance(world, player.currentRoom, roomId);
    const cost = distance !== null ? warpCost(distance, roomId) : -1;

    targets.push({
      roomId,
      name: room.name,
      region: room.region,
      isHub: WARP_HUBS.has(roomId),
      cost,
    });
  }

  targets.sort((a, b) => {
    if (a.region !== b.region) return a.region.localeCompare(b.region);
    return a.name.localeCompare(b.name);
  });

  return targets;
}
