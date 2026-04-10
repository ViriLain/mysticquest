# Combat Status Effects — Design Spec

**Date:** 2026-04-08
**Branch target:** new feature branch off `main`

## Motivation

Combat is "attack until one HP bar is zero." Both the player and enemies have no persistent round-to-round mechanics beyond a temporary attack buff from Strength Tonic. Adding status effects creates tactical decisions: "should I switch to my poison sword for this long fight or keep the high-ATK blade?" and "should I cure this stun now or heal instead?"

## Design Principles

1. **Small vocabulary.** Four effects in v1: poison, burn, bleed, stun. Each is mechanically distinct.
2. **Both sides.** Weapons inflict effects on enemies. Enemies inflict effects on the player. Symmetric combat is what creates real tactical depth.
3. **Curable.** Every effect has at least one cure item. Players who prepare aren't helpless.
4. **Deterministic-testable.** Combat already accepts an injected RNG. Status effect chance rolls use the same RNG so tests are deterministic.

## Status Effects

### Poison
- **Source:** Enemy attacks (Forest Spider, Oblivion Guardian), player weapons (Tyrfing)
- **Mechanic:** Flat X damage per round for N rounds, ignores defense
- **Cure:** Antidote, Panacea

### Burn
- **Source:** Enemy attacks (Grave Wraith, Evil King), player weapons (Hrunting, Excalibur)
- **Mechanic:** Flat X damage per round for N rounds, ignores defense
- **Distinct from poison:** Thematically different sources. Mechanically identical in v1 but tracked separately so they can stack (a target can be poisoned AND burning simultaneously).
- **Cure:** Salve, Panacea

