import { describe, expect, it } from 'vitest';
import { createCombat, enemyDefeated, playerAttack, playerDefend, playerFlee, playerUseItem } from '../../src/engine/combat';
import { addItem, addWeapon, createPlayer, equipWeapon } from '../../src/engine/player';
import { createRng } from '../../src/engine/rng';
import type { ItemDef, WeaponDef } from '../../src/engine/types';

const itemData: Record<string, ItemDef> = {
  potion: { name: 'Potion', type: 'consumable', effect: 'heal', value: 25, description: 'heals' },
  strength_tonic: { name: 'Strength Tonic', type: 'consumable', effect: 'buff_attack', value: 3, description: 'buff' },
};

const weaponData: Record<string, WeaponDef> = {
  rusty_dagger: { name: 'Rusty Dagger', attack_bonus: 2, region: 'manor', description: 'dull' },
  iron_sword: { name: 'Iron Sword', attack_bonus: 5, region: 'manor', description: 'solid' },
};

const enemyData = {
  shadow_rat: {
    name: 'Shadow Rat',
    hp: 10,
    attack: 3,
    defense: 1,
    xp: 8,
    loot: ['potion'],
    region: 'manor',
    description: 'rat',
    is_boss: false,
  },
  cellar_shade: {
    name: 'Cellar Shade',
    hp: 35,
    attack: 7,
    defense: 3,
    xp: 30,
    loot: [],
    loot_weapon: 'iron_sword',
    region: 'manor',
    description: 'shade',
    is_boss: true,
  },
};

function seededRng(seed: number): () => number {
  return createRng(seed);
}

describe('createCombat', () => {
  it('builds CombatState from enemy data', () => {
    const player = createPlayer();
    const combat = createCombat(player, 'shadow_rat', enemyData);
    expect(combat.enemy.name).toBe('Shadow Rat');
    expect(combat.enemy.hp).toBe(10);
    expect(combat.enemy.isBoss).toBe(false);
    expect(combat.round).toBe(0);
    expect(combat.finished).toBe(false);
  });
});

describe('playerAttack', () => {
  it('damages the enemy and increments the round', () => {
    const player = createPlayer();
    addWeapon(player, 'rusty_dagger');
    equipWeapon(player, 'rusty_dagger');
    const combat = createCombat(player, 'shadow_rat', enemyData);

    const messages = playerAttack(combat, player, weaponData, itemData, seededRng(1));

    expect(combat.round).toBe(1);
    expect(combat.enemy.hp).toBeLessThan(10);
    expect(messages.some(message => message.text.includes('damage to Shadow Rat'))).toBe(true);
  });

  it('ends combat with a win when the enemy reaches zero hp', () => {
    const player = createPlayer();
    player.attack = 100;
    const combat = createCombat(player, 'shadow_rat', enemyData);

    playerAttack(combat, player, weaponData, itemData, seededRng(1));

    expect(combat.finished).toBe(true);
    expect(combat.playerWon).toBe(true);
    expect(combat.enemy.hp).toBe(0);
  });
});

describe('playerDefend', () => {
  it('sets defending before the enemy turn consumes it', () => {
    const player = createPlayer();
    const combat = createCombat(player, 'shadow_rat', enemyData);

    playerDefend(combat, player, itemData, seededRng(1));

    expect(combat.round).toBe(1);
    expect(player.defending).toBe(false);
    expect(player.hp).toBeLessThan(30);
  });
});

describe('playerFlee', () => {
  it('can flee successfully with a seeded roll', () => {
    const player = createPlayer();
    const combat = createCombat(player, 'shadow_rat', enemyData);

    const messages = playerFlee(combat, player, itemData, seededRng(5));

    expect(combat.fled).toBe(true);
    expect(combat.finished).toBe(true);
    expect(messages.some(message => message.text.includes('flee'))).toBe(true);
  });

  it('still processes a combat round with quick_feet enabled', () => {
    const player = createPlayer();
    player.skills.quick_feet = true;
    const combat = createCombat(player, 'shadow_rat', enemyData);

    playerFlee(combat, player, itemData, seededRng(1));

    expect(combat.round).toBe(1);
  });
});

describe('playerUseItem', () => {
  it('uses a healing potion and removes it from inventory', () => {
    const player = createPlayer();
    player.hp = 10;
    addItem(player, 'potion', itemData);
    const combat = createCombat(player, 'shadow_rat', enemyData);

    playerUseItem(combat, player, 'potion', itemData, seededRng(1));

    expect(player.hp).toBeGreaterThan(10);
    expect(player.inventory.potion).toBeUndefined();
  });

  it('rejects unknown items', () => {
    const player = createPlayer();
    const combat = createCombat(player, 'shadow_rat', enemyData);

    const messages = playerUseItem(combat, player, 'missing', itemData, seededRng(1));

    expect(messages[0]?.text).toBe('Unknown item.');
  });
});

describe('enemyDefeated', () => {
  it('returns xp, loot, and weapon results', () => {
    const player = createPlayer();
    const combat = createCombat(player, 'cellar_shade', enemyData);

    const results = enemyDefeated(combat, player);

    expect(results.leveled).toBe(true);
    expect(results.weapon).toBe('iron_sword');
    expect(results.loot).toEqual([]);
    expect(results.messages.some(message => message.text.includes('You gain 30 XP.'))).toBe(true);
  });
});
