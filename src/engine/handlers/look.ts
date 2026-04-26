import * as C from '../constants';
import type { AccessoryDef, ArmorDef, ItemDef, ReadyStore, WeaponDef } from '../types';
import { displayRoom } from '../display';
import { addLine } from '../output';
import { getAdjacentRoom, getRoom } from '../world';
import { revealSearchables } from './search';

export function handleLook(
  store: ReadyStore,
  direction: string | undefined,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  armorData?: Record<string, ArmorDef>,
  accessoryData?: Record<string, AccessoryDef>,
): void {
  if (!direction) {
    addLine(store, '');
    displayRoom(store, store.player.currentRoom);
    revealSearchables(store, itemData, weaponData, {}, armorData, accessoryData);
    return;
  }

  // Normalize direction shortcuts
  const dirMap: Record<string, string> = {
    n: 'north', s: 'south', e: 'east', w: 'west', u: 'up', d: 'down',
    north: 'north', south: 'south', east: 'east', west: 'west', up: 'up', down: 'down',
  };
  const dir = dirMap[direction.toLowerCase()];
  if (!dir) {
    addLine(store, "You can't look in that direction.", C.ERROR_COLOR);
    return;
  }

  const targetRoomId = getAdjacentRoom(store.world, store.player.currentRoom, dir);
  if (!targetRoomId) {
    addLine(store, `There's nothing to the ${dir}.`, C.HELP_COLOR);
    return;
  }

  const room = getRoom(store.world, targetRoomId);
  if (!room) {
    addLine(store, `There's nothing to the ${dir}.`, C.HELP_COLOR);
    return;
  }

  addLine(store, '');
  addLine(store, `Looking ${dir}...`, C.HELP_COLOR);
  addLine(store, `You see: ${room.name}`, C.STAT_COLOR);
  const desc = room.description.length > 120
    ? room.description.slice(0, 120) + '...'
    : room.description;
  addLine(store, desc, C.HELP_COLOR);
}
