# Active Skills & Equipment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a modifier system, armor/accessory equipment slots, and 3 active combat skills (Power Strike, Ambush, Arcane Surge) with cooldown-based usage.

**Architecture:** A new `modifiers.ts` module collects stat effects from all sources (skills, gear, weapon class, buffs) into a flat `Modifier[]` array. New equipment types (`ArmorDef`, `AccessoryDef`) and active skill combat logic consume this system. Existing `hasSkill`/weapon class inline checks remain for now — the modifier system bridges them read-only. Active skills are new tier-3 skill tree nodes that provide combat-time abilities via a `skill <name>` verb with per-fight cooldown tracking.

**Tech Stack:** TypeScript, Vitest, Vite 5, React 18 (engine is pure TS — no React imports in `src/engine/`).

**Files overview:**

- Create: `src/engine/modifiers.ts` — modifier types, collect, total, bridges
- Create: `src/data/armor.json` — 6 armor definitions
- Create: `src/data/accessories.json` — 6 accessory definitions
- Create: `test/unit/modifiers.test.ts` — modifier system tests
- Create: `test/unit/equipment.test.ts` — armor/accessory equip/display tests
- Modify: `src/engine/types.ts` — `ArmorDef`, `AccessoryDef`, `ModifierType`, `PlayerState` fields, `CombatState.skillCooldowns`
- Modify: `src/engine/player.ts` — `createPlayer` defaults, `totalDefense` armor support
- Modify: `src/engine/skills.ts` — 3 new active skill nodes, `ACTIVE_SKILLS` set
- Modify: `src/engine/combat.ts` — `createCombat` with `skillCooldowns`, `playerSkillAttack` function, cooldown ticking
- Modify: `src/engine/state/combat.ts` — `skill` verb routing
- Modify: `src/engine/handlers/use.ts` — armor/accessory equip
- Modify: `src/engine/handlers/drop.ts` — armor/accessory unequip
- Modify: `src/engine/handlers/examine.ts` — armor/accessory inspect
- Modify: `src/engine/handlers/info.ts` — inventory display for armor/accessory
- Modify: `src/engine/handlers/help.ts` — `skill` in help text
- Modify: `src/engine/handlers/take.ts` — pick up armor/accessories from rooms
- Modify: `src/engine/handlers/search.ts` — reveal accessories from search
- Modify: `src/engine/display.ts` — show armor/accessories in room display
- Modify: `src/engine/save.ts` — v3 save with `equipped_armor`, `equipped_accessory`
- Modify: `src/engine/commands.ts` — `skill` verb in `KNOWN_VERBS`
- Modify: `src/engine/state/exploring.ts` — `skill` in `ALL_VERBS`
- Modify: `src/engine/gameReducer.ts` — `effectiveArmorData`/`effectiveAccessoryData`, deps wiring
- Modify: `src/engine/dungeon.ts` — procedural armor generation, vault accessories
- Modify: `src/data/regions/*.json` — place armor in rooms, accessories in search_items
- Modify: `src/data/shops.json` — add armor to shop stock
- Modify: `src/data/enemies.json` — boss armor loot drops
- Modify: `test/unit/combat.test.ts` — active skill tests
- Modify: `test/unit/save.test.ts` — v3 migration tests
- Modify: `test/unit/weapon-data.test.ts` — armor/accessory data integrity tests
- Modify: `test/scenario/combat-flow.test.ts` — active skill scenario test

---

### Task 1: Types and Modifier System Core

**Files:**
- Modify: `src/engine/types.ts`
- Create: `src/engine/modifiers.ts`
- Create: `test/unit/modifiers.test.ts`

- [ ] **Step 1: Add modifier types and equipment types to `types.ts`**

Add at the end of the data types section (after `WeaponClass`):

```typescript
export type ModifierSource = 'skill' | 'weapon_class' | 'accessory' | 'armor' | 'buff';

export type ModifierType =
  | 'attack' | 'defense' | 'max_hp'
  | 'crit_chance' | 'crit_mult'
  | 'def_ignore'
  | 'cooldown_reduction'
  | 'status_duration' | 'magic_counter_threshold'
  | 'damage_reduction';

export interface Modifier {
  type: ModifierType;
  value: number;
  source: ModifierSource;
  sourceId: string;
}

export interface ArmorDef {
  name: string;
  defense: number;
  region: string;
  description: string;
  match_words?: string[];
  price?: number;
}

export interface AccessoryDef {
  name: string;
  description: string;
  region: string;
  match_words?: string[];
  modifiers: Array<{ type: ModifierType; value: number }>;
}
```

- [ ] **Step 2: Write failing tests for `totalModifier` and `collectModifiers`**

