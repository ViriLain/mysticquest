import { getEffectiveStock, type ShopDef } from '../economy';
import { displayShop, handleShopCommand } from '../handlers/shop';
import type { ArmorDef, GameStore, ItemDef, NpcDef, WeaponDef } from '../types';

export interface ShopDeps {
  shops: Record<string, ShopDef>;
  itemData: Record<string, ItemDef>;
  weaponData: Record<string, WeaponDef>;
  npcData: Record<string, NpcDef>;
  armorData?: Record<string, ArmorDef>;
  refreshHeader: () => void;
}

export function enterShop(
  store: GameStore,
  shopId: string,
  deps: ShopDeps,
): void {
  const shop = deps.shops[shopId];
  if (!shop) return;
  store.state = 'shop';
  // Preserve npcDialogue so leaving the shop returns to the conversation
  store.shopState.activeShopId = shopId;
  if (!store.shopState.runtime[shopId]) {
    store.shopState.runtime[shopId] = { shopId, remainingStock: {} };
  }
  displayShop(store, shop, deps.itemData, deps.weaponData, deps.armorData);
}

export function handleShopInput(
  store: GameStore,
  verb: string,
  target: string,
  deps: ShopDeps,
): void {
  handleShopCommand(store, verb, target, deps.shops, deps.itemData, deps.weaponData, deps.npcData, deps.refreshHeader, deps.armorData);
}

export function getShopAutocompleteSuggestions(
  store: GameStore,
  input: string,
  deps: ShopDeps,
): string[] {
  const lower = input.toLowerCase();
  if (!lower) return [];
  const parts = lower.split(/\s+/);
  if (parts.length <= 1) {
    return ['buy', 'sell', 'examine', 'leave', 'look'].filter(verb => verb.startsWith(lower) && verb !== lower);
  }
  const verb = parts[0];
  const partial = parts.slice(1).join(' ');
  const candidates: string[] = [];

  if (!store.player || !store.shopState.activeShopId) return [];
  const shop = deps.shops[store.shopState.activeShopId];
  const runtime = store.shopState.runtime[store.shopState.activeShopId];
  if (!shop || !runtime) return [];

  if (verb === 'buy' || verb === 'examine') {
    const stock = getEffectiveStock(shop, runtime).filter(entry => entry.remaining > 0);
    for (const entry of stock) {
      const def = entry.entry.type === 'weapon'
        ? deps.weaponData[entry.entry.id]
        : entry.entry.type === 'armor'
          ? deps.armorData?.[entry.entry.id]
          : deps.itemData[entry.entry.id];
      if (def) candidates.push(def.name);
    }
  }
  if (verb === 'sell') {
    for (const id of Object.keys(store.player.inventory)) {
      const item = deps.itemData[id];
      if (item) candidates.push(item.name);
      const armor = deps.armorData?.[id];
      if (armor) candidates.push(armor.name);
    }
    for (const id of Object.keys(store.player.keyItems)) {
      const item = deps.itemData[id];
      if (item) candidates.push(item.name);
    }
    for (const id of store.player.weapons) {
      const weapon = deps.weaponData[id];
      if (weapon) candidates.push(weapon.name);
    }
  }

  if (!partial) return candidates;
  return candidates.filter(candidate => candidate.toLowerCase().startsWith(partial));
}
