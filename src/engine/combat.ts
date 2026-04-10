import type { CombatMessage, CombatResults, CombatState, EnemyDef, ItemDef, PlayerState, StatusEffect, WeaponDef } from './types';
import { totalAttack, totalDefense, addXp, hasItem, removeItem, heal, takeDamage, isDead, hasSkill } from './player';

type Rng = () => number;

function defaultRng(): number {
  return Math.random();
}

function randInt(min: number, max: number, rng: Rng): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function calcDamage(atk: number, def: number, rng: Rng, critChance = 10, critMult = 2): [number, boolean] {
  const variance = randInt(-2, 2, rng);
  let damage = Math.max(1, atk - def + variance);
  let crit = false;
  if (randInt(1, 100, rng) <= critChance) {
    damage = Math.floor(damage * critMult);
    crit = true;
  }
  damage = Math.max(1, damage);
  return [damage, crit];
}

function getPlayerAttack(player: PlayerState, weaponData: Record<string, WeaponDef>): number {
  let atk = totalAttack(player);
  if (player.equippedWeapon && weaponData[player.equippedWeapon]) {
    atk += weaponData[player.equippedWeapon].attack_bonus;
  }
  return atk;
}

function getPlayerDefense(player: PlayerState, itemData: Record<string, ItemDef>): number {
  return totalDefense(player, itemData);
}

function tickBuffs(player: PlayerState, messages: CombatMessage[]): void {
  if (player.buffRounds > 0) {
    player.buffRounds--;
    if (player.buffRounds <= 0) {
      player.buffAttack = 0;
      messages.push({ text: 'Your attack buff fades.', color: [0.6, 0.6, 0.6, 1] });
    }
  }
}

function enemyTurn(
  combat: CombatState,
  player: PlayerState,
  itemData: Record<string, ItemDef>,
  messages: CombatMessage[],
  rng: Rng,
): void {
  if (combat.finished) return;

  let atk = combat.enemy.attack;
  if (combat.enemy.isBoss && combat.round % 3 === 0) {
    atk = Math.floor(atk * 1.5);
    messages.push({ text: `${combat.enemy.name} unleashes a special attack!`, color: [1, 0.3, 0.3, 1] });
  }

  if (hasSkill(player, 'lucky') && rng() < 0.15) {
    messages.push({ text: 'You dodge the attack!', color: [0.4, 1, 0.4, 1] });
    return;
  }

  const [rawDamage, crit] = calcDamage(atk, getPlayerDefense(player, itemData), rng);
  if (crit) {
    messages.push({ text: 'The enemy lands a CRITICAL HIT!', color: [1, 0.2, 0.2, 1] });
  }

  const damage = Math.max(1, rawDamage - (hasSkill(player, 'arcane_shield') ? 1 : 0));
  const actual = takeDamage(player, damage);
  messages.push({ text: `${combat.enemy.name} deals ${actual} damage to you.`, color: [1, 0.5, 0.5, 1] });

  // Roll enemy status effect
  const se = combat.enemy.statusEffect;
  if (se) {
    const isSpecialRound = combat.enemy.isBoss && combat.round % 3 === 0;
    const shouldRoll = combat.enemy.isBoss ? isSpecialRound : true;
    if (shouldRoll && rng() * 100 < se.chance) {
      // Iron Will stun resistance
      if (se.type === 'stun' && hasSkill(player, 'iron_will') && rng() < 0.5) {
        messages.push({ text: 'Your Iron Will resists the stun!', color: [0.4, 1, 0.8, 1] });
      } else {
        const effect: StatusEffect = {
          type: se.type,
          damage: se.damage ?? 0,
          remaining: se.duration ?? 1,
          baseDamage: se.damage ?? 0,
        };
        applyStatusEffect(combat.playerEffects, effect);
        const label = se.type.toUpperCase();
        messages.push({ text: `You are ${label}ED!`, color: [1, 0.3, 0.1, 1] });
      }
    }
  }

  if (isDead(player)) {
    combat.finished = true;
    combat.playerWon = false;
    messages.push({ text: 'You have been slain...', color: [1, 0.2, 0.2, 1] });
  } else {
    messages.push({ text: `You have ${player.hp}/${player.maxHp} HP.`, color: [0.6, 0.6, 0.6, 1] });
  }
}

export function createCombat(_player: PlayerState, enemyId: string, enemyData: Record<string, EnemyDef>): CombatState {
  const edata = enemyData[enemyId];
  return {
    enemy: {
      name: edata.name,
      hp: edata.hp,
      attack: edata.attack,
      defense: edata.defense,
      xp: edata.xp,
      gold: edata.gold ?? 0,
      loot: edata.loot || [],
      lootWeapon: edata.loot_weapon,
      isBoss: edata.is_boss,
      description: edata.description,
      statusEffect: edata.status_effect ?? null,
    },
    round: 0,
    finished: false,
    fled: false,
    playerWon: false,
    playerEffects: [],
    enemyEffects: [],
  };
}

