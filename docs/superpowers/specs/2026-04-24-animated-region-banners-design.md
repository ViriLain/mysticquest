# Animated Region Banners Design

## Goal

Add subtle motion to the five region banners without changing gameplay, reducer state, save data, or command behavior. The current static banners are the v1 baseline; animation is a v2 ambience layer that must fall back cleanly when reduce motion is enabled.

## Current Behavior

- `src/components/Game.tsx` derives the active banner from `store.currentRegion`.
- `src/engine/asciiArt.ts` imports one static ASCII asset per region and exposes `getRegionArtName`.
- The banner renders between the stats header and separator as `.terminal-region-banner`.
- `settings.reduceMotion` already disables shake/glitch motion in `Game.tsx`.

## Design

Use a small pure helper in `asciiArt.ts` to produce banner frames:

- `getRegionAsciiLines(region, frameIndex, reduceMotion)` returns the visible banner lines for the region.
- `reduceMotion === true` always returns the static v1 art.
- Unknown or null regions return `null`.
- Frame effects are deterministic and small: no randomness, no reducer interaction, no asset loading at runtime.

The component owns animation timing:

- `Game.tsx` keeps `regionBannerFrameRef` and `regionBannerTimerRef`.
- During the existing requestAnimationFrame loop, if a region banner is visible and reduce motion is off, advance the frame every 0.5 seconds and force a render.
- Reset the frame to 0 when `currentRegion` changes.
- Do not update `GameStore`, `VisualSnapshot`, saves, or engine tick logic.

Frame style by region:

- Manor: lantern/window flicker by toggling a few `[]` cells.
- Wilds: canopy sway by shifting a small set of slash characters.
- Darkness: drip/static pulse using sparse dots in existing open space.
- Wastes: dust drift using periods across the dune/column area.
- Hidden: glyph twinkle by alternating punctuation in the abstract banner.

## Testing

Add unit tests in `test/unit/asciiArt.test.ts`:

- Static fallback remains available for all five regions.
- `reduceMotion` returns the exact static frame even for non-zero frame indexes.
- At least one animated frame differs from the static frame for each region.
- Unknown/null region returns `null`.

Add or update component-adjacent coverage only if the helper boundary is insufficient. Browser smoke test after implementation should confirm:

- A new game still shows the manor banner.
- The banner changes over time when reduce motion is off.
- Console has no warnings or errors.

## Out of Scope

- Per-room banners.
- New region art assets.
- CSS keyframe animation.
- Animation during boot, menu, ending, gameover, or screens without an active region header.
- Any save migration or reducer snapshot changes.
