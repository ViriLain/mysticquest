# MysticQuest Engine Foundation Design

**Date:** 2026-04-06
**Status:** Draft for review

## Overview

Four interrelated upgrades to the MysticQuest codebase, sequenced to minimize risk:

1. **Test infrastructure** — vitest with hybrid unit + scenario coverage, locking in current behavior before any code moves.
2. **Reducer modularization** — split the 2,383-line `gameReducer.ts` monolith into per-command handlers and per-state-kind dispatchers, with no behavior changes.
3. **Dynamic flavor text** — rooms can have an alternate `description_cleared` that automatically renders after the room is "cleared" (default trigger: all initial enemies dead).
4. **Icons** — ASCII glyph prefixes (`[*]` items, `[+]` weapons, `[!]` enemies, `[@]` NPCs, `>` exits, `[#]` key items, `[=]` shields, `[$]` ground loot) on room/inventory/examine output. Shops use grouped section headers instead.
5. **Economy** — gold currency, item prices, three regional shops with finite stock, full buy/sell loop via a new `shop` game state.

The work is sequenced so each phase ends in a passing build with no half-finished features. Tests gate every phase boundary.

## Goals

- Catch regressions automatically as new code lands
- Make the engine code legible enough that adding a new feature is a 1-2 file change, not a hunt through 2,383 lines
- Give the player a meaningful economy loop without inventing complexity the game doesn't need
- Make the world feel reactive to player actions without breaking the kid-coder narrative tone
- Visual refresh that fits the 2009-school-project meta-narrative

## Non-goals

- Pure-functional reducer rewrite. Handlers will continue to mutate `store.player.*`, `store.world.rooms[id]._*`, etc. The boundary being enforced is *modular* mutation, not the elimination of mutation.
- React component refactor. `Game.tsx` is touched only where new state kinds (`shop`) need to render and where the header gains a gold display.
- TypeScript strict mode tightening, ESLint rule changes, Prettier setup. Out of scope.
- Restock mechanics, region pricing, haggling, multiple currencies. Out of scope (Phase 2 ideas).
- New ASCII art. The shop screen is text-only.
- Combat balance changes, new enemies, new weapons, new endings.

## Constraints

- The pure-engine line (no React imports in `engine/`) must be preserved.
- Save format must migrate forward cleanly. Existing v1 saves load into v2 with sane defaults.
- The kid-coder meta-narrative tone must be honored in any new prose (alternate descriptions, shop names, item descriptions).
- The CRT terminal aesthetic (monospace, color-only effects, no images outside ASCII art) is sacred.

## Architecture

### Target file layout

```
src/
  engine/
    gameReducer.ts          # SHRINKS from 2,383 → ~750 lines (as built).
                            # Originally spec'd at ~250, but enterRoom,
                            # startCombat, startDialogue, startEnding, and the
                            # build*Deps wiring for each state dispatcher can't
                            # cleanly move without ballooning cross-file deps,
                            # so they stay. Game lifecycle (startNewGame,
                            # startContinue, startDungeonMode, startMenu,
                            # loadDungeonFloor) lives in state/lifecycle.ts.
    handlers/               # NEW — one file per command
      take.ts
      drop.ts
      use.ts
      go.ts
      look.ts
      search.ts
      attack.ts
      examine.ts
      talk.ts
      shop.ts               # NEW — buy/sell/examine/leave inside shop state
      help.ts
      info.ts               # journal + score + achievements + skills + stats + inventory
      meta.ts               # learn (action handlers only; display lives in info.ts)
    state/                  # NEW — per-GameStateKind dispatchers
      exploring.ts          # the relocated handleExploringCommand
      combat.ts             # the relocated handleCombatCommand
      dialogue.ts           # the relocated handleDialogueInput + NPC dialogue
      shop.ts               # NEW — handleShopCommand, autocomplete for stock
      slot-picker.ts
      settings.ts
      gameover.ts
      menu.ts
      lifecycle.ts          # NEW — startNewGame/Continue/DungeonMode/Menu, loadDungeonFloor
                            # (boot.ts and ending.ts were not extracted;
                            #  updateBoot/updateEnding stayed in gameReducer.ts
                            #  because they're 20 lines each and tightly
                            #  coupled to handleTick)
    output.ts               # NEW — addLine, addLineInstant, displayAscii,
                            #       emitSound, clearTerminal, updateHeader,
                            #       hideHeader, applyRegionTint
    matching.ts             # NEW — findAllMatches, resolveOrDisambiguate
    display.ts              # NEW — displayRoom (icon-aware + cleared-aware)
    economy.ts              # NEW — pure money/price/transaction logic
    descriptions.ts         # NEW — pure pickDescription / isRoomCleared
    icons.ts                # NEW — glyph constants + iconLine helper
    # Pure modules unchanged: combat.ts, player.ts, world.ts, save.ts,
    # skills.ts, achievements.ts, endings.ts, events.ts, dungeon.ts,
    # rng.ts, settings.ts, audio.ts, minimap.ts, asciiArt.ts, effects.ts,
    # constants.ts, commands.ts, types.ts
  data/
    items.json              # MODIFIED — `price` field on consumables/shields
    weapons.json            # MODIFIED — `price` field on weapons
    enemies.json            # MODIFIED — `gold` field on each enemy
    shops.json              # NEW — three regional merchant stocks
    npcs.json               # MODIFIED — Dusty/Wren/Hermit get a "Browse wares"
                            #            choice with effect.open_shop
    regions/*.json          # MODIFIED — `description_cleared` and optional
                            #            `clear_flag` on selected rooms
  test/                     # NEW
    setup.ts                # vitest bootstrap, localStorage polyfill
    unit/
      player.test.ts
      combat.test.ts
      world.test.ts
      save.test.ts
      economy.test.ts
      descriptions.test.ts
      matching.test.ts
      icons.test.ts
    scenario/
      new-game.test.ts
      take-and-use.test.ts
      combat-flow.test.ts
      shop-flow.test.ts
      save-load.test.ts
      ending-triggers.test.ts
      dynamic-descriptions.test.ts
    fixtures/
      mock-input.ts
      assert-output.ts
docs/
  superpowers/
    specs/
      2026-04-06-engine-foundation-design.md   # this file
```