export function playerAttack(
  combat: CombatState,
  player: PlayerState,
  weaponData: Record<string, WeaponDef>,
  itemData: Record<string, ItemDef>,
  rng: Rng = defaultRng,
): CombatMessage[] {
  const messages: CombatMessage[] = [];
  combat.round++;

  // Tick player effects (DoT)
  const playerTick = tickStatusEffects(combat.playerEffects);
  messages.push(...playerTick.messages);
  if (playerTick.damage > 0) {
    player.hp -= playerTick.damage;
    messages.push({ text: `You take ${playerTick.damage} effect damage. (${player.hp}/${player.maxHp} HP)`, color: [1, 0.4, 0.4, 1] });
    if (player.hp <= 0) {
      player.hp = 0;
      combat.finished = true;
      combat.playerWon = false;
      messages.push({ text: 'You have been slain...', color: [1, 0.2, 0.2, 1] });
      return messages;
    }
  }

  let atk = getPlayerAttack(player, weaponData);
  let critChance = 10;
  let critMult = 2;
  if (hasSkill(player, 'sharp_eyes')) critChance = 18;
  if (hasSkill(player, 'assassin')) critMult = 3;
  let effectiveDef = combat.enemy.defense;
  if (hasSkill(player, 'precision')) { atk += 3; effectiveDef = Math.max(0, effectiveDef - 2); }
  const [damage, crit] = calcDamage(atk, effectiveDef, rng, critChance, critMult);
  let finalDamage = damage;
  if (hasSkill(player, 'berserker') && player.hp < player.maxHp * 0.3) {
    finalDamage = Math.floor(damage * 1.15);
  }

  if (crit) {
    messages.push({ text: 'CRITICAL HIT!', color: [1, 1, 0.2, 1] });
  }
  combat.enemy.hp -= finalDamage;
  messages.push({ text: `You deal ${finalDamage} damage to ${combat.enemy.name}.`, color: [0.8, 1, 0.8, 1] });

  if (combat.enemy.hp <= 0) {
    combat.enemy.hp = 0;
    combat.finished = true;
    combat.playerWon = true;
    messages.push({ text: `${combat.enemy.name} is defeated!`, color: [1, 1, 0.4, 1] });
    return messages;
  }

  messages.push({ text: `${combat.enemy.name} has ${combat.enemy.hp} HP remaining.`, color: [0.6, 0.6, 0.6, 1] });

  // Tick enemy effects
  const enemyTick = tickStatusEffects(combat.enemyEffects);
  if (enemyTick.damage > 0) {
    combat.enemy.hp -= enemyTick.damage;
    for (const m of enemyTick.messages) {
      messages.push({ text: `${combat.enemy.name}: ${m.text}`, color: m.color });
    }
    if (combat.enemy.hp <= 0) {
      combat.enemy.hp = 0;
      combat.finished = true;
      combat.playerWon = true;
      messages.push({ text: `${combat.enemy.name} is defeated!`, color: [1, 1, 0.4, 1] });
      return messages;
    }
  }

  // Roll weapon status effect (applied after tick so it takes effect next round)
  if (player.equippedWeapon && weaponData[player.equippedWeapon]?.status_effect) {
    const se = weaponData[player.equippedWeapon].status_effect!;
    if (rng() * 100 < se.chance) {
      const effect: StatusEffect = {
        type: se.type,
        damage: se.damage,
        remaining: se.duration,
        baseDamage: se.damage,
      };
      applyStatusEffect(combat.enemyEffects, effect);
      const label = se.type.toUpperCase();
      messages.push({ text: `The enemy is now ${label}ED!`, color: [1, 0.6, 0.2, 1] });
    }
  }

  enemyTurn(combat, player, itemData, messages, rng);
  tickBuffs(player, messages);
  applyMeditation(player, messages);
  return messages;
}

