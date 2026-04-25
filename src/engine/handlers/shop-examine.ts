import * as C from '../constants';
import { getEffectiveStock } from '../economy';
import { ICON, iconLine } from '../icons';
import { addLine } from '../output';
import type { ArmorDef, GameStore, ItemDef, WeaponDef } from '../types';
import { lookupStockDef, type ShopHandlerCtx, type StockEntryType } from './shop-display';

export function handleShopExamine(
  store: GameStore,
  target: string,
  ctx: ShopHandlerCtx,
): void {
  if (!store.player) return;
  if (!target) {
    addLine(store, 'Examine what?', C.ERROR_COLOR);
    return;
  }

  const { shop, runtime, itemData, weaponData, armorData } = ctx;
  const needle = target.toLowerCase();

  // Stock first — let players inspect items they don't own yet.
  const stock = getEffectiveStock(shop, runtime);
  for (const entry of stock) {
    const entryType = (entry.entry.type ?? 'item') as StockEntryType;
    const found = lookupStockDef(entry.entry.id, entryType, itemData, weaponData, armorData);
    if (!found) continue;
    const def = found.def as { name: string; description?: string; price?: number };
    if (!def.description) continue;
    if (def.name.toLowerCase().includes(needle) || entry.entry.id.toLowerCase().includes(needle)) {
      printStockExamination(store, def as { name: string; description: string; price?: number }, entryType, itemData, weaponData, armorData);
      return;
    }
  }

  // Then inventory.
  for (const itemId of Object.keys(store.player.inventory)) {
    const item = itemData[itemId];
    const armor = armorData[itemId];
    if (armor && armor.name.toLowerCase().includes(needle)) {
      printOwnedExamination(store, armor.name, armor.description, armor.price, ICON.shield);
      return;
    }
    if (item && item.name.toLowerCase().includes(needle)) {
      printOwnedExamination(store, item.name, item.description, item.price, ICON.item);
      return;
    }
  }
  for (const weaponId of store.player.weapons) {
    const weapon = weaponData[weaponId];
    if (weapon && weapon.name.toLowerCase().includes(needle)) {
      printOwnedExamination(store, weapon.name, weapon.description, weapon.price, ICON.weapon);
      return;
    }
  }

  addLine(store, "You don't see that here.", C.ERROR_COLOR);
}

function printStockExamination(
  store: GameStore,
  def: { name: string; description: string; price?: number },
  entryType: StockEntryType,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  armorData: Record<string, ArmorDef>,
): void {
  if (!store.player) return;
  addLine(store, '');
  const icon = entryType === 'weapon' ? ICON.weapon : ICON.item;
  addLine(store, iconLine(icon, `=== ${def.name} ===`), C.ITEM_COLOR);
  addLine(store, def.description, C.HELP_COLOR);
  const price = def.price ?? 0;
  addLine(store, `Price: ${price}g`, C.STAT_COLOR);

  // Comparison to equipped gear
  if (entryType === 'weapon') {
    const bonus = (def as unknown as WeaponDef).attack_bonus;
    const eqId = store.player.equippedWeapon;
    const eq = eqId ? weaponData[eqId] : null;
    const eqLabel = eq ? `${eq.name} (+${eq.attack_bonus} ATK)` : 'Fists';
    addLine(store, `  Your weapon: ${eqLabel} → This: +${bonus} ATK`, C.STAT_COLOR);
  } else if (entryType === 'armor') {
    const armorDef = def as unknown as ArmorDef;
    const eqId = store.player.equippedArmor;
    const eq = eqId ? armorData[eqId] : null;
    const eqLabel = eq ? `${eq.name} (+${eq.defense} DEF)` : '(none)';
    addLine(store, `  Your armor: ${eqLabel} → This: +${armorDef.defense} DEF`, C.STAT_COLOR);
  } else {
    const item = def as unknown as ItemDef;
    if (item.type === 'shield' && item.value) {
      const eqId = store.player.equippedShield;
      const eq = eqId ? itemData[eqId] : null;
      const eqLabel = eq ? `${eq.name} (+${eq.value} DEF)` : '(none)';
      addLine(store, `  Your shield: ${eqLabel} → This: +${item.value} DEF`, C.STAT_COLOR);
    } else if (item.effect === 'heal' && item.value) {
      addLine(store, `  Your HP: ${store.player.hp}/${store.player.maxHp}`, C.STAT_COLOR);
    }
  }
}

function printOwnedExamination(
  store: GameStore,
  name: string,
  description: string,
  price: number | undefined,
  icon: string,
): void {
  addLine(store, '');
  addLine(store, iconLine(icon, `=== ${name} ===`), C.ITEM_COLOR);
  addLine(store, description, C.HELP_COLOR);
  if (price) addLine(store, `Sell value: ${Math.floor(price / 2)}g`, C.STAT_COLOR);
}
