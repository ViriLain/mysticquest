# Warp System & Skill Tree Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add distance-based fast-travel (`warp`) and restructure the skill system from three linear branches into a single tiered tree with an arrow-key selection UI.

**Architecture:** Two independent features. Feature 1 adds a new engine module (`warp.ts`), a new handler (`handlers/warp.ts`), and integrates into the exploring state. Feature 2 restructures the existing skill data/logic, adds a new `skill_tree` game state with a state dispatcher, and extracts shared skill-application logic. Both features touch `gameReducer.ts` for integration, `types.ts` for type changes, and `commands.ts` for aliases.

**Tech Stack:** TypeScript, Vitest, pure engine logic (no React imports in `src/engine/`).

**Run after each task:** `npm run lint && npm test`

---

## File Map

### Feature 1: Warp

| Action | File | Responsibility |
| ------ | ---- | -------------- |
| Create | `src/engine/warp.ts` | BFS distance, hub definitions, cost calculation, warp target list |
| Create | `src/engine/handlers/warp.ts` | `handleWarp` — command handler for warp verb |
| Create | `test/unit/warp.test.ts` | Unit tests for warp module |
| Create | `test/scenario/warp-flow.test.ts` | Scenario tests for full warp flows |
| Modify | `src/engine/commands.ts` | Add `warp`/`teleport` aliases |
| Modify | `src/engine/state/exploring.ts` | Add warp verb, handler dispatch, autocomplete |
| Modify | `src/engine/gameReducer.ts` | Add `enterRoom` to `ExploringDeps`, wire warp handler |
| Modify | `src/engine/handlers/help.ts` | Add warp to help text |

### Feature 2: Skill Tree Redesign + Selection UI

| Action | File | Responsibility |
| ------ | ---- | -------------- |
| Modify | `src/engine/types.ts` | Remove `SkillBranch`, add `skill_tree` to `GameStateKind`, add store fields |
| Modify | `src/engine/skills.ts` | Restructure tiers, remove branches, new prereq logic, `applySkillEffects` |
| Create | `src/engine/state/skill-tree.ts` | State dispatcher for skill_tree: arrow nav, enter to learn, escape |
| Modify | `src/engine/handlers/meta.ts` | Use `applySkillEffects` instead of inline stat logic |
| Modify | `src/engine/handlers/info.ts` | Update `showSkills` for tier-based display (utility fallback) |
| Modify | `src/engine/state/exploring.ts` | `skills` command transitions to `skill_tree` state |
| Modify | `src/engine/gameReducer.ts` | Route `skill_tree` key input, add to `createInitialStore`, build deps |
| Create | `test/unit/skills.test.ts` | Tests for restructured skills module |
| Create | `test/unit/skill-tree-state.test.ts` | Tests for skill tree state dispatcher |
| Modify | `test/unit/meta.test.ts` | Update for `applySkillEffects` extraction |

---

## Task 1: Warp Module — BFS and Cost Logic

**Files:**
- Create: `src/engine/warp.ts`
- Create: `test/unit/warp.test.ts`

- [ ] **Step 1: Write failing tests for BFS distance and cost**

In `test/unit/warp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bfsDistance, warpCost, WARP_HUBS, getWarpTargets } from '../../src/engine/warp';
import { createWorld, loadRegion } from '../../src/engine/world';
import { createPlayer } from '../../src/engine/player';
import manorJson from '../../src/data/regions/manor.json';
import wildsJson from '../../src/data/regions/wilds.json';
import type { RegionData } from '../../src/engine/types';

function makeWorld() {
  const world = createWorld();
  loadRegion(world, manorJson as RegionData);
  loadRegion(world, wildsJson as RegionData);
  return world;
}

describe('warp module', () => {
  describe('bfsDistance', () => {
    it('returns 0 for same room', () => {
      const world = makeWorld();
      expect(bfsDistance(world, 'manor_entry', 'manor_entry')).toBe(0);
    });

    it('returns 1 for adjacent rooms', () => {
      const world = makeWorld();
      // manor_entry -> manor_entrance_hall is one hop (north)
      expect(bfsDistance(world, 'manor_entry', 'manor_entrance_hall')).toBe(1);
    });

    it('returns correct multi-hop distance', () => {
      const world = makeWorld();
      // manor_entry -> manor_entrance_hall -> manor_main_hall = 2 hops
      expect(bfsDistance(world, 'manor_entry', 'manor_main_hall')).toBe(2);
    });

    it('returns null for unreachable room', () => {
      const world = createWorld();
      loadRegion(world, manorJson as RegionData);
      // wilds not loaded, so wilds rooms don't exist
      expect(bfsDistance(world, 'manor_entry', 'wilds_forest_entrance')).toBeNull();
    });
  });

  describe('warpCost', () => {
    it('returns 0 for hub rooms', () => {
      for (const hub of WARP_HUBS) {
        expect(warpCost(5, hub)).toBe(0);
      }
    });

    it('returns 2 * distance for non-hub rooms', () => {
      expect(warpCost(3, 'manor_entry')).toBe(6);
      expect(warpCost(1, 'manor_library')).toBe(2);
    });
  });

  describe('getWarpTargets', () => {
    it('returns visited rooms with costs sorted by region then name', () => {
      const world = makeWorld();
      const player = createPlayer();
      player.visitedRooms['manor_entry'] = true;
      player.visitedRooms['manor_main_hall'] = true;

      const targets = getWarpTargets(player, world);
      expect(targets.length).toBe(2);
      // Both are manor region — sorted by name
      expect(targets[0].roomId).toBe('manor_entry');
      expect(targets[1].roomId).toBe('manor_main_hall');
      expect(targets[1].isHub).toBe(true);
      expect(targets[1].cost).toBe(0); // hub is free
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/unit/warp.test.ts`
Expected: FAIL — module `../../src/engine/warp` does not exist.

- [ ] **Step 3: Implement the warp module**

