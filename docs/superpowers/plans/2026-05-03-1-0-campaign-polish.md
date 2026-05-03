# 1.0 Campaign Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the MysticQuest 1.0 full-story campaign polish pass: all endings covered, all regions audited and improved, major set pieces strengthened, and story balance tuned.

**Architecture:** Keep the engine stable and use existing content surfaces first. The only planned engine change is a focused Wanderer virtual-exit repair so `wanderer_exit` remains a dynamic ending target, not a real room. Content work should stay in JSON, ASCII assets, and existing tests unless the audit exposes a genuine missing capability.

**Tech Stack:** Vite 8, React 18.3.1, TypeScript, Vitest 4, ESLint, static JSON game data, Web Audio API, localStorage saves.

---

## Scope Check

This spec has multiple workstreams, but they are not independent products. They all support one release goal: a polished full-story campaign. Execute in the order below so tests protect ending reachability before content and balance changes begin.

Do not add new major mechanics, new regions, new endings, or Dungeon Mode expansion in this plan.

## File Structure

### Planned New Files

- `docs/superpowers/audits/2026-05-03-1-0-campaign-audit.md`
  - Room-by-room and scene-by-scene audit. This is the working source for content polish decisions.
- `docs/superpowers/audits/2026-05-03-1-0-balance-notes.md`
  - Balance targets, observed curve notes, and final tuning rationale.
- `test/scenario/campaign-polish.test.ts`
  - Scenario coverage for player-facing campaign polish moments that are too broad for unit tests.

### Planned Modified Files

- `src/engine/types.ts`
  - Add optional `exitTarget` and `exitDirection` to `EndingCheckContext`.
- `src/engine/endings.ts`
  - Route the Wanderer exploration ending through virtual exit context.
- `src/engine/gameReducer.ts`
  - Allow a dynamic virtual exit target to trigger an ending without adding a fake room.
- `test/scenario/ending-triggers.test.ts`
  - Cover Hero, Usurper, Wanderer, and Enlightened endings directly.
- `src/data/regions/manor.json`
- `src/data/regions/wilds.json`
- `src/data/regions/wastes.json`
- `src/data/regions/darkness.json`
- `src/data/regions/hidden.json`
  - Room prose, cleared descriptions, search rewards, secret hints, enemy placement, and set-piece support.
- `src/data/npcs.json`
  - Ask-topic and dialogue polish.
- `src/data/objectives.json`
  - Additional or clearer objective guidance only where needed.
- `src/data/enemies.json`
- `src/data/items.json`
- `src/data/weapons.json`
- `src/data/armor.json`
- `src/data/accessories.json`
- `src/data/shops.json`
  - Balance tuning.
- `src/assets/ascii/*.txt`
- `src/engine/asciiArt.ts`
- `src/engine/constants.ts`
  - Only if the set-piece pass needs new ASCII art registration.
- `test/unit/ask.test.ts`
  - Update or add ask-topic expectations when NPC topic text changes.
- `test/unit/contentValidation.test.ts`
  - Extend only if new content shape or validation rules are added.
- `test/unit/asciiArt.test.ts`
  - Update only if new ASCII assets are registered.

---

## Task 1: Cover and Repair All Campaign Ending Paths

**Files:**
- Modify: `test/scenario/ending-triggers.test.ts`
- Modify: `src/engine/types.ts`
- Modify: `src/engine/endings.ts`
- Modify: `src/engine/gameReducer.ts`

### Step 1: Add direct scenario coverage for all four endings

In `test/scenario/ending-triggers.test.ts`, keep the existing Hero tests and add these tests below them.

```ts
  it('choosing the dark crown at the throne triggers The Usurper ending', () => {
    let s = newGame();
    s.player!.currentRoom = 'darkness_evil_dimension';
    s.player!.keyItems.dark_crown = true;

    s = input(s, 'go east');

    expect(s.state).toBe('dialogue');
    expectLine(s, 'The crown pulses with dark energy.');

    s = input(s, '2');

    expect(s.state).toBe('ending');
    expectLine(s, 'The Usurper');
  });

  it('taking the Ancient Map exit at 80 percent exploration triggers The Wanderer ending', () => {
    let s = newGame();
    const nonHiddenRooms = Object.values(s.world!.rooms)
      .filter(room => room.region !== 'hidden')
      .map(room => room.id);
    const needed = Math.ceil(nonHiddenRooms.length * 0.8);

    for (const roomId of nonHiddenRooms.slice(0, needed)) {
      s.player!.visitedRooms[roomId] = true;
    }
    s.player!.keyItems.ancient_map = true;
    s.player!.currentRoom = 'wastes_wastelands';

    s = input(s, 'go east');

    expect(s.player!.currentRoom).toBe('wastes_ruins');
    expect(s.world!.rooms.wastes_ruins._dynamic_exits?.down).toBe('wanderer_exit');

    s = input(s, 'go down');

    expect(s.state).toBe('ending');
    expectLine(s, 'The Wanderer');
  });

  it('using all four mushrooms in the diner triggers The Enlightened ending', () => {
    let s = newGame();
    s.player!.currentRoom = 'hidden_diner';
    s.player!.keyItems.red_mushroom = true;
    s.player!.keyItems.grey_mushroom = true;
    s.player!.keyItems.green_mushroom = true;
    s.player!.keyItems.orange_mushroom = true;

    s = input(s, 'use mushrooms');

    expect(s.state).toBe('ending');
    expectLine(s, 'The Enlightened');
  });
```

