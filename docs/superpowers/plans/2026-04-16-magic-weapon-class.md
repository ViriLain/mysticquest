# Magic Weapon Class Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth weapon class `magic` that forces its declared status effect to proc on every third player attack, guaranteed, bypassing the normal chance roll.

**Architecture:** Data-driven, mirrors the existing weapon class pattern. Add `'magic'` to the `WeaponClass` union, add a transient `magicHitCounter` to `CombatState`, read the class in `playerAttack` to force-apply the weapon's `status_effect` on hit 3. Retag six existing weapons as magic (two need a new `status_effect` field). Update the dungeon generator to make Staff-suffix weapons magic with a generated status effect.

**Tech Stack:** TypeScript, Vitest 2.x, JSON data files.

**Spec:** [docs/superpowers/specs/2026-04-16-magic-weapon-class-design.md](../specs/2026-04-16-magic-weapon-class-design.md)

---

## File map

**Modified:**
- `src/engine/types.ts` — extend `WeaponClass` union, add `magicHitCounter` to `CombatState`
- `src/engine/combat.ts` — increment counter in `playerAttack`, force proc on hit 3, initialize counter in `createCombat`, add `procMessageFor` helper
- `src/engine/handlers/examine.ts` — add magic entry to `CLASS_BLURB` map
- `src/data/weapons.json` — retag 4 weapons; retag 2 more and add `status_effect` to them
- `src/engine/dungeon.ts` — Staff suffix maps to `magic`, generate `status_effect` for dungeon staves, thread through to the `WeaponDef` registration at line 211
- `test/unit/combat.test.ts` — add magic class passive tests, update existing test fixtures
- `test/unit/dungeon.test.ts` — verify Staff weapons are magic-class with status_effect
- `test/unit/action-handlers.test.ts` — verify examine shows [Magic] tag and blurb

**Created:**
- `test/unit/weapon-data.test.ts` — data integrity check that every magic weapon has a `status_effect`

---

### Task 1: Add `'magic'` to WeaponClass union

**Files:**
- Modify: `src/engine/types.ts:90`

- [ ] **Step 1: Extend the `WeaponClass` union**

In `src/engine/types.ts`, change line 90 from:

```typescript
export type WeaponClass = 'blade' | 'heavy' | 'pierce';
```

to:

```typescript
export type WeaponClass = 'blade' | 'heavy' | 'pierce' | 'magic';
```

- [ ] **Step 2: Run type check**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: Clean (0 errors). Existing `CLASS_BLURB` lookup in `examine.ts` will return `undefined` for magic weapons until Task 6, but that's a runtime concern (no magic weapons exist in data yet), not a type error.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All tests pass. No behavior change yet.

- [ ] **Step 4: Commit**

```bash
git add src/engine/types.ts
git commit -m "Add 'magic' literal to WeaponClass union"
```

---

### Task 2: Add `magicHitCounter` to CombatState

**Files:**
- Modify: `src/engine/types.ts:295-303`
- Modify: `src/engine/combat.ts:117-140` (inside `createCombat`)

- [ ] **Step 1: Add field to CombatState**

In `src/engine/types.ts`, change the `CombatState` interface (currently lines 295-303):

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

to:

```typescript
export interface CombatState {
  enemy: EnemyInstance;
  round: number;
  finished: boolean;
  fled: boolean;
  playerWon: boolean;
  playerEffects: StatusEffect[];
  enemyEffects: StatusEffect[];
  magicHitCounter: number;
}
```

- [ ] **Step 2: Initialize counter in `createCombat`**

In `src/engine/combat.ts`, in `createCombat` (around line 117-140), add `magicHitCounter: 0,` to the returned object. After the existing `enemyEffects: [],` line:

```typescript
  return {
    enemy: { ... },
    round: 0,
    finished: false,
    fled: false,
    playerWon: false,
    playerEffects: [],
    enemyEffects: [],
    magicHitCounter: 0,
  };
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All pass. `magicHitCounter` is initialized but never read yet.

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts src/engine/combat.ts
git commit -m "Add magicHitCounter to CombatState"
```

---

### Task 3: Add `procMessageFor` helper and forced-proc mechanic (TDD)

**Files:**
- Modify: `src/engine/combat.ts` (top of file and inside `playerAttack`)
- Modify: `test/unit/combat.test.ts`

