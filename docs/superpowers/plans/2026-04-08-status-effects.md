# Combat Status Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add poison, burn, bleed, and stun status effects to combat, applied by weapons and enemies, with cure items and skill augments.

**Architecture:** A set of pure helper functions in `combat.ts` handle effect application, ticking, and curing. `CombatState` gains `playerEffects` and `enemyEffects` arrays. Effects tick at the start of each round (before actions). Stun blocks attack/defend/flee but allows item use. Cure items use a new `cure_effects` field on `ItemDef`. All chance rolls use the existing injected RNG for deterministic tests.

**Tech Stack:** TypeScript, Vitest 2.x. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-04-08-status-effects-design.md](../specs/2026-04-08-status-effects-design.md)

---

## Critical test-author notes

- **`addLine` writes to `store.typewriterQueue`**, not `store.lines`. Tests asserting terminal output read `store.typewriterQueue.map(l => l.text)`.
- **Combat tests** use `seededRng(N)` from `src/engine/rng.ts` for deterministic results. The existing test file (`test/unit/combat.test.ts`) shows the pattern.
- **Status effect helper functions are pure** — they take arrays/objects and return results. Test them directly, not through the full `playerAttack` flow.
- **For tests that need guaranteed effect application**, set the effect's `chance` to 100 in the fixture data. For guaranteed miss, set `chance` to 0. This avoids coupling tests to specific RNG seed positions.

---

## File map

**Modified:**
- `src/engine/types.ts` — `StatusEffect` type, `CombatState.playerEffects/enemyEffects`, `WeaponDef.status_effect`, `EnemyDef.status_effect`, `ItemDef.cure_effects`
- `src/engine/combat.ts` — effect helpers (apply, tick, cure), integrate into playerAttack/Defend/Flee/UseItem, enemy effect application
- `src/engine/state/combat.ts` — stun blocks attack/defend/flee, effect status display
- `src/data/weapons.json` — add `status_effect` to 8 weapons
- `src/data/enemies.json` — add `status_effect` to 7 enemies
- `src/data/items.json` — add 3 cure items (antidote, salve, panacea)
- `src/data/shops.json` — add cure items to shop stock
- `test/unit/combat.test.ts` — new tests for all effect behaviors
- `CLAUDE.md` — update architecture section

---

## Task 1: Add types and initialize CombatState

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/combat.ts`

**Goal:** Add the `StatusEffect` type, extend `CombatState`, `WeaponDef`, `EnemyDef`, and `ItemDef` with new optional fields. Initialize the new arrays in `createCombat`. Non-breaking — all new fields are optional or have defaults.

- [ ] **Step 1: Add `StatusEffect` and extend types in `src/engine/types.ts`**

After the `CombatState` interface (around line 283), add:

```typescript
export type StatusEffectType = 'poison' | 'burn' | 'bleed' | 'stun';

export interface StatusEffect {
  type: StatusEffectType;
  damage: number;    // per-tick damage (0 for stun)
  remaining: number; // rounds left
  baseDamage: number; // original damage (for bleed escalation reset)
}
```

Add to `CombatState`:

```typescript
export interface CombatState {
  enemy: EnemyInstance;
  round: number;
  finished: boolean;
  fled: boolean;
  playerWon: boolean;
  playerEffects: StatusEffect[];
  enemyEffects: StatusEffect[];
}
```

Add to `WeaponDef` (after `price?`):

```typescript
  status_effect?: {
    type: StatusEffectType;
    damage: number;
    duration: number;
    chance: number; // 0–100
  };
```

Add to `EnemyDef` (after `is_boss`):

```typescript
  status_effect?: {
    type: 'poison' | 'burn' | 'stun';
    damage?: number;
    duration?: number;
    chance: number; // 0–100
  };
```

Add to `ItemDef` (after `price?`):

```typescript
  cure_effects?: StatusEffectType[];
