import * as C from '../constants';
import { addLine } from '../output';
import { notifyObjectiveEvent } from '../objectives';
import { addDynamicExit, getRoom } from '../world';
import type { AccessoryDef, ArmorDef, GameStore, ItemDef, WeaponDef } from '../types';

interface RevealOptions {
  announceSearch?: boolean;
  alreadySearchedMessage?: boolean;
  notSearchableMessage?: boolean;
}

export function revealSearchables(
  store: GameStore,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  options: RevealOptions = {},
  armorData?: Record<string, ArmorDef>,
  accessoryData?: Record<string, AccessoryDef>,
): void {
  if (!store.player || !store.world) return;
  const room = getRoom(store.world, store.player.currentRoom);
  if (!room) return;

  if (!room.searchable) {
    if (options.notSearchableMessage) {
      addLine(store, "There's nothing interesting to search here.", C.HELP_COLOR);
    }
    return;
  }
  if (store.player.searchedRooms[store.player.currentRoom]) {
    if (options.alreadySearchedMessage) {
      addLine(store, "You've already searched this room.", C.HELP_COLOR);
    }
    return;
  }

  store.player.searchedRooms[store.player.currentRoom] = true;
  notifyObjectiveEvent(store, { type: 'searched_room', room: store.player.currentRoom });
  if (options.announceSearch) {
    addLine(store, 'You search the room carefully...', C.HELP_COLOR);
  }

  let foundSomething = false;
  if (room.search_items) {
    for (const id of room.search_items) {
      if (weaponData[id]) {
        if (!room._ground_weapons) room._ground_weapons = [];
        if (!room._ground_weapons.includes(id)) room._ground_weapons.push(id);
        const color = weaponData[id].weapon_class === 'magic' ? C.MAGIC_COLOR : C.LOOT_COLOR;
        addLine(store, `You find a ${weaponData[id].name}.`, color);
        foundSomething = true;
      } else if (armorData && armorData[id]) {
        if (!room._ground_loot) room._ground_loot = [];
        if (!room._ground_loot.includes(id)) room._ground_loot.push(id);
        addLine(store, `You find a ${armorData[id].name}.`, C.LOOT_COLOR);
        foundSomething = true;
      } else if (accessoryData && accessoryData[id]) {
        if (!room._ground_loot) room._ground_loot = [];
        if (!room._ground_loot.includes(id)) room._ground_loot.push(id);
        addLine(store, `You find a ${accessoryData[id].name}.`, C.LOOT_COLOR);
        foundSomething = true;
      } else if (itemData[id]) {
        if (!room._ground_loot) room._ground_loot = [];
        if (!room._ground_loot.includes(id)) room._ground_loot.push(id);
        addLine(store, `You find a ${itemData[id].name}.`, C.LOOT_COLOR);
        foundSomething = true;
      }
    }
  }

  if (room.secret_exits) {
    for (const [dir, target] of Object.entries(room.secret_exits)) {
      addDynamicExit(store.world, room.id, dir, target);
      addLine(store, `You find a hidden passage leading ${dir}.`, C.LOOT_COLOR);
      foundSomething = true;
    }
  }

  if (room.dev_note) {
    let note = room.dev_note;
    if (!note.startsWith('//')) note = '// ' + note;
    addLine(store, '');
    addLine(store, note, C.DEV_NOTE_COLOR);
    addLine(store, '');
  }

  if (!foundSomething) {
    addLine(store, "You don't find anything useful.", C.HELP_COLOR);
  }
}

export function handleSearch(
  store: GameStore,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  armorData?: Record<string, ArmorDef>,
  accessoryData?: Record<string, AccessoryDef>,
): void {
  revealSearchables(store, itemData, weaponData, {
    announceSearch: true,
    alreadySearchedMessage: true,
    notSearchableMessage: true,
  }, armorData, accessoryData);
}
