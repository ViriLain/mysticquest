import { describe, expect, it } from 'vitest';
import {
  awardGold,
  buyItem,
  canAfford,
  chargeGold,
  createShopRuntime,
  priceOf,
  sellItem,
  sellValueOf,
  type ShopDef,
} from '../../src/engine/economy';
import { addItem, addWeapon, createPlayer, equipWeapon } from '../../src/engine/player';
import type { ItemDef, WeaponDef } from '../../src/engine/types';

const items: Record<string, ItemDef> = {
  potion: { name: 'Potion', type: 'consumable', effect: 'heal', value: 25, price: 12, description: 'heals' },
  iron_shield: { name: 'Iron Shield', type: 'shield', effect: 'defense', value: 3, price: 40, description: 'shield' },
  rusty_key: { name: 'Rusty Key', type: 'key', description: 'a key' },
};

const weapons: Record<string, WeaponDef> = {
  rusty_dagger: { name: 'Rusty Dagger', attack_bonus: 2, region: 'manor', price: 15, description: 'dull' },
  no_price: { name: 'No Price', attack_bonus: 1, region: 'manor', description: 'priceless' },
};

const dustyShop: ShopDef = {
  owner_npc: 'manor_merchant',
  name: 'Dusty Wares',
  buys: 'all',
  stock: [
    { id: 'potion', qty: 3 },
    { id: 'iron_shield', qty: 1 },
    { id: 'rusty_dagger', qty: 1, type: 'weapon' },
  ],
};

const consumablesOnlyShop: ShopDef = {
  owner_npc: 'foo',
  name: 'Foo',
  buys: 'consumables',
  stock: [],
};

describe('canAfford / chargeGold / awardGold', () => {
  it('canAfford true at exact price, false below', () => {
    const p = createPlayer();
    p.gold = 10;
    expect(canAfford(p, 10)).toBe(true);
    expect(canAfford(p, 11)).toBe(false);
  });

  it('chargeGold subtracts and floors at 0', () => {
    const p = createPlayer();
    p.gold = 5;
    chargeGold(p, 3);
    expect(p.gold).toBe(2);
    chargeGold(p, 100);
    expect(p.gold).toBe(0);
  });

  it('awardGold adds', () => {
    const p = createPlayer();
    awardGold(p, 7);
    expect(p.gold).toBe(7);
  });
});

describe('priceOf / sellValueOf', () => {
  it('returns price for items and weapons', () => {
    expect(priceOf('potion', 'item', items, weapons)).toBe(12);
    expect(priceOf('rusty_dagger', 'weapon', items, weapons)).toBe(15);
  });

  it('returns null for key items', () => {
    expect(priceOf('rusty_key', 'item', items, weapons)).toBe(null);
  });

  it('returns null for missing ids', () => {
    expect(priceOf('nope', 'item', items, weapons)).toBe(null);
    expect(priceOf('nope', 'weapon', items, weapons)).toBe(null);
  });

  it('returns null for items without a price', () => {
    expect(priceOf('no_price', 'weapon', items, weapons)).toBe(null);
  });

  it('sellValueOf floors at half', () => {
    expect(sellValueOf('potion', 'item', items, weapons)).toBe(6);
    expect(sellValueOf('rusty_dagger', 'weapon', items, weapons)).toBe(7);
  });
});

describe('buyItem', () => {
  it('happy path: gold debited, stock decremented, item added', () => {
    const p = createPlayer();
    p.gold = 50;
    const rt = createShopRuntime('dusty');
    const r = buyItem(p, dustyShop, rt, 0, items, weapons);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.itemId).toBe('potion');
      expect(r.price).toBe(12);
    }
    expect(p.gold).toBe(38);
    expect(p.inventory.potion).toBe(1);
    expect(rt.remainingStock['0']).toBe(2);
  });

  it('weapon purchase routes through addWeapon', () => {
    const p = createPlayer();
    p.gold = 50;
    const rt = createShopRuntime('dusty');
    const r = buyItem(p, dustyShop, rt, 2, items, weapons);
    expect(r.ok).toBe(true);
    expect(p.weapons).toContain('rusty_dagger');
    expect(p.gold).toBe(35);
  });

  it('insufficient gold returns error, no mutation', () => {
    const p = createPlayer();
    p.gold = 5;
    const rt = createShopRuntime('dusty');
    const r = buyItem(p, dustyShop, rt, 0, items, weapons);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('insufficient_gold');
      expect(r.needed).toBe(7);
    }
    expect(p.gold).toBe(5);
    expect(p.inventory.potion).toBeUndefined();
  });

  it('out of stock returns error', () => {
    const p = createPlayer();
    p.gold = 100;
    const rt = createShopRuntime('dusty');
    rt.remainingStock['0'] = 0;
    const r = buyItem(p, dustyShop, rt, 0, items, weapons);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('out_of_stock');
  });

  it('unknown entry index returns error', () => {
    const p = createPlayer();
    p.gold = 100;
    const rt = createShopRuntime('dusty');
    const r = buyItem(p, dustyShop, rt, 99, items, weapons);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unknown_item');
  });
});

describe('sellItem', () => {
  it('happy path: gold credited at half, item removed', () => {
    const p = createPlayer();
    addItem(p, 'potion', items);
    const r = sellItem(p, dustyShop, 'potion', 'item', items, weapons);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.price).toBe(6);
    expect(p.gold).toBe(6);
    expect(p.inventory.potion).toBeUndefined();
  });

  it('refuses key items', () => {
    const p = createPlayer();
    p.keyItems.rusty_key = true;
    const r = sellItem(p, dustyShop, 'rusty_key', 'item', items, weapons);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('key_item');
  });

  it('refuses items not owned', () => {
    const p = createPlayer();
    const r = sellItem(p, dustyShop, 'potion', 'item', items, weapons);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not_owned');
  });

  it('selling equipped weapon unequips it', () => {
    const p = createPlayer();
    addWeapon(p, 'rusty_dagger');
    equipWeapon(p, 'rusty_dagger');
    const r = sellItem(p, dustyShop, 'rusty_dagger', 'weapon', items, weapons);
    expect(r.ok).toBe(true);
    expect(p.weapons).not.toContain('rusty_dagger');
    expect(p.equippedWeapon).toBe(null);
    expect(p.gold).toBe(7);
  });

  it('selling equipped shield unequips it', () => {
    const p = createPlayer();
    addItem(p, 'iron_shield', items);
    p.equippedShield = 'iron_shield';
    const r = sellItem(p, dustyShop, 'iron_shield', 'item', items, weapons);
    expect(r.ok).toBe(true);
    expect(p.equippedShield).toBe(null);
    expect(p.gold).toBe(20);
  });

  it('consumables-only shop refuses weapons', () => {
    const p = createPlayer();
    addWeapon(p, 'rusty_dagger');
    const r = sellItem(p, consumablesOnlyShop, 'rusty_dagger', 'weapon', items, weapons);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('shop_refuses');
  });
});
