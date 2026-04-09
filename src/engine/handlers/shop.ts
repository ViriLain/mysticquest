import * as C from '../constants';
import { buyItem, getEffectiveStock, sellItem, type ShopDef } from '../economy';
import { ICON, iconLine } from '../icons';
import { findAllMatches, resolveOrDisambiguate, type Matchable } from '../matching';
import { addLine, emitSound } from '../output';
import { parseBatchCount } from '../state/exploring';
import type { GameStore, ItemDef, WeaponDef } from '../types';

interface ShopBuyMatchable extends Matchable {
  __entryIndex: number;
  __type: 'item' | 'weapon';
}

export function displayShop(
  store: GameStore,
  shop: ShopDef,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
): void {
  if (!store.player) return;
  const runtime = store.shopState.runtime[store.shopState.activeShopId!];
  if (!runtime) return;

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
      const isWeapon = entry.entry.type === 'weapon';
      const def = isWeapon ? weaponData[entry.entry.id] : itemData[entry.entry.id];
      if (!def) continue;
      const price = isWeapon
        ? (weaponData[entry.entry.id]?.price ?? 0)
        : (itemData[entry.entry.id]?.price ?? 0);
      let label = def.name;
      if (isWeapon) {
        label += ` (+${(def as WeaponDef).attack_bonus} ATK)`;
      } else {
        const item = def as ItemDef;
        if (item.effect === 'heal' && item.value) label += ` (+${item.value} HP)`;
        else if (item.effect === 'buff_attack' && item.value) label += ` (+${item.value} ATK, 3 rnd)`;
        else if (item.type === 'shield' && item.value) label += ` (+${item.value} DEF)`;
      }
      const namePadded = label.padEnd(28, '.');
      const affordable = store.player!.gold >= price;
      const suffix = affordable ? '' : ` [need ${price - store.player!.gold}g more]`;
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

export function handleShopCommand(
  store: GameStore,
  verb: string,
  target: string,
  shops: Record<string, ShopDef>,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  refreshHeader: () => void,
): void {
  if (!store.player || !store.shopState.activeShopId) return;
  const shopId = store.shopState.activeShopId;
  const shop = shops[shopId];
  const runtime = store.shopState.runtime[shopId];
  if (!shop || !runtime) return;

  if (verb === 'leave' || verb === 'exit' || verb === 'quit') {
    addLine(store, 'You leave the shop.', C.HELP_COLOR);
    store.shopState.activeShopId = null;
    store.state = 'exploring';
    return;
  }

  if (verb === 'look') {
    displayShop(store, shop, itemData, weaponData);
    return;
  }

  if (verb === 'buy') {
    if (!target) {
      addLine(store, 'Buy what?', C.ERROR_COLOR);
      return;
    }

    const [itemName, count] = parseBatchCount(target);

    const stock = getEffectiveStock(shop, runtime).filter(entry => entry.remaining > 0);
    const candidates: Record<string, ShopBuyMatchable> = {};
    const candidateIds: string[] = [];
    for (const entry of stock) {
      const isWeapon = entry.entry.type === 'weapon';
      const def = isWeapon ? weaponData[entry.entry.id] : itemData[entry.entry.id];
      if (!def) continue;
      const key = `__${entry.index}`;
      candidates[key] = {
        name: def.name,
        match_words: def.match_words,
        __entryIndex: entry.index,
        __type: isWeapon ? 'weapon' : 'item',
      };
      candidateIds.push(key);
    }

    const matches = findAllMatches(itemName, candidateIds, candidates);
    const matchedId = resolveOrDisambiguate(store, matches, candidates, 'item do you want to buy');
    if (!matchedId) {
      if (matches.length === 0) {
        addLine(store, 'Not in stock.', C.ERROR_COLOR);
      }
      return;
    }

    const matched = candidates[matchedId];
    for (let i = 0; i < count; i++) {
      const result = buyItem(store.player, shop, runtime, matched.__entryIndex, itemData, weaponData);
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

      const def = result.type === 'weapon' ? weaponData[result.itemId] : itemData[result.itemId];
      const name = def?.name ?? result.itemId;
      addLine(store, iconLine(ICON.loot, `Bought ${name} for ${result.price}g.`), C.ITEM_COLOR);
      emitSound(store, 'pickup');
    }
    refreshHeader();
    return;
  }

  if (verb === 'sell') {
    if (!target) {
      addLine(store, 'Sell what?', C.ERROR_COLOR);
      return;
    }

    const ownedItemIds = [
      ...Object.keys(store.player.inventory),
      ...Object.keys(store.player.keyItems),
    ];
    const itemMatches = findAllMatches(target, ownedItemIds, itemData);
    const matchedItemId = resolveOrDisambiguate(store, itemMatches, itemData, 'item do you want to sell');
    if (matchedItemId) {
      const wasEquippedShield = store.player.equippedShield === matchedItemId;
      const result = sellItem(store.player, shop, matchedItemId, 'item', itemData, weaponData);
      handleSellResult(store, result, itemData[matchedItemId]?.name ?? matchedItemId);
      if (result.ok && wasEquippedShield) {
        addLine(store, 'Warning: you sold your equipped shield!', C.COMBAT_COLOR);
      }
      refreshHeader();
      return;
    }
    if (itemMatches.length > 1) return;

    const weaponMatches = findAllMatches(target, store.player.weapons, weaponData);
    const matchedWeaponId = resolveOrDisambiguate(store, weaponMatches, weaponData, 'weapon do you want to sell');
    if (matchedWeaponId) {
      const wasEquippedWeapon = store.player.equippedWeapon === matchedWeaponId;
      const result = sellItem(store.player, shop, matchedWeaponId, 'weapon', itemData, weaponData);
      handleSellResult(store, result, weaponData[matchedWeaponId]?.name ?? matchedWeaponId);
      if (result.ok && wasEquippedWeapon) {
        addLine(store, "Warning: you sold your equipped weapon! You're now fighting bare-handed.", C.COMBAT_COLOR);
      }
      refreshHeader();
      return;
    }
    if (weaponMatches.length > 1) return;

    addLine(store, "You don't have that.", C.ERROR_COLOR);
    return;
  }

  if (verb === 'examine') {
    if (!target) {
      addLine(store, 'Examine what?', C.ERROR_COLOR);
      return;
    }

    const stock = getEffectiveStock(shop, runtime);
    for (const entry of stock) {
      const isWeapon = entry.entry.type === 'weapon';
      const def = isWeapon ? weaponData[entry.entry.id] : itemData[entry.entry.id];
      if (!def) continue;
      if (def.name.toLowerCase().includes(target.toLowerCase()) || entry.entry.id.toLowerCase().includes(target.toLowerCase())) {
        addLine(store, '');
        addLine(store, iconLine(isWeapon ? ICON.weapon : ICON.item, `=== ${def.name} ===`), C.ITEM_COLOR);
        addLine(store, def.description, C.HELP_COLOR);
        const price = isWeapon
          ? (weaponData[entry.entry.id]?.price ?? 0)
          : (itemData[entry.entry.id]?.price ?? 0);
        addLine(store, `Price: ${price}g`, C.STAT_COLOR);

        // Comparison to equipped gear
        if (isWeapon) {
          const bonus = (def as WeaponDef).attack_bonus;
          const eqId = store.player!.equippedWeapon;
          const eq = eqId ? weaponData[eqId] : null;
          const eqLabel = eq ? `${eq.name} (+${eq.attack_bonus} ATK)` : 'Fists';
          addLine(store, `  Your weapon: ${eqLabel} → This: +${bonus} ATK`, C.STAT_COLOR);
        } else {
          const item = def as ItemDef;
          if (item.type === 'shield' && item.value) {
            const eqId = store.player!.equippedShield;
            const eq = eqId ? itemData[eqId] : null;
            const eqLabel = eq ? `${eq.name} (+${eq.value} DEF)` : '(none)';
            addLine(store, `  Your shield: ${eqLabel} → This: +${item.value} DEF`, C.STAT_COLOR);
          } else if (item.effect === 'heal' && item.value) {
            addLine(store, `  Your HP: ${store.player!.hp}/${store.player!.maxHp}`, C.STAT_COLOR);
          }
        }
        return;
      }
    }

    for (const itemId of Object.keys(store.player.inventory)) {
      const item = itemData[itemId];
      if (item && item.name.toLowerCase().includes(target.toLowerCase())) {
        addLine(store, '');
        addLine(store, iconLine(ICON.item, `=== ${item.name} ===`), C.ITEM_COLOR);
        addLine(store, item.description, C.HELP_COLOR);
        if (item.price) addLine(store, `Sell value: ${Math.floor(item.price / 2)}g`, C.STAT_COLOR);
        return;
      }
    }
    for (const weaponId of store.player.weapons) {
      const weapon = weaponData[weaponId];
      if (weapon && weapon.name.toLowerCase().includes(target.toLowerCase())) {
        addLine(store, '');
        addLine(store, iconLine(ICON.weapon, `=== ${weapon.name} ===`), C.ITEM_COLOR);
        addLine(store, weapon.description, C.HELP_COLOR);
        if (weapon.price) addLine(store, `Sell value: ${Math.floor(weapon.price / 2)}g`, C.STAT_COLOR);
        return;
      }
    }

    addLine(store, "You don't see that here.", C.ERROR_COLOR);
    return;
  }

  addLine(store, 'In the shop: buy <item>, sell <item>, examine <item>, leave', C.CHOICE_COLOR);
}

function handleSellResult(store: GameStore, result: ReturnType<typeof sellItem>, name: string): void {
  if (result.ok) {
    addLine(store, iconLine(ICON.loot, `Sold ${name} for ${result.price}g.`), C.ITEM_COLOR);
    emitSound(store, 'save');
  } else {
    if (result.reason === 'key_item') addLine(store, "You can't sell that.", C.ERROR_COLOR);
    else if (result.reason === 'shop_refuses') addLine(store, "They won't take that.", C.ERROR_COLOR);
    else if (result.reason === 'not_owned') addLine(store, "You don't have that.", C.ERROR_COLOR);
    else addLine(store, "Can't sell that.", C.ERROR_COLOR);
    emitSound(store, 'error');
  }
}
