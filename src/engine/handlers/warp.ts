import * as C from '../constants';
import { addLine } from '../output';
import { bfsDistance, getWarpTargets, warpCost } from '../warp';
import type { ReadyStore, WorldState } from '../types';

export interface WarpDeps {
  enterRoom: (roomId: string) => boolean;
  refreshHeader: () => void;
  emit: (sound: string) => void;
}

/**
 * Fuzzy-match a room name against visited rooms.
 * Exact match first, then substring.
 */
function findWarpTarget(
  world: WorldState,
  visitedRooms: Record<string, boolean>,
  name: string,
): { roomId: string; roomName: string } | null {
  const lower = name.toLowerCase();
  const entries: Array<{ roomId: string; roomName: string }> = [];
  for (const roomId of Object.keys(visitedRooms)) {
    const room = world.rooms[roomId];
    if (room) entries.push({ roomId, roomName: room.name });
  }

  const exact = entries.find(e => e.roomName.toLowerCase() === lower);
  if (exact) return exact;

  const partial = entries.filter(e => e.roomName.toLowerCase().includes(lower));
  if (partial.length === 1) return partial[0];

  return null;
}

export function handleWarp(
  store: ReadyStore,
  target: string,
  deps: WarpDeps,
): void {
  if (store.gameMode === 'dungeon') {
    addLine(store, 'Warp is not available in the dungeon.', C.ERROR_COLOR);
    return;
  }

  if (!target) {
    const targets = getWarpTargets(store.player, store.world);
    if (targets.length === 0) {
      addLine(store, 'No visited locations to warp to.', C.ERROR_COLOR);
      return;
    }

    addLine(store, '');
    addLine(store, '=== Warp Destinations ===', C.STAT_COLOR);

    let currentRegion = '';
    for (const t of targets) {
      if (t.region !== currentRegion) {
        currentRegion = t.region;
        addLine(store, '');
        addLine(store, `--- ${currentRegion.charAt(0).toUpperCase() + currentRegion.slice(1)} ---`, C.COMBAT_COLOR);
      }
      if (t.roomId === store.player.currentRoom) {
        addLine(store, `  ${t.name} (you are here)`, C.HELP_COLOR);
      } else if (t.isHub) {
        addLine(store, `  ${t.name} [FREE]`, C.ITEM_COLOR);
      } else if (t.cost >= 0) {
        addLine(store, `  ${t.name} (${t.cost}hp)`, C.CHOICE_COLOR);
      } else {
        addLine(store, `  ${t.name} (unreachable)`, C.HELP_COLOR);
      }
    }

    addLine(store, '');
    addLine(store, "Type 'warp <room name>' to teleport.", C.HELP_COLOR);
    return;
  }

  const match = findWarpTarget(store.world, store.player.visitedRooms, target);
  if (!match) {
    addLine(store, "Unknown location. Type 'warp' to see available destinations.", C.ERROR_COLOR);
    return;
  }

  if (match.roomId === store.player.currentRoom) {
    addLine(store, 'You are already here.', C.ERROR_COLOR);
    return;
  }

  const distance = bfsDistance(store.world, store.player.currentRoom, match.roomId);
  if (distance === null) {
    addLine(store, 'That location is unreachable.', C.ERROR_COLOR);
    return;
  }

  const cost = warpCost(distance, match.roomId);

  if (cost > 0 && store.player.hp - cost < 1) {
    addLine(store, `Not enough HP to warp there. (Cost: ${cost}hp, HP: ${store.player.hp})`, C.ERROR_COLOR);
    return;
  }

  if (cost > 0) {
    store.player.hp -= cost;
  }

  addLine(store, '');
  deps.enterRoom(match.roomId);
  if (cost > 0) {
    addLine(store, `The journey costs ${cost} HP. (${store.player.hp}/${store.player.maxHp})`, C.CHOICE_COLOR);
  }
  deps.emit('warp');
  deps.refreshHeader();
}
