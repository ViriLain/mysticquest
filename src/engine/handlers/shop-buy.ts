import * as C from '../constants';
import { buyItem, getEffectiveStock } from '../economy';
import { ICON, iconLine } from '../icons';
import { findAllMatches, resolveOrDisambiguate, singularize, type Matchable } from '../matching';
import { addLine, emitSound } from '../output';
import { parseBatchCount } from '../state/exploring';
import type { GameStore } from '../types';
import { lookupStockDef, type ShopHandlerCtx, type StockEntryType } from './shop-display';

interface ShopBuyMatchable extends Matchable {
  __entryIndex: number;
  __type: StockEntryType;
}

export function handleShopBuy(
  store: GameStore,
  target: string,
  ctx: ShopHandlerCtx,
  refreshHeader: () => void,
): void {
  if (!store.player) return;
  const { shop, runtime, itemData, weaponData, armorData } = ctx;

  if (!target) {
    // Open buy menu
    const stock = getEffectiveStock(shop, runtime).filter(entry => entry.remaining > 0);
    const items: typeof store.shopMenuItems = [];
    for (const entry of stock) {
      const entryType = (entry.entry.type ?? 'item') as StockEntryType;
      const found = lookupStockDef(entry.entry.id, entryType, itemData, weaponData, armorData);
      if (!found) continue;
      items.push({ label: found.def.name, id: entry.entry.id, index: entry.index });
    }
    if (items.length === 0) {
      addLine(store, '-- SOLD OUT --', C.HELP_COLOR);
    } else {
      store.shopMenuMode = 'buy';
      store.shopMenuItems = items;
      store.shopMenuSelected = 0;
    }
    return;
  }

  const [itemName, count] = parseBatchCount(target);

  const stock = getEffectiveStock(shop, runtime).filter(entry => entry.remaining > 0);
  const candidates: Record<string, ShopBuyMatchable> = {};
  const candidateIds: string[] = [];
  for (const entry of stock) {
    const entryType = (entry.entry.type ?? 'item') as StockEntryType;
    const found = lookupStockDef(entry.entry.id, entryType, itemData, weaponData, armorData);
    if (!found) continue;
    const key = `__${entry.index}`;
    candidates[key] = {
      name: found.def.name,
      match_words: 'match_words' in found.def ? (found.def as { match_words?: string[] }).match_words : undefined,
      __entryIndex: entry.index,
      __type: entryType,
    };
    candidateIds.push(key);
  }

  let matches = findAllMatches(itemName, candidateIds, candidates);
  if (matches.length === 0) {
    const singular = singularize(itemName);
    if (singular) matches = findAllMatches(singular, candidateIds, candidates);
  }
  const matchedId = resolveOrDisambiguate(store, matches, candidates, 'item do you want to buy');
  if (!matchedId) {
    if (matches.length === 0) {
      addLine(store, 'Not in stock.', C.ERROR_COLOR);
    }
    return;
  }

  const matched = candidates[matchedId];
  for (let i = 0; i < count; i++) {
    const result = buyItem(store.player, shop, runtime, matched.__entryIndex, itemData, weaponData, armorData);
    if (!result.ok) {
      if (i > 0) break; // partial buy succeeded, stop silently
      if (result.reason === 'insufficient_gold') {
        addLine(store, `You need ${result.needed} more gold.`, C.ERROR_COLOR);
      } else if (result.reason === 'out_of_stock') {
        addLine(store, "That's sold out.", C.ERROR_COLOR);
      } else {
        addLine(store, "You can't buy that.", C.ERROR_COLOR);
      }
      emitSound(store, 'error');
      return;
    }

    const found = lookupStockDef(result.itemId, result.type, itemData, weaponData, armorData);
    const name = found?.def.name ?? result.itemId;
    addLine(store, iconLine(ICON.loot, `Bought ${name} for ${result.price}g.`), C.ITEM_COLOR);
    emitSound(store, 'pickup');
  }
  addLine(store, `Gold remaining: ${store.player.gold}g`, C.LOOT_COLOR);
  refreshHeader();
}