- [ ] **Step 1: Write the first failing test — counter increments and procs on hit 3**

In `test/unit/combat.test.ts`, add a new describe block at the end of the file (before the final closing brace). The existing `weapon class passives` describe block is where class tests live — add to it if it exists, otherwise create a new one. Look for `describe('weapon class passives'` and append these tests inside it; if not found, create it.

Add this test:

```typescript
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
```

Note: using `cellar_shade` (35 HP boss) so the enemy doesn't die before the 3rd hit. The `chance: 0` on the status_effect guarantees the existing chance-roll path never applies burn — only the forced proc can.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/combat.test.ts`
Expected: FAIL — `combat.magicHitCounter` is 0 after all three calls because nothing increments it, and `enemyEffects` never contains burn.

- [ ] **Step 3: Add `procMessageFor` helper to combat.ts**

In `src/engine/combat.ts`, add this helper near the top of the file (after the existing helpers, before `function tickBuffs` at line 38):

```typescript
function procMessageFor(type: StatusEffect['type']): string {
  switch (type) {
    case 'burn': return 'Flame surges through your strike!';
    case 'poison': return 'Venom coils around the blade!';
    case 'stun': return 'Arcane force locks your foe in place!';
    case 'bleed': return 'Magic opens the wound!';
  }
}
```

- [ ] **Step 4: Increment counter and force proc in `playerAttack`**

In `src/engine/combat.ts`, inside `playerAttack`, make two edits:

**Edit 4a — increment the counter right after the `equippedWeapon` lookup.** Find the existing block at line 151:

```typescript
  combat.round++;
  const equippedWeapon = player.equippedWeapon ? weaponData[player.equippedWeapon] : null;

  // Pierce first strike message on round 1
  if (equippedWeapon?.weapon_class === 'pierce' && combat.round === 1) {
```

Insert a counter increment between the `equippedWeapon` lookup and the pierce message:

```typescript
  combat.round++;
  const equippedWeapon = player.equippedWeapon ? weaponData[player.equippedWeapon] : null;

  if (equippedWeapon?.weapon_class === 'magic') {
    combat.magicHitCounter++;
  }

  // Pierce first strike message on round 1
  if (equippedWeapon?.weapon_class === 'pierce' && combat.round === 1) {
```

**Edit 4b — force-apply the proc after the existing chance-roll block.** Find the existing block around line 227-241:

```typescript
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
```

Insert the magic forced-proc block immediately after it, before the pierce skip block:

```typescript
  // Magic class: forced proc every 3 swings, bypasses chance roll, applied in
  // addition to any roll above. Does not fire if the hit killed the enemy
  // (this block is unreachable when combat.finished is true due to the earlier
  // return on enemy death).
  if (equippedWeapon?.weapon_class === 'magic'
      && combat.magicHitCounter >= 3
      && equippedWeapon.status_effect) {
    const mse = equippedWeapon.status_effect;
    applyStatusEffect(combat.enemyEffects, {
      type: mse.type,
      damage: mse.damage,
      remaining: mse.duration,
      baseDamage: mse.damage,
    });
    messages.push({ text: procMessageFor(mse.type), color: [0.6, 0.8, 1, 1] });
    combat.magicHitCounter = 0;
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- test/unit/combat.test.ts`
Expected: PASS for the new test. Run all tests to verify nothing else broke.

Run: `npm test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/engine/combat.ts test/unit/combat.test.ts
git commit -m "Add magic weapon class passive: forced status proc every 3rd swing"
```

---

### Task 4: More magic-class tests (counter reset, bypass chance, refresh, per-weapon element)

**Files:**
- Modify: `test/unit/combat.test.ts`

- [ ] **Step 1: Test that the counter resets and procs again on hit 6**

Add to the `weapon class passives` describe block:

```typescript
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
```

- [ ] **Step 2: Test that forced proc ignores the chance roll**

```typescript
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
```

- [ ] **Step 3: Test re-application refreshes duration, does not stack**

```typescript
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
```

- [ ] **Step 4: Test that element varies per weapon**

```typescript
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
```

- [ ] **Step 5: Run tests**

Run: `npm test -- test/unit/combat.test.ts`
Expected: All new tests pass.