Create `src/engine/warp.ts`:

```ts
import type { PlayerState, WorldState } from './types';
import { getRoom } from './world';

export const WARP_HUBS = new Set([
  'manor_main_hall',
  'wilds_central_forest',
  'darkness_abyss',
  'wastes_path',
]);

export interface WarpTarget {
  roomId: string;
  name: string;
  region: string;
  isHub: boolean;
  cost: number;
}

/**
 * BFS shortest-path distance between two rooms over all exits (including dynamic).
 * Returns hop count, or null if unreachable.
 */
export function bfsDistance(world: WorldState, fromRoom: string, toRoom: string): number | null {
  if (fromRoom === toRoom) return 0;
  if (!world.rooms[fromRoom] || !world.rooms[toRoom]) return null;

  const visited = new Set<string>([fromRoom]);
  const queue: Array<[string, number]> = [[fromRoom, 0]];

  while (queue.length > 0) {
    const [roomId, dist] = queue.shift()!;
    const room = world.rooms[roomId];
    if (!room) continue;

    const exits = { ...room.exits, ...room._dynamic_exits };
    for (const targetId of Object.values(exits)) {
      if (targetId === toRoom) return dist + 1;
      if (!visited.has(targetId) && world.rooms[targetId]) {
        visited.add(targetId);
        queue.push([targetId, dist + 1]);
      }
    }
  }

  return null;
}

export function warpCost(distance: number, targetRoom: string): number {
  if (WARP_HUBS.has(targetRoom)) return 0;
  return 2 * distance;
}

export function getWarpTargets(player: PlayerState, world: WorldState): WarpTarget[] {
  const targets: WarpTarget[] = [];

  for (const roomId of Object.keys(player.visitedRooms)) {
    const room = getRoom(world, roomId);
    if (!room) continue;

    const distance = bfsDistance(world, player.currentRoom, roomId);
    const cost = distance !== null ? warpCost(distance, roomId) : -1;

    targets.push({
      roomId,
      name: room.name,
      region: room.region,
      isHub: WARP_HUBS.has(roomId),
      cost,
    });
  }

  targets.sort((a, b) => {
    if (a.region !== b.region) return a.region.localeCompare(b.region);
    return a.name.localeCompare(b.name);
  });

  return targets;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/unit/warp.test.ts`
Expected: All PASS.

- [ ] **Step 5: Run full lint and test suite**

Run: `npm run lint && npm test`
Expected: All passing, no new warnings.

- [ ] **Step 6: Commit**

```bash
git add src/engine/warp.ts test/unit/warp.test.ts
git commit -m "Add warp module with BFS distance, hub definitions, and cost logic"
```

---

## Task 2: Warp Handler

**Files:**
- Create: `src/engine/handlers/warp.ts`
- Modify: `src/engine/commands.ts`
- Modify: `src/engine/handlers/help.ts`

- [ ] **Step 1: Create the warp handler**

Create `src/engine/handlers/warp.ts`:

```ts
import * as C from '../constants';
import { addLine } from '../output';
import { bfsDistance, getWarpTargets, warpCost } from '../warp';
import type { GameStore, WorldState } from '../types';

export interface WarpDeps {
  enterRoom: (roomId: string) => boolean;
  refreshHeader: () => void;
  emit: (sound: string) => void;
}

/**
 * Fuzzy-match a room name against visited rooms.
 * Exact match first, then substring.
 */
function findWarpTarget(
  world: WorldState,
  visitedRooms: Record<string, boolean>,
  name: string,
): { roomId: string; roomName: string } | null {
  const lower = name.toLowerCase();
  const entries: Array<{ roomId: string; roomName: string }> = [];
  for (const roomId of Object.keys(visitedRooms)) {
    const room = world.rooms[roomId];
    if (room) entries.push({ roomId, roomName: room.name });
  }

  // Exact match
  const exact = entries.find(e => e.roomName.toLowerCase() === lower);
  if (exact) return exact;

  // Substring match
  const partial = entries.filter(e => e.roomName.toLowerCase().includes(lower));
  if (partial.length === 1) return partial[0];

  return null;
}

export function handleWarp(
  store: GameStore,
  target: string,
  deps: WarpDeps,
): void {
  if (!store.player || !store.world) return;

  if (store.gameMode === 'dungeon') {
    addLine(store, 'Warp is not available in the dungeon.', C.ERROR_COLOR);
    return;
  }

  // No target — list available destinations
  if (!target) {
    const targets = getWarpTargets(store.player, store.world);
    if (targets.length === 0) {
      addLine(store, 'No visited locations to warp to.', C.ERROR_COLOR);
      return;
    }

    addLine(store, '');
    addLine(store, '=== Warp Destinations ===', C.STAT_COLOR);

    let currentRegion = '';
    for (const t of targets) {
      if (t.region !== currentRegion) {
        currentRegion = t.region;
        addLine(store, '');
        addLine(store, `--- ${currentRegion.charAt(0).toUpperCase() + currentRegion.slice(1)} ---`, C.COMBAT_COLOR);
      }
      if (t.roomId === store.player.currentRoom) {
        addLine(store, `  ${t.name} (you are here)`, C.HELP_COLOR);
      } else if (t.isHub) {
        addLine(store, `  ${t.name} [FREE]`, C.ITEM_COLOR);
      } else if (t.cost >= 0) {
        addLine(store, `  ${t.name} (${t.cost}hp)`, C.CHOICE_COLOR);
      } else {
        addLine(store, `  ${t.name} (unreachable)`, C.HELP_COLOR);
      }
    }

    addLine(store, '');
    addLine(store, "Type 'warp <room name>' to teleport.", C.HELP_COLOR);
    return;
  }

  // Find the target room
  const match = findWarpTarget(store.world, store.player.visitedRooms, target);
  if (!match) {
    addLine(store, "Unknown location. Type 'warp' to see available destinations.", C.ERROR_COLOR);
    return;
  }

  // Can't warp to current room
  if (match.roomId === store.player.currentRoom) {
    addLine(store, 'You are already here.', C.ERROR_COLOR);
    return;
  }

  // Calculate cost
  const distance = bfsDistance(store.world, store.player.currentRoom, match.roomId);
  if (distance === null) {
    addLine(store, 'That location is unreachable.', C.ERROR_COLOR);
    return;
  }

  const cost = warpCost(distance, match.roomId);

  // Check HP
  if (cost > 0 && store.player.hp - cost < 1) {
    addLine(store, `Not enough HP to warp there. (Cost: ${cost}hp, HP: ${store.player.hp})`, C.ERROR_COLOR);
    return;
  }

  // Deduct HP
  if (cost > 0) {
    store.player.hp -= cost;
  }

  // Teleport
  addLine(store, '');
  deps.enterRoom(match.roomId);
  if (cost > 0) {
    addLine(store, `The journey costs ${cost} HP. (${store.player.hp}/${store.player.maxHp})`, C.CHOICE_COLOR);
  }
  deps.emit('warp');
  deps.refreshHeader();
}
```

