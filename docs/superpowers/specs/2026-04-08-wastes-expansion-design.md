# Wastes Region Expansion — Design Spec

**Date:** 2026-04-08
**Branch target:** new feature branch off `main`

## Motivation

The Wastes region has 5 rooms in a straight line, 2 enemy types + 1 boss, 1 NPC, and no branching paths. It's the thinnest region in the game — a hallway to the Evil King rather than a place worth exploring. Every other region (Manor 13, Wilds 8, Darkness 8) has more content density and more interesting layouts.

## Design Goals

1. **Add a branch** — the Wastes currently has zero routing decisions. A side path gives the player a reason to explore rather than sprint to the ruins.
2. **Lost civilization narrative** — the descriptions hint at "people who used to live here" but never pay it off. The new branch answers what happened and ties it to the Evil King's origin.
3. **Reward exploration** — the player who goes into the mine gets loot, lore, AND a permanent combat reward. The player who skips it gets through faster but misses the payoff.
4. **Use the status effect system** — new enemies apply poison and burn, giving the mine a tactical feel distinct from the surface path (which has stun-focused enemies).

## New Room Layout

Current:
```
path → village → desert → wastelands → ruins
```

Expanded:
```
path → village → desert → wastelands → ruins
           ↓
      abandoned mine → collapsed temple
                            ↓
                       buried sanctum
```

The mine branches south from the village. Three new rooms, accessed linearly.

## New Rooms

### Abandoned Mine (`wastes_abandoned_mine`)

- **Exits:** north → wastes_village, south → wastes_collapsed_temple
- **Description:** Dark tunnels with rusted minecart tracks and collapsed support beams. The miners dug too deep and found something they shouldn't have. Broken tools litter the ground. The air smells like dust and something older.
- **Enemy:** Cave Crawler
- **Searchable:** yes — find Steel Sword
- **Dev note:** `// the mine is spooky. I want players to feel like they're going somewhere they shouldn't`

### Collapsed Temple (`wastes_collapsed_temple`)

- **Exits:** north → wastes_abandoned_mine, down → wastes_buried_sanctum
- **Description:** The miners broke through into this place. Carved stone walls show scenes of a civilization building something — a crown, a throne, a kingdom. Then the carvings change: darkness spreading, people fleeing, the crown consuming its wearer. The ceiling has partially caved in and rubble covers the floor.
- **Enemy:** Temple Sentinel
- **Searchable:** yes — find Strength Tonic
- **Dev note:** `// the carvings tell the story of how the corruption started`

### Buried Sanctum (`wastes_buried_sanctum`)

