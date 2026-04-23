# Active Combat Skills & Equipment Slots — Design Spec

**Date:** 2026-04-19
**Follows:** weapon-classes branch (blade/heavy/pierce/magic, QoL exploration/items)

## Goal

Add two complementary systems: active combat skills that give the player ability-based actions during fights, and armor/accessory equipment slots that deepen gear decisions. Both route through a new modifier system that unifies how stat bonuses are collected and applied, providing a foundation for future extensibility.

## Modifier System

### Core Abstraction

A `Modifier` describes a single numeric effect from any source. All new features (active skills, accessories, armor) register modifiers natively. Existing features (skill tree passives, weapon class effects, buffs) are read through bridge functions that translate current state into modifiers.

```typescript
type ModifierSource = 'skill' | 'weapon_class' | 'accessory' | 'armor' | 'buff';

type ModifierType =
  | 'attack' | 'defense' | 'max_hp'
  | 'crit_chance' | 'crit_mult'
  | 'def_ignore'
  | 'cooldown_reduction'
  | 'status_duration' | 'magic_counter_threshold'
  | 'damage_reduction';

interface Modifier {
  type: ModifierType;
  value: number;
  source: ModifierSource;
  sourceId: string; // e.g. 'sharp_eyes', 'leather_armor', 'blade'
}
```

### API

New file `src/engine/modifiers.ts`:

- `collectModifiers(player, weaponData, armorData, accessoryData): Modifier[]` — gathers all active modifiers from equipped gear, learned skills, weapon class, and buffs.
- `totalModifier(modifiers: Modifier[], type: ModifierType): number` — sums all values for a given type.

### Bridge Functions

Inside `modifiers.ts`, bridge functions translate existing state into modifiers without changing the source code:

- **Skills bridge:** Reads `player.skills` and maps known passives to modifier equivalents. E.g., `sharp_eyes` → `{ type: 'crit_chance', value: 8, source: 'skill', sourceId: 'sharp_eyes' }`.
- **Weapon class bridge:** Reads equipped weapon class and emits the corresponding modifier. E.g., `blade` → `{ type: 'crit_chance', value: 10 }`, `heavy` → `{ type: 'def_ignore', value: 2 }`.
- **Buff bridge:** Reads `player.buffAttack` / `player.buffRounds` and emits an `attack` modifier when active.

Existing inline `hasSkill` and weapon class checks in `combat.ts` remain for now. New code (active skills, equipment effects) reads from the modifier system. Full migration of existing checks to modifier queries is a follow-up PR.

### Design Rule

The modifier system is **read-only over existing state**. It does not own or mutate skill/weapon/buff data. It collects, sums, and reports. Mutation stays where it is today (skill learning in `skills.ts`, buff tracking in `combat.ts`, etc.).

## Equipment — Armor & Accessories

### New Types

```typescript
interface ArmorDef {
  name: string;
  defense: number;
  region: string;
  description: string;
  match_words?: string[];
  price?: number;
}

interface AccessoryDef {
  name: string;
  description: string;
  region: string;
  match_words?: string[];
  modifiers: Array<{ type: ModifierType; value: number }>;
}
```

Armor has a simple DEF value — same mental model as shields. Accessories carry an array of modifiers, which is where the system pays off: an accessory can grant any combination of effects without special-casing per item.

### New PlayerState Fields

```typescript
equippedArmor: string | null;
equippedAccessory: string | null;
```

### Equip/Unequip

Same pattern as weapons and shields today:
- `use <armor>` equips armor (replaces current armor if any).
- `use <accessory>` equips accessory (replaces current).
- `drop <armor/accessory>` unequips and places on ground.
- `examine <armor/accessory>` shows stats and description.

### Defense Calculation

`totalDefense` currently sums base DEF + shield value. It additionally sums equipped armor DEF. Accessory-granted defense goes through the modifier system (e.g., `{ type: 'defense', value: 2 }` on an accessory gets picked up by `collectModifiers`).

### Data Files

**`src/data/armor.json`** — ~6 pieces across regions:

