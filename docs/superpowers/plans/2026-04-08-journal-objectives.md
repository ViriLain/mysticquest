# Journal / Objective Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the chronological `journal` event log with a hand-authored objective tracker that reveals goals as the player triggers them in-game, surfacing the four endings (including the two that are currently undiscoverable without external note-taking).

**Architecture:** A new pure module `src/engine/objectives.ts` owns the activation/completion state machine. Content lives in `src/data/objectives.json`. Handlers (`talk`, `take`, `search`, combat victory, `enterRoom`) call `notifyObjectiveEvent(store, event)` directly after mutating the relevant state. The function walks the objective list, activates untriggered objectives whose trigger matches, re-checks completion on all active objectives (handles reverse-order discovery), processes chained completions until a fixed point, and writes inline notification lines. `PlayerState.objectives` replaces `journalEntries`; save format bumps to v3.

**Tech Stack:** TypeScript, Vitest 2.x, React 18.3.1 (UI unchanged — engine-only feature). No new runtime dependencies.

**Spec:** [docs/superpowers/specs/2026-04-08-journal-objectives-design.md](../specs/2026-04-08-journal-objectives-design.md)

---

## File map

**Create:**
- `src/engine/objectives.ts` — pure activation/completion engine
- `src/data/objectives.json` — hand-authored objective content
- `src/data/README.md` — schema reference for content authors
- `test/unit/objectives.test.ts` — unit tests for the pure module
- `test/scenario/journal-enlightened.test.ts` — end-to-end scenario test

**Modify:**
- `src/engine/types.ts` — add objective types, replace `journalEntries` with `objectives` in `PlayerState`, delete `JournalEntry`
- `src/engine/player.ts` — remove `journalEntries` init, add `objectives` init
- `src/engine/save.ts` — bump to v3, migrate v2 → v3, stop writing `journal_entries`
- `src/engine/gameReducer.ts` — delete `addJournal` helper, call `notifyObjectiveEvent` from `enterRoom`, refactor Deps interfaces to drop `addJournal`
- `src/engine/handlers/info.ts` — rewrite `showJournal` to render objectives
- `src/engine/handlers/talk.ts` — call `notifyObjectiveEvent` after setting `talked_<npc>` flag
- `src/engine/handlers/take.ts` — drop `addJournal` param, call `notifyObjectiveEvent` after pickup
- `src/engine/handlers/search.ts` — call `notifyObjectiveEvent` after search
- `src/engine/state/combat.ts` — drop `addJournal` from `CombatDeps`, call `notifyObjectiveEvent` on victory
- `src/engine/state/exploring.ts` — drop `addJournal` from `ExploringDeps`
- `src/engine/constants.ts` — confirm `STAT_COLOR` exists for notification color (it does)
- `test/unit/info.test.ts` — remove `journalEntries` setup
- `test/unit/save.test.ts` — remove `journalEntries` refs, add v2→v3 migration test
- `test/unit/minimap.test.ts` — remove `journalEntries: []` from player fixture
- `CLAUDE.md` — add "Journal / objectives" bullet under Architecture

---

## Conventions

- **TDD everywhere there's behavior.** Content-only tasks (writing JSON, docs) skip the red phase because there's nothing to test beyond "does the build still pass?"
- **Commits are imperative present tense**, matching existing project style (e.g., `Add objective module skeleton`).
- **Every task ends with `npm run lint && npm test` clean** before committing.
- **Notification lines use `* ` prefix and `STAT_COLOR`**, matching achievement notifications already used in the game.
- **`notifyObjectiveEvent` accepts an optional `objectives` parameter defaulting to the module-level `OBJECTIVES` constant.** This keeps tests fully deterministic (each test passes its own fixture array) while production code uses the default.

---

## Task 1: Add types, player state field, empty objectives file

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/player.ts:26`
- Create: `src/data/objectives.json`

**Goal:** Introduce the new types and the `objectives` field on `PlayerState`, side-by-side with the existing `journalEntries` field (non-breaking). Delete `journalEntries` happens later in Task 12.

### - [ ] Step 1: Create an empty objectives JSON file

Create `src/data/objectives.json`:

```json
[]
```

### - [ ] Step 2: Add objective types to `src/engine/types.ts`

Insert after the existing `JournalEntry` interface (around line 7):

```typescript
/**
 * An objective lives in one of three states:
 *   - untriggered (absent from `player.objectives`)
 *   - 'active'    (trigger fired, completion not yet satisfied)
 *   - 'complete'  (completion satisfied)
 *
 * Completion is a pure function of store state. When any trigger fires,
 * the engine re-checks all active objectives against current state, so an
 * objective whose completion is already satisfied at trigger time goes
 * straight from untriggered → complete in one step.
 */
export type ObjectiveStatus = 'active' | 'complete';

/**
 * What reveals an objective to the player.
 *
 * | Type                 | Required field | Fires when                               |
 * | -------------------- | -------------- | ---------------------------------------- |
 * | talked_to_npc        | npc            | Player talks to the named NPC            |
 * | entered_room         | room           | Player enters the named room             |
 * | searched_room        | room           | Player successfully searches the room    |
 * | took_item            | item           | Player picks up the named item or weapon |
 * | defeated_enemy       | enemy          | Player wins combat against the enemy     |
 * | objective_completed  | objective      | Another objective (by id) becomes complete |
 */
export interface ObjectiveTrigger {
  type:
    | 'talked_to_npc'
    | 'entered_room'
    | 'searched_room'
    | 'took_item'
    | 'defeated_enemy'
    | 'objective_completed';
  npc?: string;
  room?: string;
  item?: string;
  enemy?: string;
  objective?: string;
}

/**
 * What marks an objective as complete. Re-evaluated after every trigger.
 *
 * | Type                   | Required fields    | Complete when                                                        |
 * | ---------------------- | ------------------ | -------------------------------------------------------------------- |
 * | key_items_collected    | items[]            | All listed ids are present in keyItems OR inventory                  |
 * | enemy_defeated         | enemy              | Any room's `_dead_enemies` contains the enemy id                     |
 * | visited_rooms_percent  | percent            | Visited non-hidden non-dungeon rooms ≥ percent × non-hidden total    |
 * | used_items_in_room     | room, items[]      | All listed items appear in `usedItemsInRoom[room]`                   |
 * | objective_completed    | objective          | Another objective (by id) is in `complete` state                     |
 */
export interface ObjectiveCompletion {
  type:
    | 'key_items_collected'
    | 'enemy_defeated'
    | 'visited_rooms_percent'
    | 'used_items_in_room'
    | 'objective_completed';
  items?: string[];
  enemy?: string;
  percent?: number;
  room?: string;
  objective?: string;
}

export interface ObjectiveDef {
  id: string;
  title: string;
  hint: string;
  trigger: ObjectiveTrigger;
  completion: ObjectiveCompletion;
  completion_text: string;
}
```

### - [ ] Step 3: Add `objectives` field to `PlayerState` in `src/engine/types.ts`

Find `PlayerState` (around line 167) and add `objectives` immediately after `journalEntries`:

```typescript
export interface PlayerState {
  // ... existing fields unchanged ...
  routeHistory: string[];
  journalEntries: JournalEntry[];
  objectives: Record<string, ObjectiveStatus>;
  skillPoints: number;
  skills: Record<string, boolean>;
}
```

### - [ ] Step 4: Initialize `objectives` in `createPlayer`

In `src/engine/player.ts`, find `createPlayer` and add the field:

```typescript
export function createPlayer(startRoom = 'manor_entry'): PlayerState {
  return {
    // ... existing fields unchanged ...
    routeHistory: [],
    journalEntries: [],
    objectives: {},
    skillPoints: 0,
    skills: {},
  };
}
```

### - [ ] Step 5: Verify the build compiles

Run: `npm run build`
Expected: exits 0, no TypeScript errors.

### - [ ] Step 6: Verify existing tests still pass

Run: `npm test`
Expected: all tests pass (fixture stores with hardcoded player shapes may still work because the new field has no fixture references yet — if any fail, the failure message will indicate which file needs `objectives: {}` added).

**Note:** `test/unit/minimap.test.ts:49` has a hand-rolled `makePlayer` fixture — if TypeScript complains about missing `objectives`, add `objectives: {},` to that object. Ditto for any other hand-rolled fixtures that surface.

### - [ ] Step 7: Commit

```bash
git add src/engine/types.ts src/engine/player.ts src/data/objectives.json
git commit -m "Add objective types and empty content file"
```

---

## Task 2: Create `objectives.ts` with `talked_to_npc` trigger

**Files:**
- Create: `src/engine/objectives.ts`
- Create: `test/unit/objectives.test.ts`

**Goal:** Get the minimum pure module in place, with one trigger type and one completion type wired, using TDD. Tests pass their own fixture objective arrays — no dependence on `objectives.json` content.

### - [ ] Step 1: Write the failing test

Create `test/unit/objectives.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { notifyObjectiveEvent } from '../../src/engine/objectives';
import type { GameStore, ObjectiveDef } from '../../src/engine/types';
import { freshStore } from '../fixtures/freshStore';

