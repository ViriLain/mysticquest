# AGENTS.md — MysticQuest

Cross-agent project instructions. If your tool also reads CLAUDE.md, that file has deeper architectural detail — this file covers what every agent must know.

## Project

Retro CRT text adventure RPG. Vite 5 + React 18 + TypeScript. No backend — all game content is static JSON, saves live in localStorage, audio is synthesized via Web Audio API.

## Game World

A hero explores a mystical world consumed by a spreading corruption. The meta-narrative reveals this is a digital world — a kid's game under siege by corrupted code.

### Regions (progression order)

1. **Manor** — Abandoned estate. Starting area with puzzles, Shadow Rats, and the Cellar Shade boss guarding the way forward.
2. **Wilds** — Forest, mountains, streams. Forest wolves, spiders, and a Mountain Troll boss at the peak. The Forest Guide (Wren) provides the Ancient Map.
3. **Darkness** — Corrupted nightmare realm of impossible geometry and shadow. Oblivion Guardian guards the dark crown. Evil King waits in his stronghold.
4. **Wastes** — Desert ruins of a lost civilization. The Hermit provides lore. Beneath the mines, the Last Keeper (spectral priest) reveals the crown's curse and grants a protective ward.
5. **Hidden** — Whimsical secret realm accessed via mushroom paths. Sir Whiskers III (talking cat) breaks the fourth wall. Milo the cat is a secret bonus boss.

### Key NPCs

- **Dusty Merchant** (Manor) — Shop, backstory, warnings about the Cellar Shade.
- **Wren** (Wilds) — Shop, hints, grants Ancient Map at high exploration %.
- **Hermit** (Wastes) — Healing, lore about the ruins and mine.
- **The Last Keeper** (Buried Sanctum) — Exposition on the dark crown's origin, grants Keeper's Ward.
- **Sir Whiskers III** (Hidden) — Meta-comedy, hints at the game's digital nature.

### Four Endings

1. **The Hero** — Defeat the Evil King without the crown. Corruption fades.
2. **The Usurper** — Wear the dark crown at the throne. You become the new corruption.
3. **The Wanderer** — Explore 80%+ of the world, find the secret exit in the ruins. Escape to uncorrupted space.
4. **The Enlightened** — Collect all four colored mushrooms, use them in the Shroomy Diner. "It was always just a kid's game."

### Combat

Turn-based with attack/defend/flee/use-item. Weapon classes (blade/heavy/pierce) grant combat passives. Status effects: poison, burn, bleed (escalating), stun. Bosses use special attacks every 3 rounds. 15-node skill tree with 5 tiers.

### Dungeon Mode

Separate roguelike mode with procedurally generated floors (seeded RNG). Scaled enemies, boss loot weapons, and a score tracker. Independent from the story campaign.

## Build / Test / Lint

```bash
npm run dev          # Vite dev server
npm run build        # tsc -b && vite build
npm test             # vitest run (unit + scenario, <3s)
npm run lint         # eslint (< 2s)
```

Run `npm test` and `npm run lint` after every change. Fix what they flag before moving on.

## Architecture Rules

1. **Engine has no React imports.** `src/engine/` is pure game logic. `src/components/Game.tsx` is the only bridge to React. If you want to import from `react` inside `src/engine/`, stop — the state change belongs on the store.

2. **Handler / state modules are pure.** They receive a `Deps` object with store-bound callbacks instead of importing from `gameReducer.ts`. Do not collapse this indirection — it's what makes handlers testable in isolation.

3. **JSON types live in `src/engine/types.ts`.** When changing any JSON shape in `src/data/`, update the corresponding TypeScript interface. There is no runtime schema validation.

4. **Snapshot invariant.** Every piece of store state that mutates during a reducer tick AND affects what the user sees MUST appear in `VisualSnapshot` (`frame-loop.ts`). If you add tick-driven visual state, update the snapshot interface, capture function, diff function, AND the guard test in `test/unit/frame-loop.test.ts`.

5. **Saves have a format version.** `save.ts` handles migration. Don't break forward/backward compat silently. `weapon_class` and other static data lives on definition types (e.g., `WeaponDef`), not on `PlayerState` — the player stores IDs and looks up definitions at runtime.

## Key Constraints

- **Vite 5 + Vitest 2 are pinned.** Do not bump without a dedicated PR.
- **React 18.3.1.** Not 19.
- **Strict TypeScript.** `no-explicit-any` is on. Use `unknown` + narrowing if you need escape hatches.
- **`gameReducer.ts` stays as the orchestrator.** It owns `enterRoom`, `startCombat`, `startDialogue`, `startEnding`, and the `build*Deps` wiring. Don't try to extract these further.

## Testing

- `test/unit/` — one file per engine module, fast and deterministic.
- `test/scenario/` — end-to-end flows driving the real reducer with text commands.
- `test/fixtures/` — `freshStore()`, `mock-input`, `assert-output` helpers.
- `combat.ts` accepts an injected RNG for deterministic combat tests. Use it instead of mocking `Math.random`.

When adding a new engine module, add a matching unit test. When adding a new player-facing command, add a scenario test.

## Common Pitfalls

- Don't hardcode merchant names in shop handlers — they're shared across all shops.
- Don't put action logic in `handlers/info.ts` — that file is display-only.
- Don't disable or weaken the snapshot guard test in `frame-loop.test.ts`.
- Achievements are global across all saves. That's intentional.
- `addLine` queues through the typewriter effect. Use `addLineInstant` for UI that renders immediately (e.g., skill tree, menus).
