# Wastes Region Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the Wastes region from 5 rooms to 8 with a branching mine path, 2 new enemies, 1 new NPC (the Last Keeper), a permanent combat reward (Keeper's Ward: -3 damage), and a new journal objective.

**Architecture:** Pure content additions (JSON edits) plus one line change in `combat.ts` for the Keeper's Ward damage reduction. No new modules, no type changes, no save format changes. The existing `createStoryWorld` auto-loads new rooms from wastes.json, the objective system auto-discovers the new objective, and the combat system reads the new enemy `status_effect` fields.

**Tech Stack:** TypeScript, Vitest 2.x. JSON content files.

**Spec:** [docs/superpowers/specs/2026-04-08-wastes-expansion-design.md](../specs/2026-04-08-wastes-expansion-design.md)

---

## File map

**Modified:**
- `src/data/regions/wastes.json` — 3 new rooms, village exit update
- `src/data/enemies.json` — 2 new enemies (cave_crawler, temple_sentinel)
- `src/data/npcs.json` — Last Keeper NPC with dialogue tree, Hermit mine hint
- `src/data/objectives.json` — 1 new objective (the_lost_sanctum)
- `src/engine/combat.ts` — Keeper's Ward damage reduction (1 line)
- `test/unit/combat.test.ts` — Keeper's Ward test
- `CLAUDE.md` — update Wastes room count

---

## Task 1: Add new rooms to wastes.json

**Files:**
- Modify: `src/data/regions/wastes.json`

**Goal:** Add the 3 new rooms and connect the mine to the village.

- [ ] **Step 1: Add `south` exit to wastes_village**

In `src/data/regions/wastes.json`, find the `wastes_village` room. Change its exits from:

```json
"exits": {"north": "wastes_path", "south": "wastes_desert"}
```

to:

```json
"exits": {"north": "wastes_path", "south": "wastes_desert", "west": "wastes_abandoned_mine"}
```

(Using `west` rather than a second `south` to avoid overwriting the existing south → desert exit.)

- [ ] **Step 2: Add the 3 new rooms**

Append these 3 room objects to the `rooms` array in wastes.json, after the `wastes_ruins` entry:

```json
,
{
  "id": "wastes_abandoned_mine",
  "name": "Abandoned Mine",
  "region": "wastes",
  "description": "Dark tunnels with rusted minecart tracks and collapsed support beams. The miners dug too deep and found something they shouldn't have. Broken tools litter the ground and the air smells like dust and something much older. The walls are scratched with tally marks — someone was counting the days down here.",
  "exits": {"east": "wastes_village", "south": "wastes_collapsed_temple"},
  "items": [],
  "enemies": ["cave_crawler"],
  "searchable": true,
  "search_items": ["steel_sword"],
  "dev_note": "// the mine is spooky. I want players to feel like they're going somewhere they shouldn't"
},
{
  "id": "wastes_collapsed_temple",
  "name": "Collapsed Temple",
  "region": "wastes",
  "description": "The miners broke through into this place. Carved stone walls show scenes of a civilization building something — a crown, a throne, a kingdom. Then the carvings change: darkness spreading, people fleeing, the crown consuming its wearer. The ceiling has partially caved in and rubble covers the intricate floor mosaics.",
  "exits": {"north": "wastes_abandoned_mine", "down": "wastes_buried_sanctum"},
  "items": [],
  "enemies": ["temple_sentinel"],
  "searchable": true,
  "search_items": ["strength_tonic"],
  "dev_note": "// the carvings tell the story of how the corruption started"
},
{
  "id": "wastes_buried_sanctum",
  "name": "Buried Sanctum",
  "region": "wastes",
  "description": "At the bottom of the temple stairs, a circular chamber carved from living rock. The walls glow faintly with symbols that pulse like a heartbeat. In the center a stone figure kneels — not a statue but something that was once alive. The air is warm and still. This is where it all began.",
  "description_cleared": "The sanctum is quiet now. The Last Keeper has given you their blessing and faded into the stone. The symbols on the walls have gone dark. You stand where the corruption was born and where it was understood at last.",
  "clear_flag": "talked_last_keeper",
  "exits": {"up": "wastes_collapsed_temple"},
  "items": [],
  "enemies": [],
  "searchable": true,
  "search_items": ["anduril"],
  "npcs": ["wastes_last_keeper"],
  "dev_note": "// this is the big reveal. the corruption started HERE"
}
```

