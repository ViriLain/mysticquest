# Animated Region Banners Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add subtle frame-based animation to region banners while preserving the static v1 banner behavior under reduce motion.

**Architecture:** Keep animation frame generation pure in `src/engine/asciiArt.ts`; keep timing in `src/components/Game.tsx`. Do not add reducer fields, save data, or `VisualSnapshot` fields because banner frames are component-local visual ambience.

**Tech Stack:** Vite 5, React 18, TypeScript, Vitest.

---

## File Structure

- Modify `src/engine/asciiArt.ts`: add `getRegionAsciiLines(region, frameIndex, reduceMotion)` and deterministic frame transforms.
- Modify `src/components/Game.tsx`: replace direct static region art lookup with animated helper and component-local frame refs.
- Modify `test/unit/asciiArt.test.ts`: add unit coverage for reduce-motion fallback and animated frame differences.

## Task 1: Pure Animated Banner Helper

**Files:**
- Modify: `test/unit/asciiArt.test.ts`
- Modify: `src/engine/asciiArt.ts`

- [ ] **Step 1: Write failing tests**

Add tests that assert:

```ts
expect(getRegionAsciiLines('manor', 0, false)).toEqual(getAsciiLines('region_manor'));
expect(getRegionAsciiLines('manor', 1, true)).toEqual(getAsciiLines('region_manor'));
expect(getRegionAsciiLines('manor', 1, false)).not.toEqual(getAsciiLines('region_manor'));
expect(getRegionAsciiLines(null, 0, false)).toBeNull();
expect(getRegionAsciiLines('atlantis', 0, false)).toBeNull();
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run:

```bash
npm test -- test/unit/asciiArt.test.ts
```

Expected: FAIL because `getRegionAsciiLines` is not exported.

- [ ] **Step 3: Implement minimal helper**

In `src/engine/asciiArt.ts`:

- Export `getRegionAsciiLines`.
- Return static lines for null/unknown/reduce-motion/static frame.
- Apply deterministic small transforms for frame indexes `1` and `2`.

- [ ] **Step 4: Run targeted test and verify GREEN**

Run:

```bash
npm test -- test/unit/asciiArt.test.ts
```

Expected: PASS.

## Task 2: Component Timing

**Files:**
- Modify: `src/components/Game.tsx`

- [ ] **Step 1: Write failing test or targeted type check**

The helper carries most behavior. For the component, use TypeScript/build verification after wiring because the timing is requestAnimationFrame-driven and currently not component-tested.

- [ ] **Step 2: Wire helper into render**

In `Game.tsx`:

- Import `getRegionAsciiLines` instead of `getAsciiLines/getRegionArtName` for banners.
- Add `regionBannerFrameRef` and `regionBannerTimerRef`.
- Advance the frame every 0.5 seconds when `store.currentRegion` exists and `reduceMotion` is false.
- Reset frame/timer when region changes.
- Keep existing color and layout.

- [ ] **Step 3: Run validation**

Run:

```bash
npm run build
npm test -- test/unit/asciiArt.test.ts
```

Expected: both PASS.

## Task 3: Full Verification and Browser Smoke

**Files:**
- No further source changes expected.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run lint
npm test
npm run build
```

Expected: all exit 0.

- [ ] **Step 2: Browser smoke**

Run the dev server:

```bash
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/`, start a new game, and verify:

- Manor banner renders in the header region.
- Banner changes over time with reduce motion off.
- Console has no warnings or errors.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-04-24-animated-region-banners-design.md docs/superpowers/plans/2026-04-24-animated-region-banners.md src/engine/asciiArt.ts src/components/Game.tsx test/unit/asciiArt.test.ts
git commit -m "Animate region banners"
```
