import * as C from '../constants';
import { addItem } from '../player';
import { addLine } from '../output';
import type { GameStore, ItemDef } from '../types';
import { getRoom } from '../world';

export function handleSearch(
  store: GameStore,
  itemData: Record<string, ItemDef>,
): void {
  if (!store.player || !store.world) return;
  const room = getRoom(store.world, store.player.currentRoom);
  if (!room) return;

  if (!room.searchable) {
    addLine(store, "There's nothing interesting to search here.", C.HELP_COLOR);
    return;
  }
  if (store.player.searchedRooms[store.player.currentRoom]) {
    addLine(store, "You've already searched this room.", C.HELP_COLOR);
    return;
  }

  store.player.searchedRooms[store.player.currentRoom] = true;
  addLine(store, 'You search the room carefully...', C.HELP_COLOR);

  let foundSomething = false;
  if (room.search_items) {
    for (const itemId of room.search_items) {
      const item = itemData[itemId];
      if (item) {
        addItem(store.player, itemId, itemData);
        if (itemId === 'ancient_map') {
          store.player.firedEvents.took_ancient_map = true;
        }
        addLine(store, `You find a ${item.name}!`, C.LOOT_COLOR);
        foundSomething = true;
      }
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