- [ ] **Step 2: Add warp/teleport aliases to commands.ts**

In `src/engine/commands.ts`, add to `VERB_ALIASES`:

```ts
  teleport: 'warp',
```

- [ ] **Step 3: Add warp to help text**

In `src/engine/handlers/help.ts`, add a line after the `go` / `look` / `search` movement block:

```ts
  addLine(store, "  warp <place>    - Teleport to a visited location", C.HELP_COLOR);
```

- [ ] **Step 4: Run lint and tests**

Run: `npm run lint && npm test`
Expected: All passing. The handler isn't wired into exploring yet so no integration tests yet.

- [ ] **Step 5: Commit**

```bash
git add src/engine/handlers/warp.ts src/engine/commands.ts src/engine/handlers/help.ts
git commit -m "Add warp handler with fuzzy matching, HP cost, and help text"
```

---

## Task 3: Wire Warp into Exploring State + Autocomplete

**Files:**
- Modify: `src/engine/state/exploring.ts`
- Modify: `src/engine/gameReducer.ts`
- Create: `test/scenario/warp-flow.test.ts`

- [ ] **Step 1: Add `enterRoom` and `doWarp` to ExploringDeps and wire handler**

In `src/engine/state/exploring.ts`:

Add import at top:
```ts
import { handleWarp, type WarpDeps } from '../handlers/warp';
```

Add to `ExploringDeps` interface:
```ts
  enterRoom: (roomId: string) => boolean;
```

Add `'warp'` to `ALL_VERBS` array.

Add handler case in `handleExploringCommand` (before the `else` catch-all):
```ts
  } else if (verb === 'warp') {
    handleWarp(store, target, {
      enterRoom: deps.enterRoom,
      refreshHeader: deps.refreshHeader,
      emit: deps.emit,
    });
```

Add warp targets to `getAutocompleteSuggestions` — add a new `else if` block:
```ts
  } else if (verb === 'warp') {
    if (store.world) {
      for (const roomId of Object.keys(store.player.visitedRooms)) {
        const room = store.world.rooms[roomId];
        if (room) candidates.push(room.name);
      }
    }
```

- [ ] **Step 2: Add `enterRoom` to `buildExploringDeps` in gameReducer.ts**

In `src/engine/gameReducer.ts`, inside `buildExploringDeps`, add:
```ts
    enterRoom: roomId => enterRoom(store, roomId),
```

- [ ] **Step 3: Update the unit test mock deps**

In `test/unit/exploring-state.test.ts`, add `enterRoom: () => true` to the `makeDeps` function.

- [ ] **Step 4: Write scenario tests for warp**

Create `test/scenario/warp-flow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newGame, input } from '../fixtures/mock-input';
import { expectLine, expectNoLine } from '../fixtures/assert-output';

describe('warp flow', () => {
  it('lists visited rooms when warp has no target', () => {
    let s = newGame();
    // Player starts at manor_entry, which is the only visited room
    s = input(s, 'warp');
    expectLine(s, 'Warp Destinations');
    expectLine(s, 'Entry');
  });

  it('warps to a visited room and deducts HP', () => {
    let s = newGame();
    // Walk north to entrance hall, then to main hall
    s = input(s, 'north');
    s = input(s, 'north');
    expect(s.player!.currentRoom).toBe('manor_main_hall');

    // Walk back south
    s = input(s, 'south');
    s = input(s, 'south');
    expect(s.player!.currentRoom).toBe('manor_entry');

    const hpBefore = s.player!.hp;
    // Warp to entrance hall (1 hop from entry, should cost 2hp)
    s = input(s, 'warp entrance hall');
    expect(s.player!.currentRoom).toBe('manor_entrance_hall');
    expect(s.player!.hp).toBe(hpBefore - 2);
    expectLine(s, 'costs 2 HP');
  });

  it('warps to hub rooms for free', () => {
    let s = newGame();
    // Visit main hall first
    s = input(s, 'north');
    s = input(s, 'north');
    expect(s.player!.currentRoom).toBe('manor_main_hall');
    s = input(s, 'south');

    const hpBefore = s.player!.hp;
    s = input(s, 'warp main hall');
    expect(s.player!.currentRoom).toBe('manor_main_hall');
    expect(s.player!.hp).toBe(hpBefore); // free — hub room
    expectNoLine(s, 'costs');
  });

  it('blocks warp when HP too low', () => {
    let s = newGame();
    // Visit entrance hall
    s = input(s, 'north');
    s = input(s, 'south');

    // Set HP to 1
    s.player!.hp = 1;
    s = input(s, 'warp entrance hall');
    expect(s.player!.currentRoom).toBe('manor_entry'); // didn't move
    expectLine(s, 'Not enough HP');
  });

  it('shows error for unknown room', () => {
    let s = newGame();
    s = input(s, 'warp nonexistent place');
    expectLine(s, 'Unknown location');
  });

  it('blocks warp in dungeon mode', () => {
    let s = newGame();
    s.gameMode = 'dungeon';
    s = input(s, 'warp main hall');
    expectLine(s, 'not available in the dungeon');
  });
});
```

