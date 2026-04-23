# Region Banners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a per-region ASCII banner at the top of the terminal, swapping with the region tint and ambient audio as the player moves between the five regions.

**Scope note — V1 is static.** Animated banners (drifting sigils, flickering lanterns, rustling trees) are explicitly V2 work, tracked in the spec's "V2 — Animated Banners" section. V1 must leave the door open for V2 without paying for it now: author art files with breathing room for future particles, and keep the rendering path simple (no per-frame timers, no extra reducer ticks).

**Architecture:** Five new ASCII art files loaded by the existing `asciiArt.ts` registry. A small lookup helper maps `store.currentRegion` to an art key. `Game.tsx` renders the resulting lines as a new strip between the stats header and the separator. No new store state.

**Tech Stack:** TypeScript, React 18, Vite (raw-string imports), Vitest, CSS.

---

## File Structure

**Create:**
- `src/assets/ascii/region_manor.txt` — manor art
- `src/assets/ascii/region_wilds.txt` — wilds art
- `src/assets/ascii/region_darkness.txt` — darkness art
- `src/assets/ascii/region_wastes.txt` — wastes art
- `src/assets/ascii/region_hidden.txt` — hidden art

**Modify:**
- `src/engine/asciiArt.ts` — register region assets, export `getRegionArtName`
- `src/components/Game.tsx` — render the banner strip
- `src/styles/terminal.css` — add `.terminal-region-banner` styles
- `test/unit/asciiArt.test.ts` — extend or create tests for region art lookup

---

### Task 1: Author the five region ASCII art files

Each file is a small (5-7 line, max 40 char wide) ASCII banner. Pure ASCII, no Unicode box-drawing characters.

**Files:**
- Create: `src/assets/ascii/region_manor.txt`
- Create: `src/assets/ascii/region_wilds.txt`
- Create: `src/assets/ascii/region_darkness.txt`
- Create: `src/assets/ascii/region_wastes.txt`
- Create: `src/assets/ascii/region_hidden.txt`

- [ ] **Step 1: Write `region_manor.txt`**

```
        /\      /\      /\
       /  \    /  \    /  \
      /____\__/____\__/____\
      | [] |  | [] |  | [] |
      | [] |__| [] |__| [] |
      |____|  |____|  |____|
```

- [ ] **Step 2: Write `region_wilds.txt`**

```
     /\    /\    /\    /\
    /  \  /  \  /  \  /  \
   /    \/    \/    \/    \
       ||    ||    ||
       ||    ||    ||
    ~~~~~~~~~~~~~~~~~~~~~~~~
```

- [ ] **Step 3: Write `region_darkness.txt`**

```
   ^~~~^~~~~^~~~~^~~~~^~~~^
      .     *        .
        *       .
     .      *      .    *
        .       *
   ______..___..____..___
```

- [ ] **Step 4: Write `region_wastes.txt`**

```
      _____       _____
     |     |  .  |     |
     | |_| |     | |_| |
     |_____|_____|_____|
     .    .    .   .    .
    .__.__.__.__.__.__.__
```

- [ ] **Step 5: Write `region_hidden.txt`**

```
       .   *   .   *   .
     *   . + .   . + .   *
       + * . * + * . * +
     *   . + .   . + .   *
       .   *   .   *   .
```

- [ ] **Step 6: Commit**

```bash
git add src/assets/ascii/region_*.txt
git commit -m "Add region banner ASCII art"
```

---

### Task 2: Register region art and add lookup helper

Wire the five new assets through the existing `ASCII_MAP` registry and expose a typed lookup that converts `currentRegion` into an art key.

**Files:**
- Modify: `src/engine/asciiArt.ts:1-32`
- Modify/Create: `test/unit/asciiArt.test.ts`

- [ ] **Step 1: Write failing test for `getRegionArtName`**