- [ ] **Step 3: Verify build + tests**

Run: `npm run build && npm run lint && npm test`
Expected: clean. The rooms reference enemies and NPCs that don't exist yet — but the engine handles missing refs gracefully (empty enemy list, no NPC to talk to). The build just validates JSON shape.

**Note:** If the build fails because `anduril` or `steel_sword` aren't in items.json — they're in weapons.json, which is correct. The `search_items` field accepts both item and weapon ids; the search handler checks both data sources.

- [ ] **Step 4: Commit**

```bash
git add src/data/regions/wastes.json
git commit -m "Add 3 new rooms to Wastes: mine, temple, sanctum"
```

---

## Task 2: Add new enemies

**Files:**
- Modify: `src/data/enemies.json`

**Goal:** Add Cave Crawler and Temple Sentinel.

- [ ] **Step 1: Add both enemies to `src/data/enemies.json`**

Add these two entries to the JSON object (after the `milo` entry, before the closing `}`):

```json
,
"cave_crawler": {"name": "Cave Crawler", "hp": 35, "attack": 11, "defense": 4, "xp": 30, "gold": 8, "loot": ["small_potion"], "region": "wastes", "description": "A giant insect with too many legs and mandibles dripping with venom. It skitters across the ceiling and drops down when you least expect it.", "is_boss": false, "status_effect": {"type": "poison", "damage": 2, "duration": 3, "chance": 25}},
"temple_sentinel": {"name": "Temple Sentinel", "hp": 60, "attack": 14, "defense": 7, "xp": 45, "gold": 15, "loot": [], "region": "wastes", "description": "A stone automaton carved in the likeness of an ancient warrior. Its eyes glow with fire that has burned for a thousand years. It still guards this place because no one told it to stop.", "is_boss": false, "status_effect": {"type": "burn", "damage": 3, "duration": 2, "chance": 30}}
```

- [ ] **Step 2: Verify build + tests**

Run: `npm run build && npm run lint && npm test`

- [ ] **Step 3: Commit**

```bash
git add src/data/enemies.json
git commit -m "Add Cave Crawler and Temple Sentinel enemies"
```

---

## Task 3: Add Last Keeper NPC

**Files:**
- Modify: `src/data/npcs.json`

**Goal:** Add the Last Keeper NPC with full dialogue tree. The `blessing` node sets the `keepers_ward` flag and heals fully.

- [ ] **Step 1: Add the Last Keeper to `src/data/npcs.json`**

Add this entry to the JSON object (after the `hidden_cat_friend` entry, before the closing `}`):

