# Magic Weapon Class — Design Spec

**Date:** 2026-04-16
**Follows:** [weapon-classes](2026-04-11-weapon-classes-design.md) (blade/heavy/pierce shipped in PR #10)

## Goal

Add a fourth weapon class, `magic`, that fills the "reliable status pressure" niche. Magic weapons force their declared status effect to proc on every third attack, guaranteed, bypassing the normal chance roll.

## Tactical identity

The existing three classes are raw-stat passives:
- **blade** — +10% crit chance
- **heavy** — ignores 2 enemy DEF
- **pierce** — skips enemy turn on round 1

Magic fills a gap: none of the existing classes give the player predictable status-effect pressure. Status effects currently rely on per-weapon `chance` rolls, which are random and can feel bad. Magic trades the +10% crit (blade's bonus, since magic weapons were previously blades) for rhythmic, guaranteed status pressure.

## Data model

### New literal on `WeaponClass`

```typescript
export type WeaponClass = 'blade' | 'heavy' | 'pierce' | 'magic';
```

### No new fields on `WeaponDef`

Magic weapons use the existing `status_effect` field to declare their element. The class passive reads `status_effect.type`, `status_effect.damage`, and `status_effect.duration` when forcing the proc.

### Data rule

Every magic-class weapon MUST have a `status_effect` defined. This is enforced by a unit test that iterates every weapon in `weapons.json` and asserts the invariant. If a magic weapon ships without a `status_effect`, the test fails.

The rule is not encoded in the TypeScript type because `WeaponDef.status_effect` is optional (other classes may or may not declare one) and tightening the type would require a discriminated union that adds complexity for no runtime benefit.

### New transient field on `CombatState`

```typescript
magicHitCounter: number;  // initialized to 0 in createCombat
```

Never persisted. Combat state is transient and reset per fight. No save-migration concern.

## Proc mechanics

In `playerAttack` (src/engine/combat.ts), after `combat.round++` and after the equipped weapon lookup:

```typescript
if (equippedWeapon?.weapon_class === 'magic') {
  combat.magicHitCounter++;
  if (combat.magicHitCounter >= 3 && equippedWeapon.status_effect) {
    applyStatusEffect(combat.enemyEffects, {
      type: equippedWeapon.status_effect.type,
      remaining: equippedWeapon.status_effect.duration,
      damage: equippedWeapon.status_effect.damage,
      baseDamage: equippedWeapon.status_effect.damage,
    });
    combat.magicHitCounter = 0;
    messages.push({ text: procMessageFor(equippedWeapon.status_effect.type), color: [0.6, 0.8, 1, 1] });
  }
}
```

Rules:
- Counter increments BEFORE the hit resolves. Misses, dodges, and successful hits all tick the counter.
- Counter resets to 0 after the proc fires. Next proc is three attacks later.
- Forced proc is in addition to, not a replacement for, the existing `status_effect.chance` roll. Hits 1 and 2 still roll their chance normally.
- Forced proc always applies — no resistance checks, no immunity, no player-skill interactions.
- Re-application on an already-afflicted target uses existing `applyStatusEffect` behavior, which refreshes duration and damage (existing code at src/engine/combat.ts:493).

## Weapon tagging

### Reclass (already have `status_effect`)

| Weapon | Current class | New class | Element |
|---|---|---|---|
| Hrunting | blade | magic | burn |
| Tyrfing | blade | magic | poison |
| Excalibur | blade | magic | burn |
| Keyblade | blade | magic | stun |

### Reclass + add `status_effect`

| Weapon | New class | Added `status_effect` |
|---|---|---|
| Anduril | magic | `{ type: 'burn', damage: 4, duration: 3, chance: 30 }` |
| Ragnarok | magic | `{ type: 'burn', damage: 5, duration: 4, chance: 35 }` |

Rationale for added values: Anduril's numbers mirror Excalibur's (+20 ATK vs +30 ATK, but same narrative tier — "flame of the west" / "legendary glow"). Ragnarok is the highest-ATK weapon in the game at +35 and gets the strongest proc to match. Both use `burn` because "magical fire" fits their flavor text; poison and bleed would feel off for these names.

Total: six magic-class weapons.

### Balance note

Tyrfing (poison) and Keyblade (stun) now guarantee their effects on hit 3. Stun in particular is strong — it skips an enemy turn. Keyblade's stun duration stays at the existing 1 round; we accept the strength because Keyblade is a +28 ATK late-game weapon and the player earned it. No other mitigation needed.

## Dungeon generator

In `src/engine/dungeon.ts`, update `SUFFIX_CLASS`:

```typescript
const SUFFIX_CLASS: Record<string, WeaponClass> = {
  Blade: 'blade',
  Axe: 'heavy',
  Mace: 'heavy',
  Spear: 'pierce',
  Staff: 'magic',   // was 'blade'
};
```

Since magic weapons require a `status_effect`, dungeon-generated staves need one too. Generation:

```typescript
const MAGIC_ELEMENTS: StatusEffectType[] = ['burn', 'poison'];
// Stun excluded from dungeon loot — guaranteed stun from RNG-named drops is too strong.

function generateMagicStatusEffect(floor: number, rng: () => number) {
  return {
    type: rngPick(rng, MAGIC_ELEMENTS),
    damage: 1 + Math.floor(floor / 2),
    duration: 3,
    chance: 30,
  };
}
```

`generateDungeonWeapon` return type widens to include an optional `status_effect` field. When the suffix is Staff, populate it. Wire through to `state/lifecycle.ts` where dungeon weapons are registered as `WeaponDef` at runtime.

## UI

### Examine output

The existing `classTag()` helper in `src/engine/handlers/examine.ts` automatically handles the new literal once `WeaponClass` includes `'magic'`. Output becomes `[Magic] Hrunting`.

### Class passive blurb

`src/engine/handlers/examine.ts` shows a one-line passive blurb per class. Add magic's:

> "Magic: every third strike weaves its element into the target, guaranteed."

### Combat proc message

Yellow/cyan line pushed to the combat log when the forced proc fires. Color `[0.6, 0.8, 1, 1]` (arcane-blue) — distinct from existing combat message colors. Message varies by element:

| Element | Message |
|---|---|
| burn | `"Flame surges through your strike!"` |
| poison | `"Venom coils around the blade!"` |
| stun | `"Arcane force locks your foe in place!"` |
| bleed | `"Magic opens the wound!"` |

Implement as a small `procMessageFor(type: StatusEffectType): string` helper in `combat.ts`.

## Testing

### Unit tests in `test/unit/combat.test.ts`

Add to the existing `weapon class passives` describe block:

1. **Counter advances on hits, proc fires on hit 3** — use a magic weapon with burn and `chance: 0`. Attack three times. Assert no burn after hits 1 and 2, burn present after hit 3.
2. **Counter resets after proc** — six attacks. Assert proc message appears twice (after hit 3 and hit 6).
3. **Counter advances on miss** — force a miss via injected RNG. Two misses + one hit should fire the proc on the third attack.
4. **Forced proc bypasses chance roll** — weapon with `chance: 0`. Proc still fires on hit 3.
5. **Re-application refreshes duration** — apply on hit 3, tick, apply again on hit 6. Assert final `remaining` equals the declared duration, not double.
6. **Element varies by weapon** — Hrunting (burn) and Tyrfing (poison) each apply their declared element.

### Data integrity test

New test file `test/unit/weapon-data.test.ts`: iterate every weapon in `weapons.json`, assert every magic-class weapon has a `status_effect` defined.

### Dungeon test in `test/unit/dungeon.test.ts`

Generate a Staff-suffix weapon using a seeded RNG that selects Staff. Assert:
- `weapon_class === 'magic'`
- `status_effect` is defined
- `status_effect.type !== 'stun'` (stun excluded from dungeon loot)

### No scenario tests

All behavior is mechanical combat logic. Unit tests cover it. No multi-step player flow requires a scenario test.

## Out of scope

- New magic weapons beyond the six retagged/enhanced above.
- A skill-tree branch for magic (e.g., "spellweaver" node that shortens the proc cooldown). Natural follow-up but not needed for v1.
- Enemy magic weapons. Enemies don't use `WeaponDef`; they have their own special-attack system.
- A dedicated `element` field on `WeaponDef` separate from `status_effect`. Reuses existing data shape.
- Rebalancing other weapon classes in light of magic's arrival.