const whiskersFixture: ObjectiveDef[] = [
  {
    id: 'the_diner_mystery',
    title: 'The Diner Mystery',
    hint: 'Sir Whiskers mentioned something about the diner.',
    trigger: { type: 'talked_to_npc', npc: 'whiskers' },
    completion: { type: 'key_items_collected', items: ['red_mushroom'] },
    completion_text: 'You gathered the mushroom.',
  },
];

function storeWithPlayer(): GameStore {
  const store = freshStore();
  // freshStore() gives us a valid store with player + world initialized for 'exploring' state.
  // Tests assume store.player and store.player.objectives exist.
  return store;
}

describe('notifyObjectiveEvent', () => {
  it('activates an objective when its trigger fires', () => {
    const store = storeWithPlayer();
    expect(store.player!.objectives.the_diner_mystery).toBeUndefined();

    notifyObjectiveEvent(
      store,
      { type: 'talked_to_npc', npc: 'whiskers' },
      whiskersFixture,
    );

    expect(store.player!.objectives.the_diner_mystery).toBe('active');
  });
});
```

### - [ ] Step 2: Run the test to verify it fails

Run: `npx vitest run test/unit/objectives.test.ts`
Expected: FAIL with "Cannot find module '../../src/engine/objectives'" or similar import error.

### - [ ] Step 3: Create `src/engine/objectives.ts` with minimal implementation

```typescript
import objectivesData from '../data/objectives.json';
import * as C from './constants';
import { addLine } from './output';
import type {
  GameStore,
  ObjectiveCompletion,
  ObjectiveDef,
  ObjectiveTrigger,
} from './types';

/** The full list of hand-authored objectives, loaded from JSON at import time. */
export const OBJECTIVES: readonly ObjectiveDef[] = objectivesData as ObjectiveDef[];

/**
 * Events emitted by handlers. Exactly mirrors the external trigger types.
 * Chained objectives (trigger type `objective_completed`) are handled
 * internally — callers never construct those events.
 */
export type ObjectiveEvent =
  | { type: 'talked_to_npc'; npc: string }
  | { type: 'entered_room'; room: string }
  | { type: 'searched_room'; room: string }
  | { type: 'took_item'; item: string }
  | { type: 'defeated_enemy'; enemy: string };

/** Internal superset — adds the chain event. */
type AnyObjectiveEvent =
  | ObjectiveEvent
  | { type: 'objective_completed'; objective: string };

function triggerMatches(trigger: ObjectiveTrigger, event: AnyObjectiveEvent): boolean {
  if (trigger.type !== event.type) return false;
  switch (event.type) {
    case 'talked_to_npc': return trigger.npc === event.npc;
    case 'entered_room': return trigger.room === event.room;
    case 'searched_room': return trigger.room === event.room;
    case 'took_item': return trigger.item === event.item;
    case 'defeated_enemy': return trigger.enemy === event.enemy;
    case 'objective_completed': return trigger.objective === event.objective;
  }
}

/**
 * Called from handlers whenever an objective-relevant event occurs. Mutates
 * `store.player.objectives` and appends notification lines to `store.lines`.
 * Callers don't need to do anything with the return value.
 */
export function notifyObjectiveEvent(
  store: GameStore,
  event: ObjectiveEvent,
  objectives: readonly ObjectiveDef[] = OBJECTIVES,
): void {
  if (!store.player) return;
  const player = store.player;

  // Track which objectives transitioned in this call so we can write
  // notification lines in order (activations, then completions).
  const newlyActivated: ObjectiveDef[] = [];

  // Step 1: activate any untriggered objectives whose trigger matches.
  for (const obj of objectives) {
    if (player.objectives[obj.id] !== undefined) continue;
    if (triggerMatches(obj.trigger, event)) {
      player.objectives[obj.id] = 'active';
      newlyActivated.push(obj);
    }
  }

  // Notification lines. (Completion logic and chaining come in later tasks.)
  for (const obj of newlyActivated) {
    addLine(store, `* New journal entry: ${obj.title}`, C.STAT_COLOR);
  }
}
```

### - [ ] Step 4: Run the test to verify it passes

Run: `npx vitest run test/unit/objectives.test.ts`
Expected: PASS.

### - [ ] Step 5: Run full test suite + lint

Run: `npm run lint && npm test`
Expected: clean.

### - [ ] Step 6: Commit

```bash
git add src/engine/objectives.ts test/unit/objectives.test.ts
git commit -m "Add objectives module skeleton with talked_to_npc trigger"
```

---

## Task 3: Add `key_items_collected` completion (with reverse-order discovery)

**Files:**
- Modify: `src/engine/objectives.ts`
- Modify: `test/unit/objectives.test.ts`

**Goal:** Implement completion checking for `key_items_collected`, and prove that an objective whose completion is already satisfied when its trigger fires goes straight to `complete` in a single call.

### - [ ] Step 1: Add the completion test

Append to `test/unit/objectives.test.ts`:

```typescript
const mushroomFixture: ObjectiveDef[] = [
  {
    id: 'the_diner_mystery',
    title: 'The Diner Mystery',
    hint: 'Sir Whiskers mentioned something about the diner.',
    trigger: { type: 'talked_to_npc', npc: 'whiskers' },
    completion: {
      type: 'key_items_collected',
      items: ['red_mushroom', 'grey_mushroom', 'green_mushroom', 'orange_mushroom'],
    },
    completion_text: 'You gathered all four strange mushrooms.',
  },
];

describe('completion: key_items_collected', () => {
  it('does not complete if items are missing', () => {
    const store = freshStore();
    notifyObjectiveEvent(
      store,
      { type: 'talked_to_npc', npc: 'whiskers' },
      mushroomFixture,
    );
    expect(store.player!.objectives.the_diner_mystery).toBe('active');
  });

  it('completes when all items are in inventory', () => {
    const store = freshStore();
    store.player!.inventory = {
      red_mushroom: 1,
      grey_mushroom: 1,
      green_mushroom: 1,
      orange_mushroom: 1,
    };
    notifyObjectiveEvent(
      store,
      { type: 'talked_to_npc', npc: 'whiskers' },
      mushroomFixture,
    );
    expect(store.player!.objectives.the_diner_mystery).toBe('complete');
  });

  it('completes when items are in keyItems instead of inventory', () => {
    const store = freshStore();
    store.player!.keyItems = {
      red_mushroom: true,
      grey_mushroom: true,
      green_mushroom: true,
      orange_mushroom: true,
    };
    notifyObjectiveEvent(
      store,
      { type: 'talked_to_npc', npc: 'whiskers' },
      mushroomFixture,
    );
    expect(store.player!.objectives.the_diner_mystery).toBe('complete');
  });

  it('writes activation and completion notification lines in order', () => {
    const store = freshStore();
    store.player!.inventory = {
      red_mushroom: 1,
      grey_mushroom: 1,
      green_mushroom: 1,
      orange_mushroom: 1,
    };
    const linesBefore = store.lines.length;
    notifyObjectiveEvent(
      store,
      { type: 'talked_to_npc', npc: 'whiskers' },
      mushroomFixture,
    );
    const newLines = store.lines.slice(linesBefore).map(l => l.text);
    expect(newLines).toEqual([
      '* New journal entry: The Diner Mystery',
      '* Journal complete: The Diner Mystery',
    ]);
  });
});
```

### - [ ] Step 2: Run the tests to verify they fail

Run: `npx vitest run test/unit/objectives.test.ts`
Expected: FAIL on the "completes when all items are in inventory" test and the two below it — activation works but completion is not implemented.

### - [ ] Step 3: Implement completion checking in `src/engine/objectives.ts`

Add after the `triggerMatches` function:

```typescript
/** Pure check: does the current store state satisfy this objective's completion? */
export function isCompletionSatisfied(
  store: GameStore,
  completion: ObjectiveCompletion,
): boolean {
  if (!store.player) return false;
  const player = store.player;

  switch (completion.type) {
    case 'key_items_collected': {
      const items = completion.items ?? [];
      if (items.length === 0) return false;
      return items.every(
        id => player.keyItems[id] === true || (player.inventory[id] ?? 0) > 0,
      );
    }
    default:
      return false;
  }
}
```

Replace `notifyObjectiveEvent` with:

```typescript
export function notifyObjectiveEvent(
  store: GameStore,
  event: ObjectiveEvent,
  objectives: readonly ObjectiveDef[] = OBJECTIVES,
): void {
  if (!store.player) return;
  const player = store.player;

  const newlyActivated: ObjectiveDef[] = [];
  const newlyCompleted: ObjectiveDef[] = [];

  // Step 1: activate any untriggered objectives whose trigger matches.
  for (const obj of objectives) {
    if (player.objectives[obj.id] !== undefined) continue;
    if (triggerMatches(obj.trigger, event)) {
      player.objectives[obj.id] = 'active';
      newlyActivated.push(obj);
    }
  }

  // Step 2: re-check completion for every active objective. Freshly-activated
  // objectives are checked here too, which handles the "collected items before
  // the trigger fired" case — they flip untriggered → active → complete in
  // a single call and both notifications fire in order.
  for (const obj of objectives) {
    if (player.objectives[obj.id] !== 'active') continue;
    if (isCompletionSatisfied(store, obj.completion)) {
      player.objectives[obj.id] = 'complete';
      newlyCompleted.push(obj);
    }
  }

  // Step 3: write notification lines (activations first, then completions).
  for (const obj of newlyActivated) {
    addLine(store, `* New journal entry: ${obj.title}`, C.STAT_COLOR);
  }
  for (const obj of newlyCompleted) {
    addLine(store, `* Journal complete: ${obj.title}`, C.STAT_COLOR);
  }
}
```

### - [ ] Step 4: Run the tests to verify they pass

Run: `npx vitest run test/unit/objectives.test.ts`
Expected: all 4 tests in this file pass.

### - [ ] Step 5: Run full test suite + lint

Run: `npm run lint && npm test`
Expected: clean.

### - [ ] Step 6: Commit

```bash
git add src/engine/objectives.ts test/unit/objectives.test.ts
git commit -m "Add key_items_collected completion with reverse-order discovery"
```

---

## Task 4: Remaining trigger types

**Files:**
- Modify: `src/engine/objectives.ts`
- Modify: `test/unit/objectives.test.ts`

**Goal:** Add tests and support for `entered_room`, `searched_room`, `took_item`, `defeated_enemy` triggers. Also test idempotency (firing the same trigger twice is a no-op).

### - [ ] Step 1: Add failing tests

Append to `test/unit/objectives.test.ts`:

```typescript
const simpleFixture = (id: string, trigger: ObjectiveDef['trigger']): ObjectiveDef[] => [
  {
    id,
    title: `Test ${id}`,
    hint: '...',
    trigger,
    completion: { type: 'key_items_collected', items: ['never'] },
    completion_text: '...',
  },
];