### Step 2: Run the ending test and confirm the Wanderer test fails

Run:

```bash
npm test -- test/scenario/ending-triggers.test.ts
```

Expected before the fix: Hero, Usurper, and Enlightened should pass or be close to passing. Wanderer should fail because `wanderer_exit` is virtual and the current movement guard rejects non-room targets.

### Step 3: Extend `EndingCheckContext`

In `src/engine/types.ts`, replace:

```ts
export interface EndingCheckContext {
  bossJustDefeated?: string;
  choiceMade?: string;
  itemJustUsed?: string;
}
```

with:

```ts
export interface EndingCheckContext {
  bossJustDefeated?: string;
  choiceMade?: string;
  itemJustUsed?: string;
  exitTarget?: string;
  exitDirection?: string;
}
```

### Step 4: Route the exploration ending through virtual exit context

In `src/engine/endings.ts`, update the `exploration` branch inside `checkTrigger`.

Replace the current branch:

```ts
  if (t === 'exploration') {
    if (!ending.trigger_item || !hasKeyItem(player, ending.trigger_item)) return false;
    const pct = (visitedCount(player) / nonHiddenRoomCount(world)) * 100;
    if (pct < (ending.rooms_percent ?? 100)) return false;
    if (ending.trigger_exit_target && ending.trigger_room) {
      addDynamicExit(world, ending.trigger_room, ending.trigger_exit_dir || 'down', ending.trigger_exit_target);
    }
    return player.currentRoom === (ending.trigger_exit_target || ending.trigger_room);
  }
```

with:

```ts
  if (t === 'exploration') {
    if (!ending.trigger_item || !hasKeyItem(player, ending.trigger_item)) return false;
    const pct = (visitedCount(player) / nonHiddenRoomCount(world)) * 100;
    if (pct < (ending.rooms_percent ?? 100)) return false;

    if (ending.trigger_exit_target && ending.trigger_room) {
      const exitDirection = ending.trigger_exit_dir || 'down';
      if (player.currentRoom === ending.trigger_room) {
        addDynamicExit(world, ending.trigger_room, exitDirection, ending.trigger_exit_target);
      }
      return (
        player.currentRoom === ending.trigger_room &&
        context.exitTarget === ending.trigger_exit_target &&
        context.exitDirection === exitDirection
      );
    }

    return player.currentRoom === ending.trigger_room;
  }
```

### Step 5: Let virtual exits trigger endings from movement

In `src/engine/gameReducer.ts`, find `buildExploringDeps(...).goDirection`.

Replace this block:

```ts
      const nextRoom = getAdjacentRoom(store.world, store.player.currentRoom, target);
      if (nextRoom && getRoom(store.world, nextRoom)) {
        addLine(store, '');
        const entered = enterRoom(store, nextRoom);
        if (entered) updateHeader(store);
      } else {
        addLine(store, "You can't go that way.", C.ERROR_COLOR);
        emitSound(store, 'error');
      }
```

with:

```ts
      const nextRoom = getAdjacentRoom(store.world, store.player.currentRoom, target);
      if (nextRoom && getRoom(store.world, nextRoom)) {
        addLine(store, '');
        const entered = enterRoom(store, nextRoom);
        if (entered) updateHeader(store);
      } else if (nextRoom && checkEndingsContext(store, { exitTarget: nextRoom, exitDirection: target })) {
        return;
      } else {
        addLine(store, "You can't go that way.", C.ERROR_COLOR);
        emitSound(store, 'error');
      }
```

Do not add `wanderer_exit` to any region JSON file.

### Step 6: Run focused tests

Run:

```bash
npm test -- test/scenario/ending-triggers.test.ts test/scenario/journal-enlightened.test.ts test/unit/objectives.test.ts
```

Expected: all selected tests pass.

### Step 7: Run lint

Run:

```bash
npm run lint
```

Expected: clean.

### Step 8: Commit

```bash
git add src/engine/types.ts src/engine/endings.ts src/engine/gameReducer.ts test/scenario/ending-triggers.test.ts
git commit -m "Cover campaign ending paths"
```

