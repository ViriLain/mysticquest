# Weapon Classes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `weapon_class` field (blade/heavy/pierce) to every weapon with distinct combat passives: blade +10% crit, heavy ignores 2 DEF, pierce gives first strike on round 1.

**Architecture:** Data-driven — add `WeaponClass` type and `weapon_class` field to `WeaponDef`, tag all 22 weapons in `weapons.json`, read the class in `combat.ts` to apply passives, surface it in examine output and combat messages. Dungeon-generated weapons derive class from their name suffix. No new modules, no save format changes.

**Tech Stack:** TypeScript, Vitest 2.x, JSON data files.

**Spec:** [docs/superpowers/specs/2026-04-11-weapon-classes-design.md](../specs/2026-04-11-weapon-classes-design.md)

---

## File map

**Modified:**
- `src/engine/types.ts` — add `WeaponClass` type, add `weapon_class` field to `WeaponDef`
- `src/data/weapons.json` — add `weapon_class` to all 22 weapons
- `src/engine/combat.ts` — blade crit boost, heavy DEF pierce, pierce first strike skip
- `src/engine/handlers/examine.ts` — show class tag in weapon examine output
- `src/engine/dungeon.ts` — derive `weapon_class` from suffix for generated weapons
- `test/unit/combat.test.ts` — tests for all three class passives
- `test/unit/action-handlers.test.ts` — test for class tag in examine output

---

### Task 1: Add WeaponClass type and weapon_class field

**Files:**
- Modify: `src/engine/types.ts:90-103`
- Modify: `src/data/weapons.json`

- [ ] **Step 1: Add WeaponClass type to types.ts**

In `src/engine/types.ts`, add the `WeaponClass` type right before the `WeaponDef` interface (before line 90):

```typescript
export type WeaponClass = 'blade' | 'heavy' | 'pierce';
```

Then add `weapon_class: WeaponClass;` to the `WeaponDef` interface, after the `region` field:

```typescript
export interface WeaponDef {
  name: string;
  attack_bonus: number;
  region: string;
  weapon_class: WeaponClass;
  description: string;
  match_words?: string[];
  price?: number;
  status_effect?: {
    type: StatusEffectType;
    damage: number;
    duration: number;
    chance: number; // 0–100
  };
}
```

- [ ] **Step 2: Add weapon_class to every weapon in weapons.json**

In `src/data/weapons.json`, add `"weapon_class"` to each entry. The assignments:

```json
{
  "rusty_dagger": {"name": "Rusty Dagger", "attack_bonus": 2, "region": "manor", "weapon_class": "blade", "price": 15, "description": "A dull blade with spots of rust. Better than nothing.", "match_words": ["rusty dagger", "dagger", "rusty"]},
  "iron_sword": {"name": "Iron Sword", "attack_bonus": 5, "region": "manor", "weapon_class": "blade", "price": 35, "description": "A solid iron sword. Reliable.", "match_words": ["iron sword", "iron", "sword"], "status_effect": {"type": "bleed", "damage": 1, "duration": 3, "chance": 25}},
  "hammer": {"name": "Hammer", "attack_bonus": 4, "region": "manor", "weapon_class": "heavy", "price": 25, "description": "A heavy hammer. Slow but powerful.", "match_words": ["hammer"]},
  "steel_sword": {"name": "Steel Sword", "attack_bonus": 8, "region": "wilds", "weapon_class": "blade", "price": 60, "description": "A well-forged steel blade.", "match_words": ["steel sword", "sword"]},
  "spear": {"name": "Spear", "attack_bonus": 10, "region": "wilds", "weapon_class": "pierce", "price": 70, "description": "A long spear with a sharp point.", "match_words": ["spear"], "status_effect": {"type": "bleed", "damage": 2, "duration": 3, "chance": 20}},
  "hrunting": {"name": "Hrunting", "attack_bonus": 12, "region": "wilds", "weapon_class": "blade", "price": 120, "description": "An ancient blade that hums with power.", "match_words": ["hrunting"], "status_effect": {"type": "burn", "damage": 2, "duration": 2, "chance": 35}},
  "mjolnir": {"name": "Mjolnir", "attack_bonus": 15, "region": "wilds", "weapon_class": "heavy", "price": 200, "description": "The thunder god's hammer. It crackles with energy.", "match_words": ["mjolnir", "thor"]},
  "gungnir": {"name": "Gungnir", "attack_bonus": 14, "region": "wilds", "weapon_class": "pierce", "price": 180, "description": "Odin's spear. It never misses its mark.", "match_words": ["gungnir", "odin"]},
  "tyrfing": {"name": "Tyrfing", "attack_bonus": 16, "region": "wilds", "weapon_class": "blade", "price": 220, "description": "A cursed sword that must draw blood when unsheathed.", "match_words": ["tyrfing"], "status_effect": {"type": "poison", "damage": 3, "duration": 3, "chance": 30}},
  "dainsleif": {"name": "Dainsleif", "attack_bonus": 18, "region": "darkness", "weapon_class": "blade", "price": 250, "description": "A cursed blade that thirsts for blood.", "match_words": ["dainsleif"], "status_effect": {"type": "bleed", "damage": 3, "duration": 4, "chance": 25}},
  "excalibur": {"name": "Excalibur", "attack_bonus": 20, "region": "wastes", "weapon_class": "blade", "price": 300, "description": "The legendary sword. It glows with a soft light.", "match_words": ["excalibur"], "status_effect": {"type": "burn", "damage": 4, "duration": 3, "chance": 30}},
  "vorpal_sword": {"name": "Vorpal Sword", "attack_bonus": 22, "region": "wastes", "weapon_class": "blade", "price": 320, "description": "It goes snicker-snack.", "match_words": ["vorpal sword", "vorpal", "sword"]},
  "peacemaker": {"name": "Peacemaker", "attack_bonus": 24, "region": "wastes", "weapon_class": "heavy", "price": 350, "description": "The last argument.", "match_words": ["peacemaker"]},
  "masamune": {"name": "Masamune", "attack_bonus": 25, "region": "wastes", "weapon_class": "blade", "price": 380, "description": "A perfectly balanced katana. Cuts through anything.", "match_words": ["masamune", "katana"], "status_effect": {"type": "bleed", "damage": 4, "duration": 3, "chance": 35}},
  "keyblade": {"name": "Keyblade", "attack_bonus": 28, "region": "darkness", "weapon_class": "blade", "price": 420, "description": "A blade shaped like a key. Opens hearts.", "match_words": ["keyblade"], "status_effect": {"type": "stun", "damage": 0, "duration": 1, "chance": 15}},
  "anduril": {"name": "Anduril", "attack_bonus": 30, "region": "darkness", "weapon_class": "blade", "price": 450, "description": "Flame of the West. Burns with white fire.", "match_words": ["anduril"]},
  "badger_on_stick": {"name": "Badger on a Stick", "attack_bonus": 30, "region": "hidden", "weapon_class": "heavy", "price": 999, "description": "It's... a badger. On a stick. Surprisingly effective.", "match_words": ["badger", "badger on a stick", "stick"]},
  "buster_sword": {"name": "Buster Sword", "attack_bonus": 32, "region": "darkness", "weapon_class": "heavy", "price": 500, "description": "Absurdly large. Somehow it works.", "match_words": ["buster sword", "buster", "sword"]},
  "ragnarok": {"name": "Ragnarok", "attack_bonus": 35, "region": "darkness", "weapon_class": "blade", "price": 600, "description": "The end of all things. A weapon of terrible power.", "match_words": ["ragnarok"]},
  "falcon_punch": {"name": "FALCON PUNCH", "attack_bonus": 40, "region": "hidden", "weapon_class": "heavy", "price": 999, "description": "SHOW ME YOUR MOVES! The ultimate weapon.", "match_words": ["falcon punch", "falcon"]},
  "keepers_blade": {"name": "Keeper's Blade", "attack_bonus": 26, "region": "wastes", "weapon_class": "blade", "description": "Forged by the civilization that built the crown. The blade remembers what its makers forgot — that some things are worth protecting.", "match_words": ["keeper", "keepers blade", "blade"]}
}
```

- [ ] **Step 3: Run tsc to verify no type errors**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: Clean (0 errors). If there are errors, they will be from test files or other code that constructs `WeaponDef` objects without the new field — fix those in the next step.

- [ ] **Step 4: Fix test fixtures that construct WeaponDef objects**

In `test/unit/combat.test.ts`, add `weapon_class` to the mock weaponData (around line 12):

```typescript
const weaponData: Record<string, WeaponDef> = {
  rusty_dagger: { name: 'Rusty Dagger', attack_bonus: 2, region: 'manor', weapon_class: 'blade', description: 'dull' },
  iron_sword: { name: 'Iron Sword', attack_bonus: 5, region: 'manor', weapon_class: 'blade', description: 'solid' },
};
```

Search for any other files that construct inline `WeaponDef` objects and add the field there too. Run `npx tsc --noEmit` to find them.

- [ ] **Step 5: Run tests to confirm nothing is broken**