Run: `npm test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add test/unit/combat.test.ts
git commit -m "Add magic class tests: counter reset, chance bypass, refresh, per-weapon element"
```

---

### Task 5: Retag four existing weapons as magic

**Files:**
- Modify: `src/data/weapons.json`

- [ ] **Step 1: Change `weapon_class` for four weapons**

In `src/data/weapons.json`, change `"weapon_class": "blade"` to `"weapon_class": "magic"` for these four entries:
- `hrunting`
- `tyrfing`
- `excalibur`
- `keyblade`

Preserve all other fields (including the existing `status_effect` objects, which are required for magic to proc).

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All pass. The six magic-class tests from Tasks 3–4 still pass; no test asserts any specific weapon's class, so nothing breaks.

- [ ] **Step 3: Commit**

```bash
git add src/data/weapons.json
git commit -m "Retag Hrunting, Tyrfing, Excalibur, Keyblade as magic class"
```

---

### Task 6: Enhance Anduril and Ragnarok with `status_effect`, retag as magic

**Files:**
- Modify: `src/data/weapons.json`

- [ ] **Step 1: Add status_effect and change class for Anduril**

In `src/data/weapons.json`, find the `anduril` entry:

```json
"anduril": {"name": "Anduril", "attack_bonus": 30, "region": "darkness", "weapon_class": "blade", "price": 450, "description": "Flame of the West. Burns with white fire.", "match_words": ["anduril"]},
```

Change to:

```json
"anduril": {"name": "Anduril", "attack_bonus": 30, "region": "darkness", "weapon_class": "magic", "price": 450, "description": "Flame of the West. Burns with white fire.", "match_words": ["anduril"], "status_effect": {"type": "burn", "damage": 4, "duration": 3, "chance": 30}},
```

- [ ] **Step 2: Add status_effect and change class for Ragnarok**

In `src/data/weapons.json`, find the `ragnarok` entry:

```json
"ragnarok": {"name": "Ragnarok", "attack_bonus": 35, "region": "darkness", "weapon_class": "blade", "price": 600, "description": "The end of all things. A weapon of terrible power.", "match_words": ["ragnarok"]},
```

Change to:

```json
"ragnarok": {"name": "Ragnarok", "attack_bonus": 35, "region": "darkness", "weapon_class": "magic", "price": 600, "description": "The end of all things. A weapon of terrible power.", "match_words": ["ragnarok"], "status_effect": {"type": "burn", "damage": 5, "duration": 4, "chance": 35}},
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/data/weapons.json
git commit -m "Retag Anduril and Ragnarok as magic class with burn status"
```

---

### Task 7: Data integrity test

**Files:**
- Create: `test/unit/weapon-data.test.ts`

- [ ] **Step 1: Create the test file**

Create `test/unit/weapon-data.test.ts` with this content:

```typescript
import { describe, expect, it } from 'vitest';
import weaponsRaw from '../../src/data/weapons.json';
import type { WeaponDef } from '../../src/engine/types';

const weapons = weaponsRaw as Record<string, WeaponDef>;

describe('weapons.json data integrity', () => {
  it('every magic-class weapon has a status_effect defined', () => {
    const offenders: string[] = [];
    for (const [id, weapon] of Object.entries(weapons)) {
      if (weapon.weapon_class === 'magic' && !weapon.status_effect) {
        offenders.push(id);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every weapon declares a weapon_class', () => {
    const offenders: string[] = [];
    for (const [id, weapon] of Object.entries(weapons)) {
      if (!weapon.weapon_class) offenders.push(id);
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm test -- test/unit/weapon-data.test.ts`
Expected: Both assertions pass. All 6 magic weapons have `status_effect`. All weapons have `weapon_class`.

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add test/unit/weapon-data.test.ts
git commit -m "Add weapon data integrity test for magic status_effect"
```

---

### Task 8: Add magic entry to CLASS_BLURB and test examine output

**Files:**
- Modify: `src/engine/handlers/examine.ts:12-16`
- Modify: `test/unit/action-handlers.test.ts`

- [ ] **Step 1: Write the failing test**

In `test/unit/action-handlers.test.ts`, find the existing examine test that checks the `[Blade]` tag — look for `expect(lines.some(l => l.includes('[Blade]'))).toBe(true)`. Add a sibling test right after it:

```typescript
  it('examine weapon shows [Magic] tag and magic class blurb', () => {
    const store = freshStore();
    store.player = createPlayer();
    store.world = createWorld();
    loadRegion(store.world, manorJson as RegionData);
    addWeapon(store.player, 'hrunting');

    handleExamine(store, 'hrunting', enemyData, itemData, weaponData);
    const lines = allLines(store);

    expect(lines.some(l => l.includes('[Magic]'))).toBe(true);
    expect(lines.some(l => l.includes('Magic:') && l.includes('every third strike'))).toBe(true);
  });
