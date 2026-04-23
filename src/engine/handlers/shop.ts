import * as C from '../constants';
import { buyItem, getEffectiveStock, sellItem, type ShopDef } from '../economy';
import { ICON, iconLine } from '../icons';
import { findAllMatches, resolveOrDisambiguate, singularize, type Matchable } from '../matching';
import { addLine, emitSound } from '../output';
import { parseBatchCount } from '../state/exploring';
import { displayDialogueNode } from './talk';
import type { ArmorDef, GameStore, ItemDef, NpcDef, WeaponDef } from '../types';

import armorJson from '../../data/armor.json';
const staticArmorData = armorJson as Record<string, ArmorDef>;

interface ShopBuyMatchable extends Matchable {
  __entryIndex: number;
  __type: 'item' | 'weapon' | 'armor';
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
      const entryType = entry.entry.type ?? 'item';
      let def: { name: string; price?: number } | undefined;
      if (entryType === 'weapon') def = weaponData[entry.entry.id];
      else if (entryType === 'armor') def = allArmor[entry.entry.id];
      else def = itemData[entry.entry.id];
      if (!def) continue;
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
  npcData: Record<string, NpcDef>,
  refreshHeader: () => void,
  armorData?: Record<string, ArmorDef>,
): void {
  const allArmor = armorData ?? staticArmorData;
  if (!store.player || !store.shopState.activeShopId) return;
  const shopId = store.shopState.activeShopId;
  const shop = shops[shopId];
  const runtime = store.shopState.runtime[shopId];
  if (!shop || !runtime) return;

  if (verb === 'leave' || verb === 'exit' || verb === 'quit') {
    addLine(store, 'You leave the shop.', C.HELP_COLOR);
    store.shopState.activeShopId = null;
    store.shopMenuMode = null;
    store.shopMenuItems = [];
    store.shopMenuSelected = 0;
    // Return to NPC dialogue if the shop was opened from a conversation
    if (store.npcDialogue) {
      store.state = 'dialogue';
      displayDialogueNode(store, npcData);
    } else {
      store.state = 'exploring';
    }
    return;
  }

  if (verb === 'look') {
    displayShop(store, shop, itemData, weaponData, allArmor);
    return;
  }

  if (verb === 'buy') {
    if (!target) {
      // Open buy menu
      const stock = getEffectiveStock(shop, runtime).filter(entry => entry.remaining > 0);
      const items: typeof store.shopMenuItems = [];
      for (const entry of stock) {
        const entryType = entry.entry.type ?? 'item';
        let def: { name: string; price?: number } | undefined;
        if (entryType === 'weapon') def = weaponData[entry.entry.id];
        else if (entryType === 'armor') def = allArmor[entry.entry.id];
        else def = itemData[entry.entry.id];
        if (!def) continue;
        items.push({ label: def.name, id: entry.entry.id, index: entry.index });
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
      const entryType = (entry.entry.type ?? 'item') as 'item' | 'weapon' | 'armor';
      let def: { name: string; match_words?: string[] } | undefined;
      if (entryType === 'weapon') def = weaponData[entry.entry.id];
      else if (entryType === 'armor') def = allArmor[entry.entry.id];
      else def = itemData[entry.entry.id];
      if (!def) continue;
      const key = `__${entry.index}`;
      candidates[key] = {
        name: def.name,
        match_words: def.match_words,
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
      const result = buyItem(store.player, shop, runtime, matched.__entryIndex, itemData, weaponData, allArmor);
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

      let def: { name: string } | undefined;
      if (result.type === 'weapon') def = weaponData[result.itemId];
      else if (result.type === 'armor') def = allArmor[result.itemId];
      else def = itemData[result.itemId];
      const name = def?.name ?? result.itemId;
      addLine(store, iconLine(ICON.loot, `Bought ${name} for ${result.price}g.`), C.ITEM_COLOR);
      emitSound(store, 'pickup');
    }
    addLine(store, `Gold remaining: ${store.player.gold}g`, C.LOOT_COLOR);
    refreshHeader();
    return;
  }

  if (verb === 'sell') {
    if (!target) {
      // Open sell menu
      const items: typeof store.shopMenuItems = [];
      for (const [itemId, count] of Object.entries(store.player.inventory)) {
        const item = itemData[itemId];
        const armor = allArmor[itemId];
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
      return;
    }

    const ownedItemIds = [
      ...Object.keys(store.player.inventory),
      ...Object.keys(store.player.keyItems),
    ];
    const itemMatches = findAllMatches(target, ownedItemIds, itemData);
    const matchedItemId = resolveOrDisambiguate(store, itemMatches, itemData, 'item do you want to sell');
    if (matchedItemId) {
      // Confirm before selling equipped shield
      if (store.player.equippedShield === matchedItemId) {
        const name = itemData[matchedItemId]?.name ?? matchedItemId;
        addLine(store, `${name} is your equipped shield. Are you sure?`, C.COMBAT_COLOR);
        store.shopMenuMode = 'sell_confirm';
        store.shopMenuItems = [
          { label: 'Yes, sell it', id: matchedItemId, index: 0 },
          { label: 'No, keep it', id: '', index: 0 },
        ];
        store.shopMenuSelected = 1; // default to No
        store.shopSellConfirm = { id: matchedItemId, type: 'item' };
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
      // Confirm before selling equipped weapon
      if (store.player.equippedWeapon === matchedWeaponId) {
        const name = weaponData[matchedWeaponId]?.name ?? matchedWeaponId;
        addLine(store, `${name} is your equipped weapon. Are you sure?`, C.COMBAT_COLOR);
        store.shopMenuMode = 'sell_confirm';
        store.shopMenuItems = [
          { label: 'Yes, sell it', id: matchedWeaponId, index: 0 },
          { label: 'No, keep it', id: '', index: 0 },
        ];
        store.shopMenuSelected = 1; // default to No
        store.shopSellConfirm = { id: matchedWeaponId, type: 'weapon' };
        return;
      }
      const result = sellItem(store.player, shop, matchedWeaponId, 'weapon', itemData, weaponData);
      handleSellResult(store, result, weaponData[matchedWeaponId]?.name ?? matchedWeaponId);
      refreshHeader();
      return;
    }
    if (weaponMatches.length > 1) return;

    const armorIds = Object.keys(store.player.inventory).filter(id => allArmor[id]);
    const armorMatches = findAllMatches(target, armorIds, allArmor);
    const matchedArmorId = resolveOrDisambiguate(store, armorMatches, allArmor, 'armor do you want to sell');
    if (matchedArmorId) {
      if (store.player.equippedArmor === matchedArmorId) {
        const name = allArmor[matchedArmorId]?.name ?? matchedArmorId;
        addLine(store, `${name} is your equipped armor. Are you sure?`, C.COMBAT_COLOR);
        store.shopMenuMode = 'sell_confirm';
        store.shopMenuItems = [
          { label: 'Yes, sell it', id: matchedArmorId, index: 0 },
          { label: 'No, keep it', id: '', index: 0 },
        ];
        store.shopMenuSelected = 1;
        store.shopSellConfirm = { id: matchedArmorId, type: 'armor' };
        return;
      }
      const result = sellItem(store.player, shop, matchedArmorId, 'armor', itemData, weaponData, allArmor);
      handleSellResult(store, result, allArmor[matchedArmorId]?.name ?? matchedArmorId);
      refreshHeader();
      return;
    }
    if (armorMatches.length > 1) return;

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
      const entryType = entry.entry.type ?? 'item';
      let def: { name: string; description: string; price?: number } | undefined;
      if (entryType === 'weapon') def = weaponData[entry.entry.id];
      else if (entryType === 'armor') def = allArmor[entry.entry.id];
      else def = itemData[entry.entry.id];
      if (!def) continue;
      if (def.name.toLowerCase().includes(target.toLowerCase()) || entry.entry.id.toLowerCase().includes(target.toLowerCase())) {
        addLine(store, '');
        const icon = entryType === 'weapon' ? ICON.weapon : ICON.item;
        addLine(store, iconLine(icon, `=== ${def.name} ===`), C.ITEM_COLOR);
        addLine(store, def.description, C.HELP_COLOR);
        const price = def.price ?? 0;
        addLine(store, `Price: ${price}g`, C.STAT_COLOR);

        // Comparison to equipped gear
        if (entryType === 'weapon') {
          const bonus = (def as WeaponDef).attack_bonus;
          const eqId = store.player!.equippedWeapon;
          const eq = eqId ? weaponData[eqId] : null;
          const eqLabel = eq ? `${eq.name} (+${eq.attack_bonus} ATK)` : 'Fists';
          addLine(store, `  Your weapon: ${eqLabel} → This: +${bonus} ATK`, C.STAT_COLOR);
        } else if (entryType === 'armor') {
          const armorDef = def as ArmorDef;
          const eqId = store.player!.equippedArmor;
          const eq = eqId ? allArmor[eqId] : null;
          const eqLabel = eq ? `${eq.name} (+${eq.defense} DEF)` : '(none)';
          addLine(store, `  Your armor: ${eqLabel} → This: +${armorDef.defense} DEF`, C.STAT_COLOR);
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
      const armor = allArmor[itemId];
      if (armor && armor.name.toLowerCase().includes(target.toLowerCase())) {
        addLine(store, '');
        addLine(store, iconLine(ICON.shield, `=== ${armor.name} ===`), C.ITEM_COLOR);
        addLine(store, armor.description, C.HELP_COLOR);
        if (armor.price) addLine(store, `Sell value: ${Math.floor(armor.price / 2)}g`, C.STAT_COLOR);
        return;
      }
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
    addLine(store, `Gold remaining: ${store.player!.gold}g`, C.LOOT_COLOR);
    emitSound(store, 'save');
  } else {
    if (result.reason === 'key_item') addLine(store, "You can't sell that.", C.ERROR_COLOR);
    else if (result.reason === 'shop_refuses') addLine(store, "They won't take that.", C.ERROR_COLOR);
    else if (result.reason === 'not_owned') addLine(store, "You don't have that.", C.ERROR_COLOR);
    else addLine(store, "Can't sell that.", C.ERROR_COLOR);
    emitSound(store, 'error');
  }
}
