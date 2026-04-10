# Shop UX Polish — Design Spec

**Date:** 2026-04-08
**Branch:** `merchant-info-display` (2 commits already landed: item stats in displays, history skip)

## Changes

### 1. Comparison on examine (shop.ts)

When examining a weapon or shield in the shop, show a comparison to the player's equipped item below the price line:
- Weapons: `Your weapon: Rusty Dagger (+2 ATK) → This: +5 ATK`
- Shields: `Your shield: (none) → This: +6 DEF`
- Consumables with `heal` effect: `Your HP: 15/30`
- Buff consumables: no comparison (temporary effects aren't comparable)

Uses `C.STAT_COLOR` for the comparison line.

### 2. Can't-afford indicator (shop.ts)

In the stock listing, items the player can't afford render in `C.ERROR_COLOR` with `[need Xg more]` appended after the stock count.

### 3. Bulk buy (shop.ts + exploring.ts)

Extend `parseBatchCount` to handle `<N> <name>` in addition to `<name> xN`. Apply it in the shop buy handler. Cap at 10 per existing convention. Loop the buy operation, stopping early if gold runs out or stock is depleted.

### 4. Sell values in inventory (info.ts)

When `showInventory` runs while `store.shopState.activeShopId` is set, append `(sells for Xg)` to consumables, shields, and weapons that have a sell price. Key items (unsellable) get no annotation.

### 5. Equipped warning on sell (shop.ts)

After a successful sell of an equipped weapon or shield, print a warning:
- Weapon: `Warning: you sold your equipped weapon! You're now fighting bare-handed.`
- Shield: `Warning: you sold your equipped shield!`

Uses `C.COMBAT_COLOR`. Warning fires after the sell confirmation line (the sell still goes through per the "warn and proceed" decision).

## Files touched

- `src/engine/handlers/shop.ts` — changes 1, 2, 3, 5
- `src/engine/handlers/info.ts` — change 4
- `src/engine/state/exploring.ts` — change 3 (parseBatchCount extension)

## Non-goals

- No shop restocking mechanic
- No buy confirmation prompt
- No `unequip` command
- No changes to economy.ts (sell values, prices unchanged)
