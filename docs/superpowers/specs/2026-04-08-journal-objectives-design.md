# Journal / Objective Tracker — Design Spec

**Date:** 2026-04-08
**Branch target:** a new feature branch off `main`
**Status:** Draft — pending user approval

## Motivation

Two of MysticQuest's four endings are essentially undiscoverable without external note-taking:

- **The Wanderer** — requires visiting ~80% of non-hidden rooms AND possessing the Ancient Map. The Ancient Map is earned by talking to Wren at player level ≥ 3. Neither the percentage threshold nor the map-from-Wren path is signposted anywhere in-game.
- **The Enlightened** — requires using all four magic mushrooms inside the Hidden Diner. Players discover mushrooms only by finding the secret Hidden region, and the "bring them to the diner" connection is buried in a single NPC conversation with Sir Whiskers.

The existing `journal` command is a chronological event log ("[3:45 PM] Defeated Forest Wolf") capped at the last 20 entries. It's auto-populated on room enter, item pickup, and combat kills. It's noise, not navigation — players don't use it to figure out what to do next.

**Goal:** Replace the chronological event log with a hand-authored objective tracker that surfaces hidden content paths as the player discovers them, without spoiling the initial mystery of the game.

## Design Principles

1. **Discovery first.** Objectives are hidden until the player triggers them in-game. A freshly-started journal is empty. The player earns each entry.
2. **Hand-authored, not derived.** Objectives live in `src/data/objectives.json`. Trying to auto-extract objectives from NPC dialogue would produce vague mush; hand-authored text is tight and specific.
3. **Small vocabulary of triggers.** Just enough trigger and completion types to express the four endings plus 2-3 flavor side quests. Every type maps to state the engine already tracks.
4. **Flat, skimmable UI.** No grouping, no counts, no pagination. Active entries first, completed entries below. ASCII brackets, no unicode decorations.
5. **One state machine, no flags.** Objectives are always in one of three states: untriggered (invisible), active, complete. No per-objective visibility flags.

## Non-Goals

- **Not a Steam-style achievement system.** Achievements already exist (`achievements.ts`) and are global/cross-save. Objectives are per-save and narrative.
- **Not a general quest engine.** This supports ~10 hand-authored objectives in a single file. If the game ever needs 100+ objectives with chain dependencies and variable scope, we'll revisit.
- **No objective chains in v1.** The schema has an `objective_completed` trigger that allows chaining, but we will not ship any chained objectives in the initial content. The capability exists for future use.
- **No journal search / filter.** With under a dozen entries, a search box would cost more to build than it saves.
- **Not backfilling retroactive triggers from save-state replay.** Existing in-progress saves start with an empty journal on load (see Save Migration below).

## Data Model

### Objective (content, in `src/data/objectives.json`)

```json
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
    "items": ["mushroom_red", "mushroom_grey", "mushroom_green", "mushroom_orange"]
  },
  "completion_text": "You gathered all four strange mushrooms."
}
```

### TypeScript types (in `src/engine/types.ts`)