---

## Task 2: Create the Campaign Audit Artifact

**Files:**
- Create: `docs/superpowers/audits/2026-05-03-1-0-campaign-audit.md`

### Step 1: Create the audit directory if needed

Run:

```bash
mkdir -p docs/superpowers/audits
```

### Step 2: Write the audit template

Create `docs/superpowers/audits/2026-05-03-1-0-campaign-audit.md` with this structure:

```md
# MysticQuest 1.0 Campaign Audit

## Rating Key

- Strong: memorable, useful, and region-specific.
- Serviceable: functional, but needs stronger flavor or purpose.
- Flat: generic, under-signaled, confusing, or unrewarding.

## Global Findings

| Area | Finding | Action |
| --- | --- | --- |
| Endings | Fill during audit. | Fill during audit. |
| Bosses | Fill during audit. | Fill during audit. |
| NPC hints | Fill during audit. | Fill during audit. |
| Secrets | Fill during audit. | Fill during audit. |
| Balance | Fill during audit. | Move detail to balance notes. |

## Manor

| Room | Rating | Current Role | Issue | Planned Action |
| --- | --- | --- | --- | --- |
| manor_entry | TBD | Opening fight, first pickup, first weapon. | TBD | TBD |
| manor_entrance_hall | TBD | Early navigation. | TBD | TBD |
| manor_west_entertaining | TBD | Combat/search reward. | TBD | TBD |
| manor_east_entertaining | TBD | Combat/search reward. | TBD | TBD |
| manor_main_hall | TBD | Merchant hub. | TBD | TBD |
| manor_west_wing | TBD | Combat corridor. | TBD | TBD |
| manor_east_wing | TBD | Combat and gear. | TBD | TBD |
| manor_north_wing | TBD | Exploration. | TBD | TBD |
| manor_library | TBD | Lore/search. | TBD | TBD |
| manor_library_dome | TBD | Ancient Map search. | TBD | TBD |
| manor_wine_cellar | TBD | Cellar Shade boss. | TBD | TBD |
| manor_dungeon | TBD | Reward room. | TBD | TBD |
| manor_yard | TBD | Transition to Wilds/Wastes. | TBD | TBD |

## Wilds

| Room | Rating | Current Role | Issue | Planned Action |
| --- | --- | --- | --- | --- |
| wilds_forest_entrance | TBD | Region arrival. | TBD | TBD |
| wilds_northern_forest | TBD | Combat and weapon. | TBD | TBD |
| wilds_central_forest | TBD | Hub. | TBD | TBD |
| wilds_clearing | TBD | Wren, shop, hidden path. | TBD | TBD |
| wilds_southern_forest | TBD | Combat and magic weapon. | TBD | TBD |
| wilds_stream | TBD | Recovery and secret weapon. | TBD | TBD |
| wilds_mountains | TBD | Climb and weapon hint. | TBD | TBD |
| wilds_mountain_peak | TBD | Mountain Troll boss. | TBD | TBD |

## Wastes

| Room | Rating | Current Role | Issue | Planned Action |
| --- | --- | --- | --- | --- |
| wastes_path | TBD | Region arrival. | TBD | TBD |
| wastes_village | TBD | Hermit/shop/lore. | TBD | TBD |
| wastes_desert | TBD | Combat and Excalibur. | TBD | TBD |
| wastes_wastelands | TBD | Combat and weapon. | TBD | TBD |
| wastes_ruins | TBD | Ruins Guardian, Wanderer exit. | TBD | TBD |
| wastes_abandoned_mine | TBD | Mine route. | TBD | TBD |
| wastes_collapsed_temple | TBD | Temple danger. | TBD | TBD |
| wastes_buried_sanctum | TBD | Last Keeper. | TBD | TBD |

## Darkness

| Room | Rating | Current Role | Issue | Planned Action |
| --- | --- | --- | --- | --- |
| darkness_abyss | TBD | Region arrival. | TBD | TBD |
| darkness_shadowlands | TBD | Navigation/combat. | TBD | TBD |
| darkness_graveyard | TBD | Combat and weapon. | TBD | TBD |
| darkness_evil_fort | TBD | Combat and armor. | TBD | TBD |
| darkness_shadow_gate | TBD | Reward gate. | TBD | TBD |
| darkness_oblivion_gate | TBD | Oblivion Guardian, crown. | TBD | TBD |
| darkness_evil_dimension | TBD | Pre-throne resource room. | TBD | TBD |
| darkness_stronghold | TBD | Evil King and crown choice. | TBD | TBD |

## Hidden

| Room | Rating | Current Role | Issue | Planned Action |
| --- | --- | --- | --- | --- |
| hidden_shroomy_forest | TBD | Whiskers and mushrooms. | TBD | TBD |
| hidden_diner | TBD | Enlightened ending. | TBD | TBD |
| hidden_imagination_box | TBD | Secret weapon. | TBD | TBD |
| hidden_hobbit_hole | TBD | Milo bonus boss. | TBD | TBD |

## Set Pieces

| Moment | Rating | Issue | Planned Action |
| --- | --- | --- | --- |
| Title/new game opening | TBD | TBD | TBD |
| Manor boss and transition to Wilds | TBD | TBD | TBD |
| Wren and Ancient Map reveal | TBD | TBD | TBD |
| Darkness corruption reveal | TBD | TBD | TBD |
| Last Keeper scene | TBD | TBD | TBD |
| Evil King confrontation | TBD | TBD | TBD |
| Wanderer exit | TBD | TBD | TBD |
| Enlightened diner reveal | TBD | TBD | TBD |

## Deferred Post-1.0

| Idea | Reason Deferred |
| --- | --- |
```