| Item | DEF | Region | Source |
|---|---|---|---|
| Leather Vest | +2 | manor | shop (Dusty) |
| Ranger's Hide | +3 | wilds | shop (Wren) |
| Chainmail | +4 | wilds | room find |
| Shadow Plate | +6 | darkness | boss drop |
| Desert Wrap | +5 | wastes | shop (Hermit) |
| Guardian Armor | +8 | wastes | boss drop |

Dungeon mode: armor drops from full bosses (floor % 10), following the same pattern as dungeon weapon drops. Generate procedurally with DEF scaling by floor.

**`src/data/accessories.json`** — ~6 pieces, search finds and boss drops only (not in shops):

| Item | Modifiers | Region | Source |
|---|---|---|---|
| Keen Eye Ring | `crit_chance: 8` | manor | search find |
| Flame Pendant | `status_duration: 1` | wilds | boss drop |
| Iron Band | `damage_reduction: 2` | darkness | search find |
| Haste Charm | `cooldown_reduction: 1` | wastes | boss drop |
| Berserker Tooth | `attack: 3, defense: -1` | darkness | search find |
| Mystic Lens | `magic_counter_threshold: -1` | hidden | search find |

The Mystic Lens is the build-defining interaction piece: magic weapons proc every 2 hits instead of 3.

### Save/Load

Bump save format to v3. Migration from v2: set `equippedArmor: null`, `equippedAccessory: null`. No data loss.

### Inventory Display

After weapon and shield, before consumables:
```
Weapon: [Magic] Hrunting (+12 ATK)
Shield: Wooden Shield (+2 DEF)
Armor: Chainmail (+4 DEF)
Accessory: Haste Charm (cooldown -1)
[*] Potion x2
```

## Active Combat Skills

### New Combat Verb

`skill <name>` during combat. Added to the combat command handler alongside attack/defend/flee/use. Typing `skill` with no target lists available skills and cooldown status.

### Cooldown Tracking

New field on `CombatState`:

```typescript
skillCooldowns: Record<string, number>; // skillId -> rounds remaining
```

Transient, resets per fight (same pattern as `magicHitCounter`). Cooldowns decrement by 1 each round at the start of `playerAttack`/`playerDefend`/`playerFlee`/`playerUseItem` (any round-incrementing action). Accessories with `cooldown_reduction` subtract from the initial cooldown value when the skill is activated.

Using `skill <name>` when on cooldown prints remaining rounds and **costs no action** (round does not increment, enemy does not act).

Using `skill <name>` without having learned it prints an error and costs no action.

### Skill Definitions

#### Power Strike

- **Tier:** 3. Requires any tier 2 skill.
- **Effect:** Replaces the normal attack for that round. Deals 1.5x damage, ignores 3 enemy DEF (stacks with heavy weapon's -2 DEF and Precision skill's -2 DEF).
- **Cooldown:** 5 rounds.
- **Message:** `"You unleash a devastating strike!"` — combat orange `[1, 0.6, 0.2, 1]`.

#### Ambush

- **Tier:** 3. Requires any tier 2 skill.
- **Effect:** Replaces the normal attack. Guaranteed critical hit at 3x multiplier. If the player already has the Assassin passive (3x mult), no double-dip — same 3x, the value is the guarantee.
- **Cooldown:** 4 rounds.
- **Message:** `"You strike from the shadows!"` — crit yellow `[1, 1, 0.2, 1]`.

#### Arcane Surge

- **Tier:** 3. Requires any tier 2 skill.
- **Effect:** Bonus action before the normal attack resolves (player still attacks normally). Force-applies equipped weapon's status effect at double duration. If the weapon has no status effect, deals flat `5 + player.level` magic damage instead.
- **Cooldown:** 5 rounds.
- **Message (effect):** `"Arcane energy amplifies your weapon's power!"` — arcane blue `[0.6, 0.8, 1, 1]`.
- **Message (burst):** `"You release a burst of arcane energy!"` — arcane blue.

### Combat Flow

```
> skill power_strike
You unleash a devastating strike!
You deal 28 damage to Shadow Knight.
Shadow Knight has 12 HP remaining.
...                                    ← enemy turn (normal)
Power Strike on cooldown (5 rounds).   ← reminder after use
```

The skill modifies the attack for that round, then the normal attack/enemy-turn/buff-tick sequence runs. `defend`, `flee`, and `use` still work normally. Cooldowns tick down regardless of what action the player takes.

