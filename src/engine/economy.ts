import { addItem, addWeapon, hasItem, removeItem } from './player';
import type { ItemDef, PlayerState, ShopRuntimeState, WeaponDef } from './types';

export interface ShopStockEntry {
  id: string;
  qty: number;
  type?: 'item' | 'weapon';
}

export interface ShopDef {
  owner_npc: string;
  name: string;
  stock: ShopStockEntry[];
  buys: 'all' | 'consumables' | 'weapons';
}

export type BuyResult =
  | { ok: true; itemId: string; type: 'item' | 'weapon'; price: number }
  | { ok: false; reason: 'insufficient_gold' | 'out_of_stock' | 'unknown_item'; needed?: number };

export type SellResult =
  | { ok: true; itemId: string; price: number }
  | { ok: false; reason: 'not_owned' | 'key_item' | 'shop_refuses' | 'unknown_item' };

export function canAfford(player: PlayerState, price: number): boolean {
  return player.gold >= price;
}

export function chargeGold(player: PlayerState, amount: number): void {
  player.gold = Math.max(0, player.gold - amount);
}

export function awardGold(player: PlayerState, amount: number): void {
  player.gold += amount;
}

export function priceOf(
  itemId: string,
  type: 'item' | 'weapon',
  items: Record<string, ItemDef>,
  weapons: Record<string, WeaponDef>,
): number | null {
  if (type === 'item') {
    const item = items[itemId];
    if (!item || item.type === 'key') return null;
    return item.price ?? null;
  }

  const weapon = weapons[itemId];
  if (!weapon) return null;
  return weapon.price ?? null;
}

export function sellValueOf(
  itemId: string,
  type: 'item' | 'weapon',
  items: Record<string, ItemDef>,
  weapons: Record<string, WeaponDef>,
): number | null {
  const price = priceOf(itemId, type, items, weapons);
  if (price === null) return null;
  return Math.floor(price / 2);
}

export function getEffectiveStock(
  shop: ShopDef,
  runtime: ShopRuntimeState,
): Array<{ entry: ShopStockEntry; index: number; remaining: number }> {
  return shop.stock.map((entry, index) => {
    const key = String(index);
    const remaining = runtime.remainingStock[key] ?? entry.qty;
    return { entry, index, remaining };
  });
}

export function createShopRuntime(shopId: string): ShopRuntimeState {
  return { shopId, remainingStock: {} };
}

export function buyItem(
  player: PlayerState,
  shop: ShopDef,
  runtime: ShopRuntimeState,
  entryIndex: number,
  items: Record<string, ItemDef>,
  weapons: Record<string, WeaponDef>,
): BuyResult {
  const entry = shop.stock[entryIndex];
  if (!entry) return { ok: false, reason: 'unknown_item' };

  const type = entry.type ?? 'item';
  const price = priceOf(entry.id, type, items, weapons);
  if (price === null) return { ok: false, reason: 'unknown_item' };

  const key = String(entryIndex);
  const remaining = runtime.remainingStock[key] ?? entry.qty;
  if (remaining <= 0) return { ok: false, reason: 'out_of_stock' };

  if (!canAfford(player, price)) {
    return { ok: false, reason: 'insufficient_gold', needed: price - player.gold };
  }

  chargeGold(player, price);
  runtime.remainingStock[key] = remaining - 1;

  if (type === 'weapon') {
    addWeapon(player, entry.id);
  } else {
    addItem(player, entry.id, items);
  }

  return { ok: true, itemId: entry.id, type, price };
}

export function sellItem(
  player: PlayerState,
  shop: ShopDef,
  itemId: string,
  type: 'item' | 'weapon',
  items: Record<string, ItemDef>,
  weapons: Record<string, WeaponDef>,
): SellResult {
  if (shop.buys === 'consumables' && type !== 'item') {
    return { ok: false, reason: 'shop_refuses' };
  }
  if (shop.buys === 'weapons' && type !== 'weapon') {
    return { ok: false, reason: 'shop_refuses' };
  }

  if (type === 'item') {
    const item = items[itemId];
    if (!item) return { ok: false, reason: 'unknown_item' };
    if (item.type === 'key') return { ok: false, reason: 'key_item' };
    if (!hasItem(player, itemId)) return { ok: false, reason: 'not_owned' };

    const price = sellValueOf(itemId, 'item', items, weapons);
    if (price === null) return { ok: false, reason: 'unknown_item' };

    removeItem(player, itemId);
    if (player.equippedShield === itemId) player.equippedShield = null;
    awardGold(player, price);
    return { ok: true, itemId, price };
  }

  if (!weapons[itemId]) return { ok: false, reason: 'unknown_item' };
  if (!player.weapons.includes(itemId)) return { ok: false, reason: 'not_owned' };

  const price = sellValueOf(itemId, 'weapon', items, weapons);
  if (price === null) return { ok: false, reason: 'unknown_item' };

  const index = player.weapons.indexOf(itemId);
  player.weapons.splice(index, 1);
  if (player.equippedWeapon === itemId) player.equippedWeapon = null;
  awardGold(player, price);
  return { ok: true, itemId, price };
}
