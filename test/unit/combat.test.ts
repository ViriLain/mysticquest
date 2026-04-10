import { describe, expect, it } from 'vitest';
import { createCombat, enemyDefeated, playerAttack, playerDefend, playerFlee, playerUseItem, tickStatusEffects, applyStatusEffect } from '../../src/engine/combat';
import { addItem, addWeapon, createPlayer, equipWeapon } from '../../src/engine/player';
import { createRng } from '../../src/engine/rng';
import type { ItemDef, StatusEffect, WeaponDef } from '../../src/engine/types';

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

describe('tickStatusEffects', () => {
  it('deals poison damage and decrements remaining', () => {
    const effects: StatusEffect[] = [
      { type: 'poison', damage: 2, remaining: 3, baseDamage: 2 },
    ];
    const result = tickStatusEffects(effects);
    expect(result.damage).toBe(2);
    expect(effects[0].remaining).toBe(2);
    expect(result.stunned).toBe(false);
  });

  it('deals burn damage independently of poison', () => {
    const effects: StatusEffect[] = [
      { type: 'poison', damage: 2, remaining: 2, baseDamage: 2 },
      { type: 'burn', damage: 3, remaining: 1, baseDamage: 3 },
    ];
    const result = tickStatusEffects(effects);
    expect(result.damage).toBe(5);
  });

  it('removes effects when remaining reaches 0', () => {
    const effects: StatusEffect[] = [
      { type: 'burn', damage: 3, remaining: 1, baseDamage: 3 },
    ];
    tickStatusEffects(effects);
    expect(effects).toHaveLength(0);
  });

  it('reports stunned from stun effect', () => {
    const effects: StatusEffect[] = [
      { type: 'stun', damage: 0, remaining: 1, baseDamage: 0 },
    ];
    const result = tickStatusEffects(effects);
    expect(result.stunned).toBe(true);
    expect(effects).toHaveLength(0);
  });
});

describe('applyStatusEffect', () => {
  it('adds a new effect to an empty list', () => {
    const effects: StatusEffect[] = [];
    applyStatusEffect(effects, { type: 'poison', damage: 2, remaining: 3, baseDamage: 2 });
    expect(effects).toHaveLength(1);
    expect(effects[0]).toEqual({ type: 'poison', damage: 2, remaining: 3, baseDamage: 2 });
  });

  it('refreshes duration on same-type effect without stacking damage', () => {
    const effects: StatusEffect[] = [
      { type: 'poison', damage: 2, remaining: 1, baseDamage: 2 },
    ];
    applyStatusEffect(effects, { type: 'poison', damage: 2, remaining: 3, baseDamage: 2 });
    expect(effects).toHaveLength(1);
    expect(effects[0].remaining).toBe(3);
    expect(effects[0].damage).toBe(2);
  });

  it('allows different types to coexist', () => {
    const effects: StatusEffect[] = [
      { type: 'poison', damage: 2, remaining: 3, baseDamage: 2 },
    ];
    applyStatusEffect(effects, { type: 'burn', damage: 3, remaining: 2, baseDamage: 3 });
    expect(effects).toHaveLength(2);
  });
});

describe('bleed escalation', () => {
  it('increases bleed damage by 1 each tick', () => {
    const effects: StatusEffect[] = [
      { type: 'bleed', damage: 1, remaining: 3, baseDamage: 1 },
    ];

    const r1 = tickStatusEffects(effects);
    expect(r1.damage).toBe(1);
    expect(effects[0].damage).toBe(2);

    const r2 = tickStatusEffects(effects);
    expect(r2.damage).toBe(2);
    expect(effects[0].damage).toBe(3);

    const r3 = tickStatusEffects(effects);
    expect(r3.damage).toBe(3);
    expect(effects).toHaveLength(0);
  });

  it('resets escalation when same-type bleed is reapplied', () => {
    const effects: StatusEffect[] = [
      { type: 'bleed', damage: 5, remaining: 2, baseDamage: 1 },
    ];
    applyStatusEffect(effects, { type: 'bleed', damage: 1, remaining: 3, baseDamage: 1 });
    expect(effects[0].damage).toBe(1);
    expect(effects[0].remaining).toBe(3);
  });
});

describe('weapon effect application', () => {
  const poisonWeapons: Record<string, WeaponDef> = {
    tyrfing: {
      name: 'Tyrfing',
      attack_bonus: 16,
      region: 'wilds',
      description: 'cursed',
      status_effect: { type: 'poison', damage: 3, duration: 3, chance: 100 },
    },
  };

  it('applies weapon effect to enemy on hit when chance is 100', () => {
    const player = createPlayer();
    addWeapon(player, 'tyrfing');
    equipWeapon(player, 'tyrfing');
    const combat = createCombat(player, 'shadow_rat', {
      ...enemyData,
      shadow_rat: { ...enemyData.shadow_rat, hp: 999 },
    });

    playerAttack(combat, player, poisonWeapons, itemData, seededRng(1));

    expect(combat.enemyEffects).toHaveLength(1);
    expect(combat.enemyEffects[0].type).toBe('poison');
    expect(combat.enemyEffects[0].damage).toBe(3);
    expect(combat.enemyEffects[0].remaining).toBe(3);
  });

  const noEffectWeapons: Record<string, WeaponDef> = {
    tyrfing: {
      name: 'Tyrfing',
      attack_bonus: 16,
      region: 'wilds',
      description: 'cursed',
      status_effect: { type: 'poison', damage: 3, duration: 3, chance: 0 },
    },
  };

  it('does not apply weapon effect when chance is 0', () => {
    const player = createPlayer();
    addWeapon(player, 'tyrfing');
    equipWeapon(player, 'tyrfing');
    const combat = createCombat(player, 'shadow_rat', {
      ...enemyData,
      shadow_rat: { ...enemyData.shadow_rat, hp: 999 },
    });

    playerAttack(combat, player, noEffectWeapons, itemData, seededRng(1));

    expect(combat.enemyEffects).toHaveLength(0);
  });
});