### Step 3: Fill the audit from current content

Read:

```bash
jq '.rooms[] | {id,name,region,description,description_cleared,enemies,items,weapons,armor,searchable,search_items,secret_exits,npcs,on_enter}' src/data/regions/manor.json
jq '.rooms[] | {id,name,region,description,description_cleared,enemies,items,weapons,armor,searchable,search_items,secret_exits,npcs,on_enter}' src/data/regions/wilds.json
jq '.rooms[] | {id,name,region,description,description_cleared,enemies,items,weapons,armor,searchable,search_items,secret_exits,npcs,on_enter}' src/data/regions/wastes.json
jq '.rooms[] | {id,name,region,description,description_cleared,enemies,items,weapons,armor,searchable,search_items,secret_exits,npcs,on_enter}' src/data/regions/darkness.json
jq '.rooms[] | {id,name,region,description,description_cleared,enemies,items,weapons,armor,searchable,search_items,secret_exits,npcs,on_enter}' src/data/regions/hidden.json
```

Fill every `TBD`. Use concise notes. Mark no more than one planned action per room unless the room is campaign-critical.

### Step 4: Check formatting

Run:

```bash
git diff --check
```

Expected: clean.

### Step 5: Commit

```bash
git add docs/superpowers/audits/2026-05-03-1-0-campaign-audit.md
git commit -m "Audit campaign polish gaps"
```

---

## Task 3: Polish Manor and Wilds Content

**Files:**
- Modify: `src/data/regions/manor.json`
- Modify: `src/data/regions/wilds.json`
- Modify: `src/data/npcs.json`
- Modify: `src/data/objectives.json` only if objective guidance is needed
- Modify: `test/unit/ask.test.ts`
- Modify: `test/scenario/dynamic-descriptions.test.ts`
- Create or modify: `test/scenario/campaign-polish.test.ts`

### Step 1: Select exact edits from the audit

Open:

```bash
sed -n '1,220p' docs/superpowers/audits/2026-05-03-1-0-campaign-audit.md
```

For this task, only implement Manor and Wilds planned actions. Defer Wastes, Darkness, Hidden, balance, and new ASCII.

### Step 2: Write or update focused tests first

Add `test/scenario/campaign-polish.test.ts` if it does not exist.

Use this starting structure:

```ts
import { describe, expect, it } from 'vitest';
import { expectLine } from '../fixtures/assert-output';
import { input, newGame } from '../fixtures/mock-input';

describe('campaign polish', () => {
  it('Dusty gives readable cellar preparation guidance', () => {
    let s = newGame();
    s.player!.currentRoom = 'manor_main_hall';

    s = input(s, 'talk dusty');
    s = input(s, '4');

    expectLine(s, 'Shade');
    expectLine(s, 'potions');
  });

  it('Wren hints the hidden mushroom path without spoiling the ending', () => {
    let s = newGame();
    s.player!.currentRoom = 'wilds_clearing';

    s = input(s, 'talk wren');
    s = input(s, '3');

    expectLine(s, 'mushrooms');
  });
});
```

If the audit chooses different wording, update expected substrings to match the new intended player-facing lines.

### Step 3: Run the focused tests and observe failures if wording is not present

Run:

```bash
npm test -- test/scenario/campaign-polish.test.ts test/scenario/dynamic-descriptions.test.ts test/unit/ask.test.ts
```

Expected: new assertions may fail until content is edited.

### Step 4: Edit Manor rooms

In `src/data/regions/manor.json`, apply the audit actions. Prefer these edit types:

- Strengthen `description` for flat navigation rooms.
- Add `description_cleared` for combat rooms where aftermath matters.
- Keep each room description readable in a terminal.
- Preserve room ids, existing exits, and progression.
- Do not add a new room.

High-value Manor candidates from current content shape:

- `manor_entrance_hall`: give it a stronger first-navigation role.
- `manor_west_wing`, `manor_north_wing`, `manor_library`: make corridors feel less generic.
- `manor_wine_cellar`: strengthen Cellar Shade buildup and aftermath.
- `manor_yard`: make the transition out of Manor feel like campaign progression.

### Step 5: Edit Wilds rooms

In `src/data/regions/wilds.json`, apply the audit actions. Prefer these edit types:

- Make the forest feel alive and spatially distinct.
- Ensure `wilds_clearing` hints the secret mushroom path through existing `secret_exits`.
- Make `wilds_mountain_peak` sell the Mountain Troll as the region climax.
- Preserve the hidden path and do not make the Hidden region obvious too early.

### Step 6: Edit Dusty and Wren dialogue or ask topics

In `src/data/npcs.json`, keep NPC ids stable:

- Dusty is `manor_merchant`.
- Wren is `wilds_guide`.

Add or refine ask topics only where the room and objective hints need support. Good topics:

- Dusty: `cellar_shade`, `rusty_key`, `manor`.
- Wren: `mountain_troll`, `hidden_path`, `mushrooms`.

If changing existing ask-topic text that is asserted in `test/unit/ask.test.ts`, update the expected string there.

### Step 7: Run content and focused tests

Run:

```bash
npm test -- test/unit/contentValidation.test.ts test/unit/ask.test.ts test/scenario/dynamic-descriptions.test.ts test/scenario/campaign-polish.test.ts
```

Expected: all selected tests pass.

### Step 8: Run lint

Run:

```bash
npm run lint
```

Expected: clean.

### Step 9: Update the audit status

In `docs/superpowers/audits/2026-05-03-1-0-campaign-audit.md`, update the Manor and Wilds planned actions to note what was completed. Leave deferred items explicit.

### Step 10: Commit

```bash
git add src/data/regions/manor.json src/data/regions/wilds.json src/data/npcs.json src/data/objectives.json test/unit/ask.test.ts test/scenario/dynamic-descriptions.test.ts test/scenario/campaign-polish.test.ts docs/superpowers/audits/2026-05-03-1-0-campaign-audit.md
git commit -m "Polish Manor and Wilds campaign content"
```

If `src/data/objectives.json` or `test/scenario/dynamic-descriptions.test.ts` were not changed, omit them from `git add`.

---

## Task 4: Polish Wastes and Darkness Content

**Files:**
- Modify: `src/data/regions/wastes.json`
- Modify: `src/data/regions/darkness.json`
- Modify: `src/data/npcs.json`
- Modify: `src/data/objectives.json` only if objective guidance is needed
- Modify: `test/scenario/campaign-polish.test.ts`
- Modify: `test/scenario/ending-triggers.test.ts` only if ending text expectations change

### Step 1: Select exact edits from the audit

Open:

```bash
sed -n '1,260p' docs/superpowers/audits/2026-05-03-1-0-campaign-audit.md
```

For this task, only implement Wastes and Darkness planned actions.

### Step 2: Add scenario expectations for major late-campaign guidance

Append tests to `test/scenario/campaign-polish.test.ts`:

```ts
  it('the Last Keeper clearly warns about the dark crown', () => {
    let s = newGame();
    s.player!.currentRoom = 'wastes_buried_sanctum';
    s.player!.keyItems.dark_crown = true;

    s = input(s, 'talk keeper');
    s = input(s, '1');
    s = input(s, '1');

    expectLine(s, 'crown');
    expectLine(s, 'corruption');
  });

  it('the stronghold presents the crown choice when the crown is carried', () => {
    let s = newGame();
    s.player!.currentRoom = 'darkness_evil_dimension';
    s.player!.keyItems.dark_crown = true;

    s = input(s, 'go east');

    expect(s.state).toBe('dialogue');
    expectLine(s, 'The crown pulses with dark energy.');
  });
```

Adjust the Last Keeper path if content edits change dialogue option order. Keep assertions as substrings so prose can stay flexible.

### Step 3: Run focused tests

Run:

```bash
npm test -- test/scenario/campaign-polish.test.ts test/scenario/ending-triggers.test.ts test/unit/contentValidation.test.ts
```

Expected: new assertions may fail until content is edited.

### Step 4: Edit Wastes rooms

In `src/data/regions/wastes.json`, apply the audit actions. Preserve the current eight-room shape unless the audit finds a hard progression issue.

High-value Wastes candidates from current content shape:

- `wastes_path`: make arrival feel like a new act.
- `wastes_village`: sharpen Hermit/shop/lore role.
- `wastes_ruins`: improve Ruins Guardian buildup and Wanderer exit hinting.
- `wastes_abandoned_mine`, `wastes_collapsed_temple`, `wastes_buried_sanctum`: make the Last Keeper route feel intentional, not incidental.