```

- [ ] **Step 2: Initialize effects arrays in `createCombat`**

In `src/engine/combat.ts`, update `createCombat` to include:

```typescript
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
    },
    round: 0,
    finished: false,
    fled: false,
    playerWon: false,
    playerEffects: [],
    enemyEffects: [],
  };
}
```

- [ ] **Step 3: Verify build and tests**

Run: `npm run build && npm run lint && npm test`
Expected: clean, all existing tests pass. The new fields are optional/defaulted so nothing breaks.

- [ ] **Step 4: Commit**

```bash
git add src/engine/types.ts src/engine/combat.ts
git commit -m "Add StatusEffect type and extend CombatState with effect arrays"
```

---

## Task 2: Effect ticking — poison and burn DoT

**Files:**
- Modify: `src/engine/combat.ts`
- Modify: `test/unit/combat.test.ts`

**Goal:** Add `tickStatusEffects` helper that processes poison/burn damage per round, decrements remaining, and removes expired effects. TDD.

- [ ] **Step 1: Write failing tests**

Append to `test/unit/combat.test.ts`:

```typescript
import type { StatusEffect } from '../../src/engine/types';
import { tickStatusEffects, applyStatusEffect } from '../../src/engine/combat';

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
    expect(result.damage).toBe(5); // 2 + 3
  });

  it('removes effects when remaining reaches 0', () => {
    const effects: StatusEffect[] = [
      { type: 'burn', damage: 3, remaining: 1, baseDamage: 3 },
    ];
    tickStatusEffects(effects);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/unit/combat.test.ts -t "tickStatusEffects"`
Expected: FAIL — functions don't exist yet.

- [ ] **Step 3: Implement the helpers in `src/engine/combat.ts`**

Add after the existing `applyMeditation` function (at the end of the file):

```typescript
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
    existing.damage = effect.baseDamage; // reset (important for bleed escalation)
    existing.baseDamage = effect.baseDamage;
  } else {
    effects.push({ ...effect });
  }
}
```

Add the `StatusEffect` import at the top of combat.ts:

```typescript
import type { CombatMessage, CombatResults, CombatState, EnemyDef, ItemDef, PlayerState, StatusEffect, WeaponDef } from './types';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/unit/combat.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Run full suite + lint**

Run: `npm run lint && npm test`

- [ ] **Step 6: Commit**

```bash
git add src/engine/combat.ts test/unit/combat.test.ts
git commit -m "Add tickStatusEffects and applyStatusEffect helpers"
```

---

## Task 3: Bleed escalation

**Files:**
- Modify: `test/unit/combat.test.ts`

**Goal:** Verify bleed's escalating damage behavior. The implementation is already in Task 2's `tickStatusEffects` (the `eff.damage++` line in the bleed branch). This task just adds the test.

- [ ] **Step 1: Add bleed escalation test**

```typescript
describe('bleed escalation', () => {
  it('increases bleed damage by 1 each tick', () => {
    const effects: StatusEffect[] = [
      { type: 'bleed', damage: 1, remaining: 3, baseDamage: 1 },
    ];

    const r1 = tickStatusEffects(effects);
    expect(r1.damage).toBe(1);
    expect(effects[0].damage).toBe(2); // escalated

    const r2 = tickStatusEffects(effects);
    expect(r2.damage).toBe(2);
    expect(effects[0].damage).toBe(3);

    const r3 = tickStatusEffects(effects);
    expect(r3.damage).toBe(3);
    expect(effects).toHaveLength(0); // expired
    // total: 1 + 2 + 3 = 6
  });

  it('resets escalation when same-type bleed is reapplied', () => {
    const effects: StatusEffect[] = [
      { type: 'bleed', damage: 5, remaining: 2, baseDamage: 1 }, // escalated to 5
    ];
    applyStatusEffect(effects, { type: 'bleed', damage: 1, remaining: 3, baseDamage: 1 });
    expect(effects[0].damage).toBe(1); // reset to baseDamage
    expect(effects[0].remaining).toBe(3); // fresh duration
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run test/unit/combat.test.ts -t "bleed"`
Expected: PASS (implementation from Task 2 covers this).

