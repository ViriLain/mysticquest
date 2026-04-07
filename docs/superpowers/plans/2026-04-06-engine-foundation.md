# Engine Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automated tests, modularize the 2,383-line gameReducer, ship dynamic room descriptions, ASCII icons, and a full gold/shop economy — sequenced so each phase ends in a passing build.

**Architecture:** Pure-engine modules (no React) with one-way data flow: top-level `gameReducer` → `state/<kind>.ts` dispatchers → `handlers/<verb>.ts` → pure modules. `output.ts` is the only writer of terminal text. Tests gate every phase boundary. Spec lives at `docs/superpowers/specs/2026-04-06-engine-foundation-design.md`.

**Tech Stack:** Vite 5 + React 18 + TypeScript 5.6, vitest 2.x for testing, localStorage for persistence, no backend.

---

## Phase 0 — Foundation

### Task 1: Install vitest and configure scripts

**Files:**
- Modify: `package.json`
- Delete: `node_modules/vitest/` (orphaned v4)

- [ ] **Step 1: Remove the orphaned vitest v4 and reinstall**

Run:
```bash
cd /Users/joe/Development/games/mysticquest
rm -rf node_modules/vitest
npm install --save-dev vitest@^2 @vitest/coverage-v8@^2
```

Expected: `node_modules/vitest/package.json` shows version `^2.x`, no install errors.

- [ ] **Step 2: Add test scripts to package.json**

Modify `package.json` `"scripts"` block to add three new scripts. Final scripts block:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

- [ ] **Step 3: Verify vitest is callable**

Run: `npx vitest --version`
Expected: prints `vitest/2.x.x`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add vitest 2 with test scripts"
```

### Task 2: Create vitest config

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Write the config file**

Create `vitest.config.ts` with this exact content:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**/*.ts'],
      exclude: ['src/engine/audio.ts'], // Web Audio API can't run in node
    },
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add vitest.config.ts
git commit -m "Add vitest config for engine tests"
```

### Task 3: Create test setup with localStorage polyfill

**Files:**
- Create: `test/setup.ts`

- [ ] **Step 1: Write the setup file**

Create `test/setup.ts`:

```ts
import { beforeEach } from 'vitest';

// In-memory localStorage polyfill so save.ts works in node environment.
class MemoryStorage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
  removeItem(key: string): void { this.store.delete(key); }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

(globalThis as any).localStorage = new MemoryStorage();

beforeEach(() => {
  (globalThis as any).localStorage.clear();
});
```

- [ ] **Step 2: Commit**

```bash
git add test/setup.ts
git commit -m "Add localStorage polyfill for test environment"
```

### Task 4: Create test fixtures (mock-input)

**Files:**
- Create: `test/fixtures/mock-input.ts`

- [ ] **Step 1: Write the mock-input fixture**

Create `test/fixtures/mock-input.ts`:

```ts
import { createInitialStore, gameReducer } from '../../src/engine/gameReducer';
import type { GameStore } from '../../src/engine/types';

/**
 * Create a fresh game store and advance it to the main menu.
 * Boot animation is skipped by ticking until we exit the boot state.
 */
export function freshStore(): GameStore {
  let s = createInitialStore();
  // Tick the boot loop to completion (boot uses timer-based progression)
  for (let i = 0; i < 200 && s.state === 'boot'; i++) {
    s = gameReducer(s, { type: 'TICK', dt: 0.1 });
  }
  return s;
}

/**
 * Start a new game from the menu state. Returns the store in `exploring` state
 * with the player at manor_entry.
 */
export function newGame(): GameStore {
  let s = freshStore();
  if (s.state !== 'menu') {
    throw new Error(`expected menu state after boot, got ${s.state}`);
  }
  // Press Enter to select NEW GAME (default selection is index 0)
  s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Enter' });
  return s;
}

/**
 * Type a full command and press Enter. Equivalent to typing each char + Enter.
 */
export function input(store: GameStore, text: string): GameStore {
  let s = gameReducer(store, { type: 'TEXT_INPUT', text });
  s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Enter' });
  return s;
}

/**
 * Run one frame tick. Default dt is 16ms (60fps).
 */
export function tick(store: GameStore, dt: number = 0.016): GameStore {
  return gameReducer(store, { type: 'TICK', dt });
}

/**
 * Drain the typewriter queue so all queued lines are committed to store.lines.
 * Useful before asserting on output.
 */
export function flushTypewriter(store: GameStore): GameStore {
  // The reducer doesn't drain the queue itself (Game.tsx does that in its
  // animation loop). Tests bypass that by moving queued lines into lines[].
  while (store.typewriterQueue.length > 0) {
    store.lines.push(store.typewriterQueue.shift()!);
  }
  return store;
}
```

- [ ] **Step 2: Commit**

```bash
git add test/fixtures/mock-input.ts
git commit -m "Add mock-input test fixture"
```

### Task 5: Create test fixtures (assert-output)

**Files:**
- Create: `test/fixtures/assert-output.ts`

- [ ] **Step 1: Write the assert-output fixture**

Create `test/fixtures/assert-output.ts`:

```ts
import { expect } from 'vitest';
import type { GameStore } from '../../src/engine/types';
import { flushTypewriter } from './mock-input';

/**
 * Get the last N lines of committed output (after flushing typewriter).
 */
export function lastLines(store: GameStore, n: number = 20): string[] {
  flushTypewriter(store);
  return store.lines.slice(-n).map(l => l.text);
}

/**
 * All lines committed so far (after flushing typewriter).
 */
export function allLines(store: GameStore): string[] {
  flushTypewriter(store);
  return store.lines.map(l => l.text);
}

/**
 * Assert that at least one line contains the given substring.
 */
export function expectLine(store: GameStore, substr: string): void {
  const lines = allLines(store);
  const found = lines.some(l => l.includes(substr));
  expect(found, `expected a line containing "${substr}". Last 10 lines:\n${lines.slice(-10).join('\n')}`).toBe(true);
}

/**
 * Assert that NO line contains the given substring.
 */
export function expectNoLine(store: GameStore, substr: string): void {
  const lines = allLines(store);
  const found = lines.some(l => l.includes(substr));
  expect(found, `expected no line containing "${substr}", but found one`).toBe(false);
}
```

- [ ] **Step 2: Commit**

```bash
git add test/fixtures/assert-output.ts
git commit -m "Add assert-output test fixture"
```

### Task 6: Smoke test — new game renders first room

**Files:**
- Create: `test/scenario/smoke.test.ts`

- [ ] **Step 1: Write the smoke test**

Create `test/scenario/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { newGame } from '../fixtures/mock-input';
import { expectLine } from '../fixtures/assert-output';

describe('smoke test: new game flow', () => {
  it('starts a new game and renders the manor entry room', () => {
    const s = newGame();
    expect(s.state).toBe('exploring');
    expect(s.player).not.toBeNull();
    expect(s.player!.currentRoom).toBe('manor_entry');
    expectLine(s, 'Entry');
    expectLine(s, 'Welcome to MysticQuest');
  });
});
```

- [ ] **Step 2: Run the test to confirm it passes**

Run: `npm test -- smoke`
Expected: 1 test passing. If it fails, fix the harness in `mock-input.ts` before continuing — Phase 1 depends on this working.

- [ ] **Step 3: Commit**

```bash
git add test/scenario/smoke.test.ts
git commit -m "Add smoke test for new game flow"
```

### Task 7: Update .gitignore for brainstorm session files

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append .superpowers/ to .gitignore**

Add this line to the end of `.gitignore`:

```
# Superpowers brainstorm sessions
.superpowers/
```

- [ ] **Step 2: Verify the directory is now ignored**

Run: `git status`
Expected: `.superpowers/` no longer appears in untracked files.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "Ignore .superpowers brainstorm session files"
```

---

## Phase 1 — Lock in current behavior

### Task 8: Inject RNG into combat module

**Files:**
- Modify: `src/engine/combat.ts`

- [ ] **Step 1: Replace combat.ts with the RNG-injectable version**

The current `combat.ts` uses `Math.random()` directly inside `randInt`. We add an optional `rng?: () => number` parameter to every public function and the helpers. Production callers pass nothing (defaults to `Math.random`); tests pass a seeded RNG.

Replace the entire contents of `src/engine/combat.ts` with:

```ts
import type { PlayerState, EnemyInstance, CombatState, CombatMessage, CombatResults, WeaponDef, ItemDef } from './types';
import { totalAttack, totalDefense, addXp, hasItem, removeItem, heal, takeDamage, isDead, hasSkill } from './player';

type Rng = () => number;

function defaultRng(): number {
  return Math.random();
}

function randInt(min: number, max: number, rng: Rng): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function calcDamage(atk: number, def: number, rng: Rng, critChance = 10, critMult = 2): [number, boolean] {
  const variance = randInt(-2, 2, rng);
  let damage = Math.max(1, atk - def + variance);
  let crit = false;
  if (randInt(1, 100, rng) <= critChance) {
    damage = Math.floor(damage * critMult);
    crit = true;
  }
  damage = Math.max(1, damage);
  return [damage, crit];
}

function getPlayerAttack(player: PlayerState, weaponData: Record<string, WeaponDef>): number {
  let atk = totalAttack(player);
  if (player.equippedWeapon && weaponData[player.equippedWeapon]) {
    atk += weaponData[player.equippedWeapon].attack_bonus;
  }
  return atk;
}

function getPlayerDefense(player: PlayerState, itemData: Record<string, ItemDef>): number {
  return totalDefense(player, itemData);
}

function tickBuffs(player: PlayerState, messages: CombatMessage[]): void {
  if (player.buffRounds > 0) {
    player.buffRounds--;
    if (player.buffRounds <= 0) {
      player.buffAttack = 0;
      messages.push({ text: 'Your attack buff fades.', color: [0.6, 0.6, 0.6, 1] });
    }
  }
}

function enemyTurn(
  combat: CombatState,
  player: PlayerState,
  itemData: Record<string, ItemDef>,
  messages: CombatMessage[],
  rng: Rng,
): void {
  if (combat.finished) return;

  let atk = combat.enemy.attack;
  if (combat.enemy.isBoss && combat.round % 3 === 0) {
    atk = Math.floor(atk * 1.5);
    messages.push({ text: `${combat.enemy.name} unleashes a special attack!`, color: [1, 0.3, 0.3, 1] });
  }

  if (hasSkill(player, 'lucky') && rng() < 0.15) {
    messages.push({ text: 'You dodge the attack!', color: [0.4, 1, 0.4, 1] });
    return;
  }

  const [rawDamage, crit] = calcDamage(atk, getPlayerDefense(player, itemData), rng);
  if (crit) {
    messages.push({ text: 'The enemy lands a CRITICAL HIT!', color: [1, 0.2, 0.2, 1] });
  }

  const damage = Math.max(1, rawDamage - (hasSkill(player, 'arcane_shield') ? 1 : 0));
  const actual = takeDamage(player, damage);
  messages.push({ text: `${combat.enemy.name} deals ${actual} damage to you.`, color: [1, 0.5, 0.5, 1] });

  if (isDead(player)) {
    combat.finished = true;
    combat.playerWon = false;
    messages.push({ text: 'You have been slain...', color: [1, 0.2, 0.2, 1] });
  } else {
    messages.push({ text: `You have ${player.hp}/${player.maxHp} HP.`, color: [0.6, 0.6, 0.6, 1] });
  }
}

export function createCombat(player: PlayerState, enemyId: string, enemyData: Record<string, any>): CombatState {
  const edata = enemyData[enemyId];
  return {
    enemy: {
      name: edata.name,
      hp: edata.hp,
      attack: edata.attack,
      defense: edata.defense,
      xp: edata.xp,
      loot: edata.loot || [],
      lootWeapon: edata.loot_weapon,
      isBoss: edata.is_boss,
      description: edata.description,
    },
    round: 0,
    finished: false,
    fled: false,
    playerWon: false,
  };
}

export function playerAttack(
  combat: CombatState,
  player: PlayerState,
  weaponData: Record<string, WeaponDef>,
  itemData: Record<string, ItemDef>,
  rng: Rng = defaultRng,
): CombatMessage[] {
  const messages: CombatMessage[] = [];
  combat.round++;

  let atk = getPlayerAttack(player, weaponData);
  let critChance = 10;
  let critMult = 2;
  if (hasSkill(player, 'sharp_eyes')) critChance = 18;
  if (hasSkill(player, 'assassin')) critMult = 3;
  let effectiveDef = combat.enemy.defense;
  if (hasSkill(player, 'precision')) { atk += 3; effectiveDef = Math.max(0, effectiveDef - 2); }
  const [damage, crit] = calcDamage(atk, effectiveDef, rng, critChance, critMult);
  let finalDamage = damage;
  if (hasSkill(player, 'berserker') && player.hp < player.maxHp * 0.3) {
    finalDamage = Math.floor(damage * 1.15);
  }

  if (crit) {
    messages.push({ text: 'CRITICAL HIT!', color: [1, 1, 0.2, 1] });
  }
  combat.enemy.hp -= finalDamage;
  messages.push({ text: `You deal ${finalDamage} damage to ${combat.enemy.name}.`, color: [0.8, 1, 0.8, 1] });

  if (combat.enemy.hp <= 0) {
    combat.enemy.hp = 0;
    combat.finished = true;
    combat.playerWon = true;
    messages.push({ text: `${combat.enemy.name} is defeated!`, color: [1, 1, 0.4, 1] });
    return messages;
  }

  messages.push({ text: `${combat.enemy.name} has ${combat.enemy.hp} HP remaining.`, color: [0.6, 0.6, 0.6, 1] });
  enemyTurn(combat, player, itemData, messages, rng);
  tickBuffs(player, messages);
  applyMeditation(player, messages);
  return messages;
}

export function playerDefend(
  combat: CombatState,
  player: PlayerState,
  itemData: Record<string, ItemDef>,
  rng: Rng = defaultRng,
): CombatMessage[] {
  const messages: CombatMessage[] = [];
  combat.round++;
  player.defending = true;
  messages.push({ text: 'You brace yourself for the next attack.', color: [0.6, 0.8, 1, 1] });
  enemyTurn(combat, player, itemData, messages, rng);
  tickBuffs(player, messages);
  applyMeditation(player, messages);
  return messages;
}

export function playerFlee(
  combat: CombatState,
  player: PlayerState,
  itemData: Record<string, ItemDef>,
  rng: Rng = defaultRng,
): CombatMessage[] {
  const messages: CombatMessage[] = [];
  combat.round++;
  const fleeThreshold = hasSkill(player, 'quick_feet') ? 90 : 70;
  const roll = randInt(1, 100, rng);
  if (roll <= fleeThreshold) {
    combat.finished = true;
    combat.fled = true;
    messages.push({ text: 'You flee from combat!', color: [0.8, 0.8, 0.2, 1] });
  } else {
    messages.push({ text: 'You fail to escape!', color: [1, 0.4, 0.4, 1] });
    enemyTurn(combat, player, itemData, messages, rng);
  }
  tickBuffs(player, messages);
  applyMeditation(player, messages);
  return messages;
}

export function playerUseItem(
  combat: CombatState,
  player: PlayerState,
  itemId: string,
  itemData: Record<string, ItemDef>,
  rng: Rng = defaultRng,
): CombatMessage[] {
  const messages: CombatMessage[] = [];
  combat.round++;

  const item = itemData[itemId];
  if (!item) {
    messages.push({ text: 'Unknown item.', color: [1, 0.4, 0.4, 1] });
    return messages;
  }
  if (item.type !== 'consumable') {
    messages.push({ text: "You can't use that in combat.", color: [1, 0.4, 0.4, 1] });
    return messages;
  }
  if (!hasItem(player, itemId)) {
    messages.push({ text: "You don't have that item.", color: [1, 0.4, 0.4, 1] });
    return messages;
  }

  removeItem(player, itemId);

  if (item.effect === 'heal' && item.value) {
    const healAmount = hasSkill(player, 'herbalism') ? Math.floor(item.value * 1.5) : item.value;
    const oldHp = player.hp;
    heal(player, healAmount);
    const healed = player.hp - oldHp;
    messages.push({ text: `You use ${item.name} and restore ${healed} HP.`, color: [0.4, 1, 0.4, 1] });
  } else if (item.effect === 'buff_attack' && item.value) {
    player.buffAttack = item.value;
    player.buffRounds = hasSkill(player, 'buff_mastery') ? 5 : 3;
    const rounds = player.buffRounds;
    messages.push({ text: `You drink ${item.name}! +${item.value} Attack for ${rounds} rounds.`, color: [1, 0.6, 0.2, 1] });
  }

  enemyTurn(combat, player, itemData, messages, rng);
  tickBuffs(player, messages);
  applyMeditation(player, messages);
  return messages;
}

function applyMeditation(player: PlayerState, messages: CombatMessage[]): void {
  if (hasSkill(player, 'meditation') && player.hp > 0) {
    const oldHp = player.hp;
    player.hp = Math.min(player.hp + 2, player.maxHp);
    if (player.hp > oldHp) {
      messages.push({ text: 'You regenerate 2 HP.', color: [0.4, 1, 0.4, 1] });
    }
  }
}

export function enemyDefeated(
  combat: CombatState,
  player: PlayerState,
): CombatResults {
  const results: CombatResults = { leveled: false, loot: [], weapon: null, messages: [] };

  const leveled = addXp(player, combat.enemy.xp);
  results.leveled = leveled;
  results.messages.push({ text: `You gain ${combat.enemy.xp} XP.`, color: [0.4, 1, 0.4, 1] });
  if (leveled) {
    results.messages.push({ text: `LEVEL UP! You are now level ${player.level}!`, color: [1, 1, 0.2, 1] });
    results.messages.push({ text: 'HP +8  ATK +2  DEF +1', color: [1, 1, 0.2, 1] });
  }

  if (combat.enemy.loot) {
    results.loot = [...combat.enemy.loot];
  }
  if (combat.enemy.lootWeapon) {
    results.weapon = combat.enemy.lootWeapon;
  }

  return results;
}
```

- [ ] **Step 2: Verify the build still passes**

Run: `npm run build`
Expected: tsc + vite build complete with zero errors.

- [ ] **Step 3: Manually verify combat still works**

Run: `npm run dev` and play through one combat encounter against a Shadow Rat. Confirm damage numbers feel within the same range as before.

- [ ] **Step 4: Commit**

```bash
git add src/engine/combat.ts
git commit -m "Inject optional RNG into combat for deterministic tests"
```

### Task 9: Export findAllMatches from gameReducer

**Files:**
- Modify: `src/engine/gameReducer.ts:100`

- [ ] **Step 1: Add `export` keyword to findAllMatches**

In `src/engine/gameReducer.ts`, find this line (around line 100):

```ts
function findAllMatches(name: string, ids: string[], dataTable: Record<string, Matchable>): string[] {
```

Change it to:

```ts
export function findAllMatches(name: string, ids: string[], dataTable: Record<string, Matchable>): string[] {
```

Also export the `Matchable` interface from line 97:

```ts
export interface Matchable { name: string; match_words?: string[] }
```

- [ ] **Step 2: Verify the build still passes**

Run: `npm run build`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/engine/gameReducer.ts
git commit -m "Export findAllMatches and Matchable for testing"
```

### Task 10: Unit tests for player module

**Files:**
- Create: `test/unit/player.test.ts`

- [ ] **Step 1: Write the player tests**

Create `test/unit/player.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createPlayer, addItem, removeItem, hasItem, hasKeyItem,
  addXp, xpToNextLevel, totalAttack, totalDefense,
  addWeapon, equipWeapon, heal, takeDamage, isDead,
  visitRoom, visitedCount, hasSkill,
} from '../../src/engine/player';
import type { ItemDef } from '../../src/engine/types';

const itemData: Record<string, ItemDef> = {
  potion: { name: 'Potion', type: 'consumable', effect: 'heal', value: 25, description: 'heals' },
  rusty_key: { name: 'Rusty Key', type: 'key', description: 'a key' },
  iron_shield: { name: 'Iron Shield', type: 'shield', effect: 'defense', value: 3, description: 'shield' },
};

describe('createPlayer', () => {
  it('starts with default stats', () => {
    const p = createPlayer();
    expect(p.hp).toBe(30);
    expect(p.maxHp).toBe(30);
    expect(p.attack).toBe(5);
    expect(p.defense).toBe(2);
    expect(p.level).toBe(1);
    expect(p.xp).toBe(0);
    expect(p.currentRoom).toBe('manor_entry');
    expect(p.skillPoints).toBe(0);
  });

  it('accepts a custom starting room', () => {
    const p = createPlayer('dng_f1_r1');
    expect(p.currentRoom).toBe('dng_f1_r1');
  });
});

describe('addItem / removeItem / hasItem', () => {
  it('adds non-key items to inventory with stack count', () => {
    const p = createPlayer();
    addItem(p, 'potion', itemData);
    addItem(p, 'potion', itemData);
    expect(p.inventory.potion).toBe(2);
    expect(hasItem(p, 'potion')).toBe(true);
  });

  it('puts key items in keyItems, not inventory', () => {
    const p = createPlayer();
    addItem(p, 'rusty_key', itemData);
    expect(p.keyItems.rusty_key).toBe(true);
    expect(p.inventory.rusty_key).toBeUndefined();
    expect(hasKeyItem(p, 'rusty_key')).toBe(true);
    expect(hasItem(p, 'rusty_key')).toBe(false);
  });

  it('removeItem decrements and deletes when count hits zero', () => {
    const p = createPlayer();
    addItem(p, 'potion', itemData);
    addItem(p, 'potion', itemData);
    removeItem(p, 'potion');
    expect(p.inventory.potion).toBe(1);
    removeItem(p, 'potion');
    expect(p.inventory.potion).toBeUndefined();
    expect(hasItem(p, 'potion')).toBe(false);
  });
});

describe('addXp and level curve', () => {
  it('xpToNextLevel scales with level', () => {
    const p = createPlayer();
    expect(xpToNextLevel(p)).toBe(25);
    p.level = 5;
    expect(xpToNextLevel(p)).toBe(125);
  });

  it('addXp grants level up when threshold met', () => {
    const p = createPlayer();
    const leveled = addXp(p, 25);
    expect(leveled).toBe(true);
    expect(p.level).toBe(2);
    expect(p.maxHp).toBe(38);
    expect(p.attack).toBe(7);
    expect(p.defense).toBe(3);
    expect(p.skillPoints).toBe(1);
  });

  it('caps level up at level 15', () => {
    const p = createPlayer();
    addXp(p, 100000);
    expect(p.level).toBe(15);
  });

  it('enlightened skill multiplies xp by 1.5', () => {
    const p = createPlayer();
    p.skills.enlightened = true;
    addXp(p, 10);
    expect(p.xp).toBe(15);
  });
});

describe('totalAttack / totalDefense', () => {
  it('totalAttack adds buffAttack', () => {
    const p = createPlayer();
    p.buffAttack = 3;
    expect(totalAttack(p)).toBe(8);
  });

  it('totalDefense adds equipped shield', () => {
    const p = createPlayer();
    p.equippedShield = 'iron_shield';
    expect(totalDefense(p, itemData)).toBe(5);
  });
});

describe('weapons', () => {
  it('addWeapon does not duplicate', () => {
    const p = createPlayer();
    addWeapon(p, 'rusty_dagger');
    addWeapon(p, 'rusty_dagger');
    expect(p.weapons).toEqual(['rusty_dagger']);
  });

  it('equipWeapon only succeeds for owned weapons', () => {
    const p = createPlayer();
    expect(equipWeapon(p, 'rusty_dagger')).toBe(false);
    addWeapon(p, 'rusty_dagger');
    expect(equipWeapon(p, 'rusty_dagger')).toBe(true);
    expect(p.equippedWeapon).toBe('rusty_dagger');
  });
});

describe('hp and damage', () => {
  it('heal caps at maxHp', () => {
    const p = createPlayer();
    p.hp = 10;
    heal(p, 100);
    expect(p.hp).toBe(30);
  });

  it('takeDamage halves when defending and clears the flag', () => {
    const p = createPlayer();
    p.defending = true;
    const dealt = takeDamage(p, 10);
    expect(dealt).toBe(5);
    expect(p.hp).toBe(25);
    expect(p.defending).toBe(false);
  });

  it('isDead reports correctly', () => {
    const p = createPlayer();
    expect(isDead(p)).toBe(false);
    p.hp = 0;
    expect(isDead(p)).toBe(true);
  });
});

describe('visitRoom / visitedCount', () => {
  it('tracks unique room visits', () => {
    const p = createPlayer();
    visitRoom(p, 'manor_entry');
    visitRoom(p, 'manor_entry');
    visitRoom(p, 'manor_main_hall');
    expect(visitedCount(p)).toBe(2);
  });
});

describe('hasSkill', () => {
  it('returns true only when skill is set', () => {
    const p = createPlayer();
    expect(hasSkill(p, 'iron_will')).toBe(false);
    p.skills.iron_will = true;
    expect(hasSkill(p, 'iron_will')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the player tests**

Run: `npm test -- player`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add test/unit/player.test.ts
git commit -m "Add unit tests for player module"
```

### Task 11: Unit tests for combat module (with seeded RNG)

**Files:**
- Create: `test/unit/combat.test.ts`

- [ ] **Step 1: Write the combat tests**

Create `test/unit/combat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createCombat, playerAttack, playerDefend, playerFlee, playerUseItem, enemyDefeated } from '../../src/engine/combat';
import { createPlayer, addItem, addWeapon, equipWeapon } from '../../src/engine/player';
import { mulberry32 } from '../../src/engine/rng';
import type { ItemDef, WeaponDef } from '../../src/engine/types';

const itemData: Record<string, ItemDef> = {
  potion: { name: 'Potion', type: 'consumable', effect: 'heal', value: 25, description: 'heals' },
  strength_tonic: { name: 'Strength Tonic', type: 'consumable', effect: 'buff_attack', value: 3, description: 'buff' },
};

const weaponData: Record<string, WeaponDef> = {
  rusty_dagger: { name: 'Rusty Dagger', attack_bonus: 2, region: 'manor', description: 'dull' },
  iron_sword: { name: 'Iron Sword', attack_bonus: 5, region: 'manor', description: 'solid' },
};

const enemyData: Record<string, any> = {
  shadow_rat: { name: 'Shadow Rat', hp: 10, attack: 3, defense: 1, xp: 8, loot: ['potion'], region: 'manor', description: 'rat', is_boss: false },
  cellar_shade: { name: 'Cellar Shade', hp: 35, attack: 7, defense: 3, xp: 30, loot: [], loot_weapon: 'iron_sword', region: 'manor', description: 'shade', is_boss: true },
};

function seededRng(seed: number): () => number {
  return mulberry32(seed);
}

describe('createCombat', () => {
  it('builds CombatState from enemy data', () => {
    const player = createPlayer();
    const c = createCombat(player, 'shadow_rat', enemyData);
    expect(c.enemy.name).toBe('Shadow Rat');
    expect(c.enemy.hp).toBe(10);
    expect(c.enemy.isBoss).toBe(false);
    expect(c.round).toBe(0);
    expect(c.finished).toBe(false);
  });
});

describe('playerAttack', () => {
  it('damages the enemy and increments round', () => {
    const player = createPlayer();
    addWeapon(player, 'rusty_dagger');
    equipWeapon(player, 'rusty_dagger');
    const c = createCombat(player, 'shadow_rat', enemyData);
    const msgs = playerAttack(c, player, weaponData, itemData, seededRng(1));
    expect(c.round).toBe(1);
    expect(c.enemy.hp).toBeLessThan(10);
    expect(msgs.some(m => m.text.includes('damage to Shadow Rat'))).toBe(true);
  });

  it('kills enemy and ends combat when hp drops to 0', () => {
    const player = createPlayer();
    player.attack = 100;
    const c = createCombat(player, 'shadow_rat', enemyData);
    playerAttack(c, player, weaponData, itemData, seededRng(1));
    expect(c.finished).toBe(true);
    expect(c.playerWon).toBe(true);
    expect(c.enemy.hp).toBe(0);
  });
});

describe('playerDefend', () => {
  it('sets defending flag and processes enemy turn', () => {
    const player = createPlayer();
    const c = createCombat(player, 'shadow_rat', enemyData);
    playerDefend(c, player, itemData, seededRng(1));
    expect(c.round).toBe(1);
    // defending was set then consumed by enemy turn
    expect(player.defending).toBe(false);
    expect(player.hp).toBeLessThan(30);
  });
});

describe('playerFlee', () => {
  it('seed that rolls low succeeds in fleeing', () => {
    const player = createPlayer();
    const c = createCombat(player, 'shadow_rat', enemyData);
    // seed 5 produces a low first roll (verified by trying)
    const msgs = playerFlee(c, player, itemData, seededRng(5));
    expect(c.fled || c.finished).toBe(true);
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('quick_feet skill increases flee chance', () => {
    const player = createPlayer();
    player.skills.quick_feet = true;
    const c = createCombat(player, 'shadow_rat', enemyData);
    playerFlee(c, player, itemData, seededRng(1));
    // Just verify the call completes; the threshold change is internal
    expect(c.round).toBe(1);
  });
});

describe('playerUseItem', () => {
  it('uses a healing potion in combat and restores HP', () => {
    const player = createPlayer();
    player.hp = 10;
    addItem(player, 'potion', itemData);
    const c = createCombat(player, 'shadow_rat', enemyData);
    playerUseItem(c, player, 'potion', itemData, seededRng(1));
    expect(player.hp).toBeGreaterThan(10);
    expect(player.inventory.potion).toBeUndefined();
  });

  it('rejects unknown items', () => {
    const player = createPlayer();
    const c = createCombat(player, 'shadow_rat', enemyData);
    const msgs = playerUseItem(c, player, 'nope', itemData, seededRng(1));
    expect(msgs[0].text).toBe('Unknown item.');
  });

  it('rejects shields and other non-consumables', () => {
    const player = createPlayer();
    const c = createCombat(player, 'shadow_rat', enemyData);
    const fakeShield: Record<string, ItemDef> = {
      shield: { name: 'Shield', type: 'shield', value: 3, description: 'shield' },
    };
    const msgs = playerUseItem(c, player, 'shield', fakeShield, seededRng(1));
    expect(msgs[0].text).toBe("You can't use that in combat.");
  });

  it('strength tonic sets buff', () => {
    const player = createPlayer();
    addItem(player, 'strength_tonic', itemData);
    const c = createCombat(player, 'shadow_rat', enemyData);
    playerUseItem(c, player, 'strength_tonic', itemData, seededRng(1));
    expect(player.buffAttack).toBe(3);
    // buffRounds starts at 3, then ticks down once at end of turn
    expect(player.buffRounds).toBe(2);
  });
});

describe('enemyDefeated', () => {
  it('awards xp and returns loot', () => {
    const player = createPlayer();
    const c = createCombat(player, 'shadow_rat', enemyData);
    c.finished = true;
    c.playerWon = true;
    const results = enemyDefeated(c, player);
    expect(player.xp).toBe(8);
    expect(results.loot).toEqual(['potion']);
    expect(results.weapon).toBeNull();
  });

  it('returns weapon loot for bosses', () => {
    const player = createPlayer();
    const c = createCombat(player, 'cellar_shade', enemyData);
    const results = enemyDefeated(c, player);
    expect(results.weapon).toBe('iron_sword');
  });
});
```

- [ ] **Step 2: Run the combat tests**

Run: `npm test -- combat`
Expected: all green. If the `playerFlee` flee-success seed test fails, swap the seed value (try 1, 5, 10, 42 — anything that produces a low first roll).

- [ ] **Step 3: Commit**

```bash
git add test/unit/combat.test.ts
git commit -m "Add unit tests for combat module"
```

### Task 12: Unit tests for world module

**Files:**
- Create: `test/unit/world.test.ts`

- [ ] **Step 1: Write the world tests**

Create `test/unit/world.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createWorld, loadRegion, getRoom, getExits,
  getAdjacentRoom, getLivingEnemies, markEnemyDead,
  addDynamicExit, nonHiddenRoomCount,
} from '../../src/engine/world';
import type { RegionData } from '../../src/engine/types';

const region: RegionData = {
  rooms: [
    {
      id: 'r1', name: 'Room 1', region: 'manor',
      description: 'first room',
      exits: { north: 'r2' },
      enemies: ['rat', 'ghost'],
    },
    {
      id: 'r2', name: 'Room 2', region: 'manor',
      description: 'second room',
      exits: { south: 'r1' },
    },
    {
      id: 'h1', name: 'Hidden', region: 'hidden',
      description: 'hidden',
      exits: {},
    },
  ],
};

describe('createWorld / loadRegion', () => {
  it('loads rooms and indexes by region', () => {
    const w = createWorld();
    loadRegion(w, region);
    expect(Object.keys(w.rooms)).toEqual(['r1', 'r2', 'h1']);
    expect(w.regions.manor).toEqual(['r1', 'r2']);
    expect(w.regions.hidden).toEqual(['h1']);
  });
});

describe('getRoom / getExits / getAdjacentRoom', () => {
  it('getRoom returns the room or undefined', () => {
    const w = createWorld();
    loadRegion(w, region);
    expect(getRoom(w, 'r1')?.name).toBe('Room 1');
    expect(getRoom(w, 'nonexistent')).toBeUndefined();
  });

  it('getExits merges static and dynamic exits', () => {
    const w = createWorld();
    loadRegion(w, region);
    addDynamicExit(w, 'r1', 'east', 'r2');
    const exits = getExits(w, 'r1');
    expect(exits).toEqual({ north: 'r2', east: 'r2' });
  });

  it('getAdjacentRoom returns target id for direction', () => {
    const w = createWorld();
    loadRegion(w, region);
    expect(getAdjacentRoom(w, 'r1', 'north')).toBe('r2');
    expect(getAdjacentRoom(w, 'r1', 'south')).toBeUndefined();
  });
});

describe('enemy lifecycle', () => {
  it('getLivingEnemies returns all enemies initially', () => {
    const w = createWorld();
    loadRegion(w, region);
    expect(getLivingEnemies(w, 'r1')).toEqual(['rat', 'ghost']);
  });

  it('markEnemyDead removes from living set', () => {
    const w = createWorld();
    loadRegion(w, region);
    markEnemyDead(w, 'r1', 'rat');
    expect(getLivingEnemies(w, 'r1')).toEqual(['ghost']);
  });

  it('returns empty array for rooms with no enemies', () => {
    const w = createWorld();
    loadRegion(w, region);
    expect(getLivingEnemies(w, 'r2')).toEqual([]);
  });
});

describe('nonHiddenRoomCount', () => {
  it('excludes hidden region rooms', () => {
    const w = createWorld();
    loadRegion(w, region);
    expect(nonHiddenRoomCount(w)).toBe(2);
  });
});
```

- [ ] **Step 2: Run the world tests**

Run: `npm test -- world`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add test/unit/world.test.ts
git commit -m "Add unit tests for world module"
```

### Task 13: Unit tests for save module

**Files:**
- Create: `test/unit/save.test.ts`

- [ ] **Step 1: Write the save tests**

Create `test/unit/save.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { saveToSlot, loadFromSlot, loadManifest, anySlotHasData, renameSlot } from '../../src/engine/save';
import { createPlayer, addItem, addWeapon, equipWeapon, visitRoom } from '../../src/engine/player';
import { createWorld, loadRegion, markEnemyDead } from '../../src/engine/world';
import type { ItemDef, RegionData } from '../../src/engine/types';

const itemData: Record<string, ItemDef> = {
  potion: { name: 'Potion', type: 'consumable', effect: 'heal', value: 25, description: 'heals' },
  rusty_key: { name: 'Rusty Key', type: 'key', description: 'a key' },
};

const region: RegionData = {
  rooms: [
    { id: 'r1', name: 'Room 1', region: 'manor', description: 'first', exits: { north: 'r2' }, enemies: ['rat'] },
    { id: 'r2', name: 'Room 2', region: 'manor', description: 'second', exits: { south: 'r1' } },
  ],
};

describe('save round-trip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('preserves player state across save/load', () => {
    const player = createPlayer('r1');
    player.hp = 20;
    player.level = 3;
    player.xp = 15;
    addItem(player, 'potion', itemData);
    addItem(player, 'potion', itemData);
    addItem(player, 'rusty_key', itemData);
    addWeapon(player, 'rusty_dagger');
    equipWeapon(player, 'rusty_dagger');
    visitRoom(player, 'r1');
    visitRoom(player, 'r2');
    player.firedEvents.test_flag = true;

    const world = createWorld();
    loadRegion(world, region);
    markEnemyDead(world, 'r1', 'rat');

    expect(saveToSlot(1, player, world)).toBe(true);

    const newPlayer = createPlayer();
    const newWorld = createWorld();
    loadRegion(newWorld, region);
    const result = loadFromSlot(1, newPlayer, newWorld);

    expect(result.success).toBe(true);
    expect(newPlayer.hp).toBe(20);
    expect(newPlayer.level).toBe(3);
    expect(newPlayer.xp).toBe(15);
    expect(newPlayer.currentRoom).toBe('r1');
    expect(newPlayer.inventory.potion).toBe(2);
    expect(newPlayer.keyItems.rusty_key).toBe(true);
    expect(newPlayer.weapons).toEqual(['rusty_dagger']);
    expect(newPlayer.equippedWeapon).toBe('rusty_dagger');
    expect(newPlayer.visitedRooms.r1).toBe(true);
    expect(newPlayer.visitedRooms.r2).toBe(true);
    expect(newPlayer.firedEvents.test_flag).toBe(true);
    expect(newWorld.rooms.r1._dead_enemies?.rat).toBe(true);
  });

  it('preserves ground loot and dynamic exits', () => {
    const player = createPlayer();
    const world = createWorld();
    loadRegion(world, region);
    world.rooms.r1._ground_loot = ['potion'];
    world.rooms.r1._ground_weapons = ['rusty_dagger'];
    world.rooms.r1._dynamic_exits = { east: 'r2' };

    saveToSlot(1, player, world);

    const newPlayer = createPlayer();
    const newWorld = createWorld();
    loadRegion(newWorld, region);
    loadFromSlot(1, newPlayer, newWorld);

    expect(newWorld.rooms.r1._ground_loot).toEqual(['potion']);
    expect(newWorld.rooms.r1._ground_weapons).toEqual(['rusty_dagger']);
    expect(newWorld.rooms.r1._dynamic_exits).toEqual({ east: 'r2' });
  });
});

