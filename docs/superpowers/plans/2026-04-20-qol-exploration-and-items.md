# QoL Exploration and Items Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved QoL exploration and item polish pass.

**Architecture:** Follow existing pure-engine handler/state patterns. Add focused helpers for repeated search reveal and weapon display behavior, extend data/types for NPC ask answers, and keep `gameReducer.ts` as the orchestrator for ending continuation.

**Tech Stack:** Vite 5, React 18, TypeScript, Vitest.

---

## File Map

- Modify `src/engine/constants.ts`: add `MAGIC_COLOR`.
- Modify `src/engine/types.ts`: add NPC ask answer fields.
- Modify `src/data/npcs.json`: add ask-topic answers and fallbacks.
- Create `src/engine/handlers/ask.ts`: route `ask` commands to nearby NPC item/topic answers.
- Modify `src/engine/state/exploring.ts`: route/autocomplete `ask` and `weapons`.
- Modify `src/engine/commands.ts`: register `ask` and `weapons`, plus useful aliases.
- Modify `src/engine/handlers/search.ts`: extract shared room reveal helper and magic weapon colors.
- Modify `src/engine/handlers/look.ts`: call shared reveal helper after current-room look.
- Modify `src/engine/handlers/info.ts`: sorted/class-tagged weapon rendering and focused `showWeapons`.
- Modify `src/engine/handlers/examine.ts`: magic color for magic weapon output.
- Modify `src/engine/handlers/take.ts`: magic color for magic weapon pickup/equip output.
- Modify `src/engine/combat.ts`: use `MAGIC_COLOR` for forced magic proc message if appropriate.
- Modify `src/data/regions/hidden.json`: Shroomy Forest `up` exit.
- Modify `src/engine/gameReducer.ts`: continue exploring after endings.
- Add/modify tests under `test/unit/` and `test/scenario/`.

## Task 1: Add Magic Color and Weapon Display Helpers

**Files:**
- Modify: `src/engine/constants.ts`
- Modify: `src/engine/handlers/info.ts`
- Modify: `src/engine/handlers/examine.ts`
- Modify: `src/engine/handlers/take.ts`
- Test: `test/unit/info.test.ts`
- Test: `test/unit/action-handlers.test.ts`

- [ ] **Step 1: Write failing tests for weapon listing and magic color**
  - Inventory lists equipped weapon first.
  - Other weapons sort by attack descending.
  - Magic weapons use `MAGIC_COLOR`.
  - `examine` uses `MAGIC_COLOR` for magic weapon lines.

- [ ] **Step 2: Run tests to verify failures**
  - `npm test -- test/unit/info.test.ts test/unit/action-handlers.test.ts`

- [ ] **Step 3: Implement color constant and shared weapon rendering**
  - Add `MAGIC_COLOR`.
  - Add class tag helper or reuse existing class-tag formatting.
  - Sort non-equipped weapons by attack descending.
  - Add `showWeapons`.

- [ ] **Step 4: Run focused tests**
  - `npm test -- test/unit/info.test.ts test/unit/action-handlers.test.ts`

## Task 2: Shared Search Reveal and Auto-Look

**Files:**
- Modify: `src/engine/handlers/search.ts`
- Modify: `src/engine/handlers/look.ts`
- Test: `test/unit/handlers.test.ts`
- Test: `test/scenario/dynamic-descriptions.test.ts`

- [ ] **Step 1: Write failing tests**
  - `look` auto-reveals searchable room loot.
  - `look <direction>` does not search.
  - Explicit `search` reports already searched after auto-search.

- [ ] **Step 2: Run tests to verify failures**
  - `npm test -- test/unit/handlers.test.ts test/scenario/dynamic-descriptions.test.ts`

- [ ] **Step 3: Extract reveal helper and wire `look`**
  - `revealSearchables(store, itemData, weaponData, opts)`.
  - Keep existing search messages.
  - Use `MAGIC_COLOR` for magic weapon find messages.

