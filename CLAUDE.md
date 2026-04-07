# CLAUDE.md — MysticQuest Engineering Notes

Project-specific guidance for working on this codebase. General engineering principles live in `~/.claude/CLAUDE.md`.

## What this is

A retro CRT-aesthetic text adventure RPG. Vite + React 18 + TypeScript. Zero backend, zero audio files — sounds are synthesized via Web Audio API, saves/settings/achievements live in `localStorage`, all game content is static JSON.

The engine is deliberately isolated from React: `src/engine/**` is pure game logic and has no React imports. `src/components/Game.tsx` is the only place that drives the reducer and renders the terminal.

## Tech stack constraints

- **Vite 5 + Vitest 2** are pinned intentionally. Do NOT bump to Vite 6 / Vitest 3 without a dedicated PR — the engine-foundation plan pinned these on purpose.
- **React 18.3.1** stable — not 19. Zero runtime vulns.
- `npm audit` currently reports 6 moderate CVEs in the Vite 5 dev-server chain (esbuild CORS, vite path traversal). Both are dev-server only and require explicit network exposure, which we do not configure. Safe to ignore for now; track for a future dependency-hygiene PR.

## Architecture

### The engine (`src/engine/`)

Pure state machine. The store (`GameStore` in `types.ts`) is the single source of truth. Everything the player sees is derived from it.

```
gameReducer.ts          Public API: createInitialStore, gameReducer, GameAction
                        Orchestrates tick/key/text routing, owns enterRoom,
                        startCombat, startDialogue, startEnding (these entangle
                        across multiple handlers so they stay here).
                        Also owns the build*Deps wiring that injects store-bound
                        callbacks into pure handler/state modules.

handlers/               One file per player command. Pure functions that take
                        (store, target, deps) and mutate the store.
  look, help, drop, use, take, attack, search, examine, talk, shop
  info.ts               Display functions: showSkills, showAchievements,
                        showInventory, showStats, showJournal, showScore.
                        This is the DISPLAY layer — do not put action logic here.
  meta.ts               Action handlers only (currently just handleLearn).
                        Re-exports display functions from info.ts for
                        backward compatibility.

state/                  One file per GameStateKind dispatcher. Handles input
                        routing while the game is in that state.
  menu, settings, gameover, slot-picker, exploring, combat, dialogue, shop
  lifecycle.ts          Game initialization: startMenu, startNewGame,
                        startContinue, startDungeonMode, loadDungeonFloor.

world.ts                Room graph, regions, dynamic exits. createStoryWorld()
                        loads all 5 region JSON files.
player.ts               Player stats, inventory, leveling, visited rooms.
combat.ts               Pure turn-based combat with optional injected RNG
                        for deterministic tests.
save.ts                 Multi-slot localStorage persistence. v1→v2 format
                        migration (v2 added gold).
economy.ts              Shop stock management.
achievements.ts         Global achievement tracking across saves.
                        checkAchievement(store, id) is the store-aware wrapper;
                        checkItemAchievements(store) checks fully_loaded/collector.
endings.ts              4 ending trigger types (boss, item, choice, exploration).
events.ts               Room on_enter event triggers.
effects.ts              Visual effects state (shake, flash, glitch, tint).
display.ts              Room rendering (name, description, exits, contents).
output.ts               Terminal write helpers: addLine, addLineInstant,
                        clearTerminal, updateHeader, applyRegionTint,
                        displayAscii, emitSound.
commands.ts             Command parser with aliases (go/n/north, i/inventory, etc).
matching.ts             Fuzzy target matching for items/weapons/enemies/npcs.
icons.ts                ASCII icon constants + iconLine() helper for
                        item/weapon/enemy prefixes.
descriptions.ts         Dynamic room description resolution (description_cleared
                        fields — rooms show alternate text after challenges).
skills.ts               14-node skill tree (Warrior/Rogue/Mage branches).
dungeon.ts              Procedural floor generator, seeded RNG.
rng.ts                  Mulberry32 PRNG.
minimap.ts              BFS-based room layout computation for the minimap overlay.
frame-loop.ts           Visual snapshot diffing (see "Rendering perf" below).
audio.ts                Web Audio API sound effects + region ambient drones.
settings.ts             Persistent settings (font, color mode, text speed, volume).
asciiArt.ts             ASCII art loader for title/boss/death screens.
constants.ts            Colors, boot text, menu options, ASCII art keys.
types.ts                All TypeScript interfaces.
```

### Handler / state module pattern

Handler and state modules are **pure** — they take a `Deps` object containing store-bound callbacks rather than importing from `gameReducer.ts`. This is why `gameReducer.ts` has `buildCombatDeps`, `buildExploringDeps`, `buildShopDeps`, `buildDialogueDeps` — they inject `startCombat`, `enterRoom`, `checkAchievement`, etc. into the otherwise-pure handler modules.