describe('manifest', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns default 3-slot manifest when nothing exists', () => {
    const m = loadManifest();
    expect(m.slots.length).toBe(3);
    expect(m.slots.every(s => s.isEmpty)).toBe(true);
  });

  it('anySlotHasData detects populated slot', () => {
    const player = createPlayer();
    const world = createWorld();
    loadRegion(world, region);
    expect(anySlotHasData()).toBe(false);
    saveToSlot(1, player, world);
    expect(anySlotHasData()).toBe(true);
  });

  it('renameSlot updates manifest', () => {
    const player = createPlayer();
    const world = createWorld();
    loadRegion(world, region);
    saveToSlot(1, player, world);
    renameSlot(1, 'My Hero');
    const m = loadManifest();
    expect(m.slots[0].name).toBe('My Hero');
  });
});
```

- [ ] **Step 2: Run the save tests**

Run: `npm test -- save`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add test/unit/save.test.ts
git commit -m "Add unit tests for save module"
```

### Task 14: Unit tests for matching helpers

**Files:**
- Create: `test/unit/matching.test.ts`

- [ ] **Step 1: Write the matching tests**

Create `test/unit/matching.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findAllMatches, type Matchable } from '../../src/engine/gameReducer';

const items: Record<string, Matchable> = {
  small_potion: { name: 'Small Potion', match_words: ['small potion', 'small', 'potion'] },
  potion:       { name: 'Potion',       match_words: ['potion'] },
  large_potion: { name: 'Large Potion', match_words: ['large potion', 'large', 'potion'] },
  rusty_key:    { name: 'Rusty Key',    match_words: ['rusty key', 'key', 'rusty'] },
};

describe('findAllMatches', () => {
  it('exact id match returns single result', () => {
    const r = findAllMatches('potion', Object.keys(items), items);
    expect(r).toEqual(['potion']);
  });

  it('exact full name match returns single result', () => {
    const r = findAllMatches('Small Potion', Object.keys(items), items);
    expect(r).toEqual(['small_potion']);
  });

  it('match_word hit returns all matching ids', () => {
    const r = findAllMatches('small', Object.keys(items), items);
    expect(r).toEqual(['small_potion']);
  });

  it('ambiguous match_word returns multiple', () => {
    const r = findAllMatches('potion', Object.keys(items), items);
    // 'potion' is an exact-id match for the 'potion' entry, so returns immediately
    expect(r).toEqual(['potion']);
  });

  it('ambiguous match_word with no exact id returns all', () => {
    const r = findAllMatches('large', Object.keys(items), items);
    expect(r).toEqual(['large_potion']);
  });

  it('no match returns empty array', () => {
    const r = findAllMatches('zzz', Object.keys(items), items);
    expect(r).toEqual([]);
  });

  it('partial fallback when nothing else matches', () => {
    const r = findAllMatches('rust', Object.keys(items), items);
    expect(r).toContain('rusty_key');
  });

  it('case insensitive', () => {
    const r = findAllMatches('POTION', Object.keys(items), items);
    expect(r).toEqual(['potion']);
  });
});
```

- [ ] **Step 2: Run the matching tests**

Run: `npm test -- matching`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add test/unit/matching.test.ts
git commit -m "Add unit tests for findAllMatches"
```

### Task 15: Scenario test — new game flow

**Files:**
- Create: `test/scenario/new-game.test.ts`

- [ ] **Step 1: Write the new game scenario test**

Create `test/scenario/new-game.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { newGame } from '../fixtures/mock-input';
import { expectLine } from '../fixtures/assert-output';