- [ ] **Step 3: Run full suite + lint, then commit**

```bash
npm run lint && npm test
git add test/unit/combat.test.ts
git commit -m "Add bleed escalation tests"
```

---

## Task 4: Stun mechanic

**Files:**
- Modify: `src/engine/combat.ts`
- Modify: `src/engine/state/combat.ts`
- Modify: `test/unit/combat.test.ts`

**Goal:** Stun returns `stunned: true` from `tickStatusEffects`. The combat command handler blocks attack/defend/flee when stunned, allowing only `use <item>`.

- [ ] **Step 1: Add stun unit test**

```typescript
describe('stun', () => {
  it('reports stunned from tickStatusEffects', () => {
    const effects: StatusEffect[] = [
      { type: 'stun', damage: 0, remaining: 1, baseDamage: 0 },
    ];
    const result = tickStatusEffects(effects);
    expect(result.stunned).toBe(true);
    expect(effects).toHaveLength(0); // 1 round, now expired
  });
});
```

- [ ] **Step 2: Run test, verify it passes**

Run: `npx vitest run test/unit/combat.test.ts -t "stun"`
Expected: PASS (tickStatusEffects already handles stun from Task 2).

- [ ] **Step 3: Integrate stun blocking into `src/engine/state/combat.ts`**

Read the current `handleCombatCommand` in `state/combat.ts`. At the top of the function, after the `addLine(store, '')` call and before the verb-dispatch block, add a stun check:

```typescript
  addLine(store, '');

  // Check if player is stunned
  const isStunned = store.combat.playerEffects.some(e => e.type === 'stun');
  if (isStunned && verb !== 'use') {
    addLine(store, 'You are stunned! You can only use items.', C.COMBAT_COLOR);
    emitSound(store, 'error');
    return;
  }

  let msgs: CombatMessage[] = [];
```

- [ ] **Step 4: Run full suite + lint**

Run: `npm run lint && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine/state/combat.ts test/unit/combat.test.ts
git commit -m "Block attack/defend/flee when player is stunned"
```

---

## Task 5: Integrate effect ticking into combat flow

**Files:**
- Modify: `src/engine/combat.ts`
- Modify: `test/unit/combat.test.ts`

**Goal:** Call `tickStatusEffects` at the start of each round for both player and enemy. DoT damage is applied. If the player dies from DoT, combat ends immediately.

- [ ] **Step 1: Add integration test**

```typescript
describe('effect ticking in combat', () => {
  it('ticks player poison at the start of a round', () => {
    const player = createPlayer();
    player.attack = 100; // one-shot the enemy
    const combat = createCombat(player, 'shadow_rat', enemyData);
    combat.playerEffects = [
      { type: 'poison', damage: 5, remaining: 2, baseDamage: 5 },
    ];
    const startHp = player.hp;

    playerAttack(combat, player, weaponData, itemData, seededRng(1));

    expect(player.hp).toBeLessThan(startHp - 4); // at least 5 from poison
    expect(combat.playerEffects[0]?.remaining ?? 0).toBe(1);
  });

  it('ticks enemy effects and deals DoT damage', () => {
    const player = createPlayer();
    const combat = createCombat(player, 'shadow_rat', enemyData);
    combat.enemyEffects = [
      { type: 'poison', damage: 3, remaining: 2, baseDamage: 3 },
    ];

    playerAttack(combat, player, weaponData, itemData, seededRng(1));

    // Enemy started at 10 HP, took player damage + 3 poison
    expect(combat.enemy.hp).toBeLessThan(10 - 3);
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/unit/combat.test.ts -t "effect ticking"`
Expected: FAIL — playerAttack doesn't tick effects yet.

- [ ] **Step 3: Integrate ticking into `playerAttack` in `src/engine/combat.ts`**

At the top of `playerAttack`, before the existing damage calculation:

```typescript
export function playerAttack(
  combat: CombatState,
  player: PlayerState,
  weaponData: Record<string, WeaponDef>,
  itemData: Record<string, ItemDef>,
  rng: Rng = defaultRng,
): CombatMessage[] {
  const messages: CombatMessage[] = [];
  combat.round++;

  // Tick player effects (DoT, stun)
  const playerTick = tickStatusEffects(combat.playerEffects);
  messages.push(...playerTick.messages.map(m => ({ ...m, text: m.text })));
  if (playerTick.damage > 0) {
    player.hp -= playerTick.damage;
    if (player.hp <= 0) {
      player.hp = 0;
      combat.finished = true;
      combat.playerWon = false;
      messages.push({ text: 'You have been slain...', color: [1, 0.2, 0.2, 1] });
      return messages;
    }
  }

  // Existing player attack logic follows...
  let atk = getPlayerAttack(player, weaponData);
  // ... (rest unchanged)
```

Similarly, add enemy effect ticking BEFORE the `enemyTurn` call. Inside `playerAttack`, after the player's damage is dealt and before `enemyTurn` is called, add:

```typescript
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
```

Also add ticking to `playerDefend`, `playerFlee`, and `playerUseItem` — the same player tick block goes at the top of each function (before the action). Enemy ticks happen after the player acts but before the enemy turn.