### Boundary rules

These rules are enforced by hand during the refactor (not by tooling):

- `handlers/*.ts` may import: `output.ts`, `matching.ts`, `display.ts`, pure engine modules (`player`, `combat`, `world`, `save`, `economy`, `descriptions`, `icons`, etc.), data JSON, types. May NOT import: other `handlers/*.ts`, `gameReducer.ts`, `state/*.ts`, React.
- `state/*.ts` is the only thing that imports `handlers/*.ts`. May also import `output.ts`, `display.ts`, and pure modules.
- `gameReducer.ts` imports `state/*.ts` for top-level routing. May NOT import individual handlers.
- Pure modules (`economy.ts`, `descriptions.ts`, `combat.ts`, `player.ts`, `icons.ts`, `matching.ts`) take arguments and return values. They do NOT import `output.ts` or touch `store.lines`/`store.soundQueue`.
- `display.ts` is the rendering layer. It may import `output.ts` (because rendering room contents is its single responsibility), pure modules (`descriptions.ts`, `icons.ts`, `matching.ts`, `world.ts`, `player.ts`), data JSON, and types. It may NOT import handlers or state dispatchers.

The goal of these rules is one-way data flow from dispatchers down to handlers down to pure modules, with `output.ts` as the only writer of terminal text.

## Component designs

### Component 1: Test infrastructure (Phase 0–1)

**Tooling additions:**

- `vitest@^2` and `@vitest/coverage-v8` to `devDependencies`. Pin to v2 for stability with Vite 5; the orphaned `vitest@4.1.2` currently in `node_modules` is removed before install (`rm -rf node_modules/vitest && npm install`).
- `vitest.config.ts`:
  ```ts
  import { defineConfig } from 'vitest/config';
  export default defineConfig({
    test: {
      environment: 'node',
      setupFiles: ['./test/setup.ts'],
      include: ['test/**/*.test.ts'],
    },
  });
  ```
- `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:coverage": "vitest run --coverage"`.
- `test/setup.ts` polyfills `localStorage` with an in-memory `Map` so `save.ts` works without jsdom.

**Test fixtures:**

`test/fixtures/mock-input.ts` provides four primitives:

```ts
export function newGame(): GameStore;       // createInitialStore + skip boot + start new game
export function input(s: GameStore, text: string): GameStore;  // dispatch TEXT_INPUT chars + Enter
export function tick(s: GameStore, dt?: number): GameStore;    // one frame, default 16ms
export function flushTypewriter(s: GameStore): GameStore;      // drain queue, all lines committed
```

`test/fixtures/assert-output.ts` provides:

```ts
export function lastLines(s: GameStore, n?: number): string[];
export function expectLine(s: GameStore, substr: string): void;
export function expectNoLine(s: GameStore, substr: string): void;
```

These let scenario tests read like:
```ts
let s = newGame();
s = input(s, 'take potion');
s = input(s, 'go north');
s = input(s, 'attack rat');
expectLine(s, 'You deal');
```

**Determinism: RNG injection in combat:**

`engine/combat.ts` currently calls `Math.random()` directly inside `randInt`/`calcDamage`/`enemyTurn`/`playerFlee`. This is the only blocker to deterministic combat tests.

Surgery:
- `playerAttack`, `playerDefend`, `playerFlee`, `playerUseItem`, `enemyTurn`, `calcDamage` gain an optional `rng?: () => number` parameter that defaults to `Math.random`.
- The parameter threads through internal helpers via closure or explicit passing.
- Production callers (`gameReducer.ts` → `state/combat.ts` after refactor) pass nothing; tests pass a seeded RNG built from `engine/rng.ts:mulberry32`.

`gameReducer.ts:1859` (`handleDungeonSpecialRoom` library shuffle) and any other `Math.random()` usage in non-combat paths is left alone for now; those code paths aren't covered by Phase 1 tests.