```typescript
/**
 * An objective lives in one of three states: untriggered (not in player state
 * at all), 'active' (trigger fired, completion not yet met), or 'complete'.
 *
 * Completion is a pure function of store state — when any trigger fires, the
 * engine re-checks all active objectives against current state, so an objective
 * that is triggered after its completion conditions are already satisfied
 * will flip straight from untriggered → complete.
 */
export type ObjectiveStatus = 'active' | 'complete';

export interface ObjectiveTrigger {
  type:
    | 'talked_to_npc'     // { npc: string }
    | 'entered_room'      // { room: string }
    | 'searched_room'     // { room: string }
    | 'took_item'         // { item: string }
    | 'defeated_enemy'    // { enemy: string }
    | 'objective_completed'; // { objective: string }
  npc?: string;
  room?: string;
  item?: string;
  enemy?: string;
  objective?: string;
}

export interface ObjectiveCompletion {
  type:
    | 'key_items_collected'   // { items: string[] } — has ALL
    | 'enemy_defeated'        // { enemy: string }
    | 'visited_rooms_percent' // { percent: number } — non-hidden rooms
    | 'used_items_in_room'    // { room: string, items: string[] }
    | 'objective_completed';  // { objective: string }
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

### Player state (in `PlayerState`)

Replace the existing `journalEntries: JournalEntry[]` field with:

```typescript
/** Map from objective id to its current status. Untriggered objectives are not in the map. */
objectives: Record<string, ObjectiveStatus>;
```

The old `JournalEntry` type and the `addJournal` reducer helper are deleted.

## Trigger Type Reference

This section is the authoritative reference for JSON authors. A corresponding JSDoc block lives on the `ObjectiveTrigger` type in `src/engine/types.ts` so IDE hover shows the same information.

| Type                  | Fields     | Fires when…                                                      | State source                    |
| --------------------- | ---------- | ---------------------------------------------------------------- | ------------------------------- |
| `talked_to_npc`       | `npc`      | The player talks to the named NPC for the first time            | `player.firedEvents[talked_<npc>]` |
| `entered_room`        | `room`     | The player enters the named room for the first time            | `player.visitedRooms[room]`     |
| `searched_room`       | `room`     | The player searches the named room                              | `player.searchedRooms[room]`    |
| `took_item`           | `item`     | The player picks up the named item or weapon                    | fires on `take` handler         |
| `defeated_enemy`      | `enemy`    | The player wins a combat against the named enemy                | `room._dead_enemies[enemy]`     |
| `objective_completed` | `objective`| Another objective (by id) transitions to `complete`              | internal                        |

**All triggers fire exactly once.** Once an objective is activated it stays in `active` (or `complete`) forever; re-triggering is a no-op.

## Completion Type Reference

| Type                    | Fields             | Complete when…                                                        |
| ----------------------- | ------------------ | --------------------------------------------------------------------- |
| `key_items_collected`   | `items[]`          | All listed item ids are in `player.keyItems` OR `player.inventory`    |
| `enemy_defeated`        | `enemy`            | Any room's `_dead_enemies` contains the enemy id                      |
| `visited_rooms_percent` | `percent`          | Count of visited non-hidden rooms ≥ percent × non-hidden room total   |
| `used_items_in_room`    | `room`, `items[]`  | All listed items appear in `player.usedItemsInRoom[room]`             |
| `objective_completed`   | `objective`        | Another objective (by id) is in `complete` state                      |

**Completion is re-checked every time any trigger fires.** This is cheap (object scan across ≤10 objectives) and handles the "player discovered objective backwards" edge case: if the completion conditions are already satisfied at trigger time, the objective goes straight from untriggered → complete in one step, and both notifications fire inline.

## Engine Architecture

### New module: `src/engine/objectives.ts`

Pure functions, no imports from `react` or `gameReducer`.

```typescript
import objectiveData from '../data/objectives.json';
import type { GameStore, ObjectiveDef, ObjectiveCompletion } from './types';

export const OBJECTIVES: readonly ObjectiveDef[] = objectiveData as ObjectiveDef[];

/**
 * Events emitted from handlers. The union matches the external trigger types
 * exactly. Chained objectives (triggers of type `objective_completed`) are
 * handled internally via recursion inside notifyObjectiveEvent — they are NOT
 * part of this public event type, so handlers never have to think about them.
 */
export type ObjectiveEvent =
  | { type: 'talked_to_npc'; npc: string }
  | { type: 'entered_room'; room: string }
  | { type: 'searched_room'; room: string }
  | { type: 'took_item'; item: string }
  | { type: 'defeated_enemy'; enemy: string };

/**
 * Called from handlers whenever an objective-relevant event occurs.
 * Walks all objectives and:
 *   1. Activates untriggered ones whose trigger matches the incoming event.
 *   2. Re-checks completion for all active objectives (including freshly-activated).
 *   3. For each objective that newly completes, recursively checks any
 *      objectives with `objective_completed` triggers to activate them,
 *      then re-checks their completion, until a fixed point is reached.
 * Returns { activated: ObjectiveDef[], completed: ObjectiveDef[] } in the
 * order the transitions happened, so the caller can print notifications.
 */
export function notifyObjectiveEvent(
  store: GameStore,
  event: ObjectiveEvent,
): { activated: ObjectiveDef[]; completed: ObjectiveDef[] };