**Important:** In `playerDefend`, `playerFlee`, and `playerUseItem`, the pattern is the same:
1. `combat.round++`
2. Tick player effects (DoT, check death)
3. Player action (defend/flee/use item)
4. Tick enemy effects (DoT, check enemy death)
5. Enemy turn (if not finished)
6. Tick buffs + meditation

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/unit/combat.test.ts`
Expected: all tests pass including the new integration tests.

- [ ] **Step 5: Run full suite + lint, then commit**

```bash
npm run lint && npm test
git add src/engine/combat.ts test/unit/combat.test.ts
git commit -m "Integrate effect ticking into all combat actions"
```

---

## Task 6: Weapon effect application on player attack

**Files:**
- Modify: `src/engine/combat.ts`
- Modify: `test/unit/combat.test.ts`

**Goal:** After the player deals damage, roll the weapon's `status_effect.chance`. On success, apply the effect to the enemy.

- [ ] **Step 1: Add failing test**

```typescript
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

  it('applies weapon effect to enemy on hit when chance succeeds', () => {
    const player = createPlayer();
    addWeapon(player, 'tyrfing');
    equipWeapon(player, 'tyrfing');
    const combat = createCombat(player, 'shadow_rat', {
      ...enemyData,
      shadow_rat: { ...enemyData.shadow_rat, hp: 999 }, // keep alive
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

  it('does not apply weapon effect when chance fails', () => {
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/unit/combat.test.ts -t "weapon effect"`
Expected: FAIL — no effect application code yet.

- [ ] **Step 3: Add weapon effect application in `playerAttack`**

In `playerAttack`, after the player deals damage and before the enemy HP check, add:

```typescript
  combat.enemy.hp -= finalDamage;
  messages.push({ text: `You deal ${finalDamage} damage to ${combat.enemy.name}.`, color: [0.8, 1, 0.8, 1] });

  // Roll weapon status effect
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
      const label = se.type.charAt(0).toUpperCase() + se.type.slice(1);
      messages.push({ text: `The enemy is now ${label.toUpperCase()}ED!`, color: [1, 0.6, 0.2, 1] });
    }
  }

  if (combat.enemy.hp <= 0) {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/unit/combat.test.ts`

- [ ] **Step 5: Run full suite + lint, then commit**

```bash
npm run lint && npm test
git add src/engine/combat.ts test/unit/combat.test.ts
git commit -m "Apply weapon status effects to enemy on player attack"
```

---

## Task 7: Enemy effect application on attack

**Files:**
- Modify: `src/engine/combat.ts`
- Modify: `test/unit/combat.test.ts`

**Goal:** Enemies with `status_effect` roll their chance on hit. Bosses only apply on special attack rounds (`round % 3 === 0`). Regular enemies roll every hit.

- [ ] **Step 1: Add failing test**

```typescript
describe('enemy effect application', () => {
  const poisonEnemyData = {
    spider: {
      name: 'Spider',
      hp: 18,
      attack: 8,
      defense: 1,
      xp: 14,
      loot: [],
      region: 'wilds',
      description: 'spider',
      is_boss: false,
      status_effect: { type: 'poison' as const, damage: 2, duration: 3, chance: 100 },
    },
  };

  it('applies enemy effect to player on hit', () => {
    const player = createPlayer();
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
      loot: [],
      region: 'wilds',
      description: 'troll',
      is_boss: true,
      status_effect: { type: 'stun' as const, duration: 1, chance: 100 },
    },
  };

  it('boss applies effect only on special attack round', () => {
    const player = createPlayer();
    player.hp = 200;
    player.maxHp = 200;
    const combat = createCombat(player, 'troll', stunBossData);

    // Round 1 — not special
    playerDefend(combat, player, itemData, seededRng(1));
    expect(combat.playerEffects.some(e => e.type === 'stun')).toBe(false);

    // Round 2 — not special
    playerDefend(combat, player, itemData, seededRng(2));
    expect(combat.playerEffects.some(e => e.type === 'stun')).toBe(false);

    // Round 3 — special attack round
    playerDefend(combat, player, itemData, seededRng(3));
    expect(combat.playerEffects.some(e => e.type === 'stun')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/unit/combat.test.ts -t "enemy effect"`
Expected: FAIL.

- [ ] **Step 3: Add enemy effect application in `enemyTurn`**

In the `enemyTurn` function, after the existing damage application and before the HP check, add the enemy effect roll. The function needs to accept `enemyData` (the definition, not the instance) to read `status_effect`. Since `enemyTurn` currently doesn't have the enemy def, pass the effect config through `CombatState` or add a parameter.

**Simplest approach:** Add the raw `status_effect` to `EnemyInstance` at creation time. In `createCombat`, copy it:

```typescript
export function createCombat(_player: PlayerState, enemyId: string, enemyData: Record<string, EnemyDef>): CombatState {
  const edata = enemyData[enemyId];
  return {
    enemy: {
      // ... existing fields ...
      statusEffect: edata.status_effect ?? null,
    },
    // ...
  };
}
```

Add `statusEffect` to `EnemyInstance` in types.ts:

```typescript
export interface EnemyInstance {
  // ... existing fields ...
  statusEffect: EnemyDef['status_effect'] | null;
}
```

Then in `enemyTurn`, after the damage is dealt, add:

```typescript
  const actual = takeDamage(player, damage);
  messages.push({ text: `${combat.enemy.name} deals ${actual} damage to you.`, color: [1, 0.5, 0.5, 1] });

  // Roll enemy status effect
  const se = combat.enemy.statusEffect;
  if (se) {
    const isSpecialRound = combat.enemy.isBoss && combat.round % 3 === 0;
    const shouldRoll = combat.enemy.isBoss ? isSpecialRound : true;
    if (shouldRoll && rng() * 100 < se.chance) {
      const effect: StatusEffect = {
        type: se.type,
        damage: se.damage ?? 0,
        remaining: se.duration ?? 1,
        baseDamage: se.damage ?? 0,
      };
      applyStatusEffect(combat.playerEffects, effect);
      const label = se.type.charAt(0).toUpperCase() + se.type.slice(1);
      messages.push({ text: `You are ${label.toUpperCase()}ED!`, color: [1, 0.3, 0.1, 1] });
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/unit/combat.test.ts`

- [ ] **Step 5: Run full suite + lint, then commit**

```bash
npm run lint && npm test
git add src/engine/types.ts src/engine/combat.ts test/unit/combat.test.ts
git commit -m "Apply enemy status effects on attack, bosses on special rounds only"
```

---

## Task 8: Cure items

**Files:**
- Modify: `src/engine/combat.ts`
- Modify: `test/unit/combat.test.ts`

**Goal:** When a consumable with `cure_effects` is used in combat, remove matching effects from the player. Herbalism skill adds 10 HP on cure use.

- [ ] **Step 1: Add failing tests**

```typescript
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

    // Poison cleared, burn remains
    expect(combat.playerEffects.some(e => e.type === 'poison')).toBe(false);
    expect(combat.playerEffects.some(e => e.type === 'burn')).toBe(true);
  });

  it('herbalism skill heals 10 HP on cure use', () => {
    const player = createPlayer();
    player.hp = 10;
    player.skills.herbalism = true;
    addItem(player, 'antidote', cureItemData);
    const combat = createCombat(player, 'shadow_rat', enemyData);
    combat.playerEffects = [
      { type: 'poison', damage: 2, remaining: 3, baseDamage: 2 },
    ];

    playerUseItem(combat, player, 'antidote', cureItemData, seededRng(1));

    expect(player.hp).toBeGreaterThanOrEqual(19); // 10 + 10 - enemy damage offset
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Add cure handling in `playerUseItem`**

In `playerUseItem` in `combat.ts`, after the existing `buff_attack` branch, add:

```typescript
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
```

**Important:** The `playerUseItem` function also needs access to the `combat` state's `playerEffects`. Currently the function signature takes `combat`, so `combat.playerEffects` is accessible.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Run full suite + lint, then commit**

```bash
npm run lint && npm test
git add src/engine/combat.ts test/unit/combat.test.ts
git commit -m "Add cure items that clear status effects in combat"
```

---

## Task 9: Iron Will stun resistance

**Files:**
- Modify: `src/engine/combat.ts`
- Modify: `test/unit/combat.test.ts`

**Goal:** When an enemy applies stun to a player with Iron Will, 50% chance to resist.

- [ ] **Step 1: Add failing test**

```typescript
describe('Iron Will stun resistance', () => {
  const stunEnemyData = {
    knight: {
      name: 'Knight',
      hp: 55,
      attack: 16,
      defense: 8,
      xp: 45,
      loot: [],
      region: 'darkness',
      description: 'knight',
      is_boss: false,
      status_effect: { type: 'stun' as const, duration: 1, chance: 100 },
    },
  };

  it('resists stun 50% of the time with Iron Will', () => {
    // We test with a fixed-value RNG to control the resist roll.
    // The resist check is: rng() < 0.5 → resist.
    // We need a seed where the resist roll lands below 0.5.
    // Since multiple rng() calls happen before the resist check (damage variance,
    // crit check, etc.), we'll test the helper directly.
    const player = createPlayer();
    player.skills.iron_will = true;
    player.hp = 200;
    player.maxHp = 200;
    const combat = createCombat(player, 'knight', stunEnemyData);

    // Run multiple rounds and verify stun doesn't always apply
    let stunCount = 0;
    for (let i = 0; i < 20; i++) {
      combat.playerEffects = [];
      combat.round = 0;
      playerDefend(combat, player, itemData, seededRng(i));
      if (combat.playerEffects.some(e => e.type === 'stun')) stunCount++;
    }
    // With 50% resist and 20 trials, we expect roughly 10 stuns.
    // Assert it's not all 20 (resist never fires) and not 0 (resist always fires).
    expect(stunCount).toBeGreaterThan(0);
    expect(stunCount).toBeLessThan(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Add Iron Will resist check in `enemyTurn`**

In the enemy status effect application block (added in Task 7), before applying the stun effect, add:

```typescript
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
        const label = se.type.charAt(0).toUpperCase() + se.type.slice(1);
        messages.push({ text: `You are ${label.toUpperCase()}ED!`, color: [1, 0.3, 0.1, 1] });
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Run full suite + lint, then commit**

```bash
npm run lint && npm test
git add src/engine/combat.ts test/unit/combat.test.ts
git commit -m "Add Iron Will 50% stun resistance"
```

---

## Task 10: Content — weapon effects, enemy effects, cure items, shop stock

**Files:**
- Modify: `src/data/weapons.json`
- Modify: `src/data/enemies.json`
- Modify: `src/data/items.json`
- Modify: `src/data/shops.json`

**Goal:** Author the actual game content. No TDD for pure content — build verification is the check.

- [ ] **Step 1: Add `status_effect` to 8 weapons in `src/data/weapons.json`**

Add the field to each weapon object (after `match_words`):

- `iron_sword`: `"status_effect": {"type": "bleed", "damage": 1, "duration": 3, "chance": 25}`
- `spear`: `"status_effect": {"type": "bleed", "damage": 2, "duration": 3, "chance": 20}`
- `hrunting`: `"status_effect": {"type": "burn", "damage": 2, "duration": 2, "chance": 35}`
- `tyrfing`: `"status_effect": {"type": "poison", "damage": 3, "duration": 3, "chance": 30}`
- `dainsleif`: `"status_effect": {"type": "bleed", "damage": 3, "duration": 4, "chance": 25}`
- `excalibur`: `"status_effect": {"type": "burn", "damage": 4, "duration": 3, "chance": 30}`
- `keyblade`: `"status_effect": {"type": "stun", "damage": 0, "duration": 1, "chance": 15}`
- `masamune`: `"status_effect": {"type": "bleed", "damage": 4, "duration": 3, "chance": 35}`

- [ ] **Step 2: Add `status_effect` to 7 enemies in `src/data/enemies.json`**

- `forest_spider`: `"status_effect": {"type": "poison", "damage": 2, "duration": 3, "chance": 30}`
- `grave_wraith`: `"status_effect": {"type": "burn", "damage": 2, "duration": 2, "chance": 25}`
- `shadow_knight`: `"status_effect": {"type": "stun", "duration": 1, "chance": 20}`
- `sand_golem`: `"status_effect": {"type": "stun", "duration": 1, "chance": 15}`
- `mountain_troll`: `"status_effect": {"type": "stun", "duration": 1, "chance": 25}`
- `oblivion_guardian`: `"status_effect": {"type": "poison", "damage": 3, "duration": 4, "chance": 30}`
- `evil_king`: `"status_effect": {"type": "burn", "damage": 4, "duration": 3, "chance": 35}`

- [ ] **Step 3: Add 3 cure items to `src/data/items.json`**

```json
"antidote": {"name": "Antidote", "type": "consumable", "effect": "cure", "cure_effects": ["poison", "bleed"], "price": 8, "description": "A bitter herbal remedy. Cures poison and stops bleeding.", "match_words": ["antidote"]},
"salve": {"name": "Salve", "type": "consumable", "effect": "cure", "cure_effects": ["burn", "stun"], "price": 8, "description": "A cool ointment. Soothes burns and clears the head.", "match_words": ["salve"]},
"panacea": {"name": "Panacea", "type": "consumable", "effect": "cure", "cure_effects": ["poison", "burn", "bleed", "stun"], "price": 20, "description": "A rare elixir that cures all afflictions.", "match_words": ["panacea", "elixir"]}
```

- [ ] **Step 4: Add cure items to shop stock in `src/data/shops.json`**

Add to `manor_dusty` stock array:
```json
{ "id": "antidote", "qty": 3 },
{ "id": "salve", "qty": 3 }
```

Add to `wilds_wren` stock array:
```json
{ "id": "antidote", "qty": 5 },
{ "id": "salve", "qty": 5 }
```

Add to `wastes_hermit` stock array:
```json
{ "id": "antidote", "qty": 5 },
{ "id": "salve", "qty": 5 },
{ "id": "panacea", "qty": 2 }
```

- [ ] **Step 5: Run build + lint + test**

Run: `npm run build && npm run lint && npm test`
Expected: all clean. The build catches JSON shape mismatches.

- [ ] **Step 6: Commit**

```bash
git add src/data/weapons.json src/data/enemies.json src/data/items.json src/data/shops.json
git commit -m "Add status effects to weapons/enemies and cure items to shops"
```

---

## Task 11: Combat display — effect status lines

**Files:**
- Modify: `src/engine/state/combat.ts`

**Goal:** Show active effects as a status line after HP readouts in combat. Show enemy effects after damage lines.

- [ ] **Step 1: Add effect display helper**

In `src/engine/state/combat.ts`, add a helper function:

```typescript
function formatEffects(effects: StatusEffect[]): string {
  if (effects.length === 0) return '';
  return '  ' + effects.map(e => {
    const label = e.type.toUpperCase();
    return `[${label} ${e.remaining} rnd]`;
  }).join(' ');
}
```

Import `StatusEffect` from types at the top.

- [ ] **Step 2: Display player effects after HP in combat messages**

In `processCombatMessages` or after the combat command handler, add a line showing active player effects if any exist. After `deps.refreshHeader()`:

```typescript
  // Show active player effects
  if (store.combat && store.combat.playerEffects.length > 0) {
    const effectStr = formatEffects(store.combat.playerEffects);
    addLine(store, `Active effects:${effectStr}`, C.COMBAT_COLOR);
  }
```

- [ ] **Step 3: Run build + lint + test**

Run: `npm run build && npm run lint && npm test`

- [ ] **Step 4: Commit**

```bash
git add src/engine/state/combat.ts
git commit -m "Display active status effects in combat"
```

---

## Task 12: Update CLAUDE.md + final verification

**Files:**
- Modify: `CLAUDE.md`

**Goal:** Document the status effect system in the architecture section.

- [ ] **Step 1: Add to `CLAUDE.md`**

In the engine module list, add after `objectives.ts`:

```
combat.ts               Turn-based combat with optional injected RNG.
                        Status effects: poison, burn, bleed (escalating),
                        stun. Applied by weapons (on hit) and enemies
                        (regular: every hit; boss: special attack only).
                        Cure items clear effects via cure_effects field.
```

- [ ] **Step 2: Run final verification**

```bash
npm run build && npm run lint && npm test
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Document status effects in CLAUDE.md"
```

---

## Verification Checklist

After all tasks complete:

- [ ] `npm run build` — zero TypeScript errors
- [ ] `npm run lint` — zero warnings
- [ ] `npm test` — all tests pass
- [ ] Play-test: fight Forest Spider, verify poison applies and ticks
- [ ] Play-test: equip Iron Sword, fight Shadow Rat, verify bleed applies and escalates
- [ ] Play-test: buy antidote from Dusty, get poisoned, use antidote in combat
- [ ] Play-test: get stunned by Shadow Knight, verify only `use` works while stunned
- [ ] Play-test: equip Keyblade, stun an enemy, verify they skip a turn

## Self-Review Notes

**Spec coverage:**
- ✅ StatusEffect type: Task 1
- ✅ CombatState extensions: Task 1
- ✅ WeaponDef/EnemyDef/ItemDef extensions: Task 1
- ✅ Poison/burn DoT: Task 2
- ✅ Bleed escalation: Task 3
- ✅ Stun mechanic: Task 4
- ✅ Effect ticking in combat flow: Task 5
- ✅ Weapon effect application: Task 6
- ✅ Enemy effect application (boss special): Task 7
- ✅ Cure items: Task 8
- ✅ Iron Will stun resist: Task 9
- ✅ Herbalism cure bonus: Task 8
- ✅ Content (weapons, enemies, items, shops): Task 10
- ✅ Combat display: Task 11
- ✅ CLAUDE.md: Task 12

**Type consistency:** `StatusEffect`, `StatusEffectType`, `applyStatusEffect`, `tickStatusEffects` — consistent across all tasks. `TickResult` returned from `tickStatusEffects`. `cure_effects` on `ItemDef` is `StatusEffectType[]`.