**Phase 1 test scope:**

Unit tests written against current code (no refactor yet):
- `player.test.ts` — addItem/removeItem/hasItem (regular + key items), addXp + level curve to level 15, equipWeapon, takeDamage with `defending` halving, hasSkill predicate
- `combat.test.ts` — calcDamage with seeded RNG (deterministic), playerAttack hit/crit/no-crit, enemyTurn dodge with Lucky skill, buff tick (decrement and clear), enemyDefeated returns correct loot/weapon/xp, isDead detection
- `world.test.ts` — loadRegion populates rooms + regions index, getExits merges static + `_dynamic_exits`, markEnemyDead updates `_dead_enemies`, getLivingEnemies filters
- `save.test.ts` — serialize → deserialize round-trip preserves PlayerState fields, room runtime state (`_dead_enemies`, `_dynamic_exits`, `_ground_loot`, `_ground_weapons`), the manifest update flow
- `matching.test.ts` — exact id match, exact name match, match_words hit, partial fallback, multi-match return

Scenario tests written against the current monolith reducer:
- `new-game.test.ts` — boot through new game, first room renders, header shows correct HP/level
- `take-and-use.test.ts` — take potion, use potion, HP restored
- `combat-flow.test.ts` — encounter shadow_rat, attack until win, loot drops to ground, XP awarded
- `save-load.test.ts` — full state save → reload → state matches across visited rooms, dead enemies, inventory

These tests are the safety net for Phase 2. They MUST pass before any handler extraction starts.

**Coverage targets:**
- ~70% line coverage on `engine/` overall in Phase 1 (lock-in)
- ~95% on the new pure modules (`economy.ts`, `descriptions.ts`, `icons.ts`) by end of project
- Not chasing 100%. Diminishing returns.

### Component 2: Reducer modularization (Phase 2)

The principle: **move code, do not rewrite logic.** Behavior must be byte-identical at every step.

**Extraction order (each step ends with `npm test` green):**

1. `engine/output.ts` — relocate `addLine`, `addLineInstant`, `emitSound`, `clearTerminal`, `displayAscii`, `updateHeader`, `hideHeader`, `applyRegionTint` (currently `gameReducer.ts:39-95`).
2. `engine/matching.ts` — relocate `findAllMatches`, `resolveOrDisambiguate` (`gameReducer.ts:97-146`). Pure functions.
3. `engine/display.ts` — relocate `displayRoom` (`gameReducer.ts:308-368`). This is also where icons and dynamic descriptions land in Phases 3–4, so it gets a clear home now.
4. Handlers, easiest to hardest:
   - `handlers/look.ts`, `handlers/help.ts`, journal/score helpers
   - `handlers/take.ts`, `handlers/drop.ts`, `handlers/examine.ts`
   - `handlers/use.ts` (consumable + key item + shield equip branches)
   - `handlers/search.ts`
   - `handlers/attack.ts`
   - `handlers/talk.ts` (NPC dialogue trigger)
   - `handlers/meta.ts` (save/load/map/settings/achievements/skills/learn/again/quit)