Create `test/unit/modifiers.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { collectModifiers, totalModifier } from '../../src/engine/modifiers';
import { createPlayer } from '../../src/engine/player';
import type { AccessoryDef, ArmorDef, Modifier, WeaponDef } from '../../src/engine/types';

const weaponData: Record<string, WeaponDef> = {
  test_blade: { name: 'Test Blade', attack_bonus: 5, region: 'manor', weapon_class: 'blade', description: 'test' },
  test_heavy: { name: 'Test Heavy', attack_bonus: 5, region: 'manor', weapon_class: 'heavy', description: 'test' },
};

const armorData: Record<string, ArmorDef> = {
  leather_vest: { name: 'Leather Vest', defense: 2, region: 'manor', description: 'basic' },
};

const accessoryData: Record<string, AccessoryDef> = {
  keen_eye_ring: {
    name: 'Keen Eye Ring', description: 'sharp', region: 'manor',
    modifiers: [{ type: 'crit_chance', value: 8 }],
  },
  berserker_tooth: {
    name: 'Berserker Tooth', description: 'fierce', region: 'darkness',
    modifiers: [{ type: 'attack', value: 3 }, { type: 'defense', value: -1 }],
  },
};

describe('totalModifier', () => {
  it('sums values for a given type', () => {
    const mods: Modifier[] = [
      { type: 'attack', value: 3, source: 'accessory', sourceId: 'x' },
      { type: 'defense', value: 2, source: 'armor', sourceId: 'y' },
      { type: 'attack', value: 5, source: 'buff', sourceId: 'z' },
    ];
    expect(totalModifier(mods, 'attack')).toBe(8);
    expect(totalModifier(mods, 'defense')).toBe(2);
  });

  it('returns 0 for absent modifier types', () => {
    const mods: Modifier[] = [
      { type: 'attack', value: 3, source: 'skill', sourceId: 'x' },
    ];
    expect(totalModifier(mods, 'crit_chance')).toBe(0);
  });
});

describe('collectModifiers', () => {
  it('collects modifiers from equipped accessory', () => {
    const player = createPlayer();
    player.equippedAccessory = 'keen_eye_ring';
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(mods.some(m => m.type === 'crit_chance' && m.value === 8 && m.source === 'accessory')).toBe(true);
  });

  it('collects defense modifier from equipped armor', () => {
    const player = createPlayer();
    player.equippedArmor = 'leather_vest';
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(mods.some(m => m.type === 'defense' && m.value === 2 && m.source === 'armor')).toBe(true);
  });

  it('bridges sharp_eyes skill to crit_chance modifier', () => {
    const player = createPlayer();
    player.skills.sharp_eyes = true;
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(mods.some(m => m.type === 'crit_chance' && m.value === 8 && m.sourceId === 'sharp_eyes')).toBe(true);
  });

  it('bridges blade weapon class to crit_chance modifier', () => {
    const player = createPlayer();
    player.weapons = ['test_blade'];
    player.equippedWeapon = 'test_blade';
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(mods.some(m => m.type === 'crit_chance' && m.value === 10 && m.sourceId === 'blade')).toBe(true);
  });

  it('bridges heavy weapon class to def_ignore modifier', () => {
    const player = createPlayer();
    player.weapons = ['test_heavy'];
    player.equippedWeapon = 'test_heavy';
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(mods.some(m => m.type === 'def_ignore' && m.value === 2 && m.sourceId === 'heavy')).toBe(true);
  });

  it('bridges active buff to attack modifier', () => {
    const player = createPlayer();
    player.buffAttack = 3;
    player.buffRounds = 2;
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(mods.some(m => m.type === 'attack' && m.value === 3 && m.source === 'buff')).toBe(true);
  });

  it('does not emit buff modifier when buffRounds is 0', () => {
    const player = createPlayer();
    player.buffAttack = 3;
    player.buffRounds = 0;
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(mods.some(m => m.source === 'buff')).toBe(false);
  });

  it('collects multiple modifiers from a multi-modifier accessory', () => {
    const player = createPlayer();
    player.equippedAccessory = 'berserker_tooth';
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(mods.some(m => m.type === 'attack' && m.value === 3)).toBe(true);
    expect(mods.some(m => m.type === 'defense' && m.value === -1)).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- --run test/unit/modifiers.test.ts`
Expected: FAIL — `modifiers` module does not exist yet.

- [ ] **Step 4: Implement `modifiers.ts`**

Create `src/engine/modifiers.ts`:

```typescript
import type {
  AccessoryDef, ArmorDef, Modifier, ModifierType, PlayerState, WeaponDef,
} from './types';

export function totalModifier(modifiers: Modifier[], type: ModifierType): number {
  let sum = 0;
  for (const m of modifiers) {
    if (m.type === type) sum += m.value;
  }
  return sum;
}

// -- Bridge: skills ----------------------------------------------------------

const SKILL_MODIFIERS: Record<string, Modifier[]> = {
  sharp_eyes: [{ type: 'crit_chance', value: 8, source: 'skill', sourceId: 'sharp_eyes' }],
  arcane_shield: [{ type: 'damage_reduction', value: 1, source: 'skill', sourceId: 'arcane_shield' }],
  precision: [
    { type: 'attack', value: 3, source: 'skill', sourceId: 'precision' },
    { type: 'def_ignore', value: 2, source: 'skill', sourceId: 'precision' },
  ],
  assassin: [{ type: 'crit_mult', value: 1, source: 'skill', sourceId: 'assassin' }],
};

function bridgeSkills(player: PlayerState): Modifier[] {
  const result: Modifier[] = [];
  for (const [skillId, mods] of Object.entries(SKILL_MODIFIERS)) {
    if (player.skills[skillId]) result.push(...mods);
  }
  return result;
}

// -- Bridge: weapon class ----------------------------------------------------

const WEAPON_CLASS_MODIFIERS: Record<string, Modifier[]> = {
  blade: [{ type: 'crit_chance', value: 10, source: 'weapon_class', sourceId: 'blade' }],
  heavy: [{ type: 'def_ignore', value: 2, source: 'weapon_class', sourceId: 'heavy' }],
};

function bridgeWeaponClass(player: PlayerState, weaponData: Record<string, WeaponDef>): Modifier[] {
  if (!player.equippedWeapon) return [];
  const weapon = weaponData[player.equippedWeapon];
  if (!weapon) return [];
  return WEAPON_CLASS_MODIFIERS[weapon.weapon_class] || [];
}

// -- Bridge: buffs -----------------------------------------------------------

function bridgeBuffs(player: PlayerState): Modifier[] {
  if (player.buffRounds > 0 && player.buffAttack > 0) {
    return [{ type: 'attack', value: player.buffAttack, source: 'buff', sourceId: 'buff_attack' }];
  }
  return [];
}

// -- Equipment ---------------------------------------------------------------

function armorModifiers(player: PlayerState, armorData: Record<string, ArmorDef>): Modifier[] {
  if (!player.equippedArmor) return [];
  const armor = armorData[player.equippedArmor];
  if (!armor) return [];
  return [{ type: 'defense', value: armor.defense, source: 'armor', sourceId: player.equippedArmor }];
}

function accessoryModifiers(player: PlayerState, accessoryData: Record<string, AccessoryDef>): Modifier[] {
  if (!player.equippedAccessory) return [];
  const acc = accessoryData[player.equippedAccessory];
  if (!acc) return [];
  return acc.modifiers.map(m => ({
    type: m.type,
    value: m.value,
    source: 'accessory' as const,
    sourceId: player.equippedAccessory!,
  }));
}

// -- Public API --------------------------------------------------------------

export function collectModifiers(
  player: PlayerState,
  weaponData: Record<string, WeaponDef>,
  armorData: Record<string, ArmorDef>,
  accessoryData: Record<string, AccessoryDef>,
): Modifier[] {
  return [
    ...bridgeSkills(player),
    ...bridgeWeaponClass(player, weaponData),
    ...bridgeBuffs(player),
    ...armorModifiers(player, armorData),
    ...accessoryModifiers(player, accessoryData),
  ];
}
```

- [ ] **Step 5: Add `equippedArmor` and `equippedAccessory` to `PlayerState` in `types.ts`**

In the `PlayerState` interface, after `equippedShield: string | null;`:

```typescript
  equippedArmor: string | null;
  equippedAccessory: string | null;
```

- [ ] **Step 6: Add defaults to `createPlayer` in `player.ts`**

In `createPlayer`, after `equippedShield: null,`:

```typescript
    equippedArmor: null,
    equippedAccessory: null,
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: All pass (266 existing + new modifier tests).

- [ ] **Step 8: Run lint**

Run: `npm run lint`
Expected: Clean.

- [ ] **Step 9: Commit**

```bash
git add src/engine/types.ts src/engine/modifiers.ts src/engine/player.ts test/unit/modifiers.test.ts
git commit -m "Add modifier system with bridges for skills, weapon class, and buffs"
```

---

### Task 2: Equipment Data Files

**Files:**
- Create: `src/data/armor.json`
- Create: `src/data/accessories.json`

- [ ] **Step 1: Create `src/data/armor.json`**

```json
{
  "leather_vest": {
    "name": "Leather Vest",
    "defense": 2,
    "region": "manor",
    "description": "A simple leather vest. Offers minimal protection.",
    "match_words": ["leather", "vest"],
    "price": 20
  },
  "rangers_hide": {
    "name": "Ranger's Hide",
    "defense": 3,
    "region": "wilds",
    "description": "Tough hide armor favored by forest rangers.",
    "match_words": ["ranger", "hide"],
    "price": 45
  },
  "chainmail": {
    "name": "Chainmail",
    "defense": 4,
    "region": "wilds",
    "description": "Interlocking iron rings. Heavy but effective.",
    "match_words": ["chainmail", "chain", "mail"]
  },
  "desert_wrap": {
    "name": "Desert Wrap",
    "defense": 5,
    "region": "wastes",
    "description": "Layered cloth and leather hardened by the desert sun.",
    "match_words": ["desert", "wrap"],
    "price": 80
  },
  "shadow_plate": {
    "name": "Shadow Plate",
    "defense": 6,
    "region": "darkness",
    "description": "Dark metal armor that absorbs light. Unnervingly cold to the touch.",
    "match_words": ["shadow", "plate"]
  },
  "guardian_armor": {
    "name": "Guardian Armor",
    "defense": 8,
    "region": "wastes",
    "description": "Ancient armor forged by the same hands that made the crown. It remembers how to protect.",
    "match_words": ["guardian", "armor"]
  }
}
```

- [ ] **Step 2: Create `src/data/accessories.json`**

```json
{
  "keen_eye_ring": {
    "name": "Keen Eye Ring",
    "description": "A silver ring set with a hawk's eye stone. Your strikes find weak points more often.",
    "region": "manor",
    "match_words": ["keen", "ring", "eye ring"],
    "modifiers": [{ "type": "crit_chance", "value": 8 }]
  },
  "flame_pendant": {
    "name": "Flame Pendant",
    "description": "A pendant holding a trapped ember. Status effects you inflict linger longer.",
    "region": "wilds",
    "match_words": ["flame", "pendant"],
    "modifiers": [{ "type": "status_duration", "value": 1 }]
  },
  "iron_band": {
    "name": "Iron Band",
    "description": "A crude iron ring that dulls incoming blows.",
    "region": "darkness",
    "match_words": ["iron", "band"],
    "modifiers": [{ "type": "damage_reduction", "value": 2 }]
  },
  "haste_charm": {
    "name": "Haste Charm",
    "description": "A charm that hums with restless energy. Active skills recover faster.",
    "region": "wastes",
    "match_words": ["haste", "charm"],
    "modifiers": [{ "type": "cooldown_reduction", "value": 1 }]
  },
  "berserker_tooth": {
    "name": "Berserker Tooth",
    "description": "A fang from a beast that never stopped fighting. More power, less protection.",
    "region": "darkness",
    "match_words": ["berserker", "tooth", "fang"],
    "modifiers": [{ "type": "attack", "value": 3 }, { "type": "defense", "value": -1 }]
  },
  "mystic_lens": {
    "name": "Mystic Lens",
    "description": "A crystalline monocle that amplifies magical resonance. Magic weapons proc more often.",
    "region": "hidden",
    "match_words": ["mystic", "lens", "monocle"],
    "modifiers": [{ "type": "magic_counter_threshold", "value": -1 }]
  }
}
```

- [ ] **Step 3: Add data integrity tests**

Add to `test/unit/weapon-data.test.ts`:

```typescript
import accessoriesRaw from '../../src/data/accessories.json';
import armorRaw from '../../src/data/armor.json';
import type { AccessoryDef, ArmorDef, ModifierType } from '../../src/engine/types';

const armor = armorRaw as Record<string, ArmorDef>;
const accessories = accessoriesRaw as Record<string, AccessoryDef>;

const VALID_MODIFIER_TYPES: ModifierType[] = [
  'attack', 'defense', 'max_hp', 'crit_chance', 'crit_mult',
  'def_ignore', 'cooldown_reduction', 'status_duration',
  'magic_counter_threshold', 'damage_reduction',
];

describe('armor.json data integrity', () => {
  it('every armor has positive defense', () => {
    for (const [id, a] of Object.entries(armor)) {
      expect(a.defense, `${id} defense`).toBeGreaterThan(0);
    }
  });
});

