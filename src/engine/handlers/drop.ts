import * as C from '../constants';
import { findAllMatches, resolveOrDisambiguate } from '../matching';
import { removeItem } from '../player';
import { addLine } from '../output';
import type { GameStore, ItemDef, WeaponDef } from '../types';
import { getRoom } from '../world';

export function handleDrop(
  store: GameStore,
  target: string,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  refreshHeader: () => void,
): void {
  if (!store.player || !store.world) return;
  if (!target) { addLine(store, 'Drop what?', C.ERROR_COLOR); return; }

  const room = getRoom(store.world, store.player.currentRoom);
  if (!room) return;

  const ownedItemIds = Object.keys(store.player.inventory);
  const itemMatches = findAllMatches(target, ownedItemIds, itemData);
  if (itemMatches.length > 1) {
    resolveOrDisambiguate(store, itemMatches, itemData, 'item do you want to drop');
    return;
  }
  if (itemMatches.length === 1) {
    const itemId = itemMatches[0];
    if (itemData[itemId].type === 'key') {
      addLine(store, "You can't drop that.", C.ERROR_COLOR);
      return;
    }
    removeItem(store.player, itemId);
    if (!room._ground_loot) room._ground_loot = [];
    room._ground_loot.push(itemId);
    if (store.player.equippedShield === itemId) store.player.equippedShield = null;
    addLine(store, `You drop the ${itemData[itemId]?.name || itemId}.`, C.HELP_COLOR);
    return;
  }

  const weaponMatches = findAllMatches(target, store.player.weapons, weaponData);
  if (weaponMatches.length > 1) {
    resolveOrDisambiguate(store, weaponMatches, weaponData, 'weapon do you want to drop');
    return;
  }
  if (weaponMatches.length === 1) {
    const weaponId = weaponMatches[0];
    const idx = store.player.weapons.indexOf(weaponId);
    store.player.weapons.splice(idx, 1);
    if (!room._ground_weapons) room._ground_weapons = [];
    room._ground_weapons.push(weaponId);
    if (store.player.equippedWeapon === weaponId) {
      store.player.equippedWeapon = null;
      refreshHeader();
    }
    addLine(store, `You drop the ${weaponData[weaponId]?.name || weaponId}.`, C.HELP_COLOR);
    return;
  }

  addLine(store, "You don't have that.", C.ERROR_COLOR);
}