5. Per-state-kind dispatchers:
   - `state/exploring.ts` — the relocated `handleExploringCommand` switch + autocomplete logic (`getAutocompleteSuggestions` from `gameReducer.ts:615-683`)
   - `state/combat.ts` — `handleCombatCommand` (the long victory/loot/achievement block stays inside this file since it's tightly coupled)
   - `state/dialogue.ts` — `handleDialogueInput`, `handleNpcDialogueInput`, `displayDialogueNode`, `checkDialogueCondition`, the dungeon special-room handlers (`handleDungeonSpecialRoom`, `handleDungeonSpecialChoice`, `handleDungeonRestInput`)
   - `state/slot-picker.ts` — `openSlotPicker`, `handleSlotPickerKey`
   - `state/settings.ts` — `openSettings`, `handleSettingsKey`
   - `state/menu.ts` — `handleMenuKey`, `startNewGame`, `startContinue`
   - `state/gameover.ts` — `handleGameoverInput`, `startGameover`
   - `state/boot.ts` — `updateBoot`
   - `state/ending.ts` — `updateEnding`, `startEnding`, `startDialogue`
6. `gameReducer.ts` shrinks to:
   - `createInitialStore`
   - `gameReducer` action switch
   - `handleTick` (typewriter/effects/region-tint/line-buffer-trim — NOT command logic)
   - `handleKeyPressed` top-level state-kind router
   - `handleTextInput` top-level state-kind router

**Mutation pattern is preserved.** Handlers continue to mutate `store.player.*` and `store.world.rooms[id]._*` directly. The boundary we enforce is "handlers mutate state and call output helpers; pure modules return values."

**Verification gate:** After Phase 2, full test suite passes + 5-minute manual playthrough (Manor → kill rat → take potion → save → load → enter cellar → fight shade → die or win).

### Component 3: Dynamic flavor text (Phase 3)

**Type changes** (`engine/types.ts`):

```ts
export interface RoomDef {
  // ... existing fields unchanged
  description: string;
  description_cleared?: string;   // NEW — alternate text after room is cleared
  clear_flag?: string;            // NEW — optional override for the cleared trigger
}
```

**Pure module** (`engine/descriptions.ts`):

```ts
import type { RoomDef, PlayerState } from './types';

export function isRoomCleared(room: RoomDef, player: PlayerState): boolean {
  // Override: explicit flag wins
  if (room.clear_flag) return !!player.firedEvents[room.clear_flag];

  // Default: all initial enemies dead
  if (room.enemies && room.enemies.length > 0) {
    return room.enemies.every(eid => room._dead_enemies?.[eid]);
  }

  // Rooms with no enemies and no clear_flag are never "cleared"
  return false;
}

export function pickDescription(room: RoomDef, player: PlayerState): string {
  if (room.description_cleared && isRoomCleared(room, player)) {
    return room.description_cleared;
  }
  return room.description;
}
```

**Display integration** — inside the relocated `displayRoom` in `display.ts`:

```ts
// Before:
addLine(store, room.description);

// After:
addLine(store, pickDescription(room, store.player));
```

**Save format:** No bump needed. `_dead_enemies` and `firedEvents` already persist in v1 saves.

**Authoring rollout (Phase 3 first pass):**

I'll author alternate descriptions for these rooms. Tone: kid-coder, mildly proud, slightly pleased that the player succeeded — not literary.

| Room | Trigger | Notes |
|---|---|---|
| `manor_entry` | `shadow_rat` dead | First-room teaching moment |
| `manor_wine_cellar` | `cellar_shade` dead | Boss room, biggest emotional beat |
| `manor_library_dome` | `clear_flag: "took_ancient_map"` | Demonstrates the override mechanism on a non-combat room |
| Wilds mountain cave (the room with `mountain_troll`) | `mountain_troll` dead | Wilds capstone |
| Wastes ruins boss room | `ruins_guardian` dead | Wastes capstone |
| Darkness throne room | `evil_king` dead | Final beat — the room becomes silent |
| 1–2 minor rooms (TBD during implementation, picked for tone variety) | enemy dead | Spread the system across regions |

The user reviews my prose during Phase 3 and can swap any of it.

**For the `manor_library_dome` override:** an `on_take` mechanism doesn't currently exist. The cleanest path is for the `take` handler, when the player takes `ancient_map`, to set `player.firedEvents["took_ancient_map"] = true`. This is one extra line in `handlers/take.ts` keyed off the item id. Alternative: introduce a generic `on_take` field in items.json — overkill for one room. Going with the targeted fired-event approach.

**Tests (`test/scenario/dynamic-descriptions.test.ts`):**
- Enter wine cellar → assert default description in output → kill shade → re-enter → assert `_cleared` text in output, default text *not* in output
- Manor entry → kill rat → re-enter → cleared description
- Library dome → take ancient map → re-enter → cleared description (proves the `clear_flag` override path)
- Plus unit tests in `descriptions.test.ts` for `isRoomCleared` (no enemies + no flag → false; some enemies dead → false; all enemies dead → true; flag set → true; flag not set → false) and `pickDescription` branch coverage.

### Component 4: Icons (Phase 4)

**New module** (`engine/icons.ts`):

```ts
export const ICON = {
  item:    '[*]',
  weapon:  '[+]',
  enemy:   '[!]',
  npc:     '[@]',
  exit:    '>',
  key:     '[#]',
  shield:  '[=]',
  loot:    '[$]',
} as const;

export function iconLine(icon: string, text: string): string {
  return `${icon} ${text}`;
}
```

No state. No settings toggle. Easy to add later if anyone hates the look.

**Application points:**

In `display.ts` (relocated `displayRoom`):
```ts
addLine(store, iconLine(ICON.enemy,  `A ${edata.name} lurks here.`),       C.ENEMY_COLOR);
addLine(store, iconLine(ICON.item,   `You see a ${idata.name} here.`),     C.ITEM_COLOR);
addLine(store, iconLine(ICON.weapon, `You see a ${wdata.name} here.`),     C.ITEM_COLOR);
addLine(store, iconLine(ICON.loot,   `You see a ${idata.name} on the ground.`), C.LOOT_COLOR);
addLine(store, iconLine(ICON.loot,   `You see a ${wdata.name} on the ground.`), C.LOOT_COLOR);
addLine(store, iconLine(ICON.npc,    `${npc.name} is here.`),              C.NPC_COLOR);
addLine(store, iconLine(ICON.exit,   'Exits: ' + exitList.join(', ')),     C.EXITS_COLOR);
```

In `state/exploring.ts` (relocated `showInventory`, `showStats`, etc.):
- Inventory weapons get `[+]`, items get `[*]`, key items get `[#]`, shield equip slot gets `[=]`
- Examine output gets a glyph in the `=== Name ===` header line based on what's being examined (enemy/weapon/item/key)
- Combat enemy intro line gets `[!]`

Lines that do NOT get glyphs:
- Headers/separators (`===`, `---`)
- The room description prose itself
- `dev_note` lines
- Help text
- Boot/ending/menu text
- ASCII art

**Tests:**
- Unit test in `icons.test.ts`: `iconLine(ICON.item, 'Potion')` → `'[*] Potion'` for each ICON entry
- Existing scenario tests already assert on substrings like `'lurks here'` — they keep working because the substring is preserved
- Add a few new asserts that the glyph appears: `expectLine(s, '[!]')` after entering a room with an enemy, `expectLine(s, '[$]')` after defeating one and looking at the ground

### Component 5: Economy (Phases 5–6)

**Currency:**
- `PlayerState` gains `gold: number` (default 0)
- `createPlayer` initializes to 0
- Header rendering adds `G:N` between LVL and weapon: `MYSTICQUEST v1.0    HP:24/30  LVL:3  G:42  Iron Sword`
- `showStats` adds `Gold: N` line

**Item / weapon prices:**
- `items.json` gets `price: number` on consumables and shields. Key items have no price.
- `weapons.json` gets `price: number` on every weapon.
- Sell value rule: `Math.floor(price / 2)`. Hardcoded in `economy.ts`. No per-item sell prices.

Calibration sketch (subject to in-implementation tuning):

| Item | Price |
|---|---|
| small_potion | 5g |
| potion | 12g |
| large_potion | 30g |
| strength_tonic | 25g |
| iron_shield | 40g |
| steel_shield | 90g |
| rusty_dagger | 15g |
| iron_sword | 35g |
| hammer | 25g |
| spear | 70g |
| steel_sword | 60g |

(Late-region weapons are price-gated past affordability — they're loot rewards, not shop items, and shouldn't appear in any shop's stock.)

**Gold sources:**
- Each enemy in `enemies.json` gets `gold: number`. Calibration:
  - Manor mooks: 2–5g
  - Cellar shade boss: 30g
  - Wilds mooks: 4–8g
  - Mountain troll boss: 60g
  - Wastes mooks: 8–15g
  - Ruins guardian boss: 100g
  - Darkness mooks: 8–12g
  - Oblivion guardian boss: 80g
  - Evil King: 0g (meta-narrative — he's beyond commerce)
  - Milo: 0g (he's a cat)
- Selling at half price.
- Explicitly NOT: chests, search loot, quest rewards. Phase 2 ideas if ever needed.

**Shops (`data/shops.json`):**

```json
{
  "manor_dusty": {
    "owner_npc": "manor_merchant",
    "name": "Dusty's Wares",
    "stock": [
      { "id": "small_potion", "qty": 5 },
      { "id": "potion",       "qty": 3 },
      { "id": "iron_shield",  "qty": 1 },
      { "id": "rusty_dagger", "qty": 1, "type": "weapon" }
    ],
    "buys": "all"
  },
  "wilds_wren": {
    "owner_npc": "wilds_guide",
    "name": "Wren's Camp Supplies",
    "stock": [
      { "id": "potion",         "qty": 4 },
      { "id": "large_potion",   "qty": 1 },
      { "id": "strength_tonic", "qty": 2 },
      { "id": "spear",          "qty": 1, "type": "weapon" }
    ],
    "buys": "all"
  },
  "wastes_hermit": {
    "owner_npc": "wastes_hermit",
    "name": "The Hermit's Trinkets",
    "stock": [
      { "id": "large_potion",   "qty": 2 },
      { "id": "strength_tonic", "qty": 3 },
      { "id": "steel_shield",   "qty": 1 }
    ],
    "buys": "all"
  }
}
```

Three shops, one per major story region. Darkness has no merchant by design. Hidden's Sir Whiskers is left as-is (joke character, not a merchant).

Stock semantics: **finite, no restock.** Quantities decrement on purchase. Once gone, gone for that save.

**Pure economy module (`engine/economy.ts`):**

```ts
import type { PlayerState, ItemDef, WeaponDef } from './types';

export interface ShopStockEntry {
  id: string;
  qty: number;
  type?: 'item' | 'weapon';  // defaults to 'item'
}

export interface ShopDef {
  owner_npc: string;
  name: string;
  stock: ShopStockEntry[];
  buys: 'all' | 'consumables' | 'weapons';
}

export interface ShopRuntimeState {
  shopId: string;
  // Key is the stringified entry index ("0", "1", ...). Stringified because
  // JSON.stringify turns numeric Record keys into strings on the wire, and
  // we want the runtime and serialized forms to use the same shape.
  // Missing entries use the static qty from the ShopDef.
  remainingStock: Record<string, number>;
}

export type BuyResult =
  | { ok: true; itemId: string; type: 'item' | 'weapon'; price: number }
  | { ok: false; reason: 'insufficient_gold' | 'out_of_stock' | 'unknown_item'; needed?: number };

export type SellResult =
  | { ok: true; itemId: string; price: number }
  | { ok: false; reason: 'not_owned' | 'key_item' | 'shop_refuses' };

export function canAfford(player: PlayerState, price: number): boolean;
export function chargeGold(player: PlayerState, amount: number): void;
export function awardGold(player: PlayerState, amount: number): void;

export function priceOf(
  itemId: string,
  type: 'item' | 'weapon',
  items: Record<string, ItemDef>,
  weapons: Record<string, WeaponDef>,
): number | null;

export function sellValueOf(
  itemId: string,
  type: 'item' | 'weapon',
  items: Record<string, ItemDef>,
  weapons: Record<string, WeaponDef>,
): number | null;

export function getEffectiveStock(
  shop: ShopDef,
  runtime: ShopRuntimeState,
): Array<{ entry: ShopStockEntry; index: number; remaining: number }>;

export function buyItem(
  player: PlayerState,
  shop: ShopDef,
  runtime: ShopRuntimeState,
  entryIndex: number,
  items: Record<string, ItemDef>,
  weapons: Record<string, WeaponDef>,
): BuyResult;

export function sellItem(
  player: PlayerState,
  shop: ShopDef,
  itemId: string,
  type: 'item' | 'weapon',
  items: Record<string, ItemDef>,
  weapons: Record<string, WeaponDef>,
): SellResult;
```

All pure. No `addLine`, no React, no DOM. Returns result objects. The handler turns them into output lines. **Most-tested module in the project.**

**`GameStore` additions:**

```ts
export interface GameStore {
  // ... existing fields
  shopState: {
    activeShopId: string | null;
    runtime: Record<string, ShopRuntimeState>;  // shopId → runtime
  };
}
```

`GameStateKind` gains `'shop'`.

**Save format bump v1 → v2:**

```ts
interface SaveData {
  version: 2;  // bumped
  player: { /* ... existing */ gold: number };  // NEW field
  world_state: { /* unchanged */ };
  shops?: Record<string, { remainingStock: Record<string, number> }>;  // NEW
  dungeon?: { /* unchanged */ };
}
```

Migration in `save.ts:deserialize`:
- If incoming `version === 1`: set `player.gold = 0`, `shops = {}`, then proceed
- If incoming `version === 2`: load as-is
- Auto-save after load rewrites in v2 format

Round-trip test in `save.test.ts`: write v1 JSON to localStorage, load it, assert player has gold=0 and no shop runtime, then save and verify the new file is v2.

**Shop UX flow:**

1. Player talks to merchant NPC, picks "Browse wares" choice
2. The choice has a new dialogue effect: `{ "open_shop": "manor_dusty" }`
3. `state/dialogue.ts:handleNpcDialogueInput` recognizes `open_shop`, sets:
   - `store.state = 'shop'`
   - `store.shopState.activeShopId = 'manor_dusty'`
   - Initializes `runtime[shopId]` from static stock if not already present
4. `state/shop.ts` renders the shop screen and accepts commands

**Shop screen rendering (style C — section headers, no per-line glyphs):**

```
========== DUSTY'S WARES ==========
Your gold: 42

-- FOR SALE --
  small potion .......... 5g  (5 left)
  potion ............... 12g  (3 left)
  iron shield .......... 40g  (1 left)
  rusty dagger ......... 15g  (1 left, weapon)

Commands: buy <item>, sell <item>, examine <item>, leave
```

**Shop commands (`handlers/shop.ts`, dispatched by `state/shop.ts`):**

- `buy <item>` — fuzzy match against stock entries via `findAllMatches`. Calls `economy.buyItem`. On success: `[$] Bought Potion for 12g.` On failure: contextual error line.
- `sell <item>` — fuzzy match against player inventory + weapons. Filters by `shop.buys` and item type. Calls `economy.sellItem`. On success: `[$] Sold Iron Shield for 20g.` On failure: contextual error.
- `examine <item>` — same as exploring `examine`, scoped to shop stock + player inventory.
- `leave` — sets `store.state = 'exploring'`, redisplays the room via `displayRoom`.
- Tab autocomplete: `buy` completes against in-stock entries; `sell` completes against player inventory.

**Edge cases the handlers must cover:**
- Buying when gold insufficient → `"You need 5 more gold."` (no state change)
- Buying when stock exhausted → `"Dusty doesn't have any of those."` (only triggers if user types an item that previously had stock)
- Selling an equipped weapon → unequip first, then sell, then update header
- Selling a key item → `"You can't sell that."`
- Selling something the shop doesn't buy (`shop.buys` filter) → `"Dusty doesn't want that."`
- Selling an item you don't own → `"You don't have that."`

**Combat loot loop change (`state/combat.ts`):**

After enemy defeat, in addition to existing item/weapon drops:
```ts
const goldReward = combat.enemy.gold ?? 0;
if (goldReward > 0) {
  awardGold(store.player, goldReward);
  addLine(store, iconLine(ICON.loot, `You loot ${goldReward} gold.`), C.LOOT_COLOR);
}
```

`combat.ts:enemyDefeated` and the `EnemyInstance` type get a `gold: number` field; `createCombat` reads it from `enemyData[enemyId].gold ?? 0`.

**Tests:**

Unit (`test/unit/economy.test.ts`) — exhaustive coverage:
- `canAfford` true/false at boundary
- `priceOf` returns price for items + weapons, returns null for key items, returns null for missing ids
- `sellValueOf` floor rounding (5 → 2, 7 → 3)
- `buyItem` happy path → gold debited, stock decremented, item added (consumable + weapon variants)
- `buyItem` insufficient gold → no mutation, returns `{ ok: false, reason: 'insufficient_gold', needed }`
- `buyItem` zero stock → no mutation, returns `{ ok: false, reason: 'out_of_stock' }`
- `sellItem` happy path → gold credited at half price, item removed from inventory
- `sellItem` key item → returns `{ ok: false, reason: 'key_item' }`, no mutation
- `sellItem` equipped weapon → unequips, removes from `weapons[]`, credits gold
- `sellItem` shop refuses (mock `buys: 'consumables'` selling a weapon) → `{ ok: false, reason: 'shop_refuses' }`
- `sellItem` not owned → `{ ok: false, reason: 'not_owned' }`

Scenario (`test/scenario/shop-flow.test.ts`):
- New game → walk to Manor Main Hall → talk to Dusty → pick "Browse wares" → assert in shop state, gold visible
- Loot enemies until you have enough gold → buy potion → gold drops, potion in inventory
- Sell rusty dagger → gold rises by 7g (sell value of 15g), dagger gone from `weapons[]`
- `leave` → back in exploring state, room display shows correctly
- Save mid-game with decremented stock → load → stock matches
- Buy when broke → error line, gold unchanged, state unchanged
- Try to sell equipped iron sword → unequips first, sells, header reverts to "Fists"

## Implementation order

Each phase ends in a runnable, passing build. Tests gate every phase boundary.

### Phase 0 — Foundation

- Add `vitest@^2`, `@vitest/coverage-v8` to `devDependencies`. Remove orphaned `vitest@4` from `node_modules` and reinstall.
- `vitest.config.ts`, `npm test` / `test:watch` / `test:coverage` scripts.
- `test/setup.ts` (localStorage polyfill).
- `test/fixtures/mock-input.ts` and `test/fixtures/assert-output.ts`.
- One smoke scenario test that starts a new game and asserts the first room renders.
- **Gate:** smoke test green.

### Phase 1 — Lock in current behavior

- RNG injection in `combat.ts` (`rng?: () => number` parameter on attack/defend/flee/use/enemyTurn/calcDamage).
- Add `export` to `findAllMatches` in `gameReducer.ts:100` so `matching.test.ts` can import it. One-line visibility change, not a refactor — the function stays in place until Phase 2 step 2 moves it to `matching.ts` and updates the import.
- Manual sanity playtest: 5 minutes of combat to confirm the RNG change feels identical.
- Unit tests: `player.test.ts`, `world.test.ts`, `combat.test.ts`, `save.test.ts`, `matching.test.ts` (importing from `gameReducer.ts` for now).
- Scenario tests against the current monolith: `new-game.test.ts`, `take-and-use.test.ts`, `combat-flow.test.ts`, `save-load.test.ts`.
- **Gate:** full test suite green. These tests are the safety net for Phase 2.

### Phase 2 — Reducer modularization

Strict order, test after each:

1. Extract `output.ts`. Run tests.
2. Extract `matching.ts`. Run tests.
3. Extract `display.ts` (relocated `displayRoom`). Run tests.
4. Extract handlers in order: `look`/`help`/`journal`/`score` → `take`/`drop`/`examine` → `use` → `search` → `attack` → `talk` → `meta`. Test after each.
5. Extract per-state-kind dispatchers: `state/exploring.ts`, `state/combat.ts`, `state/dialogue.ts`, `state/slot-picker.ts`, `state/settings.ts`, `state/menu.ts`, `state/gameover.ts`, `state/boot.ts`, `state/ending.ts`. Test after each.
6. Shrink `gameReducer.ts` to ~250 lines: `createInitialStore`, action switch, `handleTick`, top-level state-kind routers in `handleKeyPressed`/`handleTextInput`.

- **Gate:** full test suite green + 5-minute manual playthrough.

### Phase 3 — Dynamic descriptions

- `engine/descriptions.ts` (pure module). Unit tests in `descriptions.test.ts`.
- Add `description_cleared` and `clear_flag` to `RoomDef` type.
- Update `display.ts` to call `pickDescription`.
- Author 6–8 alternate descriptions in selected rooms.
- Add the `firedEvents["took_ancient_map"] = true` line to `handlers/take.ts` keyed off the item id (one targeted change for the override demo).
- Scenario tests in `dynamic-descriptions.test.ts`.
- **Gate:** test suite green + manual: kill cellar shade, re-enter, see new prose.

### Phase 4 — Icons

- `engine/icons.ts` constants module. Unit tests in `icons.test.ts`.
- Update `display.ts` (`displayRoom`) — items/weapons/enemies/NPCs/exits/loot get glyphs.
- Update `state/exploring.ts` (`showInventory`, `showStats`, `showJournal`, `showSkills`, `showAchievements`, `handleExamine`) for glyphs in their output.
- Update `state/combat.ts` (combat enemy intro line + loot drop lines) for glyphs.
- Update existing scenario tests with new glyph asserts.
- Manual playtest: 10 minutes through Manor → Wilds verifying the glyphs read well.
- **Gate:** test suite green + manual playtest passes.

### Phase 5 — Economy core (no UX yet)

- Add `gold` to `PlayerState`. `createPlayer` initializes to 0.
- Add `price` to `items.json` (consumables + shields) and `weapons.json` (all weapons). Calibrated.
- Add `gold` to `enemies.json` (every enemy).
- `engine/economy.ts` pure module. Write tests first, then implementation. 100% coverage on this file.
- Update `state/combat.ts` loot loop to award gold from `combat.enemy.gold`.
- Update `EnemyInstance` type and `createCombat` to carry `gold`.
- Update `output.ts:updateHeader` to display `G:N` between LVL and weapon.
- Update `state/exploring.ts:showStats` to display `Gold: N`.
- Save format bump v1 → v2 in `save.ts`. Migration tests in `save.test.ts` (write a v1 JSON, load it, assert defaults, save it back, verify v2 format).
- **Gate:** test suite green. Game playable. Gold drops from kills, displays in header, persists across save/load. No way to spend it yet — that's intentional.

### Phase 6 — Shops

- `data/shops.json` with three shops.
- Add `shopState` to `GameStore` and `'shop'` to `GameStateKind`.
- Add `open_shop` dialogue effect handling in `state/dialogue.ts:handleNpcDialogueInput`.
- `handlers/shop.ts` — `buy`, `sell`, `examine`, `leave`.
- `state/shop.ts` — dispatcher + autocomplete.
- Shop screen rendering helper in `display.ts` (style C, section headers).
- Update Dusty's, Wren's, Hermit's NPC dialogue trees in `npcs.json` to add the "Browse wares" choice with `effect.open_shop` pointing at the right shop id.
- Save format extension for shop runtime state (already in v2 schema from Phase 5; just plumb through `serialize`/`deserialize`).
- Top-level routing in `gameReducer.ts:handleKeyPressed`/`handleTextInput` for the new `'shop'` state.
- Game.tsx: add the `'shop'` state to the input-area visibility check (one-line change).
- Comprehensive scenario test: `shop-flow.test.ts`.
- Manual playtest: full Manor run, buy, sell, save, load, verify stock persists.
- **Gate:** test suite green + manual playtest passes.

### Phase 7 — Polish + cleanup

- Add scenario tests for ending triggers (`ending-triggers.test.ts`) — defeat Evil King → "The Hero" ending; use the dark crown → "The Usurper" ending.
- Run `npm run test:coverage`. Verify ~70% on `engine/`, ~95% on new pure modules.
- Update `README.md` with new commands (`buy`/`sell`/`leave`), the gold display, the dynamic-description feature, the test commands.
- Add `.superpowers/` to `.gitignore`.
- Final manual playtest: full game through to an ending. Dungeon mode. Settings. Save/load. Shop loop in all three regions.
- **Gate:** all of the above. Done.

## Risks and mitigations

- **Refactor breaks subtle behavior in `gameReducer.ts`.** Mitigation: Phase 1 tests run after every Phase 2 step. Anything red gets fixed before continuing. Manual playtest at the Phase 2 boundary.
- **RNG injection in combat changes feel.** Mitigation: production callers default to `Math.random`, identical to current behavior. Manual playtest after the RNG change in Phase 1.
- **Save format migration breaks existing saves.** Mitigation: write a v1 fixture JSON in `test/fixtures/`, load it in `save.test.ts`, assert correct migration.
- **Economy calibration is off and the game feels grindy or trivial.** Mitigation: in-implementation tuning during Phase 5–6 manual playtests. Numbers in this doc are a sketch, not a commitment.
- **Phase 6 dialogue → shop transition has off-by-one bugs.** Mitigation: scenario test that exercises the full talk → choose → enter shop → buy → leave loop.
- **Icons clash with the existing UI in some screens I forgot.** Mitigation: Phase 4 manual playtest specifically looks for "where do glyphs feel wrong" and removes them from those spots.
- **Vitest version drift / Vite 5 compat.** Mitigation: pin vitest to `^2`, not `latest`.

## Open questions

- **Numeric calibration of prices/gold drops.** Sketch in Section 5 above. Final values land during Phase 5 implementation playtests.
- **Exact prose for the 6-8 alternate room descriptions.** I write the first draft in Phase 3; user reviews and can swap any of it.
- **Sir Whiskers as a joke "shop".** Out of scope unless the user wants it added later. The Hidden region stays merchant-free in Phase 6.

## Out of scope (revisit later)

- Stock restock (per-rest, per-floor, per-day)
- Region price modifiers
- Haggling skill / charisma stat
- Multiple currencies
- Shop reputation
- Unique-item rotations
- Per-line icon settings toggle
- Multi-state room descriptions (more than just default + cleared)
- Combat balance changes
- New enemies, weapons, regions, endings
- TypeScript strict mode tightening
- Pure-functional reducer rewrite