Create or extend `test/unit/asciiArt.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { getAsciiLines, getRegionArtName } from '../../src/engine/asciiArt';

describe('getRegionArtName', () => {
  it('returns null for null region', () => {
    expect(getRegionArtName(null)).toBeNull();
  });

  it('returns null for unknown region', () => {
    expect(getRegionArtName('atlantis')).toBeNull();
  });

  it.each(['manor', 'wilds', 'darkness', 'wastes', 'hidden'])(
    'returns a loadable key for region %s',
    (region) => {
      const key = getRegionArtName(region);
      expect(key).toBe(`region_${region}`);
      const lines = getAsciiLines(key!);
      expect(lines).not.toBeNull();
      expect(lines!.length).toBeGreaterThan(0);
    }
  );

  it('region art lines never exceed 40 columns', () => {
    for (const region of ['manor', 'wilds', 'darkness', 'wastes', 'hidden']) {
      const lines = getAsciiLines(`region_${region}`)!;
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(40);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/asciiArt.test.ts`
Expected: FAIL — `getRegionArtName` is not exported, imports fail.

- [ ] **Step 3: Update `src/engine/asciiArt.ts`**

Replace the full file contents with:

```ts
// Import all ASCII art files as raw strings
import title from '../assets/ascii/title.txt?raw';
import death from '../assets/ascii/death.txt?raw';
import bossCellarShade from '../assets/ascii/boss_cellar_shade.txt?raw';
import bossEvilKing from '../assets/ascii/boss_evil_king.txt?raw';
import bossMilo from '../assets/ascii/boss_milo.txt?raw';
import bossMountainTroll from '../assets/ascii/boss_mountain_troll.txt?raw';
import bossOblivionGuardian from '../assets/ascii/boss_oblivion_guardian.txt?raw';
import bossRuinsGuardian from '../assets/ascii/boss_ruins_guardian.txt?raw';
import regionManor from '../assets/ascii/region_manor.txt?raw';
import regionWilds from '../assets/ascii/region_wilds.txt?raw';
import regionDarkness from '../assets/ascii/region_darkness.txt?raw';
import regionWastes from '../assets/ascii/region_wastes.txt?raw';
import regionHidden from '../assets/ascii/region_hidden.txt?raw';

const ASCII_MAP: Record<string, string> = {
  title,
  death,
  boss_cellar_shade: bossCellarShade,
  boss_evil_king: bossEvilKing,
  boss_milo: bossMilo,
  boss_mountain_troll: bossMountainTroll,
  boss_oblivion_guardian: bossOblivionGuardian,
  boss_ruins_guardian: bossRuinsGuardian,
  region_manor: regionManor,
  region_wilds: regionWilds,
  region_darkness: regionDarkness,
  region_wastes: regionWastes,
  region_hidden: regionHidden,
};

export function getAsciiLines(name: string): string[] | null {
  const content = ASCII_MAP[name];
  if (!content) return null;
  const lines = content.split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

export function getRegionArtName(region: string | null): string | null {
  if (!region) return null;
  const key = `region_${region}`;
  return key in ASCII_MAP ? key : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/asciiArt.test.ts`
Expected: PASS — all `getRegionArtName` tests green.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS — 331+ tests including the new ones.

- [ ] **Step 6: Commit**

```bash
git add src/engine/asciiArt.ts test/unit/asciiArt.test.ts
git commit -m "Register region art and add getRegionArtName lookup"
```

---

### Task 3: Add CSS for the region banner strip

The banner sits between `.terminal-header` and `.terminal-separator`. It must preserve whitespace, dim slightly relative to text, and not intercept pointer events.

**Files:**
- Modify: `src/styles/terminal.css:15-25`

- [ ] **Step 1: Add the banner rule**

Insert after the `.terminal-header` rule and before `.terminal-separator`:

```css
.terminal-region-banner {
  flex-shrink: 0;
  white-space: pre;
  padding: 4px 0;
  opacity: 0.6;
  pointer-events: none;
  user-select: none;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/terminal.css
git commit -m "Add .terminal-region-banner styles"
```

---

### Task 4: Render the banner in Game.tsx

Compute the banner lines from `store.currentRegion` at render time and insert the strip above the existing separator.

