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
    // Drain the typewriter queue between ticks so isTyping() returns false
    // and the boot state machine can advance past the title-display step.
    while (s.typewriterQueue.length > 0) {
      s.lines.push(s.typewriterQueue.shift()!);
    }
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