```json
,
"wastes_last_keeper": {
  "name": "The Last Keeper",
  "description": "A translucent figure kneeling in the center of the sanctum. Not a ghost — more like a recording etched into the stone itself. Its face is ancient and serene.",
  "match_words": ["keeper", "last keeper", "spirit", "figure", "statue"],
  "dialogue": {
    "start": {
      "text": [
        "You have come further than anyone has in a thousand years.",
        "I am what remains of the last keeper of this place."
      ],
      "choices": [
        { "label": "What happened here?", "next": "history" },
        { "label": "What is this place?", "next": "sanctum" },
        { "label": "Who are you?", "next": "keeper" }
      ]
    },
    "history": {
      "text": [
        "We built a kingdom here, in the wastes that were not yet wastes.",
        "Our smiths forged a crown of dark iron to unite the people.",
        "But the crown had its own will. It consumed the king who wore it.",
        "The corruption spread from this room, through the temple, through the mines, until everything above was dust."
      ],
      "choices": [
        { "label": "The dark crown... I've seen it.", "next": "crown_lore", "condition": { "type": "has_key_item", "value": "dark_crown" } },
        { "label": "Can it be stopped?", "next": "blessing" },
        { "label": "I'm sorry.", "next": "blessing" }
      ]
    },
    "sanctum": {
      "text": [
        "This was the heart of our civilization. The forge where the crown was made.",
        "The symbols on the walls are warnings we carved too late."
      ],
      "choices": [
        { "label": "Can it be stopped?", "next": "blessing" },
        { "label": "Tell me more about the crown.", "next": "history" }
      ]
    },
    "keeper": {
      "text": [
        "I was the last priest. When the corruption took everything, I stayed to guard the truth.",
        "I have waited here, in the stone, for someone to find this place."
      ],
      "choices": [
        { "label": "What happened here?", "next": "history" },
        { "label": "I'm here now.", "next": "blessing" }
      ]
    },
    "crown_lore": {
      "text": [
        "Then you know its pull. The crown wants to be worn.",
        "If you wear it, you will become what our king became. The corruption will begin again.",
        "If you destroy the one who sits on the throne now, the cycle may finally end."
      ],
      "choices": [
        { "label": "I'll end it.", "next": "blessing" },
        { "label": "What if I wear the crown?", "next": "crown_warning" }
      ]
    },
    "crown_warning": {
      "text": [
        "Then you are lost. And so is everything else."
      ],
      "choices": [
        { "label": "I understand.", "next": "blessing" }
      ]
    },
    "blessing": {
      "text": [
        "You have come here seeking answers. I will give you what I can.",
        "Take this ward. It will shield you from harm.",
        "Remember what happened here. Do not let the crown win."
      ],
      "choices": [
        { "label": "Thank you, Keeper.", "next": "farewell", "effect": { "set_flag": "keepers_ward", "heal": 9999 } }
      ]
    },
    "farewell": {
      "text": [
        "Go now. The throne awaits.",
        "The Last Keeper's form shimmers and fades into the stone. The sanctum falls silent."
      ],
      "choices": [
        { "label": "(Leave)", "next": null }
      ]
    }
  }
}
```

- [ ] **Step 2: Add mine hint to Hermit's dialogue**

In the `wastes_hermit` entry, find the `"start"` dialogue node's `choices` array. Add a new choice before the last `"Leave him alone."` entry:

Find:
```json
{ "label": "I need healing.", "next": "heal" },
{ "label": "Leave him alone.", "next": null }
```

Replace with:
```json
{ "label": "I need healing.", "next": "heal" },
{ "label": "Know anything about the mine?", "next": "mine_hint" },
{ "label": "Leave him alone.", "next": null }
```

Then add the `mine_hint` dialogue node to the Hermit's dialogue object (after the `healed` node):

```json
,
"mine_hint": {
  "text": [
    "There's an old mine west of the village. The miners dug too deep and found something.",
    "People stopped coming back from it.",
    "If you're brave enough... or foolish enough..."
  ],
  "choices": [
    { "label": "I'll check it out.", "next": null },
    { "label": "Maybe later.", "next": null }
  ]
}
```

- [ ] **Step 3: Verify build + tests**

Run: `npm run build && npm run lint && npm test`

- [ ] **Step 4: Commit**

```bash
git add src/data/npcs.json
git commit -m "Add Last Keeper NPC and Hermit mine hint dialogue"
```

---

## Task 4: Keeper's Ward damage reduction

**Files:**
- Modify: `src/engine/combat.ts`
- Modify: `test/unit/combat.test.ts`

**Goal:** When `player.firedEvents.keepers_ward` is true, reduce all incoming enemy damage by 3. Stacks with Arcane Shield (-1) for -4 total.

- [ ] **Step 1: Write failing test**