describe('trigger types', () => {
  it('activates on entered_room', () => {
    const store = freshStore();
    notifyObjectiveEvent(
      store,
      { type: 'entered_room', room: 'manor_library' },
      simpleFixture('room_objective', { type: 'entered_room', room: 'manor_library' }),
    );
    expect(store.player!.objectives.room_objective).toBe('active');
  });

  it('activates on searched_room', () => {
    const store = freshStore();
    notifyObjectiveEvent(
      store,
      { type: 'searched_room', room: 'manor_dome' },
      simpleFixture('search_objective', { type: 'searched_room', room: 'manor_dome' }),
    );
    expect(store.player!.objectives.search_objective).toBe('active');
  });

  it('activates on took_item', () => {
    const store = freshStore();
    notifyObjectiveEvent(
      store,
      { type: 'took_item', item: 'dark_crown' },
      simpleFixture('crown_objective', { type: 'took_item', item: 'dark_crown' }),
    );
    expect(store.player!.objectives.crown_objective).toBe('active');
  });

  it('activates on defeated_enemy', () => {
    const store = freshStore();
    notifyObjectiveEvent(
      store,
      { type: 'defeated_enemy', enemy: 'cellar_shade' },
      simpleFixture('boss_objective', { type: 'defeated_enemy', enemy: 'cellar_shade' }),
    );
    expect(store.player!.objectives.boss_objective).toBe('active');
  });

  it('is idempotent — firing the same trigger twice is a no-op on the second call', () => {
    const store = freshStore();
    const fx = simpleFixture('idempotent', { type: 'entered_room', room: 'a' });
    notifyObjectiveEvent(store, { type: 'entered_room', room: 'a' }, fx);
    const firstLines = store.lines.length;
    notifyObjectiveEvent(store, { type: 'entered_room', room: 'a' }, fx);
    expect(store.player!.objectives.idempotent).toBe('active');
    expect(store.lines.length).toBe(firstLines); // no extra notifications
  });

  it('does not fire when the trigger field does not match', () => {
    const store = freshStore();
    notifyObjectiveEvent(
      store,
      { type: 'talked_to_npc', npc: 'dusty' },
      simpleFixture('wrong_npc', { type: 'talked_to_npc', npc: 'whiskers' }),
    );
    expect(store.player!.objectives.wrong_npc).toBeUndefined();
  });
});
```

### - [ ] Step 2: Run the tests to verify they fail

Run: `npx vitest run test/unit/objectives.test.ts -t "trigger types"`
Expected: the four "activates on X" tests pass already (trigger matching is type-generic in Task 2's implementation), but verify. Idempotency test should pass (we early-return if objectives[id] !== undefined). Field-mismatch test should pass too.

**If all pass unexpectedly, that's fine — Task 2's impl already covered these.** Move directly to Step 3.

### - [ ] Step 3: (If needed) Fix any impl gap

If any of the new tests failed in Step 2, the likely issue is that `triggerMatches` is missing a case or has a typo. The switch should cover all 6 trigger types. Re-inspect Task 2 Step 3.

### - [ ] Step 4: Run the full suite

Run: `npm run lint && npm test`
Expected: all tests pass, lint clean.

### - [ ] Step 5: Commit

```bash
git add test/unit/objectives.test.ts src/engine/objectives.ts
git commit -m "Cover all trigger types with idempotency tests"
```

---

## Task 5: Remaining completion types

**Files:**
- Modify: `src/engine/objectives.ts`
- Modify: `test/unit/objectives.test.ts`

**Goal:** Implement `enemy_defeated`, `visited_rooms_percent`, `used_items_in_room` completion types.

### - [ ] Step 1: Add failing tests

Append to `test/unit/objectives.test.ts`:

```typescript
describe('completion: enemy_defeated', () => {
  it('completes when the enemy is marked dead in any room', () => {
    const store = freshStore();
    const room = store.world!.rooms.manor_entry;
    room._dead_enemies = { cellar_shade: true };
    const fx: ObjectiveDef[] = [{
      id: 'hero_path',
      title: 'Hero',
      hint: 'Begin the fight.',
      trigger: { type: 'entered_room', room: 'manor_entry' },
      completion: { type: 'enemy_defeated', enemy: 'cellar_shade' },
      completion_text: 'Done.',
    }];
    notifyObjectiveEvent(store, { type: 'entered_room', room: 'manor_entry' }, fx);
    expect(store.player!.objectives.hero_path).toBe('complete');
  });
});

describe('completion: visited_rooms_percent', () => {
  it('completes when visited non-hidden non-dungeon rooms meet the threshold', () => {
    const store = freshStore();
    // freshStore() gives us the real story world. Visit 80% of non-hidden,
    // non-dungeon rooms by setting the visitedRooms map directly.
    const nonHidden = Object.keys(store.world!.rooms).filter(
      id => store.world!.rooms[id].region !== 'hidden' && !id.startsWith('dng_'),
    );
    const threshold = Math.ceil(nonHidden.length * 0.8);
    for (const id of nonHidden.slice(0, threshold)) {
      store.player!.visitedRooms[id] = true;
    }
    const fx: ObjectiveDef[] = [{
      id: 'long_road',
      title: 'Long Road',
      hint: '...',
      trigger: { type: 'entered_room', room: nonHidden[0] },
      completion: { type: 'visited_rooms_percent', percent: 80 },
      completion_text: '...',
    }];
    notifyObjectiveEvent(
      store,
      { type: 'entered_room', room: nonHidden[0] },
      fx,
    );
    expect(store.player!.objectives.long_road).toBe('complete');
  });

  it('does not complete below the threshold', () => {
    const store = freshStore();
    store.player!.visitedRooms = { manor_entry: true }; // only 1 room
    const fx: ObjectiveDef[] = [{
      id: 'long_road',
      title: 'Long Road',
      hint: '...',
      trigger: { type: 'entered_room', room: 'manor_entry' },
      completion: { type: 'visited_rooms_percent', percent: 80 },
      completion_text: '...',
    }];
    notifyObjectiveEvent(store, { type: 'entered_room', room: 'manor_entry' }, fx);
    expect(store.player!.objectives.long_road).toBe('active');
  });
});

