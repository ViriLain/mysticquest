# Weapon Classes Design

## Goal

Give every weapon a tactical identity beyond raw ATK numbers by adding a `weapon_class` field with a distinct combat passive per class.

## Weapon Classes

Three classes. Every weapon gets exactly one — no optional field, no special cases.

| Class | Passive | Description |
|-------|---------|-------------|
| **Blade** | +10% crit chance | Stacks additively with Sharp Eyes (10% base + 10% blade + 8% Sharp Eyes = 28% max) |
| **Heavy** | Ignore 2 enemy DEF | Stacks with Precision skill's -2 DEF pierce (up to -4 total). Min DEF stays 0 |
| **Pierce** | First strike on round 1 | Enemy skips their attack on round 1. Player attacks normally. One-time per combat |

## Weapon Assignments

| Weapon | Class | Rationale |
|--------|-------|-----------|
| Rusty Dagger | blade | Dagger |
| Iron Sword | blade | Sword |
| Steel Sword | blade | Sword |
| Hrunting | blade | Named sword |
| Tyrfing | blade | Cursed sword |
| Dainsleif | blade | Named sword |
| Excalibur | blade | Legendary sword |
| Vorpal Sword | blade | Sword |
| Masamune | blade | Katana |
| Anduril | blade | Named sword |
| Keeper's Blade | blade | Blade in the name |
| Keyblade | blade | Blade in the name |
| Ragnarok | blade | Endgame sword |
| Hammer | heavy | Hammer |
| Mjolnir | heavy | Thor's hammer |
| Buster Sword | heavy | Oversized, heavy weapon |
| Badger on a Stick | heavy | Blunt/joke weapon |
| FALCON PUNCH | heavy | Fist/blunt |
| Peacemaker | heavy | Heavy weapon flavor |
| Spear | pierce | Spear |
| Gungnir | pierce | Odin's spear |

Blade is the largest class (13 weapons) because most weapons are swords/daggers. Heavy (6) and Pierce (2) are smaller but their passives are proportionally stronger to compensate.

## Data Changes

### `WeaponDef` type (`src/engine/types.ts`)

Add required field:

```typescript
export type WeaponClass = 'blade' | 'heavy' | 'pierce';

export interface WeaponDef {
  // ... existing fields
  weapon_class: WeaponClass;
}
```

### `weapons.json`

Add `"weapon_class"` to every weapon entry. Example:

```json
"iron_sword": {
  "name": "Iron Sword",
  "attack_bonus": 5,
  "region": "manor",
  "description": "...",
  "weapon_class": "blade",
  "status_effect": { "type": "bleed", "damage": 1, "duration": 3, "chance": 25 }
}
```

## Combat Integration

Three insertion points in `src/engine/combat.ts`. All passives are read from the equipped weapon's `weapon_class` field at combat time — no new state needed.

### Blade: crit chance boost

In `calcDamage()`, when computing crit probability: if the attacker's weapon class is `blade`, add 0.10 to the crit chance before the RNG roll.

- Base crit: 10%
- Blade bonus: +10% (total 20%)
- Sharp Eyes: +8% (total 28% with blade)
- Assassin multiplier still applies (2x or 3x) — unchanged

### Heavy: armor pierce

In `calcDamage()`, when computing effective enemy DEF: if the attacker's weapon class is `heavy`, subtract 2 from DEF before damage calculation.

- Stacks with Precision skill's existing -2 DEF pierce
- Combined: up to -4 enemy DEF
- DEF floors at 0 (no negative DEF)

### Pierce: first strike

In the combat turn sequence: if the player's weapon class is `pierce` and it's round 1, skip the enemy's attack entirely. Player attacks normally on round 1.

- One-time advantage, round 1 only
- Does not affect subsequent rounds
- Enemy status effects from previous encounters are unaffected (fresh combat)

## Player-Facing Display

### Examine output

When examining a weapon, prepend the class tag:

```
[Blade] Iron Sword
A reliable iron blade, well-balanced and sharp.
Attack bonus: +5
Status effect: Bleed (25% chance)
```

### Combat feedback

When a class passive triggers, show a colored message:

- **Blade crit**: `"Your blade finds a weak point!"` — replaces the generic crit message for blade weapons only
- **Heavy armor pierce**: `"Heavy blow smashes through armor!"` — shown on every hit (the passive always applies)
- **Pierce first strike**: `"You strike first with your spear!"` — shown before the player's attack on round 1

## What This Doesn't Do

- No weapon switching mid-combat
- No class-specific skills or new skill interactions beyond existing stacking
- No class restrictions on who can equip what
- No changes to existing status effects or their per-weapon assignments
- No changes to room descriptions, shop listings, or inventory display

## Save Compatibility

No impact. `weapon_class` lives on `WeaponDef` (static JSON data), not on `PlayerState`. The player stores `equippedWeapon` as a string ID — class is looked up from weapon data at combat time. No save format version bump needed.

## Testing

- **Unit tests (`combat.test.ts`)**: Blade crit chance boost with injected RNG (verify 20% threshold vs 10% base), heavy DEF reduction (verify damage calc with/without), pierce first strike (verify enemy skips round 1)
- **Unit test for examine**: Verify `[Blade]`/`[Heavy]`/`[Pierce]` class tag appears in examine output
- **Scenario test**: Equip a heavy weapon, attack an enemy with known DEF, verify increased damage from armor pierce
