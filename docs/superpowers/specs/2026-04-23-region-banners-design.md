# Region Banners Design

## Goal

Give each of the five regions a distinct ASCII banner that renders at the top of the terminal while the player is in that region. The banner is decorative, persistent while the region is active, and replaces itself when the player crosses into another region. This is pure ambience — no gameplay effects, no new input.

## Current Behavior

- The terminal has one fixed header line showing stats (`HP`, `LVL`, `G`, weapon) plus a 1px separator, then scrollback, then input.
- Region identity is conveyed only via the CRT tint shift applied in `applyRegionTint` and the ambient audio loop.
- `src/engine/asciiArt.ts` already loads raw-text art for the title, death screen, and bosses. Two orphaned assets (`forest.txt`, `excalibur.txt`) are not referenced by any code — out of scope for this change, but worth mentioning for cleanup.

## Design

### Where the banner lives

A new element renders between the stats header and the separator, inside the `.terminal` div so it inherits the shake transform and base color:

```
┌───────────────────────────────────────────┐
│ MYSTICQUEST v1.0  HP:20/20  LVL:1  G:0    │  ← existing header
├───────────────────────────────────────────┤
│     /\    /\    /\                        │  ← new banner (5-7 lines)
│    /  \  /  \  /  \                       │
│    ||   ||   ||                           │
├───────────────────────────────────────────┤  ← existing separator
│ (scrollback)                              │
└───────────────────────────────────────────┘
```

- Height: 5-7 lines of ASCII per region. Fixed per asset, not animated.
- Color: the base color from `store.baseColor`, dimmed to ~60% opacity, so it reads as background decoration rather than competing with scrollback.
- Whitespace: `white-space: pre` so the art renders literally.
- No interactivity. `pointer-events: none` to keep the click-to-focus behavior on the input.

### When the banner shows

Show iff `store.currentRegion` is non-null. This covers every gameplay state where the player is "in the world" (exploring, combat, dialogue, shop, skill_tree, minimap) because all of those preserve `currentRegion`. Menu, boot, settings, slot-picker, ending, and quit clear the region or never set it.

No new store field needed. No new reducer state needed. Rendering is derived purely from the existing `currentRegion`.

### Content

Five new asset files, one per region:

- `src/assets/ascii/region_manor.txt` — gabled manor silhouette
- `src/assets/ascii/region_wilds.txt` — pine/forest canopy
- `src/assets/ascii/region_darkness.txt` — cave/abyss with drips
- `src/assets/ascii/region_wastes.txt` — ruined columns/dunes
- `src/assets/ascii/region_hidden.txt` — abstract mystical glyphs

All files use plain ASCII (no box-drawing Unicode) for consistent rendering in the monospace font. Width capped at 40 characters so the banner doesn't force horizontal overflow on narrow windows.

### Loading

Extend `ASCII_MAP` in `src/engine/asciiArt.ts` with the five `region_*` keys. Add a small helper:

```ts
export function getRegionArtName(region: string | null): string | null {
  if (!region) return null;
  const key = `region_${region}`;
  return key in ASCII_MAP ? key : null;
}
```

This keeps the component layer free of hard-coded region strings — adding a sixth region becomes "add the JSON rooms, add the asset, add the ASCII_MAP entry, done."

### Snapshot invariant

`currentRegion` is only mutated inside `applyRegionTint`, which is called from `enterRoom`, lifecycle init, and handlers — none of which run during a reducer tick. The existing `forceRender()` calls in those code paths already cover banner updates. No change to `VisualSnapshot` is required.

This will be verified by inspection during implementation, not assumed.

### Tradeoffs

**Why a header strip rather than a full-bleed background layer:**
- CRT scanlines, flicker, and vignette already layer over the terminal. A faint full-screen ASCII layer fights those and risks muddying the scrollback.
- The header strip is the same pattern as the existing stats header and the minimap overlay — consistent with the app's vocabulary.

**Why store no banner state on `GameStore`:**
- Region is already the source of truth. Duplicating it into a `banner` field invites drift.
- Cheap to derive on every render — 5 small string tables, no layout computation.

**Why hand-authored per-region art rather than procedural:**
- Five one-shot art pieces are a smaller cost than a procedural system, and this is an aesthetic feature where authored art beats generated art every time.

## Out of Scope for V1

- Banner on menu/boot/settings screens. The title screen already serves that role.
- Removing the orphaned `forest.txt` / `excalibur.txt` assets. Flag as a separate cleanup.
- Per-room art. Region-level granularity is enough.

## V2 — Animated Banners

V1 ships static art. V2 adds motion: wind rippling through wilds trees, drips falling in darkness, dust drifting across wastes, sigils twinkling in hidden, lanterns flickering in manor.

Design direction (not locked — revisit when V1 ships):

- **Frame-based**: each region ships N frames (e.g., `region_wilds_0.txt` through `region_wilds_3.txt`) with a fixed cadence (e.g., 500ms/frame). Cheapest to author, reads as "stop-motion."
- **Particle-based**: banner art has "slots" where characters animate independently (a `*` that moves one column per tick, a `.` that fades through ascii gradient). More work per region, smoother motion.
- **Shader-style**: a per-region procedural function receives `(t, x, y)` and returns a char. Most flexible, hardest to author.

V2 MUST NOT regress V1:
- Must still respect the CRT effects (shake, tint, flicker) without desyncing.
- Must have a "reduce motion" setting that falls back to the V1 static frame. The existing `settings.reduceMotion` toggle is the integration point.
- Must be cheap enough to run at 60fps alongside the typewriter, effects, and audio. If it forces extra reducer ticks, it needs a corresponding `VisualSnapshot` update.

The V1 art files should be authored with V2 in mind — i.e., leave whitespace in places where a particle could plausibly drift, rather than packing every cell with detail.

## Success Criteria

- Entering any room in a region shows that region's banner at the top of the terminal.
- Crossing regions (manor → wilds via the front door, wilds → darkness via the cellar, etc.) swaps the banner in the same tick as the tint change.
- Returning to the main menu hides the banner.
- The banner does not shift the stats header or interfere with scrollback layout.
- All existing tests still pass. New unit tests cover the art-loading helper and assert all five region assets exist.