**Files:**
- Modify: `src/components/Game.tsx:1-20` (imports)
- Modify: `src/components/Game.tsx:314-322` (header JSX)

- [ ] **Step 1: Add the import**

Add to the existing engine imports near the top of `src/components/Game.tsx`:

```ts
import { getAsciiLines, getRegionArtName } from '../engine/asciiArt';
```

- [ ] **Step 2: Compute banner lines inside the component**

Place this just above the `return (` in the component body, after `const hasSave = ...`:

```ts
const regionArtKey = getRegionArtName(store.currentRegion);
const regionBannerLines = regionArtKey ? getAsciiLines(regionArtKey) : null;
```

- [ ] **Step 3: Render the banner in the header JSX**

Replace the existing header block (currently the fragment inside `{store.header.title && store.header.maxHp > 0 && (...)}` at `src/components/Game.tsx:315-322`) with:

```tsx
{store.header.title && store.header.maxHp > 0 && (
  <>
    <div className="terminal-header" style={{ color: headerColor }}>
      {`${store.header.title}    HP:${store.header.hp}/${store.header.maxHp}  LVL:${store.header.level}  G:${store.header.gold}  ${store.header.weapon}`}
    </div>
    {regionBannerLines && (
      <div className="terminal-region-banner" style={{ color: headerColor }}>
        {regionBannerLines.join('\n')}
      </div>
    )}
    <div className="terminal-separator" style={{ backgroundColor: dimColor }} />
  </>
)}
```

- [ ] **Step 4: Run lint and build**

Run: `npm run lint && npm run build`
Expected: PASS — no ESLint errors, `tsc -b` clean, Vite bundles.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS — no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/components/Game.tsx
git commit -m "Render region banner above terminal separator"
```

---

### Task 5: Manual verification in the dev server

Automated tests cover data plumbing. The visual integration needs a human in the loop.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open: `http://localhost:5173/`

- [ ] **Step 2: Verify banner appears in each region**

Walk through each region and confirm:

- Start new game → manor banner visible, stats header still readable above it.
- Leave manor to wilds → banner swaps to wilds art in the same step as the tint change.
- Cellar / darkness → darkness banner.
- Wastes → wastes banner.
- Hidden → hidden banner, rainbow tint still animates.

- [ ] **Step 3: Verify banner hides when it should**

- `quit` / return to menu → banner gone.
- Before starting a new game (title screen) → banner gone.

- [ ] **Step 4: Verify layout holds**

- Banner doesn't push scrollback off-screen.
- Banner doesn't flicker on typewriter advances.
- Text entry still works by clicking anywhere (banner has `pointer-events: none`).
- CRT effects (shake on hit) move the banner together with the rest of the terminal.

- [ ] **Step 5: If any check fails**

Stop the plan and fix the root cause. Do not ship partial behavior. Common failure modes:

- Banner visible on menu → `currentRegion` wasn't cleared on return-to-menu; confirm `lifecycle.ts:29` clears it.
- Banner doesn't swap → `applyRegionTint` isn't being called on region change; check `enterRoom` path.
- Layout shifts → `flex-shrink: 0` missing on `.terminal-region-banner`.

- [ ] **Step 6: Commit any follow-up fixes separately**

If Step 5 required a change, commit it as its own commit with a message describing the fix, not amended into an earlier task commit.

---

## Self-Review Notes

- All five region assets are authored in Task 1 with concrete content — no placeholders.
- The lookup helper name (`getRegionArtName`) and signature (`(region: string | null) => string | null`) are consistent between Task 2's test, Task 2's implementation, and Task 4's call site.
- Snapshot invariant: `currentRegion` does not mutate during reducer ticks (verified by `grep` over the codebase — only set in `applyRegionTint`, only called from handler / lifecycle paths). No `VisualSnapshot` change required. If Task 5 reveals staleness, revisit this assumption.
- Orphan files (`forest.txt`, `excalibur.txt`) remain on disk per the "out of scope" note in the spec.