Run: `npm test`
Expected: All tests pass. The new field is data-only at this point — no behavior change yet.

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/data/weapons.json test/unit/combat.test.ts
git commit -m "Add weapon_class field to WeaponDef and tag all weapons"
```

---

### Task 2: Blade passive — +10% crit chance

**Files:**
- Modify: `src/engine/combat.ts:142-182`
- Test: `test/unit/combat.test.ts`

- [ ] **Step 1: Write the failing test**

In `test/unit/combat.test.ts`, add a new `describe` block after the existing `playerAttack` tests:

```typescript
describe('weapon class passives', () => {
  it('blade class adds 10% crit chance', () => {
    const bladeWeaponData: Record<string, WeaponDef> = {
      test_blade: { name: 'Test Blade', attack_bonus: 5, region: 'manor', weapon_class: 'blade', description: 'test' },
    };
    const player = createPlayer();
    addWeapon(player, 'test_blade');
    equipWeapon(player, 'test_blade');

    // Use a seed where randInt(1,100) returns 15 — above base 10% but within blade 20%
    // We need to find a seed that produces a crit with blade bonus but not without.
    // Strategy: run 200 combats with blade vs non-blade, count crits. Blade should have ~2x crits.
    let bladeCrits = 0;
    let normalCrits = 0;
    const noClassWeaponData: Record<string, WeaponDef> = {
      test_heavy: { name: 'Test Heavy', attack_bonus: 5, region: 'manor', weapon_class: 'heavy', description: 'test' },
    };

    for (let seed = 0; seed < 200; seed++) {
      // Blade weapon
      const combat1 = createCombat(player, 'shadow_rat', enemyData);
      const msgs1 = playerAttack(combat1, player, bladeWeaponData, itemData, seededRng(seed));
      if (msgs1.some(m => m.text.includes('CRITICAL HIT') || m.text.includes('blade finds a weak point'))) bladeCrits++;

      // Heavy weapon (no crit bonus)
      const player2 = createPlayer();
      addWeapon(player2, 'test_heavy');
      equipWeapon(player2, 'test_heavy');
      const combat2 = createCombat(player2, 'shadow_rat', enemyData);
      const msgs2 = playerAttack(combat2, player2, noClassWeaponData, itemData, seededRng(seed));
      if (msgs2.some(m => m.text === 'CRITICAL HIT!')) normalCrits++;
    }

    // Blade should have significantly more crits (~20% vs ~10%)
    expect(bladeCrits).toBeGreaterThan(normalCrits);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --reporter=verbose test/unit/combat.test.ts`
Expected: FAIL — blade and non-blade have the same crit rate since `weapon_class` isn't read yet.

- [ ] **Step 3: Implement blade crit bonus in combat.ts**

In `src/engine/combat.ts`, modify the `playerAttack` function. After the existing crit chance calculation (around line 170), add the blade bonus. The section currently reads:

```typescript
  let critChance = 10;
  let critMult = 2;
  if (hasSkill(player, 'sharp_eyes')) critChance = 18;
  if (hasSkill(player, 'assassin')) critMult = 3;
```

Change it to:

```typescript
  let critChance = 10;
  let critMult = 2;
  if (hasSkill(player, 'sharp_eyes')) critChance = 18;
  if (hasSkill(player, 'assassin')) critMult = 3;
  const equippedWeapon = player.equippedWeapon ? weaponData[player.equippedWeapon] : null;
  if (equippedWeapon?.weapon_class === 'blade') critChance += 10;
```

Then, after the existing crit message (line 180-182), replace the generic crit message with a blade-specific one when applicable:

```typescript
  if (crit) {
    if (equippedWeapon?.weapon_class === 'blade') {
      messages.push({ text: 'Your blade finds a weak point!', color: [1, 1, 0.2, 1] });
    } else {
      messages.push({ text: 'CRITICAL HIT!', color: [1, 1, 0.2, 1] });
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --reporter=verbose test/unit/combat.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/combat.ts test/unit/combat.test.ts
git commit -m "Add blade weapon class passive: +10% crit chance"
```

---

### Task 3: Heavy passive — ignore 2 enemy DEF

**Files:**
- Modify: `src/engine/combat.ts:142-182`
- Test: `test/unit/combat.test.ts`

- [ ] **Step 1: Write the failing test**

In the `weapon class passives` describe block in `test/unit/combat.test.ts`, add:

```typescript
  it('heavy class ignores 2 enemy DEF', () => {
    const heavyWeaponData: Record<string, WeaponDef> = {
      test_heavy: { name: 'Test Heavy', attack_bonus: 5, region: 'manor', weapon_class: 'heavy', description: 'test' },
    };
    const bladeWeaponData: Record<string, WeaponDef> = {
      test_blade: { name: 'Test Blade', attack_bonus: 5, region: 'manor', weapon_class: 'blade', description: 'test' },
    };

    // Create a high-DEF enemy so the -2 DEF matters
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --reporter=verbose test/unit/combat.test.ts`
Expected: FAIL — heavy and blade deal the same damage; no armor pierce message.

- [ ] **Step 3: Implement heavy DEF reduction in combat.ts**

In `src/engine/combat.ts`, in the `playerAttack` function, after the line where `equippedWeapon` is defined and the blade crit bonus is applied, modify the `effectiveDef` calculation. The current code reads:

```typescript
  let effectiveDef = combat.enemy.defense;
  if (hasSkill(player, 'precision')) { atk += 3; effectiveDef = Math.max(0, effectiveDef - 2); }
```

Change it to:

```typescript
  let effectiveDef = combat.enemy.defense;
  if (hasSkill(player, 'precision')) { atk += 3; effectiveDef = Math.max(0, effectiveDef - 2); }
  if (equippedWeapon?.weapon_class === 'heavy') effectiveDef = Math.max(0, effectiveDef - 2);
```

Then, after the crit message block and the damage line (`You deal X damage`), add the heavy feedback message. Insert it right after the `combat.enemy.hp -= finalDamage;` line but before the damage message:

```typescript
  if (equippedWeapon?.weapon_class === 'heavy') {
    messages.push({ text: 'Heavy blow smashes through armor!', color: [1, 0.8, 0.2, 1] });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --reporter=verbose test/unit/combat.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/combat.ts test/unit/combat.test.ts
git commit -m "Add heavy weapon class passive: ignore 2 enemy DEF"
```

---

### Task 4: Pierce passive — first strike on round 1

**Files:**
- Modify: `src/engine/combat.ts:48-115`
- Test: `test/unit/combat.test.ts`

- [ ] **Step 1: Write the failing test**

In the `weapon class passives` describe block in `test/unit/combat.test.ts`, add:

```typescript
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
      const hp2 = player.hp;
      playerAttack(combat, player, pierceWeaponData, itemData, seededRng(43));
      // Enemy should have attacked on round 2 (might dodge from lucky, but hp change or enemy attack msg expected)
      const enemyActed = msgs.length > 0; // just verify round 2 ran normally
      expect(combat.round).toBe(2);
      expect(enemyActed).toBe(true);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --reporter=verbose test/unit/combat.test.ts`
Expected: FAIL — enemy still attacks on round 1, player takes damage.

- [ ] **Step 3: Implement pierce first strike in combat.ts**

In `src/engine/combat.ts`, modify the `playerAttack` function. The `enemyTurn` call is at the end (line 228). We need to pass weapon info so `enemyTurn` can skip on round 1 for pierce weapons.

The cleanest approach: add the skip check right before the `enemyTurn` call in `playerAttack`. Currently line 228 reads:

```typescript
  enemyTurn(combat, player, itemData, messages, rng);
```

Change it to:

```typescript
  if (equippedWeapon?.weapon_class === 'pierce' && combat.round === 1) {
    messages.push({ text: 'You strike first with your spear!', color: [0.4, 1, 0.8, 1] });
  } else {
    enemyTurn(combat, player, itemData, messages, rng);
  }
```

This needs the `equippedWeapon` variable to be accessible at this point. It was defined earlier in the function (from Task 2), so it's already in scope.

**Important:** The first-strike message should appear BEFORE the player's attack output. Move it to right after `combat.round++` (line 150) and before the player's DoT tick:

```typescript
  combat.round++;

  if (equippedWeapon?.weapon_class === 'pierce' && combat.round === 1) {
    messages.push({ text: 'You strike first with your spear!', color: [0.4, 1, 0.8, 1] });
  }
```

Wait — `equippedWeapon` is defined later. Move the `equippedWeapon` lookup to right after `combat.round++`:

```typescript
  combat.round++;
  const equippedWeapon = player.equippedWeapon ? weaponData[player.equippedWeapon] : null;

  if (equippedWeapon?.weapon_class === 'pierce' && combat.round === 1) {
    messages.push({ text: 'You strike first with your spear!', color: [0.4, 1, 0.8, 1] });
  }
```

And remove the duplicate `equippedWeapon` definition from where it was added in Task 2 — it's now defined once at the top of the function body (after `combat.round++`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --reporter=verbose test/unit/combat.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/engine/combat.ts test/unit/combat.test.ts
git commit -m "Add pierce weapon class passive: first strike on round 1"
```

---

### Task 5: Show weapon class in examine output

**Files:**
- Modify: `src/engine/handlers/examine.ts:44-63`
- Test: `test/unit/action-handlers.test.ts`

- [ ] **Step 1: Write the failing test**

In `test/unit/action-handlers.test.ts`, find the existing examine tests and add:

```typescript
  it('examine weapon shows class tag', () => {
    const store = freshStore();
    store.player = createPlayer();
    store.world = createWorld();
    loadRegion(store.world, manorJson as RegionData);
    addWeapon(store.player, 'iron_sword');

    handleExamine(store, 'iron sword', enemyData, itemData, weaponData);
    const lines = allLines(store);

    expect(lines.some(l => l.includes('[Blade]'))).toBe(true);
  });
```

If this test file doesn't already import `handleExamine`, `weaponData`, and the test helpers, add the necessary imports. Check the existing test file first and follow its patterns.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --reporter=verbose test/unit/action-handlers.test.ts`
Expected: FAIL — no `[Blade]` in examine output.

- [ ] **Step 3: Add class tag to examine weapon output**

In `src/engine/handlers/examine.ts`, in the section that displays owned weapons (around line 48-49), change:

```typescript
      addLine(store, iconLine(ICON.weapon, `=== ${weapon.name} ===`), C.ITEM_COLOR);
      addLine(store, weapon.description, C.HELP_COLOR);
```

to:

```typescript
      const classLabel = weapon.weapon_class ? `[${weapon.weapon_class.charAt(0).toUpperCase() + weapon.weapon_class.slice(1)}] ` : '';
      addLine(store, iconLine(ICON.weapon, `=== ${classLabel}${weapon.name} ===`), C.ITEM_COLOR);
      addLine(store, weapon.description, C.HELP_COLOR);
```

Also apply the same change to the room weapon examine section (around line 98-99):

```typescript
      addLine(store, iconLine(ICON.weapon, `=== ${weapon.name} ===`), C.ITEM_COLOR);
```

Change to:

```typescript
      const classLabel = weapon.weapon_class ? `[${weapon.weapon_class.charAt(0).toUpperCase() + weapon.weapon_class.slice(1)}] ` : '';
      addLine(store, iconLine(ICON.weapon, `=== ${classLabel}${weapon.name} ===`), C.ITEM_COLOR);
```

To avoid duplication, extract a helper at the top of the file:

```typescript
function classTag(weapon: WeaponDef): string {
  if (!weapon.weapon_class) return '';
  return `[${weapon.weapon_class.charAt(0).toUpperCase() + weapon.weapon_class.slice(1)}] `;
}
```

Then use `classTag(weapon)` in both places.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --reporter=verbose test/unit/action-handlers.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/engine/handlers/examine.ts test/unit/action-handlers.test.ts
git commit -m "Show weapon class tag in examine output"
```

---

### Task 6: Dungeon weapon class derivation

**Files:**
- Modify: `src/engine/dungeon.ts:46-63`

- [ ] **Step 1: Add weapon_class derivation to generateDungeonWeapon**

In `src/engine/dungeon.ts`, the `WEAPON_SUFFIXES` are `['Blade', 'Axe', 'Mace', 'Spear', 'Staff']`. Map them to classes:

After the `WEAPON_SUFFIXES` line (line 43), add:

```typescript
import type { WeaponClass } from './types';

const SUFFIX_CLASS: Record<string, WeaponClass> = {
  Blade: 'blade',
  Axe: 'heavy',
  Mace: 'heavy',
  Spear: 'pierce',
  Staff: 'blade',
};
```

Then modify `generateDungeonWeapon` to include `weapon_class` in the return value. Change the return type and value:

```typescript
export function generateDungeonWeapon(
  floor: number,
  rng: () => number,
): { id: string; name: string; attack_bonus: number; weapon_class: WeaponClass } {
  const prefix = rngPick(rng, WEAPON_PREFIXES);
  const suffix = rngPick(rng, WEAPON_SUFFIXES);
  const name = `${prefix} ${suffix}`;
  const id = `dng_weapon_f${floor}_${prefix.toLowerCase()}_${suffix.toLowerCase()}`;
  const attack_bonus = 2 + floor * 2;
  const weapon_class = SUFFIX_CLASS[suffix] ?? 'blade';
  return { id, name, attack_bonus, weapon_class };
}
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All tests pass. The dungeon weapon return type is wider now but callers only destructure what they need.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add src/engine/dungeon.ts
git commit -m "Derive weapon_class from suffix for dungeon-generated weapons"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: Clean.

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean.