- [ ] **Step 5: Run full lint and test suite**

Run: `npm run lint && npm test`
Expected: All passing.

- [ ] **Step 6: Commit**

```bash
git add src/engine/state/exploring.ts src/engine/gameReducer.ts test/scenario/warp-flow.test.ts test/unit/exploring-state.test.ts
git commit -m "Wire warp command into exploring state with autocomplete and scenario tests"
```

---

## Task 4: Restructure Skill Data and Prerequisites

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/skills.ts`
- Create: `test/unit/skills.test.ts`

- [ ] **Step 1: Write failing tests for new skill structure**

Create `test/unit/skills.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SKILL_TREE, getSkillsByTier, canLearnSkill, findSkillByName, applySkillEffects } from '../../src/engine/skills';
import { createPlayer } from '../../src/engine/player';

describe('skill tree structure', () => {
  it('has 15 skills across 5 tiers, 3 per tier', () => {
    expect(SKILL_TREE.length).toBe(15);
    for (let tier = 1; tier <= 5; tier++) {
      expect(getSkillsByTier(tier).length).toBe(3);
    }
  });

  it('has no branch field on skills', () => {
    for (const skill of SKILL_TREE) {
      expect(skill).not.toHaveProperty('branch');
    }
  });
});

describe('canLearnSkill', () => {
  it('tier 1 skills are always available', () => {
    expect(canLearnSkill({}, 'iron_will')).toBe(true);
    expect(canLearnSkill({}, 'sharp_eyes')).toBe(true);
    expect(canLearnSkill({}, 'herbalism')).toBe(true);
  });

  it('tier 2 requires at least one tier 1 skill', () => {
    expect(canLearnSkill({}, 'heavy_blows')).toBe(false);
    expect(canLearnSkill({ iron_will: true }, 'heavy_blows')).toBe(true);
    expect(canLearnSkill({ sharp_eyes: true }, 'heavy_blows')).toBe(true);
  });

  it('tier 3 requires at least one tier 2 skill', () => {
    expect(canLearnSkill({ iron_will: true }, 'thick_skin')).toBe(false);
    expect(canLearnSkill({ iron_will: true, heavy_blows: true }, 'thick_skin')).toBe(true);
  });

  it('rejects already-learned skills', () => {
    expect(canLearnSkill({ iron_will: true }, 'iron_will')).toBe(false);
  });
});