describe('completion: used_items_in_room', () => {
  it('completes when all listed items were used in the given room', () => {
    const store = freshStore();
    store.player!.usedItemsInRoom = {
      hidden_diner: {
        red_mushroom: true,
        grey_mushroom: true,
        green_mushroom: true,
        orange_mushroom: true,
      },
    };
    const fx: ObjectiveDef[] = [{
      id: 'enlightened',
      title: 'Enlightened',
      hint: '...',
      trigger: { type: 'entered_room', room: 'hidden_diner' },
      completion: {
        type: 'used_items_in_room',
        room: 'hidden_diner',
        items: ['red_mushroom', 'grey_mushroom', 'green_mushroom', 'orange_mushroom'],
      },
      completion_text: '...',
    }];
    notifyObjectiveEvent(store, { type: 'entered_room', room: 'hidden_diner' }, fx);
    expect(store.player!.objectives.enlightened).toBe('complete');
  });
});
```

### - [ ] Step 2: Run the tests to verify they fail

Run: `npx vitest run test/unit/objectives.test.ts -t "completion:"`
Expected: the three new completion-type tests fail because only `key_items_collected` is implemented.

### - [ ] Step 3: Extend `isCompletionSatisfied` in `src/engine/objectives.ts`

Replace the `isCompletionSatisfied` function body with:

```typescript
export function isCompletionSatisfied(
  store: GameStore,
  completion: ObjectiveCompletion,
): boolean {
  if (!store.player) return false;
  const player = store.player;

  switch (completion.type) {
    case 'key_items_collected': {
      const items = completion.items ?? [];
      if (items.length === 0) return false;
      return items.every(
        id => player.keyItems[id] === true || (player.inventory[id] ?? 0) > 0,
      );
    }

    case 'enemy_defeated': {
      if (!completion.enemy || !store.world) return false;
      return Object.values(store.world.rooms).some(
        room => room._dead_enemies?.[completion.enemy!] === true,
      );
    }

    case 'visited_rooms_percent': {
      if (completion.percent === undefined || !store.world) return false;
      const nonHidden = Object.keys(store.world.rooms).filter(id => {
        const room = store.world!.rooms[id];
        return room.region !== 'hidden' && !id.startsWith('dng_');
      });
      if (nonHidden.length === 0) return false;
      const visitedNonHidden = nonHidden.filter(id => player.visitedRooms[id]);
      return visitedNonHidden.length / nonHidden.length >= completion.percent / 100;
    }

    case 'used_items_in_room': {
      if (!completion.room || !completion.items) return false;
      const used = player.usedItemsInRoom[completion.room];
      if (!used) return false;
      return completion.items.every(id => used[id] === true);
    }

    case 'objective_completed': {
      if (!completion.objective) return false;
      return player.objectives[completion.objective] === 'complete';
    }
  }
}
```

### - [ ] Step 4: Run the tests to verify they pass

Run: `npx vitest run test/unit/objectives.test.ts`
Expected: all tests pass.

### - [ ] Step 5: Run lint and full suite

Run: `npm run lint && npm test`
Expected: clean.

### - [ ] Step 6: Commit

```bash
git add src/engine/objectives.ts test/unit/objectives.test.ts
git commit -m "Add enemy_defeated, visited_rooms_percent, used_items_in_room completions"
```

---

## Task 6: Objective chaining

**Files:**
- Modify: `src/engine/objectives.ts`
- Modify: `test/unit/objectives.test.ts`

**Goal:** When an objective completes, objectives whose trigger is `objective_completed` matching the completed id should activate in the same call. Uses a fixed-point loop internally.

### - [ ] Step 1: Add a failing test

Append to `test/unit/objectives.test.ts`:

```typescript
describe('chaining', () => {
  it('activates a chained objective when its prerequisite completes', () => {
    const store = freshStore();
    store.player!.inventory = { red_mushroom: 1 };

    const fx: ObjectiveDef[] = [
      {
        id: 'first',
        title: 'First',
        hint: '...',
        trigger: { type: 'talked_to_npc', npc: 'whiskers' },
        completion: { type: 'key_items_collected', items: ['red_mushroom'] },
        completion_text: '...',
      },
      {
        id: 'second',
        title: 'Second',
        hint: '...',
        trigger: { type: 'objective_completed', objective: 'first' },
        completion: { type: 'key_items_collected', items: ['never'] },
        completion_text: '...',
      },
    ];

    notifyObjectiveEvent(store, { type: 'talked_to_npc', npc: 'whiskers' }, fx);

    expect(store.player!.objectives.first).toBe('complete');
    expect(store.player!.objectives.second).toBe('active');
  });

  it('chains across multiple hops in a single call', () => {
    const store = freshStore();
    store.player!.inventory = { red_mushroom: 1 };

    const fx: ObjectiveDef[] = [
      {
        id: 'a', title: 'A', hint: '...',
        trigger: { type: 'talked_to_npc', npc: 'whiskers' },
        completion: { type: 'key_items_collected', items: ['red_mushroom'] },
        completion_text: '...',
      },
      {
        id: 'b', title: 'B', hint: '...',
        trigger: { type: 'objective_completed', objective: 'a' },
        completion: { type: 'objective_completed', objective: 'a' },
        completion_text: '...',
      },
      {
        id: 'c', title: 'C', hint: '...',
        trigger: { type: 'objective_completed', objective: 'b' },
        completion: { type: 'objective_completed', objective: 'b' },
        completion_text: '...',
      },
    ];

    notifyObjectiveEvent(store, { type: 'talked_to_npc', npc: 'whiskers' }, fx);

    expect(store.player!.objectives.a).toBe('complete');
    expect(store.player!.objectives.b).toBe('complete');
    expect(store.player!.objectives.c).toBe('complete');
  });
});
```

### - [ ] Step 2: Run the tests to verify they fail

Run: `npx vitest run test/unit/objectives.test.ts -t "chaining"`
Expected: FAIL — `second` stays undefined because there's no chained activation.

### - [ ] Step 3: Implement chaining in `notifyObjectiveEvent`

Replace `notifyObjectiveEvent` in `src/engine/objectives.ts` with:

```typescript
export function notifyObjectiveEvent(
  store: GameStore,
  event: ObjectiveEvent,
  objectives: readonly ObjectiveDef[] = OBJECTIVES,
): void {
  if (!store.player) return;
  const player = store.player;

  const newlyActivated: ObjectiveDef[] = [];
  const newlyCompleted: ObjectiveDef[] = [];

  // Inner helper: activate any untriggered objectives whose trigger matches
  // the given event. Populates newlyActivated.
  const activate = (ev: AnyObjectiveEvent): void => {
    for (const obj of objectives) {
      if (player.objectives[obj.id] !== undefined) continue;
      if (triggerMatches(obj.trigger, ev)) {
        player.objectives[obj.id] = 'active';
        newlyActivated.push(obj);
      }
    }
  };

  // Inner helper: re-check completion for every active objective. Returns
  // the list of objectives that transitioned active → complete in this pass.
  const checkCompletions = (): ObjectiveDef[] => {
    const justCompleted: ObjectiveDef[] = [];
    for (const obj of objectives) {
      if (player.objectives[obj.id] !== 'active') continue;
      if (isCompletionSatisfied(store, obj.completion)) {
        player.objectives[obj.id] = 'complete';
        newlyCompleted.push(obj);
        justCompleted.push(obj);
      }
    }
    return justCompleted;
  };

  // Step 1: process the incoming event.
  activate(event);
  let pending = checkCompletions();

  // Step 2: fixed-point loop — each batch of newly-completed objectives may
  // fire an `objective_completed` internal event, which may activate more
  // objectives, which may complete, which may fire more events...
  const safety = 100;
  let iterations = 0;
  while (pending.length > 0 && iterations < safety) {
    iterations++;
    const next = pending;
    pending = [];
    for (const completed of next) {
      activate({ type: 'objective_completed', objective: completed.id });
    }
    pending = checkCompletions();
  }

  // Step 3: write notification lines. Activations first, then completions.
  for (const obj of newlyActivated) {
    addLine(store, `* New journal entry: ${obj.title}`, C.STAT_COLOR);
  }
  for (const obj of newlyCompleted) {
    addLine(store, `* Journal complete: ${obj.title}`, C.STAT_COLOR);
  }
}
```

### - [ ] Step 4: Run the tests to verify they pass

Run: `npx vitest run test/unit/objectives.test.ts`
Expected: all tests pass.

### - [ ] Step 5: Run lint and full suite

Run: `npm run lint && npm test`
Expected: clean.

### - [ ] Step 6: Commit

```bash
git add src/engine/objectives.ts test/unit/objectives.test.ts
git commit -m "Chain objectives via objective_completed trigger"
```

---

## Task 7: Write initial objectives content

**Files:**
- Modify: `src/data/objectives.json`

**Goal:** Populate the content file with the five v1 objectives (Hero, Diner, Map, Long Road, Crown). No TDD for pure content — but unit tests that load the real module (none do today) would break if shape is wrong, so the build step is our check.

### - [ ] Step 1: Replace `src/data/objectives.json` contents

```json
[
  {
    "id": "defeat_evil_king",
    "title": "The Hero's Path",
    "hint": "Something dark stirs beyond the darkness. A great evil waits.",
    "trigger": {
      "type": "defeated_enemy",
      "enemy": "cellar_shade"
    },
    "completion": {
      "type": "enemy_defeated",
      "enemy": "evil_king"
    },
    "completion_text": "The Evil King has fallen."
  },
  {
    "id": "the_diner_mystery",
    "title": "The Diner Mystery",
    "hint": "Sir Whiskers mentioned something about the diner needing ingredients.",
    "trigger": {
      "type": "talked_to_npc",
      "npc": "whiskers"
    },
    "completion": {
      "type": "key_items_collected",
      "items": ["red_mushroom", "grey_mushroom", "green_mushroom", "orange_mushroom"]
    },
    "completion_text": "You gathered all four strange mushrooms."
  },
  {
    "id": "find_ancient_map",
    "title": "The Ancient Map",
    "hint": "Wren hinted the map could be earned with enough experience.",
    "trigger": {
      "type": "talked_to_npc",
      "npc": "wren"
    },
    "completion": {
      "type": "key_items_collected",
      "items": ["ancient_map"]
    },
    "completion_text": "Wren gave you the Ancient Map."
  },
  {
    "id": "explore_the_world",
    "title": "The Long Road",
    "hint": "There is more to this world than the manor.",
    "trigger": {
      "type": "entered_room",
      "room": "wilds_forest_entrance"
    },
    "completion": {
      "type": "visited_rooms_percent",
      "percent": 80
    },
    "completion_text": "You have walked nearly every road in this land."
  },
  {
    "id": "the_crowns_temptation",
    "title": "The Crown's Temptation",
    "hint": "Something dark gleams at the heart of the stronghold.",
    "trigger": {
      "type": "entered_room",
      "room": "darkness_stronghold"
    },
    "completion": {
      "type": "key_items_collected",
      "items": ["dark_crown"]
    },
    "completion_text": "You hold the dark crown. The choice is yours."
  }
]
```

### - [ ] Step 2: Verify trigger/completion references against real content

Run a quick sanity check that the ids referenced exist in the game data:

```bash
grep -l '"wilds_forest_entrance"' src/data/regions/wilds.json
grep -l '"darkness_stronghold"' src/data/regions/darkness.json
grep -l '"cellar_shade"' src/data/enemies.json
grep -l '"evil_king"' src/data/enemies.json
grep -l '"dark_crown"' src/data/items.json
grep -l '"ancient_map"' src/data/items.json
grep -l '"red_mushroom"' src/data/items.json
```

Expected: each prints one matching file path.

If any `grep` returns nothing, the id in the objective JSON is wrong and must be fixed before committing. (Do not proceed until every id resolves.)

### - [ ] Step 3: Verify the NPC ids exist

```bash
grep -l '"whiskers"' src/data/npcs.json
grep -l '"wren"' src/data/npcs.json
```

Expected: both match.

### - [ ] Step 4: Run full build + lint + test

Run: `npm run build && npm run lint && npm test`
Expected: all clean. The build catches any JSON shape mismatch because `objectives.ts` imports the JSON and casts to `ObjectiveDef[]`.

### - [ ] Step 5: Commit

```bash
git add src/data/objectives.json
git commit -m "Add initial 5 objectives covering all 4 endings"
```

---

## Task 8: Save migration v2 → v3

**Files:**
- Modify: `src/engine/save.ts`
- Modify: `test/unit/save.test.ts`

**Goal:** Bump save format to v3. v3 saves include `objectives` and omit `journal_entries`. v2 saves load with empty objectives and their old journal_entries are dropped. v1 saves continue to load (via the existing v1→v2 path, then fall through to v2→v3).

### - [ ] Step 1: Read existing save.test.ts structure

Run: `cat test/unit/save.test.ts`

Look for the existing v1/v2 round-trip test. Get a feel for how it constructs save blobs.

### - [ ] Step 2: Add failing migration test

Append to `test/unit/save.test.ts`. Use the existing test file's style — match its imports and fixtures:

```typescript
import { describe, expect, it } from 'vitest';
// (if not already imported:)
import { loadFromSlot, saveToSlot } from '../../src/engine/save';
import { createPlayer } from '../../src/engine/player';
import { createStoryWorld } from '../../src/engine/world';

