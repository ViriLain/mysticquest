# Warp System & Skill Tree Redesign — Design Spec

**Date:** 2026-04-10

Two features: (1) a `warp` command for fast-travel with HP cost, and (2) a restructured skill tree with arrow-key selection UI.

---

## Feature 1: Warp Command

### Overview

Players can teleport to any previously visited room using `warp <room name>`. The cost is 2 HP per BFS hop. Four hub rooms are free to warp to, acting as fast-travel anchors.

### Warp Hubs (Free)

| Room ID               | Name            | Region   |
| ---------------------- | --------------- | -------- |
| `manor_main_hall`      | Main Hall       | manor    |
| `wilds_central_forest` | Central Forest  | wilds    |
| `darkness_abyss`       | Dark Abyss      | darkness |
| `wastes_path`          | Path            | wastes   |

### Cost Model

- **Distance:** BFS shortest path over the full world graph (all exits including `_dynamic_exits`), counting hops.
- **Cost:** `2 * distance` HP. Warping to a hub costs 0 regardless of distance.
- **Clamp:** HP after warp is `max(1, hp - cost)`. Warp is blocked if the cost would reduce HP below 1 (i.e., `hp - cost < 1`). Exception: cost 0 (hubs) always allowed.
- **Restrictions:** Exploring state only. Not available in combat, dialogue, shop, etc.

### New Module: `src/engine/warp.ts`

```ts
WARP_HUBS: Set<string>
// {'manor_main_hall', 'wilds_central_forest', 'darkness_abyss', 'wastes_path'}

bfsDistance(world: WorldState, fromRoom: string, toRoom: string): number | null
// BFS over all exits (exits + _dynamic_exits). Returns hop count or null if unreachable.

warpCost(distance: number, targetRoom: string): number
// Returns 0 if targetRoom is in WARP_HUBS, otherwise 2 * distance.

getWarpTargets(player: PlayerState, world: WorldState): WarpTarget[]
// interface WarpTarget { roomId: string; name: string; region: string; isHub: boolean; cost: number }
// All visited rooms with precomputed BFS costs from player.currentRoom.
// Sorted by region then name.
```

### New Handler: `src/engine/handlers/warp.ts`

`handleWarp(store, target, deps)`:

**No target** → Print visited rooms grouped by region. Hubs marked `[FREE]`, others show `(Xhp)`. Include a help line: `"Type 'warp <room name>' to teleport."`

**With target** → Fuzzy match room name against visited room names (same pattern as `findSkillByName` — exact match first, then substring). On match:
1. Compute BFS distance and cost.
2. If cost > 0 and `player.hp - cost < 1` → error: "Not enough HP to warp there."
3. Deduct HP, call `deps.enterRoom(roomId)`.
4. Print: "You warp to {room name}." If cost > 0: "The journey costs {cost} HP."

Error cases:
- No match: "Unknown location. Type 'warp' to see available destinations."
- Not visited: Cannot happen — targets are filtered to `visitedRooms`.
- Unreachable (BFS returns null): Should not happen in a connected graph, but handle with a generic error.
- Dungeon mode: "Warp is not available in the dungeon." (dungeon rooms are procedural/ephemeral)

### Handler Dependencies

```ts
interface WarpDeps {
  enterRoom: (roomId: string) => boolean;
  refreshHeader: () => void;
  emit: (sound: string) => void;
}
```

### Integration Points

- `commands.ts`: Add `warp: 'warp'` and `teleport: 'warp'` to `VERB_ALIASES`.
- `state/exploring.ts`: Add `'warp'` to `ALL_VERBS`. Add handler call in `handleExploringCommand`. Add `ExploringDeps.enterRoom` (already available via `goDirection` closure — expose directly or pass through). Add warp targets to `getAutocompleteSuggestions` for `verb === 'warp'`.
- `handlers/help.ts`: Add warp to the help output.
- `gameReducer.ts`: `buildExploringDeps` needs to expose `enterRoom` for the warp handler.

