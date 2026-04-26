import * as C from '../constants';
import { findAllMatches, resolveOrDisambiguate, singularize } from '../matching';
import { equipWeapon, hasItem, hasKeyItem, hasSkill, heal as playerHeal, removeItem } from '../player';
import { addLine, emitSound } from '../output';
import type { AccessoryDef, ArmorDef, ItemDef, ReadyStore, WeaponDef } from '../types';

export function handleUse(
  store: ReadyStore,
  target: string,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  refreshHeader: () => void,
  checkEndingsForItem: (itemId: string) => void,
  armorData?: Record<string, ArmorDef>,
  accessoryData?: Record<string, AccessoryDef>,
): void {
  if (!target) { addLine(store, 'Use what?', C.ERROR_COLOR); return; }
  const player = store.player;

  const ownedWeaponIds = player.weapons;
  const ownedItemIds = [
    ...Object.keys(player.inventory),
    ...Object.keys(player.keyItems),
  ];

  const singular = singularize(target);

  const applyWeapon = (weaponId: string): void => {
    const weapon = weaponData[weaponId];
    equipWeapon(player, weaponId);
    const color = weapon.weapon_class === 'magic' ? C.MAGIC_COLOR : C.ITEM_COLOR;
    addLine(store, `You equip the ${weapon.name}.`, color);
    emitSound(store, 'equip');
    refreshHeader();
  };

  // Returns true if the item was successfully used.
  const applyItem = (itemId: string): boolean => {
    const item = itemData[itemId];
    if (!item) return false;

    if (item.type === 'shield' && hasItem(player, itemId)) {
      player.equippedShield = itemId;
      addLine(store, `You equip the ${item.name}.`, C.ITEM_COLOR);
      emitSound(store, 'equip');
      return true;
    }

    if (item.type === 'key' && hasKeyItem(player, itemId)) {
      const roomId = player.currentRoom;
      if (!player.usedItemsInRoom[roomId]) player.usedItemsInRoom[roomId] = {};
      player.usedItemsInRoom[roomId][itemId] = true;
      addLine(store, `You use the ${item.name}.`, C.ITEM_COLOR);
      checkEndingsForItem(itemId);
      return true;
    }

    if (item.type === 'consumable' && hasItem(player, itemId)) {
      if (item.effect === 'cure') {
        addLine(store, 'Cure items can only be used in combat.', C.HELP_COLOR);
        return true;
      }
      removeItem(player, itemId);
      if (item.effect === 'heal' && item.value) {
        const healAmount = hasSkill(player, 'herbalism') ? Math.floor(item.value * 1.5) : item.value;
        const oldHp = player.hp;
        playerHeal(player, healAmount);
        const healed = player.hp - oldHp;
        addLine(store, `You use ${item.name} and restore ${healed} HP.`, C.ITEM_COLOR);
      } else if (item.effect === 'buff_attack' && item.value) {
        player.buffAttack = item.value;
        player.buffRounds = hasSkill(player, 'buff_mastery') ? 5 : 3;
        const rounds = player.buffRounds;
        addLine(store, `You drink ${item.name}! +${item.value} Attack for ${rounds} rounds.`, C.COMBAT_COLOR);
      }
      refreshHeader();
      return true;
    }

    return false;
  };

  // Check if target matches armor in inventory
  if (armorData) {
    const armorIds = Object.keys(player.inventory).filter(id => armorData[id]);
    let armorMatches = findAllMatches(target, armorIds, armorData);
    if (armorMatches.length === 0 && singular) {
      armorMatches = findAllMatches(singular, armorIds, armorData);
    }
    if (armorMatches.length > 1) {
      resolveOrDisambiguate(store, armorMatches, armorData, 'armor do you want to equip');
      return;
    }
    if (armorMatches.length === 1) {
      player.equippedArmor = armorMatches[0];
      addLine(store, `You equip the ${armorData[armorMatches[0]].name}.`, C.ITEM_COLOR);
      emitSound(store, 'equip');
      return;
    }
  }

  // Check if target matches accessory in inventory
  if (accessoryData) {
    const accIds = Object.keys(player.inventory).filter(id => accessoryData[id]);
    let accMatches = findAllMatches(target, accIds, accessoryData);
    if (accMatches.length === 0 && singular) {
      accMatches = findAllMatches(singular, accIds, accessoryData);
    }
    if (accMatches.length > 1) {
      resolveOrDisambiguate(store, accMatches, accessoryData, 'accessory do you want to equip');
      return;
    }
    if (accMatches.length === 1) {
      player.equippedAccessory = accMatches[0];
      addLine(store, `You equip the ${accessoryData[accMatches[0]].name}.`, C.ITEM_COLOR);
      emitSound(store, 'equip');
      return;
    }
  }

  let weaponMatches = findAllMatches(target, ownedWeaponIds, weaponData);
  if (weaponMatches.length === 0 && singular) {
    weaponMatches = findAllMatches(singular, ownedWeaponIds, weaponData);
  }
  if (weaponMatches.length > 1) {
    if (singular) {
      // Plural intent — equip the last match (only one can be held at a time).
      // Earlier matches are still "swung through" via equip lines to show the
      // intent, but practically the final equip wins.
      weaponMatches.forEach(applyWeapon);
      return;
    }
    resolveOrDisambiguate(store, weaponMatches, weaponData, 'weapon do you want to equip');
    return;
  }
  if (weaponMatches.length === 1) {
    applyWeapon(weaponMatches[0]);
    return;
  }

  let itemMatches = findAllMatches(target, ownedItemIds, itemData);
  if (itemMatches.length === 0 && singular) {
    itemMatches = findAllMatches(singular, ownedItemIds, itemData);
  }
  if (itemMatches.length > 1) {
    if (singular) {
      for (const itemId of itemMatches) {
        applyItem(itemId);
        // A key item may have triggered an ending — bail so we don't print
        // over the ending screen.
        if (store.state !== 'exploring') return;
      }
      return;
    }
    resolveOrDisambiguate(store, itemMatches, itemData, 'item do you want to use');
    return;
  }
  if (itemMatches.length === 1) {
    if (applyItem(itemMatches[0])) return;
  }

  addLine(store, "You don't have that or can't use it.", C.ERROR_COLOR);
}