export function playerDefend(
  combat: CombatState,
  player: PlayerState,
  itemData: Record<string, ItemDef>,
  rng: Rng = defaultRng,
): CombatMessage[] {
  const messages: CombatMessage[] = [];
  combat.round++;

  // Tick player effects (DoT)
  const playerTick = tickStatusEffects(combat.playerEffects);
  messages.push(...playerTick.messages);
  if (playerTick.damage > 0) {
    player.hp -= playerTick.damage;
    messages.push({ text: `You take ${playerTick.damage} effect damage. (${player.hp}/${player.maxHp} HP)`, color: [1, 0.4, 0.4, 1] });
    if (player.hp <= 0) {
      player.hp = 0;
      combat.finished = true;
      combat.playerWon = false;
      messages.push({ text: 'You have been slain...', color: [1, 0.2, 0.2, 1] });
      return messages;
    }
  }

  player.defending = true;
  messages.push({ text: 'You brace yourself for the next attack.', color: [0.6, 0.8, 1, 1] });

  // Tick enemy effects
  const enemyTick = tickStatusEffects(combat.enemyEffects);
  if (enemyTick.damage > 0) {
    combat.enemy.hp -= enemyTick.damage;
    for (const m of enemyTick.messages) {
      messages.push({ text: `${combat.enemy.name}: ${m.text}`, color: m.color });
    }
    if (combat.enemy.hp <= 0) {
      combat.enemy.hp = 0;
      combat.finished = true;
      combat.playerWon = true;
      messages.push({ text: `${combat.enemy.name} is defeated!`, color: [1, 1, 0.4, 1] });
      return messages;
    }
  }

  enemyTurn(combat, player, itemData, messages, rng);
  tickBuffs(player, messages);
  applyMeditation(player, messages);
  return messages;
}

export function playerFlee(
  combat: CombatState,
  player: PlayerState,
  itemData: Record<string, ItemDef>,
  rng: Rng = defaultRng,
): CombatMessage[] {
  const messages: CombatMessage[] = [];
  combat.round++;

  // Tick player effects (DoT)
  const playerTick = tickStatusEffects(combat.playerEffects);
  messages.push(...playerTick.messages);
  if (playerTick.damage > 0) {
    player.hp -= playerTick.damage;
    messages.push({ text: `You take ${playerTick.damage} effect damage. (${player.hp}/${player.maxHp} HP)`, color: [1, 0.4, 0.4, 1] });
    if (player.hp <= 0) {
      player.hp = 0;
      combat.finished = true;
      combat.playerWon = false;
      messages.push({ text: 'You have been slain...', color: [1, 0.2, 0.2, 1] });
      return messages;
    }
  }

  const fleeThreshold = hasSkill(player, 'quick_feet') ? 90 : 70;
  const roll = randInt(1, 100, rng);
  if (roll <= fleeThreshold) {
    combat.finished = true;
    combat.fled = true;
    messages.push({ text: 'You flee from combat!', color: [0.8, 0.8, 0.2, 1] });
  } else {
    messages.push({ text: 'You fail to escape!', color: [1, 0.4, 0.4, 1] });

    // Tick enemy effects before enemy acts
    const enemyTick = tickStatusEffects(combat.enemyEffects);
    if (enemyTick.damage > 0) {
      combat.enemy.hp -= enemyTick.damage;
      for (const m of enemyTick.messages) {
        messages.push({ text: `${combat.enemy.name}: ${m.text}`, color: m.color });
      }
      if (combat.enemy.hp <= 0) {
        combat.enemy.hp = 0;
        combat.finished = true;
        combat.playerWon = true;
        messages.push({ text: `${combat.enemy.name} is defeated!`, color: [1, 1, 0.4, 1] });
        return messages;
      }
    }

    enemyTurn(combat, player, itemData, messages, rng);
  }
  tickBuffs(player, messages);
  applyMeditation(player, messages);
  return messages;
}