```

If the existing `[Blade]` test uses different imports/helpers, copy its pattern exactly. If it passes `weaponData` from a different source, match that.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/unit/action-handlers.test.ts`
Expected: FAIL — `[Magic]` appears (handled by existing `classTag()` helper), but the blurb assertion fails because `CLASS_BLURB` has no `magic` entry, so `undefined` gets pushed to the output.

- [ ] **Step 3: Add magic entry to CLASS_BLURB**

In `src/engine/handlers/examine.ts`, find the `CLASS_BLURB` map at lines 12-16:

```typescript
const CLASS_BLURB: Record<string, string> = {
  blade: 'Blade: +10% critical hit chance',
  heavy: 'Heavy: Ignores 2 points of enemy armor',
  pierce: 'Pierce: Strike first on round 1',
};
```

Change to:

```typescript
const CLASS_BLURB: Record<string, string> = {
  blade: 'Blade: +10% critical hit chance',
  heavy: 'Heavy: Ignores 2 points of enemy armor',
  pierce: 'Pierce: Strike first on round 1',
  magic: 'Magic: every third strike weaves its element into the target, guaranteed',
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- test/unit/action-handlers.test.ts`
Expected: PASS.

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/engine/handlers/examine.ts test/unit/action-handlers.test.ts
git commit -m "Add magic class blurb to examine output"
```

---

### Task 9: Dungeon generator — Staff maps to magic with generated status_effect

**Files:**
- Modify: `src/engine/dungeon.ts:42-72, 209-217`
- Modify: `test/unit/dungeon.test.ts`

- [ ] **Step 1: Write a failing test for Staff weapons**

In `test/unit/dungeon.test.ts`, find the existing dungeon weapon tests (look for tests that call `generateDungeonWeapon` or `generateFloor`). Add this test:

```typescript
  it('Staff-suffix dungeon weapons are magic class with a status_effect', () => {
    // Search many seeds to find one that generates a Staff weapon, then
    // assert its shape. Use a small floor number for stable behavior.
    let foundStaff = false;
    for (let seed = 0; seed < 200 && !foundStaff; seed++) {
      const rng = createRng(seed);
      const weapon = generateDungeonWeapon(3, rng);
      if (weapon.name.endsWith('Staff')) {
        foundStaff = true;
        expect(weapon.weapon_class).toBe('magic');
        expect(weapon.status_effect).toBeDefined();
        expect(weapon.status_effect!.type).not.toBe('stun');
        expect(['burn', 'poison']).toContain(weapon.status_effect!.type);
      }
    }
    expect(foundStaff).toBe(true);
  });
```

If `createRng` isn't already imported in this file, add: `import { createRng } from '../../src/engine/rng';`

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/unit/dungeon.test.ts`
Expected: FAIL — `weapon.weapon_class` is `'blade'` (per current `SUFFIX_CLASS` mapping) and `weapon.status_effect` is undefined (not in the return shape).

- [ ] **Step 3: Update `SUFFIX_CLASS` and extend `generateDungeonWeapon`**

In `src/engine/dungeon.ts`, change the imports at the top (line 8) from:

```typescript
import type { RoomDef, EnemyDef, WeaponClass, WeaponDef } from './types';
```

to include `StatusEffectType`:

```typescript
import type { RoomDef, EnemyDef, StatusEffectType, WeaponClass, WeaponDef } from './types';
```

Then change `SUFFIX_CLASS` at lines 45-51 from:

```typescript
const SUFFIX_CLASS: Record<string, WeaponClass> = {
  Blade: 'blade',
  Axe: 'heavy',
  Mace: 'heavy',
  Spear: 'pierce',
  Staff: 'blade',
};
```

to:

```typescript
const SUFFIX_CLASS: Record<string, WeaponClass> = {
  Blade: 'blade',
  Axe: 'heavy',
  Mace: 'heavy',
  Spear: 'pierce',
  Staff: 'magic',
};

const MAGIC_DUNGEON_ELEMENTS: StatusEffectType[] = ['burn', 'poison'];
```

Stun is excluded from dungeon loot — guaranteed stun from random drops is too strong.

Now replace the `generateDungeonWeapon` function (lines 57-72):

```typescript
export function generateDungeonWeapon(
  floor: number,
  rng: () => number,
): {
  id: string;
  name: string;
  attack_bonus: number;
  weapon_class: WeaponClass;
  status_effect?: { type: StatusEffectType; damage: number; duration: number; chance: number };
} {
  const prefix = rngPick(rng, WEAPON_PREFIXES);
  const suffix = rngPick(rng, WEAPON_SUFFIXES);
  const name = `${prefix} ${suffix}`;
  const id = `dng_weapon_f${floor}_${prefix.toLowerCase()}_${suffix.toLowerCase()}`;
  const attack_bonus = 2 + floor * 2;
  const weapon_class = SUFFIX_CLASS[suffix] ?? 'blade';

  const result: {
    id: string;
    name: string;
    attack_bonus: number;
    weapon_class: WeaponClass;
    status_effect?: { type: StatusEffectType; damage: number; duration: number; chance: number };
  } = { id, name, attack_bonus, weapon_class };

  if (weapon_class === 'magic') {
    result.status_effect = {
      type: rngPick(rng, MAGIC_DUNGEON_ELEMENTS),
      damage: 1 + Math.floor(floor / 2),
      duration: 3,
      chance: 30,
    };
  }

  return result;
}
```

- [ ] **Step 4: Propagate the new field into floor generation**

In `src/engine/dungeon.ts`, find the block at lines 207-217 where the dungeon boss weapon is registered as a `WeaponDef`:

```typescript
    if (isFullBoss) {
      loot = ['large_potion'];
      const weapon = generateDungeonWeapon(floor, rng);
      lootWeapon = weapon.id;
      weapons[weapon.id] = {
        name: weapon.name,
        attack_bonus: weapon.attack_bonus,
        weapon_class: weapon.weapon_class,
        region: 'dungeon',
        description: `A dungeon weapon found on floor ${floor}.`,
      };
    } else if (isMiniBoss) {
```

Change the `weapons[weapon.id]` assignment to include the optional `status_effect`:

```typescript
    if (isFullBoss) {
      loot = ['large_potion'];
      const weapon = generateDungeonWeapon(floor, rng);
      lootWeapon = weapon.id;
      weapons[weapon.id] = {
        name: weapon.name,
        attack_bonus: weapon.attack_bonus,
        weapon_class: weapon.weapon_class,
        region: 'dungeon',
        description: `A dungeon weapon found on floor ${floor}.`,
        ...(weapon.status_effect ? { status_effect: weapon.status_effect } : {}),
      };
    } else if (isMiniBoss) {
```

- [ ] **Step 5: Run the dungeon test**

Run: `npm test -- test/unit/dungeon.test.ts`
Expected: PASS.

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add src/engine/dungeon.ts test/unit/dungeon.test.ts
git commit -m "Staff dungeon weapons become magic class with generated status_effect"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass. Counts increase over the pre-feature baseline (~236) by the number of new tests added (~7 in combat + 2 in weapon-data + 1 in action-handlers + 1 in dungeon = 11 or so).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: Clean.

- [ ] **Step 3: Run type check**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: Clean.

- [ ] **Step 4: Smoke test in dev server**

Run: `npm run dev`
In the browser, start a new game, use the `give` debug command if available (or progress through early combat), examine a magic weapon (`examine hrunting` once it's obtained), and verify:
- The line shows `[Magic] Hrunting`
- The blurb line shows `Magic: every third strike weaves its element into the target, guaranteed`
- In combat with Hrunting equipped, the third attack shows "Flame surges through your strike!" and the enemy is now burning

If any of these don't render correctly, stop and fix before moving on.

- [ ] **Step 5: Final commit (only if needed)**

No final commit unless the smoke test surfaced a fix. If everything works, the feature is complete.