### Save Compatibility

No new player state fields. Uses existing `visitedRooms`. No save migration needed.

### Testing

- `test/unit/warp.test.ts`: BFS distance calculation (adjacent, multi-hop, same room = 0, unreachable). Cost calculation (hub = free, non-hub = 2*distance). `getWarpTargets` returns correct list.
- `test/scenario/warp.test.ts`: Warp to visited room deducts HP. Warp to hub is free. Warp blocked when HP too low. Warp with no target lists rooms. Fuzzy matching works.

---

## Feature 2: Skill Tree Redesign

### Overview

Restructure the 15 existing skills from three linear branches (warrior/rogue/mage) into a single tiered tree. Early tiers are general-purpose, later tiers specialize. Players can learn any skill at a tier as long as they've learned at least one skill from the previous tier.

### Skill Layout

| Tier | Skills |
| ---- | ------ |
| 1 (General) | Iron Will (+5 max HP/level), Sharp Eyes (crit 10%→18%), Herbalism (heal items +50%) |
| 2 (Utility) | Heavy Blows (+2 ATK), Quick Feet (flee 70%→90%), Arcane Shield (-1 all damage) |
| 3 (Mid-spec) | Thick Skin (+2 DEF), Precision (+3 ATK, ignore 2 DEF), Buff Mastery (buffs 5 rounds) |
| 4 (Specialized) | Berserker (+15% dmg at <30% HP), Lucky (15% dodge), Meditation (+2 HP/combat round) |
| 5 (Capstone) | Titan (+15 HP, +1 ATK, +1 DEF), Assassin (3x crit), Enlightened (+50% XP) |

### Prerequisite Rule

- Tier 1: Always available (no prerequisites).
- Tier N (N > 1): Must have learned **at least 1** skill from tier N-1.

This is deliberately loose — players are never locked out of a path, skill point scarcity is the constraint.

### Data Model Changes

**`src/engine/types.ts`:**
- Remove `SkillBranch` type.
- Remove `branch` from `SkillDef`. Keep `id`, `name`, `description`, `tier`.
- Remove `SkillBranch` from `SkillId` (SkillId union is unchanged — same 15 IDs).

**`src/engine/skills.ts`:**
- Remove `getSkillsByBranch`. Add `getSkillsByTier(tier: number): SkillDef[]`.
- `canLearnSkill`: Change from "all lower tiers in same branch" to "at least 1 skill from tier-1 learned" (tier 1 always passes).
- `SKILL_TREE` array: same 15 entries, remove `branch` field, update `tier` values per layout above.

### Combat/Handler Impact

**Zero.** All combat code uses `hasSkill(player, 'skill_id')` — checks by ID, not branch. The `branch` field is only used in `showSkills` (display) and `canLearnSkill` (prerequisites). Both are rewritten.

### Save Compatibility

Player's `skills` record is `Record<string, boolean>` keyed by skill ID. IDs don't change. Existing saves work as-is. No migration needed.

---

## Feature 3: Skill Tree Selection UI

### Overview

The `skills` command opens an interactive selection UI (new game state `skill_tree`) where players navigate with arrow keys and learn skills with Enter.

### New Game State: `skill_tree`

Add `'skill_tree'` to `GameStateKind`.

**New store fields:**
```ts
skillTreeSelected: { tier: number; index: number }; // cursor position (tier 1-5, index 0-2)
skillTreePrevState: GameStateKind;                   // state to return to on Escape
```

Default values in `createInitialStore`: `skillTreeSelected: { tier: 1, index: 0 }`, `skillTreePrevState: 'exploring'`.

### New State Dispatcher: `src/engine/state/skill-tree.ts`

`handleSkillTreeKey(store, key, deps)`:

| Key | Action |
| --- | ------ |
| ArrowUp | Move cursor to previous tier (clamp at tier 1) |
| ArrowDown | Move cursor to next tier (clamp at tier 5) |
| ArrowLeft | Move cursor left within tier (clamp at index 0) |
| ArrowRight | Move cursor right within tier (clamp at index 2) |
| Enter | Attempt to learn selected skill. On success: apply stat effects, decrement skill points, play sound, re-render tree. On failure: show error inline. Stay in `skill_tree` state either way. |
| Escape | Set `store.state = store.skillTreePrevState`. Re-render exploring room. |

### Display Function: `displaySkillTree(store)`

Called on state entry and after each learn action. Clears terminal, renders:

```
=== Skill Tree ===  (Skill Points: 2)

--- Tier 1 ---
 [*] Iron Will        >> Sharp Eyes         [>] Herbalism

--- Tier 2 ---
 [ ] Heavy Blows       [ ] Quick Feet        [ ] Arcane Shield

--- Tier 3 ---
 [ ] Thick Skin        [ ] Precision         [ ] Buff Mastery

--- Tier 4 ---
 [ ] Berserker         [ ] Lucky             [ ] Meditation

--- Tier 5 ---
 [ ] Titan             [ ] Assassin          [ ] Enlightened

> Sharp Eyes — Crit chance 10% → 18%  [AVAILABLE - press Enter to learn]
```

Status markers:
- `[*]` learned (ITEM_COLOR)
- `[>]` available to learn (CHOICE_COLOR)
- `[ ]` locked (HELP_COLOR)
- `>>` prefix on the currently selected skill (replaces the bracket marker)

Bottom detail line shows selected skill's full description and whether it can be learned.

### Learn Logic

Reuse the stat-application logic from `handleLearn` in `handlers/meta.ts`. Extract the stat-application block into a shared function in `skills.ts`:

```ts
applySkillEffects(player: PlayerState, skillId: string): void
// Applies iron_will HP bonus, heavy_blows ATK, thick_skin DEF, titan stats.
// Called by both handleLearn (text command) and handleSkillTreeKey (selection UI).
```

### Integration Points

- `gameReducer.ts`: Route key input to `handleSkillTreeKey` when `state === 'skill_tree'`. Add `buildSkillTreeDeps`. Text input is ignored in this state.
- `state/exploring.ts`: `skills` command sets `store.state = 'skill_tree'`, `store.skillTreePrevState = 'exploring'`, calls `displaySkillTree(store)`.
- `handlers/meta.ts`: `handleLearn` still works in exploring state. Calls `applySkillEffects` instead of inline stat logic.
- `handlers/info.ts`: `showSkills` is no longer called by the `skills` command (replaced by state transition), but stays as a utility if needed elsewhere.
- `types.ts`: Add `'skill_tree'` to `GameStateKind`, add `skillTreeSelected` and `skillTreePrevState` to `GameStore`.

### Snapshot Invariant

`skill_tree` is input-driven only — no tick mutations. Terminal lines and header are already captured in `VisualSnapshot`. No `frame-loop.ts` changes needed.

### Testing

- `test/unit/skills.test.ts`: Update `canLearnSkill` tests for new tier-based prereqs. Test `applySkillEffects` for each stat-modifying skill. Test `getSkillsByTier`.
- `test/unit/skill-tree-state.test.ts`: Arrow key navigation (clamping, wrapping). Enter to learn (success, no points, locked, already learned). Escape returns to previous state.
- `test/scenario/skill-tree.test.ts`: Full flow — open skills, navigate, learn a skill, verify stats changed, escape back to exploring.

---

## Out of Scope

- Visual connections/lines between tiers in the ASCII display (can add later).
- Warp from non-exploring states (shop, dialogue).
- Warp in dungeon mode (rooms are procedural and ephemeral).
- Hidden region hub (no hub for hidden — those rooms are intentionally off the beaten path).
- Skill respec/reset mechanic.
