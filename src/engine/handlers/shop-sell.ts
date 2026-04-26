import * as C from '../constants';
import { sellItem } from '../economy';
import { ICON, iconLine } from '../icons';
import { findAllMatches, resolveOrDisambiguate } from '../matching';
import { addLine, emitSound } from '../output';
import type { ReadyStore } from '../types';
import type { ShopHandlerCtx } from './shop-display';

export function handleShopSell(
  store: ReadyStore,
  target: string,
  ctx: ShopHandlerCtx,
  refreshHeader: () => void,
): void {
  const { shop, itemData, weaponData, armorData } = ctx;

  if (!target) {
    openSellMenu(store, ctx);
    return;
  }

  const ownedItemIds = [
    ...Object.keys(store.player.inventory),
    ...Object.keys(store.player.keyItems),
  ];
  const itemMatches = findAllMatches(target, ownedItemIds, itemData);
  const matchedItemId = resolveOrDisambiguate(store, itemMatches, itemData, 'item do you want to sell');
  if (matchedItemId) {
    if (store.player.equippedShield === matchedItemId) {
      const name = itemData[matchedItemId]?.name ?? matchedItemId;
      addLine(store, `${name} is your equipped shield. Are you sure?`, C.COMBAT_COLOR);
      promptSellConfirm(store, matchedItemId, 'item');
      return;
    }
    const result = sellItem(store.player, shop, matchedItemId, 'item', itemData, weaponData);
    handleSellResult(store, result, itemData[matchedItemId]?.name ?? matchedItemId);
    refreshHeader();
    return;
  }
  if (itemMatches.length > 1) return;

  const weaponMatches = findAllMatches(target, store.player.weapons, weaponData);
  const matchedWeaponId = resolveOrDisambiguate(store, weaponMatches, weaponData, 'weapon do you want to sell');
  if (matchedWeaponId) {
    if (store.player.equippedWeapon === matchedWeaponId) {
      const name = weaponData[matchedWeaponId]?.name ?? matchedWeaponId;
      addLine(store, `${name} is your equipped weapon. Are you sure?`, C.COMBAT_COLOR);
      promptSellConfirm(store, matchedWeaponId, 'weapon');
      return;
    }
    const result = sellItem(store.player, shop, matchedWeaponId, 'weapon', itemData, weaponData);
    handleSellResult(store, result, weaponData[matchedWeaponId]?.name ?? matchedWeaponId);
    refreshHeader();
    return;
  }
  if (weaponMatches.length > 1) return;

  const armorIds = Object.keys(store.player.inventory).filter(id => armorData[id]);
  const armorMatches = findAllMatches(target, armorIds, armorData);
  const matchedArmorId = resolveOrDisambiguate(store, armorMatches, armorData, 'armor do you want to sell');
  if (matchedArmorId) {
    if (store.player.equippedArmor === matchedArmorId) {
      const name = armorData[matchedArmorId]?.name ?? matchedArmorId;
      addLine(store, `${name} is your equipped armor. Are you sure?`, C.COMBAT_COLOR);
      promptSellConfirm(store, matchedArmorId, 'armor');
      return;
    }
    const result = sellItem(store.player, shop, matchedArmorId, 'armor', itemData, weaponData, armorData);
    handleSellResult(store, result, armorData[matchedArmorId]?.name ?? matchedArmorId);
    refreshHeader();
    return;
  }
  if (armorMatches.length > 1) return;

  addLine(store, "You don't have that.", C.ERROR_COLOR);
}

function openSellMenu(store: ReadyStore, ctx: ShopHandlerCtx): void {
  const { itemData, weaponData, armorData } = ctx;

  const items: typeof store.shopMenuItems = [];
  for (const [itemId, count] of Object.entries(store.player.inventory)) {
    const item = itemData[itemId];
    const armor = armorData[itemId];
    if (!item && !armor) continue;
    if (item?.type === 'key') continue;
    const sv = item?.price ? Math.floor(item.price / 2) : armor?.price ? Math.floor(armor.price / 2) : 0;
    if (sv <= 0) continue;
    const name = item?.name ?? armor!.name;
    const eq = store.player.equippedArmor === itemId ? ' [equipped]' : '';
    const label = count > 1 ? `${name} x${count} (${sv}g each)${eq}` : `${name} (${sv}g)${eq}`;
    items.push({ label, id: itemId, index: 0 });
  }
  for (const weaponId of store.player.weapons) {
    const weapon = weaponData[weaponId];
    if (!weapon || !weapon.price) continue;
    const sv = Math.floor(weapon.price / 2);
    const eq = store.player.equippedWeapon === weaponId ? ' [equipped]' : '';
    items.push({ label: `${weapon.name} (${sv}g)${eq}`, id: weaponId, index: 0 });
  }
  if (items.length === 0) {
    addLine(store, "You don't have anything to sell.", C.HELP_COLOR);
  } else {
    store.shopMenuMode = 'sell';
    store.shopMenuItems = items;
    store.shopMenuSelected = 0;
  }
}

function promptSellConfirm(store: ReadyStore, id: string, type: 'item' | 'weapon' | 'armor'): void {
  store.shopMenuMode = 'sell_confirm';
  store.shopMenuItems = [
    { label: 'Yes, sell it', id, index: 0 },
    { label: 'No, keep it', id: '', index: 0 },
  ];
  store.shopMenuSelected = 1; // default to No
  store.shopSellConfirm = { id, type };
}

function handleSellResult(store: ReadyStore, result: ReturnType<typeof sellItem>, name: string): void {
  if (result.ok) {
    addLine(store, iconLine(ICON.loot, `Sold ${name} for ${result.price}g.`), C.ITEM_COLOR);
    addLine(store, `Gold remaining: ${store.player.gold}g`, C.LOOT_COLOR);
    emitSound(store, 'save');
  } else {
    if (result.reason === 'key_item') addLine(store, "You can't sell that.", C.ERROR_COLOR);
    else if (result.reason === 'shop_refuses') addLine(store, "They won't take that.", C.ERROR_COLOR);
    else if (result.reason === 'not_owned') addLine(store, "You don't have that.", C.ERROR_COLOR);
    else addLine(store, "Can't sell that.", C.ERROR_COLOR);
    emitSound(store, 'error');
  }
}
