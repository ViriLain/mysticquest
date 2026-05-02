# MysticQuest 1.0 Campaign Polish Design

## Status

Approved direction from the May 2026 planning conversation.

## Goal

MysticQuest 1.0 should be a complete, polished full-story campaign where every region feels authored, the four endings feel earned, and the combat/economy curve supports the journey without becoming the main source of friction.

The release push should prioritize the full story run: all regions, all four endings, final balance, and narrative payoff. Dungeon Mode remains part of the product, but this pass treats it as a solid bonus mode rather than the main 1.0 quality bar.

## Current Context

The game already has the core 1.0 systems in place:

- Five story regions, four endings, shops, objectives, achievements, saves, settings, and Dungeon Mode.
- Turn-based combat with status effects, weapon classes, active skills, equipment, and boss behavior.
- CRT presentation, synthesized audio, region banners, boss ASCII art, magic weapon pickup art, overlays, command history, autocomplete, minimap, and journal.
- Runtime content validation, save migration, unit tests, scenario tests, and browser smoke expectations.

The highest-value remaining work is not new architecture. It is making the existing campaign feel cohesive, memorable, well-paced, and clean end to end.

## Release Buckets

### Must Have

- Region-by-region campaign flavor audit.
- Stronger room, NPC, secret, and reward flavor where areas feel thin.
- Boss intro, victory, and reward polish for all campaign bosses.
- Review all four endings for clarity, discoverability, and payoff.
- Story balance pass across enemies, bosses, XP, gold, shops, consumables, weapons, and skills.
- Full playthrough verification for Hero, Usurper, Wanderer, and Enlightened endings.

### Should Have

- More ASCII or staged text moments for major reveals.
- More NPC ask-topic coverage for lore and hints.
- Better hints for secret and alternate endings without spoiling them.
- More dynamic descriptions after rooms are solved.
- A release QA checklist for command friction and stuck points.

### Post-1.0

- Major new mechanics.
- Large Dungeon Mode expansion.
- New regions.
- More endings.
- Runtime schema tooling unless content churn makes it necessary.

## Workstreams

### 1. Campaign Flavor Audit

Create a room-by-room and scene-by-scene audit of the full story campaign. Each room should be rated:

- **Strong:** memorable, useful, and region-specific.
- **Serviceable:** functional, but could use stronger flavor or purpose.
- **Flat:** generic, under-signaled, confusing, or unrewarding.

The audit should also flag missing payoffs: rooms with no reason to revisit, secrets without hints, bosses without buildup, NPCs with too little useful dialogue, ending requirements that are too obscure, and rewards that feel accidental.

### 2. Content Polish Pass

Use the audit to make targeted content changes, mostly through existing JSON data and rendering hooks:

- Stronger room prose.
- Better `description_cleared` text.
- More meaningful search discoveries.
- Region-specific enemy flavor.
- Better NPC ask topics and hint coverage.
- Lore breadcrumbs that support the digital-corruption reveal.
- Reward placement that makes exploration feel intentional.

Content changes should improve the authored feel of the campaign without making the game verbose. The terminal should remain fast to read and easy to scan.

### 3. Set-Piece Polish Pass

Give special handling to the scenes players are most likely to remember:

- Title and new-game opening.
- Manor boss and transition to Wilds.
- Wren and Ancient Map reveal.
- Darkness corruption reveal.
- Last Keeper scene.
- Evil King confrontation.
- Wanderer exit.
- Enlightened diner reveal.

Use existing tools first: ASCII art, effects, sound cues, typewriter pacing, staged terminal lines, region tint, dynamic descriptions, objectives, and NPC dialogue. Add new systems only if an existing surface cannot support a required campaign moment cleanly.

### 4. Balance Pass

Tune the main story curve after content polish, not before. The target is:

- Regular fights stay brisk.
- Bosses test preparation without requiring grinding.
- Shops matter because stock, prices, and timing are meaningful.
- Consumables are useful but not mandatory for every fight.
- Weapon progression feels rewarding.
- Skills feel useful by the time they unlock.
- Alternate endings do not require tedious backtracking or unclear farming.

The pass should review enemy HP/ATK/DEF, boss specials, XP and gold rewards, shop prices, finite stock, consumable availability, weapon placement, skill utility, and expected player level by region.

### 5. Release Verification

Verify the campaign as a player-facing product, not just as isolated systems:

- Fresh-save playthrough for The Hero.
- Fresh-save or controlled-state playthrough for The Usurper.
- Fresh-save or controlled-state playthrough for The Wanderer.
- Fresh-save or controlled-state playthrough for The Enlightened.
- Stuck-point audit for command clarity, objective guidance, map usefulness, and secret hints.
- Browser smoke pass for first room, combat, shops, boss art, region transitions, minimap/journal, and ending scenes.
- Clean `npm test`, `npm run lint`, and build verification before release.

## Implementation Boundaries

The 1.0 pass should mostly use existing architecture.

Primary edit surfaces:

- `src/data/regions/*.json` for room descriptions, cleared descriptions, room contents, exits, search rewards, enemies, and NPC placement.
- `src/data/npcs.json` for stronger dialogue, hints, lore, and ask-topic coverage.
- `src/data/objectives.json` if new or clearer quest guidance is needed.
- `src/data/enemies.json`, `src/data/items.json`, `src/data/weapons.json`, `src/data/armor.json`, `src/data/accessories.json`, and `src/data/shops.json` for balance.
- `src/assets/ascii/*.txt` plus existing ASCII registration if a set piece needs new art.

Engine changes should be rare. Good candidates are small extensions to existing systems, such as a new objective trigger, a reusable staged-scene helper, or better content validation. Avoid large new mechanics before 1.0 unless the campaign genuinely cannot land without them.

## Player Experience Rule

Every change should answer at least one of these questions:

- Does this make a region more memorable?
- Does this make an ending clearer or more satisfying?
- Does this make combat pacing better?
- Does this reduce confusion without spoiling discovery?
- Does this make exploration feel more intentional?

If a proposed change does not answer one of those questions, it should be deferred.

## Testing Strategy

Testing should scale with the edit type:

- Pure content edits should be covered by existing content validation, build checks, and scenario coverage for affected paths.
- New or changed objective behavior needs unit coverage for objective logic and scenario coverage for player-facing triggers.
- New player-facing commands or flows need scenario tests.
- New engine helpers need matching unit tests.
- Any tick-driven visual state must update `VisualSnapshot`, snapshot capture/diff logic, and `test/unit/frame-loop.test.ts`.
- Frontend-visible changes need a browser smoke pass against `npm run dev -- --host 127.0.0.1`.

## Definition of Done

- All five regions have a documented audit.
- Every flat or confusing campaign-critical area is improved or explicitly deferred.
- All four endings can be reached and feel sufficiently hinted.
- Bosses have clear buildup, readable combat pressure, and satisfying aftermath.
- Balance supports a normal full campaign without grinding.
- Release verification covers the major story routes and visible surfaces.
- `npm test`, `npm run lint`, and browser smoke checks are clean.

