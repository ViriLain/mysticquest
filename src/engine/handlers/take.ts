import * as C from '../constants';
import { findAllMatches, resolveOrDisambiguate, singularize } from '../matching';
import { notifyObjectiveEvent } from '../objectives';
import { addItem, addWeapon, equipWeapon } from '../player';
import { addLine, emitSound } from '../output';
import type { GameStore, ItemDef, RoomDef, WeaponDef } from '../types';
import { getRoom } from '../world';

function removeFromRoom(room: RoomDef, itemId: string): string | null {
  const lists = ['items', 'weapons', '_ground_loot', '_ground_weapons'] as const;
  for (const listName of lists) {
    const list = room[listName] as string[] | undefined;
    if (list) {
      const idx = list.indexOf(itemId);
      if (idx !== -1) {
        list.splice(idx, 1);
        return listName;
      }
    }
  }
  return null;
}

export function handleTake(
  store: GameStore,
  target: string,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  addJournal: (type: 'item', text: string) => void,
  checkItemAchievements: () => void,
  refreshHeader: () => void,
): void {
  if (!store.player || !store.world) return;
  if (!target) { addLine(store, 'Take what?', C.ERROR_COLOR); return; }

  const room = getRoom(store.world, store.player.currentRoom);
  if (!room) return;
  const player = store.player;

  const roomWeaponIds = [...(room.weapons || []), ...(room._ground_weapons || [])];
  const roomItemIds = [...(room.items || []), ...(room._ground_loot || [])];

  const singular = singularize(target);

  const takeWeapon = (weaponId: string): void => {
    removeFromRoom(room, weaponId);
    addWeapon(player, weaponId);
    addLine(store, `You pick up the ${weaponData[weaponId].name}.`, C.ITEM_COLOR);
    addJournal('item', `Found ${weaponData[weaponId].name}`);
    notifyObjectiveEvent(store, { type: 'took_item', item: weaponId });
    emitSound(store, 'pickup');
    if (!player.equippedWeapon) {
      equipWeapon(player, weaponId);
      addLine(store, `You equip the ${weaponData[weaponId].name}.`, C.ITEM_COLOR);
      emitSound(store, 'equip');
      refreshHeader();
    }
  };

  const takeItem = (itemId: string): void => {
    removeFromRoom(room, itemId);
    addItem(player, itemId, itemData);
    addLine(store, `You pick up the ${itemData[itemId].name}.`, C.ITEM_COLOR);
    addJournal('item', `Found ${itemData[itemId].name}`);
    notifyObjectiveEvent(store, { type: 'took_item', item: itemId });
    emitSound(store, 'pickup');
    if (itemId === 'ancient_map') {
      player.firedEvents.took_ancient_map = true;
    }
    if (itemData[itemId].type === 'shield' && !player.equippedShield) {
      player.equippedShield = itemId;
      addLine(store, `You equip the ${itemData[itemId].name}.`, C.ITEM_COLOR);
      emitSound(store, 'equip');
    }
    checkItemAchievements();
  };

  let weaponMatches = findAllMatches(target, roomWeaponIds, weaponData);
  if (weaponMatches.length === 0 && singular) {
    weaponMatches = findAllMatches(singular, roomWeaponIds, weaponData);
  }
  if (weaponMatches.length > 1) {
    if (singular) {
      weaponMatches.forEach(takeWeapon);
      return;
    }
    resolveOrDisambiguate(store, weaponMatches, weaponData, 'weapon do you want to take');
    return;
  }
  if (weaponMatches.length === 1) {
    takeWeapon(weaponMatches[0]);
    return;
  }

  let itemMatches = findAllMatches(target, roomItemIds, itemData);
  if (itemMatches.length === 0 && singular) {
    itemMatches = findAllMatches(singular, roomItemIds, itemData);
  }
  if (itemMatches.length > 1) {
    if (singular) {
      itemMatches.forEach(takeItem);
      return;
    }
    resolveOrDisambiguate(store, itemMatches, itemData, 'item do you want to take');
    return;
  }
  if (itemMatches.length === 1) {
    takeItem(itemMatches[0]);
    return;
  }

  addLine(store, "You don't see that here.", C.ERROR_COLOR);
  emitSound(store, 'error');
}