### Step 5: Edit Darkness rooms

In `src/data/regions/darkness.json`, apply the audit actions.

High-value Darkness candidates from current content shape:

- `darkness_abyss`: make the digital corruption reveal unmistakable.
- `darkness_shadow_gate`: make rewards and danger feel purposeful.
- `darkness_oblivion_gate`: strengthen crown acquisition.
- `darkness_evil_dimension`: make it feel like pre-throne pressure, not a resource room only.
- `darkness_stronghold`: sharpen Evil King and Usurper choice payoff.

### Step 6: Edit Hermit and Keeper dialogue or ask topics

In `src/data/npcs.json`, keep NPC ids stable:

- Hermit is `wastes_hermit`.
- Last Keeper is `wastes_last_keeper`.

Add or refine ask topics only where they reduce late-game confusion:

- `wanderer_exit`
- `ruins_guardian`
- `buried_sanctum`
- `evil_king`
- `oblivion_guardian`

### Step 7: Run focused tests

Run:

```bash
npm test -- test/unit/contentValidation.test.ts test/unit/ask.test.ts test/scenario/campaign-polish.test.ts test/scenario/ending-triggers.test.ts
```

Expected: all selected tests pass.

### Step 8: Run lint

Run:

```bash
npm run lint
```

Expected: clean.

### Step 9: Update the audit status

Update Wastes and Darkness rows in `docs/superpowers/audits/2026-05-03-1-0-campaign-audit.md`.

### Step 10: Commit

```bash
git add src/data/regions/wastes.json src/data/regions/darkness.json src/data/npcs.json src/data/objectives.json test/scenario/campaign-polish.test.ts test/scenario/ending-triggers.test.ts docs/superpowers/audits/2026-05-03-1-0-campaign-audit.md
git commit -m "Polish Wastes and Darkness campaign content"
```

If `src/data/objectives.json` or `test/scenario/ending-triggers.test.ts` were not changed, omit them from `git add`.

---

## Task 5: Polish Hidden Region and Ending Payoffs

**Files:**
- Modify: `src/data/regions/hidden.json`
- Modify: `src/data/npcs.json`
- Modify: `src/data/endings.json`
- Modify: `test/scenario/ending-triggers.test.ts`
- Modify: `test/scenario/journal-enlightened.test.ts`
- Modify: `test/scenario/campaign-polish.test.ts`
- Modify: `src/assets/ascii/*.txt`, `src/engine/asciiArt.ts`, `src/engine/constants.ts`, and `test/unit/asciiArt.test.ts` only if new ASCII is added

### Step 1: Select exact edits from the audit

Open the Hidden and Set Pieces sections:

```bash
rg -n "Hidden|Set Pieces|Enlightened|Wanderer|Evil King" docs/superpowers/audits/2026-05-03-1-0-campaign-audit.md
```

For this task, only implement Hidden region, ending text, and optional set-piece presentation changes.

### Step 2: Add or update ending payoff tests

In `test/scenario/ending-triggers.test.ts`, keep direct trigger tests flexible by asserting ending titles and one stable payoff line per ending.

Example additions:

```ts
    expectLine(s, 'The kid');
```

Only assert stable lines that should survive future minor copy edits.

### Step 3: Edit Hidden region content

In `src/data/regions/hidden.json`, make the secret realm feel intentionally weird and rewarding:

- `hidden_shroomy_forest`: reinforce Whiskers and first mushroom discovery.
- `hidden_diner`: make the Enlightened setup readable.
- `hidden_imagination_box`: make the secret weapon feel like a kid-game artifact.
- `hidden_hobbit_hole`: make Milo feel like a bonus boss, not required progression.

Do not add more hidden rooms for 1.0.

### Step 4: Edit Whiskers dialogue and ask topics

In `src/data/npcs.json`, preserve `hidden_cat_friend`. Strengthen:

- `mushrooms`
- `milo`
- `kid`
- `game`
- `diner`

Keep Whiskers funny, but make at least one line useful for finding the Enlightened ending.

### Step 5: Edit ending text if needed

In `src/data/endings.json`, review all four endings:

- The Hero: clean campaign resolution.
- The Usurper: corruption cycle payoff.
- The Wanderer: escape route payoff.
- The Enlightened: kid-game reveal payoff.

Keep the text short enough for the terminal ending sequence. Do not change trigger types in this task.

### Step 6: Optional ASCII set-piece work

Only add new ASCII if the audit identified a specific missing visual moment. If adding art:

- Keep assets in `src/assets/ascii/*.txt`.
- Keep width at or below 40 columns.
- Use plain ASCII only.
- Register through existing `src/engine/asciiArt.ts` and/or `src/engine/constants.ts` patterns.
- Add or update `test/unit/asciiArt.test.ts`.

