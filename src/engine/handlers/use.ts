import * as C from '../constants';
import { findAllMatches, resolveOrDisambiguate } from '../matching';
import { equipWeapon, hasItem, hasKeyItem, hasSkill, heal as playerHeal, removeItem } from '../player';
import { addLine, emitSound } from '../output';
import type { GameStore, ItemDef, WeaponDef } from '../types';

export function handleUse(
  store: GameStore,
  target: string,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  refreshHeader: () => void,
  checkEndingsForItem: (itemId: string) => void,
): void {
  if (!store.player || !store.world) return;
  if (!target) { addLine(store, 'Use what?', C.ERROR_COLOR); return; }

  const ownedWeaponIds = store.player.weapons;
  const ownedItemIds = [
    ...Object.keys(store.player.inventory),
    ...Object.keys(store.player.keyItems),
  ];

  const weaponMatches = findAllMatches(target, ownedWeaponIds, weaponData);
  if (weaponMatches.length > 1) {
    resolveOrDisambiguate(store, weaponMatches, weaponData, 'weapon do you want to equip');
    return;
  }
  if (weaponMatches.length === 1) {
    const weaponId = weaponMatches[0];
    equipWeapon(store.player, weaponId);
    addLine(store, `You equip the ${weaponData[weaponId].name}.`, C.ITEM_COLOR);
    emitSound(store, 'equip');
    refreshHeader();
    return;
  }

  const itemMatches = findAllMatches(target, ownedItemIds, itemData);
  if (itemMatches.length > 1) {
    resolveOrDisambiguate(store, itemMatches, itemData, 'item do you want to use');
    return;
  }
  if (itemMatches.length === 1) {
    const itemId = itemMatches[0];
    const item = itemData[itemId];

    if (item.type === 'shield' && hasItem(store.player, itemId)) {
      store.player.equippedShield = itemId;
      addLine(store, `You equip the ${item.name}.`, C.ITEM_COLOR);
      emitSound(store, 'equip');
      return;
    }

    if (item.type === 'key' && hasKeyItem(store.player, itemId)) {
      const roomId = store.player.currentRoom;
      if (!store.player.usedItemsInRoom[roomId]) store.player.usedItemsInRoom[roomId] = {};
      store.player.usedItemsInRoom[roomId][itemId] = true;
      addLine(store, `You use the ${item.name}.`, C.ITEM_COLOR);
      checkEndingsForItem(itemId);
      return;
    }

    if (item.type === 'consumable' && hasItem(store.player, itemId)) {
      removeItem(store.player, itemId);
      if (item.effect === 'heal' && item.value) {
        const healAmount = hasSkill(store.player, 'herbalism') ? Math.floor(item.value * 1.5) : item.value;
        const oldHp = store.player.hp;
        playerHeal(store.player, healAmount);
        const healed = store.player.hp - oldHp;
        addLine(store, `You use ${item.name} and restore ${healed} HP.`, C.ITEM_COLOR);
      } else if (item.effect === 'buff_attack' && item.value) {
        store.player.buffAttack = item.value;
        store.player.buffRounds = hasSkill(store.player, 'buff_mastery') ? 5 : 3;
        const rounds = store.player.buffRounds;
        addLine(store, `You drink ${item.name}! +${item.value} Attack for ${rounds} rounds.`, C.COMBAT_COLOR);
      }
      refreshHeader();
      return;
    }
  }

  addLine(store, "You don't have that or can't use it.", C.ERROR_COLOR);
}
