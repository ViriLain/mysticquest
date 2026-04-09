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

| Type                 | Required field | Fires when                                        |
| -------------------- | -------------- | -------------------------------------------------- |
| `talked_to_npc`      | `npc`          | The player talks to the named NPC for the first time |
| `entered_room`       | `room`         | The player enters the named room for the first time  |
| `searched_room`      | `room`         | The player successfully searches the room         |
| `took_item`          | `item`         | The player picks up the named item or weapon      |
| `defeated_enemy`     | `enemy`        | The player wins combat against the enemy          |
| `objective_completed`| `objective`    | Another objective (by id) becomes complete        |

Triggers fire at most once per objective. Re-triggering is a no-op.

**Important note on NPC ids:** The `npc` field takes the NPC's internal key from `npcs.json`, not its display name. For example, Sir Whiskers III is `hidden_cat_friend`; Wren the Forest Guide is `wilds_guide`. Grep `npcs.json` to find the right key.

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
  "trigger": { "type": "talked_to_npc", "npc": "wilds_guide" },
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
