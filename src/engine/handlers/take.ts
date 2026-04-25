import { getWeaponArtName } from '../asciiArt';
import * as C from '../constants';
import { findAllMatches, resolveOrDisambiguate, singularize } from '../matching';
import { notifyObjectiveEvent } from '../objectives';
import { addItem, addWeapon, equipWeapon } from '../player';
import { addLine, displayAscii, emitSound } from '../output';
import type { AccessoryDef, ArmorDef, ItemDef, ReadyStore, RoomDef, WeaponDef } from '../types';
import { getRoom } from '../world';

function removeFromRoom(room: RoomDef, itemId: string): string | null {
  const lists = ['items', 'weapons', 'armor', '_ground_loot', '_ground_weapons'] as const;
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
  store: ReadyStore,
  target: string,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  checkItemAchievements: () => void,
  refreshHeader: () => void,
  armorData?: Record<string, ArmorDef>,
  accessoryData?: Record<string, AccessoryDef>,
): void {
  if (!target) { addLine(store, 'Take what?', C.ERROR_COLOR); return; }

  const room = getRoom(store.world, store.player.currentRoom);
  if (!room) return;
  const player = store.player;

  const roomWeaponIds = [...(room.weapons || []), ...(room._ground_weapons || [])];
  const roomItemIds = [...(room.items || []), ...(room._ground_loot || [])];

  const singular = singularize(target);

  const takeWeapon = (weaponId: string): void => {
    const weapon = weaponData[weaponId];
    const color = weapon.weapon_class === 'magic' ? C.MAGIC_COLOR : C.ITEM_COLOR;
    removeFromRoom(room, weaponId);
    addWeapon(player, weaponId);
    const artKey = getWeaponArtName(weaponId);
    if (artKey) {
      addLine(store, '');
      displayAscii(store, artKey, color);
      addLine(store, '');
    }
    addLine(store, `You pick up the ${weapon.name}.`, color);
    notifyObjectiveEvent(store, { type: 'took_item', item: weaponId });
    emitSound(store, 'pickup');
    if (!player.equippedWeapon) {
      equipWeapon(player, weaponId);
      addLine(store, `You equip the ${weapon.name}.`, color);
      emitSound(store, 'equip');
      refreshHeader();
    }
  };

  const takeItem = (itemId: string): void => {
    removeFromRoom(room, itemId);
    addItem(player, itemId, itemData);
    addLine(store, `You pick up the ${itemData[itemId].name}.`, C.ITEM_COLOR);
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

  const takeArmor = (armorId: string): void => {
    const armor = armorData![armorId];
    removeFromRoom(room, armorId);
    player.inventory[armorId] = (player.inventory[armorId] || 0) + 1;
    addLine(store, `You pick up the ${armor.name}.`, C.ITEM_COLOR);
    notifyObjectiveEvent(store, { type: 'took_item', item: armorId });
    emitSound(store, 'pickup');
    if (!player.equippedArmor) {
      player.equippedArmor = armorId;
      addLine(store, `You equip the ${armor.name}.`, C.ITEM_COLOR);
      emitSound(store, 'equip');
    }
    checkItemAchievements();
  };

  const takeAccessory = (accId: string): void => {
    const acc = accessoryData![accId];
    removeFromRoom(room, accId);
    player.inventory[accId] = (player.inventory[accId] || 0) + 1;
    addLine(store, `You pick up the ${acc.name}.`, C.ITEM_COLOR);
    notifyObjectiveEvent(store, { type: 'took_item', item: accId });
    emitSound(store, 'pickup');
    if (!player.equippedAccessory) {
      player.equippedAccessory = accId;
      addLine(store, `You equip the ${acc.name}.`, C.ITEM_COLOR);
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

  // Check for armor in room
  if (armorData) {
    const roomArmorIds = [...(room.armor || []), ...(room._ground_loot || []).filter(id => armorData[id])];
    let armorMatches = findAllMatches(target, roomArmorIds, armorData);
    if (armorMatches.length === 0 && singular) {
      armorMatches = findAllMatches(singular, roomArmorIds, armorData);
    }
    if (armorMatches.length > 1) {
      if (singular) {
        armorMatches.forEach(id => takeArmor(id));
        return;
      }
      resolveOrDisambiguate(store, armorMatches, armorData, 'armor do you want to take');
      return;
    }
    if (armorMatches.length === 1) {
      takeArmor(armorMatches[0]);
      return;
    }
  }

  // Check for accessories on the ground
  if (accessoryData) {
    const roomAccIds = (room._ground_loot || []).filter(id => accessoryData[id]);
    let accMatches = findAllMatches(target, roomAccIds, accessoryData);
    if (accMatches.length === 0 && singular) {
      accMatches = findAllMatches(singular, roomAccIds, accessoryData);
    }
    if (accMatches.length > 1) {
      if (singular) {
        accMatches.forEach(id => takeAccessory(id));
        return;
      }
      resolveOrDisambiguate(store, accMatches, accessoryData, 'accessory do you want to take');
      return;
    }
    if (accMatches.length === 1) {
      takeAccessory(accMatches[0]);
      return;
    }
  }

  addLine(store, "You don't see that here.", C.ERROR_COLOR);
  emitSound(store, 'error');
}