### Step 7: Run focused tests

Run:

```bash
npm test -- test/unit/asciiArt.test.ts test/unit/contentValidation.test.ts test/unit/ask.test.ts test/scenario/ending-triggers.test.ts test/scenario/journal-enlightened.test.ts test/scenario/campaign-polish.test.ts
```

Expected: all selected tests pass.

### Step 8: Run lint

Run:

```bash
npm run lint
```

Expected: clean.

### Step 9: Update the audit status

Update Hidden and Set Pieces rows in `docs/superpowers/audits/2026-05-03-1-0-campaign-audit.md`.

### Step 10: Commit

```bash
git add src/data/regions/hidden.json src/data/npcs.json src/data/endings.json test/scenario/ending-triggers.test.ts test/scenario/journal-enlightened.test.ts test/scenario/campaign-polish.test.ts docs/superpowers/audits/2026-05-03-1-0-campaign-audit.md
git commit -m "Polish hidden region and ending payoffs"
```

If ASCII files changed, include the exact changed `src/assets/ascii/*.txt`, `src/engine/asciiArt.ts`, `src/engine/constants.ts`, and `test/unit/asciiArt.test.ts`.

---

## Task 6: Tune Story Balance

**Files:**
- Create: `docs/superpowers/audits/2026-05-03-1-0-balance-notes.md`
- Modify: `src/data/enemies.json`
- Modify: `src/data/items.json`
- Modify: `src/data/weapons.json`
- Modify: `src/data/armor.json`
- Modify: `src/data/accessories.json`
- Modify: `src/data/shops.json`
- Modify: `test/unit/combat.test.ts` only if mechanics expectations change
- Modify or create: `test/scenario/campaign-polish.test.ts`

### Step 1: Create balance notes

Create `docs/superpowers/audits/2026-05-03-1-0-balance-notes.md`:

```md
# MysticQuest 1.0 Balance Notes

## Targets

- Regular fights should usually resolve in 2-5 player attacks with reasonable gear.
- Bosses should feel dangerous but not require grinding.
- Shops should matter because stock, price, and timing are meaningful.
- Consumables should help preparation without becoming mandatory for every fight.
- Weapon upgrades should feel rewarding by region.
- Alternate endings should not require tedious farming.

## Current Curve

| Region | Expected Level | Main Threats | Expected Gear | Notes |
| --- | --- | --- | --- | --- |
| Manor | TBD | Shadow Rat, Manor Ghost, Cellar Shade | TBD | TBD |
| Wilds | TBD | Forest Wolf, Forest Spider, Mountain Troll | TBD | TBD |
| Wastes | TBD | Sand Golem, Wraith, Guardian path | TBD | TBD |
| Darkness | TBD | Grave Wraith, Shadow Knight, Oblivion Guardian, Evil King | TBD | TBD |
| Hidden | Optional | Milo | Optional gear | TBD |

## Changes Made

| File | Change | Rationale |
| --- | --- | --- |
```

### Step 2: Inspect current balance data

Run:

```bash
jq 'to_entries[] | {id:.key,name:.value.name,hp:.value.hp,attack:.value.attack,defense:.value.defense,xp:.value.xp,gold:.value.gold,region:.value.region,is_boss:.value.is_boss}' src/data/enemies.json
jq 'to_entries[] | {id:.key,name:.value.name,attack_bonus:.value.attack_bonus,region:.value.region,weapon_class:.value.weapon_class,price:.value.price,status_effect:.value.status_effect}' src/data/weapons.json
jq 'to_entries[] | {id:.key,name:.value.name,type:.value.type,value:.value.value,price:.value.price,cure_effects:.value.cure_effects}' src/data/items.json
jq '.' src/data/shops.json
```

Record findings in the balance notes.

### Step 3: Add a lightweight balance regression scenario

Append this test to `test/scenario/campaign-polish.test.ts`:

```ts
  it('a prepared story player can defeat the Evil King without debug stats', () => {
    let s = newGame();
    s.player!.currentRoom = 'darkness_stronghold';
    s.player!.level = 8;
    s.player!.maxHp = 85;
    s.player!.hp = 85;
    s.player!.attack = 12;
    s.player!.defense = 7;
    s.player!.weapons = ['ragnarok'];
    s.player!.equippedWeapon = 'ragnarok';
    s.player!.inventory.large_potion = 3;
    s.player!.inventory.panacea = 1;
    s.player!.equippedArmor = 'shadow_plate';
    s.player!.skills.iron_will = true;
    s.player!.skills.sharp_eyes = true;
    s.player!.skills.thick_skin = true;

    s = input(s, 'attack king');

    for (let i = 0; i < 40 && s.state === 'combat'; i++) {
      if (s.player!.hp <= 35 && s.player!.inventory.large_potion) {
        s = input(s, 'use large potion');
      } else {
        s = input(s, 'attack');
      }
    }

    expect(s.state).toBe('ending');
    expectLine(s, 'The Hero');
  });
```

