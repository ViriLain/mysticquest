import * as C from '../constants';
import { findAllMatches, resolveOrDisambiguate } from '../matching';
import { removeItem } from '../player';
import { addLine } from '../output';
import type { AccessoryDef, ArmorDef, ItemDef, ReadyStore, WeaponDef } from '../types';
import { getRoom } from '../world';

export function handleDrop(
  store: ReadyStore,
  target: string,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  refreshHeader: () => void,
  armorData?: Record<string, ArmorDef>,
  accessoryData?: Record<string, AccessoryDef>,
): void {
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
    if (store.player.equippedArmor === itemId) store.player.equippedArmor = null;
    if (store.player.equippedAccessory === itemId) store.player.equippedAccessory = null;
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
    const weapon = weaponData[weaponId];
    const dropColor = weapon?.weapon_class === 'magic' ? C.MAGIC_COLOR : C.HELP_COLOR;
    addLine(store, `You drop the ${weapon?.name || weaponId}.`, dropColor);
    return;
  }

  // Armor and accessories live in inventory but may not be in itemData —
  // match them against their own data tables so "drop chainmail" works.
  if (armorData) {
    const armorIds = Object.keys(store.player.inventory).filter(id => armorData[id]);
    const armorMatches = findAllMatches(target, armorIds, armorData);
    if (armorMatches.length > 1) {
      resolveOrDisambiguate(store, armorMatches, armorData, 'armor do you want to drop');
      return;
    }
    if (armorMatches.length === 1) {
      const armorId = armorMatches[0];
      removeItem(store.player, armorId);
      if (!room._ground_loot) room._ground_loot = [];
      room._ground_loot.push(armorId);
      if (store.player.equippedArmor === armorId) store.player.equippedArmor = null;
      addLine(store, `You drop the ${armorData[armorId].name}.`, C.HELP_COLOR);
      return;
    }
  }

  if (accessoryData) {
    const accIds = Object.keys(store.player.inventory).filter(id => accessoryData[id]);
    const accMatches = findAllMatches(target, accIds, accessoryData);
    if (accMatches.length > 1) {
      resolveOrDisambiguate(store, accMatches, accessoryData, 'accessory do you want to drop');
      return;
    }
    if (accMatches.length === 1) {
      const accId = accMatches[0];
      removeItem(store.player, accId);
      if (!room._ground_loot) room._ground_loot = [];
      room._ground_loot.push(accId);
      if (store.player.equippedAccessory === accId) store.player.equippedAccessory = null;
      addLine(store, `You drop the ${accessoryData[accId].name}.`, C.HELP_COLOR);
      return;
    }
  }

  addLine(store, "You don't have that.", C.ERROR_COLOR);
}