- **Exits:** up → wastes_collapsed_temple
- **Description:** At the bottom of the temple stairs, a circular chamber carved from living rock. The walls glow faintly with symbols that pulse like a heartbeat. In the center, a stone figure kneels — not a statue, but something that was once alive. The air is warm and still. This is where it all began.
- **Description cleared:** The sanctum is quiet now. The Last Keeper has given you their blessing and faded into the stone. The symbols on the walls have gone dark. You stand where the corruption was born, and where it was understood at last.
- **Clear flag:** `talked_last_keeper` (set when the player completes the Keeper's dialogue)
- **Enemy:** none — this is a lore/reward room
- **NPC:** Last Keeper
- **Searchable:** yes — find Anduril (+30 ATK, currently exists in weapons.json but unplaced)
- **Dev note:** `// this is the big reveal. the corruption started HERE`

## New Enemies

### Cave Crawler

```json
{
  "name": "Cave Crawler",
  "hp": 35,
  "attack": 11,
  "defense": 4,
  "xp": 30,
  "gold": 8,
  "loot": ["small_potion"],
  "region": "wastes",
  "description": "A giant insect with too many legs and mandibles dripping with venom. It skitters across the ceiling and drops down when you least expect it.",
  "is_boss": false,
  "status_effect": {"type": "poison", "damage": 2, "duration": 3, "chance": 25}
}
```

### Temple Sentinel

```json
{
  "name": "Temple Sentinel",
  "hp": 60,
  "attack": 14,
  "defense": 7,
  "xp": 45,
  "gold": 15,
  "loot": [],
  "region": "wastes",
  "description": "A stone automaton carved in the likeness of an ancient warrior. Its eyes glow with fire that has burned for a thousand years. It still guards this place because no one told it to stop.",
  "is_boss": false,
  "status_effect": {"type": "burn", "damage": 3, "duration": 2, "chance": 30}
}
```

## New NPC — Last Keeper (`wastes_last_keeper`)

A spirit/echo of the civilization's last priest. Not a ghost — more like a recording left behind. Appears in the buried sanctum.

### Dialogue tree

**start:**
> "You have come further than anyone has in a thousand years."
> "I am what remains of the last keeper of this place."

Choices:
- "What happened here?" → history
- "What is this place?" → sanctum
- "Who are you?" → keeper

**history:**
> "We built a kingdom here, in the wastes that were not yet wastes."
> "Our smiths forged a crown of dark iron to unite the people."
> "But the crown had its own will. It consumed the king who wore it."
> "The corruption spread from this room, through the temple, through the mines, until everything above was dust."

Choices:
- "The dark crown... I've seen it." (condition: has_key_item dark_crown) → crown_lore
- "Can it be stopped?" → blessing
- "I'm sorry." → blessing

**sanctum:**
> "This was the heart of our civilization. The forge where the crown was made."
> "The symbols on the walls are warnings we carved too late."

Choices:
- "Can it be stopped?" → blessing
- "Tell me more about the crown." → history

**keeper:**
> "I was the last priest. When the corruption took everything, I stayed to guard the truth."
> "I have waited here, in the stone, for someone to find this place."

Choices:
- "What happened here?" → history
- "I'm here now." → blessing

**crown_lore:**
> "Then you know its pull. The crown wants to be worn."
> "If you wear it, you will become what our king became. The corruption will begin again."
> "If you destroy the one who sits on the throne now, the cycle may finally end."

Choices:
- "I'll end it." → blessing
- "What if I wear the crown?" → crown_warning

**crown_warning:**
> "Then you are lost. And so is everything else."

Choices:
- "I understand." → blessing

**blessing:**
> "You have come here seeking answers. I will give you what I can."
> "Take this ward. It will shield you from harm."
> "Remember what happened here. Do not let the crown win."

Effect: `set_flag: keepers_ward`, `heal: 9999` (full heal)

Choices:
- "Thank you, Keeper." → farewell

**farewell:**
> "Go now. The throne awaits."
> The Last Keeper's form shimmers and fades into the stone. The sanctum falls silent.

Choices: (end dialogue — `next: null`)

## Keeper's Ward

**Mechanic:** Permanent -3 damage from all enemy attacks. Stored as `player.firedEvents.keepers_ward === true`. Checked in `enemyTurn` in `combat.ts` alongside the existing `arcane_shield` skill check.

**Implementation:** In the `enemyTurn` function, find the line:

```typescript
const damage = Math.max(1, rawDamage - (hasSkill(player, 'arcane_shield') ? 1 : 0));
```

Change to:

```typescript
let reduction = 0;
if (hasSkill(player, 'arcane_shield')) reduction += 1;
if (player.firedEvents.keepers_ward) reduction += 3;
const damage = Math.max(1, rawDamage - reduction);
```

**Stacking:** Keeper's Ward (-3) + Arcane Shield (-1) = -4 total. This is strong but justified: the player invested a skill point AND explored a hidden side branch.

## Hermit Dialogue Update

Add a new dialogue option to the Hermit's existing tree that hints at the mine. This should appear after the Hermit's existing intro but before "Goodbye":

> "There's an old mine south of the village. The miners dug too deep and found something. People stopped coming back from it. If you're brave enough... or foolish enough..."

Choices:
- "I'll check it out." → (end, next: null)

## New Objective

Add to `src/data/objectives.json`:

```json
{
  "id": "the_lost_sanctum",
  "title": "The Lost Sanctum",
  "hint": "Something lies beneath the abandoned mine south of the village.",
  "trigger": { "type": "entered_room", "room": "wastes_abandoned_mine" },
  "completion": { "type": "entered_room", "room": "wastes_buried_sanctum" },
  "completion_text": "You reached the heart of the lost civilization."
}
```

Triggered when the player enters the mine. Completes when they reach the sanctum. Gives the journal a breadcrumb for the branch path.

## Village Exit Update

Add `south: wastes_abandoned_mine` to the village's exits in `wastes.json`.

## Files Touched

- `src/data/regions/wastes.json` — 3 new rooms, village exit update
- `src/data/enemies.json` — 2 new enemies (cave_crawler, temple_sentinel)
- `src/data/npcs.json` — Last Keeper NPC with dialogue tree
- `src/data/objectives.json` — 1 new objective
- `src/data/shops.json` — no changes (Hermit's stock unchanged)
- `src/engine/combat.ts` — Keeper's Ward damage reduction check (1 line change)
- `CLAUDE.md` — update room count in Wastes description if referenced

## Non-Goals

- No new items beyond placing existing ones (Anduril, Steel Sword, Strength Tonic already exist)
- No new shop for the Last Keeper (spirit NPCs don't sell things)
- No changes to the existing 5 Wastes rooms (descriptions, enemies, loot unchanged)
- No new endings or ending triggers
- No map/minimap changes (BFS auto-discovers the new rooms)

## Testing

- Verify the 3 new rooms load correctly (existing `createStoryWorld` picks up new entries in wastes.json)
- Verify cave_crawler and temple_sentinel appear with correct stats and status effects
- Verify Last Keeper dialogue tree is navigable and the `keepers_ward` flag is set
- Verify Keeper's Ward reduces damage in combat (unit test: player with `keepers_ward` flag takes 3 less damage)
- Verify the new objective triggers on mine entry and completes on sanctum entry
- Verify Anduril is findable via search in the buried sanctum
- `npm run build && npm run lint && npm test` clean
