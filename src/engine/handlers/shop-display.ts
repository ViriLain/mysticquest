import * as C from '../constants';
import { getEffectiveStock, type ShopDef } from '../economy';
import { addLine } from '../output';
import type { ArmorDef, GameStore, ItemDef, ShopRuntimeState, WeaponDef } from '../types';

import armorJson from '../../data/armor.json';
const staticArmorData = armorJson as Record<string, ArmorDef>;

// What the dispatcher resolves once and passes to each shop handler.
export interface ShopHandlerCtx {
  shop: ShopDef;
  runtime: ShopRuntimeState;
  itemData: Record<string, ItemDef>;
  weaponData: Record<string, WeaponDef>;
  armorData: Record<string, ArmorDef>;
}

export type StockEntryType = 'item' | 'weapon' | 'armor';

// Minimal shape we need for stock-line rendering. Items/weapons/armor all have
// `name` + `price`; the rest of the fields the renderer needs are accessed via
// targeted casts at the call site (kept small for clarity).
export interface StockDef { name: string; price?: number }

export function lookupStockDef(
  id: string,
  type: StockEntryType,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  armorData: Record<string, ArmorDef>,
): { def: StockDef; type: StockEntryType } | null {
  if (type === 'weapon') {
    const def = weaponData[id];
    return def ? { def, type } : null;
  }
  if (type === 'armor') {
    const def = armorData[id];
    return def ? { def, type } : null;
  }
  const def = itemData[id];
  return def ? { def, type } : null;
}

export function displayShop(
  store: GameStore,
  shop: ShopDef,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  armorData?: Record<string, ArmorDef>,
): void {
  if (!store.player) return;
  const runtime = store.shopState.runtime[store.shopState.activeShopId!];
  if (!runtime) return;
  const allArmor = armorData ?? staticArmorData;

  addLine(store, '');
  addLine(store, `========== ${shop.name.toUpperCase()} ==========`, C.STAT_COLOR);
  addLine(store, `Your gold: ${store.player.gold}`, C.LOOT_COLOR);
  addLine(store, '');

  const stock = getEffectiveStock(shop, runtime).filter(entry => entry.remaining > 0);
  if (stock.length === 0) {
    addLine(store, '-- SOLD OUT --', C.HELP_COLOR);
  } else {
    addLine(store, '-- FOR SALE --', C.STAT_COLOR);
    for (const entry of stock) {
      const entryType = (entry.entry.type ?? 'item') as StockEntryType;
      const found = lookupStockDef(entry.entry.id, entryType, itemData, weaponData, allArmor);
      if (!found) continue;
      const { def } = found;
      const price = def.price ?? 0;
      let label = def.name;
      if (entryType === 'weapon') {
        label += ` (+${(def as WeaponDef).attack_bonus} ATK)`;
      } else if (entryType === 'armor') {
        label += ` (+${(def as ArmorDef).defense} DEF)`;
      } else {
        const item = def as ItemDef;
        if (item.effect === 'heal' && item.value) label += ` (+${item.value} HP)`;
        else if (item.effect === 'buff_attack' && item.value) label += ` (+${item.value} ATK, 3 rnd)`;
        else if (item.type === 'shield' && item.value) label += ` (+${item.value} DEF)`;
      }
      const namePadded = label.padEnd(28, '.');
      const affordable = store.player.gold >= price;
      const suffix = affordable ? '' : ` [need ${price - store.player.gold}g more]`;
      addLine(
        store,
        `  ${namePadded} ${String(price).padStart(4)}g  (${entry.remaining} left)${suffix}`,
        affordable ? C.HELP_COLOR : C.ERROR_COLOR,
      );
    }
  }

  addLine(store, '');
  addLine(store, 'Commands: buy <item>, sell <item>, examine <item>, leave', C.CHOICE_COLOR);
}