### Bleed
- **Source:** Player weapons only (Iron Sword, Spear, Dainsleif, Masamune)
- **Mechanic:** X damage per round, **escalates by +1 each tick** (round 1: X, round 2: X+1, round 3: X+2...). Ignores defense. Rewards committing to long fights.
- **Not on enemies:** Bleed is the player's unique weapon mechanic. Enemies don't bleed the player.
- **Cure:** N/A (enemy-side only, enemies don't cure)

### Stun
- **Source:** Enemy attacks (Shadow Knight, Sand Golem, Mountain Troll boss special), one rare player weapon (Keyblade)
- **Mechanic:** Target skips their next action. Duration is always 1 round. Cannot chain (if already stunned, re-applying refreshes to 1 but doesn't extend).
- **Stunned player:** Can only `use <item>`. Cannot attack, defend, or flee. The terminal shows `You are stunned!` and the command prompt only accepts `use`. This sells the effect — the player feels the restriction.
- **Stunned enemy:** Skips their attack for one round. `The Shadow Knight is stunned and can't act!`
- **Cure:** Salve, Panacea. Also: **Iron Will** skill gives 50% chance to resist stun on application.

## Data Model

### `StatusEffect` (new type, combat-only, not persisted in saves)

```typescript
interface StatusEffect {
  type: 'poison' | 'burn' | 'bleed' | 'stun';
  damage: number;    // per-tick damage (0 for stun)
  remaining: number; // rounds left
  baseDamage: number; // original damage (used for bleed escalation reset)
}
```

### `CombatState` additions

```typescript
interface CombatState {
  // ... existing fields ...
  playerEffects: StatusEffect[];
  enemyEffects: StatusEffect[];
}
```

Initialized to `[]` in `createCombat`.

### `WeaponDef` addition

```typescript
interface WeaponDef {
  // ... existing fields ...
  status_effect?: {
    type: 'poison' | 'burn' | 'bleed' | 'stun';
    damage: number;
    duration: number;
    chance: number; // 0–100, percent per hit
  };
}
```

### `EnemyDef` addition

```typescript
interface EnemyDef {
  // ... existing fields ...
  status_effect?: {
    type: 'poison' | 'burn' | 'stun';
    damage?: number;   // default 0 for stun
    duration?: number;  // default 1 for stun
    chance: number;    // 0–100
  };
}
```

No `bleed` on enemies — that's the player's unique weapon mechanic.

## Combat Flow (one round of `playerAttack`)

1. **Tick player effects.** For each effect on the player:
   - Poison/burn: deal `effect.damage` to player (ignores defense), print message
   - Bleed: deal `effect.damage` to player, then increment `effect.damage` (escalation). Not applicable in v1 (bleed is player→enemy only), but the engine handles it generically.
   - Stun: flag `playerStunned = true`
   - Decrement `remaining`. Remove if `remaining <= 0`.
   - If player dies from DoT, combat ends immediately.

2. **Check player stun.** If `playerStunned`:
   - Print `You are stunned! You can only use items.`
   - Return early (the `playerAttack` function was called, but the player's action is blocked). The caller (`state/combat.ts`) must handle this — if the player typed `attack`/`defend`/`flee` while stunned, print the stun message and don't consume the command. Only `use <item>` goes through.

3. **Player deals damage.** Normal attack math (existing code).

4. **Roll weapon effect.** If the player's equipped weapon has `status_effect`:
   - Roll `rng() * 100 < chance`
   - On success: apply `StatusEffect` to enemy. If same type already active, refresh duration (reset `remaining` to `duration`, reset `damage` to `baseDamage` for bleed). Don't stack.
   - Print `The enemy is now [POISONED/BURNING/BLEEDING/STUNNED]!`

5. **Tick enemy effects.** Same logic as step 1 but on the enemy. Bleed escalates here.

6. **Enemy turn.** If enemy is stunned: print `[Enemy] is stunned and can't act!`, skip. Otherwise:
   - Normal enemy attack (existing code)
   - Roll enemy effect. If `enemy.status_effect` and roll succeeds:
     - If type is `stun` and player has Iron Will skill: 50% resist chance → `Your Iron Will resists the stun!`
     - Apply `StatusEffect` to player

7. **Tick buffs + meditation.** Existing behavior unchanged.

### Other action flows

- **`playerDefend`:** Same flow but skip step 3–4 (no attack, no weapon effect). Player still takes DoT from effects, enemy still attacks, enemy can still apply effects.
- **`playerFlee`:** DoT ticks before the flee attempt. If player dies from DoT, combat ends. Otherwise flee roll proceeds normally.
- **`playerUseItem`:** If the item is a cure (antidote/salve/panacea), clear the matching effects. DoT still ticks. Enemy still attacks after. Usable while stunned (this is the stun exception per the design decision).

## Stacking Rules

- **Same type refreshes duration**, does not stack damage. Bleed resets escalation counter on refresh.
- **Different types coexist.** A target can be poisoned, burning, AND bleeding simultaneously. Each ticks independently.
- **Stun is always 1 round.** Re-applying stun while already stunned just refreshes to 1 round (no extension).

## Combat Display

Active effects shown as a status line when present:

Player effects (after HP display):
```
You have 22/30 HP.  [POISONED 2 rnd] [BURNING 1 rnd]
```

Enemy effects (after damage dealt):
```
You deal 8 damage to Shadow Knight.
The enemy is now BLEEDING! [BLEEDING 3 rnd]
Shadow Knight has 47 HP remaining. [BLEEDING 3 rnd]
```

## Weapon Effect Assignments

| Weapon | ATK | Region | Effect |
|--------|-----|--------|--------|
| Iron Sword | +5 | Manor (boss drop) | Bleed: 1 dmg, 3 rnd, 25% |
| Spear | +6 | Wilds (shop) | Bleed: 2 dmg, 3 rnd, 20% |
| Hrunting | +10 | Wilds (search) | Burn: 2 dmg, 2 rnd, 35% |
| Tyrfing | +12 | Wilds (search) | Poison: 3 dmg, 3 rnd, 30% |
| Dainsleif | +14 | Darkness | Bleed: 3 dmg, 4 rnd, 25% |
| Excalibur | +15 | Darkness | Burn: 4 dmg, 3 rnd, 30% |
| Keyblade | +28 | Darkness (boss drop) | Stun: 0 dmg, 1 rnd, 15% |
| Masamune | +20 | Wastes (boss drop) | Bleed: 4 dmg, 3 rnd, 35% |

Weapons without effects (pure ATK): Rusty Dagger, Hammer, Steel Sword, Mjolnir, Gungnir, Vorpal Sword, Peacemaker, Anduril, Buster Sword, Ragnarok, Badger on Stick, Falcon Punch.

## Enemy Effect Assignments

| Enemy | Region | Effect | Notes |
|-------|--------|--------|-------|
| Forest Spider | Wilds | Poison: 2 dmg, 3 rnd, 30% | First encounter with effects |
| Grave Wraith | Darkness | Burn: 2 dmg, 2 rnd, 25% | Spectral fire |
| Shadow Knight | Darkness | Stun: 1 rnd, 20% | Shield bash |
| Sand Golem | Wastes | Stun: 1 rnd, 15% | Crushing blow |
| Mountain Troll (boss) | Wilds | Stun: 1 rnd, 25% | On special attack (round % 3) only |
| Oblivion Guardian (boss) | Darkness | Poison: 3 dmg, 4 rnd, 30% | Corruption |
| Evil King (boss) | Darkness | Burn: 4 dmg, 3 rnd, 35% | Dark fire |

Enemies without effects: Shadow Rat, Manor Ghost, Cellar Shade, Wasteland Wraith, Ruins Guardian, Milo.

**Boss special attack change:** Bosses with a `status_effect` apply it on their special attack round (`round % 3 === 0`) in addition to the existing 1.5x damage multiplier. The `chance` roll only happens on the special round, not every hit. Regular enemies roll their `status_effect` chance on every attack.

## Cure Items

### New items in `items.json`

```json
{
  "antidote": {
    "name": "Antidote",
    "type": "consumable",
    "effect": "cure",
    "cure_effects": ["poison", "bleed"],
    "price": 8,
    "description": "A bitter herbal remedy. Cures poison and stops bleeding.",
    "match_words": ["antidote"]
  },
  "salve": {
    "name": "Salve",
    "type": "consumable",
    "effect": "cure",
    "cure_effects": ["burn", "stun"],
    "price": 8,
    "description": "A cool ointment. Soothes burns and clears the head.",
    "match_words": ["salve"]
  },
  "panacea": {
    "name": "Panacea",
    "type": "consumable",
    "effect": "cure",
    "cure_effects": ["poison", "burn", "bleed", "stun"],
    "price": 20,
    "description": "A rare elixir that cures all afflictions.",
    "match_words": ["panacea", "elixir"]
  }
}
```

### New `cure_effects` field on `ItemDef`

```typescript
interface ItemDef {
  // ... existing fields ...
  cure_effects?: string[]; // status effect types this item clears
}
```

### Shop stock additions

| Shop | New stock |
|------|-----------|
| Dusty (manor) | Antidote x3, Salve x3 |
| Wren (wilds) | Antidote x5, Salve x5 |
| Hermit (wastes) | Antidote x5, Salve x5, Panacea x2 |

### Skill augments

- **Iron Will** (warrior, tier 1): Add 50% stun resist. On stun application, roll `rng() < 0.5` — if success, resist and print `Your Iron Will resists the stun!`
- **Herbalism** (mage, tier 1): When using any cure item (antidote/salve/panacea), also heal 10 HP. Stacks with the existing +50% potion healing bonus.

## Files Touched

### New
- None (all changes go into existing files)

### Modified
- `src/engine/types.ts` — `StatusEffect` type, `CombatState.playerEffects/enemyEffects`, `WeaponDef.status_effect`, `EnemyDef.status_effect`, `ItemDef.cure_effects`
- `src/engine/combat.ts` — effect application, ticking, stun logic, cure handling in `playerUseItem`
- `src/data/weapons.json` — add `status_effect` to 8 weapons
- `src/data/enemies.json` — add `status_effect` to 7 enemies
- `src/data/items.json` — add 3 cure items
- `src/data/shops.json` — add cure items to shop stock
- `src/engine/state/combat.ts` — stun blocks attack/defend/flee, show effect status line
- `test/unit/combat.test.ts` — new tests for each effect type, curing, stun behavior, bleed escalation

## Testing Plan

All tests use the injected RNG for deterministic results.

1. **Poison application:** Player hits with Tyrfing, RNG returns below chance threshold → enemy gets poison effect. Assert `enemyEffects` contains poison with correct damage/duration.
2. **Poison tick:** Enemy has poison (2 dmg, 2 rnd). After one round, enemy takes 2 damage and remaining decrements to 1. After second round, effect removed.
3. **Burn application + stacking with poison:** Enemy is poisoned AND burned. Both tick independently per round.
4. **Bleed escalation:** Enemy has bleed (1 dmg, 3 rnd). Round 1: 1 dmg. Round 2: 2 dmg. Round 3: 3 dmg. Total: 6.
5. **Stun on player:** Enemy stuns player. Next round, player can only use items — attack/defend/flee are blocked. After the stunned round, player acts normally.
6. **Stun on enemy:** Keyblade stuns enemy. Next round, enemy skips attack.
7. **Cure item:** Player has poison + burn. Uses antidote → poison removed, burn remains. Uses salve → burn removed.
8. **Iron Will stun resist:** Player has Iron Will. Enemy stuns player. RNG returns < 0.5 → stun resisted.
9. **Herbalism cure bonus:** Player has Herbalism. Uses antidote → poison cleared AND heals 10 HP.
10. **Same-type refresh:** Enemy already has 3-rnd poison. Player applies 3-rnd poison again → remaining resets to 3, damage unchanged.
11. **Boss special effect:** Mountain Troll on round 3 (special) applies stun instead of/alongside 1.5x damage.
12. **DoT kills:** Player at 1 HP with poison. Start of round, poison ticks for 2 → player dies. Combat ends without player acting.

## Non-Goals

- No overworld effects (poison doesn't tick while exploring)
- No effect resistance stat on shields/armor
- No effect-immune enemies
- No new skill tree nodes
- No weapon class system (deferred — see future plans)
- No visual effect animations for status effects (just text indicators)