/** Pure check: does the current store state satisfy this objective's completion? */
export function isCompletionSatisfied(
  store: GameStore,
  completion: ObjectiveCompletion,
): boolean;
```

### Integration points (where `notifyObjectiveEvent` gets called)

These are the only places that need edits to emit events. All of them already exist and already mutate the matching state:

| File                             | Emit                                          |
| -------------------------------- | --------------------------------------------- |
| `gameReducer.ts` `enterRoom`     | `{ type: 'entered_room', room }`              |
| `handlers/talk.ts`               | `{ type: 'talked_to_npc', npc }`              |
| `handlers/take.ts`               | `{ type: 'took_item', item }` (per item)      |
| `handlers/search.ts`             | `{ type: 'searched_room', room }`             |
| `state/combat.ts` (victory path) | `{ type: 'defeated_enemy', enemy }`           |

The dispatch pattern mirrors the existing `Deps` injection: `notifyObjectiveEvent` becomes a dep passed via `buildExploringDeps`, `buildCombatDeps`, etc. so handlers stay pure.

### Notifications

When `notifyObjectiveEvent` returns a non-empty `activated` or `completed` list, `gameReducer.ts` writes terminal lines inline:

```
* New journal entry: The Diner Mystery
```
```
* Journal complete: The Diner Mystery
```

Both use `STAT_COLOR` (matches the color palette already used for achievement pop-ups). Activation fires before completion when both happen in the same call.

### `journal` command rewrite

Replace `showJournal` in `src/engine/handlers/info.ts`. New rendering:

```
=== Journal ===

[ ] The Diner Mystery
    Sir Whiskers mentioned something about the diner needing ingredients.

[ ] The Ancient Map
    Wren hinted the map could be earned with enough experience.

[X] The Manor's Secret
    You found the hidden passage in the dome.