This is not a full balance simulator. It guards against making the final boss unreasonable for a prepared campaign player.

### Step 4: Run the balance scenario

Run:

```bash
npm test -- test/scenario/campaign-polish.test.ts
```

Expected: the new test passes after any needed tuning. If it fails before tuning, record why in balance notes.

### Step 5: Tune data conservatively

Edit only the smallest necessary numbers:

- `src/data/enemies.json`: enemy and boss HP/ATK/DEF/XP/gold.
- `src/data/weapons.json`: attack bonuses, prices, status effects only if needed.
- `src/data/items.json`: prices and values only if needed.
- `src/data/armor.json`: defense and prices only if needed.
- `src/data/accessories.json`: modifiers only if needed.
- `src/data/shops.json`: stock quantities and availability only if needed.

Do not make every item cheap or every weapon strictly better by huge margins. Preserve tradeoffs.

### Step 6: Run focused tests

Run:

```bash
npm test -- test/unit/combat.test.ts test/unit/economy.test.ts test/unit/contentValidation.test.ts test/scenario/combat-flow.test.ts test/scenario/shop-flow.test.ts test/scenario/campaign-polish.test.ts
```

Expected: all selected tests pass.

### Step 7: Run lint

Run:

```bash
npm run lint
```

Expected: clean.

### Step 8: Commit

```bash
git add docs/superpowers/audits/2026-05-03-1-0-balance-notes.md src/data/enemies.json src/data/items.json src/data/weapons.json src/data/armor.json src/data/accessories.json src/data/shops.json test/unit/combat.test.ts test/scenario/campaign-polish.test.ts
git commit -m "Tune story campaign balance"
```

Omit unchanged files from `git add`.

---

## Task 7: Full Release Verification

**Files:**
- Modify: `docs/superpowers/audits/2026-05-03-1-0-campaign-audit.md`
- Modify: `docs/superpowers/audits/2026-05-03-1-0-balance-notes.md`
- Modify: any file needed only for verification fixes

### Step 1: Run the full automated suite

Run:

```bash
npm test
```

Expected: all tests pass.

### Step 2: Run lint

Run:

```bash
npm run lint
```

Expected: clean.

### Step 3: Run build

Run:

```bash
npm run build
```

Expected: TypeScript build and Vite production build succeed.

### Step 4: Run audit

Run:

```bash
npm audit
```

Expected: 0 vulnerabilities.

### Step 5: Browser smoke pass

Start the dev server:

```bash
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173` or the port printed by Vite.

Smoke checklist:

- Boot reaches main menu.
- New game starts and first room renders.
- First combat starts and resolves.
- Dusty's shop opens and exits cleanly.
- Region transition banner renders.
- Journal opens and shows objective state.
- Minimap opens and renders visited rooms.
- Boss ASCII appears for at least one boss.
- Usurper choice prompt appears when carrying the crown at the stronghold.
- Enlightened ending starts after using all four mushrooms in the diner.
- Browser console has no warnings or errors caused by this work.

Stop the dev server before final response.

### Step 6: Update verification notes

In `docs/superpowers/audits/2026-05-03-1-0-campaign-audit.md`, add a final section:

```md
## Verification

| Check | Result | Notes |
| --- | --- | --- |
| npm test | TBD | TBD |
| npm run lint | TBD | TBD |
| npm run build | TBD | TBD |
| npm audit | TBD | TBD |
| Browser smoke | TBD | TBD |
```

In `docs/superpowers/audits/2026-05-03-1-0-balance-notes.md`, summarize the final balance changes and any deferred tuning.

### Step 7: Commit final verification notes and any fixes

```bash
git add docs/superpowers/audits/2026-05-03-1-0-campaign-audit.md docs/superpowers/audits/2026-05-03-1-0-balance-notes.md
git commit -m "Record 1.0 campaign verification"
```

If verification required code or content fixes, include those exact files in the same commit only if they are small and directly related to verification. Otherwise make a separate focused commit.

---

## Final Acceptance

The plan is complete when:

- `test/scenario/ending-triggers.test.ts` directly covers all four endings.
- `wanderer_exit` remains virtual and is not added to any region JSON.
- All five regions have completed audit rows.
- Campaign-critical flat areas are improved or explicitly deferred.
- Bosses and endings have stronger buildup/payoff.
- Balance notes explain the final story tuning.
- `npm test` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `npm audit` reports 0 vulnerabilities.
- Browser smoke pass is clean.
