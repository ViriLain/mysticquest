import { describe, expect, it } from 'vitest';
import {
  addItem,
  addWeapon,
  addXp,
  createPlayer,
  equipWeapon,
  hasItem,
  hasKeyItem,
  hasSkill,
  heal,
  isDead,
  removeItem,
  takeDamage,
  totalAttack,
  totalDefense,
  visitRoom,
  visitedCount,
  xpToNextLevel,
} from '../../src/engine/player';
import type { ItemDef } from '../../src/engine/types';

const itemData: Record<string, ItemDef> = {
  potion: { name: 'Potion', type: 'consumable', effect: 'heal', value: 25, description: 'heals' },
  rusty_key: { name: 'Rusty Key', type: 'key', description: 'a key' },
  iron_shield: { name: 'Iron Shield', type: 'shield', effect: 'defense', value: 3, description: 'shield' },
};

describe('createPlayer', () => {
  it('starts with default stats', () => {
    const p = createPlayer();
    expect(p.hp).toBe(30);
    expect(p.maxHp).toBe(30);
    expect(p.attack).toBe(5);
    expect(p.defense).toBe(2);
    expect(p.level).toBe(1);
    expect(p.xp).toBe(0);
    expect(p.gold).toBe(0);
    expect(p.currentRoom).toBe('manor_entry');
    expect(p.skillPoints).toBe(0);
  });

  it('accepts a custom starting room', () => {
    const p = createPlayer('dng_f1_r1');
    expect(p.currentRoom).toBe('dng_f1_r1');
  });
});

describe('addItem / removeItem / hasItem', () => {
  it('adds non-key items to inventory with stack counts', () => {
    const p = createPlayer();
    addItem(p, 'potion', itemData);
    addItem(p, 'potion', itemData);
    expect(p.inventory.potion).toBe(2);
    expect(hasItem(p, 'potion')).toBe(true);
  });

  it('stores key items separately from inventory', () => {
    const p = createPlayer();
    addItem(p, 'rusty_key', itemData);
    expect(p.keyItems.rusty_key).toBe(true);
    expect(p.inventory.rusty_key).toBeUndefined();
    expect(hasKeyItem(p, 'rusty_key')).toBe(true);
    expect(hasItem(p, 'rusty_key')).toBe(false);
  });

  it('decrements and removes inventory entries when the count hits zero', () => {
    const p = createPlayer();
    addItem(p, 'potion', itemData);
    addItem(p, 'potion', itemData);
    removeItem(p, 'potion');
    expect(p.inventory.potion).toBe(1);
    removeItem(p, 'potion');
    expect(p.inventory.potion).toBeUndefined();
  });
});

describe('xp and level progression', () => {
  it('scales xp needed by current level', () => {
    const p = createPlayer();
    expect(xpToNextLevel(p)).toBe(25);
    p.level = 5;
    expect(xpToNextLevel(p)).toBe(125);
  });

  it('levels up and awards stats when the threshold is met', () => {
    const p = createPlayer();
    const leveled = addXp(p, 25);
    expect(leveled).toBe(true);
    expect(p.level).toBe(2);
    expect(p.maxHp).toBe(38);
    expect(p.attack).toBe(7);
    expect(p.defense).toBe(3);
    expect(p.skillPoints).toBe(1);
  });

  it('caps progression at level 15', () => {
    const p = createPlayer();
    addXp(p, 100000);
    expect(p.level).toBe(15);
  });

  it('applies the enlightened xp bonus', () => {
    const p = createPlayer();
    p.skills.enlightened = true;
    addXp(p, 10);
    expect(p.xp).toBe(15);
  });
});

describe('derived combat stats', () => {
  it('adds buffAttack to totalAttack', () => {
    const p = createPlayer();
    p.buffAttack = 3;
    expect(totalAttack(p)).toBe(8);
  });

  it('adds an equipped shield to totalDefense', () => {
    const p = createPlayer();
    p.equippedShield = 'iron_shield';
    expect(totalDefense(p, itemData)).toBe(5);
  });
});

describe('weapons', () => {
  it('does not duplicate owned weapons', () => {
    const p = createPlayer();
    addWeapon(p, 'rusty_dagger');
    addWeapon(p, 'rusty_dagger');
    expect(p.weapons).toEqual(['rusty_dagger']);
  });

  it('equips only owned weapons', () => {
    const p = createPlayer();
    expect(equipWeapon(p, 'rusty_dagger')).toBe(false);
    addWeapon(p, 'rusty_dagger');
    expect(equipWeapon(p, 'rusty_dagger')).toBe(true);
    expect(p.equippedWeapon).toBe('rusty_dagger');
  });
});

describe('hp and death handling', () => {
  it('caps healing at max hp', () => {
    const p = createPlayer();
    p.hp = 10;
    heal(p, 100);
    expect(p.hp).toBe(30);
  });

  it('halves defended damage and clears defending', () => {
    const p = createPlayer();
    p.defending = true;
    const dealt = takeDamage(p, 10);
    expect(dealt).toBe(5);
    expect(p.hp).toBe(25);
    expect(p.defending).toBe(false);
  });

  it('reports death when hp is zero or below', () => {
    const p = createPlayer();
    expect(isDead(p)).toBe(false);
    p.hp = 0;
    expect(isDead(p)).toBe(true);
  });
});

describe('exploration metadata', () => {
  it('counts unique visited rooms', () => {
    const p = createPlayer();
    visitRoom(p, 'manor_entry');
    visitRoom(p, 'manor_entry');
    visitRoom(p, 'manor_main_hall');
    expect(visitedCount(p)).toBe(2);
  });

  it('checks learned skills by id', () => {
    const p = createPlayer();
    expect(hasSkill(p, 'iron_will')).toBe(false);
    p.skills.iron_will = true;
    expect(hasSkill(p, 'iron_will')).toBe(true);
  });
});