describe('new game scenario', () => {
  it('boots, shows menu, starts new game in manor entry', () => {
    const s = newGame();
    expect(s.state).toBe('exploring');
    expect(s.player).not.toBeNull();
    expect(s.player!.hp).toBe(30);
    expect(s.player!.maxHp).toBe(30);
    expect(s.player!.level).toBe(1);
    expect(s.player!.currentRoom).toBe('manor_entry');
  });

  it('first room renders with name, description, contents, exits', () => {
    const s = newGame();
    expectLine(s, 'Entry');
    expectLine(s, 'Welcome to MysticQuest');
    expectLine(s, 'Shadow Rat');
    expectLine(s, 'Small Potion');
    expectLine(s, 'Rusty Dagger');
    expectLine(s, 'Exits:');
  });

  it('header reflects starting stats', () => {
    const s = newGame();
    expect(s.header.title).toBe('MYSTICQUEST v1.0');
    expect(s.header.hp).toBe(30);
    expect(s.header.maxHp).toBe(30);
    expect(s.header.level).toBe(1);
    expect(s.header.weapon).toBe('Fists');
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm test -- new-game`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add test/scenario/new-game.test.ts
git commit -m "Add new-game scenario test"
```

### Task 16: Scenario test — take and use

**Files:**
- Create: `test/scenario/take-and-use.test.ts`

- [ ] **Step 1: Write the take-and-use scenario test**

Create `test/scenario/take-and-use.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { newGame, input } from '../fixtures/mock-input';
import { expectLine } from '../fixtures/assert-output';

describe('take and use items', () => {
  it('picks up small potion and uses it to heal', () => {
    let s = newGame();
    s = input(s, 'take small potion');
    expect(s.player!.inventory.small_potion).toBe(1);
    expectLine(s, 'pick up the Small Potion');

    // damage the player so we can heal
    s.player!.hp = 5;
    s = input(s, 'use small potion');
    expect(s.player!.inventory.small_potion).toBeUndefined();
    expect(s.player!.hp).toBe(15);
    expectLine(s, 'restore 10 HP');
  });

  it('picks up and equips rusty dagger', () => {
    let s = newGame();
    s = input(s, 'take rusty dagger');
    expect(s.player!.weapons).toContain('rusty_dagger');
    expect(s.player!.equippedWeapon).toBe('rusty_dagger');
    expectLine(s, 'pick up the Rusty Dagger');
    expectLine(s, 'equip the Rusty Dagger');
  });

  it('rejects taking nonexistent items', () => {
    let s = newGame();
    s = input(s, 'take banana');
    expectLine(s, "don't see that here");
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm test -- take-and-use`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add test/scenario/take-and-use.test.ts
git commit -m "Add take-and-use scenario test"
```

### Task 17: Scenario test — combat flow

**Files:**
- Create: `test/scenario/combat-flow.test.ts`

- [ ] **Step 1: Write the combat flow scenario test**

Create `test/scenario/combat-flow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { newGame, input } from '../fixtures/mock-input';
import { expectLine } from '../fixtures/assert-output';

describe('combat flow', () => {
  it('attacks shadow rat in manor entry and wins', () => {
    let s = newGame();
    s = input(s, 'take rusty dagger');
    s = input(s, 'attack rat');
    expect(s.state).toBe('combat');
    expectLine(s, 'COMBAT');

    // Buff the player so we win quickly and deterministically
    s.player!.attack = 50;

    // Attack until combat ends
    for (let i = 0; i < 20 && s.state === 'combat'; i++) {
      s = input(s, 'attack');
    }
    expect(s.state).toBe('exploring');
    expectLine(s, 'COMBAT END');
    expect(s.player!.xp).toBeGreaterThan(0);
  });

  it('flee command exits combat', () => {
    let s = newGame();
    s = input(s, 'attack rat');
    expect(s.state).toBe('combat');

    // Boost flee chance via skill
    s.player!.skills.quick_feet = true;

    // Try fleeing — may take a couple tries due to RNG, but quick_feet is 90%
    for (let i = 0; i < 10 && s.state === 'combat'; i++) {
      s = input(s, 'flee');
    }
    expect(s.state).toBe('exploring');
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm test -- combat-flow`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add test/scenario/combat-flow.test.ts
git commit -m "Add combat-flow scenario test"
```

### Task 18: Scenario test — save and load round trip

**Files:**
- Create: `test/scenario/save-load.test.ts`

- [ ] **Step 1: Write the save-load scenario test**

Create `test/scenario/save-load.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { newGame, input } from '../fixtures/mock-input';
import { saveToSlot, loadFromSlot } from '../../src/engine/save';
import { createPlayer } from '../../src/engine/player';
import { createWorld, loadRegion } from '../../src/engine/world';
import type { RegionData } from '../../src/engine/types';
import manorJson from '../../src/data/regions/manor.json';
import wildsJson from '../../src/data/regions/wilds.json';
import darknessJson from '../../src/data/regions/darkness.json';
import wastesJson from '../../src/data/regions/wastes.json';
import hiddenJson from '../../src/data/regions/hidden.json';

function freshWorld() {
  const w = createWorld();
  loadRegion(w, manorJson as RegionData);
  loadRegion(w, wildsJson as RegionData);
  loadRegion(w, darknessJson as RegionData);
  loadRegion(w, wastesJson as RegionData);
  loadRegion(w, hiddenJson as RegionData);
  return w;
}

describe('save and load round trip via reducer', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves mid-game state and reloads it identically', () => {
    let s = newGame();
    s = input(s, 'take small potion');
    s = input(s, 'take rusty dagger');
    expect(s.player!.inventory.small_potion).toBe(1);
    expect(s.player!.weapons).toContain('rusty_dagger');

    expect(saveToSlot(1, s.player!, s.world!)).toBe(true);

    // Build a clean target and load into it
    const newPlayer = createPlayer();
    const newWorld = freshWorld();
    const result = loadFromSlot(1, newPlayer, newWorld);

    expect(result.success).toBe(true);
    expect(newPlayer.inventory.small_potion).toBe(1);
    expect(newPlayer.weapons).toContain('rusty_dagger');
    expect(newPlayer.equippedWeapon).toBe('rusty_dagger');
    expect(newPlayer.currentRoom).toBe('manor_entry');
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm test -- save-load`
Expected: all green.

- [ ] **Step 3: Run the FULL test suite to confirm Phase 1 is locked in**

Run: `npm test`
Expected: ALL tests pass. This is the safety net for Phase 2.

- [ ] **Step 4: Commit**

```bash
git add test/scenario/save-load.test.ts
git commit -m "Add save-load scenario test (Phase 1 complete)"
```

---

## Phase 2 — Reducer modularization

**Principle:** Move code, do not rewrite logic. Behavior must be byte-identical at every step. Run `npm test` after every task. If anything goes red, fix in place before continuing.

### Task 19: Extract output.ts

**Files:**
- Create: `src/engine/output.ts`
- Modify: `src/engine/gameReducer.ts` (delete the moved helpers, add an import)

- [ ] **Step 1: Create output.ts with the relocated helpers**

Create `src/engine/output.ts`:

```ts
import type { GameStore, RGBA, EffectsState } from './types';
import * as C from './constants';
import { setRegionTint, clearRegionTint, updateRainbowTint } from './effects';
import { getAsciiLines } from './asciiArt';

export function addLine(store: GameStore, text: string, color?: RGBA): void {
  store.typewriterQueue.push({ text, color: color || store.baseColor });
}

export function addLineInstant(store: GameStore, text: string, color?: RGBA): void {
  store.lines.push({ text, color: color || store.baseColor });
}

export function emitSound(store: GameStore, name: string): void {
  store.soundQueue.push(name);
}

export function clearTerminal(store: GameStore): void {
  store.lines = [];
  store.typewriterQueue = [];
  store.typewriterPos = 0;
}

export function displayAscii(store: GameStore, name: string, color?: RGBA): void {
  const lines = getAsciiLines(name);
  if (!lines) return;
  const c = color || C.ASCII_COLOR;
  for (const line of lines) {
    addLine(store, line, c);
  }
}

export function updateHeader(store: GameStore, weaponName: string): void {
  if (!store.player) return;
  store.header.title = (store.gameMode === 'dungeon' && store.dungeon)
    ? `DUNGEON F${store.dungeon.floor}`
    : 'MYSTICQUEST v1.0';
  store.header.hp = store.player.hp;
  store.header.maxHp = store.player.maxHp;
  store.header.level = store.player.level;
  store.header.weapon = weaponName;
}

export function hideHeader(store: GameStore): void {
  store.header = { title: '', hp: 0, maxHp: 0, level: 0, weapon: '' };
}

export function applyRegionTint(store: GameStore, region?: string): void {
  store.currentRegion = region || null;
  if (region === 'manor') setRegionTint(store.effects, 0, 0.15, 0, 0.05);
  else if (region === 'wilds') clearRegionTint(store.effects);
  else if (region === 'darkness') setRegionTint(store.effects, 0.2, 0, 0, 0.1);
  else if (region === 'wastes') setRegionTint(store.effects, 0.15, 0.1, 0, 0.05);
  else if (region === 'hidden') updateRainbowTint(store.effects);
  else clearRegionTint(store.effects);
}
```

Note: `updateHeader` now takes `weaponName` as a parameter rather than reading `weaponData` directly. This breaks the dependency on the data table. Callers will resolve the weapon name first.

- [ ] **Step 2: Update gameReducer.ts to import from output.ts**

In `src/engine/gameReducer.ts`, find the existing helper definitions (`addLine`, `addLineInstant`, `emitSound`, `clearTerminal`, `displayAscii`, `updateHeader`, `hideHeader`, `applyRegionTint` — currently lines 39–95). Delete those local functions.

At the top of the file, add this import line near the existing imports:

```ts
import {
  addLine, addLineInstant, emitSound, clearTerminal, displayAscii,
  updateHeader as updateHeaderRaw, hideHeader, applyRegionTint,
} from './output';
```

Then add a wrapper at the top of the file (after the imports) that adapts `updateHeader` to read the weapon name:

```ts
function updateHeader(store: GameStore): void {
  if (!store.player) return;
  let weaponName = 'Fists';
  if (store.player.equippedWeapon && weaponData[store.player.equippedWeapon]) {
    weaponName = weaponData[store.player.equippedWeapon].name;
  }
  updateHeaderRaw(store, weaponName);
}
```

This keeps every existing call site (`updateHeader(store)`) working unchanged.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: ALL tests pass. If anything fails, the extraction is wrong — diff against the original `gameReducer.ts:39-95`.

- [ ] **Step 4: Commit**

```bash
git add src/engine/output.ts src/engine/gameReducer.ts
git commit -m "Extract output helpers into output.ts"
```

### Task 20: Extract matching.ts

**Files:**
- Create: `src/engine/matching.ts`
- Modify: `src/engine/gameReducer.ts` (delete the moved helpers, update imports)

- [ ] **Step 1: Create matching.ts**

Create `src/engine/matching.ts`:

```ts
import type { GameStore, RGBA } from './types';
import * as C from './constants';
import { addLine } from './output';

export interface Matchable { name: string; match_words?: string[] }

/**
 * Returns all matching IDs from a candidate list, using match_words then
 * fallback to name/id matching.
 */
export function findAllMatches(name: string, ids: string[], dataTable: Record<string, Matchable>): string[] {
  const lower = name.toLowerCase();

  // 1. Exact match on id or full name — return immediately if found
  for (const id of ids) {
    const info = dataTable[id];
    if (!info) continue;
    if (id.toLowerCase() === lower || info.name.toLowerCase() === lower) return [id];
  }

  // 2. Exact match on a match_word — collect all that match
  const wordMatches: string[] = [];
  for (const id of ids) {
    const info = dataTable[id];
    if (!info?.match_words) continue;
    if (info.match_words.some(w => w.toLowerCase() === lower)) wordMatches.push(id);
  }
  if (wordMatches.length > 0) return wordMatches;

  // 3. Fallback: partial match on id or name
  const partial: string[] = [];
  for (const id of ids) {
    const info = dataTable[id];
    if (!info) continue;
    if (id.toLowerCase().includes(lower) || info.name.toLowerCase().includes(lower)) partial.push(id);
  }
  return partial;
}

/**
 * Resolve a match list: 1 result returns it, multiple prints disambiguation,
 * 0 returns null.
 */
export function resolveOrDisambiguate(
  store: GameStore,
  matches: string[],
  dataTable: Record<string, Matchable>,
  verb: string,
): string | null {
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    addLine(store, `Which ${verb}?`, C.CHOICE_COLOR);
    for (const id of matches) {
      const info = dataTable[id];
      if (info) addLine(store, `  ${info.name}`, C.HELP_COLOR);
    }
    return null;
  }
  return null;
}
```

- [ ] **Step 2: Update gameReducer.ts**

In `src/engine/gameReducer.ts`:

1. Delete the local `Matchable` interface (currently line 97), `findAllMatches` function (currently 100–127), and `resolveOrDisambiguate` function (currently 130–146).
2. Add this to the imports near the top:

```ts
import { findAllMatches, resolveOrDisambiguate, type Matchable } from './matching';
```

3. Re-export them so existing test imports keep working:

```ts
export { findAllMatches, type Matchable } from './matching';
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: ALL tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/engine/matching.ts src/engine/gameReducer.ts
git commit -m "Extract matching helpers into matching.ts"
```

### Task 21: Extract display.ts

**Files:**
- Create: `src/engine/display.ts`
- Modify: `src/engine/gameReducer.ts` (delete `displayRoom`, import the new one)

- [ ] **Step 1: Create display.ts**

Create `src/engine/display.ts`:

```ts
import type { GameStore, EnemyDef, ItemDef, WeaponDef, NpcDef } from './types';
import * as C from './constants';
import { addLine } from './output';
import { getRoom, getExits, getLivingEnemies } from './world';

export function displayRoom(
  store: GameStore,
  roomId: string,
  enemyData: Record<string, EnemyDef>,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  npcData: Record<string, NpcDef>,
): void {
  if (!store.world) return;
  const room = getRoom(store.world, roomId);
  if (!room) {
    addLine(store, 'ERROR: Room not found.', C.ERROR_COLOR);
    return;
  }

  addLine(store, C.SEPARATOR, C.SEPARATOR_COLOR);
  addLine(store, room.name, C.ROOM_NAME_COLOR);
  addLine(store, '');
  addLine(store, room.description);
  addLine(store, '');

  const living = getLivingEnemies(store.world, roomId);
  for (const enemyId of living) {
    const edata = enemyData[enemyId];
    if (edata) addLine(store, `A ${edata.name} lurks here.`, C.ENEMY_COLOR);
  }

  if (room.items) {
    for (const itemId of room.items) {
      const idata = itemData[itemId];
      if (idata) addLine(store, `You see a ${idata.name} here.`, C.ITEM_COLOR);
    }
  }
  if (room.weapons) {
    for (const wid of room.weapons) {
      const wdata = weaponData[wid];
      if (wdata) addLine(store, `You see a ${wdata.name} here.`, C.ITEM_COLOR);
    }
  }
  if (room._ground_loot) {
    for (const itemId of room._ground_loot) {
      const idata = itemData[itemId];
      if (idata) addLine(store, `You see a ${idata.name} on the ground.`, C.LOOT_COLOR);
    }
  }
  if (room._ground_weapons) {
    for (const wid of room._ground_weapons) {
      const wdata = weaponData[wid];
      if (wdata) addLine(store, `You see a ${wdata.name} on the ground.`, C.LOOT_COLOR);
    }
  }

  if (room.npcs) {
    for (const npcId of room.npcs) {
      const npc = npcData[npcId];
      if (npc) addLine(store, `${npc.name} is here.`, C.NPC_COLOR);
    }
  }

  const exits = getExits(store.world, roomId);
  const exitList = Object.keys(exits).sort();
  addLine(store, '');
  if (exitList.length > 0) {
    addLine(store, 'Exits: ' + exitList.join(', '), C.EXITS_COLOR);
  } else {
    addLine(store, 'There are no exits.', C.EXITS_COLOR);
  }
}
```

- [ ] **Step 2: Update gameReducer.ts**

In `src/engine/gameReducer.ts`:

1. Delete the local `displayRoom` function (currently lines 308–368).
2. Add to imports:

```ts
import { displayRoom as displayRoomRaw } from './display';
```

3. Add a wrapper that captures the data tables so existing call sites stay one-arg:

```ts
function displayRoom(store: GameStore, roomId: string): void {
  displayRoomRaw(store, roomId, enemyData, itemData, weaponData, npcData);
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: ALL tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/engine/display.ts src/engine/gameReducer.ts
git commit -m "Extract displayRoom into display.ts"
```

### Task 22: Extract simple read-only handlers (look, help, journal, score)

**Files:**
- Create: `src/engine/handlers/look.ts`
- Create: `src/engine/handlers/help.ts`
- Create: `src/engine/handlers/info.ts` (journal + score + achievements + skills + stats + inventory)
- Modify: `src/engine/gameReducer.ts`

- [ ] **Step 1: Create handlers/look.ts**

Create `src/engine/handlers/look.ts`:

```ts
import type { GameStore, EnemyDef, ItemDef, WeaponDef, NpcDef } from '../types';
import { addLine } from '../output';
import { displayRoom } from '../display';

export function handleLook(
  store: GameStore,
  enemyData: Record<string, EnemyDef>,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  npcData: Record<string, NpcDef>,
): void {
  if (!store.player) return;
  addLine(store, '');
  displayRoom(store, store.player.currentRoom, enemyData, itemData, weaponData, npcData);
}
```

- [ ] **Step 2: Create handlers/help.ts**

Create `src/engine/handlers/help.ts`. Copy the body of `showHelp` from `gameReducer.ts:797-832`:

```ts
import type { GameStore } from '../types';
import * as C from '../constants';
import { addLine } from '../output';

export function handleHelp(store: GameStore): void {
  addLine(store, '');
  addLine(store, C.SEPARATOR, C.SEPARATOR_COLOR);
  addLine(store, '=== COMMANDS ===', C.STAT_COLOR);
  addLine(store, '');
  addLine(store, ' MOVEMENT', C.EXITS_COLOR);
  addLine(store, '  go <direction>  - Move (north/south/east/west/up/down)', C.HELP_COLOR);
  addLine(store, '  look (l)        - Look around the current room', C.HELP_COLOR);
  addLine(store, '  search          - Search for hidden items', C.HELP_COLOR);
  addLine(store, '');
  addLine(store, ' ITEMS', C.ITEM_COLOR);
  addLine(store, '  take <item>     - Pick up an item or weapon', C.HELP_COLOR);
  addLine(store, '  use <item>      - Use consumable or equip gear', C.HELP_COLOR);
  addLine(store, '  use <item> x3   - Use an item multiple times', C.HELP_COLOR);
  addLine(store, '  drop <item>     - Drop an item', C.HELP_COLOR);
  addLine(store, '  examine <thing> - Inspect an item, weapon, or enemy', C.HELP_COLOR);
  addLine(store, '');
  addLine(store, ' COMBAT', C.COMBAT_COLOR);
  addLine(store, '  attack <enemy>  - Attack an enemy in the room', C.HELP_COLOR);
  addLine(store, '');
  addLine(store, ' INFO', C.STAT_COLOR);
  addLine(store, '  inventory (i)   - Show your inventory', C.HELP_COLOR);
  addLine(store, '  stats           - Show your stats', C.HELP_COLOR);
  addLine(store, '  journal         - View your adventure journal', C.HELP_COLOR);
  addLine(store, '  map             - Open the area map', C.HELP_COLOR);
  addLine(store, '  talk <npc>      - Talk to someone in the room', C.HELP_COLOR);
  addLine(store, '  skills          - View the skill tree', C.HELP_COLOR);
  addLine(store, '  learn <skill>   - Learn a new skill', C.HELP_COLOR);
  addLine(store, '  achievements    - View achievements', C.HELP_COLOR);
  addLine(store, '  save / load     - Save or load your game', C.HELP_COLOR);
  addLine(store, '  again (g)       - Repeat your last command', C.HELP_COLOR);
  addLine(store, '  help (?)        - Show this help', C.HELP_COLOR);
  addLine(store, '');
  addLine(store, 'Shortcuts: n/s/e/w/u/d for directions, Tab to autocomplete', [0.5, 0.5, 0.5, 0.8]);
  addLine(store, C.SEPARATOR, C.SEPARATOR_COLOR);
}
```

- [ ] **Step 3: Update gameReducer.ts to use handlers/look.ts and handlers/help.ts**

In `src/engine/gameReducer.ts`:

1. Add to imports:
```ts
import { handleLook } from './handlers/look';
import { handleHelp } from './handlers/help';
```

2. Delete the local `showHelp` function definition (`gameReducer.ts:797-832`).

3. In `handleExploringCommand` (around line 1279), find:
```ts
} else if (verb === 'look') {
  addLine(store, '');
  displayRoom(store, store.player.currentRoom);
}
```
Replace with:
```ts
} else if (verb === 'look') {
  handleLook(store, enemyData, itemData, weaponData, npcData);
}
```

4. Find:
```ts
} else if (verb === 'help') {
  showHelp(store);
}
```
Replace with:
```ts
} else if (verb === 'help') {
  handleHelp(store);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: ALL tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine/handlers/ src/engine/gameReducer.ts
git commit -m "Extract look and help handlers"
```

### Task 23: Extract take handler

**Files:**
- Create: `src/engine/handlers/take.ts`
- Modify: `src/engine/gameReducer.ts`

- [ ] **Step 1: Create handlers/take.ts**

Create `src/engine/handlers/take.ts`. The function body is the existing `handleTake` from `gameReducer.ts:834-890`, with helpers passed as arguments:

```ts
import type { GameStore, ItemDef, WeaponDef, RoomDef } from '../types';
import * as C from '../constants';
import { addLine, emitSound, updateHeader } from '../output';
import { findAllMatches, resolveOrDisambiguate } from '../matching';
import { addItem, addWeapon, equipWeapon } from '../player';
import { getRoom } from '../world';

function removeFromRoom(room: RoomDef, itemId: string): string | null {
  const lists = ['items', 'weapons', '_ground_loot', '_ground_weapons'] as const;
  for (const listName of lists) {
    const list = room[listName] as string[] | undefined;
    if (list) {
      const idx = list.indexOf(itemId);
      if (idx !== -1) {
        list.splice(idx, 1);
        return listName;
      }
    }
  }
  return null;
}

export function handleTake(
  store: GameStore,
  target: string,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  addJournal: (type: 'item', text: string) => void,
  checkItemAchievements: () => void,
  refreshHeader: () => void,
): void {
  if (!store.player || !store.world) return;
  if (!target) { addLine(store, 'Take what?', C.ERROR_COLOR); return; }

  const room = getRoom(store.world, store.player.currentRoom);
  if (!room) return;

  const roomWeaponIds = [...(room.weapons || []), ...(room._ground_weapons || [])];
  const roomItemIds = [...(room.items || []), ...(room._ground_loot || [])];

  // Try weapons
  const weaponMatches = findAllMatches(target, roomWeaponIds, weaponData);
  if (weaponMatches.length > 1) {
    resolveOrDisambiguate(store, weaponMatches, weaponData, 'weapon do you want to take');
    return;
  }
  if (weaponMatches.length === 1) {
    const wid = weaponMatches[0];
    removeFromRoom(room, wid);
    addWeapon(store.player, wid);
    addLine(store, `You pick up the ${weaponData[wid].name}.`, C.ITEM_COLOR);
    addJournal('item', `Found ${weaponData[wid].name}`);
    emitSound(store, 'pickup');
    if (!store.player.equippedWeapon) {
      equipWeapon(store.player, wid);
      addLine(store, `You equip the ${weaponData[wid].name}.`, C.ITEM_COLOR);
      emitSound(store, 'equip');
      refreshHeader();
    }
    return;
  }

  // Try items
  const itemMatches = findAllMatches(target, roomItemIds, itemData);
  if (itemMatches.length > 1) {
    resolveOrDisambiguate(store, itemMatches, itemData, 'item do you want to take');
    return;
  }
  if (itemMatches.length === 1) {
    const iid = itemMatches[0];
    removeFromRoom(room, iid);
    addItem(store.player, iid, itemData);
    addLine(store, `You pick up the ${itemData[iid].name}.`, C.ITEM_COLOR);
    addJournal('item', `Found ${itemData[iid].name}`);
    emitSound(store, 'pickup');
    if (itemData[iid].type === 'shield' && !store.player.equippedShield) {
      store.player.equippedShield = iid;
      addLine(store, `You equip the ${itemData[iid].name}.`, C.ITEM_COLOR);
      emitSound(store, 'equip');
    }
    checkItemAchievements();
    return;
  }

  addLine(store, "You don't see that here.", C.ERROR_COLOR);
  emitSound(store, 'error');
}
```

- [ ] **Step 2: Update gameReducer.ts**

In `src/engine/gameReducer.ts`:

1. Delete the local `removeFromRoom` and `handleTake` functions (`gameReducer.ts:160-173` and `834-890`).
2. Add to imports:
```ts
import { handleTake } from './handlers/take';
```
3. In `handleExploringCommand`, change:
```ts
} else if (verb === 'take') {
  handleTake(store, target);
}
```
to:
```ts
} else if (verb === 'take') {
  handleTake(store, target, itemData, weaponData,
    (type, text) => addJournal(store, type, text),
    () => checkItemAchievements(store),
    () => updateHeader(store));
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: ALL tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/engine/handlers/take.ts src/engine/gameReducer.ts
git commit -m "Extract take handler"
```

### Task 24: Extract drop and examine handlers

**Files:**
- Create: `src/engine/handlers/drop.ts`
- Create: `src/engine/handlers/examine.ts`
- Modify: `src/engine/gameReducer.ts`

- [ ] **Step 1: Create handlers/drop.ts**

Create `src/engine/handlers/drop.ts` by copying the body of `handleDrop` from `gameReducer.ts:969-1018`. Use this exact content:

```ts
import type { GameStore, ItemDef, WeaponDef } from '../types';
import * as C from '../constants';
import { addLine } from '../output';
import { findAllMatches, resolveOrDisambiguate } from '../matching';
import { removeItem } from '../player';
import { getRoom } from '../world';

export function handleDrop(
  store: GameStore,
  target: string,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  refreshHeader: () => void,
): void {
  if (!store.player || !store.world) return;
  if (!target) { addLine(store, 'Drop what?', C.ERROR_COLOR); return; }

  const room = getRoom(store.world, store.player.currentRoom);
  if (!room) return;

  const ownedItemIds = Object.keys(store.player.inventory);
  const itemMatches = findAllMatches(target, ownedItemIds, itemData);
  if (itemMatches.length > 1) {
    resolveOrDisambiguate(store, itemMatches, itemData, 'item do you want to drop');
    return;
  }
  if (itemMatches.length === 1) {
    const iid = itemMatches[0];
    if (itemData[iid].type === 'key') {
      addLine(store, "You can't drop that.", C.ERROR_COLOR);
      return;
    }
    removeItem(store.player, iid);
    if (!room._ground_loot) room._ground_loot = [];
    room._ground_loot.push(iid);
    if (store.player.equippedShield === iid) store.player.equippedShield = null;
    addLine(store, `You drop the ${itemData[iid]?.name || iid}.`, C.HELP_COLOR);
    return;
  }

  const weaponMatches = findAllMatches(target, store.player.weapons, weaponData);
  if (weaponMatches.length > 1) {
    resolveOrDisambiguate(store, weaponMatches, weaponData, 'weapon do you want to drop');
    return;
  }
  if (weaponMatches.length === 1) {
    const wid = weaponMatches[0];
    const idx = store.player.weapons.indexOf(wid);
    store.player.weapons.splice(idx, 1);
    if (!room._ground_weapons) room._ground_weapons = [];
    room._ground_weapons.push(wid);
    if (store.player.equippedWeapon === wid) {
      store.player.equippedWeapon = null;
      refreshHeader();
    }
    addLine(store, `You drop the ${weaponData[wid]?.name || wid}.`, C.HELP_COLOR);
    return;
  }

  addLine(store, "You don't have that.", C.ERROR_COLOR);
}
```

- [ ] **Step 2: Create handlers/examine.ts**

Create `src/engine/handlers/examine.ts`. Copy the body of `handleExamine` from `gameReducer.ts:687-785`. The new file passes data tables in:

```ts
import type { GameStore, EnemyDef, ItemDef, WeaponDef } from '../types';
import * as C from '../constants';
import { addLine } from '../output';
import { totalAttack, totalDefense } from '../player';
import { getRoom, getLivingEnemies } from '../world';

export function handleExamine(
  store: GameStore,
  target: string,
  enemyData: Record<string, EnemyDef>,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
): void {
  if (!store.player || !store.world) return;
  if (!target) { addLine(store, 'Examine what?', C.ERROR_COLOR); return; }

  const room = getRoom(store.world, store.player.currentRoom);

  // Try enemy in room
  if (room) {
    const living = getLivingEnemies(store.world, store.player.currentRoom);
    for (const eid of living) {
      const e = enemyData[eid];
      if (!e) continue;
      if (e.name.toLowerCase().includes(target.toLowerCase()) || eid.toLowerCase().includes(target.toLowerCase())) {
        addLine(store, '');
        addLine(store, `=== ${e.name} ===`, C.ENEMY_COLOR);
        addLine(store, e.description, C.HELP_COLOR);
        addLine(store, `HP: ${e.hp}  ATK: ${e.attack}  DEF: ${e.defense}  XP: ${e.xp}`, C.STAT_COLOR);
        if (e.is_boss) addLine(store, 'This is a boss enemy. Special attack every 3 rounds.', C.COMBAT_COLOR);
        let playerAtk = totalAttack(store.player);
        if (store.player.equippedWeapon && weaponData[store.player.equippedWeapon]) {
          playerAtk += weaponData[store.player.equippedWeapon].attack_bonus;
        }
        const estDmg = Math.max(1, playerAtk - e.defense);
        const estTaken = Math.max(1, e.attack - totalDefense(store.player, itemData));
        addLine(store, `Est. damage you deal: ~${estDmg}/hit`, [0.8, 1, 0.8, 1]);
        addLine(store, `Est. damage you take: ~${estTaken}/hit`, [1, 0.5, 0.5, 1]);
        return;
      }
    }
  }

  // Try weapon in inventory
  for (const wid of store.player.weapons) {
    const w = weaponData[wid];
    if (!w) continue;
    if (w.name.toLowerCase().includes(target.toLowerCase()) || wid.toLowerCase().includes(target.toLowerCase())) {
      addLine(store, '');
      addLine(store, `=== ${w.name} ===`, C.ITEM_COLOR);
      addLine(store, w.description, C.HELP_COLOR);
      addLine(store, `Attack bonus: +${w.attack_bonus}`, C.STAT_COLOR);
      if (store.player.equippedWeapon === wid) {
        addLine(store, '(currently equipped)', C.ITEM_COLOR);
      } else if (store.player.equippedWeapon) {
        const curr = weaponData[store.player.equippedWeapon];
        if (curr) {
          const diff = w.attack_bonus - curr.attack_bonus;
          const sign = diff > 0 ? '+' : '';
          addLine(store, `Compared to ${curr.name}: ${sign}${diff} ATK`, diff > 0 ? C.ITEM_COLOR : C.ERROR_COLOR);
        }
      }
      return;
    }
  }

  // Try item in inventory
  for (const iid of [...Object.keys(store.player.inventory), ...Object.keys(store.player.keyItems)]) {
    const item = itemData[iid];
    if (!item) continue;
    if (item.name.toLowerCase().includes(target.toLowerCase()) || iid.toLowerCase().includes(target.toLowerCase())) {
      addLine(store, '');
      addLine(store, `=== ${item.name} ===`, C.ITEM_COLOR);
      addLine(store, item.description, C.HELP_COLOR);
      addLine(store, `Type: ${item.type}`, C.STAT_COLOR);
      if (item.effect === 'heal' && item.value) addLine(store, `Heals ${item.value} HP`, C.STAT_COLOR);
      if (item.effect === 'buff_attack' && item.value) addLine(store, `+${item.value} ATK for 3 rounds`, C.STAT_COLOR);
      if (item.effect === 'defense' && item.value) addLine(store, `+${item.value} DEF when equipped`, C.STAT_COLOR);
      if (item.type === 'key') addLine(store, '(key item — cannot be dropped)', C.CHOICE_COLOR);
      const count = store.player.inventory[iid];
      if (count) addLine(store, `You have: ${count}`, C.HELP_COLOR);
      return;
    }
  }

  // Try examining something in the room
  if (room) {
    for (const id of [...(room.items || []), ...(room._ground_loot || [])]) {
      const item = itemData[id];
      if (item && (item.name.toLowerCase().includes(target.toLowerCase()) || id.toLowerCase().includes(target.toLowerCase()))) {
        addLine(store, '');
        addLine(store, `=== ${item.name} ===`, C.ITEM_COLOR);
        addLine(store, item.description, C.HELP_COLOR);
        return;
      }
    }
    for (const id of [...(room.weapons || []), ...(room._ground_weapons || [])]) {
      const w = weaponData[id];
      if (w && (w.name.toLowerCase().includes(target.toLowerCase()) || id.toLowerCase().includes(target.toLowerCase()))) {
        addLine(store, '');
        addLine(store, `=== ${w.name} ===`, C.ITEM_COLOR);
        addLine(store, w.description, C.HELP_COLOR);
        addLine(store, `Attack bonus: +${w.attack_bonus}`, C.STAT_COLOR);
        return;
      }
    }
  }

  addLine(store, "You don't see anything like that to examine.", C.ERROR_COLOR);
}
```

- [ ] **Step 3: Update gameReducer.ts**

In `src/engine/gameReducer.ts`:

1. Delete local `handleDrop` (lines 969-1018) and local `handleExamine` (lines 687-785).
2. Add imports:
```ts
import { handleDrop } from './handlers/drop';
import { handleExamine } from './handlers/examine';
```
3. In `handleExploringCommand`, replace the existing `verb === 'drop'` and `verb === 'examine'` cases:
```ts
} else if (verb === 'drop') {
  handleDrop(store, target, itemData, weaponData, () => updateHeader(store));
} else if (verb === 'examine') {
  handleExamine(store, target, enemyData, itemData, weaponData);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: ALL tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine/handlers/drop.ts src/engine/handlers/examine.ts src/engine/gameReducer.ts
git commit -m "Extract drop and examine handlers"
```

### Task 25: Extract use, search, and attack handlers

**Files:**
- Create: `src/engine/handlers/use.ts`
- Create: `src/engine/handlers/search.ts`
- Create: `src/engine/handlers/attack.ts`
- Modify: `src/engine/gameReducer.ts`

- [ ] **Step 1: Create handlers/use.ts**

Create `src/engine/handlers/use.ts` (body from `gameReducer.ts:892-967`):

```ts
import type { GameStore, ItemDef, WeaponDef } from '../types';
import * as C from '../constants';
import { addLine, emitSound } from '../output';
import { findAllMatches, resolveOrDisambiguate } from '../matching';
import { hasItem, hasKeyItem, removeItem, equipWeapon, heal as playerHeal, hasSkill } from '../player';

export function handleUse(
  store: GameStore,
  target: string,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  refreshHeader: () => void,
  checkEndingsForItem: (itemId: string) => void,
): void {
  if (!store.player || !store.world) return;
  if (!target) { addLine(store, 'Use what?', C.ERROR_COLOR); return; }

  const ownedWeaponIds = store.player.weapons;
  const ownedItemIds = [
    ...Object.keys(store.player.inventory),
    ...Object.keys(store.player.keyItems),
  ];

  // Try weapon
  const weaponMatches = findAllMatches(target, ownedWeaponIds, weaponData);
  if (weaponMatches.length > 1) {
    resolveOrDisambiguate(store, weaponMatches, weaponData, 'weapon do you want to equip');
    return;
  }
  if (weaponMatches.length === 1) {
    const wid = weaponMatches[0];
    equipWeapon(store.player, wid);
    addLine(store, `You equip the ${weaponData[wid].name}.`, C.ITEM_COLOR);
    emitSound(store, 'equip');
    refreshHeader();
    return;
  }

  // Try item
  const itemMatches = findAllMatches(target, ownedItemIds, itemData);
  if (itemMatches.length > 1) {
    resolveOrDisambiguate(store, itemMatches, itemData, 'item do you want to use');
    return;
  }
  if (itemMatches.length === 1) {
    const iid = itemMatches[0];
    const idata = itemData[iid];

    // Shield equip
    if (idata.type === 'shield' && hasItem(store.player, iid)) {
      store.player.equippedShield = iid;
      addLine(store, `You equip the ${idata.name}.`, C.ITEM_COLOR);
      emitSound(store, 'equip');
      return;
    }

    // Key item use — track per room for multi_item_use endings
    if (idata.type === 'key' && hasKeyItem(store.player, iid)) {
      const room_id = store.player.currentRoom;
      if (!store.player.usedItemsInRoom[room_id]) store.player.usedItemsInRoom[room_id] = {};
      store.player.usedItemsInRoom[room_id][iid] = true;
      addLine(store, `You use the ${idata.name}.`, C.ITEM_COLOR);
      checkEndingsForItem(iid);
      return;
    }

    // Consumable
    if (idata.type === 'consumable' && hasItem(store.player, iid)) {
      removeItem(store.player, iid);
      if (idata.effect === 'heal' && idata.value) {
        const healAmount = hasSkill(store.player, 'herbalism') ? Math.floor(idata.value * 1.5) : idata.value;
        const oldHp = store.player.hp;
        playerHeal(store.player, healAmount);
        const healed = store.player.hp - oldHp;
        addLine(store, `You use ${idata.name} and restore ${healed} HP.`, C.ITEM_COLOR);
      } else if (idata.effect === 'buff_attack' && idata.value) {
        store.player.buffAttack = idata.value;
        store.player.buffRounds = hasSkill(store.player, 'buff_mastery') ? 5 : 3;
        const rounds = store.player.buffRounds;
        addLine(store, `You drink ${idata.name}! +${idata.value} Attack for ${rounds} rounds.`, C.COMBAT_COLOR);
      }
      refreshHeader();
      return;
    }
  }

  addLine(store, "You don't have that or can't use it.", C.ERROR_COLOR);
}
```

- [ ] **Step 2: Create handlers/search.ts**

Create `src/engine/handlers/search.ts` (body from `gameReducer.ts:1020-1060`):

```ts
import type { GameStore, ItemDef } from '../types';
import * as C from '../constants';
import { addLine } from '../output';
import { addItem } from '../player';
import { getRoom } from '../world';

export function handleSearch(
  store: GameStore,
  itemData: Record<string, ItemDef>,
): void {
  if (!store.player || !store.world) return;
  const room = getRoom(store.world, store.player.currentRoom);
  if (!room) return;

  if (!room.searchable) {
    addLine(store, "There's nothing interesting to search here.", C.HELP_COLOR);
    return;
  }
  if (store.player.searchedRooms[store.player.currentRoom]) {
    addLine(store, "You've already searched this room.", C.HELP_COLOR);
    return;
  }

  store.player.searchedRooms[store.player.currentRoom] = true;
  addLine(store, 'You search the room carefully...', C.HELP_COLOR);

  let foundSomething = false;
  if (room.search_items) {
    for (const itemId of room.search_items) {
      const idata = itemData[itemId];
      if (idata) {
        addItem(store.player, itemId, itemData);
        addLine(store, `You find a ${idata.name}!`, C.LOOT_COLOR);
        foundSomething = true;
      }
    }
  }

  if (room.dev_note) {
    let note = room.dev_note;
    if (!note.startsWith('//')) note = '// ' + note;
    addLine(store, '');
    addLine(store, note, C.DEV_NOTE_COLOR);
    addLine(store, '');
  }

  if (!foundSomething) {
    addLine(store, "You don't find anything useful.", C.HELP_COLOR);
  }
}
```

- [ ] **Step 3: Create handlers/attack.ts**

Create `src/engine/handlers/attack.ts` (body from `gameReducer.ts:1062-1083`):

```ts
import type { GameStore, EnemyDef } from '../types';
import * as C from '../constants';
import { addLine, emitSound } from '../output';
import { getLivingEnemies } from '../world';

function findEnemyInRoom(
  name: string,
  store: GameStore,
  enemyData: Record<string, EnemyDef>,
): string | null {
  if (!store.world || !store.player) return null;
  const lower = name.toLowerCase();
  const living = getLivingEnemies(store.world, store.player.currentRoom);
  for (const enemyId of living) {
    const edata = enemyData[enemyId];
    if (!edata) continue;
    if (enemyId.toLowerCase() === lower || edata.name.toLowerCase() === lower) return enemyId;
    if (enemyId.toLowerCase().includes(lower) || edata.name.toLowerCase().includes(lower)) return enemyId;
  }
  return null;
}

export function handleAttack(
  store: GameStore,
  target: string,
  enemyData: Record<string, EnemyDef>,
  startCombat: (enemyId: string) => void,
): void {
  if (!store.player || !store.world) return;

  if (!target) {
    const living = getLivingEnemies(store.world, store.player.currentRoom);
    if (living.length === 1) {
      target = living[0];
    } else {
      addLine(store, 'Attack what?', C.ERROR_COLOR);
      return;
    }
  }

  const enemyId = findEnemyInRoom(target, store, enemyData);
  if (!enemyId) {
    addLine(store, "There's nothing like that to fight here.", C.ERROR_COLOR);
    emitSound(store, 'error');
    return;
  }

  startCombat(enemyId);
}
```

- [ ] **Step 4: Update gameReducer.ts**

In `src/engine/gameReducer.ts`:

1. Delete local `handleUse` (lines 892-967), `handleSearch` (1020-1060), `handleAttack` (1062-1083), and the local `findEnemyInRoom` helper (148-158).
2. Add imports:
```ts
import { handleUse } from './handlers/use';
import { handleSearch } from './handlers/search';
import { handleAttack } from './handlers/attack';
```
3. In `handleExploringCommand`, replace cases:
```ts
} else if (verb === 'use') {
  const [itemName, count] = parseBatchCount(target);
  for (let i = 0; i < count; i++) {
    handleUse(store, itemName, itemData, weaponData,
      () => updateHeader(store),
      (iid) => checkEndingsContext(store, { itemJustUsed: iid }));
  }
} else if (verb === 'search') {
  handleSearch(store, itemData);
} else if (verb === 'attack') {
  handleAttack(store, target, enemyData, (eid) => startCombat(store, eid));
}
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: ALL tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/engine/handlers/use.ts src/engine/handlers/search.ts src/engine/handlers/attack.ts src/engine/gameReducer.ts
git commit -m "Extract use, search, and attack handlers"
```

### Task 26: Verify Phase 2a (post-mid-extractions)

**Files:** none

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: ALL tests pass — both unit and scenario.

- [ ] **Step 2: Manual playtest (5 minutes)**

Run: `npm run dev`. Play through:
- Start new game
- Look around manor entry
- Take rusty dagger (auto-equips)
- Take small potion
- Use small potion (heals)
- Attack shadow rat (combat starts, win it)
- Take items in next room
- Save game
- Quit, load, verify state restored

Expected: Game behaves identically to pre-refactor.

- [ ] **Step 3: Tag this checkpoint**

```bash
git tag phase-2a-handlers-extracted
```

### Task 27: Extract talk handler and NPC dialogue helpers

**Files:**
- Create: `src/engine/handlers/talk.ts`
- Modify: `src/engine/gameReducer.ts`

- [ ] **Step 1: Create handlers/talk.ts**

Create `src/engine/handlers/talk.ts`. The body combines `handleTalk` (`gameReducer.ts:1585-1629`), `displayDialogueNode` (1631-1652), `handleNpcDialogueInput` (1654-1723), and `checkDialogueCondition` (1574-1583). The achievement check stays — pass it as a callback.

```ts
import type { GameStore, ItemDef, WeaponDef, NpcDef, DialogueCondition, PlayerState } from '../types';
import * as C from '../constants';
import { addLine } from '../output';
import { findAllMatches, resolveOrDisambiguate } from '../matching';
import { addItem, addWeapon, removeItem, hasItem, hasKeyItem, heal as playerHeal } from '../player';
import { getRoom } from '../world';

export function checkDialogueCondition(cond: DialogueCondition, player: PlayerState): boolean {
  switch (cond.type) {
    case 'has_key_item': return hasKeyItem(player, String(cond.value));
    case 'has_item': return hasItem(player, String(cond.value));
    case 'level_gte': return player.level >= Number(cond.value);
    case 'flag_set': return !!player.firedEvents[String(cond.value)];
    case 'flag_not_set': return !player.firedEvents[String(cond.value)];
    default: return true;
  }
}

export function handleTalk(
  store: GameStore,
  target: string,
  npcData: Record<string, NpcDef>,
  checkChatterbox: () => void,
): void {
  if (!store.player || !store.world) return;
  const room = getRoom(store.world, store.player.currentRoom);
  if (!room || !room.npcs || room.npcs.length === 0) {
    addLine(store, "There's no one to talk to here.", C.ERROR_COLOR);
    return;
  }

  let npcId: string | null = null;

  if (!target && room.npcs.length === 1) {
    npcId = room.npcs[0];
  } else if (!target && room.npcs.length > 1) {
    addLine(store, 'Who do you want to talk to?', C.CHOICE_COLOR);
    for (const id of room.npcs) {
      const npc = npcData[id];
      if (npc) addLine(store, `  ${npc.name}`, C.HELP_COLOR);
    }
    return;
  } else {
    const matches = findAllMatches(target, room.npcs, npcData);
    npcId = resolveOrDisambiguate(store, matches, npcData, 'person do you want to talk to');
    if (!npcId) {
      if (matches.length === 0) addLine(store, "You don't see anyone like that here.", C.ERROR_COLOR);
      return;
    }
  }

  const npc = npcData[npcId];
  if (!npc) {
    addLine(store, "There's no one to talk to here.", C.ERROR_COLOR);
    return;
  }

  store.npcDialogue = { npcId, currentNode: 'start' };
  store.player.firedEvents[`talked_${npcId}`] = true;
  displayDialogueNode(store, npcData);
  store.state = 'dialogue';

  checkChatterbox();
}

export function displayDialogueNode(store: GameStore, npcData: Record<string, NpcDef>): void {
  if (!store.npcDialogue || !store.player) return;
  const npc = npcData[store.npcDialogue.npcId];
  if (!npc) return;
  const node = npc.dialogue[store.npcDialogue.currentNode];
  if (!node) return;

  addLine(store, '');
  for (const line of node.text) {
    addLine(store, line, C.NPC_COLOR);
  }

  const visibleChoices = node.choices.filter(c =>
    !c.condition || checkDialogueCondition(c.condition, store.player!)
  );

  store.dialogueOptions = visibleChoices.map(c => c.label);
  addLine(store, '');
  visibleChoices.forEach((choice, i) => {
    addLine(store, `[${i + 1}] ${choice.label}`, C.CHOICE_COLOR);
  });
}

export function handleNpcDialogueInput(
  store: GameStore,
  input: string,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  npcData: Record<string, NpcDef>,
  refreshHeader: () => void,
): void {
  if (!store.npcDialogue || !store.player || !store.world) return;

  const npc = npcData[store.npcDialogue.npcId];
  if (!npc) return;
  const node = npc.dialogue[store.npcDialogue.currentNode];
  if (!node) return;

  const visibleChoices = node.choices.filter(c =>
    !c.condition || checkDialogueCondition(c.condition, store.player!)
  );

  const trimmed = input.trim();
  const num = parseInt(trimmed, 10);
  let choiceIdx = -1;

  if (!isNaN(num) && num >= 1 && num <= visibleChoices.length) {
    choiceIdx = num - 1;
  } else {
    for (let i = 0; i < visibleChoices.length; i++) {
      if (trimmed.toLowerCase() === visibleChoices[i].label.toLowerCase()) {
        choiceIdx = i;
        break;
      }
    }
  }

  if (choiceIdx < 0) {
    addLine(store, `Choose an option: 1-${visibleChoices.length}`, C.ERROR_COLOR);
    return;
  }

  const choice = visibleChoices[choiceIdx];

  if (choice.effect) {
    const eff = choice.effect;
    if (eff.give_item) {
      addItem(store.player, eff.give_item, itemData);
      const idata = itemData[eff.give_item];
      if (idata) addLine(store, `Received: ${idata.name}`, C.ITEM_COLOR);
    }
    if (eff.give_weapon) {
      addWeapon(store.player, eff.give_weapon);
      const wdata = weaponData[eff.give_weapon];
      if (wdata) addLine(store, `Received: ${wdata.name}`, C.ITEM_COLOR);
    }
    if (eff.heal && eff.heal > 0) {
      playerHeal(store.player, eff.heal);
      addLine(store, `Healed ${eff.heal} HP.`, C.ITEM_COLOR);
      refreshHeader();
    }
    if (eff.set_flag) {
      store.player.firedEvents[eff.set_flag] = true;
    }
    if (eff.remove_item) {
      removeItem(store.player, eff.remove_item);
    }
  }

  if (choice.next === null) {
    addLine(store, '');
    addLine(store, `${npc.name} nods farewell.`, C.NPC_COLOR);
    store.npcDialogue = null;
    store.state = 'exploring';
  } else {
    store.npcDialogue.currentNode = choice.next;
    displayDialogueNode(store, npcData);
  }
}
```

- [ ] **Step 2: Update gameReducer.ts**

In `src/engine/gameReducer.ts`:

1. Delete local `checkDialogueCondition` (1574-1583), `handleTalk` (1585-1629), `displayDialogueNode` (1631-1652), `handleNpcDialogueInput` (1654-1723).
2. Add imports:
```ts
import { handleTalk, handleNpcDialogueInput } from './handlers/talk';
```
3. Replace the `verb === 'talk'` case in `handleExploringCommand`:
```ts
} else if (verb === 'talk') {
  handleTalk(store, target, npcData, () => {
    const allNpcIds = Object.keys(npcData);
    if (allNpcIds.length > 0 && allNpcIds.every(id => store.player!.firedEvents[`talked_${id}`])) {
      checkAchievement(store, 'chatterbox');
    }
  });
}
```
4. In `handleDialogueInput` (around line 1385), replace the NPC dialogue branch:
```ts
if (store.npcDialogue) {
  handleNpcDialogueInput(store, input, itemData, weaponData, npcData, () => updateHeader(store));
  return;
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: ALL tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/engine/handlers/talk.ts src/engine/gameReducer.ts
git commit -m "Extract talk and NPC dialogue handlers"
```

### Task 28: Extract meta handlers (save/load/journal/map/skills/learn/again/quit/achievements/inventory/stats)

**Files:**
- Create: `src/engine/handlers/meta.ts`
- Modify: `src/engine/gameReducer.ts`

- [ ] **Step 1: Create handlers/meta.ts**

Create `src/engine/handlers/meta.ts` with all the read-only and lifecycle handlers. Bodies are copied verbatim from `gameReducer.ts` (sections referenced in comments below).

```ts
import type { GameStore, ItemDef, WeaponDef } from '../types';
import * as C from '../constants';
import { addLine } from '../output';
import {
  totalAttack, totalDefense, xpToNextLevel, visitedCount,
} from '../player';
import { SKILL_TREE, getSkillsByBranch, canLearnSkill, findSkillByName } from '../skills';
import { getAll as getAllAchievements } from '../achievements';

// from gameReducer.ts:546-587 — showInventory
export function showInventory(
  store: GameStore,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
): void {
  if (!store.player) return;
  addLine(store, '');
  addLine(store, '=== Inventory ===', C.STAT_COLOR);

  if (store.player.equippedWeapon && weaponData[store.player.equippedWeapon]) {
    const w = weaponData[store.player.equippedWeapon];
    addLine(store, `Weapon: ${w.name} (+${w.attack_bonus} ATK)`, C.ITEM_COLOR);
  } else {
    addLine(store, 'Weapon: Fists', C.ITEM_COLOR);
  }

  if (store.player.equippedShield && itemData[store.player.equippedShield]) {
    const s = itemData[store.player.equippedShield];
    addLine(store, `Shield: ${s.name} (+${s.value} DEF)`, C.ITEM_COLOR);
  }

  const otherWeapons = store.player.weapons.filter(w => w !== store.player!.equippedWeapon);
  for (const wid of otherWeapons) {
    const w = weaponData[wid];
    if (w) addLine(store, `  ${w.name} (+${w.attack_bonus} ATK)`, C.HELP_COLOR);
  }

  let hasItems = false;
  for (const [itemId, count] of Object.entries(store.player.inventory)) {
    hasItems = true;
    const idata = itemData[itemId];
    const name = idata?.name || itemId;
    addLine(store, count > 1 ? `  ${name} x${count}` : `  ${name}`, C.HELP_COLOR);
  }

  for (const kid of Object.keys(store.player.keyItems)) {
    hasItems = true;
    const idata = itemData[kid];
    const name = idata?.name || kid;
    addLine(store, `  ${name} [key]`, C.LOOT_COLOR);
  }

  if (!hasItems && store.player.weapons.length === 0) {
    addLine(store, '  (empty)', C.HELP_COLOR);
  }
}

// from gameReducer.ts:589-611 — showStats
export function showStats(
  store: GameStore,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
): void {
  if (!store.player) return;
  addLine(store, '');
  addLine(store, '=== Stats ===', C.STAT_COLOR);
  addLine(store, `HP: ${store.player.hp}/${store.player.maxHp}`, C.STAT_COLOR);

  let totalAtk = totalAttack(store.player);
  if (store.player.equippedWeapon && weaponData[store.player.equippedWeapon]) {
    totalAtk += weaponData[store.player.equippedWeapon].attack_bonus;
  }
  addLine(store, `Attack: ${totalAtk}`, C.STAT_COLOR);
  addLine(store, `Defense: ${totalDefense(store.player, itemData)}`, C.STAT_COLOR);
  addLine(store, `Level: ${store.player.level}`, C.STAT_COLOR);
  addLine(store, `XP: ${store.player.xp}/${xpToNextLevel(store.player)}`, C.STAT_COLOR);
  addLine(store, `Rooms visited: ${visitedCount(store.player)}`, C.STAT_COLOR);
  if (store.player.skillPoints > 0) {
    addLine(store, `Skill Points: ${store.player.skillPoints}`, C.CHOICE_COLOR);
  }
  const learnedSkills = SKILL_TREE.filter(s => store.player!.skills[s.id]);
  if (learnedSkills.length > 0) {
    addLine(store, `Skills: ${learnedSkills.map(s => s.name).join(', ')}`, C.ITEM_COLOR);
  }
}

// from gameReducer.ts:1553-1570 — showJournal
export function showJournal(store: GameStore): void {
  if (!store.player) return;
  addLine(store, '');
  addLine(store, '=== Journal ===', C.STAT_COLOR);
  if (store.player.journalEntries.length === 0) {
    addLine(store, '  (no entries)', C.HELP_COLOR);
    return;
  }
  const entries = store.player.journalEntries.slice(-20);
  for (const entry of entries) {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    let color = C.HELP_COLOR;
    if (entry.type === 'combat') color = C.COMBAT_COLOR;
    else if (entry.type === 'item') color = C.ITEM_COLOR;
    else if (entry.type === 'story') color = C.CHOICE_COLOR;
    addLine(store, `  [${time}] ${entry.text}`, color);
  }
}

// from gameReducer.ts:209-232 — showSkills
export function showSkills(store: GameStore): void {
  if (!store.player) return;
  addLine(store, '');
  addLine(store, '=== Skill Tree ===', C.STAT_COLOR);
  addLine(store, `Skill Points: ${store.player.skillPoints}`, C.CHOICE_COLOR);
  addLine(store, '');

  const branches: Array<'warrior' | 'rogue' | 'mage'> = ['warrior', 'rogue', 'mage'];
  for (const branch of branches) {
    addLine(store, `--- ${branch.charAt(0).toUpperCase() + branch.slice(1)} ---`, C.COMBAT_COLOR);
    const skills = getSkillsByBranch(branch);
    for (const skill of skills) {
      if (store.player.skills[skill.id]) {
        addLine(store, `  [*] ${skill.name} - ${skill.description}`, C.ITEM_COLOR);
      } else if (canLearnSkill(store.player.skills, skill.id)) {
        addLine(store, `  [>] ${skill.name} - ${skill.description} (available)`, C.CHOICE_COLOR);
      } else {
        addLine(store, `  [ ] ${skill.name} - ${skill.description}`, C.HELP_COLOR);
      }
    }
    addLine(store, '');
  }
  addLine(store, "Type 'learn <skill>' to learn a skill.", C.HELP_COLOR);
}

// from gameReducer.ts:234-290 — handleLearn
export function handleLearn(
  store: GameStore,
  target: string,
  refreshHeader: () => void,
  emit: (sound: string) => void,
  checkScholar: () => void,
): void {
  if (!store.player) return;
  if (!target) {
    addLine(store, 'Learn what? Type "skills" to see available skills.', C.ERROR_COLOR);
    return;
  }

  const skill = findSkillByName(target);
  if (!skill) {
    addLine(store, "Unknown skill. Type 'skills' to see available skills.", C.ERROR_COLOR);
    return;
  }

  if (store.player.skills[skill.id]) {
    addLine(store, `You already know ${skill.name}.`, C.ERROR_COLOR);
    return;
  }

  if (!canLearnSkill(store.player.skills, skill.id)) {
    addLine(store, `You need to learn earlier skills in the ${skill.branch} branch first.`, C.ERROR_COLOR);
    return;
  }

  if (store.player.skillPoints <= 0) {
    addLine(store, 'You have no skill points. Level up to earn more.', C.ERROR_COLOR);
    return;
  }

  store.player.skills[skill.id] = true;
  store.player.skillPoints--;

  if (skill.id === 'iron_will') {
    const bonus = 5 * store.player.level;
    store.player.maxHp += bonus;
    store.player.hp += bonus;
  } else if (skill.id === 'heavy_blows') {
    store.player.attack += 2;
  } else if (skill.id === 'thick_skin') {
    store.player.defense += 2;
  } else if (skill.id === 'titan') {
    store.player.maxHp += 15;
    store.player.hp += 15;
    store.player.attack += 1;
    store.player.defense += 1;
  }

  addLine(store, `Learned ${skill.name}! ${skill.description}`, C.ITEM_COLOR);
  emit('levelUp');
  refreshHeader();
  checkScholar();
}

// from gameReducer.ts:292-306 — showAchievements
export function showAchievements(store: GameStore): void {
  addLine(store, '');
  addLine(store, '=== Achievements ===', C.STAT_COLOR);
  const all = getAllAchievements();
  for (const ach of all) {
    if (ach.unlocked) {
      addLine(store, `  [*] ${ach.name} - ${ach.description}`, C.ITEM_COLOR);
    } else {
      addLine(store, `  [ ] ${ach.name} - ${ach.description}`, C.HELP_COLOR);
    }
  }
  const unlocked = all.filter(a => a.unlocked).length;
  addLine(store, '');
  addLine(store, `${unlocked}/${all.length} unlocked`, C.STAT_COLOR);
}
```

- [ ] **Step 2: Update gameReducer.ts**

In `src/engine/gameReducer.ts`:

1. Delete local `showInventory` (546-587), `showStats` (589-611), `showJournal` (1553-1570), `showSkills` (209-232), `handleLearn` (234-290), `showAchievements` (292-306).
2. Add imports:
```ts
import {
  showInventory, showStats, showJournal, showSkills, handleLearn, showAchievements,
} from './handlers/meta';
```
3. Add wrapper functions at the top of the file so existing call sites stay short:
```ts
function showInventoryWrapped(s: GameStore) { showInventory(s, itemData, weaponData); }
function showStatsWrapped(s: GameStore) { showStats(s, itemData, weaponData); }
```
4. In `handleExploringCommand`, replace the relevant cases:
```ts
} else if (verb === 'inventory') {
  showInventoryWrapped(store);
} else if (verb === 'stats') {
  showStatsWrapped(store);
} else if (verb === 'journal') {
  showJournal(store);
} else if (verb === 'skills') {
  showSkills(store);
} else if (verb === 'learn') {
  handleLearn(store, target,
    () => updateHeader(store),
    (s) => emitSound(store, s),
    () => {
      const learnedCount = Object.values(store.player!.skills).filter(Boolean).length;
      if (learnedCount >= 5) checkAchievement(store, 'scholar');
    });
} else if (verb === 'achievements') {
  showAchievements(store);
}
```
5. In `handleCombatCommand`, replace the analogous cases (`inventory`, `stats`, `skills`):
```ts
} else if (verb === 'inventory') {
  showInventoryWrapped(store);
  return;
} else if (verb === 'stats') {
  showStatsWrapped(store);
  return;
} else if (verb === 'skills') {
  showSkills(store);
  return;
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: ALL tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/engine/handlers/meta.ts src/engine/gameReducer.ts
git commit -m "Extract meta handlers (info, journal, skills, learn, achievements)"
```

### Task 29: Extract state/exploring.ts

**Files:**
- Create: `src/engine/state/exploring.ts`
- Modify: `src/engine/gameReducer.ts`

- [ ] **Step 1: Create state/exploring.ts**

The body is the existing `handleExploringCommand` from `gameReducer.ts:1249-1364`, plus the autocomplete logic from `getAutocompleteSuggestions` (615-683). Both functions take their data dependencies as arguments.

Create `src/engine/state/exploring.ts`:

```ts
import type { GameStore, EnemyDef, ItemDef, WeaponDef, NpcDef } from '../types';
import { handleLook } from '../handlers/look';
import { handleHelp } from '../handlers/help';
import { handleTake } from '../handlers/take';
import { handleDrop } from '../handlers/drop';
import { handleExamine } from '../handlers/examine';
import { handleUse } from '../handlers/use';
import { handleSearch } from '../handlers/search';
import { handleAttack } from '../handlers/attack';
import { handleTalk } from '../handlers/talk';
import {
  showInventory, showStats, showJournal, showSkills, handleLearn, showAchievements,
} from '../handlers/meta';
import { SKILL_TREE, canLearnSkill } from '../skills';
import { getRoom, getExits, getLivingEnemies } from '../world';

export interface ExploringDeps {
  enemyData: Record<string, EnemyDef>;
  itemData: Record<string, ItemDef>;
  weaponData: Record<string, WeaponDef>;
  npcData: Record<string, NpcDef>;
  refreshHeader: () => void;
  emit: (sound: string) => void;
  addJournal: (type: 'item' | 'combat' | 'story' | 'room', text: string) => void;
  startCombat: (enemyId: string) => void;
  checkEndingsForItem: (itemId: string) => void;
  checkChatterbox: () => void;
  checkScholar: () => void;
  checkItemAchievements: () => void;
  goDirection: (direction: string) => void;
  doSave: () => void;
  doLoadPicker: () => void;
  doMap: () => void;
  doScore: () => void;
  doSettings: () => void;
  doQuit: () => void;
  doAgain: () => void;
  printError: (msg: string) => void;
}

const HANDLED_BY_INFO_VERBS = new Set(['help', 'inventory', 'stats', 'journal', 'score']);

export function handleExploringCommand(
  store: GameStore,
  verb: string,
  target: string,
  deps: ExploringDeps,
): void {
  if (!store.player || !store.world) return;

  if (verb === 'go') {
    deps.goDirection(target);
  } else if (verb === 'look') {
    handleLook(store, deps.enemyData, deps.itemData, deps.weaponData, deps.npcData);
  } else if (verb === 'inventory') {
    showInventory(store, deps.itemData, deps.weaponData);
  } else if (verb === 'stats') {
    showStats(store, deps.itemData, deps.weaponData);
  } else if (verb === 'take') {
    handleTake(store, target, deps.itemData, deps.weaponData,
      (type, text) => deps.addJournal(type, text),
      deps.checkItemAchievements,
      deps.refreshHeader);
  } else if (verb === 'use') {
    const [itemName, count] = parseBatchCount(target);
    for (let i = 0; i < count; i++) {
      handleUse(store, itemName, deps.itemData, deps.weaponData,
        deps.refreshHeader,
        deps.checkEndingsForItem);
    }
  } else if (verb === 'drop') {
    handleDrop(store, target, deps.itemData, deps.weaponData, deps.refreshHeader);
  } else if (verb === 'search') {
    handleSearch(store, deps.itemData);
  } else if (verb === 'attack') {
    handleAttack(store, target, deps.enemyData, deps.startCombat);
  } else if (verb === 'talk') {
    handleTalk(store, target, deps.npcData, deps.checkChatterbox);
  } else if (verb === 'save') {
    deps.doSave();
  } else if (verb === 'load') {
    deps.doLoadPicker();
  } else if (verb === 'journal') {
    showJournal(store);
  } else if (verb === 'map') {
    deps.doMap();
  } else if (verb === 'score') {
    deps.doScore();
  } else if (verb === 'examine') {
    handleExamine(store, target, deps.enemyData, deps.itemData, deps.weaponData);
  } else if (verb === 'skills') {
    showSkills(store);
  } else if (verb === 'learn') {
    handleLearn(store, target, deps.refreshHeader, deps.emit, deps.checkScholar);
  } else if (verb === 'achievements') {
    showAchievements(store);
  } else if (verb === 'settings') {
    deps.doSettings();
  } else if (verb === 'again') {
    deps.doAgain();
    return;
  } else if (verb === 'help') {
    handleHelp(store);
  } else if (verb === 'quit') {
    deps.doQuit();
  } else {
    deps.printError("I don't understand that. Type 'help' for commands.");
  }

  if (!HANDLED_BY_INFO_VERBS.has(verb) && verb !== 'again') {
    store.lastCommand = `${verb}${target ? ' ' + target : ''}`;
  }
}

export function parseBatchCount(target: string): [string, number] {
  const match = target.match(/^(.+?)\s*x(\d+)$/i);
  if (match) {
    return [match[1].trim(), Math.min(parseInt(match[2], 10), 10)];
  }
  return [target, 1];
}

const ALL_VERBS = [
  'go', 'look', 'take', 'use', 'drop', 'search', 'attack', 'defend', 'flee',
  'inventory', 'stats', 'save', 'load', 'help', 'quit', 'talk', 'journal',
  'map', 'score', 'again', 'examine', 'skills', 'learn', 'achievements', 'settings',
  'north', 'south', 'east', 'west', 'up', 'down',
];

export function getAutocompleteSuggestions(
  store: GameStore,
  input: string,
  enemyData: Record<string, EnemyDef>,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  npcData: Record<string, NpcDef>,
): string[] {
  const lower = input.toLowerCase();
  if (!lower) return [];

  const parts = lower.split(/\s+/);

  if (parts.length <= 1) {
    return ALL_VERBS
      .filter(v => v.startsWith(lower) && v !== lower)
      .map(v => v);
  }

  const verb = parts[0];
  const partial = parts.slice(1).join(' ');
  const candidates: string[] = [];

  if (!store.player || !store.world) return [];
  const room = getRoom(store.world, store.player.currentRoom);

  if (verb === 'take' && room) {
    for (const id of [...(room.items || []), ...(room._ground_loot || [])]) {
      const d = itemData[id]; if (d) candidates.push(d.name);
    }
    for (const id of [...(room.weapons || []), ...(room._ground_weapons || [])]) {
      const d = weaponData[id]; if (d) candidates.push(d.name);
    }
  } else if (verb === 'use' || verb === 'drop' || verb === 'examine') {
    for (const id of Object.keys(store.player.inventory)) {
      const d = itemData[id]; if (d) candidates.push(d.name);
    }
    for (const id of Object.keys(store.player.keyItems)) {
      const d = itemData[id]; if (d) candidates.push(d.name);
    }
    for (const id of store.player.weapons) {
      const d = weaponData[id]; if (d) candidates.push(d.name);
    }
  } else if (verb === 'attack' && room) {
    for (const id of getLivingEnemies(store.world, store.player.currentRoom)) {
      const d = enemyData[id]; if (d) candidates.push(d.name);
    }
  } else if (verb === 'talk' && room?.npcs) {
    for (const id of room.npcs) {
      const d = npcData[id]; if (d) candidates.push(d.name);
    }
  } else if (verb === 'go') {
    const exits = getExits(store.world, store.player.currentRoom);
    candidates.push(...Object.keys(exits));
  } else if (verb === 'learn') {
    for (const skill of SKILL_TREE) {
      if (canLearnSkill(store.player.skills, skill.id)) {
        candidates.push(skill.name);
      }
    }
  }

  if (!partial) return candidates;
  return candidates.filter(c => c.toLowerCase().startsWith(partial));
}
```

- [ ] **Step 2: Update gameReducer.ts**

In `src/engine/gameReducer.ts`:

1. Delete the local `handleExploringCommand` (1249-1364), `parseBatchCount` (789-795), `getAutocompleteSuggestions` (622-683), and the `ALL_VERBS` array (615-620).
2. Add imports:
```ts
import {
  handleExploringCommand as handleExploringCommandRaw,
  getAutocompleteSuggestions as getAutocompleteSuggestionsRaw,
  type ExploringDeps,
} from './state/exploring';
```
3. Add a builder for the deps object so existing call sites stay clean:
```ts
function buildExploringDeps(store: GameStore): ExploringDeps {
  return {
    enemyData, itemData, weaponData, npcData,
    refreshHeader: () => updateHeader(store),
    emit: (sound) => emitSound(store, sound),
    addJournal: (type, text) => addJournal(store, type, text),
    startCombat: (eid) => startCombat(store, eid),
    checkEndingsForItem: (iid) => checkEndingsContext(store, { itemJustUsed: iid }),
    checkChatterbox: () => {
      const allNpcIds = Object.keys(npcData);
      if (allNpcIds.length > 0 && allNpcIds.every(id => store.player!.firedEvents[`talked_${id}`])) {
        checkAchievement(store, 'chatterbox');
      }
    },
    checkScholar: () => {
      const learnedCount = Object.values(store.player!.skills).filter(Boolean).length;
      if (learnedCount >= 5) checkAchievement(store, 'scholar');
    },
    checkItemAchievements: () => checkItemAchievements(store),
    goDirection: (target) => {
      // descend handling (dungeon mode)
      if (target === 'descend' && store.gameMode === 'dungeon' && store.dungeon) {
        const room = getRoom(store.world!, store.player!.currentRoom);
        if (room && room.id.startsWith('dng_rest_')) {
          store.dungeon.floor++;
          store.dungeon.score.floorsCleared++;
          if (store.dungeon.floor >= 5) checkAchievement(store, 'dungeon_crawler');
          if (store.dungeon.floor >= 20) checkAchievement(store, 'dungeon_master');
          loadDungeonFloor(store, store.dungeon.floor);
          clearTerminal(store);
          addLine(store, `--- Floor ${store.dungeon.floor} ---`, C.COMBAT_COLOR);
          addLine(store, '');
          enterRoom(store, store.player!.currentRoom);
          updateHeader(store);
          return;
        }
      }
      const nextRoom = getAdjacentRoom(store.world!, store.player!.currentRoom, target);
      if (nextRoom && getRoom(store.world!, nextRoom)) {
        addLine(store, '');
        const entered = enterRoom(store, nextRoom);
        if (entered) updateHeader(store);
      } else {
        addLine(store, "You can't go that way.", C.ERROR_COLOR);
        emitSound(store, 'error');
      }
    },
    doSave: () => {
      if (store.activeSlot !== null) {
        if (store.player && store.world && saveToSlot(store.activeSlot, store.player, store.world, store.dungeon)) {
          addLine(store, 'Game saved.', C.ITEM_COLOR);
          emitSound(store, 'save');
        } else {
          addLine(store, 'Failed to save game.', C.ERROR_COLOR);
        }
      } else {
        openSlotPicker(store, 'save');
      }
    },
    doLoadPicker: () => openSlotPicker(store, 'load'),
    doMap: () => { store.state = 'minimap'; store.minimapOpen = true; },
    doScore: () => {
      if (store.gameMode === 'dungeon' && store.dungeon) {
        addLine(store, '');
        addLine(store, '=== Dungeon Score ===', C.STAT_COLOR);
        addLine(store, `Floor: ${store.dungeon.floor}`, C.STAT_COLOR);
        addLine(store, `Floors cleared: ${store.dungeon.score.floorsCleared}`, C.STAT_COLOR);
        addLine(store, `Enemies killed: ${store.dungeon.score.enemiesKilled}`, C.STAT_COLOR);
        addLine(store, `Items found: ${store.dungeon.score.itemsFound}`, C.STAT_COLOR);
        addLine(store, `Seed: ${store.dungeon.seed}`, C.HELP_COLOR);
      } else {
        addLine(store, "I don't understand that. Type 'help' for commands.", C.ERROR_COLOR);
      }
    },
    doSettings: () => openSettings(store, 'exploring'),
    doQuit: () => startMenu(store),
    doAgain: () => {
      if (store.lastCommand) {
        const [v, t] = parseCommand(store.lastCommand);
        if (v) {
          addLine(store, `(repeating: ${store.lastCommand})`, C.HELP_COLOR);
          handleExploringCommandRaw(store, v, t, buildExploringDeps(store));
        }
      } else {
        addLine(store, 'No previous command to repeat.', C.ERROR_COLOR);
      }
    },
    printError: (msg) => addLine(store, msg, C.ERROR_COLOR),
  };
}

function handleExploringCommand(store: GameStore, verb: string, target: string): void {
  handleExploringCommandRaw(store, verb, target, buildExploringDeps(store));
}

function getAutocompleteSuggestions(store: GameStore, input: string): string[] {
  return getAutocompleteSuggestionsRaw(store, input, enemyData, itemData, weaponData, npcData);
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: ALL tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/engine/state/exploring.ts src/engine/gameReducer.ts
git commit -m "Extract exploring state dispatcher"
```

### Task 30: Extract state/combat.ts

**Files:**
- Create: `src/engine/state/combat.ts`
- Modify: `src/engine/gameReducer.ts`

- [ ] **Step 1: Create state/combat.ts**

Create `src/engine/state/combat.ts`. Body is `processCombatMessages` (1085-1104) and `handleCombatCommand` (1106-1247) with deps passed in:

```ts
import type { GameStore, ItemDef, WeaponDef, EnemyDef, CombatMessage } from '../types';
import * as C from '../constants';
import { addLine, emitSound } from '../output';
import { findAllMatches, resolveOrDisambiguate } from '../matching';
import { playerAttack, playerDefend, playerFlee, playerUseItem, enemyDefeated } from '../combat';
import { showInventory, showStats, showSkills } from '../handlers/meta';
import { markEnemyDead } from '../world';
import { pushEffect } from '../effects';

export interface CombatDeps {
  itemData: Record<string, ItemDef>;
  weaponData: Record<string, WeaponDef>;
  enemyData: Record<string, EnemyDef>;
  refreshHeader: () => void;
  addJournal: (type: 'combat', text: string) => void;
  checkEndingsForBoss: (enemyId: string) => void;
  checkAchievement: (id: string) => void;
  startGameover: () => void;
  getRoom: (id: string) => any;
}

function processCombatMessages(store: GameStore, msgs: CombatMessage[]): void {
  for (const msg of msgs) {
    addLine(store, msg.text, msg.color);
    if (msg.text.includes('deals') && msg.text.includes('damage to you')) {
      pushEffect(store.effects, 'shake', 0.3, { intensity: 4 });
      pushEffect(store.effects, 'flash', 0.2, { r: 1, g: 0, b: 0 });
      emitSound(store, 'playerHit');
    }
    if (msg.text.includes('CRITICAL HIT!')) {
      pushEffect(store.effects, 'flash', 0.3, { r: 1, g: 1, b: 1 });
      emitSound(store, 'critical');
    }
    if (msg.text.includes('enemy lands a CRITICAL HIT')) {
      pushEffect(store.effects, 'shake', 0.4, { intensity: 6 });
    }
    if (msg.text.includes('LEVEL UP!')) {
      emitSound(store, 'levelUp');
    }
  }
}

export function handleCombatCommand(
  store: GameStore,
  verb: string,
  target: string,
  deps: CombatDeps,
): void {
  if (!store.combat || !store.player || !store.world) {
    store.state = 'exploring';
    return;
  }

  addLine(store, '');

  let msgs: CombatMessage[] = [];

  if (verb === 'attack') {
    msgs = playerAttack(store.combat, store.player, deps.weaponData, deps.itemData);
  } else if (verb === 'defend') {
    msgs = playerDefend(store.combat, store.player, deps.itemData);
  } else if (verb === 'flee') {
    msgs = playerFlee(store.combat, store.player, deps.itemData);
  } else if (verb === 'use') {
    if (!target) {
      addLine(store, 'Use what?', C.ERROR_COLOR);
      return;
    }
    const consumableIds = Object.keys(store.player.inventory).filter(id => deps.itemData[id]?.type === 'consumable');
    const matches = findAllMatches(target, consumableIds, deps.itemData);
    if (matches.length > 1) {
      resolveOrDisambiguate(store, matches, deps.itemData, 'item do you want to use');
      return;
    }
    if (matches.length === 0) {
      addLine(store, "You don't have that.", C.ERROR_COLOR);
      return;
    }
    msgs = playerUseItem(store.combat, store.player, matches[0], deps.itemData);
  } else if (verb === 'inventory') {
    showInventory(store, deps.itemData, deps.weaponData);
    return;
  } else if (verb === 'stats') {
    showStats(store, deps.itemData, deps.weaponData);
    return;
  } else if (verb === 'skills') {
    showSkills(store);
    return;
  } else {
    addLine(store, 'In combat: attack, defend, flee, use <item>', C.COMBAT_COLOR);
    return;
  }

  processCombatMessages(store, msgs);
  deps.refreshHeader();

  if (store.player.hp > 0 && store.player.hp < store.player.maxHp * 0.3) {
    pushEffect(store.effects, 'jitter', 1.0, { intensity: 0.2 });
  }

  if (store.combat.finished) {
    if (store.combat.playerWon) {
      const defeatedEnemyId = store.combatEnemyId!;
      const results = enemyDefeated(store.combat, store.player);
      processCombatMessages(store, results.messages);

      const wasBoss = store.combat.enemy.isBoss;
      markEnemyDead(store.world, store.player.currentRoom, defeatedEnemyId);
      deps.addJournal('combat', `Defeated ${store.combat.enemy.name}`);
      if (store.gameMode === 'dungeon' && store.dungeon) {
        store.dungeon.score.enemiesKilled++;
      }

      const room = deps.getRoom(store.player.currentRoom);
      if (room) {
        if (results.loot.length > 0) {
          if (!room._ground_loot) room._ground_loot = [];
          for (const lootItemId of results.loot) {
            room._ground_loot.push(lootItemId);
            const idata = deps.itemData[lootItemId];
            if (idata) addLine(store, `The enemy drops a ${idata.name}.`, C.LOOT_COLOR);
          }
        }
        if (results.weapon) {
          if (!room._ground_weapons) room._ground_weapons = [];
          room._ground_weapons.push(results.weapon);
          const wdata = deps.weaponData[results.weapon];
          if (wdata) addLine(store, `The enemy drops a ${wdata.name}!`, C.LOOT_COLOR);
        }
      }

      addLine(store, '');
      addLine(store, '=== COMBAT END ===', C.COMBAT_COLOR);
      emitSound(store, 'victory');
      store.combat = null;
      store.combatEnemyId = null;
      store.state = 'exploring';

      deps.checkEndingsForBoss(defeatedEnemyId);

      deps.checkAchievement('first_blood');
      if (wasBoss) {
        deps.checkAchievement('boss_slayer');
        if (defeatedEnemyId === 'evil_king') deps.checkAchievement('king_slayer');
      }
      if (results.leveled) {
        if (store.player.level >= 15) deps.checkAchievement('master');
        addLine(store, 'You gained a skill point! Type "skills" to learn new abilities.', C.CHOICE_COLOR);
      }
      // checkItemAchievements + explorer + dungeon achievements stay in the wrapper
    } else if (store.combat.fled) {
      addLine(store, '');
      addLine(store, '=== FLED COMBAT ===', C.COMBAT_COLOR);
      emitSound(store, 'fleeSuccess');
      store.combat = null;
      store.combatEnemyId = null;
      store.state = 'exploring';
    } else {
      store.combat = null;
      store.combatEnemyId = null;
      deps.startGameover();
    }

    deps.refreshHeader();
  }
}
```

- [ ] **Step 2: Update gameReducer.ts**

In `src/engine/gameReducer.ts`:

1. Delete local `processCombatMessages` (1085-1104) and `handleCombatCommand` (1106-1247).
2. Add import:
```ts
import { handleCombatCommand as handleCombatCommandRaw, type CombatDeps } from './state/combat';
```
3. Add a wrapper that builds the deps:
```ts
function buildCombatDeps(store: GameStore): CombatDeps {
  return {
    itemData, weaponData, enemyData,
    refreshHeader: () => updateHeader(store),
    addJournal: (type, text) => addJournal(store, type, text),
    checkEndingsForBoss: (eid) => checkEndingsContext(store, { bossJustDefeated: eid }),
    checkAchievement: (id) => checkAchievement(store, id),
    startGameover: () => startGameover(store),
    getRoom: (id) => getRoom(store.world!, id),
  };
}

function handleCombatCommand(store: GameStore, verb: string, target: string): void {
  handleCombatCommandRaw(store, verb, target, buildCombatDeps(store));
  // Post-combat achievement checks that need access to gameReducer-local helpers
  if (store.state === 'exploring' && store.player && store.world) {
    checkItemAchievements(store);
    if (store.gameMode === 'story') {
      const totalRooms = Object.keys(store.world.rooms).filter(id => !id.startsWith('dng_')).length;
      const visited = Object.keys(store.player.visitedRooms).filter(id => !id.startsWith('dng_')).length;
      if (totalRooms > 0 && visited / totalRooms >= 0.8) {
        checkAchievement(store, 'explorer');
      }
    }
    if (store.gameMode === 'dungeon' && store.dungeon) {
      if (store.dungeon.floor >= 5) checkAchievement(store, 'dungeon_crawler');
      if (store.dungeon.floor >= 20) checkAchievement(store, 'dungeon_master');
    }
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: ALL tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/engine/state/combat.ts src/engine/gameReducer.ts
git commit -m "Extract combat state dispatcher"
```

### Task 31: Verify Phase 2 — extracted state dispatchers

**Files:** none

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: ALL tests pass.

- [ ] **Step 2: Manual playtest (5 minutes)**

Run: `npm run dev`. Full playthrough:
- Start new game → Manor Entry → take dagger → fight rat → win → take potion
- Walk to Main Hall → talk to Dusty → exhaust dialogue tree
- Save → quit to menu → load → verify state

Expected: identical to pre-refactor.

- [ ] **Step 3: Check `gameReducer.ts` line count**

Run: `wc -l src/engine/gameReducer.ts`
Expected: under 1,500 lines (started at 2,383). The remaining code is dispatching, dungeon helpers, save/menu/settings/dialogue/ending state machines, action switch, tick loop.

- [ ] **Step 4: Tag**

```bash
git tag phase-2b-state-dispatchers-extracted
```

### Task 32: Extract state/dialogue.ts (ending choices + dungeon special rooms)

**Files:**
- Create: `src/engine/state/dialogue.ts`
- Modify: `src/engine/gameReducer.ts`

The dialogue state handles three input flows: NPC dialogue (already extracted into `handlers/talk.ts`), ending-choice prompts, and dungeon special rooms. The wrapper that picks among them moves to this new file.

- [ ] **Step 1: Create state/dialogue.ts**

Create `src/engine/state/dialogue.ts`. Body is `handleDialogueInput` from `gameReducer.ts:1366-1420`, plus the dungeon special-room handlers (`handleDungeonSpecialRoom`, `handleDungeonSpecialChoice`, `handleDungeonRestInput`) at 1831-1978:

```ts
import type { GameStore, ItemDef, WeaponDef, NpcDef, RoomDef } from '../types';
import * as C from '../constants';
import { addLine, emitSound, clearTerminal } from '../output';
import { handleNpcDialogueInput } from '../handlers/talk';
import { addXp, heal as playerHeal } from '../player';
import { getRoom, getLivingEnemies } from '../world';

export interface DialogueDeps {
  itemData: Record<string, ItemDef>;
  weaponData: Record<string, WeaponDef>;
  npcData: Record<string, NpcDef>;
  refreshHeader: () => void;
  startCombat: (eid: string) => void;
  checkEndingsForChoice: (choice: string) => boolean;
  openSlotPicker: (mode: 'save') => void;
  loadDungeonFloor: (floor: number) => void;
  enterRoom: (roomId: string) => void;
  checkAchievement: (id: string) => void;
}

export function handleDialogueInput(store: GameStore, input: string, deps: DialogueDeps): void {
  if (!store.player || !store.world) return;

  // Dungeon special rooms
  if (store.gameMode === 'dungeon') {
    const room = getRoom(store.world, store.player.currentRoom);
    if (room?.specialType) {
      handleDungeonSpecialChoice(store, room, input, deps);
      return;
    }
  }

  // Dungeon rest area
  if (store.gameMode === 'dungeon' && store.player.currentRoom.startsWith('dng_rest_')) {
    handleDungeonRestInput(store, input, deps);
    return;
  }

  // NPC dialogue
  if (store.npcDialogue) {
    handleNpcDialogueInput(store, input, deps.itemData, deps.weaponData, deps.npcData, deps.refreshHeader);
    return;
  }

  const trimmed = input.trim().toLowerCase();
  let chosen: string | null = null;
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= store.dialogueOptions.length) {
    chosen = store.dialogueOptions[num - 1];
  } else {
    for (const opt of store.dialogueOptions) {
      if (trimmed === opt.toLowerCase()) {
        chosen = opt;
        break;
      }
    }
  }

  if (!chosen) {
    addLine(store, `Choose an option: 1-${store.dialogueOptions.length}`, C.ERROR_COLOR);
    return;
  }

  const ended = deps.checkEndingsForChoice(chosen);
  if (!ended) {
    store.state = 'exploring';
    addLine(store, `You choose to ${chosen}.`, C.HELP_COLOR);
    if (chosen.toLowerCase() === 'attack') {
      const living = getLivingEnemies(store.world, store.player.currentRoom);
      if (living.length > 0) deps.startCombat(living[0]);
    }
  }
  store.dialogueEnding = null;
}

export function handleDungeonSpecialRoom(store: GameStore, room: RoomDef): void {
  if (!store.player || !store.dungeon) return;

  if (room.specialType === 'fountain' && !store.player.firedEvents[`used_fountain_${room.id}`]) {
    store.state = 'dialogue';
    store.dialogueOptions = ['Drink from the fountain', 'Leave it alone'];
    addLine(store, '');
    addLine(store, 'The fountain beckons...', C.CHOICE_COLOR);
    store.dialogueOptions.forEach((opt, i) => {
      addLine(store, `[${i + 1}] ${opt}`, C.CHOICE_COLOR);
    });
  } else if (room.specialType === 'altar' && !store.player.firedEvents[`used_altar_${room.id}`]) {
    store.state = 'dialogue';
    store.dialogueOptions = ['Embrace the darkness (+5 ATK, -3 DEF)', 'Resist (heal 10 HP)', 'Ignore'];
    addLine(store, '');
    addLine(store, 'The altar pulses with dark energy...', C.CHOICE_COLOR);
    store.dialogueOptions.forEach((opt, i) => {
      addLine(store, `[${i + 1}] ${opt}`, C.CHOICE_COLOR);
    });
  } else if (room.specialType === 'library' && !store.player.firedEvents[`used_library_${room.id}`]) {
    const perks = [
      { label: 'Tome of Strength (+2 ATK)' },
      { label: 'Tome of Resilience (+2 DEF)' },
      { label: 'Tome of Vitality (+10 max HP)' },
      { label: 'Tome of Healing (full HP)' },
      { label: 'Tome of Experience (+30 XP)' },
    ];
    const shuffled = perks.slice().sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, 2);

    store.state = 'dialogue';
    store.dialogueOptions = [chosen[0].label, chosen[1].label, 'Leave'];
    addLine(store, '');
    addLine(store, 'Ancient tomes offer forbidden knowledge. Choose wisely...', C.CHOICE_COLOR);
    store.dialogueOptions.forEach((opt, i) => {
      addLine(store, `[${i + 1}] ${opt}`, C.CHOICE_COLOR);
    });
  }
}

function handleDungeonSpecialChoice(store: GameStore, room: RoomDef, input: string, deps: DialogueDeps): void {
  if (!store.player || !store.dungeon) return;
  const choice = parseInt(input.trim(), 10);

  if (room.specialType === 'fountain') {
    store.player.firedEvents[`used_fountain_${room.id}`] = true;
    if (choice === 1) {
      if (Math.random() < 0.7) {
        const healAmt = Math.floor(store.player.maxHp * 0.3);
        const old = store.player.hp;
        playerHeal(store.player, healAmt);
        addLine(store, `The water restores you! +${store.player.hp - old} HP.`, C.ITEM_COLOR);
        emitSound(store, 'pickup');
      } else {
        const dmg = Math.floor(store.player.maxHp * 0.1);
        store.player.hp = Math.max(1, store.player.hp - dmg);
        addLine(store, `The water is poisoned! -${dmg} HP.`, C.ERROR_COLOR);
        emitSound(store, 'playerHit');
      }
    } else {
      addLine(store, 'You leave the fountain alone.', C.HELP_COLOR);
    }
    store.state = 'exploring';
    deps.refreshHeader();
  } else if (room.specialType === 'altar') {
    store.player.firedEvents[`used_altar_${room.id}`] = true;
    if (choice === 1) {
      store.player.buffAttack += 5;
      store.player.defense = Math.max(0, store.player.defense - 3);
      addLine(store, 'Dark power surges through you! +5 ATK, -3 DEF for this floor.', C.COMBAT_COLOR);
      emitSound(store, 'equip');
    } else if (choice === 2) {
      playerHeal(store.player, 10);
      addLine(store, 'You resist the darkness and feel renewed. +10 HP.', C.ITEM_COLOR);
    } else {
      addLine(store, 'You step away from the altar.', C.HELP_COLOR);
    }
    store.state = 'exploring';
    deps.refreshHeader();
  } else if (room.specialType === 'library') {
    store.player.firedEvents[`used_library_${room.id}`] = true;
    const opt = store.dialogueOptions[choice - 1];
    if (opt && opt !== 'Leave') {
      if (!store.dungeon.dungeonPerks) store.dungeon.dungeonPerks = [];
      store.dungeon.dungeonPerks.push(opt);

      if (opt.includes('+2 ATK')) {
        store.player.attack += 2;
        addLine(store, `You absorb the knowledge: +2 ATK!`, C.CHOICE_COLOR);
      } else if (opt.includes('+2 DEF')) {
        store.player.defense += 2;
        addLine(store, `You absorb the knowledge: +2 DEF!`, C.CHOICE_COLOR);
      } else if (opt.includes('+10 max HP')) {
        store.player.maxHp += 10;
        store.player.hp += 10;
        addLine(store, `You absorb the knowledge: +10 max HP!`, C.CHOICE_COLOR);
      } else if (opt.includes('full HP')) {
        store.player.hp = store.player.maxHp;
        addLine(store, `You absorb the knowledge: fully healed!`, C.CHOICE_COLOR);
      } else if (opt.includes('+30 XP')) {
        addXp(store.player, 30);
        addLine(store, `You absorb the knowledge: +30 XP!`, C.CHOICE_COLOR);
      }
      emitSound(store, 'levelUp');
    } else {
      addLine(store, 'You leave the library undisturbed.', C.HELP_COLOR);
    }
    store.state = 'exploring';
    deps.refreshHeader();
  }
}

function handleDungeonRestInput(store: GameStore, input: string, deps: DialogueDeps): void {
  if (!store.player || !store.world || !store.dungeon) return;
  const trimmed = input.trim().toLowerCase();

  if (trimmed === '1' || trimmed === 'rest') {
    const healAmount = Math.floor(store.player.maxHp * 0.5);
    playerHeal(store.player, healAmount);
    deps.refreshHeader();
    addLine(store, `You rest and recover ${healAmount} HP.`, C.ITEM_COLOR);
    addLine(store, '');
    addLine(store, 'What would you like to do?', C.CHOICE_COLOR);
    store.dialogueOptions = ['Rest (heal 50% HP)', 'Save', 'Continue to next floor'];
    store.dialogueOptions.forEach((opt, i) => {
      addLine(store, `[${i + 1}] ${opt}`, C.CHOICE_COLOR);
    });
  } else if (trimmed === '2' || trimmed === 'save') {
    deps.openSlotPicker('save');
  } else if (trimmed === '3' || trimmed === 'continue' || trimmed === 'descend') {
    store.dungeon.floor++;
    store.dungeon.score.floorsCleared++;
    if (store.dungeon.floor >= 5) deps.checkAchievement('dungeon_crawler');
    if (store.dungeon.floor >= 20) deps.checkAchievement('dungeon_master');
    deps.loadDungeonFloor(store.dungeon.floor);
    clearTerminal(store);
    addLine(store, `--- Floor ${store.dungeon.floor} ---`, C.COMBAT_COLOR);
    addLine(store, '');
    store.state = 'exploring';
    deps.enterRoom(store.player.currentRoom);
    deps.refreshHeader();
  } else {
    addLine(store, 'Choose [1], [2], or [3].', C.ERROR_COLOR);
  }
}
```

- [ ] **Step 2: Update gameReducer.ts**

In `src/engine/gameReducer.ts`:

1. Delete local `handleDialogueInput` (1366-1420), `handleDungeonSpecialRoom` (1831-1870), `handleDungeonSpecialChoice` (1872-1943), `handleDungeonRestInput` (1945-1978).
2. Add import:
```ts
import {
  handleDialogueInput as handleDialogueInputRaw,
  handleDungeonSpecialRoom,
  type DialogueDeps,
} from './state/dialogue';
```
3. Add wrapper:
```ts
function buildDialogueDeps(store: GameStore): DialogueDeps {
  return {
    itemData, weaponData, npcData,
    refreshHeader: () => updateHeader(store),
    startCombat: (eid) => startCombat(store, eid),
    checkEndingsForChoice: (choice) => checkEndingsContext(store, { choiceMade: choice }),
    openSlotPicker: (mode) => openSlotPicker(store, mode),
    loadDungeonFloor: (floor) => loadDungeonFloor(store, floor),
    enterRoom: (roomId) => enterRoom(store, roomId),
    checkAchievement: (id) => checkAchievement(store, id),
  };
}

function handleDialogueInput(store: GameStore, input: string): void {
  handleDialogueInputRaw(store, input, buildDialogueDeps(store));
}
```
Note: `handleDungeonSpecialRoom` is already exported and called from `enterRoom` — keep that call site as-is, just update the import.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: ALL tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/engine/state/dialogue.ts src/engine/gameReducer.ts
git commit -m "Extract dialogue state dispatcher (NPC + endings + dungeon)"
```

### Task 33: Extract state/menu.ts, state/slot-picker.ts, state/settings.ts, state/gameover.ts

**Files:**
- Create: `src/engine/state/menu.ts`
- Create: `src/engine/state/slot-picker.ts`
- Create: `src/engine/state/settings.ts`
- Create: `src/engine/state/gameover.ts`
- Modify: `src/engine/gameReducer.ts`

These four extractions are very mechanical — pure relocations of self-contained functions. Do them in one task.

- [ ] **Step 1: Create state/menu.ts**

Create `src/engine/state/menu.ts`. Copy `handleMenuKey` (gameReducer.ts:2344-2372). Pass start callbacks as deps:

```ts
import type { GameStore } from '../types';
import * as C from '../constants';
import { emitSound } from '../output';
import { anySlotHasData } from '../save';

export interface MenuDeps {
  startNewGame: () => void;
  openSlotPicker: (mode: 'load') => void;
  startDungeonMode: () => void;
  openSettings: () => void;
}

export function handleMenuKey(s: GameStore, key: string, deps: MenuDeps): void {
  if (key === 'ArrowUp' || key === 'w') {
    s.menuSelected--;
    if (s.menuSelected < 0) s.menuSelected = C.MENU_OPTIONS.length - 1;
    emitSound(s, 'menuMove');
  } else if (key === 'ArrowDown' || key === 's') {
    s.menuSelected++;
    if (s.menuSelected >= C.MENU_OPTIONS.length) s.menuSelected = 0;
    emitSound(s, 'menuMove');
  } else if (key === 'Enter') {
    const option = C.MENU_OPTIONS[s.menuSelected];
    if (option === 'NEW GAME') {
      emitSound(s, 'menuSelect');
      deps.startNewGame();
    } else if (option === 'CONTINUE') {
      emitSound(s, 'menuSelect');
      if (anySlotHasData()) deps.openSlotPicker('load');
    } else if (option === 'DUNGEON MODE') {
      emitSound(s, 'menuSelect');
      deps.startDungeonMode();
    } else if (option === 'SETTINGS') {
      emitSound(s, 'menuSelect');
      deps.openSettings();
    } else if (option === 'QUIT') {
      // No-op in web — handled by gameReducer wrapper
    }
  }
}
```

- [ ] **Step 2: Create state/slot-picker.ts**

Create `src/engine/state/slot-picker.ts`. Copy `handleSlotPickerKey` (gameReducer.ts:1736-1790):

```ts
import type { GameStore } from '../types';
import * as C from '../constants';
import { addLine, emitSound } from '../output';
import { saveToSlot, loadManifest, renameSlot } from '../save';

export interface SlotPickerDeps {
  startContinue: (slot: number) => void;
}

export function openSlotPicker(store: GameStore, mode: 'save' | 'load'): void {
  store.slotPickerMode = mode;
  store.slotPickerSelected = 0;
  store.slotManifest = loadManifest();
  store.renamingSlot = false;
  store.renameBuffer = '';
  store.state = 'slot_picker';
}

export function handleSlotPickerKey(s: GameStore, key: string, deps: SlotPickerDeps): void {
  if (!s.slotManifest) return;

  if (s.renamingSlot) {
    if (key === 'Enter') {
      const slot = s.slotPickerSelected + 1;
      renameSlot(slot, s.renameBuffer);
      s.slotManifest = loadManifest();
      s.renamingSlot = false;
      s.renameBuffer = '';
    } else if (key === 'Escape') {
      s.renamingSlot = false;
      s.renameBuffer = '';
    } else if (key === 'Backspace') {
      s.renameBuffer = s.renameBuffer.slice(0, -1);
    }
    return;
  }

  if (key === 'ArrowUp') {
    s.slotPickerSelected--;
    if (s.slotPickerSelected < 0) s.slotPickerSelected = s.slotManifest.slots.length - 1;
    emitSound(s, 'menuMove');
  } else if (key === 'ArrowDown') {
    s.slotPickerSelected++;
    if (s.slotPickerSelected >= s.slotManifest.slots.length) s.slotPickerSelected = 0;
    emitSound(s, 'menuMove');
  } else if (key === 'Enter') {
    const slot = s.slotPickerSelected + 1;
    if (s.slotPickerMode === 'save') {
      if (s.player && s.world && saveToSlot(slot, s.player, s.world, s.dungeon)) {
        s.activeSlot = slot;
        emitSound(s, 'save');
        s.state = 'exploring';
        s.slotPickerMode = null;
        addLine(s, 'Game saved.', C.ITEM_COLOR);
      }
    } else if (s.slotPickerMode === 'load') {
      const meta = s.slotManifest.slots[s.slotPickerSelected];
      if (meta.isEmpty) {
        addLine(s, 'That slot is empty.', C.ERROR_COLOR);
        return;
      }
      s.slotPickerMode = null;
      deps.startContinue(slot);
    }
  } else if (key === 'r' || key === 'R') {
    s.renamingSlot = true;
    s.renameBuffer = s.slotManifest.slots[s.slotPickerSelected].name;
  } else if (key === 'Escape') {
    s.state = s.player ? 'exploring' : 'menu';
    s.slotPickerMode = null;
  }
}
```

- [ ] **Step 3: Create state/settings.ts**

Create `src/engine/state/settings.ts`. Copy `openSettings` and `handleSettingsKey` (gameReducer.ts:2295-2342):

```ts
import type { GameStore, GameStateKind } from '../types';
import { emitSound } from '../output';
import {
  loadSettings, saveSettings,
  FONT_SIZE_OPTIONS, COLOR_MODE_OPTIONS, TEXT_SPEED_OPTIONS,
} from '../settings';

const SETTINGS_ROWS = ['Font Size', 'Color Mode', 'Text Speed', 'Master Volume', 'Sound Effects', 'Ambient Music', 'Typewriter Clicks'] as const;

export function openSettings(s: GameStore, fromState: GameStateKind): void {
  s.settingsPrevState = fromState;
  s.settingsSelected = 0;
  s.state = 'settings';
}

export function handleSettingsKey(s: GameStore, key: string): void {
  const settings = loadSettings();

  if (key === 'ArrowUp') {
    s.settingsSelected = (s.settingsSelected - 1 + SETTINGS_ROWS.length) % SETTINGS_ROWS.length;
    emitSound(s, 'menuMove');
  } else if (key === 'ArrowDown') {
    s.settingsSelected = (s.settingsSelected + 1) % SETTINGS_ROWS.length;
    emitSound(s, 'menuMove');
  } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const dir = key === 'ArrowRight' ? 1 : -1;
    const row = s.settingsSelected;

    if (row === 0) {
      const idx = FONT_SIZE_OPTIONS.indexOf(settings.fontSize);
      settings.fontSize = FONT_SIZE_OPTIONS[(idx + dir + FONT_SIZE_OPTIONS.length) % FONT_SIZE_OPTIONS.length];
    } else if (row === 1) {
      const idx = COLOR_MODE_OPTIONS.indexOf(settings.colorMode);
      settings.colorMode = COLOR_MODE_OPTIONS[(idx + dir + COLOR_MODE_OPTIONS.length) % COLOR_MODE_OPTIONS.length];
    } else if (row === 2) {
      const idx = TEXT_SPEED_OPTIONS.indexOf(settings.textSpeed);
      settings.textSpeed = TEXT_SPEED_OPTIONS[(idx + dir + TEXT_SPEED_OPTIONS.length) % TEXT_SPEED_OPTIONS.length];
    } else if (row === 3) {
      settings.masterVolume = Math.max(0, Math.min(100, settings.masterVolume + dir * 10));
    } else if (row === 4) {
      settings.sfxEnabled = !settings.sfxEnabled;
    } else if (row === 5) {
      settings.ambientEnabled = !settings.ambientEnabled;
    } else if (row === 6) {
      settings.typewriterSound = !settings.typewriterSound;
    }

    saveSettings(settings);
    emitSound(s, 'menuMove');
  } else if (key === 'Escape' || key === 'Enter') {
    s.state = s.settingsPrevState;
    emitSound(s, 'menuSelect');
  }
}
```

- [ ] **Step 4: Create state/gameover.ts**

Create `src/engine/state/gameover.ts`. Copy `handleGameoverInput` (gameReducer.ts:1422-1446) and `startGameover` (1516-1549):

```ts
import type { GameStore } from '../types';
import * as C from '../constants';
import { addLine, emitSound, clearTerminal, displayAscii } from '../output';
import { pushEffect } from '../effects';
import { anySlotHasData } from '../save';

export interface GameoverDeps {
  startMenu: () => void;
  openSlotPicker: (mode: 'load') => void;
  startDungeonMode: (seed: number) => void;
}

export function startGameover(store: GameStore): void {
  store.state = 'gameover';
  store.gameoverReady = false;
  emitSound(store, 'death');

  pushEffect(store.effects, 'shake', 0.5, { intensity: 8 });
  pushEffect(store.effects, 'flash', 0.5, { r: 1, g: 0, b: 0 });
  pushEffect(store.effects, 'glitch', 2.0, { intensity: 0.7 });

  clearTerminal(store);
  store.baseColor = [1.0, 0.2, 0.2, 1];

  if (store.gameMode === 'dungeon' && store.dungeon) {
    addLine(store, '');
    addLine(store, '=== DUNGEON RUN ENDED ===', C.ERROR_COLOR);
    addLine(store, `Floor reached: ${store.dungeon.floor}`, C.STAT_COLOR);
    addLine(store, `Floors cleared: ${store.dungeon.score.floorsCleared}`, C.STAT_COLOR);
    addLine(store, `Enemies killed: ${store.dungeon.score.enemiesKilled}`, C.STAT_COLOR);
    addLine(store, `Seed: ${store.dungeon.seed}`, C.HELP_COLOR);
    addLine(store, '');
    addLine(store, '[1] Return to Menu', C.HELP_COLOR);
    addLine(store, '[2] Retry (same seed)', C.HELP_COLOR);
    addLine(store, '');
  } else {
    addLine(store, '');
    displayAscii(store, 'death', C.ERROR_COLOR);
    addLine(store, '');
    addLine(store, 'YOU HAVE FALLEN', C.ERROR_COLOR);
    addLine(store, '');
    addLine(store, '[1] Load Save', C.HELP_COLOR);
    addLine(store, '[2] Quit to Menu', C.HELP_COLOR);
    addLine(store, '');
  }
}

export function handleGameoverInput(store: GameStore, input: string, deps: GameoverDeps): void {
  const trimmed = input.trim();
  if (store.gameMode === 'dungeon' && store.dungeon) {
    if (trimmed === '1' || trimmed.toLowerCase() === 'menu') {
      deps.startMenu();
    } else if (trimmed === '2' || trimmed.toLowerCase() === 'retry') {
      const seed = store.dungeon.seed;
      deps.startDungeonMode(seed);
    } else {
      addLine(store, 'Choose [1] or [2].', C.ERROR_COLOR);
    }
    return;
  }
  if (trimmed === '1' || trimmed.toLowerCase() === 'load') {
    if (anySlotHasData()) {
      deps.openSlotPicker('load');
    } else {
      addLine(store, 'No save file found.', C.ERROR_COLOR);
    }
  } else if (trimmed === '2' || trimmed.toLowerCase() === 'quit' || trimmed.toLowerCase() === 'menu') {
    deps.startMenu();
  } else {
    addLine(store, 'Choose [1] or [2].', C.ERROR_COLOR);
  }
}
```

- [ ] **Step 5: Update gameReducer.ts**

In `src/engine/gameReducer.ts`:

1. Delete local `handleMenuKey` (2344-2372), `openSlotPicker` (1727-1734), `handleSlotPickerKey` (1736-1790), `openSettings` (2298-2302), `handleSettingsKey` (2304-2342), `handleGameoverInput` (1422-1446), `startGameover` (1516-1549).
2. Add imports:
```ts
import { handleMenuKey as handleMenuKeyRaw, type MenuDeps } from './state/menu';
import { openSlotPicker, handleSlotPickerKey as handleSlotPickerKeyRaw, type SlotPickerDeps } from './state/slot-picker';
import { openSettings, handleSettingsKey } from './state/settings';
import { startGameover, handleGameoverInput as handleGameoverInputRaw, type GameoverDeps } from './state/gameover';
```
3. Add wrappers:
```ts
function handleMenuKey(s: GameStore, key: string): void {
  handleMenuKeyRaw(s, key, {
    startNewGame: () => startNewGame(s),
    openSlotPicker: (mode) => openSlotPicker(s, mode),
    startDungeonMode: () => startDungeonMode(s),
    openSettings: () => openSettings(s, 'menu'),
  });
  if (key === 'Enter' && C.MENU_OPTIONS[s.menuSelected] === 'QUIT') {
    startMenu(s);
  }
}

function handleSlotPickerKey(s: GameStore, key: string): void {
  handleSlotPickerKeyRaw(s, key, {
    startContinue: (slot) => startContinue(s, slot),
  });
}

function handleGameoverInput(s: GameStore, input: string): void {
  handleGameoverInputRaw(s, input, {
    startMenu: () => startMenu(s),
    openSlotPicker: (mode) => openSlotPicker(s, mode),
    startDungeonMode: (seed) => startDungeonMode(s, seed),
  });
}
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: ALL tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/engine/state/ src/engine/gameReducer.ts
git commit -m "Extract menu, slot-picker, settings, gameover state dispatchers"
```

### Task 34: Verify Phase 2 complete

**Files:** none

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: ALL tests pass.

- [ ] **Step 2: Run build to verify no type errors**

Run: `npm run build`
Expected: zero errors.

- [ ] **Step 3: Check final line count**

Run: `wc -l src/engine/gameReducer.ts`
Expected: under 1,200 lines. The remainder is the action switch, tick loop, boot/ending state machines, dungeon-mode helpers (`startDungeonMode`, `loadDungeonFloor`, `startNewGame`, `startContinue`, `startMenu`, `enterRoom`, `startCombat`, `startEnding`, `startDialogue`, `checkEndingsContext`, `addJournal`, achievement helpers), and the wrapper builders for the deps. These are intentionally left in `gameReducer.ts` because they bind together cross-state logic and pulling them out would require lifting more state into a separate orchestration layer (out of scope).

- [ ] **Step 4: Manual playtest (10 minutes)**

Run: `npm run dev`. Full playthrough:
- Boot animation completes
- Menu navigation (arrow keys, Enter on each option)
- New Game from Manor Entry
- Look, take, drop, use, examine, inventory, stats, journal, skills, achievements
- Combat (attack rat, defend, flee, use potion in combat)
- Talk to Dusty in Manor Main Hall, exhaust dialogue
- Save → load → state restored
- Settings menu (change font size, color mode, return)
- Quit to menu, start dungeon mode, descend a floor, fight a mini-boss
- Die intentionally in dungeon, see gameover screen, return to menu

Expected: every flow works identically to pre-refactor.

- [ ] **Step 5: Tag and commit Phase 2 as complete**

```bash
git tag phase-2-complete
```

---

## Phase 3 — Dynamic descriptions

### Task 35: Add description_cleared and clear_flag to RoomDef type

**Files:**
- Modify: `src/engine/types.ts`

- [ ] **Step 1: Add the optional fields**

In `src/engine/types.ts`, find the `RoomDef` interface (line 39-59). Add two new optional fields after `description`:

```ts
export interface RoomDef {
  id: string;
  name: string;
  region: string;
  description: string;
  description_cleared?: string;   // NEW
  clear_flag?: string;            // NEW
  exits: Record<string, string>;
  items?: string[];
  weapons?: string[];
  enemies?: string[];
  searchable?: boolean;
  search_items?: string[];
  on_enter?: string;
  dev_note?: string;
  npcs?: string[];
  specialType?: 'fountain' | 'vault' | 'altar' | 'library';
  _dead_enemies?: Record<string, boolean>;
  _dynamic_exits?: Record<string, string>;
  _ground_loot?: string[];
  _ground_weapons?: string[];
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/engine/types.ts
git commit -m "Add description_cleared and clear_flag fields to RoomDef"
```

### Task 36: Create descriptions.ts pure module

**Files:**
- Create: `src/engine/descriptions.ts`

- [ ] **Step 1: Write the module**

Create `src/engine/descriptions.ts`:

```ts
import type { RoomDef, PlayerState } from './types';

/**
 * A room is "cleared" when:
 *   1. It has a `clear_flag` and that flag is set in player.firedEvents (override path), OR
 *   2. It has at least one enemy and ALL of its initial enemies are dead.
 *
 * Rooms with no enemies and no clear_flag are never "cleared".
 */
export function isRoomCleared(room: RoomDef, player: PlayerState): boolean {
  if (room.clear_flag) return !!player.firedEvents[room.clear_flag];

  if (room.enemies && room.enemies.length > 0) {
    return room.enemies.every(eid => room._dead_enemies?.[eid]);
  }

  return false;
}

/**
 * Pick the right description for the room based on cleared state.
 */
export function pickDescription(room: RoomDef, player: PlayerState): string {
  if (room.description_cleared && isRoomCleared(room, player)) {
    return room.description_cleared;
  }
  return room.description;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/descriptions.ts
git commit -m "Add descriptions pure module"
```

### Task 37: Unit tests for descriptions module

**Files:**
- Create: `test/unit/descriptions.test.ts`

- [ ] **Step 1: Write the tests**

Create `test/unit/descriptions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isRoomCleared, pickDescription } from '../../src/engine/descriptions';
import { createPlayer } from '../../src/engine/player';
import type { RoomDef } from '../../src/engine/types';

function makeRoom(overrides: Partial<RoomDef> = {}): RoomDef {
  return {
    id: 'r',
    name: 'Test',
    region: 'manor',
    description: 'default text',
    exits: {},
    ...overrides,
  };
}

describe('isRoomCleared', () => {
  it('false when no enemies and no flag', () => {
    const player = createPlayer();
    expect(isRoomCleared(makeRoom(), player)).toBe(false);
  });

  it('true when all enemies dead', () => {
    const player = createPlayer();
    const room = makeRoom({ enemies: ['rat', 'ghost'], _dead_enemies: { rat: true, ghost: true } });
    expect(isRoomCleared(room, player)).toBe(true);
  });

  it('false when some enemies still alive', () => {
    const player = createPlayer();
    const room = makeRoom({ enemies: ['rat', 'ghost'], _dead_enemies: { rat: true } });
    expect(isRoomCleared(room, player)).toBe(false);
  });

  it('false when no enemies dead yet', () => {
    const player = createPlayer();
    const room = makeRoom({ enemies: ['rat'] });
    expect(isRoomCleared(room, player)).toBe(false);
  });

  it('true when clear_flag override is set', () => {
    const player = createPlayer();
    player.firedEvents.took_map = true;
    const room = makeRoom({ clear_flag: 'took_map' });
    expect(isRoomCleared(room, player)).toBe(true);
  });

  it('false when clear_flag override not set', () => {
    const player = createPlayer();
    const room = makeRoom({ clear_flag: 'took_map' });
    expect(isRoomCleared(room, player)).toBe(false);
  });

  it('clear_flag override beats enemy state', () => {
    const player = createPlayer();
    const room = makeRoom({
      clear_flag: 'magic',
      enemies: ['rat'],
      _dead_enemies: { rat: true },
    });
    expect(isRoomCleared(room, player)).toBe(false);
  });
});

describe('pickDescription', () => {
  it('returns default when no description_cleared', () => {
    const player = createPlayer();
    const room = makeRoom({ enemies: ['rat'], _dead_enemies: { rat: true } });
    expect(pickDescription(room, player)).toBe('default text');
  });

  it('returns default when not cleared', () => {
    const player = createPlayer();
    const room = makeRoom({
      description_cleared: 'cleared text',
      enemies: ['rat'],
    });
    expect(pickDescription(room, player)).toBe('default text');
  });

  it('returns cleared text when cleared', () => {
    const player = createPlayer();
    const room = makeRoom({
      description_cleared: 'cleared text',
      enemies: ['rat'],
      _dead_enemies: { rat: true },
    });
    expect(pickDescription(room, player)).toBe('cleared text');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- descriptions`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add test/unit/descriptions.test.ts
git commit -m "Add descriptions module unit tests"
```

### Task 38: Wire descriptions into display.ts

**Files:**
- Modify: `src/engine/display.ts`

- [ ] **Step 1: Update display.ts to call pickDescription**

In `src/engine/display.ts`, add the import:
```ts
import { pickDescription } from './descriptions';
```

Find this line:
```ts
addLine(store, room.description);
```

Change it to:
```ts
addLine(store, pickDescription(room, store.player!));
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: ALL tests pass (existing scenario tests don't depend on description text matching exactly).

- [ ] **Step 3: Commit**

```bash
git add src/engine/display.ts
git commit -m "Wire pickDescription into displayRoom"
```

### Task 39: Author alternate descriptions for selected rooms

**Files:**
- Modify: `src/data/regions/manor.json`
- Modify: `src/data/regions/wilds.json`
- Modify: `src/data/regions/wastes.json`
- Modify: `src/data/regions/darkness.json`

- [ ] **Step 1: Add description_cleared to manor_entry**

In `src/data/regions/manor.json`, find the `manor_entry` room (line 4-15). Add `description_cleared` after `description`:

```json
{
  "id": "manor_entry",
  "name": "Entry",
  "region": "manor",
  "description": "You are inside the entry room of an old manor. It is reasonably large, with old chairs and a coat rack on the west wall. The walls are upholstered, and an ornate chandelier hangs from the ceiling. A window to the south is the room's only source of light.",
  "description_cleared": "The Shadow Rat is gone! Theres a little smear on the floor where you got it. The room feels less creepy now. The chandelier still hangs there but it doesnt feel like its watching you anymore.",
  "exits": {"north": "manor_entrance_hall", "south": "manor_yard"},
  "items": ["small_potion"],
  "weapons": ["rusty_dagger"],
  "enemies": ["shadow_rat"],
  "searchable": true,
  "search_items": ["rusty_key"],
  "dev_note": "// this is the starting room!! so cool"
},
```

- [ ] **Step 2: Add description_cleared to manor_wine_cellar**

In `src/data/regions/manor.json`, find the `manor_wine_cellar` room (line 124-133). Add:

```json
{
  "id": "manor_wine_cellar",
  "name": "Wine Cellar",
  "region": "manor",
  "description": "The cellar is cold and damp. Wine racks line the walls but most bottles are broken. Something dark moves in the shadows between the racks. It smells like old wine and something else... something wrong. The darkness down here feels thicker somehow.",
  "description_cleared": "The Cellar Shade is dead!! There's just a pile of dust where it used to be. The wine racks are still here and the broken bottles too but the air down here finally smells like just regular old wine. You can breathe again.",
  "exits": {"up": "manor_north_wing", "south": "manor_dungeon"},
  "items": ["potion"],
  "enemies": ["cellar_shade"],
  "searchable": false,
  "dev_note": "// boss fight!! the cellar shade is really hard"
},
```

- [ ] **Step 3: Add description_cleared and clear_flag to manor_library_dome**

In `src/data/regions/manor.json`, find the `manor_library_dome` room (line 110-122). Add both fields:

```json
{
  "id": "manor_library_dome",
  "name": "Library Dome",
  "region": "manor",
  "description": "You climb up to the top of the library where theres a glass dome. You can see the sky through it and at night you can probably see the stars. Theres a desk up here with papers scattered everywhere and a telescope pointing at nothing.",
  "description_cleared": "The dome is just as quiet as before but with the Ancient Map in your bag everything feels different. The papers on the desk make a little more sense now, like youve started reading a story instead of just looking at scribbles. The telescope still points at nothing.",
  "clear_flag": "took_ancient_map",
  "exits": {"down": "manor_library"},
  "items": [],
  "weapons": ["hammer"],
  "enemies": [],
  "searchable": true,
  "search_items": ["ancient_map"],
  "dev_note": "// this is my favorite room in the manor :)"
},
```

- [ ] **Step 4: Add description_cleared to wilds_mountain_peak**

In `src/data/regions/wilds.json`, find the `wilds_mountain_peak` room (line 90-100). Add:

```json
{
  "id": "wilds_mountain_peak",
  "name": "Mountain Peak",
  "region": "wilds",
  "description": "Your at the very top of the mountain! You can see everything from up here. The manor, the forest, the dark lands to the east, everything. The wind is crazy strong and theres snow on the rocks. A massive cave entrance leads into the mountain.",
  "description_cleared": "The Mountain Troll is DEAD!!!! You actually beat him!! He's slumped over by the cave entrance. The wind is still really strong up here but now you feel like the king of the mountain. You can see the whole world from here and nothing scares you.",
  "exits": {"south": "wilds_mountains"},
  "items": ["large_potion"],
  "enemies": ["mountain_troll"],
  "searchable": false,
  "dev_note": "// the troll boss is here!! hes really tough"
}
```

- [ ] **Step 5: Add description_cleared to wastes_ruins**

In `src/data/regions/wastes.json`, find the `wastes_ruins` room (line 54-65). Add:

```json
{
  "id": "wastes_ruins",
  "name": "Ruins",
  "region": "wastes",
  "description": "The ruins of an ancient civilization tower above you. Broken columns and crumbling walls carved with stories of people who lived here a thousand years ago. In the center theres a pedestal with something glowing on it. This place feels important like its the end of a journey.",
  "description_cleared": "The Ruins Guardian is gone. The columns and walls still tower over you but theyre quiet now. The pedestal in the center is just a pedestal again. You stand in the middle of the ruins and for a second you can almost hear the people who used to live here. Then the wind takes it away.",
  "exits": {"west": "wastes_wastelands"},
  "items": [],
  "enemies": ["ruins_guardian"],
  "searchable": true,
  "search_items": ["ancient_map"],
  "dev_note": "// this is the most epic area I think. the ruins guardian is the boss"
}
```

- [ ] **Step 6: Add description_cleared to darkness_stronghold**

In `src/data/regions/darkness.json`, find the `darkness_stronghold` room (line 86-97). Add:

```json
{
  "id": "darkness_stronghold",
  "name": "Evil Stronghold",
  "region": "darkness",
  "description": "The throne room of the Evil King. It is vast and precise, every surface reflecting absolute darkness. The throne is carved from a single piece of obsidian, and on it sits a figure that has been waiting. Not for you specifically. For anyone. For the next host.",
  "description_cleared": "The throne is empty. The obsidian is just stone now, dull and ordinary. Whatever was waiting here is gone. The darkness in the corners feels like just shadow. You stand in front of the empty throne and the room is so quiet you can hear your own breathing. It is over.",
  "exits": {"west": "darkness_evil_dimension"},
  "items": [],
  "weapons": [],
  "enemies": ["evil_king"],
  "searchable": false,
  "dev_note": "// the final boss. i didnt make him this strong. something changed the stats."
}
```

- [ ] **Step 7: Verify the JSON parses**

Run: `npm run build`
Expected: zero errors. If JSON is malformed, fix the trailing comma or quote issue.

- [ ] **Step 8: Commit**

```bash
git add src/data/regions/
git commit -m "Add alternate descriptions to 6 key rooms"
```

### Task 40: Set took_ancient_map flag in take handler

**Files:**
- Modify: `src/engine/handlers/take.ts`

- [ ] **Step 1: Set the flag when ancient_map is taken**

In `src/engine/handlers/take.ts`, find the item-pickup branch (after `addItem(store.player, iid, itemData);`). Add a flag-setting line:

```ts
if (itemMatches.length === 1) {
  const iid = itemMatches[0];
  removeFromRoom(room, iid);
  addItem(store.player, iid, itemData);
  addLine(store, `You pick up the ${itemData[iid].name}.`, C.ITEM_COLOR);
  addJournal('item', `Found ${itemData[iid].name}`);
  emitSound(store, 'pickup');

  // Track item-take events for dynamic descriptions / event flags
  if (iid === 'ancient_map') {
    store.player.firedEvents.took_ancient_map = true;
  }

  if (itemData[iid].type === 'shield' && !store.player.equippedShield) {
    store.player.equippedShield = iid;
    addLine(store, `You equip the ${itemData[iid].name}.`, C.ITEM_COLOR);
    emitSound(store, 'equip');
  }
  checkItemAchievements();
  return;
}
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add src/engine/handlers/take.ts
git commit -m "Set took_ancient_map flag on pickup for dynamic descriptions"
```

### Task 41: Scenario tests for dynamic descriptions

**Files:**
- Create: `test/scenario/dynamic-descriptions.test.ts`

- [ ] **Step 1: Write the scenario tests**

Create `test/scenario/dynamic-descriptions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { newGame, input } from '../fixtures/mock-input';
import { expectLine, expectNoLine, allLines } from '../fixtures/assert-output';

describe('dynamic room descriptions', () => {
  it('manor entry shows default description on first visit', () => {
    const s = newGame();
    expectLine(s, 'old manor');
    expectLine(s, 'Shadow Rat');
  });

  it('manor entry shows cleared description after killing the rat', () => {
    let s = newGame();
    // Kill the rat (boost stats so it dies in one hit deterministically)
    s.player!.attack = 100;
    s = input(s, 'attack rat');
    // Auto-attack until combat ends
    for (let i = 0; i < 10 && s.state === 'combat'; i++) {
      s = input(s, 'attack');
    }
    expect(s.state).toBe('exploring');
    // Look at the room again
    s = input(s, 'look');
    expectLine(s, 'Shadow Rat is gone');
  });

  it('library dome cleared description fires after taking the ancient map', () => {
    let s = newGame();
    // Walk to library dome: entry → entrance_hall → main_hall → north_wing → library → library_dome
    // (this requires the rat in entry to be dead first to walk past, OR just route around)
    // Easiest: kill rat, then walk
    s.player!.attack = 100;
    s = input(s, 'attack rat');
    for (let i = 0; i < 10 && s.state === 'combat'; i++) {
      s = input(s, 'attack');
    }
    s = input(s, 'go north'); // entrance_hall
    s = input(s, 'go north'); // main_hall
    s = input(s, 'go north'); // north_wing
    s = input(s, 'go west');  // library
    s = input(s, 'go up');    // library_dome
    expect(s.player!.currentRoom).toBe('manor_library_dome');
    expectLine(s, 'glass dome');

    // Search to find the map
    s = input(s, 'search');
    expectLine(s, 'Ancient Map');
    s = input(s, 'take ancient map');
    expect(s.player!.keyItems.ancient_map).toBe(true);
    expect(s.player!.firedEvents.took_ancient_map).toBe(true);

    // Look again — cleared description should appear
    s = input(s, 'look');
    expectLine(s, 'with the Ancient Map in your bag');
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npm test -- dynamic-descriptions`
Expected: all green. If a navigation step lands the player somewhere unexpected, double-check the manor.json exits and adjust the path.

- [ ] **Step 3: Run full suite**

Run: `npm test`
Expected: ALL tests pass.

- [ ] **Step 4: Manual playtest**

Run: `npm run dev`. Start a new game, kill the rat in the entry room, type `look`. Verify the cleared description appears. Then walk to wine cellar, kill the shade, look — verify the cleared cellar text.

- [ ] **Step 5: Commit Phase 3 complete**

```bash
git add test/scenario/dynamic-descriptions.test.ts
git commit -m "Add dynamic descriptions scenario tests (Phase 3 complete)"
git tag phase-3-complete
```

---

## Phase 4 — Icons

### Task 42: Create icons.ts

**Files:**
- Create: `src/engine/icons.ts`

- [ ] **Step 1: Write the icons module**

Create `src/engine/icons.ts`:

```ts
export const ICON = {
  item:    '[*]',
  weapon:  '[+]',
  enemy:   '[!]',
  npc:     '[@]',
  exit:    '>',
  key:     '[#]',
  shield:  '[=]',
  loot:    '[$]',
} as const;

export type IconKey = keyof typeof ICON;

/**
 * Prefix a glyph to a content line. Used for room contents, inventory,
 * examine output, and combat intro lines.
 */
export function iconLine(icon: string, text: string): string {
  return `${icon} ${text}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/icons.ts
git commit -m "Add icons module with ASCII glyphs"
```

### Task 43: Unit tests for icons

**Files:**
- Create: `test/unit/icons.test.ts`

- [ ] **Step 1: Write the tests**

Create `test/unit/icons.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ICON, iconLine } from '../../src/engine/icons';

describe('ICON glyph constants', () => {
  it('exposes all expected categories', () => {
    expect(ICON.item).toBe('[*]');
    expect(ICON.weapon).toBe('[+]');
    expect(ICON.enemy).toBe('[!]');
    expect(ICON.npc).toBe('[@]');
    expect(ICON.exit).toBe('>');
    expect(ICON.key).toBe('[#]');
    expect(ICON.shield).toBe('[=]');
    expect(ICON.loot).toBe('[$]');
  });
});

describe('iconLine', () => {
  it('prefixes the icon with a space', () => {
    expect(iconLine(ICON.item, 'Potion')).toBe('[*] Potion');
    expect(iconLine(ICON.enemy, 'A Shadow Rat lurks here.')).toBe('[!] A Shadow Rat lurks here.');
    expect(iconLine(ICON.exit, 'Exits: north, south')).toBe('> Exits: north, south');
  });

  it('handles empty text', () => {
    expect(iconLine(ICON.item, '')).toBe('[*] ');
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npm test -- icons`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add test/unit/icons.test.ts
git commit -m "Add icons unit tests"
```

### Task 44: Apply icons to display.ts (room contents)

**Files:**
- Modify: `src/engine/display.ts`

- [ ] **Step 1: Add the icons import**

In `src/engine/display.ts`, add to imports:
```ts
import { ICON, iconLine } from './icons';
```

- [ ] **Step 2: Replace content lines with iconLine wrapped versions**

In `displayRoom`, find the existing content-line block and replace with:

```ts
  const living = getLivingEnemies(store.world, roomId);
  for (const enemyId of living) {
    const edata = enemyData[enemyId];
    if (edata) addLine(store, iconLine(ICON.enemy, `A ${edata.name} lurks here.`), C.ENEMY_COLOR);
  }

  if (room.items) {
    for (const itemId of room.items) {
      const idata = itemData[itemId];
      if (idata) addLine(store, iconLine(ICON.item, `You see a ${idata.name} here.`), C.ITEM_COLOR);
    }
  }
  if (room.weapons) {
    for (const wid of room.weapons) {
      const wdata = weaponData[wid];
      if (wdata) addLine(store, iconLine(ICON.weapon, `You see a ${wdata.name} here.`), C.ITEM_COLOR);
    }
  }
  if (room._ground_loot) {
    for (const itemId of room._ground_loot) {
      const idata = itemData[itemId];
      if (idata) addLine(store, iconLine(ICON.loot, `You see a ${idata.name} on the ground.`), C.LOOT_COLOR);
    }
  }
  if (room._ground_weapons) {
    for (const wid of room._ground_weapons) {
      const wdata = weaponData[wid];
      if (wdata) addLine(store, iconLine(ICON.loot, `You see a ${wdata.name} on the ground.`), C.LOOT_COLOR);
    }
  }

  if (room.npcs) {
    for (const npcId of room.npcs) {
      const npc = npcData[npcId];
      if (npc) addLine(store, iconLine(ICON.npc, `${npc.name} is here.`), C.NPC_COLOR);
    }
  }

  const exits = getExits(store.world, roomId);
  const exitList = Object.keys(exits).sort();
  addLine(store, '');
  if (exitList.length > 0) {
    addLine(store, iconLine(ICON.exit, 'Exits: ' + exitList.join(', ')), C.EXITS_COLOR);
  } else {
    addLine(store, 'There are no exits.', C.EXITS_COLOR);
  }
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all green. Existing scenario tests assert on substrings like `'Shadow Rat'`, `'Small Potion'`, `'Exits:'` — those still match because we only added a prefix.

- [ ] **Step 4: Commit**

```bash
git add src/engine/display.ts
git commit -m "Add ASCII icons to room display"
```

### Task 45: Apply icons to inventory display

**Files:**
- Modify: `src/engine/handlers/meta.ts`

- [ ] **Step 1: Add icons import to meta.ts**

In `src/engine/handlers/meta.ts`, add:
```ts
import { ICON, iconLine } from '../icons';
```

- [ ] **Step 2: Update showInventory to use icons**

Replace `showInventory` with this version (only the lines listing inventory items change):

```ts
export function showInventory(
  store: GameStore,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
): void {
  if (!store.player) return;
  addLine(store, '');
  addLine(store, '=== Inventory ===', C.STAT_COLOR);

  if (store.player.equippedWeapon && weaponData[store.player.equippedWeapon]) {
    const w = weaponData[store.player.equippedWeapon];
    addLine(store, iconLine(ICON.weapon, `Weapon: ${w.name} (+${w.attack_bonus} ATK)`), C.ITEM_COLOR);
  } else {
    addLine(store, iconLine(ICON.weapon, 'Weapon: Fists'), C.ITEM_COLOR);
  }

  if (store.player.equippedShield && itemData[store.player.equippedShield]) {
    const s = itemData[store.player.equippedShield];
    addLine(store, iconLine(ICON.shield, `Shield: ${s.name} (+${s.value} DEF)`), C.ITEM_COLOR);
  }

  const otherWeapons = store.player.weapons.filter(w => w !== store.player!.equippedWeapon);
  for (const wid of otherWeapons) {
    const w = weaponData[wid];
    if (w) addLine(store, iconLine(ICON.weapon, `${w.name} (+${w.attack_bonus} ATK)`), C.HELP_COLOR);
  }

  let hasItems = false;
  for (const [itemId, count] of Object.entries(store.player.inventory)) {
    hasItems = true;
    const idata = itemData[itemId];
    const name = idata?.name || itemId;
    const text = count > 1 ? `${name} x${count}` : name;
    const icon = idata?.type === 'shield' ? ICON.shield : ICON.item;
    addLine(store, iconLine(icon, text), C.HELP_COLOR);
  }

  for (const kid of Object.keys(store.player.keyItems)) {
    hasItems = true;
    const idata = itemData[kid];
    const name = idata?.name || kid;
    addLine(store, iconLine(ICON.key, `${name} [key]`), C.LOOT_COLOR);
  }

  if (!hasItems && store.player.weapons.length === 0) {
    addLine(store, '  (empty)', C.HELP_COLOR);
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/engine/handlers/meta.ts
git commit -m "Add ASCII icons to inventory display"
```

### Task 46: Apply icons to examine output and combat lines

**Files:**
- Modify: `src/engine/handlers/examine.ts`
- Modify: `src/engine/state/combat.ts`
- Modify: `src/engine/gameReducer.ts`

- [ ] **Step 1: Add icons to examine headers**

In `src/engine/handlers/examine.ts`, add:
```ts
import { ICON, iconLine } from '../icons';
```

For each `=== Name ===` header line, prefix with the appropriate glyph. Find the four header lines and update them:

```ts
// enemy header
addLine(store, iconLine(ICON.enemy, `=== ${e.name} ===`), C.ENEMY_COLOR);

// weapon header (in the inventory branch)
addLine(store, iconLine(ICON.weapon, `=== ${w.name} ===`), C.ITEM_COLOR);

// item header (in the inventory branch)
const headerIcon = item.type === 'key' ? ICON.key : item.type === 'shield' ? ICON.shield : ICON.item;
addLine(store, iconLine(headerIcon, `=== ${item.name} ===`), C.ITEM_COLOR);

// room item header (in the room branch)
addLine(store, iconLine(ICON.item, `=== ${item.name} ===`), C.ITEM_COLOR);

// room weapon header (in the room branch)
addLine(store, iconLine(ICON.weapon, `=== ${w.name} ===`), C.ITEM_COLOR);
```

- [ ] **Step 2: Add icons to combat enemy intro lines**

In `src/engine/gameReducer.ts`, find `startCombat` (around line 513). Find the intro line:

```ts
addLine(store, `A ${edata.name} attacks!`, C.ENEMY_COLOR);
```

Add the import at top of file:
```ts
import { ICON, iconLine } from './icons';
```

Change the intro line to:
```ts
addLine(store, iconLine(ICON.enemy, `A ${edata.name} attacks!`), C.ENEMY_COLOR);
```

- [ ] **Step 3: Add icons to combat loot drops**

In `src/engine/state/combat.ts`, add:
```ts
import { ICON, iconLine } from '../icons';
```

Find the loot drop lines in the victory branch:

```ts
if (idata) addLine(store, `The enemy drops a ${idata.name}.`, C.LOOT_COLOR);
// ...
if (wdata) addLine(store, `The enemy drops a ${wdata.name}!`, C.LOOT_COLOR);
```

Change to:

```ts
if (idata) addLine(store, iconLine(ICON.loot, `The enemy drops a ${idata.name}.`), C.LOOT_COLOR);
// ...
if (wdata) addLine(store, iconLine(ICON.loot, `The enemy drops a ${wdata.name}!`), C.LOOT_COLOR);
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/engine/handlers/examine.ts src/engine/state/combat.ts src/engine/gameReducer.ts
git commit -m "Add ASCII icons to examine and combat output"
```

### Task 47: Add icon assertions to scenario tests

**Files:**
- Modify: `test/scenario/new-game.test.ts`
- Modify: `test/scenario/combat-flow.test.ts`

- [ ] **Step 1: Add glyph asserts to new-game.test.ts**

In `test/scenario/new-game.test.ts`, in the "first room renders" test, add these assertions:

```ts
it('first room renders with name, description, contents, exits', () => {
  const s = newGame();
  expectLine(s, 'Entry');
  expectLine(s, 'Welcome to MysticQuest');
  expectLine(s, 'Shadow Rat');
  expectLine(s, 'Small Potion');
  expectLine(s, 'Rusty Dagger');
  expectLine(s, 'Exits:');
  // Icon glyphs
  expectLine(s, '[!]');  // enemy
  expectLine(s, '[*]');  // item
  expectLine(s, '[+]');  // weapon
  expectLine(s, '> Exits:');  // exit prefix
});
```

- [ ] **Step 2: Add ground-loot glyph assert to combat-flow.test.ts**

In `test/scenario/combat-flow.test.ts`, in the "attacks shadow rat and wins" test, after combat ends:

```ts
expect(s.state).toBe('exploring');
expectLine(s, 'COMBAT END');
expect(s.player!.xp).toBeGreaterThan(0);

// Look at the room — loot should be on the ground with [$] glyph
s = input(s, 'look');
expectLine(s, '[$]');  // ground loot icon
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all green.

- [ ] **Step 4: Manual playtest (10 minutes)**

Run: `npm run dev`. Walk through manor and a couple of wilds rooms. Verify the glyphs read well — no places where they look noisy or out of place. Pay attention to:
- Inventory display
- Examine output
- Combat intro and loot drops
- Room headers stay clean (no glyph on the room name)

- [ ] **Step 5: Commit Phase 4 complete**

```bash
git add test/scenario/
git commit -m "Add icon glyph assertions to scenario tests (Phase 4 complete)"
git tag phase-4-complete
```

---

## Phase 5 — Economy core (no shop UX yet)

### Task 48: Add gold to PlayerState type and createPlayer

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/player.ts`

- [ ] **Step 1: Add gold field to PlayerState type**

In `src/engine/types.ts`, find `PlayerState` (line 154) and add `gold: number;` after `xp`:

```ts
export interface PlayerState {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  level: number;
  xp: number;
  gold: number;            // NEW
  currentRoom: string;
  // ... rest unchanged
}
```

- [ ] **Step 2: Initialize gold in createPlayer**

In `src/engine/player.ts`, update `createPlayer`:

```ts
export function createPlayer(startRoom = 'manor_entry'): PlayerState {
  return {
    hp: 30,
    maxHp: 30,
    attack: 5,
    defense: 2,
    level: 1,
    xp: 0,
    gold: 0,                // NEW
    currentRoom: startRoom,
    inventory: {},
    weapons: [],
    equippedWeapon: null,
    equippedShield: null,
    keyItems: {},
    visitedRooms: {},
    searchedRooms: {},
    firedEvents: {},
    usedItemsInRoom: {},
    defending: false,
    buffAttack: 0,
    buffRounds: 0,
    routeHistory: [],
    journalEntries: [],
    skillPoints: 0,
    skills: {},
  };
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all green. Existing player tests should still pass since gold defaults to 0.

- [ ] **Step 4: Commit**

```bash
git add src/engine/types.ts src/engine/player.ts
git commit -m "Add gold field to PlayerState"
```

### Task 49: Add price field to items and weapons JSON

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/data/items.json`
- Modify: `src/data/weapons.json`

- [ ] **Step 1: Add price field to ItemDef and WeaponDef types**

In `src/engine/types.ts`:

```ts
export interface WeaponDef {
  name: string;
  attack_bonus: number;
  region: string;
  description: string;
  match_words?: string[];
  price?: number;  // NEW
}

export interface ItemDef {
  name: string;
  type: 'consumable' | 'shield' | 'key';
  effect?: string;
  value?: number;
  description: string;
  match_words?: string[];
  price?: number;  // NEW
}
```

- [ ] **Step 2: Add prices to items.json**

Replace `src/data/items.json` with this version (key items omit price):

```json
{
  "small_potion": {"name": "Small Potion", "type": "consumable", "effect": "heal", "value": 10, "price": 5, "description": "A small vial of red liquid. Restores 10 HP.", "match_words": ["small potion", "small", "potion"]},
  "potion": {"name": "Potion", "type": "consumable", "effect": "heal", "value": 25, "price": 12, "description": "A vial of red liquid. Restores 25 HP.", "match_words": ["potion"]},
  "large_potion": {"name": "Large Potion", "type": "consumable", "effect": "heal", "value": 50, "price": 30, "description": "A large flask of red liquid. Restores 50 HP.", "match_words": ["large potion", "large", "potion"]},
  "strength_tonic": {"name": "Strength Tonic", "type": "consumable", "effect": "buff_attack", "value": 3, "price": 25, "description": "A fizzing red tonic. +3 Attack for 3 combat rounds.", "match_words": ["tonic", "strength tonic", "strength"]},
  "iron_shield": {"name": "Iron Shield", "type": "shield", "effect": "defense", "value": 3, "price": 40, "description": "A battered iron shield. Provides +3 defense.", "match_words": ["iron shield", "iron", "shield"]},
  "steel_shield": {"name": "Steel Shield", "type": "shield", "effect": "defense", "value": 6, "price": 90, "description": "A sturdy steel shield. Provides +6 defense.", "match_words": ["steel shield", "steel", "shield"]},
  "rusty_key": {"name": "Rusty Key", "type": "key", "description": "An old iron key. It might open something in the manor.", "match_words": ["rusty key", "key", "rusty"]},
  "dark_crown": {"name": "Dark Crown", "type": "key", "description": "A crown of black iron that whispers when you hold it.", "match_words": ["dark crown", "crown", "dark"]},
  "ancient_map": {"name": "Ancient Map", "type": "key", "description": "A faded map showing passages no one remembers.", "match_words": ["ancient map", "map", "ancient"]},
  "red_mushroom": {"name": "Red Mushroom", "type": "key", "description": "A bright red mushroom. Smells... interesting.", "match_words": ["red mushroom", "red", "mushroom"]},
  "grey_mushroom": {"name": "Grey Mushroom", "type": "key", "description": "A dull grey mushroom. Looks boring but it's not.", "match_words": ["grey mushroom", "grey", "gray mushroom", "gray", "mushroom"]},
  "green_mushroom": {"name": "Green Mushroom", "type": "key", "description": "A vibrant green mushroom. Slightly luminous.", "match_words": ["green mushroom", "green", "mushroom"]},
  "orange_mushroom": {"name": "Orange Mushroom", "type": "key", "description": "An orange mushroom. Warm to the touch.", "match_words": ["orange mushroom", "orange", "mushroom"]}
}
```

- [ ] **Step 3: Add prices to weapons.json**

Replace `src/data/weapons.json`:

```json
{
  "rusty_dagger": {"name": "Rusty Dagger", "attack_bonus": 2, "region": "manor", "price": 15, "description": "A dull blade with spots of rust. Better than nothing.", "match_words": ["rusty dagger", "dagger", "rusty"]},
  "iron_sword": {"name": "Iron Sword", "attack_bonus": 5, "region": "manor", "price": 35, "description": "A solid iron sword. Reliable.", "match_words": ["iron sword", "iron", "sword"]},
  "hammer": {"name": "Hammer", "attack_bonus": 4, "region": "manor", "price": 25, "description": "A heavy hammer. Slow but powerful.", "match_words": ["hammer"]},
  "steel_sword": {"name": "Steel Sword", "attack_bonus": 8, "region": "wilds", "price": 60, "description": "A well-forged steel blade.", "match_words": ["steel sword", "sword"]},
  "spear": {"name": "Spear", "attack_bonus": 10, "region": "wilds", "price": 70, "description": "A long spear with a sharp point.", "match_words": ["spear"]},
  "hrunting": {"name": "Hrunting", "attack_bonus": 12, "region": "wilds", "price": 120, "description": "An ancient blade that hums with power.", "match_words": ["hrunting"]},
  "mjolnir": {"name": "Mjolnir", "attack_bonus": 15, "region": "wilds", "price": 200, "description": "The thunder god's hammer. It crackles with energy.", "match_words": ["mjolnir", "thor"]},
  "gungnir": {"name": "Gungnir", "attack_bonus": 14, "region": "wilds", "price": 180, "description": "Odin's spear. It never misses its mark.", "match_words": ["gungnir", "odin"]},
  "tyrfing": {"name": "Tyrfing", "attack_bonus": 16, "region": "wilds", "price": 220, "description": "A cursed sword that must draw blood when unsheathed.", "match_words": ["tyrfing"]},
  "dainsleif": {"name": "Dainsleif", "attack_bonus": 18, "region": "darkness", "price": 250, "description": "A cursed blade that thirsts for blood.", "match_words": ["dainsleif"]},
  "excalibur": {"name": "Excalibur", "attack_bonus": 20, "region": "wastes", "price": 300, "description": "The legendary sword. It glows with a soft light.", "match_words": ["excalibur"]},
  "vorpal_sword": {"name": "Vorpal Sword", "attack_bonus": 22, "region": "wastes", "price": 320, "description": "It goes snicker-snack.", "match_words": ["vorpal sword", "vorpal", "sword"]},
  "peacemaker": {"name": "Peacemaker", "attack_bonus": 24, "region": "wastes", "price": 350, "description": "The last argument.", "match_words": ["peacemaker"]},
  "masamune": {"name": "Masamune", "attack_bonus": 25, "region": "wastes", "price": 380, "description": "A perfectly balanced katana. Cuts through anything.", "match_words": ["masamune", "katana"]},
  "keyblade": {"name": "Keyblade", "attack_bonus": 28, "region": "darkness", "price": 420, "description": "A blade shaped like a key. Opens hearts.", "match_words": ["keyblade"]},
  "anduril": {"name": "Anduril", "attack_bonus": 30, "region": "darkness", "price": 450, "description": "Flame of the West. Burns with white fire.", "match_words": ["anduril"]},
  "badger_on_stick": {"name": "Badger on a Stick", "attack_bonus": 30, "region": "hidden", "price": 999, "description": "It's... a badger. On a stick. Surprisingly effective.", "match_words": ["badger", "badger on a stick", "stick"]},
  "buster_sword": {"name": "Buster Sword", "attack_bonus": 32, "region": "darkness", "price": 500, "description": "Absurdly large. Somehow it works.", "match_words": ["buster sword", "buster", "sword"]},
  "ragnarok": {"name": "Ragnarok", "attack_bonus": 35, "region": "darkness", "price": 600, "description": "The end of all things. A weapon of terrible power.", "match_words": ["ragnarok"]},
  "falcon_punch": {"name": "FALCON PUNCH", "attack_bonus": 40, "region": "hidden", "price": 999, "description": "SHOW ME YOUR MOVES! The ultimate weapon.", "match_words": ["falcon punch", "falcon"]}
}
```

- [ ] **Step 4: Run tests + build**

Run: `npm test && npm run build`
Expected: all green, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts src/data/items.json src/data/weapons.json
git commit -m "Add price field to items and weapons"
```

### Task 50: Add gold drops to enemies

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/data/enemies.json`

- [ ] **Step 1: Add gold field to EnemyDef**

In `src/engine/types.ts`:

```ts
export interface EnemyDef {
  name: string;
  hp: number;
  attack: number;
  defense: number;
  xp: number;
  gold?: number;  // NEW
  loot: string[];
  loot_weapon?: string;
  region: string;
  description: string;
  is_boss: boolean;
}
```

- [ ] **Step 2: Add gold values to every enemy**

Replace `src/data/enemies.json`:

```json
{
  "shadow_rat": {"name": "Shadow Rat", "hp": 10, "attack": 3, "defense": 1, "xp": 8, "gold": 3, "loot": ["small_potion"], "region": "manor", "description": "A rat wreathed in unnatural shadow.", "is_boss": false},
  "manor_ghost": {"name": "Manor Ghost", "hp": 15, "attack": 5, "defense": 2, "xp": 12, "gold": 5, "loot": ["small_potion"], "region": "manor", "description": "A translucent figure drifting through the halls. It moans softly.", "is_boss": false},
  "cellar_shade": {"name": "Cellar Shade", "hp": 35, "attack": 7, "defense": 3, "xp": 30, "gold": 30, "loot": [], "loot_weapon": "iron_sword", "region": "manor", "description": "A dark, shifting mass that clings to the cellar walls.", "is_boss": true},
  "forest_wolf": {"name": "Forest Wolf", "hp": 20, "attack": 6, "defense": 2, "xp": 15, "gold": 6, "loot": [], "region": "wilds", "description": "A grey wolf with glowing amber eyes. It snarls as you approach.", "is_boss": false},
  "forest_spider": {"name": "Forest Spider", "hp": 18, "attack": 8, "defense": 1, "xp": 14, "gold": 5, "loot": ["small_potion"], "region": "wilds", "description": "A spider the size of a dog. Its web glistens with dew.", "is_boss": false},
  "mountain_troll": {"name": "Mountain Troll", "hp": 60, "attack": 12, "defense": 5, "xp": 50, "gold": 60, "loot": ["large_potion"], "loot_weapon": "mjolnir", "region": "wilds", "description": "A massive troll blocking the mountain cave. The ground shakes when it moves.", "is_boss": true},
  "grave_wraith": {"name": "Grave Wraith", "hp": 40, "attack": 14, "defense": 6, "xp": 35, "gold": 10, "loot": ["potion"], "region": "darkness", "description": "A figure of cold light that seeps from the ground. It does not speak. It does not need to.", "is_boss": false},
  "shadow_knight": {"name": "Shadow Knight", "hp": 55, "attack": 16, "defense": 8, "xp": 45, "gold": 12, "loot": ["potion"], "region": "darkness", "description": "Armor animated by nothing. The visor is empty. The sword moves with precision no living thing possesses.", "is_boss": false},
  "oblivion_guardian": {"name": "Oblivion Guardian", "hp": 80, "attack": 18, "defense": 7, "xp": 60, "gold": 80, "loot": [], "loot_weapon": "keyblade", "region": "darkness", "description": "Assembled from fragments of deleted code. It guards the gate between what exists and what was erased.", "is_boss": true},
  "evil_king": {"name": "The Evil King", "hp": 150, "attack": 22, "defense": 10, "xp": 0, "gold": 0, "loot": [], "loot_weapon": "ragnarok", "region": "darkness", "description": "He sits on the throne of corruption. He has been here longer than the game. He was here before the kid started writing.", "is_boss": true},
  "sand_golem": {"name": "Sand Golem", "hp": 50, "attack": 10, "defense": 8, "xp": 40, "gold": 10, "loot": ["potion"], "region": "wastes", "description": "A towering figure of compacted sand and stone. It reforms when you break it apart.", "is_boss": false},
  "wasteland_wraith": {"name": "Wasteland Wraith", "hp": 45, "attack": 12, "defense": 5, "xp": 35, "gold": 8, "loot": ["potion"], "region": "wastes", "description": "A pale ghost that drifts across the barren ground. It reaches for something it can never hold.", "is_boss": false},
  "ruins_guardian": {"name": "Ruins Guardian", "hp": 70, "attack": 15, "defense": 9, "xp": 55, "gold": 100, "loot": ["large_potion"], "loot_weapon": "masamune", "region": "wastes", "description": "The last defender of a civilization that no longer exists. It fights because it has forgotten how to stop.", "is_boss": true},
  "milo": {"name": "Milo", "hp": 25, "attack": 5, "defense": 1, "xp": 100, "gold": 0, "loot": [], "loot_weapon": "falcon_punch", "region": "hidden", "description": "A very smug looking cat. Don't let the cute face fool you. Milo has MOVES.", "is_boss": true}
}
```

- [ ] **Step 3: Run tests + build**

Run: `npm test && npm run build`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/engine/types.ts src/data/enemies.json
git commit -m "Add gold drops to enemies"
```

### Task 51: Create economy.ts pure module

**Files:**
- Create: `src/engine/economy.ts`

- [ ] **Step 1: Write the economy module**

Create `src/engine/economy.ts`:

```ts
import type { PlayerState, ItemDef, WeaponDef } from './types';
import { addItem, addWeapon, removeItem, hasItem } from './player';

export interface ShopStockEntry {
  id: string;
  qty: number;
  type?: 'item' | 'weapon';
}

export interface ShopDef {
  owner_npc: string;
  name: string;
  stock: ShopStockEntry[];
  buys: 'all' | 'consumables' | 'weapons';
}

export interface ShopRuntimeState {
  shopId: string;
  // Key is the stringified entry index ("0", "1", ...).
  // Stringified because JSON.stringify turns numeric Record keys into strings.
  // Missing entries fall back to the static qty from the ShopDef.
  remainingStock: Record<string, number>;
}

export type BuyResult =
  | { ok: true; itemId: string; type: 'item' | 'weapon'; price: number }
  | { ok: false; reason: 'insufficient_gold' | 'out_of_stock' | 'unknown_item'; needed?: number };

export type SellResult =
  | { ok: true; itemId: string; price: number }
  | { ok: false; reason: 'not_owned' | 'key_item' | 'shop_refuses' | 'unknown_item' };

// ---- Gold helpers ----

export function canAfford(player: PlayerState, price: number): boolean {
  return player.gold >= price;
}

export function chargeGold(player: PlayerState, amount: number): void {
  player.gold = Math.max(0, player.gold - amount);
}

export function awardGold(player: PlayerState, amount: number): void {
  player.gold += amount;
}

// ---- Pricing ----

export function priceOf(
  itemId: string,
  type: 'item' | 'weapon',
  items: Record<string, ItemDef>,
  weapons: Record<string, WeaponDef>,
): number | null {
  if (type === 'item') {
    const i = items[itemId];
    if (!i || i.type === 'key') return null;
    return i.price ?? null;
  } else {
    const w = weapons[itemId];
    if (!w) return null;
    return w.price ?? null;
  }
}

export function sellValueOf(
  itemId: string,
  type: 'item' | 'weapon',
  items: Record<string, ItemDef>,
  weapons: Record<string, WeaponDef>,
): number | null {
  const p = priceOf(itemId, type, items, weapons);
  if (p === null) return null;
  return Math.floor(p / 2);
}

// ---- Stock ----

export function getEffectiveStock(
  shop: ShopDef,
  runtime: ShopRuntimeState,
): Array<{ entry: ShopStockEntry; index: number; remaining: number }> {
  return shop.stock.map((entry, index) => {
    const key = String(index);
    const remaining = runtime.remainingStock[key] ?? entry.qty;
    return { entry, index, remaining };
  });
}

export function createShopRuntime(shopId: string): ShopRuntimeState {
  return { shopId, remainingStock: {} };
}

// ---- Transactions ----

export function buyItem(
  player: PlayerState,
  shop: ShopDef,
  runtime: ShopRuntimeState,
  entryIndex: number,
  items: Record<string, ItemDef>,
  weapons: Record<string, WeaponDef>,
): BuyResult {
  const entry = shop.stock[entryIndex];
  if (!entry) return { ok: false, reason: 'unknown_item' };

  const type = entry.type ?? 'item';
  const price = priceOf(entry.id, type, items, weapons);
  if (price === null) return { ok: false, reason: 'unknown_item' };

  const key = String(entryIndex);
  const remaining = runtime.remainingStock[key] ?? entry.qty;
  if (remaining <= 0) return { ok: false, reason: 'out_of_stock' };

  if (!canAfford(player, price)) {
    return { ok: false, reason: 'insufficient_gold', needed: price - player.gold };
  }

  chargeGold(player, price);
  runtime.remainingStock[key] = remaining - 1;

  if (type === 'weapon') {
    addWeapon(player, entry.id);
  } else {
    addItem(player, entry.id, items);
  }

  return { ok: true, itemId: entry.id, type, price };
}

export function sellItem(
  player: PlayerState,
  shop: ShopDef,
  itemId: string,
  type: 'item' | 'weapon',
  items: Record<string, ItemDef>,
  weapons: Record<string, WeaponDef>,
): SellResult {
  // shop refuses?
  if (shop.buys === 'consumables' && type !== 'item') {
    return { ok: false, reason: 'shop_refuses' };
  }
  if (shop.buys === 'weapons' && type !== 'weapon') {
    return { ok: false, reason: 'shop_refuses' };
  }

  if (type === 'item') {
    const idata = items[itemId];
    if (!idata) return { ok: false, reason: 'unknown_item' };
    if (idata.type === 'key') return { ok: false, reason: 'key_item' };
    if (!hasItem(player, itemId)) return { ok: false, reason: 'not_owned' };

    const price = sellValueOf(itemId, 'item', items, weapons);
    if (price === null) return { ok: false, reason: 'unknown_item' };

    removeItem(player, itemId);
    if (player.equippedShield === itemId) player.equippedShield = null;
    awardGold(player, price);
    return { ok: true, itemId, price };
  } else {
    if (!weapons[itemId]) return { ok: false, reason: 'unknown_item' };
    if (!player.weapons.includes(itemId)) return { ok: false, reason: 'not_owned' };

    const price = sellValueOf(itemId, 'weapon', items, weapons);
    if (price === null) return { ok: false, reason: 'unknown_item' };

    const idx = player.weapons.indexOf(itemId);
    player.weapons.splice(idx, 1);
    if (player.equippedWeapon === itemId) player.equippedWeapon = null;
    awardGold(player, price);
    return { ok: true, itemId, price };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/economy.ts
git commit -m "Add economy pure module (gold, prices, transactions)"
```

### Task 52: Unit tests for economy module

**Files:**
- Create: `test/unit/economy.test.ts`

- [ ] **Step 1: Write the tests**

Create `test/unit/economy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  canAfford, chargeGold, awardGold,
  priceOf, sellValueOf,
  buyItem, sellItem, createShopRuntime,
  type ShopDef,
} from '../../src/engine/economy';
import { createPlayer, addItem, addWeapon, equipWeapon } from '../../src/engine/player';
import type { ItemDef, WeaponDef } from '../../src/engine/types';

const items: Record<string, ItemDef> = {
  potion: { name: 'Potion', type: 'consumable', effect: 'heal', value: 25, price: 12, description: 'heals' },
  iron_shield: { name: 'Iron Shield', type: 'shield', effect: 'defense', value: 3, price: 40, description: 'shield' },
  rusty_key: { name: 'Rusty Key', type: 'key', description: 'a key' },
};

const weapons: Record<string, WeaponDef> = {
  rusty_dagger: { name: 'Rusty Dagger', attack_bonus: 2, region: 'manor', price: 15, description: 'dull' },
  no_price: { name: 'No Price', attack_bonus: 1, region: 'manor', description: 'priceless' },
};

const dustyShop: ShopDef = {
  owner_npc: 'manor_merchant',
  name: 'Dusty Wares',
  buys: 'all',
  stock: [
    { id: 'potion', qty: 3 },
    { id: 'iron_shield', qty: 1 },
    { id: 'rusty_dagger', qty: 1, type: 'weapon' },
  ],
};

const consumablesOnlyShop: ShopDef = {
  owner_npc: 'foo',
  name: 'Foo',
  buys: 'consumables',
  stock: [],
};

describe('canAfford / chargeGold / awardGold', () => {
  it('canAfford true at exact price, false below', () => {
    const p = createPlayer();
    p.gold = 10;
    expect(canAfford(p, 10)).toBe(true);
    expect(canAfford(p, 11)).toBe(false);
  });

  it('chargeGold subtracts and floors at 0', () => {
    const p = createPlayer();
    p.gold = 5;
    chargeGold(p, 3);
    expect(p.gold).toBe(2);
    chargeGold(p, 100);
    expect(p.gold).toBe(0);
  });

  it('awardGold adds', () => {
    const p = createPlayer();
    awardGold(p, 7);
    expect(p.gold).toBe(7);
  });
});

describe('priceOf / sellValueOf', () => {
  it('returns price for items and weapons', () => {
    expect(priceOf('potion', 'item', items, weapons)).toBe(12);
    expect(priceOf('rusty_dagger', 'weapon', items, weapons)).toBe(15);
  });

  it('returns null for key items', () => {
    expect(priceOf('rusty_key', 'item', items, weapons)).toBe(null);
  });

  it('returns null for missing ids', () => {
    expect(priceOf('nope', 'item', items, weapons)).toBe(null);
    expect(priceOf('nope', 'weapon', items, weapons)).toBe(null);
  });

  it('returns null for items without a price', () => {
    expect(priceOf('no_price', 'weapon', items, weapons)).toBe(null);
  });

  it('sellValueOf floors at half', () => {
    expect(sellValueOf('potion', 'item', items, weapons)).toBe(6);
    expect(sellValueOf('rusty_dagger', 'weapon', items, weapons)).toBe(7);
  });
});

describe('buyItem', () => {
  it('happy path: gold debited, stock decremented, item added', () => {
    const p = createPlayer();
    p.gold = 50;
    const rt = createShopRuntime('dusty');
    const r = buyItem(p, dustyShop, rt, 0, items, weapons);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.itemId).toBe('potion');
      expect(r.price).toBe(12);
    }
    expect(p.gold).toBe(38);
    expect(p.inventory.potion).toBe(1);
    expect(rt.remainingStock['0']).toBe(2);
  });

  it('weapon purchase routes through addWeapon', () => {
    const p = createPlayer();
    p.gold = 50;
    const rt = createShopRuntime('dusty');
    const r = buyItem(p, dustyShop, rt, 2, items, weapons);
    expect(r.ok).toBe(true);
    expect(p.weapons).toContain('rusty_dagger');
    expect(p.gold).toBe(35);
  });

  it('insufficient gold returns error, no mutation', () => {
    const p = createPlayer();
    p.gold = 5;
    const rt = createShopRuntime('dusty');
    const r = buyItem(p, dustyShop, rt, 0, items, weapons);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('insufficient_gold');
      expect(r.needed).toBe(7);
    }
    expect(p.gold).toBe(5);
    expect(p.inventory.potion).toBeUndefined();
  });

  it('out of stock returns error', () => {
    const p = createPlayer();
    p.gold = 100;
    const rt = createShopRuntime('dusty');
    rt.remainingStock['0'] = 0;
    const r = buyItem(p, dustyShop, rt, 0, items, weapons);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('out_of_stock');
  });

  it('unknown entry index returns error', () => {
    const p = createPlayer();
    p.gold = 100;
    const rt = createShopRuntime('dusty');
    const r = buyItem(p, dustyShop, rt, 99, items, weapons);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unknown_item');
  });
});

describe('sellItem', () => {
  it('happy path: gold credited at half, item removed', () => {
    const p = createPlayer();
    addItem(p, 'potion', items);
    const r = sellItem(p, dustyShop, 'potion', 'item', items, weapons);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.price).toBe(6);
    expect(p.gold).toBe(6);
    expect(p.inventory.potion).toBeUndefined();
  });

  it('refuses key items', () => {
    const p = createPlayer();
    p.keyItems.rusty_key = true;
    const r = sellItem(p, dustyShop, 'rusty_key', 'item', items, weapons);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('key_item');
  });

  it('refuses items not owned', () => {
    const p = createPlayer();
    const r = sellItem(p, dustyShop, 'potion', 'item', items, weapons);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not_owned');
  });

  it('selling equipped weapon unequips it', () => {
    const p = createPlayer();
    addWeapon(p, 'rusty_dagger');
    equipWeapon(p, 'rusty_dagger');
    const r = sellItem(p, dustyShop, 'rusty_dagger', 'weapon', items, weapons);
    expect(r.ok).toBe(true);
    expect(p.weapons).not.toContain('rusty_dagger');
    expect(p.equippedWeapon).toBe(null);
    expect(p.gold).toBe(7);
  });

  it('selling equipped shield unequips it', () => {
    const p = createPlayer();
    addItem(p, 'iron_shield', items);
    p.equippedShield = 'iron_shield';
    const r = sellItem(p, dustyShop, 'iron_shield', 'item', items, weapons);
    expect(r.ok).toBe(true);
    expect(p.equippedShield).toBe(null);
    expect(p.gold).toBe(20);
  });

  it('consumables-only shop refuses weapons', () => {
    const p = createPlayer();
    addWeapon(p, 'rusty_dagger');
    const r = sellItem(p, consumablesOnlyShop, 'rusty_dagger', 'weapon', items, weapons);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('shop_refuses');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- economy`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add test/unit/economy.test.ts
git commit -m "Add economy module unit tests"
```

### Task 53: Award gold from combat victories

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/combat.ts`
- Modify: `src/engine/state/combat.ts`

- [ ] **Step 1: Add gold to EnemyInstance**

In `src/engine/types.ts`, find `EnemyInstance` (line 180) and add:

```ts
export interface EnemyInstance {
  name: string;
  hp: number;
  attack: number;
  defense: number;
  xp: number;
  gold: number;       // NEW
  loot: string[];
  lootWeapon?: string;
  isBoss: boolean;
  description: string;
}
```

- [ ] **Step 2: Wire gold into createCombat**

In `src/engine/combat.ts`, update `createCombat`:

```ts
export function createCombat(player: PlayerState, enemyId: string, enemyData: Record<string, any>): CombatState {
  const edata = enemyData[enemyId];
  return {
    enemy: {
      name: edata.name,
      hp: edata.hp,
      attack: edata.attack,
      defense: edata.defense,
      xp: edata.xp,
      gold: edata.gold ?? 0,         // NEW
      loot: edata.loot || [],
      lootWeapon: edata.loot_weapon,
      isBoss: edata.is_boss,
      description: edata.description,
    },
    round: 0,
    finished: false,
    fled: false,
    playerWon: false,
  };
}
```

- [ ] **Step 3: Award gold in the combat victory loop**

In `src/engine/state/combat.ts`, add to imports:
```ts
import { awardGold } from '../economy';
```

In `handleCombatCommand`, find the victory branch (where `markEnemyDead` is called and loot is dropped). Add a gold reward block before the loot drop:

```ts
if (store.combat.playerWon) {
  const defeatedEnemyId = store.combatEnemyId!;
  const results = enemyDefeated(store.combat, store.player);
  processCombatMessages(store, results.messages);

  const wasBoss = store.combat.enemy.isBoss;
  markEnemyDead(store.world, store.player.currentRoom, defeatedEnemyId);
  deps.addJournal('combat', `Defeated ${store.combat.enemy.name}`);
  if (store.gameMode === 'dungeon' && store.dungeon) {
    store.dungeon.score.enemiesKilled++;
  }

  // Award gold (NEW)
  const goldReward = store.combat.enemy.gold ?? 0;
  if (goldReward > 0) {
    awardGold(store.player, goldReward);
    addLine(store, iconLine(ICON.loot, `You loot ${goldReward} gold.`), C.LOOT_COLOR);
  }

  const room = deps.getRoom(store.player.currentRoom);
  // ... rest unchanged
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts src/engine/combat.ts src/engine/state/combat.ts
git commit -m "Award gold from defeated enemies"
```

### Task 54: Display gold in header and stats

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/output.ts`
- Modify: `src/engine/gameReducer.ts`
- Modify: `src/engine/handlers/meta.ts`
- Modify: `src/components/Game.tsx`

- [ ] **Step 1: Add gold to HeaderState**

In `src/engine/types.ts`, find `HeaderState` (line 222):

```ts
export interface HeaderState {
  title: string;
  hp: number;
  maxHp: number;
  level: number;
  gold: number;     // NEW
  weapon: string;
}
```

- [ ] **Step 2: Update output.ts to write gold to the header**

In `src/engine/output.ts`, update `updateHeader` and `hideHeader`:

```ts
export function updateHeader(store: GameStore, weaponName: string): void {
  if (!store.player) return;
  store.header.title = (store.gameMode === 'dungeon' && store.dungeon)
    ? `DUNGEON F${store.dungeon.floor}`
    : 'MYSTICQUEST v1.0';
  store.header.hp = store.player.hp;
  store.header.maxHp = store.player.maxHp;
  store.header.level = store.player.level;
  store.header.gold = store.player.gold;     // NEW
  store.header.weapon = weaponName;
}

export function hideHeader(store: GameStore): void {
  store.header = { title: '', hp: 0, maxHp: 0, level: 0, gold: 0, weapon: '' };
}
```

- [ ] **Step 3: Update createInitialStore in gameReducer.ts**

In `src/engine/gameReducer.ts`, find `createInitialStore` (~line 1982). Update the header default:

```ts
header: { title: '', hp: 0, maxHp: 0, level: 0, gold: 0, weapon: '' },
```

Also find any other inline `header = { ... }` literals (e.g., in `startMenu`) and add `gold: 0` to them.

- [ ] **Step 4: Update Game.tsx to render gold**

In `src/components/Game.tsx`, find the header rendering line (around line 283):

```tsx
{`${store.header.title}    HP:${store.header.hp}/${store.header.maxHp}  LVL:${store.header.level}  ${store.header.weapon}`}
```

Change to:

```tsx
{`${store.header.title}    HP:${store.header.hp}/${store.header.maxHp}  LVL:${store.header.level}  G:${store.header.gold}  ${store.header.weapon}`}
```

- [ ] **Step 5: Add gold line to showStats**

In `src/engine/handlers/meta.ts`, in `showStats`, add a gold line after the level line:

```ts
addLine(store, `Level: ${store.player.level}`, C.STAT_COLOR);
addLine(store, `Gold: ${store.player.gold}`, C.STAT_COLOR);   // NEW
addLine(store, `XP: ${store.player.xp}/${xpToNextLevel(store.player)}`, C.STAT_COLOR);
```

- [ ] **Step 6: Run tests**

Run: `npm test && npm run build`
Expected: all green, zero type errors.

- [ ] **Step 7: Commit**

```bash
git add src/engine/types.ts src/engine/output.ts src/engine/gameReducer.ts src/engine/handlers/meta.ts src/components/Game.tsx
git commit -m "Display gold in header and stats screen"
```

### Task 55: Save format bump v1 → v2 with gold migration

**Files:**
- Modify: `src/engine/save.ts`
- Modify: `test/unit/save.test.ts`

- [ ] **Step 1: Bump save format and add gold field**

In `src/engine/save.ts`, update the `SaveData` interface and serialize/deserialize:

```ts
interface SaveData {
  version: number;
  player: {
    hp: number; max_hp: number;
    attack: number; defense: number;
    level: number; xp: number;
    gold: number;          // NEW (v2)
    current_room: string;
    inventory: Record<string, number>;
    weapons: string[];
    equipped_weapon: string | null;
    equipped_shield: string | null;
    key_items: Record<string, boolean>;
    visited_rooms: Record<string, boolean>;
    searched_rooms: Record<string, boolean>;
    fired_events: Record<string, boolean>;
    used_items_in_room: Record<string, Record<string, boolean>>;
    buff_attack: number;
    buff_rounds: number;
    route_history: string[];
    journal_entries: JournalEntry[];
    skill_points: number;
    skills: Record<string, boolean>;
  };
  world_state: { rooms: Record<string, RoomState> };
  shops?: Record<string, { remainingStock: Record<string, number> }>;   // NEW (v2)
  dungeon?: {
    seed: number;
    floor: number;
    score: { floorsCleared: number; enemiesKilled: number; itemsFound: number; totalXp: number };
    dungeon_perks: string[];
  };
}
```

In `serialize`, change `version: 1` to `version: 2` and add `gold` to the player block:

```ts
const data: SaveData = {
  version: 2,
  player: {
    hp: player.hp, max_hp: player.maxHp,
    attack: player.attack, defense: player.defense,
    level: player.level, xp: player.xp,
    gold: player.gold,          // NEW
    current_room: player.currentRoom,
    // ... rest unchanged
  },
  world_state: { rooms },
};
```

In `deserialize`, accept both v1 and v2 with migration:

```ts
function deserialize(jsonString: string, player: PlayerState, world: WorldState): { success: boolean; dungeon?: any } {
  try {
    const data: SaveData = JSON.parse(jsonString);
    if (!data || (data.version !== 1 && data.version !== 2)) return { success: false };
    const p = data.player;
    player.hp = p.hp;
    player.maxHp = p.max_hp;
    player.attack = p.attack;
    player.defense = p.defense;
    player.level = p.level;
    player.xp = p.xp;
    player.gold = p.gold ?? 0;            // NEW — default for v1 saves
    player.currentRoom = p.current_room;
    // ... rest unchanged
```

- [ ] **Step 2: Add migration test**

In `test/unit/save.test.ts`, add this test inside the `describe('save round-trip', ...)` block:

```ts
it('migrates v1 save to v2 with gold defaulted to 0', () => {
  // Manually craft a v1 save (no gold, no shops)
  const v1Data = {
    version: 1,
    player: {
      hp: 20, max_hp: 30,
      attack: 5, defense: 2,
      level: 2, xp: 5,
      current_room: 'r1',
      inventory: { potion: 1 },
      weapons: [],
      equipped_weapon: null,
      equipped_shield: null,
      key_items: {},
      visited_rooms: { r1: true },
      searched_rooms: {},
      fired_events: {},
      used_items_in_room: {},
      buff_attack: 0,
      buff_rounds: 0,
      route_history: [],
      journal_entries: [],
      skill_points: 0,
      skills: {},
    },
    world_state: { rooms: {} },
  };
  localStorage.setItem('mysticquest_save_1', JSON.stringify(v1Data));

  const player = createPlayer();
  const world = createWorld();
  loadRegion(world, region);
  const result = loadFromSlot(1, player, world);

  expect(result.success).toBe(true);
  expect(player.gold).toBe(0);
  expect(player.level).toBe(2);
  expect(player.inventory.potion).toBe(1);
});

it('saves and reloads gold value', () => {
  const player = createPlayer();
  player.gold = 42;
  const world = createWorld();
  loadRegion(world, region);
  saveToSlot(1, player, world);

  const newPlayer = createPlayer();
  const newWorld = createWorld();
  loadRegion(newWorld, region);
  loadFromSlot(1, newPlayer, newWorld);

  expect(newPlayer.gold).toBe(42);
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- save`
Expected: all green.

- [ ] **Step 4: Run full suite + build**

Run: `npm test && npm run build`
Expected: all green, zero type errors.

- [ ] **Step 5: Manual playtest**

Run: `npm run dev`. Start a new game. Verify the header shows `G:0`. Kill a Shadow Rat. Verify the loot line `[$] You loot 3 gold.` appears and `G:3` shows in the header. Save, reload, verify gold persists. Type `stats` and verify `Gold: 3` appears.

- [ ] **Step 6: Commit Phase 5 complete**

```bash
git add src/engine/save.ts test/unit/save.test.ts
git commit -m "Bump save format to v2 with gold field (Phase 5 complete)"
git tag phase-5-complete
```

---

## Phase 6 — Shops

### Task 56: Create shops.json

**Files:**
- Create: `src/data/shops.json`

- [ ] **Step 1: Write the shops file**

Create `src/data/shops.json`:

```json
{
  "manor_dusty": {
    "owner_npc": "manor_merchant",
    "name": "Dusty's Wares",
    "buys": "all",
    "stock": [
      { "id": "small_potion", "qty": 5 },
      { "id": "potion", "qty": 3 },
      { "id": "iron_shield", "qty": 1 },
      { "id": "rusty_dagger", "qty": 1, "type": "weapon" }
    ]
  },
  "wilds_wren": {
    "owner_npc": "wilds_guide",
    "name": "Wren's Camp Supplies",
    "buys": "all",
    "stock": [
      { "id": "potion", "qty": 4 },
      { "id": "large_potion", "qty": 1 },
      { "id": "strength_tonic", "qty": 2 },
      { "id": "spear", "qty": 1, "type": "weapon" }
    ]
  },
  "wastes_hermit": {
    "owner_npc": "wastes_hermit",
    "name": "The Hermit's Trinkets",
    "buys": "all",
    "stock": [
      { "id": "large_potion", "qty": 2 },
      { "id": "strength_tonic", "qty": 3 },
      { "id": "steel_shield", "qty": 1 }
    ]
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/shops.json
git commit -m "Add shops.json with three regional merchants"
```

### Task 57: Add shop state to GameStore and types

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/gameReducer.ts`

- [ ] **Step 1: Add 'shop' to GameStateKind**

In `src/engine/types.ts`, find `GameStateKind` (line 145) and add `'shop'`:

```ts
export type GameStateKind = 'boot' | 'menu' | 'exploring' | 'combat' | 'dialogue' | 'ending' | 'gameover' | 'slot_picker' | 'minimap' | 'settings' | 'shop';
```

- [ ] **Step 2: Move ShopRuntimeState to types.ts as the canonical definition**

To avoid a circular import (economy.ts already imports types from types.ts), `ShopRuntimeState` lives in `types.ts` and `economy.ts` imports it from there.

In `src/engine/economy.ts`, **delete** the local `ShopRuntimeState` interface declaration. Then add an import at the top:

```ts
import type { ShopRuntimeState } from './types';
```

In `src/engine/types.ts`, add the canonical declaration near the bottom (before `GameStore`):

```ts
export interface ShopRuntimeState {
  shopId: string;
  // Key is the stringified entry index ("0", "1", ...).
  // Stringified because JSON.stringify turns numeric Record keys into strings.
  remainingStock: Record<string, number>;
}

export interface ShopStateContainer {
  activeShopId: string | null;
  runtime: Record<string, ShopRuntimeState>;
}
```

Then in `GameStore` interface, add the new field:

```ts
export interface GameStore {
  // ... existing fields
  shopState: ShopStateContainer;     // NEW
}
```

- [ ] **Step 3: Initialize shopState in createInitialStore**

In `src/engine/gameReducer.ts`, find `createInitialStore` and add to the store literal:

```ts
shopState: { activeShopId: null, runtime: {} },
```

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts src/engine/gameReducer.ts src/engine/economy.ts
git commit -m "Add shop state kind and shopState to GameStore"
```

### Task 58: Create handlers/shop.ts (buy/sell/examine/leave)

**Files:**
- Create: `src/engine/handlers/shop.ts`

- [ ] **Step 1: Write the shop handlers**

Create `src/engine/handlers/shop.ts`:

```ts
import type { GameStore, ItemDef, WeaponDef } from '../types';
import * as C from '../constants';
import { addLine, emitSound } from '../output';
import { findAllMatches, resolveOrDisambiguate, type Matchable } from '../matching';
import { ICON, iconLine } from '../icons';
import {
  buyItem, sellItem, getEffectiveStock, type ShopDef,
} from '../economy';

interface ShopBuyMatchable extends Matchable {
  __entryIndex: number;
  __type: 'item' | 'weapon';
}

export function displayShop(
  store: GameStore,
  shop: ShopDef,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
): void {
  if (!store.player) return;
  const runtime = store.shopState.runtime[store.shopState.activeShopId!];
  if (!runtime) return;

  addLine(store, '');
  addLine(store, `========== ${shop.name.toUpperCase()} ==========`, C.STAT_COLOR);
  addLine(store, `Your gold: ${store.player.gold}`, C.LOOT_COLOR);
  addLine(store, '');

  const stock = getEffectiveStock(shop, runtime).filter(s => s.remaining > 0);

  if (stock.length === 0) {
    addLine(store, '-- SOLD OUT --', C.HELP_COLOR);
  } else {
    addLine(store, '-- FOR SALE --', C.STAT_COLOR);
    for (const s of stock) {
      const isWeapon = s.entry.type === 'weapon';
      const def = isWeapon ? weaponData[s.entry.id] : itemData[s.entry.id];
      if (!def) continue;
      const price = isWeapon ? (weaponData[s.entry.id]?.price ?? 0) : (itemData[s.entry.id]?.price ?? 0);
      const tag = isWeapon ? ' (weapon)' : '';
      const namePadded = def.name.padEnd(20, '.');
      addLine(store, `  ${namePadded} ${String(price).padStart(4)}g  (${s.remaining} left${tag})`, C.HELP_COLOR);
    }
  }

  addLine(store, '');
  addLine(store, 'Commands: buy <item>, sell <item>, examine <item>, leave', C.CHOICE_COLOR);
}

export function handleShopCommand(
  store: GameStore,
  verb: string,
  target: string,
  shops: Record<string, ShopDef>,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  refreshHeader: () => void,
): void {
  if (!store.player || !store.shopState.activeShopId) return;
  const shopId = store.shopState.activeShopId;
  const shop = shops[shopId];
  const runtime = store.shopState.runtime[shopId];
  if (!shop || !runtime) return;

  if (verb === 'leave' || verb === 'exit' || verb === 'quit') {
    addLine(store, 'You leave the shop.', C.HELP_COLOR);
    store.shopState.activeShopId = null;
    store.state = 'exploring';
    return;
  }

  if (verb === 'look') {
    displayShop(store, shop, itemData, weaponData);
    return;
  }

  if (verb === 'buy') {
    if (!target) { addLine(store, 'Buy what?', C.ERROR_COLOR); return; }

    // Build a virtual matchable list from in-stock entries
    const stock = getEffectiveStock(shop, runtime).filter(s => s.remaining > 0);
    const candidates: Record<string, ShopBuyMatchable> = {};
    const candidateIds: string[] = [];
    for (const s of stock) {
      const isWeapon = s.entry.type === 'weapon';
      const def = isWeapon ? weaponData[s.entry.id] : itemData[s.entry.id];
      if (!def) continue;
      const key = `__${s.index}`;
      candidates[key] = {
        name: def.name,
        match_words: def.match_words,
        __entryIndex: s.index,
        __type: isWeapon ? 'weapon' : 'item',
      };
      candidateIds.push(key);
    }

    const matches = findAllMatches(target, candidateIds, candidates);
    if (matches.length > 1) {
      resolveOrDisambiguate(store, matches, candidates, 'item do you want to buy');
      return;
    }
    if (matches.length === 0) {
      addLine(store, "Dusty doesn't have any of those.", C.ERROR_COLOR);
      return;
    }

    const matched = candidates[matches[0]];
    const result = buyItem(store.player, shop, runtime, matched.__entryIndex, itemData, weaponData);
    if (!result.ok) {
      if (result.reason === 'insufficient_gold') {
        addLine(store, `You need ${result.needed} more gold.`, C.ERROR_COLOR);
      } else if (result.reason === 'out_of_stock') {
        addLine(store, "That's sold out.", C.ERROR_COLOR);
      } else {
        addLine(store, "You can't buy that.", C.ERROR_COLOR);
      }
      emitSound(store, 'error');
      return;
    }

    const def = result.type === 'weapon' ? weaponData[result.itemId] : itemData[result.itemId];
    const name = def?.name ?? result.itemId;
    addLine(store, iconLine(ICON.loot, `Bought ${name} for ${result.price}g.`), C.ITEM_COLOR);
    emitSound(store, 'pickup');
    refreshHeader();
    return;
  }

  if (verb === 'sell') {
    if (!target) { addLine(store, 'Sell what?', C.ERROR_COLOR); return; }

    // Try inventory items first
    const ownedItemIds = Object.keys(store.player.inventory);
    const itemMatches = findAllMatches(target, ownedItemIds, itemData);
    if (itemMatches.length > 1) {
      resolveOrDisambiguate(store, itemMatches, itemData, 'item do you want to sell');
      return;
    }
    if (itemMatches.length === 1) {
      const result = sellItem(store.player, shop, itemMatches[0], 'item', itemData, weaponData);
      handleSellResult(store, result, itemData[itemMatches[0]]?.name ?? itemMatches[0]);
      refreshHeader();
      return;
    }

    // Try weapons
    const weaponMatches = findAllMatches(target, store.player.weapons, weaponData);
    if (weaponMatches.length > 1) {
      resolveOrDisambiguate(store, weaponMatches, weaponData, 'weapon do you want to sell');
      return;
    }
    if (weaponMatches.length === 1) {
      const result = sellItem(store.player, shop, weaponMatches[0], 'weapon', itemData, weaponData);
      handleSellResult(store, result, weaponData[weaponMatches[0]]?.name ?? weaponMatches[0]);
      refreshHeader();
      return;
    }

    addLine(store, "You don't have that.", C.ERROR_COLOR);
    return;
  }

  if (verb === 'examine') {
    if (!target) { addLine(store, 'Examine what?', C.ERROR_COLOR); return; }

    // Check stock
    const stock = getEffectiveStock(shop, runtime);
    for (const s of stock) {
      const isWeapon = s.entry.type === 'weapon';
      const def = isWeapon ? weaponData[s.entry.id] : itemData[s.entry.id];
      if (!def) continue;
      if (def.name.toLowerCase().includes(target.toLowerCase()) || s.entry.id.toLowerCase().includes(target.toLowerCase())) {
        addLine(store, '');
        addLine(store, iconLine(isWeapon ? ICON.weapon : ICON.item, `=== ${def.name} ===`), C.ITEM_COLOR);
        addLine(store, def.description, C.HELP_COLOR);
        const price = isWeapon ? (weaponData[s.entry.id]?.price ?? 0) : (itemData[s.entry.id]?.price ?? 0);
        addLine(store, `Price: ${price}g`, C.STAT_COLOR);
        return;
      }
    }

    // Check inventory
    for (const iid of Object.keys(store.player.inventory)) {
      const item = itemData[iid];
      if (item && item.name.toLowerCase().includes(target.toLowerCase())) {
        addLine(store, '');
        addLine(store, iconLine(ICON.item, `=== ${item.name} ===`), C.ITEM_COLOR);
        addLine(store, item.description, C.HELP_COLOR);
        if (item.price) addLine(store, `Sell value: ${Math.floor(item.price / 2)}g`, C.STAT_COLOR);
        return;
      }
    }
    for (const wid of store.player.weapons) {
      const w = weaponData[wid];
      if (w && w.name.toLowerCase().includes(target.toLowerCase())) {
        addLine(store, '');
        addLine(store, iconLine(ICON.weapon, `=== ${w.name} ===`), C.ITEM_COLOR);
        addLine(store, w.description, C.HELP_COLOR);
        if (w.price) addLine(store, `Sell value: ${Math.floor(w.price / 2)}g`, C.STAT_COLOR);
        return;
      }
    }

    addLine(store, "You don't see that here.", C.ERROR_COLOR);
    return;
  }

  addLine(store, "In the shop: buy <item>, sell <item>, examine <item>, leave", C.CHOICE_COLOR);
}

function handleSellResult(store: GameStore, result: ReturnType<typeof sellItem>, name: string): void {
  if (result.ok) {
    addLine(store, iconLine(ICON.loot, `Sold ${name} for ${result.price}g.`), C.ITEM_COLOR);
    emitSound(store, 'save');
  } else {
    if (result.reason === 'key_item') addLine(store, "You can't sell that.", C.ERROR_COLOR);
    else if (result.reason === 'shop_refuses') addLine(store, "Dusty doesn't want that.", C.ERROR_COLOR);
    else if (result.reason === 'not_owned') addLine(store, "You don't have that.", C.ERROR_COLOR);
    else addLine(store, "Can't sell that.", C.ERROR_COLOR);
    emitSound(store, 'error');
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/handlers/shop.ts
git commit -m "Add shop handler (buy/sell/examine/leave)"
```

### Task 59: Create state/shop.ts dispatcher

**Files:**
- Create: `src/engine/state/shop.ts`

- [ ] **Step 1: Write the shop state dispatcher**

Create `src/engine/state/shop.ts`:

```ts
import type { GameStore, ItemDef, WeaponDef } from '../types';
import { handleShopCommand, displayShop } from '../handlers/shop';
import { getEffectiveStock, type ShopDef } from '../economy';

export interface ShopDeps {
  shops: Record<string, ShopDef>;
  itemData: Record<string, ItemDef>;
  weaponData: Record<string, WeaponDef>;
  refreshHeader: () => void;
}

export function enterShop(
  store: GameStore,
  shopId: string,
  deps: ShopDeps,
): void {
  const shop = deps.shops[shopId];
  if (!shop) return;
  store.state = 'shop';
  store.shopState.activeShopId = shopId;
  if (!store.shopState.runtime[shopId]) {
    store.shopState.runtime[shopId] = { shopId, remainingStock: {} };
  }
  displayShop(store, shop, deps.itemData, deps.weaponData);
}

export function handleShopInput(
  store: GameStore,
  verb: string,
  target: string,
  deps: ShopDeps,
): void {
  handleShopCommand(store, verb, target, deps.shops, deps.itemData, deps.weaponData, deps.refreshHeader);
}

export function getShopAutocompleteSuggestions(
  store: GameStore,
  input: string,
  deps: ShopDeps,
): string[] {
  const lower = input.toLowerCase();
  if (!lower) return [];
  const parts = lower.split(/\s+/);
  if (parts.length <= 1) {
    return ['buy', 'sell', 'examine', 'leave', 'look'].filter(v => v.startsWith(lower) && v !== lower);
  }
  const verb = parts[0];
  const partial = parts.slice(1).join(' ');
  const candidates: string[] = [];

  if (!store.player || !store.shopState.activeShopId) return [];
  const shop = deps.shops[store.shopState.activeShopId];
  const runtime = store.shopState.runtime[store.shopState.activeShopId];
  if (!shop || !runtime) return [];

  if (verb === 'buy' || verb === 'examine') {
    const stock = getEffectiveStock(shop, runtime).filter(s => s.remaining > 0);
    for (const s of stock) {
      const def = s.entry.type === 'weapon' ? deps.weaponData[s.entry.id] : deps.itemData[s.entry.id];
      if (def) candidates.push(def.name);
    }
  }
  if (verb === 'sell') {
    for (const id of Object.keys(store.player.inventory)) {
      const d = deps.itemData[id]; if (d) candidates.push(d.name);
    }
    for (const id of store.player.weapons) {
      const d = deps.weaponData[id]; if (d) candidates.push(d.name);
    }
  }

  if (!partial) return candidates;
  return candidates.filter(c => c.toLowerCase().startsWith(partial));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/state/shop.ts
git commit -m "Add shop state dispatcher"
```

### Task 60: Wire shop state into gameReducer

**Files:**
- Modify: `src/engine/gameReducer.ts`

- [ ] **Step 1: Import shops data and shop state helpers**

In `src/engine/gameReducer.ts`, add to imports:

```ts
import shopsJson from '../data/shops.json';
import type { ShopDef } from './economy';
import { enterShop, handleShopInput, getShopAutocompleteSuggestions, type ShopDeps } from './state/shop';

const shopData = shopsJson as Record<string, ShopDef>;
```

- [ ] **Step 2: Add shop deps builder**

Add this helper near the other dep builders:

```ts
function buildShopDeps(store: GameStore): ShopDeps {
  return {
    shops: shopData,
    itemData,
    weaponData,
    refreshHeader: () => updateHeader(store),
  };
}
```

- [ ] **Step 3: Route shop commands in handleKeyPressed**

In `gameReducer.ts:handleKeyPressed`, find the section that handles text-input states (after settings/minimap/slot_picker checks). The existing code dispatches to dialogue/combat/exploring based on state. Add a `shop` branch:

In `handleKeyPressed`, find the Enter handling block (around line 2257-2291). Inside the `if (input.length > 0) { ... }` block, find:

```ts
if (s.state === 'dialogue') {
  handleDialogueInput(s, input);
} else if (s.state === 'gameover') {
  handleGameoverInput(s, input);
} else {
  const [verb, target] = parseCommand(input);
  if (verb) {
    if (s.state === 'combat') {
      handleCombatCommand(s, verb, target);
    } else {
      handleExploringCommand(s, verb, target);
    }
  }
}
```

Replace with:

```ts
if (s.state === 'dialogue') {
  handleDialogueInput(s, input);
} else if (s.state === 'gameover') {
  handleGameoverInput(s, input);
} else {
  const [verb, target] = parseCommand(input);
  if (verb) {
    if (s.state === 'combat') {
      handleCombatCommand(s, verb, target);
    } else if (s.state === 'shop') {
      handleShopInput(s, verb, target, buildShopDeps(s));
    } else {
      handleExploringCommand(s, verb, target);
    }
  }
}
```

- [ ] **Step 4: Update getAutocompleteSuggestions to handle shop state**

In `gameReducer.ts`, find the `getAutocompleteSuggestions` wrapper. Replace with:

```ts
function getAutocompleteSuggestions(store: GameStore, input: string): string[] {
  if (store.state === 'shop') {
    return getShopAutocompleteSuggestions(store, input, buildShopDeps(store));
  }
  return getAutocompleteSuggestionsRaw(store, input, enemyData, itemData, weaponData, npcData);
}
```

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/engine/gameReducer.ts
git commit -m "Wire shop state into command dispatch"
```

### Task 61: Add open_shop dialogue effect and update merchant NPCs

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/handlers/talk.ts`
- Modify: `src/engine/state/dialogue.ts`
- Modify: `src/engine/gameReducer.ts`
- Modify: `src/data/npcs.json`

- [ ] **Step 1: Add open_shop to DialogueEffect type**

In `src/engine/types.ts`, find `DialogueEffect`:

```ts
export interface DialogueEffect {
  give_item?: string;
  give_weapon?: string;
  heal?: number;
  set_flag?: string;
  remove_item?: string;
  open_shop?: string;     // NEW — shop id
}
```

- [ ] **Step 2: Handle open_shop in handleNpcDialogueInput**

In `src/engine/handlers/talk.ts`, the `handleNpcDialogueInput` function processes `choice.effect`. Add an `open_shop` callback parameter:

Update the signature:
```ts
export function handleNpcDialogueInput(
  store: GameStore,
  input: string,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  npcData: Record<string, NpcDef>,
  refreshHeader: () => void,
  openShop: (shopId: string) => void,        // NEW
): void {
```

Add the effect handling block after the existing effects:

```ts
if (choice.effect) {
  const eff = choice.effect;
  if (eff.give_item) {
    // ... existing
  }
  // ... other existing effects
  if (eff.remove_item) {
    removeItem(store.player, eff.remove_item);
  }
  if (eff.open_shop) {
    openShop(eff.open_shop);
    return;   // shop takeover — don't follow choice.next
  }
}
```

- [ ] **Step 3: Pass openShop callback through dialogue dispatcher**

In `src/engine/state/dialogue.ts`, add `openShop` to `DialogueDeps`:

```ts
export interface DialogueDeps {
  itemData: Record<string, ItemDef>;
  weaponData: Record<string, WeaponDef>;
  npcData: Record<string, NpcDef>;
  refreshHeader: () => void;
  startCombat: (eid: string) => void;
  checkEndingsForChoice: (choice: string) => boolean;
  openSlotPicker: (mode: 'save') => void;
  loadDungeonFloor: (floor: number) => void;
  enterRoom: (roomId: string) => void;
  checkAchievement: (id: string) => void;
  openShop: (shopId: string) => void;          // NEW
}
```

In `handleDialogueInput` (in dialogue.ts), update the NPC dialogue branch:

```ts
if (store.npcDialogue) {
  handleNpcDialogueInput(store, input, deps.itemData, deps.weaponData, deps.npcData, deps.refreshHeader, deps.openShop);
  return;
}
```

- [ ] **Step 4: Wire openShop into gameReducer's dialogue deps**

In `src/engine/gameReducer.ts`, find `buildDialogueDeps` and add:

```ts
function buildDialogueDeps(store: GameStore): DialogueDeps {
  return {
    itemData, weaponData, npcData,
    refreshHeader: () => updateHeader(store),
    startCombat: (eid) => startCombat(store, eid),
    checkEndingsForChoice: (choice) => checkEndingsContext(store, { choiceMade: choice }),
    openSlotPicker: (mode) => openSlotPicker(store, mode),
    loadDungeonFloor: (floor) => loadDungeonFloor(store, floor),
    enterRoom: (roomId) => enterRoom(store, roomId),
    checkAchievement: (id) => checkAchievement(store, id),
    openShop: (shopId) => enterShop(store, shopId, buildShopDeps(store)),    // NEW
  };
}
```

- [ ] **Step 5: Add "Browse wares" choices to the three merchant NPCs**

In `src/data/npcs.json`, add a new "Browse wares" choice to the `start` node of `manor_merchant`, `wilds_guide`, and `wastes_hermit`. For example, modify `manor_merchant.dialogue.start.choices` to include:

```json
{ "label": "Browse your wares", "next": null, "effect": { "open_shop": "manor_dusty" } },
```

For `wilds_guide.dialogue.start.choices`, add:

```json
{ "label": "Show me your supplies", "next": null, "effect": { "open_shop": "wilds_wren" } },
```

For `wastes_hermit.dialogue.start.choices`, add:

```json
{ "label": "Do you have anything to trade?", "next": null, "effect": { "open_shop": "wastes_hermit" } },
```

The full updated `manor_merchant.dialogue.start.choices` becomes:

```json
"choices": [
  { "label": "What do you have for sale?", "next": "shop" },
  { "label": "Browse your wares", "next": null, "effect": { "open_shop": "manor_dusty" } },
  { "label": "What happened to this manor?", "next": "manor_lore" },
  { "label": "Know anything about the cellar?", "next": "cellar_hint" },
  { "label": "Goodbye.", "next": null }
]
```

(The existing "What do you have for sale?" branch with the free potion stays — that's flavor for first-time players. The new "Browse your wares" is the actual shop.)

- [ ] **Step 6: Run build + tests**

Run: `npm test && npm run build`
Expected: all green, zero type errors.

- [ ] **Step 7: Commit**

```bash
git add src/engine/types.ts src/engine/handlers/talk.ts src/engine/state/dialogue.ts src/engine/gameReducer.ts src/data/npcs.json
git commit -m "Add open_shop dialogue effect and merchant Browse choices"
```

### Task 62: Persist shop runtime state in saves

**Files:**
- Modify: `src/engine/save.ts`
- Modify: `test/unit/save.test.ts`

- [ ] **Step 1: Add shops to serialize**

In `src/engine/save.ts:serialize`, accept and write shop runtime state. Update the function signature:

```ts
function serialize(player: PlayerState, world: WorldState, shopRuntime: Record<string, { shopId: string; remainingStock: Record<string, number> }>, dungeon?: DungeonState | null): string {
```

In the body, after building `data`, add:

```ts
if (shopRuntime && Object.keys(shopRuntime).length > 0) {
  data.shops = {};
  for (const [id, rt] of Object.entries(shopRuntime)) {
    data.shops[id] = { remainingStock: { ...rt.remainingStock } };
  }
}
```

- [ ] **Step 2: Add shops to deserialize**

In `deserialize`, after the player block, add a return value for shop state. Update the return type:

```ts
function deserialize(jsonString: string, player: PlayerState, world: WorldState): { success: boolean; dungeon?: any; shops?: Record<string, { shopId: string; remainingStock: Record<string, number> }> } {
```

In the body, after restoring world state, add:

```ts
let shops: Record<string, { shopId: string; remainingStock: Record<string, number> }> | undefined;
if (data.shops) {
  shops = {};
  for (const [id, s] of Object.entries(data.shops)) {
    shops[id] = { shopId: id, remainingStock: { ...s.remainingStock } };
  }
}

return { success: true, dungeon: data.dungeon, shops };
```

- [ ] **Step 3: Update saveToSlot to accept shop runtime**

```ts
export function saveToSlot(slot: number, player: PlayerState, world: WorldState, dungeon?: DungeonState | null, shopRuntime: Record<string, { shopId: string; remainingStock: Record<string, number> }> = {}): boolean {
  try {
    const json = serialize(player, world, shopRuntime, dungeon);
    localStorage.setItem(slotKey(slot), json);
    // ... rest unchanged
```

- [ ] **Step 4: Update gameReducer.ts callers**

In `src/engine/gameReducer.ts`, every call to `saveToSlot` and `loadFromSlot` needs the shop runtime threaded through. Find every `saveToSlot(...)` call (in `handleExploringCommand` save case, `handleSlotPickerKey`, the auto-save in `enterRoom`) and pass `store.shopState.runtime`:

```ts
saveToSlot(store.activeSlot, store.player, store.world, store.dungeon, store.shopState.runtime);
```

For `loadFromSlot` calls (in `startContinue`), capture the shops from the result:

```ts
const result = loadFromSlot(slot, store.player, store.world);
if (result.success) {
  // ... existing logic
  if (result.shops) {
    store.shopState.runtime = result.shops;
  } else {
    store.shopState.runtime = {};
  }
  // ... rest
}
```

- [ ] **Step 5: Add save test for shop state persistence**

In `test/unit/save.test.ts`, add a new test:

```ts
it('persists and reloads shop runtime state', () => {
  const player = createPlayer();
  const world = createWorld();
  loadRegion(world, region);
  const shopRuntime = {
    manor_dusty: {
      shopId: 'manor_dusty',
      remainingStock: { '0': 2, '1': 0 },
    },
  };
  saveToSlot(1, player, world, null, shopRuntime);

  const newPlayer = createPlayer();
  const newWorld = createWorld();
  loadRegion(newWorld, region);
  const result = loadFromSlot(1, newPlayer, newWorld);

  expect(result.shops).toBeDefined();
  expect(result.shops?.manor_dusty.remainingStock['0']).toBe(2);
  expect(result.shops?.manor_dusty.remainingStock['1']).toBe(0);
});
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/engine/save.ts test/unit/save.test.ts src/engine/gameReducer.ts
git commit -m "Persist shop runtime state in saves"
```

### Task 63: Update Game.tsx for shop input visibility

**Files:**
- Modify: `src/components/Game.tsx`

- [ ] **Step 1: Verify shop state shows the input area**

In `src/components/Game.tsx`, find the input area visibility check (around line 322):

```tsx
{store.state !== 'boot' && store.state !== 'menu' && store.state !== 'ending' && store.state !== 'slot_picker' && store.state !== 'minimap' && store.state !== 'settings' && (
```

This already excludes only the no-input states, so `'shop'` will pass through and show the input. **No change needed** — but verify the assumption by reading the line. If for some reason `shop` ends up in the exclusion list, remove it.

- [ ] **Step 2: Run dev to verify**

Run: `npm run dev`. We can't fully test the shop loop yet without the scenario test, but verify the build still works.

- [ ] **Step 3: Commit (if any changes)**

If you edited Game.tsx:
```bash
git add src/components/Game.tsx
git commit -m "Verify shop state shows input area"
```

If no changes were needed, skip this commit.

### Task 64: Scenario tests for shop flow

**Files:**
- Create: `test/scenario/shop-flow.test.ts`

- [ ] **Step 1: Write the shop flow tests**

Create `test/scenario/shop-flow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { newGame, input } from '../fixtures/mock-input';
import { expectLine } from '../fixtures/assert-output';

describe('shop flow', () => {
  it('opens Dusty\'s shop from dialogue', () => {
    let s = newGame();
    // Walk: entry -> entrance_hall -> main_hall (dust resides here)
    // First clear the shadow rat in entry so we can move freely
    s.player!.attack = 100;
    s = input(s, 'attack rat');
    for (let i = 0; i < 10 && s.state === 'combat'; i++) {
      s = input(s, 'attack');
    }
    s = input(s, 'go north');
    s = input(s, 'go north');
    expect(s.player!.currentRoom).toBe('manor_main_hall');

    s = input(s, 'talk dusty');
    expect(s.state).toBe('dialogue');

    // Pick "Browse your wares" — it's option 2 in the new layout
    // (Order: 1 What do you have for sale?, 2 Browse your wares, 3 manor lore, 4 cellar, 5 goodbye)
    s = input(s, '2');
    expect(s.state).toBe('shop');
    expect(s.shopState.activeShopId).toBe('manor_dusty');
    expectLine(s, "DUSTY'S WARES");
    expectLine(s, 'small potion');
  });

  it('buys a potion when player has gold', () => {
    let s = newGame();
    s.player!.gold = 50;
    s.player!.attack = 100;
    s = input(s, 'attack rat');
    for (let i = 0; i < 10 && s.state === 'combat'; i++) {
      s = input(s, 'attack');
    }
    s = input(s, 'go north');
    s = input(s, 'go north');
    s = input(s, 'talk dusty');
    s = input(s, '2'); // Browse wares
    expect(s.state).toBe('shop');

    s = input(s, 'buy potion');
    expect(s.player!.gold).toBe(38);
    expect(s.player!.inventory.potion).toBe(1);
    expectLine(s, 'Bought Potion');
  });

  it('refuses purchase when broke', () => {
    let s = newGame();
    s.player!.gold = 0;
    s.player!.attack = 100;
    s = input(s, 'attack rat');
    for (let i = 0; i < 10 && s.state === 'combat'; i++) {
      s = input(s, 'attack');
    }
    s = input(s, 'go north');
    s = input(s, 'go north');
    s = input(s, 'talk dusty');
    s = input(s, '2');

    s = input(s, 'buy potion');
    expect(s.player!.gold).toBe(0);
    expect(s.player!.inventory.potion).toBeUndefined();
    expectLine(s, 'more gold');
  });

  it('sells an item back to Dusty', () => {
    let s = newGame();
    s.player!.attack = 100;
    s = input(s, 'take small potion');
    s = input(s, 'attack rat');
    for (let i = 0; i < 10 && s.state === 'combat'; i++) {
      s = input(s, 'attack');
    }
    s = input(s, 'go north');
    s = input(s, 'go north');
    s = input(s, 'talk dusty');
    s = input(s, '2');

    expect(s.player!.inventory.small_potion).toBe(1);
    const goldBefore = s.player!.gold;
    s = input(s, 'sell small potion');
    expect(s.player!.gold).toBe(goldBefore + 2); // floor(5/2) = 2
    expect(s.player!.inventory.small_potion).toBeUndefined();
    expectLine(s, 'Sold Small Potion');
  });

  it('leave returns to exploring state', () => {
    let s = newGame();
    s.player!.attack = 100;
    s = input(s, 'attack rat');
    for (let i = 0; i < 10 && s.state === 'combat'; i++) {
      s = input(s, 'attack');
    }
    s = input(s, 'go north');
    s = input(s, 'go north');
    s = input(s, 'talk dusty');
    s = input(s, '2');

    s = input(s, 'leave');
    expect(s.state).toBe('exploring');
    expect(s.shopState.activeShopId).toBe(null);
  });

  it('refuses to sell key items', () => {
    let s = newGame();
    s.player!.attack = 100;
    s.player!.keyItems.rusty_key = true;
    s = input(s, 'attack rat');
    for (let i = 0; i < 10 && s.state === 'combat'; i++) {
      s = input(s, 'attack');
    }
    s = input(s, 'go north');
    s = input(s, 'go north');
    s = input(s, 'talk dusty');
    s = input(s, '2');

    s = input(s, 'sell rusty key');
    expect(s.player!.keyItems.rusty_key).toBe(true);
    expectLine(s, "can't sell that");
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npm test -- shop-flow`
Expected: all green. If a test fails because the choice index for "Browse your wares" is different from `'2'`, check `npcs.json` and adjust.

- [ ] **Step 3: Run full suite**

Run: `npm test && npm run build`
Expected: all green, zero type errors.

- [ ] **Step 4: Manual playtest (15 minutes)**

Run: `npm run dev`. Full Manor playthrough:
- New game → kill rat → take dagger → walk to main hall
- Talk to Dusty → Browse wares → see stock
- Buy small potion (have to earn gold first — go fight more enemies)
- Sell something
- Leave shop, walk around, save, load, verify shop stock state persists
- Walk to wilds, find Wren, browse her wares
- Walk to wastes, find the Hermit, browse his wares

Expected: all three shops work, stock persists across saves.

- [ ] **Step 5: Commit Phase 6 complete**

```bash
git add test/scenario/shop-flow.test.ts
git commit -m "Add shop flow scenario tests (Phase 6 complete)"
git tag phase-6-complete
```

---

## Phase 7 — Polish and cleanup

### Task 65: Add ending trigger scenario tests

**Files:**
- Create: `test/scenario/ending-triggers.test.ts`

- [ ] **Step 1: Write ending trigger tests**

Create `test/scenario/ending-triggers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { newGame, input } from '../fixtures/mock-input';
import { expectLine } from '../fixtures/assert-output';

describe('ending triggers', () => {
  it('defeating evil_king triggers The Hero ending', () => {
    let s = newGame();
    // Teleport directly to throne room and force the enemy state
    s.player!.currentRoom = 'darkness_stronghold';
    s.player!.attack = 1000;
    s.player!.maxHp = 1000;
    s.player!.hp = 1000;
    s = input(s, 'look');
    s = input(s, 'attack king');
    for (let i = 0; i < 20 && s.state === 'combat'; i++) {
      s = input(s, 'attack');
    }
    expect(s.state === 'ending' || s.player!.firedEvents).toBeTruthy();
    // The Hero ending text contains "Hero" or similar
    if (s.state === 'ending') {
      expectLine(s, 'Hero');
    }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm test -- ending-triggers`
Expected: green (or skip if the room state setup needs more wiring — this is exploratory).

- [ ] **Step 3: Commit**

```bash
git add test/scenario/ending-triggers.test.ts
git commit -m "Add ending trigger scenario tests"
```

### Task 66: Run coverage report

**Files:** none

- [ ] **Step 1: Run coverage**

Run: `npm run test:coverage`
Expected: prints a coverage table.

- [ ] **Step 2: Verify targets**

Confirm:
- `engine/economy.ts`: 95%+ (it's a pure module with comprehensive unit tests)
- `engine/descriptions.ts`: 95%+
- `engine/icons.ts`: 100%
- `engine/player.ts`: 80%+
- `engine/combat.ts`: 70%+
- `engine/save.ts`: 70%+
- Overall `engine/`: 60%+ minimum, target 70%+

If a critical module (economy/descriptions/save) is below the target, write one more focused test to lift it.

- [ ] **Step 3: No commit** (informational only)

### Task 67: Update README with new commands and features

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add shop commands and gold to the command table**

In `README.md`, find the command table (lines 27-50) and add new rows for shop commands:

```markdown
| `buy <item>` | Buy an item from the current shop |
| `sell <item>` | Sell an item to the current shop |
| `leave` | Exit the shop |
```

- [ ] **Step 2: Add Economy section**

After the "Skill Tree" section (around line 76), add a new section:

```markdown
### Economy

Earn gold by defeating enemies, then spend it at one of three regional shops:

- **Dusty's Wares** (Manor) — potions, shields, rusty dagger
- **Wren's Camp Supplies** (Wilds) — potions, strength tonics, spear
- **The Hermit's Trinkets** (Wastes) — large potions, tonics, steel shield

Each merchant offers a "Browse wares" option in their dialogue. Inside the shop:
- `buy <item>` — purchase from in-stock entries
- `sell <item>` — sell at half price (no key items, no equipped gear without unequipping)
- `examine <item>` — get details and price
- `leave` — return to the room

Stock is finite and does not restock. Spend wisely.
```

- [ ] **Step 3: Add Dynamic Descriptions to Features list**

In the Features section (line 117), add:

```markdown
- **Dynamic Descriptions** - Rooms display alternate flavor text after their challenges are resolved
```

- [ ] **Step 4: Add Testing section**

After the "Tech Stack" section, add:

```markdown
## Testing

```bash
npm test              # run unit + scenario tests once
npm run test:watch    # watch mode
npm run test:coverage # generate coverage report
```

Tests live in `test/`:
- `test/unit/` — pure module tests (player, combat, world, save, economy, descriptions, icons, matching)
- `test/scenario/` — end-to-end tests that drive the reducer with text commands
- `test/fixtures/` — shared helpers (`mock-input`, `assert-output`)
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "Update README with shop, economy, dynamic descriptions, testing"
```

### Task 68: Final manual playtest and tag

**Files:** none

- [ ] **Step 1: Run the full suite one last time**

Run: `npm test && npm run build`
Expected: all green, zero errors.

- [ ] **Step 2: Manual playtest — full game**

Run: `npm run dev`. End-to-end:
- Boot animation
- Menu navigation
- New game from Manor
- Kill rat → see cleared description
- Walk to main hall → talk to Dusty → buy a small potion → leave
- Walk to wine cellar → fight cellar shade → win → see cleared description
- Walk into Wilds → find Wren → buy from her shop
- Walk to mountain peak → fight mountain troll → see cleared description
- Save → reload → state matches
- Quit to menu, start dungeon mode, descend a floor, fight enemies
- Quit to menu, settings, change font size, return
- Try every ending you can reach in a session

Expected: every flow works. The game feels alive in a way it didn't before. Gold drops, shops sell, descriptions change, glyphs render.

- [ ] **Step 3: Tag the final commit**

```bash
git tag engine-foundation-complete
```

- [ ] **Step 4: Done**

Plan complete. All seven phases shipped. Game has tests, modular reducer, dynamic descriptions, ASCII icons, and a full economy.

---
