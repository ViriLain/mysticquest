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
  rusty_dagger: { name: 'Rusty Dagger', attack_bonus: 2, region: 'manor', weapon_class: 'blade', description: 'dull' },
  iron_sword: { name: 'Iron Sword', attack_bonus: 5, region: 'manor', weapon_class: 'blade', description: 'solid' },
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
      weapon_class: 'blade',
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
      weapon_class: 'blade',
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

describe('weapon class passives', () => {
  it('blade class adds 10% crit chance', () => {
    const bladeWeaponData: Record<string, WeaponDef> = {
      test_blade: { name: 'Test Blade', attack_bonus: 5, region: 'manor', weapon_class: 'blade', description: 'test' },
    };

    let bladeCrits = 0;
    let normalCrits = 0;
    const noClassWeaponData: Record<string, WeaponDef> = {
      test_heavy: { name: 'Test Heavy', attack_bonus: 5, region: 'manor', weapon_class: 'heavy', description: 'test' },
    };

    for (let seed = 0; seed < 200; seed++) {
      const p1 = createPlayer();
      addWeapon(p1, 'test_blade');
      equipWeapon(p1, 'test_blade');
      const combat1 = createCombat(p1, 'shadow_rat', enemyData);
      const msgs1 = playerAttack(combat1, p1, bladeWeaponData, itemData, seededRng(seed));
      if (msgs1.some(m => m.text.includes('CRITICAL HIT') || m.text.includes('blade finds a weak point'))) bladeCrits++;

      const p2 = createPlayer();
      addWeapon(p2, 'test_heavy');
      equipWeapon(p2, 'test_heavy');
      const combat2 = createCombat(p2, 'shadow_rat', enemyData);
      const msgs2 = playerAttack(combat2, p2, noClassWeaponData, itemData, seededRng(seed));
      if (msgs2.some(m => m.text === 'CRITICAL HIT!')) normalCrits++;
    }

    expect(bladeCrits).toBeGreaterThan(normalCrits);
  });

  it('heavy class ignores 2 enemy DEF', () => {
    const heavyWeaponData: Record<string, WeaponDef> = {
      test_heavy: { name: 'Test Heavy', attack_bonus: 5, region: 'manor', weapon_class: 'heavy', description: 'test' },
    };
    const bladeWeaponData: Record<string, WeaponDef> = {
      test_blade: { name: 'Test Blade', attack_bonus: 5, region: 'manor', weapon_class: 'blade', description: 'test' },
    };

    const highDefEnemy = {
      tank: {
        name: 'Tank',
        hp: 1000,
        attack: 1,
        defense: 10,
        xp: 1,
        loot: [] as string[],
        region: 'test',
        description: 'tanky',
        is_boss: false,
      },
    };

    let heavyTotal = 0;
    let bladeTotal = 0;

    for (let seed = 0; seed < 100; seed++) {
      const p1 = createPlayer();
      p1.attack = 10;
      addWeapon(p1, 'test_heavy');
      equipWeapon(p1, 'test_heavy');
      const c1 = createCombat(p1, 'tank', highDefEnemy);
      playerAttack(c1, p1, heavyWeaponData, itemData, seededRng(seed));
      heavyTotal += (1000 - c1.enemy.hp);

      const p2 = createPlayer();
      p2.attack = 10;
      addWeapon(p2, 'test_blade');
      equipWeapon(p2, 'test_blade');
      const c2 = createCombat(p2, 'tank', highDefEnemy);
      playerAttack(c2, p2, bladeWeaponData, itemData, seededRng(seed));
      bladeTotal += (1000 - c2.enemy.hp);
    }

    // Heavy should deal more total damage due to -2 DEF
    expect(heavyTotal).toBeGreaterThan(bladeTotal);
  });

  it('heavy class shows armor pierce message', () => {
    const heavyWeaponData: Record<string, WeaponDef> = {
      test_heavy: { name: 'Test Heavy', attack_bonus: 5, region: 'manor', weapon_class: 'heavy', description: 'test' },
    };
    const player = createPlayer();
    addWeapon(player, 'test_heavy');
    equipWeapon(player, 'test_heavy');
    const combat = createCombat(player, 'shadow_rat', enemyData);

    const messages = playerAttack(combat, player, heavyWeaponData, itemData, seededRng(1));

    expect(messages.some(m => m.text.includes('smashes through armor'))).toBe(true);
  });

  it('pierce class skips enemy attack on round 1', () => {
    const pierceWeaponData: Record<string, WeaponDef> = {
      test_spear: { name: 'Test Spear', attack_bonus: 5, region: 'manor', weapon_class: 'pierce', description: 'test' },
    };
    const player = createPlayer();
    addWeapon(player, 'test_spear');
    equipWeapon(player, 'test_spear');
    const startHp = player.hp;

    const combat = createCombat(player, 'shadow_rat', enemyData);
    const msgs = playerAttack(combat, player, pierceWeaponData, itemData, seededRng(42));

    // Player should take no damage on round 1 (enemy skipped)
    expect(player.hp).toBe(startHp);
    expect(msgs.some(m => m.text.includes('strike first'))).toBe(true);

    // Round 2 — enemy should attack normally
    if (!combat.finished) {
      const hpBeforeRound2 = player.hp;
      playerAttack(combat, player, pierceWeaponData, itemData, seededRng(43));
      expect(combat.round).toBe(2);
      expect(player.hp).toBeLessThan(hpBeforeRound2);
    }
  });

  it('magic class: forced proc fires on hit 3, not on hits 1 or 2', () => {
    const magicWeaponData: Record<string, WeaponDef> = {
      test_staff: {
        name: 'Test Staff',
        attack_bonus: 5,
        region: 'manor',
        weapon_class: 'magic',
        description: 'test',
        status_effect: { type: 'burn', damage: 2, duration: 3, chance: 0 },
      },
    };
    const player = createPlayer();
    addWeapon(player, 'test_staff');
    equipWeapon(player, 'test_staff');
    const combat = createCombat(player, 'cellar_shade', enemyData);
    combat.enemy.hp = 100; // Ensure the enemy survives 3 hits regardless of crits.

    playerAttack(combat, player, magicWeaponData, itemData, seededRng(1));
    expect(combat.enemyEffects.find(e => e.type === 'burn')).toBeUndefined();
    expect(combat.magicHitCounter).toBe(1);

    playerAttack(combat, player, magicWeaponData, itemData, seededRng(2));
    expect(combat.enemyEffects.find(e => e.type === 'burn')).toBeUndefined();
    expect(combat.magicHitCounter).toBe(2);

    playerAttack(combat, player, magicWeaponData, itemData, seededRng(3));
    expect(combat.enemyEffects.find(e => e.type === 'burn')).toBeDefined();
    expect(combat.magicHitCounter).toBe(0);
  });

  it('magic class: counter resets after proc, fires again on hit 6', () => {
    const magicWeaponData: Record<string, WeaponDef> = {
      test_staff: {
        name: 'Test Staff',
        attack_bonus: 5,
        region: 'manor',
        weapon_class: 'magic',
        description: 'test',
        status_effect: { type: 'burn', damage: 2, duration: 3, chance: 0 },
      },
    };
    const player = createPlayer();
    player.maxHp = 9999;
    player.hp = 9999;
    addWeapon(player, 'test_staff');
    equipWeapon(player, 'test_staff');
    // Use a high-HP enemy so it survives 6 hits
    const tankEnemy = {
      tank: {
        name: 'Tank',
        hp: 9999,
        attack: 1,
        defense: 0,
        xp: 1,
        loot: [] as string[],
        region: 'test',
        description: 'tanky',
        is_boss: false,
      },
    };
    const combat = createCombat(player, 'tank', tankEnemy);

    let procCount = 0;
    for (let i = 1; i <= 6; i++) {
      const msgs = playerAttack(combat, player, magicWeaponData, itemData, seededRng(i));
      if (msgs.some(m => m.text === 'Flame surges through your strike!')) {
        procCount++;
      }
    }
    expect(procCount).toBe(2);
    expect(combat.magicHitCounter).toBe(0);
  });

  it('magic class: forced proc applies even when status_effect.chance is 0', () => {
    const magicWeaponData: Record<string, WeaponDef> = {
      test_staff: {
        name: 'Test Staff',
        attack_bonus: 5,
        region: 'manor',
        weapon_class: 'magic',
        description: 'test',
        status_effect: { type: 'poison', damage: 3, duration: 3, chance: 0 },
      },
    };
    const player = createPlayer();
    addWeapon(player, 'test_staff');
    equipWeapon(player, 'test_staff');
    const combat = createCombat(player, 'cellar_shade', enemyData);
    combat.enemy.hp = 100;

    // Three attacks — chance-roll path cannot fire (chance: 0). Only the
    // forced proc can apply poison.
    playerAttack(combat, player, magicWeaponData, itemData, seededRng(1));
    playerAttack(combat, player, magicWeaponData, itemData, seededRng(2));
    playerAttack(combat, player, magicWeaponData, itemData, seededRng(3));

    expect(combat.enemyEffects.find(e => e.type === 'poison')).toBeDefined();
  });

  it('magic class: re-applying on an afflicted target refreshes duration', () => {
    const magicWeaponData: Record<string, WeaponDef> = {
      test_staff: {
        name: 'Test Staff',
        attack_bonus: 5,
        region: 'manor',
        weapon_class: 'magic',
        description: 'test',
        status_effect: { type: 'burn', damage: 2, duration: 3, chance: 0 },
      },
    };
    const player = createPlayer();
    player.maxHp = 9999;
    player.hp = 9999;
    addWeapon(player, 'test_staff');
    equipWeapon(player, 'test_staff');
    const tankEnemy = {
      tank: {
        name: 'Tank',
        hp: 9999,
        attack: 1,
        defense: 0,
        xp: 1,
        loot: [] as string[],
        region: 'test',
        description: 'tanky',
        is_boss: false,
      },
    };
    const combat = createCombat(player, 'tank', tankEnemy);

    // 6 attacks: proc fires on hit 3 (duration 3), ticks, then refreshes on hit 6
    for (let i = 1; i <= 6; i++) {
      playerAttack(combat, player, magicWeaponData, itemData, seededRng(i));
    }

    const burn = combat.enemyEffects.find(e => e.type === 'burn');
    expect(burn).toBeDefined();
    // Duration was refreshed to 3 on hit 6, then did not tick again in same
    // playerAttack call. Assert remaining equals the declared duration exactly
    // (refresh semantic), not 1 or 0 (stack semantic would have decayed).
    expect(burn!.remaining).toBe(3);
  });

  it('magic class: each weapon applies its own declared element', () => {
    const magicWeaponData: Record<string, WeaponDef> = {
      burn_staff: {
        name: 'Burn Staff', attack_bonus: 5, region: 'manor', weapon_class: 'magic',
        description: 'burns', status_effect: { type: 'burn', damage: 2, duration: 3, chance: 0 },
      },
      poison_staff: {
        name: 'Poison Staff', attack_bonus: 5, region: 'manor', weapon_class: 'magic',
        description: 'poisons', status_effect: { type: 'poison', damage: 2, duration: 3, chance: 0 },
      },
    };

    const player1 = createPlayer();
    addWeapon(player1, 'burn_staff');
    equipWeapon(player1, 'burn_staff');
    const combat1 = createCombat(player1, 'cellar_shade', enemyData);
    combat1.enemy.hp = 100;
    playerAttack(combat1, player1, magicWeaponData, itemData, seededRng(1));
    playerAttack(combat1, player1, magicWeaponData, itemData, seededRng(2));
    playerAttack(combat1, player1, magicWeaponData, itemData, seededRng(3));
    expect(combat1.enemyEffects.find(e => e.type === 'burn')).toBeDefined();

    const player2 = createPlayer();
    addWeapon(player2, 'poison_staff');
    equipWeapon(player2, 'poison_staff');
    const combat2 = createCombat(player2, 'cellar_shade', enemyData);
    combat2.enemy.hp = 100;
    playerAttack(combat2, player2, magicWeaponData, itemData, seededRng(1));
    playerAttack(combat2, player2, magicWeaponData, itemData, seededRng(2));
    playerAttack(combat2, player2, magicWeaponData, itemData, seededRng(3));
    expect(combat2.enemyEffects.find(e => e.type === 'poison')).toBeDefined();
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

describe('cure items', () => {
  const cureItemData: Record<string, ItemDef> = {
    ...itemData,
    antidote: {
      name: 'Antidote',
      type: 'consumable',
      effect: 'cure',
      cure_effects: ['poison', 'bleed'],
      description: 'cures',
    },
    salve: {
      name: 'Salve',
      type: 'consumable',
      effect: 'cure',
      cure_effects: ['burn', 'stun'],
      description: 'soothes',
    },
  };

  it('removes matching effects when cure item is used', () => {
    const player = createPlayer();
    addItem(player, 'antidote', cureItemData);
    const combat = createCombat(player, 'shadow_rat', enemyData);
    combat.playerEffects = [
      { type: 'poison', damage: 2, remaining: 3, baseDamage: 2 },
      { type: 'burn', damage: 3, remaining: 2, baseDamage: 3 },
    ];

    playerUseItem(combat, player, 'antidote', cureItemData, seededRng(1));

    expect(combat.playerEffects.some(e => e.type === 'poison')).toBe(false);
    expect(combat.playerEffects.some(e => e.type === 'burn')).toBe(true);
  });

  it('salve clears burn and stun but not poison', () => {
    const player = createPlayer();
    addItem(player, 'salve', cureItemData);
    const combat = createCombat(player, 'shadow_rat', enemyData);
    combat.playerEffects = [
      { type: 'poison', damage: 2, remaining: 3, baseDamage: 2 },
      { type: 'burn', damage: 3, remaining: 2, baseDamage: 3 },
      { type: 'stun', damage: 0, remaining: 1, baseDamage: 0 },
    ];

    playerUseItem(combat, player, 'salve', cureItemData, seededRng(1));

    expect(combat.playerEffects.some(e => e.type === 'poison')).toBe(true);
    expect(combat.playerEffects.some(e => e.type === 'burn')).toBe(false);
    expect(combat.playerEffects.some(e => e.type === 'stun')).toBe(false);
  });

  it('herbalism skill heals 10 HP on cure use', () => {
    const player = createPlayer();
    player.hp = 15;
    player.skills.herbalism = true;
    addItem(player, 'antidote', cureItemData);
    const combat = createCombat(player, 'shadow_rat', enemyData);
    combat.playerEffects = [
      { type: 'poison', damage: 2, remaining: 3, baseDamage: 2 },
    ];

    const msgs = playerUseItem(combat, player, 'antidote', cureItemData, seededRng(1));

    expect(combat.playerEffects.some(e => e.type === 'poison')).toBe(false);
    expect(msgs.some(m => m.text.includes('Herbalism restores 10 HP'))).toBe(true);
  });
});

describe("Keeper's Ward", () => {
  it('reduces enemy damage by 3 when keepers_ward flag is set', () => {
    const player = createPlayer();
    player.firedEvents.keepers_ward = true;
    player.defense = 0;
    const combat = createCombat(player, 'shadow_rat', enemyData);

    playerDefend(combat, player, itemData, seededRng(1));
    const withWard = 30 - player.hp;

    const player2 = createPlayer();
    player2.defense = 0;
    const combat2 = createCombat(player2, 'shadow_rat', enemyData);
    playerDefend(combat2, player2, itemData, seededRng(1));
    const withoutWard = 30 - player2.hp;

    expect(withWard).toBeLessThan(withoutWard);
  });

  it('stacks with arcane_shield for -4 total reduction', () => {
    const player = createPlayer();
    player.firedEvents.keepers_ward = true;
    player.skills.arcane_shield = true;
    player.defense = 0;
    player.hp = 200;
    player.maxHp = 200;

    const strongEnemy = {
      brute: {
        name: 'Brute',
        hp: 100,
        attack: 20,
        defense: 0,
        xp: 10,
        loot: [] as string[],
        region: 'test',
        description: 'big',
        is_boss: false,
      },
    };
    // Use playerAttack (not playerDefend) so the defending flag does not halve damage,
    // letting us observe the raw -4 reduction cleanly.
    const combat = createCombat(player, 'brute', strongEnemy);
    playerAttack(combat, player, weaponData, itemData, seededRng(1));
    const withBoth = 200 - player.hp;

    const player2 = createPlayer();
    player2.defense = 0;
    player2.hp = 200;
    player2.maxHp = 200;
    const combat2 = createCombat(player2, 'brute', strongEnemy);
    playerAttack(combat2, player2, weaponData, itemData, seededRng(1));
    const withNeither = 200 - player2.hp;

    expect(withNeither - withBoth).toBe(4);
  });
});

describe('Iron Will stun resistance', () => {
  const stunEnemyData = {
    knight: {
      name: 'Knight',
      hp: 55,
      attack: 16,
      defense: 8,
      xp: 45,
      loot: [] as string[],
      region: 'darkness',
      description: 'knight',
      is_boss: false,
      status_effect: { type: 'stun' as const, duration: 1, chance: 100 },
    },
  };

  it('resists stun some of the time with Iron Will', () => {
    const player = createPlayer();
    player.skills.iron_will = true;
    player.hp = 500;
    player.maxHp = 500;
    player.defense = 50;

    let stunCount = 0;
    for (let i = 0; i < 20; i++) {
      const combat = createCombat(player, 'knight', stunEnemyData);
      playerDefend(combat, player, itemData, seededRng(i));
      if (combat.playerEffects.some(e => e.type === 'stun')) stunCount++;
    }
    // With 50% resist over 20 trials: expect some resists and some successes
    expect(stunCount).toBeGreaterThan(0);
    expect(stunCount).toBeLessThan(20);
  });

  it('does not resist stun without Iron Will', () => {
    const player = createPlayer();
    player.hp = 500;
    player.maxHp = 500;
    player.defense = 50;

    let stunCount = 0;
    for (let i = 0; i < 10; i++) {
      const combat = createCombat(player, 'knight', stunEnemyData);
      playerDefend(combat, player, itemData, seededRng(i));
      if (combat.playerEffects.some(e => e.type === 'stun')) stunCount++;
    }
    // Without Iron Will, 100% chance should always apply
    expect(stunCount).toBe(10);
  });
});
