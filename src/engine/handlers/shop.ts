// Thin verb dispatcher for the shop state. The implementation of each verb
// lives in a sibling file (shop-buy / shop-sell / shop-examine / shop-display)
// so each flow can be read and tested in isolation. Public exports
// (`displayShop`, `handleShopCommand`) are unchanged.

import * as C from '../constants';
import type { ShopDef } from '../economy';
import { addLine } from '../output';
import { displayDialogueNode } from './talk';
import type { ArmorDef, GameStore, ItemDef, NpcDef, WeaponDef } from '../types';

import armorJson from '../../data/armor.json';
import { displayShop, type ShopHandlerCtx } from './shop-display';
import { handleShopBuy } from './shop-buy';
import { handleShopSell } from './shop-sell';
import { handleShopExamine } from './shop-examine';

const staticArmorData = armorJson as Record<string, ArmorDef>;

export { displayShop };

export function handleShopCommand(
  store: GameStore,
  verb: string,
  target: string,
  shops: Record<string, ShopDef>,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  npcData: Record<string, NpcDef>,
  refreshHeader: () => void,
  armorData?: Record<string, ArmorDef>,
): void {
  if (!store.player || !store.shopState.activeShopId) return;
  const shopId = store.shopState.activeShopId;
  const shop = shops[shopId];
  const runtime = store.shopState.runtime[shopId];
  if (!shop || !runtime) return;

  const allArmor = armorData ?? staticArmorData;
  const ctx: ShopHandlerCtx = {
    shop,
    runtime,
    itemData,
    weaponData,
    armorData: allArmor,
  };

  if (verb === 'leave' || verb === 'exit' || verb === 'quit') {
    leaveShop(store, npcData);
    return;
  }
  if (verb === 'look') {
    displayShop(store, shop, itemData, weaponData, allArmor);
    return;
  }
  if (verb === 'buy') {
    handleShopBuy(store, target, ctx, refreshHeader);
    return;
  }
  if (verb === 'sell') {
    handleShopSell(store, target, ctx, refreshHeader);
    return;
  }
  if (verb === 'examine') {
    handleShopExamine(store, target, ctx);
    return;
  }

  addLine(store, 'In the shop: buy <item>, sell <item>, examine <item>, leave', C.CHOICE_COLOR);
}

function leaveShop(store: GameStore, npcData: Record<string, NpcDef>): void {
  addLine(store, 'You leave the shop.', C.HELP_COLOR);
  store.shopState.activeShopId = null;
  store.shopMenuMode = null;
  store.shopMenuItems = [];
  store.shopMenuSelected = 0;
  // Return to NPC dialogue if the shop was opened from a conversation.
  if (store.npcDialogue) {
    store.state = 'dialogue';
    displayDialogueNode(store, npcData);
  } else {
    store.state = 'exploring';
  }
}