describe('save migration v2 → v3', () => {
  it('loads a v2 blob into an empty objectives map', () => {
    const v2Blob = JSON.stringify({
      version: 2,
      player: {
        hp: 30, max_hp: 30,
        attack: 5, defense: 2,
        level: 1, xp: 0,
        gold: 0,
        current_room: 'manor_entry',
        inventory: {},
        weapons: [],
        equipped_weapon: null,
        equipped_shield: null,
        key_items: {},
        visited_rooms: { manor_entry: true },
        searched_rooms: {},
        fired_events: {},
        used_items_in_room: {},
        buff_attack: 0,
        buff_rounds: 0,
        route_history: ['manor_entry'],
        journal_entries: [{ type: 'room', text: 'Entered Manor Entry', timestamp: 123 }],
        skill_points: 0,
        skills: {},
      },
      world_state: { rooms: {} },
    });

    // Store the blob where save.ts expects it, then load via the slot API.
    localStorage.setItem('mysticquest_save_1', v2Blob);

    const player = createPlayer();
    const world = createStoryWorld();
    const result = loadFromSlot(1, player, world);

    expect(result.success).toBe(true);
    expect(player.objectives).toEqual({});
    // The old journal_entries are discarded on migration — the field is
    // deleted in Task 12, so don't assert on it here.
  });

  it('round-trips v3 player state with objectives', () => {
    const player = createPlayer();
    player.objectives = { the_diner_mystery: 'active', defeat_evil_king: 'complete' };
    const world = createStoryWorld();
    saveToSlot(1, player, world);

    const loaded = createPlayer();
    const result = loadFromSlot(1, loaded, world);
    expect(result.success).toBe(true);
    expect(loaded.objectives).toEqual({
      the_diner_mystery: 'active',
      defeat_evil_king: 'complete',
    });
  });
});
```

### - [ ] Step 3: Run the test to verify it fails

Run: `npx vitest run test/unit/save.test.ts -t "v2 → v3"`
Expected: FAIL — `player.objectives` is undefined after load (save.ts doesn't touch it).

### - [ ] Step 4: Update `src/engine/save.ts`

Find the `SaveData` interface (around line 17) and add `objectives`, remove `journal_entries` (but keep `journal_entries?` as an optional back-compat field for reading v2 blobs):

```typescript
interface SaveData {
  version: number;
  player: {
    hp: number; max_hp: number;
    attack: number; defense: number;
    level: number; xp: number;
    gold?: number;
    current_room: string;
    inventory: Record<string, number>;
    weapons: string[];
    equipped_weapon: string | null;
    equipped_shield: string | null;
    key_items: Record<string, boolean>;
    visited_rooms: Record<string, boolean>;
    searched_rooms: Record<string, boolean>;
    fired_events: Record<string, boolean>;
    used_items_in_room: Record<string, Record<string, boolean>>;
    buff_attack: number;
    buff_rounds: number;
    route_history: string[];
    /** v1/v2 field, read-only on load. Writes use `objectives` instead. */
    journal_entries?: unknown;
    /** v3 field. */
    objectives?: Record<string, 'active' | 'complete'>;
    skill_points: number;
    skills: Record<string, boolean>;
  };
  // ... rest unchanged ...
}
```

Update `serialize` to write version 3 and `objectives`:

Find the `const data: SaveData = { version: 2, ...` block (around line 105) and change:

```typescript
  const data: SaveData = {
    version: 3,
    player: {
      hp: player.hp, max_hp: player.maxHp,
      attack: player.attack, defense: player.defense,
      level: player.level, xp: player.xp,
      gold: player.gold,
      current_room: player.currentRoom,
      inventory: player.inventory,
      weapons: player.weapons,
      equipped_weapon: player.equippedWeapon,
      equipped_shield: player.equippedShield,
      key_items: player.keyItems,
      visited_rooms: player.visitedRooms,
      searched_rooms: player.searchedRooms,
      fired_events: player.firedEvents,
      used_items_in_room: player.usedItemsInRoom,
      buff_attack: player.buffAttack,
      buff_rounds: player.buffRounds,
      route_history: player.routeHistory || [],
      objectives: player.objectives || {},
      skill_points: player.skillPoints,
      skills: player.skills,
    },
    world_state: { rooms },
  };
```

Note: `journal_entries` is removed from the write path. The field stays on `PlayerState` until Task 12.

Update `deserialize` to accept v1/v2/v3 and set `objectives`:

Find `if (!data || (data.version !== 1 && data.version !== 2)) return { success: false };` (around line 158) and change to:

```typescript
    if (!data || (data.version !== 1 && data.version !== 2 && data.version !== 3)) {
      return { success: false };
    }
```

Find the line `player.journalEntries = p.journal_entries || [];` (around line 180) and replace with:

```typescript
    // v2 and earlier have p.journal_entries which is discarded on load.
    // v3 has p.objectives.
    player.journalEntries = [];
    player.objectives = (p.objectives as Record<string, 'active' | 'complete'>) || {};
```

### - [ ] Step 5: Run the migration test to verify it passes

Run: `npx vitest run test/unit/save.test.ts -t "v2 → v3"`
Expected: both new tests pass.

### - [ ] Step 6: Run full suite + lint

Run: `npm run lint && npm test`
Expected: clean. Existing save tests continue to work because v2 blobs still load.

### - [ ] Step 7: Commit

```bash
git add src/engine/save.ts test/unit/save.test.ts
git commit -m "Bump save format to v3 with objectives field"
```

---

## Task 9: Handler integration — emit events from talk, take, search, combat, and enterRoom

**Files:**
- Modify: `src/engine/gameReducer.ts`
- Modify: `src/engine/handlers/talk.ts`
- Modify: `src/engine/handlers/take.ts`
- Modify: `src/engine/handlers/search.ts`
- Modify: `src/engine/state/combat.ts`

**Goal:** Wire the five event sources. Each handler imports `notifyObjectiveEvent` directly from `objectives.ts` (no `Deps` injection). `addJournal` calls are kept in place for this task — they're removed wholesale in Task 12.

**No unit test is written for this task.** The pure module's behavior is already covered by Tasks 2–6's unit tests, and end-to-end integration is covered by Task 11's scenario test. This task is pure wiring — the Step 7 build + full-suite run is how we verify the wiring doesn't break anything.

### - [ ] Step 1: Wire `enterRoom` in `src/engine/gameReducer.ts`

At the top of the file, add the import:

```typescript
import { notifyObjectiveEvent } from './objectives';
```

Find `enterRoom` (around line 52) and add the objective call after `visitRoom(store.player, roomId)`:

```typescript
  store.player.currentRoom = roomId;
  visitRoom(store.player, roomId);
  store.player.routeHistory.push(roomId);
  addJournal(store, 'room', `Entered ${room.name}`);
  notifyObjectiveEvent(store, { type: 'entered_room', room: roomId });
  displayRoom(store, roomId);
```

### - [ ] Step 2: Wire `handleTalk` in `src/engine/handlers/talk.ts`

Add at the top:

```typescript
import { notifyObjectiveEvent } from '../objectives';
```

In `handleTalk`, find the line `store.player.firedEvents[`talked_${npcId}`] = true;` (around line 59) and add immediately after:

```typescript
  store.player.firedEvents[`talked_${npcId}`] = true;
  notifyObjectiveEvent(store, { type: 'talked_to_npc', npc: npcId });
```

### - [ ] Step 3: Wire `handleTake` in `src/engine/handlers/take.ts`

Add at the top:

```typescript
import { notifyObjectiveEvent } from '../objectives';
```

In `takeWeapon` (around line 44), add after `addJournal`:

```typescript
  const takeWeapon = (weaponId: string): void => {
    removeFromRoom(room, weaponId);
    addWeapon(player, weaponId);
    addLine(store, `You pick up the ${weaponData[weaponId].name}.`, C.ITEM_COLOR);
    addJournal('item', `Found ${weaponData[weaponId].name}`);
    notifyObjectiveEvent(store, { type: 'took_item', item: weaponId });
    emitSound(store, 'pickup');
    // ... rest unchanged
  };
```

In `takeItem` (around line 58), add after `addJournal`:

```typescript
  const takeItem = (itemId: string): void => {
    removeFromRoom(room, itemId);
    addItem(player, itemId, itemData);
    addLine(store, `You pick up the ${itemData[itemId].name}.`, C.ITEM_COLOR);
    addJournal('item', `Found ${itemData[itemId].name}`);
    notifyObjectiveEvent(store, { type: 'took_item', item: itemId });
    emitSound(store, 'pickup');
    // ... rest unchanged
  };
```

### - [ ] Step 4: Wire `handleSearch` in `src/engine/handlers/search.ts`

Add at the top:

```typescript
import { notifyObjectiveEvent } from '../objectives';
```

Find the line `store.player.searchedRooms[store.player.currentRoom] = true;` (around line 24) and add after:

```typescript
  store.player.searchedRooms[store.player.currentRoom] = true;
  notifyObjectiveEvent(store, { type: 'searched_room', room: store.player.currentRoom });
```

### - [ ] Step 5: Wire combat victory in `src/engine/state/combat.ts`

Add at the top:

```typescript
import { notifyObjectiveEvent } from '../objectives';
```

Find the `markEnemyDead` call inside the victory branch (around line 110) and add after:

```typescript
      markEnemyDead(store.world, store.player.currentRoom, defeatedEnemyId);
      deps.addJournal('combat', `Defeated ${store.combat.enemy.name}`);
      notifyObjectiveEvent(store, { type: 'defeated_enemy', enemy: defeatedEnemyId });
```

### - [ ] Step 6: Run the build + full test suite

Run: `npm run build && npm run lint && npm test`
Expected: all clean. Existing tests unaffected because objectives are empty by default on a fresh store; events fire but activate nothing.

### - [ ] Step 7: Commit

```bash
git add src/engine/gameReducer.ts src/engine/handlers/talk.ts src/engine/handlers/take.ts src/engine/handlers/search.ts src/engine/state/combat.ts
git commit -m "Emit objective events from talk, take, search, combat, enterRoom"
```

---

## Task 10: Rewrite `showJournal` to render objectives

**Files:**
- Modify: `src/engine/handlers/info.ts`
- Modify: `test/unit/info.test.ts`

**Goal:** Replace the chronological event dump with the active/complete rendering from the spec.

### - [ ] Step 1: Add failing test

Read the existing `test/unit/info.test.ts` first to match its style. Then add:

```typescript
import { OBJECTIVES } from '../../src/engine/objectives';

describe('showJournal', () => {
  it('renders empty state when no objectives are active', () => {
    const store = freshStore();
    store.lines = [];
    showJournal(store);
    const text = store.lines.map(l => l.text).join('\n');
    expect(text).toContain('=== Journal ===');
    expect(text).toContain('(no entries yet — explore the world)');
  });

  it('renders active objectives with [ ] prefix and hint line', () => {
    const store = freshStore();
    store.lines = [];
    store.player!.objectives = { the_diner_mystery: 'active' };
    showJournal(store);
    const text = store.lines.map(l => l.text).join('\n');
    expect(text).toMatch(/\[ \] The Diner Mystery/);
    expect(text).toContain('Sir Whiskers mentioned something about the diner');
  });

  it('renders completed objectives with [X] prefix and completion_text', () => {
    const store = freshStore();
    store.lines = [];
    store.player!.objectives = { defeat_evil_king: 'complete' };
    showJournal(store);
    const text = store.lines.map(l => l.text).join('\n');
    expect(text).toMatch(/\[X\] The Hero's Path/);
    expect(text).toContain('The Evil King has fallen.');
  });

  it('renders active objectives above completed ones', () => {
    const store = freshStore();
    store.lines = [];
    store.player!.objectives = {
      defeat_evil_king: 'complete',
      the_diner_mystery: 'active',
    };
    showJournal(store);
    const lines = store.lines.map(l => l.text);
    const activeIdx = lines.findIndex(l => l.includes('[ ] The Diner Mystery'));
    const completeIdx = lines.findIndex(l => l.includes("[X] The Hero's Path"));
    expect(activeIdx).toBeGreaterThan(-1);
    expect(completeIdx).toBeGreaterThan(-1);
    expect(activeIdx).toBeLessThan(completeIdx);
  });
});
```

### - [ ] Step 2: Run the test to verify it fails

Run: `npx vitest run test/unit/info.test.ts -t "showJournal"`
Expected: FAIL — the current `showJournal` renders chronological entries, not objectives.

### - [ ] Step 3: Rewrite `showJournal` in `src/engine/handlers/info.ts`

Add imports at the top:

```typescript
import { OBJECTIVES } from '../objectives';
```

Replace the existing `showJournal` function (around line 126) with:

```typescript
export function showJournal(store: GameStore): void {
  if (!store.player) return;
  addLine(store, '');
  addLine(store, '=== Journal ===', C.STAT_COLOR);

  const active: typeof OBJECTIVES = [];
  const complete: typeof OBJECTIVES = [];
  for (const obj of OBJECTIVES) {
    const status = store.player.objectives[obj.id];
    if (status === 'active') active.push(obj);
    else if (status === 'complete') complete.push(obj);
  }

  if (active.length === 0 && complete.length === 0) {
    addLine(store, '  (no entries yet — explore the world)', C.HELP_COLOR);
    return;
  }

  for (const obj of active) {
    addLine(store, '');
    addLine(store, `[ ] ${obj.title}`, C.CHOICE_COLOR);
    addLine(store, `    ${obj.hint}`, C.CHOICE_COLOR);
  }

  for (const obj of complete) {
    addLine(store, '');
    addLine(store, `[X] ${obj.title}`, C.HELP_COLOR);
    addLine(store, `    ${obj.completion_text}`, C.HELP_COLOR);
  }
}
```

### - [ ] Step 4: Run the tests to verify they pass

Run: `npx vitest run test/unit/info.test.ts -t "showJournal"`
Expected: all 4 new tests pass.

### - [ ] Step 5: Delete the old "renders journal entries" test if present

Open `test/unit/info.test.ts` and look for the existing test that renders the chronological journal (it references `player.journalEntries = [{...}]`). Delete the entire `it(...)` block — the replacement is the 4 new tests added in Step 1.

### - [ ] Step 6: Run full suite + lint

Run: `npm run lint && npm test`
Expected: clean. If `test/unit/info.test.ts` still fails due to a leftover `journalEntries` reference, delete that line too.

### - [ ] Step 7: Commit

```bash
git add src/engine/handlers/info.ts test/unit/info.test.ts
git commit -m "Rewrite showJournal to render objectives"
```

---

## Task 11: End-to-end scenario test for the Enlightened path

**Files:**
- Create: `test/scenario/journal-enlightened.test.ts`

**Goal:** Drive the reducer with a realistic sequence of commands to verify the full integration works: the Enlightened objective triggers when the player talks to Sir Whiskers, and completes when the player holds all four mushrooms.

### - [ ] Step 1: Read an existing scenario test for the pattern

Run: `cat test/scenario/new-game.test.ts`

Look at how the test creates a store, dispatches text commands, and asserts on store state. Match that style.

### - [ ] Step 2: Create the scenario test

Create `test/scenario/journal-enlightened.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { createInitialStore, gameReducer } from '../../src/engine/gameReducer';

/**
 * Scenario: the player picks up all four mushrooms, talks to Sir Whiskers,
 * and sees the Enlightened objective ("The Diner Mystery") flip directly from
 * untriggered → active → complete in a single call. The Whiskers trigger
 * fires AFTER the mushrooms are in inventory, proving reverse-order discovery
 * works through the full reducer stack.
 */
describe('scenario: the_diner_mystery end-to-end', () => {
  it('activates and completes in one talk after mushrooms are collected', () => {
    const store = createInitialStore();
    // Menu → New Game
    gameReducer(store, { type: 'KEY_PRESSED', key: 'Enter' });
    expect(store.state).toBe('slot_picker');
    // Select slot 1
    gameReducer(store, { type: 'KEY_PRESSED', key: 'Enter' });
    expect(store.state).toBe('exploring');

    // Fabricate post-exploration state: place player in hidden_diner with all
    // four mushrooms. Skipping the actual travel path keeps this test fast
    // and hermetic — the per-command wiring is covered by Task 9's unit tests.
    store.player!.currentRoom = 'hidden_diner';
    store.player!.inventory = {
      red_mushroom: 1,
      grey_mushroom: 1,
      green_mushroom: 1,
      orange_mushroom: 1,
    };
    // Pretend the hidden diner room has Sir Whiskers in it (the real room
    // does — we're just skipping the travel).

    // Confirm the objective is not yet active.
    expect(store.player!.objectives.the_diner_mystery).toBeUndefined();

    // Dispatch `talk whiskers`. The store's text-input path will parse it
    // and drive handleTalk, which will fire the objective event.
    const commandChars = 'talk whiskers'.split('');
    for (const char of commandChars) {
      gameReducer(store, { type: 'TEXT_INPUT', text: char });
    }
    gameReducer(store, { type: 'KEY_PRESSED', key: 'Enter' });

    // After talk fires the talked_to_npc event, reverse-order discovery should
    // flip the objective from untriggered → active → complete in one call.
    expect(store.player!.objectives.the_diner_mystery).toBe('complete');

    // Verify both notification lines were written in the correct order.
    const texts = store.lines.map(l => l.text);
    const newEntryIdx = texts.findIndex(t => t === '* New journal entry: The Diner Mystery');
    const completeIdx = texts.findIndex(t => t === '* Journal complete: The Diner Mystery');
    expect(newEntryIdx).toBeGreaterThan(-1);
    expect(completeIdx).toBeGreaterThan(newEntryIdx);
  });
});
```

### - [ ] Step 3: Run the scenario test

Run: `npx vitest run test/scenario/journal-enlightened.test.ts`
Expected: PASS.

**Troubleshooting:** If the test fails because `talk whiskers` doesn't fire `handleTalk` (e.g., hidden_diner isn't populated with npcs in your fabricated state), adjust the fabrication to set `store.world!.rooms.hidden_diner.npcs = ['whiskers'];` before dispatching the command. Read `src/data/regions/hidden.json` to confirm the current room shape.

### - [ ] Step 4: Run full suite + lint

Run: `npm run lint && npm test`
Expected: clean.

### - [ ] Step 5: Commit

```bash
git add test/scenario/journal-enlightened.test.ts
git commit -m "Add scenario test for Enlightened objective reverse-order completion"
```

---

## Task 12: Remove legacy journal system

**Files:**
- Modify: `src/engine/types.ts` (delete `JournalEntry`, remove `journalEntries` from `PlayerState`)
- Modify: `src/engine/player.ts` (remove `journalEntries` init)
- Modify: `src/engine/gameReducer.ts` (delete `addJournal` helper, remove from Deps builders)
- Modify: `src/engine/save.ts` (remove `journalEntries = []` assignment on load, remove `journal_entries?` from SaveData)
- Modify: `src/engine/state/exploring.ts` (drop `addJournal` from `ExploringDeps`)
- Modify: `src/engine/state/combat.ts` (drop `addJournal` from `CombatDeps`)
- Modify: `src/engine/handlers/take.ts` (drop `addJournal` parameter)
- Modify: `test/unit/info.test.ts` (remove any lingering `journalEntries` fixture setup)
- Modify: `test/unit/save.test.ts` (remove `journal_entries` fields from test fixtures)
- Modify: `test/unit/minimap.test.ts` (remove `journalEntries: []` from player fixture)

**Goal:** Delete the legacy journal system in one sweep. This is an intentional "big cleanup" task — keeping both systems side-by-side any longer would entangle future work.

### - [ ] Step 1: Delete `JournalEntry` type and field

In `src/engine/types.ts`:

1. Delete the `JournalEntry` interface (around line 3).
2. Remove `journalEntries: JournalEntry[];` from `PlayerState`.

### - [ ] Step 2: Update `createPlayer`

In `src/engine/player.ts`, remove the `journalEntries: [],` line.

### - [ ] Step 3: Delete `addJournal` and update Deps

In `src/engine/gameReducer.ts`:

1. Delete the `addJournal` helper function (around line 47-50).
2. Delete `addJournal(store, 'room', ...)` call in `enterRoom` (around line 79).
3. Delete `addJournal(store, 'story', ...)` call in `startEnding` (around line 151).
4. Delete the `addJournal` field from `buildCombatDeps` (around line 224).
5. Delete the `addJournal` field from `buildExploringDeps` (around line 261).
6. Remove `JournalEntry` from the type import at the top of the file.

### - [ ] Step 4: Drop `addJournal` from Deps interfaces

In `src/engine/state/exploring.ts`:

1. Delete `addJournal: ...` from `ExploringDeps` interface (around line 23).
2. In the `handleTake` call (around line 65), remove the `addJournal` argument. Inline version:

```typescript
  } else if (verb === 'take') {
    handleTake(
      store,
      target,
      deps.itemData,
      deps.weaponData,
      deps.checkItemAchievements,
      deps.refreshHeader,
    );
  }
```

In `src/engine/state/combat.ts`:

1. Delete `addJournal: (type: 'combat', text: string) => void;` from `CombatDeps` (around line 17).
2. Delete the `deps.addJournal('combat', ...)` call (around line 111).

### - [ ] Step 5: Update `handleTake` signature

In `src/engine/handlers/take.ts`:

1. Remove the `addJournal` parameter from the function signature (around line 28).
2. Remove both `addJournal('item', ...)` calls inside `takeWeapon` and `takeItem`.

### - [ ] Step 6: Remove journal_entries from save.ts

In `src/engine/save.ts`:

1. Remove the `journal_entries?: unknown;` field from `SaveData.player` (added in Task 8). The field is no longer readable — v2 blobs still load but their journal_entries are silently ignored because we don't reference the field.
2. Remove the `player.journalEntries = [];` line added in Task 8 (the field no longer exists on `PlayerState`).
3. Remove `JournalEntry` from the import at the top of the file.

### - [ ] Step 7: Clean up test fixtures

`test/unit/info.test.ts` — search for `journalEntries` and delete any line that references it. If the original "renders journal entries" test from the old chronological journal still exists, delete it (it was replaced by Task 10's new tests).

`test/unit/save.test.ts` — search for `journal_entries` and `journalEntries`. Remove them from any test fixtures. Keep the Task 8 migration test intact.

`test/unit/minimap.test.ts` — in the `makePlayer` helper (around line 49), remove `journalEntries: [],`. The `objectives: {},` field was already added during Task 1 Step 6, so no further edit is needed beyond deletion.

### - [ ] Step 8: Run the build

Run: `npm run build`
Expected: TypeScript catches every remaining reference to `journalEntries`, `JournalEntry`, or `addJournal`. Fix each error by deleting the offending line. When the build is clean, move on.

### - [ ] Step 9: Run the full test suite

Run: `npm run lint && npm test`
Expected: all clean.

### - [ ] Step 10: Commit

```bash
git add -u src/engine test/unit
git commit -m "Remove legacy chronological journal system"
```

---

## Task 13: Documentation — README, JSDoc, CLAUDE.md

**Files:**
- Create: `src/data/README.md`
- Modify: `CLAUDE.md`

**Goal:** Ship the documentation deliverables promised in the spec. The JSDoc was already written on the types in Task 1 Step 2, so this task covers the README and CLAUDE.md updates.

### - [ ] Step 1: Create `src/data/README.md`

```markdown
# MysticQuest content files

All game content is authored in this directory as static JSON. The engine loads the files at import time and casts them to TypeScript types defined in `src/engine/types.ts`. There is no schema validation — if a field name is wrong, the build will fail (for imports) or the game will silently ignore the content (for optional fields).

## Files

| File                       | Type contract          | Notes                                               |
| -------------------------- | ---------------------- | --------------------------------------------------- |
| `regions/*.json`           | `RegionData`           | Room graph per region. Edit rooms, enemies, items.  |
| `enemies.json`             | `Record<string, EnemyDef>` | Enemy stats, loot, descriptions.                |
| `weapons.json`             | `Record<string, WeaponDef>` | Weapon stats, match words.                     |
| `items.json`               | `Record<string, ItemDef>`   | Consumables, shields, key items.               |
| `npcs.json`                | `Record<string, NpcDef>`    | Dialogue trees and effects.                    |
| `shops.json`               | `Record<string, ShopDef>`   | Shop stock.                                     |
| `endings.json`             | `Record<string, EndingDef>` | Ending text and trigger conditions.            |
| `objectives.json`          | `ObjectiveDef[]`       | Journal / quest tracker (see below).                |

## objectives.json

Each entry is a hand-authored journal objective. Objectives are hidden from the player until their `trigger` fires in-game, then shown as active with the `hint` text. When the `completion` condition is met, the objective flips to complete and the `completion_text` is shown.

### Schema

```json
{
  "id": "stable_identifier",
  "title": "Short display name",
  "hint": "One-sentence description shown while the objective is active.",
  "trigger": { "type": "...", "...": "..." },
  "completion": { "type": "...", "...": "..." },
  "completion_text": "One-sentence line shown when the objective completes."
}
```

### Trigger types

| Type                 | Required field | Fires when                                   |
| -------------------- | -------------- | -------------------------------------------- |
| `talked_to_npc`      | `npc`          | The player talks to the named NPC            |
| `entered_room`       | `room`         | The player enters the named room             |
| `searched_room`      | `room`         | The player successfully searches the room    |
| `took_item`          | `item`         | The player picks up the named item or weapon |
| `defeated_enemy`     | `enemy`        | The player wins combat against the enemy    |
| `objective_completed`| `objective`    | Another objective (by id) becomes complete   |

Triggers fire exactly once. Once an objective is activated, re-triggering is a no-op.

### Completion types

| Type                    | Required fields   | Complete when                                                       |
| ----------------------- | ----------------- | ------------------------------------------------------------------- |
| `key_items_collected`   | `items[]`         | All listed ids are present in `keyItems` OR `inventory`             |
| `enemy_defeated`        | `enemy`           | Any room's `_dead_enemies` contains the enemy id                    |
| `visited_rooms_percent` | `percent`         | Visited non-hidden, non-dungeon rooms ≥ `percent` × non-hidden total |
| `used_items_in_room`    | `room`, `items[]` | All listed items appear in `usedItemsInRoom[room]`                  |
| `objective_completed`   | `objective`       | Another objective (by id) is in `complete` state                    |

Completion is re-checked after every trigger fires. If a completion condition is already satisfied at trigger time, the objective transitions untriggered → active → complete in a single call and both notification lines fire in order.

### Chaining

An objective whose `trigger` is `objective_completed` will activate (and possibly immediately complete) when the named objective finishes. The engine processes chains in a fixed-point loop up to 100 iterations of recursive activation.

### Examples

Simple item-collection:

```json
{
  "id": "find_ancient_map",
  "title": "The Ancient Map",
  "hint": "Wren hinted the map could be earned with enough experience.",
  "trigger": { "type": "talked_to_npc", "npc": "wren" },
  "completion": { "type": "key_items_collected", "items": ["ancient_map"] },
  "completion_text": "Wren gave you the Ancient Map."
}
```

Chained:

```json
{
  "id": "post_boss_loot",
  "title": "Spoils of Victory",
  "hint": "Return to the manor to claim what is yours.",
  "trigger": { "type": "objective_completed", "objective": "defeat_evil_king" },
  "completion": { "type": "entered_room", "room": "manor_entry" },
  "completion_text": "You have claimed your reward."
}
```
```

### - [ ] Step 2: Update `CLAUDE.md`

In `CLAUDE.md`, find the "Architecture" section's file reference list (around the line that describes `src/engine/` modules). Add this entry in alphabetical order:

```markdown
objectives.ts           Journal/quest tracker. Loads src/data/objectives.json,
                        tracks activation and completion via notifyObjectiveEvent,
                        writes inline notification lines to the terminal.
```

Also add a "Journal / objectives" bullet under Architecture, after the "Game data" section:

```markdown
### Journal / objectives

The `journal` command shows hand-authored quest-style objectives defined in `src/data/objectives.json`. Objectives are hidden until their trigger fires in-game (e.g., talking to an NPC, entering a room). See `src/data/README.md` for the schema and trigger/completion type reference. Integration points: `gameReducer.ts::enterRoom`, `handlers/talk.ts`, `handlers/take.ts`, `handlers/search.ts`, and `state/combat.ts` all call `notifyObjectiveEvent` after mutating relevant state.
```

### - [ ] Step 3: Run the full suite one more time

Run: `npm run build && npm run lint && npm test`
Expected: all clean.

### - [ ] Step 4: Commit

```bash
git add src/data/README.md CLAUDE.md
git commit -m "Document the objective tracker for content authors"
```

---

## Verification Checklist

After all tasks are complete, run these and confirm:

- [ ] `npm run build` — zero TypeScript errors
- [ ] `npm run lint` — zero lint warnings
- [ ] `npm test` — all tests pass
- [ ] `grep -r 'journalEntries' src test` — returns nothing (except maybe in a commit message or docs)
- [ ] `grep -r 'addJournal' src test` — returns nothing
- [ ] `grep -r 'JournalEntry' src test` — returns nothing
- [ ] Manually load a pre-existing v2 save (if you have one in localStorage) — it should load cleanly with an empty journal
- [ ] Manually play: start a new game, type `journal` before doing anything — see the empty state message. Talk to Dusty in the manor. Type `journal` — still empty (Dusty isn't an objective-trigger). Walk to wilds_forest_entrance. Type `journal` — see "The Long Road" active. Continue playing and verify the other objectives activate as expected.

## Self-Review Notes

**Spec coverage check:**
- ✅ Data model: types (Task 1), JSON (Tasks 1, 7), player state (Task 1)
- ✅ Trigger reference: JSDoc in types.ts (Task 1), README (Task 13)
- ✅ Completion reference: JSDoc in types.ts (Task 1), README (Task 13)
- ✅ Engine module: Tasks 2-6
- ✅ Integration points: Task 9
- ✅ UI rewrite: Task 10
- ✅ Save migration: Task 8
- ✅ Initial content: Task 7
- ✅ Test plan: Tasks 2-6 (unit), Task 11 (scenario), Task 8 (save migration test)
- ✅ Legacy cleanup: Task 12
- ✅ Documentation: Task 13 (README + CLAUDE.md); JSDoc in Task 1

**Type consistency check:**
- `ObjectiveStatus` = `'active' | 'complete'` — used consistently from Task 1 onward.
- `PlayerState.objectives` is `Record<string, ObjectiveStatus>` — used consistently.
- `notifyObjectiveEvent(store, event, objectives?)` signature is stable across Tasks 2, 3, 4, 5, 6.
- `OBJECTIVES` exported as `readonly ObjectiveDef[]` from Task 2 onward.

**YAGNI items dropped:**
- No `flag_set` completion type. Revisit when a real objective needs it.
- No grouping/categories in `showJournal`. Five objectives don't need it.
- No notification aggregation. Revisit after playing if spam is a real problem.
- No backfilling objectives from save-state replay. v2 loads with empty journal.