describe('enemy effect application', () => {
  const poisonEnemyData = {
    spider: {
      name: 'Spider',
      hp: 18,
      attack: 8,
      defense: 1,
      xp: 14,
      loot: [] as string[],
      region: 'wilds',
      description: 'spider',
      is_boss: false,
      status_effect: { type: 'poison' as const, damage: 2, duration: 3, chance: 100 },
    },
  };

  it('applies enemy effect to player on hit', () => {
    const player = createPlayer();
    player.hp = 200;
    player.maxHp = 200;
    const combat = createCombat(player, 'spider', poisonEnemyData);

    playerDefend(combat, player, itemData, seededRng(1));

    expect(combat.playerEffects.some(e => e.type === 'poison')).toBe(true);
  });

  const stunBossData = {
    troll: {
      name: 'Troll',
      hp: 60,
      attack: 12,
      defense: 5,
      xp: 50,
      loot: [] as string[],
      region: 'wilds',
      description: 'troll',
      is_boss: true,
      status_effect: { type: 'stun' as const, duration: 1, chance: 100 },
    },
  };

  it('boss applies effect only on special attack round (round % 3)', () => {
    const player = createPlayer();
    player.hp = 500;
    player.maxHp = 500;
    player.defense = 50; // survive easily
    const combat = createCombat(player, 'troll', stunBossData);

    // Round 1 — not special (round becomes 1 after round++)
    playerDefend(combat, player, itemData, seededRng(1));
    expect(combat.playerEffects.some(e => e.type === 'stun')).toBe(false);

    // Round 2
    playerDefend(combat, player, itemData, seededRng(2));
    expect(combat.playerEffects.some(e => e.type === 'stun')).toBe(false);

    // Round 3 — special (3 % 3 === 0)
    playerDefend(combat, player, itemData, seededRng(3));
    expect(combat.playerEffects.some(e => e.type === 'stun')).toBe(true);
  });
});

describe('effect ticking in combat', () => {
  it('ticks player poison at the start of playerAttack', () => {
    const player = createPlayer();
    player.attack = 100; // one-shot the enemy to simplify
    const combat = createCombat(player, 'shadow_rat', enemyData);
    combat.playerEffects = [
      { type: 'poison', damage: 5, remaining: 2, baseDamage: 5 },
    ];
    const startHp = player.hp;

    playerAttack(combat, player, weaponData, itemData, seededRng(1));

    // Player took at least 5 from poison (enemy might be dead before hitting back)
    expect(player.hp).toBeLessThanOrEqual(startHp - 5);
    expect(combat.playerEffects[0]?.remaining ?? 0).toBeLessThanOrEqual(1);
  });

  it('ticks enemy effects and deals DoT damage to enemy', () => {
    const player = createPlayer();
    const combat = createCombat(player, 'shadow_rat', enemyData);
    combat.enemy.hp = 999; // keep alive
    combat.enemyEffects = [
      { type: 'poison', damage: 3, remaining: 2, baseDamage: 3 },
    ];
    const startEnemyHp = combat.enemy.hp;

    playerAttack(combat, player, weaponData, itemData, seededRng(1));

    // Enemy took player attack damage + 3 poison
    expect(combat.enemy.hp).toBeLessThan(startEnemyHp - 3);
  });

  it('kills the player from DoT before they can act', () => {
    const player = createPlayer();
    player.hp = 1;
    const combat = createCombat(player, 'shadow_rat', enemyData);
    combat.playerEffects = [
      { type: 'burn', damage: 5, remaining: 2, baseDamage: 5 },
    ];

    const msgs = playerAttack(combat, player, weaponData, itemData, seededRng(1));

    expect(combat.finished).toBe(true);
    expect(combat.playerWon).toBe(false);
    expect(msgs.some(m => m.text.includes('slain'))).toBe(true);
  });

  it('kills the enemy from DoT before enemy can act', () => {
    const player = createPlayer();
    const combat = createCombat(player, 'shadow_rat', enemyData);
    combat.enemy.hp = 2; // almost dead
    combat.enemyEffects = [
      { type: 'poison', damage: 5, remaining: 2, baseDamage: 5 },
    ];

    playerAttack(combat, player, weaponData, itemData, seededRng(1));

    expect(combat.finished).toBe(true);
    expect(combat.playerWon).toBe(true);
  });
});