Append to `test/unit/combat.test.ts`:

```typescript
describe("Keeper's Ward", () => {
  it('reduces enemy damage by 3 when keepers_ward flag is set', () => {
    const player = createPlayer();
    player.firedEvents.keepers_ward = true;
    player.defense = 0;
    const combat = createCombat(player, 'shadow_rat', enemyData);

    // Shadow Rat has 3 ATK, 1 DEF. With Keeper's Ward (-3), 
    // damage should be max(1, rawDmg - 3) = 1 minimum.
    playerDefend(combat, player, itemData, seededRng(1));

    // Player should take minimal damage (1) because 3 ATK - 0 DEF + variance - 3 ward
    // is very low. With seeded RNG, verify damage is less than without ward.
    const withWard = 30 - player.hp;

    // Compare: same scenario without ward
    const player2 = createPlayer();
    player2.defense = 0;
    const combat2 = createCombat(player2, 'shadow_rat', enemyData);
    playerDefend(combat2, player2, itemData, seededRng(1));
    const withoutWard = 30 - player2.hp;

    expect(withWard).toBeLessThan(withoutWard);
  });

  it('stacks with arcane_shield for -4 total reduction', () => {
    const player = createPlayer();
    player.firedEvents.keepers_ward = true;
    player.skills.arcane_shield = true;
    player.defense = 0;
    player.hp = 200;
    player.maxHp = 200;

    // Use a stronger enemy to ensure damage is measurable
    const strongEnemy = {
      brute: {
        name: 'Brute',
        hp: 100,
        attack: 20,
        defense: 0,
        xp: 10,
        loot: [] as string[],
        region: 'test',
        description: 'big',
        is_boss: false,
      },
    };
    const combat = createCombat(player, 'brute', strongEnemy);
    playerDefend(combat, player, itemData, seededRng(1));
    const withBoth = 200 - player.hp;

    // Without either
    const player2 = createPlayer();
    player2.defense = 0;
    player2.hp = 200;
    player2.maxHp = 200;
    const combat2 = createCombat(player2, 'brute', strongEnemy);
    playerDefend(combat2, player2, itemData, seededRng(1));
    const withNeither = 200 - player2.hp;

    // Should differ by exactly 4 (ward 3 + shield 1)
    expect(withNeither - withBoth).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/combat.test.ts -t "Keeper's Ward"`
Expected: FAIL — damage is the same with or without the flag.

- [ ] **Step 3: Implement the damage reduction**

In `src/engine/combat.ts`, find the line in `enemyTurn`:

```typescript
  const damage = Math.max(1, rawDamage - (hasSkill(player, 'arcane_shield') ? 1 : 0));
```

Replace with:

```typescript
  let reduction = 0;
  if (hasSkill(player, 'arcane_shield')) reduction += 1;
  if (player.firedEvents.keepers_ward) reduction += 3;
  const damage = Math.max(1, rawDamage - reduction);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/combat.test.ts -t "Keeper's Ward"`
Expected: PASS.

- [ ] **Step 5: Run full suite + lint**

Run: `npm run lint && npm test`

- [ ] **Step 6: Commit**

```bash
git add src/engine/combat.ts test/unit/combat.test.ts
git commit -m "Add Keeper's Ward: permanent -3 damage reduction from firedEvents flag"
```

---

## Task 5: Add journal objective

**Files:**
- Modify: `src/data/objectives.json`

**Goal:** Add the "Lost Sanctum" objective that triggers when the player enters the mine and completes when they reach the sanctum.

- [ ] **Step 1: Add the objective**

In `src/data/objectives.json`, add this entry to the array (before the closing `]`):

```json
,
{
  "id": "the_lost_sanctum",
  "title": "The Lost Sanctum",
  "hint": "Something lies beneath the abandoned mine south of the village.",
  "trigger": {
    "type": "entered_room",
    "room": "wastes_abandoned_mine"
  },
  "completion": {
    "type": "entered_room",
    "room": "wastes_buried_sanctum"
  },
  "completion_text": "You reached the heart of the lost civilization."
}
```

