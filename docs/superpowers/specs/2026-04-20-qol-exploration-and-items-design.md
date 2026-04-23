# QoL Exploration and Items Design

## Goal

Make the story campaign smoother to play without removing the text-adventure feel. This pass bundles six small player-facing improvements:

1. Ask NPCs about important items.
2. Reduce friction around `look` and `search`.
3. Make weapons easier to compare.
4. Fix the Hidden region return direction.
5. Let players continue after seeing an ending.
6. Visually distinguish magic weapons.

This is one personal-project PR, so the work should be implemented as one cohesive polish pass instead of split into separate branches.

## Current Behavior

- NPC dialogue is entirely static JSON and only advances through dialogue choices.
- `look` reprints the current room or previews an adjacent room.
- `search` reveals hidden loot and secret exits, but players must remember to run it separately.
- Inventory shows equipped weapon first, then other weapons in acquisition order.
- Shroomy Forest exits `north` to Wilds Clearing even though the player enters it by going `down` from Wilds Clearing.
- Endings return to the main menu after the ending text finishes.
- Magic weapons have a class tag in `examine`, but use the same colors as other weapons in most output.

## Design

### NPC Item Questions

Add an `ask` command:

- `ask <npc> about <topic>`
- `ask about <topic>` when exactly one NPC is present in the room

The command resolves NPCs using the same room-local NPC matching used by `talk`. Topics resolve against:

- item ids, names, and `match_words`
- weapon ids, names, and `match_words`
- a small authored lore table for important abstract topics, such as `keeper's ward`

Only nearby NPCs can answer. If no matching NPC exists, print a normal error. If the topic is unknown, print an in-character fallback from that NPC if available, otherwise a generic line.

The first authored content should cover unique/story items and current magic weapons:

- Ancient Map
- Dark Crown
- Red/Grey/Green/Orange Mushrooms
- Keeper's Ward
- Hrunting, Tyrfing, Excalibur, Keyblade, Anduril, Ragnarok

Keep this data in JSON if the content is NPC-specific. Use TypeScript helpers only for matching and fallback behavior. Do not hardcode one NPC name in the handler.

### Look/Search Simplification

Keep both commands, but make `look` do the useful exploration work:

- `look` with no target renders the current room.
- After rendering, if the room is searchable and has not already been searched, automatically perform the same reveal work as `search`.
- `search` remains available and uses the same search helper. If the room was already searched, it says so.

This preserves hidden exits and hidden loot as game concepts, but removes the repetitive "enter room, look, search" command tax.

Direction preview stays intact:

- `look north`, `look up`, etc. still preview adjacent rooms.
- Direction preview must not auto-search the current room or the adjacent room.

Implementation should extract the reveal logic from `handleSearch` into a helper so `look` and `search` cannot drift.

### Weapon and Equipment Listing

Inventory output should make weapons easier to compare:

- Equipped weapon remains first.
- Other owned weapons are sorted by `attack_bonus` descending.
- Each weapon line includes class tag and attack bonus, for example `[Magic] Anduril (+30 ATK)`.
- Magic weapons use the new magic color.

Add `weapons` as a player-facing alias/command that prints a focused weapon list. It should use the same sorted weapon rendering as inventory, but skip consumables and key items.

The command can initially sort only by damage. "By level" is interpreted as practical progression order through damage/attack bonus because weapons do not currently have a level field.

### Hidden Region Direction Fix

Change Shroomy Forest's return exit:

- From `north: wilds_clearing`
- To `up: wilds_clearing`

This makes the Hidden entrance and return path symmetrical:

- Wilds Clearing `down` -> Shroomy Forest
- Shroomy Forest `up` -> Wilds Clearing

Update tests or add a small world/data test to prevent this from regressing.

### Continue After Ending

After an ending finishes typing, replace the current menu return with a continue prompt:

- Text: `Press any key to continue exploring.`
- On key press, clear ending state, restore base color/header, set state back to `exploring`, and display the current room.

Ending achievements should still unlock exactly when the ending starts. The post-ending world state should remain as-is:

- defeated bosses remain defeated
- collected items remain collected
- player position remains the room where the ending triggered
- player can save after continuing

Do not restart the game or silently reload from a save.

### Magic Weapon Color

Add a dedicated color constant, tentatively `MAGIC_COLOR`.

Use it for magic weapons in these player-visible outputs:

- inventory/equipment list
- focused `weapons` list
- `examine` weapon headers and class blurbs
- `search`/auto-search find messages for magic weapons
- `take` messages for magic weapons
- combat forced-proc message may keep its current arcane color if it already reads distinctly; using `MAGIC_COLOR` there is acceptable if it improves consistency

Respect existing color mode remapping. No CSS-level special case is required.

## Architecture Notes

- Keep engine modules pure. No React imports.
- Keep `gameReducer.ts` as orchestrator. Add only the routing needed for `ask`, `weapons`, and ending continuation.
- Prefer shared helpers:
  - search reveal helper for `look` and `search`
  - weapon display helper for inventory and focused weapons list
  - topic matching helper for NPC item questions
- If NPC ask content changes JSON shape, update `src/engine/types.ts`.

## Testing

Add focused tests at the lowest useful level:

- `ask` command:
  - `ask about ancient map` works with one NPC in room
  - `ask wren about ancient map` works with explicit NPC
  - unknown topic prints fallback
  - command errors when no NPC is present
- `look`/`search`:
  - `look` auto-reveals searchable room loot once
  - `look <direction>` does not search
  - explicit `search` still works and reports already searched after auto-search
- weapons display:
  - sorted by attack descending
  - equipped first
  - magic weapons use magic color
- Hidden region:
  - Shroomy Forest has `up` exit to Wilds Clearing and no `north` exit to Wilds Clearing
- endings:
  - after ending text completes, a keypress resumes `exploring` instead of menu
  - ending achievement behavior is not weakened
- magic color:
  - magic weapon search/take/examine/inventory lines use `MAGIC_COLOR`

Run:

```bash
npm run build
npm run lint
npm test
```

## Out of Scope

- A full knowledge-base or freeform natural-language NPC system.
- Removing `search` completely.
- Adding a weapon level field.
- Reworking all dialogue trees.
- Changing ending trigger conditions.