- [ ] **Step 4: Run focused tests**
  - `npm test -- test/unit/handlers.test.ts test/scenario/dynamic-descriptions.test.ts`

## Task 3: NPC Ask Command

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/data/npcs.json`
- Create: `src/engine/handlers/ask.ts`
- Modify: `src/engine/state/exploring.ts`
- Modify: `src/engine/commands.ts`
- Test: `test/unit/talk.test.ts` or new `test/unit/ask.test.ts`
- Test: `test/scenario/ask-flow.test.ts`

- [ ] **Step 1: Write failing tests**
  - `ask about ancient map` works with one NPC.
  - `ask wren about ancient map` works with explicit NPC.
  - Unknown topic prints fallback.
  - No NPC present prints error.

- [ ] **Step 2: Run tests to verify failures**
  - `npm test -- test/unit/ask.test.ts test/scenario/ask-flow.test.ts`

- [ ] **Step 3: Add types, data, handler, routing, autocomplete**
  - Topic matching uses ids, names, and match words.
  - Nearby NPC only.
  - No hardcoded merchant/NPC names in handler.

- [ ] **Step 4: Run focused tests**
  - `npm test -- test/unit/ask.test.ts test/scenario/ask-flow.test.ts`

## Task 4: Weapons Command and Command Aliases

**Files:**
- Modify: `src/engine/state/exploring.ts`
- Modify: `src/engine/commands.ts`
- Modify: `src/engine/handlers/help.ts`
- Test: `test/unit/exploring-state.test.ts`
- Test: `test/unit/info.test.ts`

- [ ] **Step 1: Write failing tests**
  - `weapons` prints focused weapon list.
  - Parser recognizes `weapons`.

- [ ] **Step 2: Run tests to verify failures**
  - `npm test -- test/unit/exploring-state.test.ts test/unit/info.test.ts`

- [ ] **Step 3: Route command and update help/autocomplete**

- [ ] **Step 4: Run focused tests**
  - `npm test -- test/unit/exploring-state.test.ts test/unit/info.test.ts`

## Task 5: Hidden Exit Direction Fix

**Files:**
- Modify: `src/data/regions/hidden.json`
- Test: `test/unit/world.test.ts`

- [ ] **Step 1: Write failing world/data test**
  - Shroomy Forest has `up` exit to Wilds Clearing.
  - Shroomy Forest does not have `north` exit to Wilds Clearing.

- [ ] **Step 2: Run test to verify failure**
  - `npm test -- test/unit/world.test.ts`

- [ ] **Step 3: Update JSON exit**

- [ ] **Step 4: Run focused test**
  - `npm test -- test/unit/world.test.ts`

## Task 6: Continue After Ending

**Files:**
- Modify: `src/engine/gameReducer.ts`
- Test: `test/unit/dialogue-state.test.ts` or new scenario coverage
- Test: `test/scenario/ending-triggers.test.ts`

- [ ] **Step 1: Write failing ending continuation test**
  - After ending all lines are typed, next key resumes `exploring`.
  - Room display/header are restored.

- [ ] **Step 2: Run test to verify failure**
  - `npm test -- test/scenario/ending-triggers.test.ts`

- [ ] **Step 3: Update ending prompt and key behavior**
  - Replace menu return with exploring resume.
  - Clear ending data.
  - Restore base color/header.
  - Display current room.

- [ ] **Step 4: Run focused test**
  - `npm test -- test/scenario/ending-triggers.test.ts`

## Task 7: Final Verification

- [ ] **Step 1: Run full tests**
  - `npm test`

- [ ] **Step 2: Run lint**
  - `npm run lint`

- [ ] **Step 3: Run build**
  - `npm run build`

- [ ] **Step 4: Smoke test dev server**
  - `npm run dev`
  - Verify `look`, `ask`, `weapons`, Shroomy `up`, magic colors, and post-ending continuation.

- [ ] **Step 5: Commit implementation**
  - `git add ...`
  - `git commit -m "Add exploration and item QoL polish"`