describe('applySkillEffects', () => {
  it('iron_will adds 5 HP per level', () => {
    const player = createPlayer();
    player.level = 3;
    const prevMax = player.maxHp;
    applySkillEffects(player, 'iron_will');
    expect(player.maxHp).toBe(prevMax + 15);
    expect(player.hp).toBe(player.maxHp); // also heals for the bonus
  });

  it('heavy_blows adds 2 attack', () => {
    const player = createPlayer();
    const prev = player.attack;
    applySkillEffects(player, 'heavy_blows');
    expect(player.attack).toBe(prev + 2);
  });

  it('thick_skin adds 2 defense', () => {
    const player = createPlayer();
    const prev = player.defense;
    applySkillEffects(player, 'thick_skin');
    expect(player.defense).toBe(prev + 2);
  });

  it('titan adds 15 HP, 1 ATK, 1 DEF', () => {
    const player = createPlayer();
    const prevHp = player.maxHp;
    const prevAtk = player.attack;
    const prevDef = player.defense;
    applySkillEffects(player, 'titan');
    expect(player.maxHp).toBe(prevHp + 15);
    expect(player.attack).toBe(prevAtk + 1);
    expect(player.defense).toBe(prevDef + 1);
  });

  it('no-op for skills without stat effects', () => {
    const player = createPlayer();
    const before = { ...player };
    applySkillEffects(player, 'sharp_eyes');
    expect(player.hp).toBe(before.hp);
    expect(player.attack).toBe(before.attack);
    expect(player.defense).toBe(before.defense);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/unit/skills.test.ts`
Expected: FAIL — `getSkillsByTier` and `applySkillEffects` don't exist, skills still have `branch`.

- [ ] **Step 3: Update types.ts**

In `src/engine/types.ts`:

Remove the `SkillBranch` type:
```ts
// DELETE: export type SkillBranch = 'warrior' | 'rogue' | 'mage';
```

Update `SkillDef` — remove `branch`, keep everything else:
```ts
export interface SkillDef {
  id: SkillId;
  name: string;
  description: string;
  tier: number;
}
```

- [ ] **Step 4: Rewrite skills.ts**

Replace `src/engine/skills.ts` entirely:

```ts
import type { PlayerState, SkillDef } from './types';

export const SKILL_TREE: SkillDef[] = [
  // Tier 1 — General
  { id: 'iron_will', name: 'Iron Will', description: '+5 max HP per level', tier: 1 },
  { id: 'sharp_eyes', name: 'Sharp Eyes', description: 'Crit chance 10% → 18%', tier: 1 },
  { id: 'herbalism', name: 'Herbalism', description: 'Healing items restore 50% more', tier: 1 },
  // Tier 2 — Utility
  { id: 'heavy_blows', name: 'Heavy Blows', description: '+2 base attack', tier: 2 },
  { id: 'quick_feet', name: 'Quick Feet', description: 'Flee success 70% → 90%', tier: 2 },
  { id: 'arcane_shield', name: 'Arcane Shield', description: '-1 damage from all attacks', tier: 2 },
  // Tier 3 — Mid-specialization
  { id: 'thick_skin', name: 'Thick Skin', description: '+2 base defense', tier: 3 },
  { id: 'precision', name: 'Precision', description: '+3 ATK, ignore 2 enemy DEF', tier: 3 },
  { id: 'buff_mastery', name: 'Buff Mastery', description: 'Buffs last 5 rounds (not 3)', tier: 3 },
  // Tier 4 — Specialized
  { id: 'berserker', name: 'Berserker', description: '+15% damage when HP below 30%', tier: 4 },
  { id: 'lucky', name: 'Lucky', description: '15% chance to dodge attacks', tier: 4 },
  { id: 'meditation', name: 'Meditation', description: 'Regenerate 2 HP per combat round', tier: 4 },
  // Tier 5 — Capstone
  { id: 'titan', name: 'Titan', description: '+15 max HP, +1 ATK, +1 DEF', tier: 5 },
  { id: 'assassin', name: 'Assassin', description: 'Crits deal 3x damage (instead of 2x)', tier: 5 },
  { id: 'enlightened', name: 'Enlightened', description: '+50% XP from all sources', tier: 5 },
];

export function getSkillsByTier(tier: number): SkillDef[] {
  return SKILL_TREE.filter(s => s.tier === tier);
}

export function getSkill(id: string): SkillDef | undefined {
  return SKILL_TREE.find(s => s.id === id);
}

export function canLearnSkill(skills: Record<string, boolean>, skillId: string): boolean {
  const skill = getSkill(skillId);
  if (!skill) return false;
  if (skills[skillId]) return false;
  if (skill.tier === 1) return true;
  // Must have at least one skill from the previous tier
  const prevTierSkills = getSkillsByTier(skill.tier - 1);
  return prevTierSkills.some(s => skills[s.id]);
}

export function findSkillByName(name: string): SkillDef | undefined {
  const lower = name.toLowerCase();
  return SKILL_TREE.find(s => s.id === lower || s.name.toLowerCase() === lower)
    || SKILL_TREE.find(s => s.id.includes(lower) || s.name.toLowerCase().includes(lower));
}

/**
 * Apply immediate stat effects when a skill is learned.
 * Called by both the text `learn` command and the skill tree UI.
 */
export function applySkillEffects(player: PlayerState, skillId: string): void {
  if (skillId === 'iron_will') {
    const bonus = 5 * player.level;
    player.maxHp += bonus;
    player.hp += bonus;
  } else if (skillId === 'heavy_blows') {
    player.attack += 2;
  } else if (skillId === 'thick_skin') {
    player.defense += 2;
  } else if (skillId === 'titan') {
    player.maxHp += 15;
    player.hp += 15;
    player.attack += 1;
    player.defense += 1;
  }
}
```

- [ ] **Step 5: Fix all compile errors from branch removal**

Files that import `SkillBranch` or `getSkillsByBranch`:
- `src/engine/handlers/info.ts` — `showSkills` uses `getSkillsByBranch` and `SkillBranch`. Update to use `getSkillsByTier`:

```ts
// Replace the branch import line:
import { SKILL_TREE, canLearnSkill, getSkillsByTier } from '../skills';

// Replace the showSkills function body (the whole function):
export function showSkills(store: GameStore): void {
  if (!store.player) return;
  addLine(store, '');
  addLine(store, '=== Skill Tree ===', C.STAT_COLOR);
  addLine(store, `Skill Points: ${store.player.skillPoints}`, C.CHOICE_COLOR);
  addLine(store, '');

  for (let tier = 1; tier <= 5; tier++) {
    addLine(store, `--- Tier ${tier} ---`, C.COMBAT_COLOR);
    const skills = getSkillsByTier(tier);
    for (const skill of skills) {
      if (store.player.skills[skill.id]) {
        addLine(store, `  [*] ${skill.name} - ${skill.description}`, C.ITEM_COLOR);
      } else if (canLearnSkill(store.player.skills, skill.id)) {
        addLine(store, `  [>] ${skill.name} - ${skill.description} (available)`, C.CHOICE_COLOR);
      } else {
        addLine(store, `  [ ] ${skill.name} - ${skill.description}`, C.HELP_COLOR);
      }
    }
    addLine(store, '');
  }
  addLine(store, "Type 'learn <skill>' to learn a skill.", C.HELP_COLOR);
}
```

Remove `SkillBranch` from the `types.ts` import in `info.ts` if it's there (it isn't currently — the import is from `skills.ts`).

- `src/engine/state/exploring.ts` — the autocomplete for `learn` uses `canLearnSkill` and `SKILL_TREE`, which are unchanged. No changes needed.

- [ ] **Step 6: Update handleLearn in meta.ts to use applySkillEffects**

In `src/engine/handlers/meta.ts`, replace the stat-application block with `applySkillEffects`:

```ts
import { applySkillEffects, canLearnSkill, findSkillByName } from '../skills';
```

Replace the body of `handleLearn` from the `store.player.skills[skill.id] = true;` line through the stat-application `if/else if` block:

```ts
  store.player.skills[skill.id] = true;
  store.player.skillPoints--;
  applySkillEffects(store.player, skill.id);

  addLine(store, `Learned ${skill.name}! ${skill.description}`, C.ITEM_COLOR);
  emit('levelUp');
  refreshHeader();
  checkScholar();
```

- [ ] **Step 7: Run tests to verify everything passes**

Run: `npm run lint && npm test`
Expected: All passing. Existing tests that use skill IDs (combat tests etc.) should still pass since IDs are unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/engine/types.ts src/engine/skills.ts src/engine/handlers/info.ts src/engine/handlers/meta.ts test/unit/skills.test.ts
git commit -m "Restructure skills from branches to tiers with shared applySkillEffects"
```

---

## Task 5: Skill Tree Selection UI — State and Dispatcher

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/gameReducer.ts`
- Create: `src/engine/state/skill-tree.ts`
- Create: `test/unit/skill-tree-state.test.ts`

- [ ] **Step 1: Write failing tests for skill tree state**

Create `test/unit/skill-tree-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createInitialStore } from '../../src/engine/gameReducer';
import { displaySkillTree, handleSkillTreeKey, type SkillTreeDeps } from '../../src/engine/state/skill-tree';
import { createPlayer } from '../../src/engine/player';
import { createWorld, loadRegion } from '../../src/engine/world';
import { allLines } from '../fixtures/assert-output';
import manorJson from '../../src/data/regions/manor.json';
import type { RegionData } from '../../src/engine/types';

function makeStore() {
  const store = createInitialStore();
  store.world = createWorld();
  loadRegion(store.world, manorJson as RegionData);
  store.player = createPlayer();
  store.player.skillPoints = 2;
  store.state = 'skill_tree';
  return store;
}

function makeDeps(): SkillTreeDeps {
  return {
    refreshHeader: () => {},
    emit: () => {},
    checkScholar: () => {},
  };
}

describe('skill tree state', () => {
  it('displays skill tree with tiers', () => {
    const store = makeStore();
    displaySkillTree(store);
    const lines = allLines(store);
    expect(lines.some(l => l.includes('Skill Tree'))).toBe(true);
    expect(lines.some(l => l.includes('Tier 1'))).toBe(true);
    expect(lines.some(l => l.includes('Tier 5'))).toBe(true);
    expect(lines.some(l => l.includes('Iron Will'))).toBe(true);
  });

  it('navigates with arrow keys', () => {
    const store = makeStore();
    displaySkillTree(store);

    // Start at tier 1, index 0
    expect(store.skillTreeSelected).toEqual({ tier: 1, index: 0 });

    handleSkillTreeKey(store, 'ArrowRight', makeDeps());
    expect(store.skillTreeSelected).toEqual({ tier: 1, index: 1 });

    handleSkillTreeKey(store, 'ArrowDown', makeDeps());
    expect(store.skillTreeSelected).toEqual({ tier: 2, index: 1 });

    handleSkillTreeKey(store, 'ArrowLeft', makeDeps());
    expect(store.skillTreeSelected).toEqual({ tier: 2, index: 0 });
  });

  it('clamps at boundaries', () => {
    const store = makeStore();
    displaySkillTree(store);

    handleSkillTreeKey(store, 'ArrowUp', makeDeps());
    expect(store.skillTreeSelected.tier).toBe(1); // can't go above tier 1

    handleSkillTreeKey(store, 'ArrowLeft', makeDeps());
    expect(store.skillTreeSelected.index).toBe(0); // can't go below 0

    // Go to tier 5
    for (let i = 0; i < 5; i++) handleSkillTreeKey(store, 'ArrowDown', makeDeps());
    expect(store.skillTreeSelected.tier).toBe(5);

    // Go to index 2
    handleSkillTreeKey(store, 'ArrowRight', makeDeps());
    handleSkillTreeKey(store, 'ArrowRight', makeDeps());
    expect(store.skillTreeSelected.index).toBe(2);

    handleSkillTreeKey(store, 'ArrowRight', makeDeps());
    expect(store.skillTreeSelected.index).toBe(2); // clamped
  });

  it('learns a skill on Enter', () => {
    const store = makeStore();
    displaySkillTree(store);

    // Select Iron Will (tier 1, index 0) and press Enter
    handleSkillTreeKey(store, 'Enter', makeDeps());
    expect(store.player!.skills['iron_will']).toBe(true);
    expect(store.player!.skillPoints).toBe(1);
    expect(store.state).toBe('skill_tree'); // stays in tree
  });

  it('shows error when no skill points', () => {
    const store = makeStore();
    store.player!.skillPoints = 0;
    displaySkillTree(store);

    handleSkillTreeKey(store, 'Enter', makeDeps());
    expect(store.player!.skills['iron_will']).toBeUndefined();
    const lines = allLines(store);
    expect(lines.some(l => l.includes('no skill points'))).toBe(true);
  });

  it('shows error for locked skill', () => {
    const store = makeStore();
    displaySkillTree(store);

    // Navigate to tier 2 (locked — no tier 1 skills learned)
    handleSkillTreeKey(store, 'ArrowDown', makeDeps());
    handleSkillTreeKey(store, 'Enter', makeDeps());
    expect(store.player!.skills['heavy_blows']).toBeUndefined();
    const lines = allLines(store);
    expect(lines.some(l => l.includes('previous tier'))).toBe(true);
  });

  it('returns to exploring on Escape', () => {
    const store = makeStore();
    store.skillTreePrevState = 'exploring';
    displaySkillTree(store);

    handleSkillTreeKey(store, 'Escape', makeDeps());
    expect(store.state).toBe('exploring');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/unit/skill-tree-state.test.ts`
Expected: FAIL — module does not exist, store fields missing.

- [ ] **Step 3: Add skill_tree state and store fields to types.ts**

In `src/engine/types.ts`, update `GameStateKind`:

```ts
export type GameStateKind = 'boot' | 'menu' | 'exploring' | 'combat' | 'dialogue' | 'ending' | 'gameover' | 'slot_picker' | 'minimap' | 'settings' | 'shop' | 'skill_tree' | 'quit';
```

Add to `GameStore` interface (after the `settingsPrevState` field):

```ts
  // Skill tree
  skillTreeSelected: { tier: number; index: number };
  skillTreePrevState: GameStateKind;
```

- [ ] **Step 4: Add defaults to createInitialStore in gameReducer.ts**

In `src/engine/gameReducer.ts`, inside `createInitialStore`, add after `settingsPrevState: 'menu'`:

```ts
    skillTreeSelected: { tier: 1, index: 0 },
    skillTreePrevState: 'exploring',
```

- [ ] **Step 5: Create the skill tree state dispatcher**

Create `src/engine/state/skill-tree.ts`:

```ts
import * as C from '../constants';
import { addLine, clearTerminal, updateHeader } from '../output';
import { applySkillEffects, canLearnSkill, getSkill, getSkillsByTier } from '../skills';
import type { GameStore } from '../types';

export interface SkillTreeDeps {
  refreshHeader: () => void;
  emit: (sound: string) => void;
  checkScholar: () => void;
}

const MAX_TIER = 5;
const SKILLS_PER_TIER = 3;

export function displaySkillTree(store: GameStore): void {
  if (!store.player) return;
  clearTerminal(store);

  addLine(store, '=== Skill Tree ===', C.STAT_COLOR);
  addLine(store, `Skill Points: ${store.player.skillPoints}`, C.CHOICE_COLOR);
  addLine(store, '');

  const sel = store.skillTreeSelected;

  for (let tier = 1; tier <= MAX_TIER; tier++) {
    addLine(store, `--- Tier ${tier} ---`, C.COMBAT_COLOR);
    const skills = getSkillsByTier(tier);
    for (let i = 0; i < skills.length; i++) {
      const skill = skills[i];
      const isSelected = sel.tier === tier && sel.index === i;
      const learned = store.player.skills[skill.id];
      const available = canLearnSkill(store.player.skills, skill.id);

      let marker: string;
      let color: typeof C.ITEM_COLOR;
      if (isSelected) {
        marker = '>>';
        color = learned ? C.ITEM_COLOR : available ? C.CHOICE_COLOR : C.HELP_COLOR;
      } else if (learned) {
        marker = '[*]';
        color = C.ITEM_COLOR;
      } else if (available) {
        marker = '[>]';
        color = C.CHOICE_COLOR;
      } else {
        marker = '[ ]';
        color = C.HELP_COLOR;
      }

      addLine(store, `  ${marker} ${skill.name} - ${skill.description}`, color);
    }
    addLine(store, '');
  }

  // Detail line for selected skill
  const selectedSkills = getSkillsByTier(sel.tier);
  const selectedSkill = selectedSkills[sel.index];
  if (selectedSkill) {
    const learned = store.player.skills[selectedSkill.id];
    const available = canLearnSkill(store.player.skills, selectedSkill.id);
    if (learned) {
      addLine(store, `> ${selectedSkill.name} — LEARNED`, C.ITEM_COLOR);
    } else if (available && store.player.skillPoints > 0) {
      addLine(store, `> ${selectedSkill.name} — ${selectedSkill.description}  [press Enter to learn]`, C.CHOICE_COLOR);
    } else if (available) {
      addLine(store, `> ${selectedSkill.name} — ${selectedSkill.description}  [no skill points]`, C.HELP_COLOR);
    } else {
      addLine(store, `> ${selectedSkill.name} — ${selectedSkill.description}  [requires a skill from previous tier]`, C.HELP_COLOR);
    }
  }

  addLine(store, '');
  addLine(store, 'Arrow keys to navigate, Enter to learn, Escape to close', [0.5, 0.5, 0.5, 0.8]);
}

export function handleSkillTreeKey(
  store: GameStore,
  key: string,
  deps: SkillTreeDeps,
): void {
  if (!store.player) return;

  const sel = store.skillTreeSelected;

  if (key === 'ArrowUp') {
    sel.tier = Math.max(1, sel.tier - 1);
    displaySkillTree(store);
  } else if (key === 'ArrowDown') {
    sel.tier = Math.min(MAX_TIER, sel.tier + 1);
    displaySkillTree(store);
  } else if (key === 'ArrowLeft') {
    sel.index = Math.max(0, sel.index - 1);
    displaySkillTree(store);
  } else if (key === 'ArrowRight') {
    sel.index = Math.min(SKILLS_PER_TIER - 1, sel.index + 1);
    displaySkillTree(store);
  } else if (key === 'Enter') {
    const skills = getSkillsByTier(sel.tier);
    const skill = skills[sel.index];
    if (!skill) return;

    if (store.player.skills[skill.id]) {
      addLine(store, `You already know ${skill.name}.`, C.ERROR_COLOR);
      return;
    }

    if (!canLearnSkill(store.player.skills, skill.id)) {
      addLine(store, `Learn a skill from the previous tier first.`, C.ERROR_COLOR);
      return;
    }

    if (store.player.skillPoints <= 0) {
      addLine(store, 'You have no skill points. Level up to earn more.', C.ERROR_COLOR);
      return;
    }

    store.player.skills[skill.id] = true;
    store.player.skillPoints--;
    applySkillEffects(store.player, skill.id);

    addLine(store, `Learned ${skill.name}! ${skill.description}`, C.ITEM_COLOR);
    deps.emit('levelUp');
    deps.refreshHeader();
    deps.checkScholar();

    // Re-render the tree to show updated state
    displaySkillTree(store);
  } else if (key === 'Escape') {
    store.state = store.skillTreePrevState;
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/unit/skill-tree-state.test.ts`
Expected: All PASS.

- [ ] **Step 7: Run full lint and test suite**

Run: `npm run lint && npm test`
Expected: All passing.

- [ ] **Step 8: Commit**

```bash
git add src/engine/types.ts src/engine/gameReducer.ts src/engine/state/skill-tree.ts test/unit/skill-tree-state.test.ts
git commit -m "Add skill_tree game state with arrow-key navigation and learn-on-enter"
```

---

## Task 6: Wire Skill Tree UI into Game

**Files:**
- Modify: `src/engine/state/exploring.ts`
- Modify: `src/engine/gameReducer.ts`

- [ ] **Step 1: Change `skills` command to open skill tree state**

In `src/engine/state/exploring.ts`, update the `skills` case in `handleExploringCommand`:

Add import at top:
```ts
import { displaySkillTree } from './skill-tree';
```

Replace the `skills` handler:
```ts
  } else if (verb === 'skills') {
    store.state = 'skill_tree';
    store.skillTreePrevState = 'exploring';
    store.skillTreeSelected = { tier: 1, index: 0 };
    displaySkillTree(store);
```

- [ ] **Step 2: Route key input to skill tree in gameReducer.ts**

In `src/engine/gameReducer.ts`:

Add import:
```ts
import { handleSkillTreeKey as handleSkillTreeKeyRaw, type SkillTreeDeps } from './state/skill-tree';
```

Add deps builder (near the other `build*Deps` functions):
```ts
function buildSkillTreeDeps(store: GameStore): SkillTreeDeps {
  return {
    refreshHeader: () => updateHeader(store),
    emit: sound => emitSound(store, sound),
    checkScholar: () => {
      const learnedCount = Object.values(store.player!.skills).filter(Boolean).length;
      if (learnedCount >= 5) {
        checkAchievement(store, 'scholar');
      }
    },
  };
}
```

In `handleKeyPressed`, add a new block after the `settings` block and before the `shop` block:

```ts
  if (s.state === 'skill_tree') {
    handleSkillTreeKeyRaw(s, key, buildSkillTreeDeps(s));
    return;
  }
```

Also: in the `handleKeyPressed` function, the `Enter` key handler dispatches to `handleExploringCommand` for non-dialogue/non-combat/non-shop states. Since `skill_tree` key input is handled above (it returns early), text input and Enter in `skill_tree` state are already covered — the key handler returns before reaching the text-input section. Verify this is correct by tracing the flow.

- [ ] **Step 3: Run full lint and test suite**

Run: `npm run lint && npm test`
Expected: All passing. The existing `showSkills` tests in `test/unit/info.test.ts` may need updating if they check for branch-based display.

- [ ] **Step 4: Fix any failing tests**

Check `test/unit/info.test.ts` and `test/unit/meta.test.ts` — if they reference branches or the old `showSkills` output format, update the assertions to match the new tier-based output.

- [ ] **Step 5: Commit**

```bash
git add src/engine/state/exploring.ts src/engine/gameReducer.ts
git commit -m "Wire skill tree UI into exploring command and game reducer key routing"
```

---

## Task 7: Scenario Tests and Final Cleanup

**Files:**
- Create: `test/scenario/skill-tree-flow.test.ts`
- Modify: any test files that broke from branch removal

- [ ] **Step 1: Write scenario tests for the full skill tree flow**

Create `test/scenario/skill-tree-flow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newGame, input } from '../fixtures/mock-input';
import { gameReducer } from '../../src/engine/gameReducer';
import { expectLine } from '../fixtures/assert-output';

function key(store: ReturnType<typeof newGame>, k: string) {
  return gameReducer(store, { type: 'KEY_PRESSED', key: k });
}

describe('skill tree flow', () => {
  it('opens skill tree, navigates, learns a skill, and returns to exploring', () => {
    let s = newGame();
    // Give the player skill points
    s.player!.skillPoints = 3;

    // Type "skills" to open the tree
    s = input(s, 'skills');
    expect(s.state).toBe('skill_tree');
    expectLine(s, 'Skill Tree');
    expectLine(s, 'Tier 1');

    // Learn Iron Will (tier 1, index 0 — default position)
    s = key(s, 'Enter');
    expect(s.player!.skills['iron_will']).toBe(true);
    expect(s.player!.skillPoints).toBe(2);
    expectLine(s, 'Learned Iron Will');

    // Navigate right to Sharp Eyes and learn it
    s = key(s, 'ArrowRight');
    s = key(s, 'Enter');
    expect(s.player!.skills['sharp_eyes']).toBe(true);
    expect(s.player!.skillPoints).toBe(1);

    // Navigate down to tier 2 (now unlocked) and learn
    s = key(s, 'ArrowDown');
    s = key(s, 'ArrowLeft'); // go to index 0
    s = key(s, 'Enter');
    expect(s.player!.skills['heavy_blows']).toBe(true);
    expect(s.player!.skillPoints).toBe(0);

    // Escape back to exploring
    s = key(s, 'Escape');
    expect(s.state).toBe('exploring');
  });

  it('learn command still works as text shortcut', () => {
    let s = newGame();
    s.player!.skillPoints = 1;
    s = input(s, 'learn iron will');
    expect(s.player!.skills['iron_will']).toBe(true);
    expect(s.state).toBe('exploring');
  });
});
```

- [ ] **Step 2: Run full lint and test suite**

Run: `npm run lint && npm test`
Expected: All passing.

- [ ] **Step 3: Update help text for skills command**

In `src/engine/handlers/help.ts`, update the `skills` line to reflect that it opens an interactive UI:

```ts
  addLine(store, '  skills          - Open the skill tree', C.HELP_COLOR);
```

- [ ] **Step 4: Run final lint and test suite**

Run: `npm run lint && npm test`
Expected: All passing, no warnings.

- [ ] **Step 5: Commit**

```bash
git add test/scenario/skill-tree-flow.test.ts test/scenario/warp-flow.test.ts src/engine/handlers/help.ts
git commit -m "Add scenario tests for skill tree and warp flows, update help text"
```

---

## Task 8: Final Integration Verification

- [ ] **Step 1: Run the full build**

Run: `npm run build`
Expected: Clean build, no type errors.

- [ ] **Step 2: Run full test suite with coverage**

Run: `npm run test:coverage`
Expected: All tests pass. New modules have reasonable coverage.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`
Verify in browser:
1. Start new game, type `warp` — see list with only Entry
2. Walk north twice to Main Hall, then south twice back to Entry
3. Type `warp main hall` — teleports for free (hub)
4. Type `warp entrance hall` — teleports, costs 2 HP
5. Type `skills` — interactive skill tree opens
6. Arrow keys navigate between tiers/skills
7. Enter learns a skill (need to level up first or `learn` gives "no skill points")
8. Escape returns to exploring
9. `learn iron will` still works as text command
10. `teleport main hall` works as warp alias

- [ ] **Step 4: Commit any fixes from smoke testing**

If fixes were needed:
```bash
git add -A
git commit -m "Fix issues found during smoke testing"
```