Do not collapse this indirection. It is what keeps handlers testable in isolation and allows `enterRoom`/`startCombat`/`startDialogue`/`startEnding` to live in one place (they're called from handlers, state dispatchers, AND initialization — extracting them further breaks the boundary).

`gameReducer.ts` sits at ~750 lines after the engine-foundation extraction. The original plan targeted ~250, but further extraction isn't clean — documented in `docs/superpowers/specs/2026-04-06-engine-foundation-design.md`.

### Rendering perf — the snapshot invariant

`frame-loop.ts` exports `captureVisualSnapshot`, `didVisualSnapshotChange`, and `shouldRunReducerTick`. `Game.tsx` uses these to gate React re-renders so ticks only trigger renders when something visually changed.

**CRITICAL INVARIANT**: every piece of store state that can mutate inside a reducer TICK AND affects what the user sees MUST appear in `VisualSnapshot`. If you add new tick-driven state (e.g., a new animated field or header value), you MUST:

1. Add it to the `VisualSnapshot` interface in `frame-loop.ts`
2. Capture it in `captureVisualSnapshot`
3. Compare it in `didVisualSnapshotChange`
4. Add a test case for it in `test/unit/frame-loop.test.ts`

The guard test in `frame-loop.test.ts` enumerates every field and fails if any mutation doesn't cause the snapshot to differ. Don't disable or weaken that test — its whole job is to catch "UI goes stale because I forgot to snapshot this" bugs before they land.

### Game data (`src/data/`)

All content is JSON. There is no content DSL, no schema validation — types in `src/engine/types.ts` are the contract. When changing JSON shape, update the corresponding TS type.

```
regions/*.json   Room definitions by region (manor, wilds, darkness, wastes, hidden).
                 Rooms have description/description_cleared, exits, items,
                 weapons, enemies, search_items, npcs, on_enter events.
enemies.json     16 enemies (6 bosses) with hp/atk/def/xp/gold/loot.
weapons.json     20 weapons with match_words for fuzzy targeting.
items.json       Consumables, shields, key items.
npcs.json        4 NPCs with dialogue trees.
shops.json       3 merchant shops (dusty/wren/hermit) with finite stock.
endings.json     4 ending definitions.
```

### UI (`src/components/`, `src/App.tsx`)

- `Game.tsx` runs the animation loop, dispatches keyboard/text input to the reducer, renders the CRT terminal, and handles the typewriter effect at the component layer (NOT inside the reducer — the reducer only queues lines).
- `Minimap.tsx` is a canvas overlay.
- All CRT post-processing (scanlines, vignette, chromatic aberration, flicker) is pure CSS in `src/styles/`.

## Scripts

```bash
npm run dev            # Vite dev server → http://localhost:5173/
npm run build          # tsc -b && vite build
npm run preview        # serve the built bundle
npm test               # vitest run (unit + scenario)
npm run test:watch     # vitest watch mode
npm run test:coverage  # coverage report (coverage/ is gitignored)
npm run lint           # eslint .
```

Always run `npm run lint` and `npm test` after changes. Both are fast (<2s lint, <3s tests). The test count as of the engine-foundation PR is 125 passing.

## Testing

Tests live in `test/`:

- `test/unit/` — pure module tests. One file per engine module. These are fast and deterministic.
- `test/scenario/` — end-to-end flows that drive the real reducer with text commands. Use these when you need to verify multi-step player interactions (combat, shopping, save/load round-trips).
- `test/fixtures/` — shared helpers:
  - `freshStore()` — creates a fresh `GameStore` ready for dispatch
  - `mock-input` — helpers for dispatching keys/text
  - `assert-output` — `expectLine` / `expectNoLine` (the "no line" variant takes a message for better failure output); `flushTypewriter()` returns `void` intentionally
- `combat.ts` accepts an optional injected RNG so combat tests are deterministic. Use it instead of mocking `Math.random`.

When adding a new engine module, add a matching unit test file. When adding a new player-facing command or flow, add a scenario test.

## Lint/type conventions

- `eslint.config.js` ignores `dist` and `coverage`.
- `no-explicit-any` is on. If you need a DOM-interface escape hatch (the Storage mock in `test/setup.ts` is the canonical example), use `unknown` cast first then narrow, and add a scoped `eslint-disable-next-line` with a comment if the interface itself demands `any`.
- Strict TS. The `tsc -b` in the build script will catch drift.

## Gotchas

- **Don't hardcode merchant names in shop.ts error messages.** The handler is shared across Dusty/Wren/Hermit. Use neutral prose like "Not in stock" and "They won't take that".
- **Don't put action logic in `handlers/info.ts`.** That file is display-only. Action handlers go in `handlers/meta.ts` or a dedicated handler file.
- **Don't re-enable deleted boot/ending extraction.** `updateBoot` and `updateEnding` live inside `gameReducer.ts::handleTick` deliberately — they're small, tick-coupled, and extracting them adds indirection without benefit.
- **Don't touch the snapshot diff without updating the guard test.** See "Rendering perf" above.
- **Saves have a format version.** v1 saves don't have `gold` — `save.ts` migrates them on load. Don't break forward/backward compat silently.
- **Achievements are global.** They persist across all saves and across new-game resets. That's intentional.
- **The engine has no React imports.** Keep it that way. If you find yourself wanting to `import` from `react` inside `src/engine/`, stop and rethink — the state change belongs on the store, and `Game.tsx` should react to it.

## Recent history (reference only — check `git log` for current state)

- **engine-foundation branch**: 8-phase refactor (test infra, reducer modularization, dynamic descriptions, icons, gold economy, polish) + runtime perf pass (snapshot diffing). Landed as PR #1 against main.
- The reducer used to be one ~2000-line file. It's now split across `handlers/`, `state/`, and module-specific files. `gameReducer.ts` is the orchestrator.

## Spec & plan documents

- `docs/superpowers/specs/2026-04-06-engine-foundation-design.md` — architecture design, including the documented tradeoff for why `gameReducer.ts` stays at ~750 lines instead of the original ~250 target
- `docs/superpowers/plans/2026-04-06-engine-foundation.md` — the 8-phase implementation plan