**Note:** The `entered_room` completion type doesn't exist yet — the current completion types are `key_items_collected`, `enemy_defeated`, `visited_rooms_percent`, `used_items_in_room`, and `objective_completed`. However, looking at the objective system more carefully, the trigger fires `notifyObjectiveEvent` on room entry, which then re-checks all active objectives. The completion re-check calls `isCompletionSatisfied` — but `entered_room` is not a completion type, only a trigger type.

**Fix:** Use `visited_rooms_percent` with a very low threshold? No, that's wrong. The cleanest approach: change the objective's completion to use `key_items_collected` with a flag-based item, but that's hacky.

**Actually simpler:** The completion condition should check if the player has visited the sanctum room. Looking at `isCompletionSatisfied` in `objectives.ts`, there's no `visited_room` completion type. We need either:
- (a) Add a `visited_room` completion type to objectives.ts (small code change)
- (b) Use a flag-based approach: trigger completion on `talked_to_npc` with `wastes_last_keeper`

Option (b) is better — the real "completion" is talking to the Keeper, not just entering the room. And `talked_to_npc` already works as a trigger type, and we could chain: trigger objective on mine entry, complete on talking to Keeper.

Wait — `talked_to_npc` is a trigger type, not a completion type. But `objective_completed` chains work... Actually, let me re-read the completion types.

**Resolution:** Use a two-objective chain:
1. `the_lost_sanctum` — trigger: `entered_room: wastes_abandoned_mine`, completion: `objective_completed: met_the_keeper`
2. `met_the_keeper` — trigger: `talked_to_npc: wastes_last_keeper`, completion: `objective_completed: the_lost_sanctum` (circular? no...)

This is overcomplicating it. Simplest correct approach: just use one objective with trigger `entered_room: wastes_abandoned_mine` and completion `key_items_collected` with an empty list... no.

**Actual simplest approach:** Add a `flag_set` completion type to objectives.ts that checks `player.firedEvents[flag]`. The Keeper sets `keepers_ward` on blessing. The objective completes when `keepers_ward` is set. This is the `flag_set` type we deferred from the journal spec as YAGNI — now we need it.

But that's a code change to objectives.ts, which is more than "just JSON."

**Even simpler:** Make the objective trigger on mine entry and complete immediately when the player ALSO enters the sanctum — by making both trigger and completion use `entered_room`. The trigger activates on mine entry. For completion, since the objective system re-checks all active objectives on every event, and `entered_room` fires an event... if the player enters the sanctum, a `entered_room: wastes_buried_sanctum` event fires. The trigger won't match (it's for the mine), but the completion check runs. We need `isCompletionSatisfied` to handle a "has visited room X" check.

**Decision:** Add a `visited_room` completion type to `isCompletionSatisfied` in `objectives.ts`. It checks `player.visitedRooms[room]`. This is a 4-line addition. Clean, correct, reusable.

- [ ] **Step 1 (revised): Add `visited_room` completion type to objectives.ts**

In `src/engine/objectives.ts`, find the `isCompletionSatisfied` function and its switch. Add a new case:

```typescript
    case 'visited_room': {
      if (!completion.room) return false;
      return player.visitedRooms[completion.room] === true;
    }
```

Also add `'visited_room'` to the `ObjectiveCompletion.type` union in `src/engine/types.ts`:

```typescript
export interface ObjectiveCompletion {
  type:
    | 'key_items_collected'
    | 'enemy_defeated'
    | 'visited_rooms_percent'
    | 'used_items_in_room'
    | 'objective_completed'
    | 'visited_room';
  // ...
}
```

- [ ] **Step 2: Add a test for the new completion type**

Append to `test/unit/objectives.test.ts`:

```typescript
describe('completion: visited_room', () => {
  it('completes when the player has visited the specified room', () => {
    const store = objectivesTestStore();
    store.player!.visitedRooms = { wastes_buried_sanctum: true };
    const fx: ObjectiveDef[] = [{
      id: 'sanctum_visit',
      title: 'Visit Sanctum',
      hint: '...',
      trigger: { type: 'entered_room', room: 'wastes_abandoned_mine' },
      completion: { type: 'visited_room', room: 'wastes_buried_sanctum' },
      completion_text: '...',
    }];
    notifyObjectiveEvent(
      store,
      { type: 'entered_room', room: 'wastes_abandoned_mine' },
      fx,
    );
    expect(store.player!.objectives.sanctum_visit).toBe('complete');
  });
});
```

- [ ] **Step 3: Run test, verify it passes**

Run: `npx vitest run test/unit/objectives.test.ts -t "visited_room"`

- [ ] **Step 4: Add the objective to objectives.json**

```json
,
{
  "id": "the_lost_sanctum",
  "title": "The Lost Sanctum",
  "hint": "Something lies beneath the abandoned mine west of the village.",
  "trigger": {
    "type": "entered_room",
    "room": "wastes_abandoned_mine"
  },
  "completion": {
    "type": "visited_room",
    "room": "wastes_buried_sanctum"
  },
  "completion_text": "You reached the heart of the lost civilization."
}
```

- [ ] **Step 5: Update documentation**

Update `src/data/README.md` completion types table — add:

```
| `visited_room`          | `room`            | The player has visited the named room                               |
```

Also update the JSDoc on `ObjectiveCompletion` in `src/engine/types.ts` to include the new row.

- [ ] **Step 6: Run full suite + lint, commit**

```bash
npm run build && npm run lint && npm test
git add src/engine/objectives.ts src/engine/types.ts src/data/objectives.json src/data/README.md test/unit/objectives.test.ts
git commit -m "Add visited_room completion type and Lost Sanctum objective"
```

---

## Task 6: Final verification + CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

Find the Wastes region description if referenced (in the game data section). The room count changed from 5 (or 6) to 8. Update any references.

- [ ] **Step 2: Run final verification**

```bash
npm run build && npm run lint && npm test
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Update CLAUDE.md with expanded Wastes region"
```

---

## Verification Checklist

- [ ] `npm run build` clean
- [ ] `npm run lint` clean
- [ ] `npm test` all pass
- [ ] Manual: walk to village, go west to mine — see Cave Crawler
- [ ] Manual: search mine — find Steel Sword
- [ ] Manual: go south to temple — see Temple Sentinel with burn effect
- [ ] Manual: go down to sanctum — see Last Keeper NPC
- [ ] Manual: talk to Keeper, navigate to blessing — get healed + keepers_ward flag set
- [ ] Manual: fight an enemy after blessing — take reduced damage
- [ ] Manual: talk to Hermit, ask about the mine — see hint dialogue
- [ ] Manual: type `journal` — see "The Lost Sanctum" objective after entering mine
- [ ] Manual: search sanctum — find Anduril

## Self-Review

**Spec coverage:**
- ✅ 3 new rooms with correct connections: Task 1
- ✅ 2 new enemies with status effects: Task 2
- ✅ Last Keeper NPC with full dialogue: Task 3
- ✅ Hermit mine hint: Task 3
- ✅ Keeper's Ward -3 damage: Task 4
- ✅ New objective: Task 5
- ✅ Loot placement (Steel Sword, Strength Tonic, Anduril): Task 1
- ✅ CLAUDE.md: Task 6

**Type consistency:** `visited_room` completion type added to both the TypeScript union and the switch in `isCompletionSatisfied`. README updated.

**Note:** Task 1 Step 1 uses `west` for the mine exit from the village (since `south` already goes to the desert). The spec said "south" but two south exits from the same room is impossible. The spec layout diagram shows the mine branching down, but in-game the direction is `west`. This is fine — the player types `go west` to enter the mine.