```

Rules:
- Active objectives first, completed below.
- Within each section, objectives in the order they were triggered (iteration order of the `objectives` record is preserved in modern JS).
- Active: `[ ]` prefix, title + hint line, both in `CHOICE_COLOR`.
- Complete: `[X]` prefix, title + `completion_text` line, both in `HELP_COLOR` (dimmer — eye skims to active).
- Empty state: `(no entries yet — explore the world)` in `HELP_COLOR`.
- No pagination, no scrolling logic — with ≤10 objectives it always fits.

## Initial Content

Ship v1 with these four ending-linked objectives plus 2-3 flavor quests. Exact text subject to revision during implementation.

### The Hero's Path
- **id:** `defeat_evil_king`
- **trigger:** `defeated_enemy` `cellar_shade` (first real boss — signals combat progression has started)
- **completion:** `enemy_defeated` `evil_king`
- **hint:** "Something dark stirs beyond the darkness. A great evil waits."
- **completion_text:** "The Evil King has fallen."

### The Diner Mystery (Enlightened ending)
- **id:** `the_diner_mystery`
- **trigger:** `talked_to_npc` `whiskers`
- **completion:** `key_items_collected` [all 4 mushrooms]
- **hint:** "Sir Whiskers mentioned something about the diner needing ingredients."
- **completion_text:** "You gathered all four strange mushrooms."

### The Ancient Map (Wanderer ending, part 1)
- **id:** `find_ancient_map`
- **trigger:** `talked_to_npc` `wren`
- **completion:** `key_items_collected` `[ancient_map]`
- **hint:** "Wren hinted the map could be earned with enough experience."
- **completion_text:** "Wren gave you the Ancient Map."

### The Long Road (Wanderer ending, part 2)
- **id:** `explore_the_world`
- **trigger:** `entered_room` `wilds_forest_entrance` (first non-manor room)
- **completion:** `visited_rooms_percent` 80
- **hint:** "There is more to this world than the manor."
- **completion_text:** "You have walked nearly every road in this land."

### The Crown's Temptation (Usurper ending)
- **id:** `the_crowns_temptation`
- **trigger:** `took_item` `dark_crown`
- **completion:** `enemy_defeated` `evil_king` (intentional collision — placeholder; see open question below)
- **hint:** "The dark crown whispers. It wants to be worn."
- **completion_text:** "You wore the crown."

> **Open question for Usurper:** The Usurper ending triggers on a dialogue choice at the stronghold, not on killing the Evil King. The current `used_items_in_room` or `choice_made` shape doesn't cleanly cover dialogue-choice triggers. Options for the implementation plan: (a) add a `choice_made` completion type scoped to a specific ending-choice id, or (b) wire the existing ending trigger system to emit an internal objective event when an ending fires. Flagged here for resolution during planning; does not block the overall design.

## Save Migration

Current save version is `v2`. Bump to `v3`.

**Migration rules in `save.ts::deserialize`:**
- If `data.version === 1`: run existing v1→v2 migration, then fall through to v2→v3.
- If `data.version === 2`: drop `player.journal_entries` from the save blob, initialize `player.objectives = {}`.
- If `data.version === 3`: load `player.objectives` as-is.

**Consequence for existing players:** Journals from in-progress saves are lost. This is acceptable because (a) the old journal was noise nobody reads, (b) backfilling objectives by replaying save state would be a huge amount of code for questionable value, and (c) objectives will start triggering on normal play after the load.

**Consequence for the `JournalEntry` type:** Deleted from `types.ts`. The `save.ts` serializer stops writing `journal_entries`. Tests referencing `journalEntries` delete.

## Testing Plan

New file: `test/unit/objectives.test.ts`

Minimum coverage:

1. **`notifyObjectiveEvent` activates an untriggered objective** — given an event matching `talked_to_npc whiskers`, `the_diner_mystery` moves from untriggered → active.
2. **Activation is idempotent** — firing the same trigger twice is a no-op on the second call.
3. **Completion fires when a triggered objective's conditions are met** — given `the_diner_mystery` active and the player holding all four mushrooms, firing any subsequent event flips it to `complete`.
4. **Reverse-order discovery** — if the player collects all mushrooms BEFORE talking to Whiskers, then talks to Whiskers, the objective activates AND immediately completes in the same call. Both `activated` and `completed` contain the objective in the returned tuple.
5. **`visited_rooms_percent` math** — with a fixture world of 10 non-hidden rooms, visiting 8 satisfies 80%, visiting 7 does not. Hidden-region rooms are excluded from both numerator and denominator.
6. **`objective_completed` chaining** — a chained objective triggered by another's completion fires in the same `notifyObjectiveEvent` call (recursive walk).
7. **Save migration v2 → v3** — a v2 save with `journal_entries` loads to a player with `objectives: {}` and no `journalEntries` field.

Scenario test (`test/scenario/`):
8. **End-to-end Enlightened path** — drive the reducer with text commands: find the hidden region, collect all four mushrooms, talk to Whiskers, verify `the_diner_mystery` is complete and a notification line was written.

Update existing tests:
- `test/unit/save.test.ts` — add v2→v3 migration case.
- Any test referencing `player.journalEntries` or `addJournal` gets rewritten or deleted.

## Open Questions (for implementation plan)

1. **Usurper ending completion type.** See note under "The Crown's Temptation" above.
2. **Notification debouncing.** If the player does something that triggers 3 objectives in one command (unlikely but possible — e.g., taking a weapon that satisfies multiple `took_item` triggers), do we print 3 lines or aggregate? Default: print 3 lines. Revisit if it feels spammy.
3. **Do we need `deps` injection for `notifyObjectiveEvent`, or can it import from `objectives.ts` directly?** The existing `Deps` pattern was built to keep handlers pure and testable. `notifyObjectiveEvent` is itself pure, so handlers can import it directly — but that couples handlers to the objective system. Lean toward direct import for simplicity, revisit if it complicates testing.

## Documentation Deliverables

- This spec doc, committed to `docs/superpowers/specs/`.
- JSDoc on `ObjectiveTrigger` and `ObjectiveCompletion` types in `src/engine/types.ts` that mirrors the Trigger/Completion Type Reference tables above.
- A `README.md` in `src/data/` (new file) listing objective schema and trigger/completion types, so content authors editing `objectives.json` have a local reference.
- `CLAUDE.md` updated with a short "Journal / objectives" bullet under Architecture.

## Quick Win / Deferred / Skipped

| Item                                  | Status   | Reason                                                                        |
| ------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| Objective tracker                     | Ship v1  | Core deliverable.                                                             |
| 4-5 initial objectives                | Ship v1  | Covers all four endings + at least one pure flavor quest.                    |
| `README.md` for `src/data/`           | Ship v1  | User explicitly asked for docs.                                               |
| JSDoc on types                        | Ship v1  | User explicitly asked for docs.                                               |
| Chained objectives (engine support)   | Ship v1  | Trigger type exists; no content uses it yet.                                  |
| Chained objectives (content)          | Deferred | No compelling use case in current world content.                              |
| Objective grouping / categories       | Skipped  | Under 10 objectives total.                                                    |
| Objective counts / progress bars      | Skipped  | Leaks "there are more to find".                                               |
| Search / filter UI                    | Skipped  | Overkill for the scale.                                                       |
| Backfilling objectives from save-state replay | Skipped  | Far more code than value; old saves lose their journal.                       |
| Dialogue-choice completion type       | Open     | Needed for Usurper; pending resolution in implementation plan.                |