describe('accessories.json data integrity', () => {
  it('every accessory has at least one modifier', () => {
    for (const [id, acc] of Object.entries(accessories)) {
      expect(acc.modifiers.length, `${id} modifiers`).toBeGreaterThan(0);
    }
  });

  it('all modifier types are valid', () => {
    for (const [id, acc] of Object.entries(accessories)) {
      for (const mod of acc.modifiers) {
        expect(VALID_MODIFIER_TYPES, `${id} modifier type ${mod.type}`).toContain(mod.type);
      }
    }
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/data/armor.json src/data/accessories.json test/unit/weapon-data.test.ts
git commit -m "Add armor and accessory data files with integrity tests"
```

---

### Task 3: Place Equipment in the World

**Files:**
- Modify: `src/data/regions/manor.json` — add `keen_eye_ring` to search_items, `leather_vest` to room
- Modify: `src/data/regions/wilds.json` — add `chainmail` to room
- Modify: `src/data/regions/darkness.json` — add `iron_band` and `berserker_tooth` to search_items
- Modify: `src/data/regions/hidden.json` — add `mystic_lens` to search_items
- Modify: `src/data/shops.json` — add armor to shop stock
- Modify: `src/data/enemies.json` — add armor drops to bosses, accessory drops to wilds/wastes bosses

- [ ] **Step 1: Add armor to shop stock**

In `src/data/shops.json`:

Add to `manor_dusty` stock array:
```json
{ "id": "leather_vest", "qty": 1, "type": "armor" }
```

Add to `wilds_wren` stock array:
```json
{ "id": "rangers_hide", "qty": 1, "type": "armor" }
```

Add to `wastes_hermit` stock array:
```json
{ "id": "desert_wrap", "qty": 1, "type": "armor" }
```

- [ ] **Step 2: Place armor in rooms**

In `src/data/regions/wilds.json`, find the room `wilds_mountain_pass` (or a suitable mid-game room). Add to its properties:
```json
"armor": ["chainmail"]
```

Note: `armor` is a new room property (like `weapons`). Add it to `RoomDef` in `types.ts`:
```typescript
  armor?: string[];
```

- [ ] **Step 3: Add boss loot**

In `src/data/enemies.json`:

For `shadow_knight` (darkness boss), add:
```json
"loot_armor": "shadow_plate"
```

For `ruins_guardian` (wastes boss), add:
```json
"loot_armor": "guardian_armor"
```

For `forest_troll` (wilds boss), add:
```json
"loot_accessory": "flame_pendant"
```

For `ruins_guardian` (wastes boss), also add:
```json
"loot_accessory": "haste_charm"
```

Note: Add `loot_armor?: string` and `loot_accessory?: string` to `EnemyDef` in `types.ts`.

- [ ] **Step 4: Place accessories in search_items**

In `src/data/regions/manor.json`, find the `manor_main_hall` room. Add `keen_eye_ring` to its `search_items` array. If it doesn't have `searchable: true`, add that and `search_items: ["keen_eye_ring"]`.

In `src/data/regions/darkness.json`, find appropriate rooms and add `iron_band` and `berserker_tooth` to their `search_items`.

In `src/data/regions/hidden.json`, add `mystic_lens` to `hidden_diner` search_items (alongside existing `potion`).

- [ ] **Step 5: Run lint and tests**

Run: `npm run lint && npm test`
Expected: Clean lint, all tests pass. (Some existing tests may need fixture updates if they assert exact room contents — fix any that break.)

- [ ] **Step 6: Commit**

```bash
git add src/data/ src/engine/types.ts
git commit -m "Place armor and accessories in world, shops, and boss loot tables"
```

---

### Task 4: Equip, Drop, and Examine Equipment

**Files:**
- Modify: `src/engine/handlers/use.ts`
- Modify: `src/engine/handlers/drop.ts`
- Modify: `src/engine/handlers/examine.ts`
- Modify: `src/engine/handlers/take.ts`
- Modify: `src/engine/handlers/search.ts`
- Modify: `src/engine/display.ts`
- Create: `test/unit/equipment.test.ts`

- [ ] **Step 1: Write failing equipment tests**

Create `test/unit/equipment.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import armorJson from '../../src/data/armor.json';
import accessoriesJson from '../../src/data/accessories.json';
import itemsJson from '../../src/data/items.json';
import weaponsJson from '../../src/data/weapons.json';
import enemiesJson from '../../src/data/enemies.json';
import { createInitialStore } from '../../src/engine/gameReducer';
import { handleDrop } from '../../src/engine/handlers/drop';
import { handleExamine } from '../../src/engine/handlers/examine';
import { handleTake } from '../../src/engine/handlers/take';
import { handleUse } from '../../src/engine/handlers/use';
import { createPlayer, totalDefense } from '../../src/engine/player';
import { collectModifiers, totalModifier } from '../../src/engine/modifiers';
import type { AccessoryDef, ArmorDef, EnemyDef, ItemDef, RegionData, WeaponDef } from '../../src/engine/types';
import { createWorld, loadRegion } from '../../src/engine/world';

const itemData = itemsJson as Record<string, ItemDef>;
const weaponData = weaponsJson as Record<string, WeaponDef>;
const armorData = armorJson as Record<string, ArmorDef>;
const accessoryData = accessoriesJson as Record<string, AccessoryDef>;
const enemyData = enemiesJson as Record<string, EnemyDef>;

function makeStore() {
  const store = createInitialStore();
  const world = createWorld();
  loadRegion(world, {
    rooms: [{
      id: 'test_room', name: 'Test', region: 'test', description: '',
      exits: {}, armor: ['leather_vest'], searchable: true, search_items: ['keen_eye_ring'],
    }],
  } as RegionData);
  store.world = world;
  store.player = createPlayer('test_room');
  return store;
}

describe('equipment', () => {
  it('take picks up armor from a room', () => {
    const store = makeStore();
    handleTake(store, 'leather vest', itemData, weaponData, armorData, accessoryData, () => {}, () => {});
    expect(store.player!.inventory.leather_vest).toBeDefined();
  });

  it('use equips armor and adds to defense', () => {
    const store = makeStore();
    store.player!.inventory.leather_vest = 1;
    handleUse(store, 'leather vest', itemData, weaponData, armorData, accessoryData, () => {}, () => {});
    expect(store.player!.equippedArmor).toBe('leather_vest');
    expect(totalDefense(store.player!, itemData, armorData)).toBe(4); // base 2 + armor 2
  });

  it('use equips accessory and applies modifiers', () => {
    const store = makeStore();
    store.player!.inventory.keen_eye_ring = 1;
    handleUse(store, 'keen eye ring', itemData, weaponData, armorData, accessoryData, () => {}, () => {});
    expect(store.player!.equippedAccessory).toBe('keen_eye_ring');
    const mods = collectModifiers(store.player!, weaponData, armorData, accessoryData);
    expect(totalModifier(mods, 'crit_chance')).toBe(8);
  });

  it('swapping armor changes equipped slot', () => {
    const store = makeStore();
    store.player!.inventory.leather_vest = 1;
    store.player!.inventory.chainmail = 1;
    handleUse(store, 'leather vest', itemData, weaponData, armorData, accessoryData, () => {}, () => {});
    expect(store.player!.equippedArmor).toBe('leather_vest');
    handleUse(store, 'chainmail', itemData, weaponData, armorData, accessoryData, () => {}, () => {});
    expect(store.player!.equippedArmor).toBe('chainmail');
  });

  it('drop armor unequips and places on ground', () => {
    const store = makeStore();
    store.player!.inventory.leather_vest = 1;
    store.player!.equippedArmor = 'leather_vest';
    handleDrop(store, 'leather vest', itemData, weaponData, armorData, accessoryData, () => {});
    expect(store.player!.equippedArmor).toBeNull();
    expect(store.world!.rooms.test_room._ground_loot).toContain('leather_vest');
  });

  it('examine shows armor DEF', () => {
    const store = makeStore();
    store.player!.inventory.leather_vest = 1;
    store.player!.equippedArmor = 'leather_vest';
    handleExamine(store, 'leather vest', enemyData, itemData, weaponData, armorData, accessoryData);
    const lines = store.typewriterQueue.map(l => l.text);
    expect(lines.some(l => l.includes('Leather Vest'))).toBe(true);
    expect(lines.some(l => l.includes('+2 DEF'))).toBe(true);
  });

  it('examine shows accessory modifiers', () => {
    const store = makeStore();
    store.player!.inventory.keen_eye_ring = 1;
    store.player!.equippedAccessory = 'keen_eye_ring';
    handleExamine(store, 'keen eye ring', enemyData, itemData, weaponData, armorData, accessoryData);
    const lines = store.typewriterQueue.map(l => l.text);
    expect(lines.some(l => l.includes('Keen Eye Ring'))).toBe(true);
    expect(lines.some(l => l.includes('crit_chance'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run test/unit/equipment.test.ts`
Expected: FAIL — handler signatures don't accept armor/accessory data yet.

- [ ] **Step 3: Update `totalDefense` in `player.ts` to include armor**

Change the `totalDefense` signature to accept `armorData`:

```typescript
export function totalDefense(
  p: PlayerState,
  itemData: Record<string, import('./types').ItemDef>,
  armorData?: Record<string, import('./types').ArmorDef>,
): number {
  let def = p.defense;
  if (p.equippedShield && itemData[p.equippedShield]) {
    const shield = itemData[p.equippedShield];
    if (shield.value) def += shield.value;
  }
  if (armorData && p.equippedArmor && armorData[p.equippedArmor]) {
    def += armorData[p.equippedArmor].defense;
  }
  return def;
}
```

Note: The `armorData` parameter is optional so existing callers don't break. Update callers incrementally — combat and info modules should pass it when available.

- [ ] **Step 4: Update `handleUse` to handle armor and accessories**

Add armor/accessory data parameters to `handleUse` signature. Before the existing weapon matching logic, add:

```typescript
// Check armor
if (armorData) {
  const armorIds = Object.keys(player.inventory).filter(id => armorData[id]);
  const armorMatches = findAllMatches(target, armorIds, armorData);
  if (armorMatches.length === 1) {
    player.equippedArmor = armorMatches[0];
    addLine(store, `You equip the ${armorData[armorMatches[0]].name}.`, C.ITEM_COLOR);
    emitSound(store, 'equip');
    return;
  }
}

// Check accessory
if (accessoryData) {
  const accIds = Object.keys(player.inventory).filter(id => accessoryData[id]);
  const accMatches = findAllMatches(target, accIds, accessoryData);
  if (accMatches.length === 1) {
    player.equippedAccessory = accMatches[0];
    addLine(store, `You equip the ${accessoryData[accMatches[0]].name}.`, C.ITEM_COLOR);
    emitSound(store, 'equip');
    return;
  }
}
```

- [ ] **Step 5: Update `handleDrop` for armor and accessories**

Add armor/accessory unequip logic. When dropping an item, check if it's the equipped armor or accessory and clear the slot.

- [ ] **Step 6: Update `handleExamine` for armor and accessories**

Add sections that display armor DEF and accessory modifier details when examining those item types.

- [ ] **Step 7: Update `handleTake` to pick up armor from rooms**

Add armor pickup logic — same pattern as weapon pickup. Look for armor in `room.armor` and `room._ground_loot`.

- [ ] **Step 8: Update `handleSearch` and `display.ts` for accessory display**

Accessories found via search go into `_ground_loot`. Room display shows armor items in rooms.

- [ ] **Step 9: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 10: Run lint**

Run: `npm run lint`
Expected: Clean.

- [ ] **Step 11: Commit**

```bash
git add src/engine/handlers/ src/engine/player.ts src/engine/display.ts test/unit/equipment.test.ts
git commit -m "Add equip, drop, and examine support for armor and accessories"
```

---

### Task 5: Inventory Display and Help Text

**Files:**
- Modify: `src/engine/handlers/info.ts`
- Modify: `src/engine/handlers/help.ts`

- [ ] **Step 1: Update `showInventory` in `info.ts`**

After the shield display block and before the weapon list, add armor and accessory display:

```typescript
if (store.player.equippedArmor) {
  const armor = armorLookup(store, store.player.equippedArmor);
  if (armor) {
    addLine(store, iconLine(ICON.shield, `Armor: ${armor.name} (+${armor.defense} DEF)`), C.ITEM_COLOR);
  }
}

if (store.player.equippedAccessory) {
  const acc = accessoryLookup(store, store.player.equippedAccessory);
  if (acc) {
    const effectText = acc.modifiers.map(m => `${m.type} ${m.value > 0 ? '+' : ''}${m.value}`).join(', ');
    addLine(store, iconLine(ICON.item, `Accessory: ${acc.name} (${effectText})`), C.ITEM_COLOR);
  }
}
```

- [ ] **Step 2: Update `showStats` to include armor DEF**

Pass `armorData` to `totalDefense` so the stats display reflects armor.

- [ ] **Step 3: Add `skill <name>` to help text**

In `handleHelp`, after the `attack <enemy>` line under COMBAT:
```typescript
addLine(store, '  skill <name>   - Use a combat skill (cooldown-based)', C.HELP_COLOR);
```

- [ ] **Step 4: Run tests and lint**

Run: `npm run lint && npm test`
Expected: Clean.

- [ ] **Step 5: Commit**

```bash
git add src/engine/handlers/info.ts src/engine/handlers/help.ts
git commit -m "Add armor and accessory to inventory display, skill to help text"
```

---

### Task 6: Save/Load v3 Migration

**Files:**
- Modify: `src/engine/save.ts`
- Modify: `test/unit/save.test.ts`

- [ ] **Step 1: Write failing save migration tests**

Add to `test/unit/save.test.ts`:

```typescript
it('v2 save loads with null armor and accessory', () => {
  // Create a v2 save (no equipped_armor or equipped_accessory fields)
  const player = createPlayer();
  // ... save as v2 format, then load
  expect(loadedPlayer.equippedArmor).toBeNull();
  expect(loadedPlayer.equippedAccessory).toBeNull();
});

it('v3 save round-trips armor and accessory', () => {
  const player = createPlayer();
  player.equippedArmor = 'leather_vest';
  player.equippedAccessory = 'keen_eye_ring';
  // ... save and load
  expect(loadedPlayer.equippedArmor).toBe('leather_vest');
  expect(loadedPlayer.equippedAccessory).toBe('keen_eye_ring');
});
```

- [ ] **Step 2: Update `serialize` in `save.ts`**

Add to the `player` object in `serialize`:
```typescript
equipped_armor: player.equippedArmor,
equipped_accessory: player.equippedAccessory,
```

- [ ] **Step 3: Update `deserialize` in `save.ts`**

Add to the deserialization block:
```typescript
player.equippedArmor = p.equipped_armor ?? null;
player.equippedAccessory = p.equipped_accessory ?? null;
```

Add `equipped_armor` and `equipped_accessory` as optional fields on the `SaveData.player` interface.

- [ ] **Step 4: Update version check**

The version check already accepts 1, 2, and 3. The `serialize` function already writes `version: 3`. Add the new fields as optional to the `SaveData` player type so v2 saves (which lack them) deserialize with `?? null`.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/engine/save.ts test/unit/save.test.ts
git commit -m "Add v3 save format with armor and accessory slots"
```

---

### Task 7: Active Skill Tree Nodes

**Files:**
- Modify: `src/engine/skills.ts`
- Modify: `src/engine/types.ts` — `skillCooldowns` on `CombatState`
- Modify: `src/engine/combat.ts` — `createCombat` with `skillCooldowns`

- [ ] **Step 1: Add 3 active skill nodes to `skills.ts`**

Add to the `_SKILLS` array in the tier 3 section:

```typescript
  { id: 'power_strike', name: 'Power Strike', description: 'Active: 1.5x damage, ignore 3 DEF. 5-round cooldown.', tier: 3 },
  { id: 'ambush', name: 'Ambush', description: 'Active: Guaranteed 3x critical hit. 4-round cooldown.', tier: 3 },
  { id: 'arcane_surge', name: 'Arcane Surge', description: 'Active: Double-duration status proc or magic burst. 5-round cooldown.', tier: 3 },
```

Add the `ACTIVE_SKILLS` set after the `SKILL_TREE` export:

```typescript
export const ACTIVE_SKILLS = new Set<string>(['power_strike', 'ambush', 'arcane_surge']);

export function isActiveSkill(id: string): boolean {
  return ACTIVE_SKILLS.has(id);
}
```

- [ ] **Step 2: Add `skillCooldowns` to `CombatState` in `types.ts`**

In the `CombatState` interface, after `magicHitCounter: number;`:

```typescript
  skillCooldowns: Record<string, number>;
```

- [ ] **Step 3: Initialize `skillCooldowns` in `createCombat`**

In `src/engine/combat.ts`, in the `createCombat` return object, after `magicHitCounter: 0,`:

```typescript
    skillCooldowns: {},
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All pass (266+ existing tests). The `createCombat` tests may need `skillCooldowns` added to their assertions if they check the full object shape — fix any that break.

- [ ] **Step 5: Commit**

```bash
git add src/engine/skills.ts src/engine/types.ts src/engine/combat.ts
git commit -m "Add active skill tree nodes and skillCooldowns to CombatState"
```

---

### Task 8: Active Skill Combat Logic

**Files:**
- Modify: `src/engine/combat.ts` — `playerSkillAttack`, cooldown ticking
- Modify: `test/unit/combat.test.ts` — active skill tests

- [ ] **Step 1: Write failing active skill tests**

Add a new `describe('active combat skills', ...)` block in `test/unit/combat.test.ts`:

```typescript
describe('active combat skills', () => {
  const bladeWeaponData: Record<string, WeaponDef> = {
    test_blade: { name: 'Test Blade', attack_bonus: 5, region: 'manor', weapon_class: 'blade', description: 'test' },
  };

  const magicWeaponData: Record<string, WeaponDef> = {
    test_staff: {
      name: 'Test Staff', attack_bonus: 5, region: 'manor', weapon_class: 'magic', description: 'test',
      status_effect: { type: 'burn', damage: 2, duration: 3, chance: 0 },
    },
  };

  const noEffectWeaponData: Record<string, WeaponDef> = {
    plain_sword: { name: 'Plain Sword', attack_bonus: 5, region: 'manor', weapon_class: 'blade', description: 'test' },
  };

  const tankEnemy = {
    tank: {
      name: 'Tank', hp: 9999, attack: 1, defense: 10,
      xp: 1, loot: [] as string[], region: 'test',
      description: 'tanky', is_boss: false,
    },
  };

  it('power_strike deals 1.5x damage and ignores 3 DEF', () => {
    const player = createPlayer();
    player.skills.power_strike = true;
    player.attack = 10;
    addWeapon(player, 'test_blade');
    equipWeapon(player, 'test_blade');

    // Normal attack
    const c1 = createCombat(player, 'tank', tankEnemy);
    playerAttack(c1, player, bladeWeaponData, itemData, seededRng(1));
    const normalDmg = 9999 - c1.enemy.hp;

    // Skill attack
    player.hp = player.maxHp; // reset
    const c2 = createCombat(player, 'tank', tankEnemy);
    const msgs = playerSkillAttack(c2, player, 'power_strike', bladeWeaponData, itemData, seededRng(1));
    const skillDmg = 9999 - c2.enemy.hp;

    expect(skillDmg).toBeGreaterThan(normalDmg);
    expect(msgs.some(m => m.text.includes('devastating strike'))).toBe(true);
    expect(c2.skillCooldowns.power_strike).toBe(5);
  });

  it('ambush guarantees a 3x crit', () => {
    const player = createPlayer();
    player.skills.ambush = true;
    player.attack = 10;
    addWeapon(player, 'test_blade');
    equipWeapon(player, 'test_blade');
    const combat = createCombat(player, 'tank', tankEnemy);

    const msgs = playerSkillAttack(combat, player, 'ambush', bladeWeaponData, itemData, seededRng(1));

    expect(msgs.some(m => m.text.includes('strike from the shadows'))).toBe(true);
    expect(combat.skillCooldowns.ambush).toBe(4);
  });

  it('arcane_surge applies double-duration status effect', () => {
    const player = createPlayer();
    player.skills.arcane_surge = true;
    addWeapon(player, 'test_staff');
    equipWeapon(player, 'test_staff');
    const combat = createCombat(player, 'tank', tankEnemy);

    const msgs = playerSkillAttack(combat, player, 'arcane_surge', magicWeaponData, itemData, seededRng(1));

    expect(msgs.some(m => m.text.includes('amplifies'))).toBe(true);
    const burn = combat.enemyEffects.find(e => e.type === 'burn');
    expect(burn).toBeDefined();
    expect(burn!.remaining).toBe(6); // double duration: 3 * 2
  });

  it('arcane_surge deals level-scaled burst when weapon has no status effect', () => {
    const player = createPlayer();
    player.skills.arcane_surge = true;
    player.level = 5;
    addWeapon(player, 'plain_sword');
    equipWeapon(player, 'plain_sword');
    const combat = createCombat(player, 'tank', tankEnemy);

    const msgs = playerSkillAttack(combat, player, 'arcane_surge', noEffectWeaponData, itemData, seededRng(1));

    expect(msgs.some(m => m.text.includes('burst of arcane energy'))).toBe(true);
    // Burst damage = 5 + level (5) = 10, applied on top of normal attack
    const totalDamage = 9999 - combat.enemy.hp;
    expect(totalDamage).toBeGreaterThan(10);
  });

  it('cooldown prevents reuse and decrements each round', () => {
    const player = createPlayer();
    player.skills.power_strike = true;
    player.maxHp = 9999;
    player.hp = 9999;
    addWeapon(player, 'test_blade');
    equipWeapon(player, 'test_blade');
    const combat = createCombat(player, 'tank', tankEnemy);

    playerSkillAttack(combat, player, 'power_strike', bladeWeaponData, itemData, seededRng(1));
    expect(combat.skillCooldowns.power_strike).toBe(5);

    // Normal attacks tick cooldowns
    playerAttack(combat, player, bladeWeaponData, itemData, seededRng(2));
    expect(combat.skillCooldowns.power_strike).toBe(4);

    playerAttack(combat, player, bladeWeaponData, itemData, seededRng(3));
    expect(combat.skillCooldowns.power_strike).toBe(3);
  });

  it('using skill on cooldown returns error and does not advance round', () => {
    const player = createPlayer();
    player.skills.power_strike = true;
    player.maxHp = 9999;
    player.hp = 9999;
    addWeapon(player, 'test_blade');
    equipWeapon(player, 'test_blade');
    const combat = createCombat(player, 'tank', tankEnemy);

    playerSkillAttack(combat, player, 'power_strike', bladeWeaponData, itemData, seededRng(1));
    const roundAfterUse = combat.round;

    const msgs = playerSkillAttack(combat, player, 'power_strike', bladeWeaponData, itemData, seededRng(2));
    expect(combat.round).toBe(roundAfterUse); // round did not increment
    expect(msgs.some(m => m.text.includes('cooldown'))).toBe(true);
  });

  it('using unknown skill returns error', () => {
    const player = createPlayer();
    const combat = createCombat(player, 'tank', tankEnemy);

    const msgs = playerSkillAttack(combat, player, 'nonexistent', bladeWeaponData, itemData, seededRng(1));
    expect(combat.round).toBe(0);
    expect(msgs.some(m => m.text.includes("don't know"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run test/unit/combat.test.ts`
Expected: FAIL — `playerSkillAttack` does not exist.

- [ ] **Step 3: Implement `playerSkillAttack` in `combat.ts`**

Add a cooldown tick helper called at the start of every round-advancing function (`playerAttack`, `playerDefend`, `playerFlee`, `playerUseItem`):

```typescript
function tickCooldowns(combat: CombatState): void {
  for (const id of Object.keys(combat.skillCooldowns)) {
    combat.skillCooldowns[id]--;
    if (combat.skillCooldowns[id] <= 0) delete combat.skillCooldowns[id];
  }
}
```

Add the call `tickCooldowns(combat);` right after `combat.round++;` in `playerAttack`, `playerDefend`, `playerFlee`, and `playerUseItem`.

Then implement `playerSkillAttack`:

```typescript
export function playerSkillAttack(
  combat: CombatState,
  player: PlayerState,
  skillId: string,
  weaponData: Record<string, WeaponDef>,
  itemData: Record<string, ItemDef>,
  rng: Rng = defaultRng,
  cooldownReduction = 0,
): CombatMessage[] {
  const messages: CombatMessage[] = [];

  if (!player.skills[skillId]) {
    messages.push({ text: "You don't know that skill.", color: [1, 0.4, 0.4, 1] });
    return messages;
  }

  if (combat.skillCooldowns[skillId]) {
    messages.push({
      text: `${skillId.replace(/_/g, ' ')} is on cooldown (${combat.skillCooldowns[skillId]} rounds).`,
      color: [1, 0.6, 0.2, 1],
    });
    return messages;
  }

  const equippedWeapon = player.equippedWeapon ? weaponData[player.equippedWeapon] : null;

  if (skillId === 'power_strike') {
    const baseCooldown = Math.max(1, 5 - cooldownReduction);
    combat.skillCooldowns.power_strike = baseCooldown;
    messages.push({ text: 'You unleash a devastating strike!', color: [1, 0.6, 0.2, 1] });

    // Modified attack: 1.5x damage, ignore 3 DEF
    combat.round++;
    tickCooldowns(combat);

    // ... (full playerAttack logic with 1.5x multiplier and 3 extra def_ignore)
    // Replicate the attack calculation with modifications
  } else if (skillId === 'ambush') {
    const baseCooldown = Math.max(1, 4 - cooldownReduction);
    combat.skillCooldowns.ambush = baseCooldown;
    messages.push({ text: 'You strike from the shadows!', color: [1, 1, 0.2, 1] });

    combat.round++;
    tickCooldowns(combat);

    // ... guaranteed 3x crit
  } else if (skillId === 'arcane_surge') {
    const baseCooldown = Math.max(1, 5 - cooldownReduction);
    combat.skillCooldowns.arcane_surge = baseCooldown;

    if (equippedWeapon?.status_effect) {
      messages.push({ text: "Arcane energy amplifies your weapon's power!", color: [0.6, 0.8, 1, 1] });
      applyStatusEffect(combat.enemyEffects, {
        type: equippedWeapon.status_effect.type,
        damage: equippedWeapon.status_effect.damage,
        remaining: equippedWeapon.status_effect.duration * 2,
        baseDamage: equippedWeapon.status_effect.damage,
      });
    } else {
      const burst = 5 + player.level;
      combat.enemy.hp -= burst;
      messages.push({ text: `You release a burst of arcane energy! ${burst} magic damage!`, color: [0.6, 0.8, 1, 1] });
    }

    // Then do a normal attack
    combat.round++;
    tickCooldowns(combat);
    // ... normal playerAttack flow follows
  }

  return messages;
}
```

Note: The actual implementation will need to share attack calculation logic with `playerAttack`. Extract the core attack calc into a helper that both `playerAttack` and `playerSkillAttack` call, with skill-specific overrides passed as parameters (damage multiplier, extra def ignore, forced crit). This avoids duplicating the entire attack flow.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine/combat.ts test/unit/combat.test.ts
git commit -m "Add active skill combat logic with cooldown tracking"
```

---

### Task 9: Combat State Routing and Commands

**Files:**
- Modify: `src/engine/state/combat.ts` — `skill` verb handling
- Modify: `src/engine/commands.ts` — add `skill` to `KNOWN_VERBS`
- Modify: `src/engine/state/exploring.ts` — add `skill` to `ALL_VERBS`
- Modify: `src/engine/gameReducer.ts` — pass accessory/armor data through deps

- [ ] **Step 1: Add `skill` to known verbs**

In `src/engine/commands.ts`, add `'skill'` to the `KNOWN_VERBS` set.

- [ ] **Step 2: Add `skill` to `ALL_VERBS` in `exploring.ts`**

Add `'skill'` to the `ALL_VERBS` array in `src/engine/state/exploring.ts`.

- [ ] **Step 3: Handle `skill` verb in combat state**

In `src/engine/state/combat.ts`, in `handleCombatCommand`, add a branch for `verb === 'skill'`:

```typescript
} else if (verb === 'skill') {
  if (!target) {
    // List available skills and cooldown status
    addLine(store, '=== Active Skills ===', C.STAT_COLOR);
    for (const skillId of ACTIVE_SKILLS) {
      if (!store.player.skills[skillId]) continue;
      const cd = store.combat.skillCooldowns[skillId];
      const status = cd ? ` (cooldown: ${cd} rounds)` : ' (ready)';
      const skill = getSkill(skillId);
      addLine(store, `  ${skill?.name || skillId}${status}`, cd ? C.HELP_COLOR : C.CHOICE_COLOR);
    }
    return;
  }
  const skill = findSkillByName(target);
  if (!skill || !ACTIVE_SKILLS.has(skill.id)) {
    addLine(store, "You don't know that skill.", C.ERROR_COLOR);
    return;
  }
  const cooldownReduction = totalModifier(
    collectModifiers(store.player, deps.weaponData, armorData, accessoryData),
    'cooldown_reduction',
  );
  msgs = playerSkillAttack(store.combat, store.player, skill.id, deps.weaponData, deps.itemData, undefined, cooldownReduction);
}
```

- [ ] **Step 4: Update `CombatDeps` and `buildCombatDeps` in `gameReducer.ts`**

Add `armorData` and `accessoryData` to `CombatDeps` and wire them in `buildCombatDeps`.

- [ ] **Step 5: Update combat help text**

In `startCombat` in `gameReducer.ts`, change the commands line:
```typescript
addLine(store, 'Commands: attack, defend, flee, use <item>, skill <name>', C.COMBAT_COLOR);
```

Also update the fallback message in `handleCombatCommand`:
```typescript
addLine(store, 'In combat: attack, defend, flee, use <item>, skill <name>', C.COMBAT_COLOR);
```

- [ ] **Step 6: Add combat autocomplete for `skill`**

In the autocomplete function in `state/combat.ts` (or wherever combat autocomplete is handled), when the verb is `skill`, return learned active skills as suggestions.

- [ ] **Step 7: Run tests and lint**

Run: `npm run lint && npm test`
Expected: Clean.

- [ ] **Step 8: Commit**

```bash
git add src/engine/commands.ts src/engine/state/combat.ts src/engine/state/exploring.ts src/engine/gameReducer.ts
git commit -m "Route skill verb through combat state handler with cooldown reduction"
```

---

### Task 10: Dungeon Mode Equipment and Scenario Test

**Files:**
- Modify: `src/engine/dungeon.ts` — procedural armor generation
- Modify: `src/engine/state/combat.ts` — loot armor/accessory from defeated enemies
- Modify: `test/scenario/combat-flow.test.ts` — active skill scenario test

- [ ] **Step 1: Add procedural dungeon armor generation**

In `src/engine/dungeon.ts`, add armor generation alongside weapon generation:

```typescript
const ARMOR_PREFIXES = ['Worn', 'Dark', 'Ancient', 'Rusted', 'Reinforced'];
const ARMOR_SUFFIXES = ['Mail', 'Plate', 'Guard', 'Shell', 'Vest'];

export function generateDungeonArmor(
  floor: number,
  rng: () => number,
): { id: string; name: string; defense: number } {
  const prefix = rngPick(rng, ARMOR_PREFIXES);
  const suffix = rngPick(rng, ARMOR_SUFFIXES);
  return {
    id: `dng_armor_f${floor}_${prefix.toLowerCase()}_${suffix.toLowerCase()}`,
    name: `${prefix} ${suffix}`,
    defense: 1 + floor,
  };
}
```

In `generateFloor`, for full bosses (floor % 10 === 0), also generate armor:

```typescript
if (isFullBoss) {
  // ... existing weapon generation ...
  const armor = generateDungeonArmor(floor, rng);
  lootArmor = armor.id;
  armorDefs[armor.id] = {
    name: armor.name,
    defense: armor.defense,
    region: 'dungeon',
    description: `Dungeon armor found on floor ${floor}.`,
  };
}
```

Add `armor` to `FloorResult` and wire through `loadDungeonFloor`.

- [ ] **Step 2: Add vault accessories in dungeon**

In `generateFloor`, when placing vault rooms, add a chance to include an accessory from a dungeon pool:

```typescript
const DUNGEON_ACCESSORIES = ['keen_eye_ring', 'iron_band', 'berserker_tooth'];
// Pick one at random for vault rooms
if (room.specialType === 'vault') {
  const accId = rngPick(rng, DUNGEON_ACCESSORIES);
  if (!room.search_items) room.search_items = [];
  room.search_items.push(accId);
}
```

- [ ] **Step 3: Handle armor/accessory loot drops in combat state**

In `src/engine/state/combat.ts`, in the enemy-defeated block, after weapon loot handling, add:

```typescript
if (results.armor) {
  if (!room._ground_loot) room._ground_loot = [];
  room._ground_loot.push(results.armor);
  const armor = deps.armorData[results.armor];
  if (armor) addLine(store, iconLine(ICON.loot, `The enemy drops ${armor.name}!`), C.LOOT_COLOR);
}
if (results.accessory) {
  if (!room._ground_loot) room._ground_loot = [];
  room._ground_loot.push(results.accessory);
  const acc = deps.accessoryData[results.accessory];
  if (acc) addLine(store, iconLine(ICON.loot, `The enemy drops ${acc.name}!`), C.LOOT_COLOR);
}
```

Update `CombatResults` to include `armor: string | null` and `accessory: string | null`. Update `enemyDefeated` to read `loot_armor` and `loot_accessory` from the enemy data.

- [ ] **Step 4: Write scenario test for active skill in combat**

Add to `test/scenario/combat-flow.test.ts`:

```typescript
it('uses an active skill in combat with cooldown', () => {
  let s = newGame();
  s.player!.skills.power_strike = true;
  s.player!.currentRoom = 'manor_entry';
  s.player!.attack = 50;
  s.player!.maxHp = 999;
  s.player!.hp = 999;

  s = input(s, 'attack rat');
  expect(s.state).toBe('combat');

  s = input(s, 'skill power strike');
  expectLine(s, 'devastating strike');

  // Skill should be on cooldown now
  s = input(s, 'skill power strike');
  expectLine(s, 'cooldown');
});
```

- [ ] **Step 5: Run all tests and lint**

Run: `npm run lint && npm test`
Expected: All pass, lint clean.

- [ ] **Step 6: Commit**

```bash
git add src/engine/dungeon.ts src/engine/state/combat.ts src/engine/combat.ts test/scenario/combat-flow.test.ts
git commit -m "Add dungeon equipment generation and active skill scenario test"
```

---

### Post-implementation checklist

After all tasks are complete:

- [ ] Run `npm run build` — verify production build compiles.
- [ ] Run `npm test` — all tests pass.
- [ ] Run `npm run lint` — clean.
- [ ] Verify save/load round-trip with new equipment in the browser.
- [ ] Play-test: equip armor + accessory, fight with active skills, verify cooldowns tick correctly.
- [ ] Verify dungeon mode boss drops armor alongside weapons.