### Skill Tree Integration

The existing skill tree has no branch structure — tiers are flat and `canLearnSkill` requires any one skill from the previous tier to unlock the next. Active skills follow this same pattern: they are tier 3 nodes gated by any tier 2 skill. A player with enough skill points can learn all three.

Three new nodes added to `skills.ts` at tier 3:

```typescript
{ id: 'power_strike', name: 'Power Strike', tier: 3,
  description: 'Active: 1.5x damage, ignore 3 DEF. 5-round cooldown.' },
{ id: 'ambush', name: 'Ambush', tier: 3,
  description: 'Active: Guaranteed 3x critical hit. 4-round cooldown.' },
{ id: 'arcane_surge', name: 'Arcane Surge', tier: 3,
  description: 'Active: Double-duration status proc or magic burst. 5-round cooldown.' },
```

Active skills are distinguished from passives by their id — combat code checks a known set of active skill ids (`ACTIVE_SKILLS`) rather than adding a flag to `SkillDef`. This avoids widening the `SkillDef` type or changing the `_SKILLS` const assertion. `canLearnSkill` is unchanged.

### Autocomplete

`skill` in combat autocompletes to learned active skills that are off cooldown.

### Help Text Update

Combat help line changes from:
```
Commands: attack, defend, flee, use <item>
```
to:
```
Commands: attack, defend, flee, use <item>, skill <name>
```

Exploring help (`handleHelp`) adds a line under COMBAT:
```
  skill <name>   - Use a combat skill (cooldown-based)
```

## Dungeon Mode

### Armor in Dungeon

Full bosses (floor % 10) drop procedurally generated armor alongside their weapon drop. Armor DEF scales with floor: `1 + floor`. Name generated from prefix/suffix pools (same pattern as dungeon weapons).

### Accessories in Dungeon

Vault rooms (branch room special type) have a chance to contain an accessory. Use a small pool of dungeon-specific accessories with floor-scaled values, or pull from the static accessory pool for lower floors.

## Testing

### Modifier System (`test/unit/modifiers.test.ts`)

- `collectModifiers` returns modifiers from accessory, armor, weapon class, skills, and buffs.
- `totalModifier` sums correctly, returns 0 for absent modifier types.
- Bridge translates `sharp_eyes` → `crit_chance: 8`.
- Bridge translates weapon class `blade` → `crit_chance: 10`.
- Bridge translates active buff → `attack` modifier.

### Active Skills (`test/unit/combat.test.ts`, new describe block)

- Power Strike deals 1.5x damage and ignores 3 DEF.
- Ambush guarantees a crit at 3x.
- Arcane Surge applies double-duration status effect.
- Arcane Surge deals level-scaled burst when weapon has no status effect.
- Cooldown prevents reuse, decrements each round, prints remaining.
- Cooldown reduction accessory reduces initial cooldown by 1.
- Using skill while on cooldown costs no action (round doesn't increment).
- Using skill without having learned it prints error.

### Equipment (`test/unit/equipment.test.ts`)

- Equipping armor adds to totalDefense.
- Equipping accessory applies its modifiers via collectModifiers.
- Swapping equipment changes active modifiers.
- Unequipping clears the slot.
- Examine shows armor DEF and accessory effects.
- Inventory displays armor and accessory in correct position.

### Data Integrity (`test/unit/weapon-data.test.ts`, extended)

- Every accessory has at least one modifier.
- Every armor has positive defense.
- Accessory modifier types are valid `ModifierType` values.

### Save/Load (`test/unit/save.test.ts`, extended)

- v2 save loads with null armor/accessory (migration).
- v3 save round-trips armor and accessory.

### Scenario (`test/scenario/combat-flow.test.ts`, extended)

- Full combat using an active skill, verify cooldown, then use again after cooldown expires.

## Out of Scope

- Migrating existing `hasSkill`/weapon class inline checks to modifier queries (follow-up PR).
- Accessory visual effects or special colors (use `ITEM_COLOR` for now).
- More than 3 active skills.
- Passive skill rebalancing.
- Enemy equipment or enemy active skills.
- Crafting, enchanting, or weapon upgrading.
- New regions or NPCs.
- Dungeon mode shops (separate feature).
- Mana/energy resource system.