export function playerUseItem(
  combat: CombatState,
  player: PlayerState,
  itemId: string,
  itemData: Record<string, ItemDef>,
  rng: Rng = defaultRng,
): CombatMessage[] {
  const messages: CombatMessage[] = [];
  combat.round++;

  const item = itemData[itemId];
  if (!item) {
    messages.push({ text: 'Unknown item.', color: [1, 0.4, 0.4, 1] });
    return messages;
  }
  if (item.type !== 'consumable') {
    messages.push({ text: "You can't use that in combat.", color: [1, 0.4, 0.4, 1] });
    return messages;
  }
  if (!hasItem(player, itemId)) {
    messages.push({ text: "You don't have that item.", color: [1, 0.4, 0.4, 1] });
    return messages;
  }

  // Tick player effects (DoT) — use items are still subject to DoT
  const playerTick = tickStatusEffects(combat.playerEffects);
  messages.push(...playerTick.messages);
  if (playerTick.damage > 0) {
    player.hp -= playerTick.damage;
    messages.push({ text: `You take ${playerTick.damage} effect damage. (${player.hp}/${player.maxHp} HP)`, color: [1, 0.4, 0.4, 1] });
    if (player.hp <= 0) {
      player.hp = 0;
      combat.finished = true;
      combat.playerWon = false;
      messages.push({ text: 'You have been slain...', color: [1, 0.2, 0.2, 1] });
      return messages;
    }
  }

  removeItem(player, itemId);

  if (item.effect === 'heal' && item.value) {
    const healAmount = hasSkill(player, 'herbalism') ? Math.floor(item.value * 1.5) : item.value;
    const oldHp = player.hp;
    heal(player, healAmount);
    const healed = player.hp - oldHp;
    messages.push({ text: `You use ${item.name} and restore ${healed} HP.`, color: [0.4, 1, 0.4, 1] });
  } else if (item.effect === 'buff_attack' && item.value) {
    player.buffAttack = item.value;
    player.buffRounds = hasSkill(player, 'buff_mastery') ? 5 : 3;
    const rounds = player.buffRounds;
    messages.push({ text: `You drink ${item.name}! +${item.value} Attack for ${rounds} rounds.`, color: [1, 0.6, 0.2, 1] });
  } else if (item.effect === 'cure' && item.cure_effects) {
    combat.playerEffects = combat.playerEffects.filter(
      e => !item.cure_effects!.includes(e.type),
    );
    const cured = item.cure_effects.join(', ');
    messages.push({ text: `You use ${item.name}. Cleared: ${cured}.`, color: [0.4, 1, 0.4, 1] });
    if (hasSkill(player, 'herbalism')) {
      const oldHp = player.hp;
      heal(player, 10);
      if (player.hp > oldHp) {
        messages.push({ text: 'Herbalism restores 10 HP!', color: [0.4, 1, 0.4, 1] });
      }
    }
  }

  // Tick enemy effects before enemy acts
  const enemyTick = tickStatusEffects(combat.enemyEffects);
  if (enemyTick.damage > 0) {
    combat.enemy.hp -= enemyTick.damage;
    for (const m of enemyTick.messages) {
      messages.push({ text: `${combat.enemy.name}: ${m.text}`, color: m.color });
    }
    if (combat.enemy.hp <= 0) {
      combat.enemy.hp = 0;
      combat.finished = true;
      combat.playerWon = true;
      messages.push({ text: `${combat.enemy.name} is defeated!`, color: [1, 1, 0.4, 1] });
      return messages;
    }
  }

  enemyTurn(combat, player, itemData, messages, rng);
  tickBuffs(player, messages);
  applyMeditation(player, messages);
  return messages;
}

function applyMeditation(player: PlayerState, messages: CombatMessage[]): void {
  if (hasSkill(player, 'meditation') && player.hp > 0) {
    const oldHp = player.hp;
    player.hp = Math.min(player.hp + 2, player.maxHp);
    if (player.hp > oldHp) {
      messages.push({ text: 'You regenerate 2 HP.', color: [0.4, 1, 0.4, 1] });
    }
  }
}

// ---- Status effect helpers ----

export interface TickResult {
  damage: number;
  stunned: boolean;
  messages: CombatMessage[];
}

export function tickStatusEffects(effects: StatusEffect[]): TickResult {
  let damage = 0;
  let stunned = false;
  const messages: CombatMessage[] = [];

  for (let i = effects.length - 1; i >= 0; i--) {
    const eff = effects[i];
    if (eff.type === 'stun') {
      stunned = true;
    } else if (eff.type === 'bleed') {
      damage += eff.damage;
      messages.push({ text: `Bleeding for ${eff.damage} damage!`, color: [1, 0.3, 0.3, 1] });
      eff.damage++; // escalation
    } else {
      // poison / burn
      damage += eff.damage;
      const label = eff.type === 'poison' ? 'Poison' : 'Burn';
      messages.push({ text: `${label} deals ${eff.damage} damage!`, color: [1, 0.3, 0.3, 1] });
    }
    eff.remaining--;
    if (eff.remaining <= 0) {
      effects.splice(i, 1);
    }
  }

  return { damage, stunned, messages };
}

export function applyStatusEffect(effects: StatusEffect[], effect: StatusEffect): void {
  const existing = effects.find(e => e.type === effect.type);
  if (existing) {
    existing.remaining = effect.remaining;
    existing.damage = effect.baseDamage;
    existing.baseDamage = effect.baseDamage;
  } else {
    effects.push({ ...effect });
  }
}

export function enemyDefeated(
  combat: CombatState,
  player: PlayerState,
): CombatResults {
  const results: CombatResults = { leveled: false, loot: [], weapon: null, messages: [] };

  const leveled = addXp(player, combat.enemy.xp);
  results.leveled = leveled;
  results.messages.push({ text: `You gain ${combat.enemy.xp} XP.`, color: [0.4, 1, 0.4, 1] });
  if (leveled) {
    results.messages.push({ text: `LEVEL UP! You are now level ${player.level}!`, color: [1, 1, 0.2, 1] });
    results.messages.push({ text: 'HP +8  ATK +2  DEF +1', color: [1, 1, 0.2, 1] });
  }

  if (combat.enemy.loot) {
    results.loot = [...combat.enemy.loot];
  }
  if (combat.enemy.lootWeapon) {
    results.weapon = combat.enemy.lootWeapon;
  }

  return results;
}
