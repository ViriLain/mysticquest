import type { GameStore } from './types';

/**
 * Fields the animation loop watches to decide whether to re-render.
 *
 * INVARIANT: every piece of store state that can change inside a reducer
 * TICK and that affects what the user sees MUST appear here. Mutations that
 * only happen inside key/text handlers are fine — those handlers already call
 * forceRender() synchronously, so the snapshot is not consulted.
 *
 * If you add tick-driven state (buff decay on a clock, ambient script events,
 * DoT effects, etc.) you MUST extend this struct AND the assertion in
 * test/unit/frame-loop.test.ts, or the UI will go stale until the next
 * keystroke.
 */
export interface VisualSnapshot {
  state: GameStore['state'];
  linesLength: number;
  queueLength: number;
  input: string;
  bootIndex: number;
  endingLineIndex: number;
  endingAllTyped: boolean;
  gameoverReady: boolean;
  baseColor: string;
  headerTitle: string;
  headerHp: number;
  headerMaxHp: number;
  headerLevel: number;
  headerGold: number;
  headerWeapon: string;
  shake: string;
  flash: string;
  tint: string;
  glitch: number;
  jitter: number;
  autosaveFlashing: boolean;
}

function colorSig(values: number[]): string {
  return values.map(value => value.toFixed(4)).join(',');
}

export function captureVisualSnapshot(store: GameStore): VisualSnapshot {
  return {
    state: store.state,
    linesLength: store.lines.length,
    queueLength: store.typewriterQueue.length,
    input: store.input,
    bootIndex: store.bootIndex,
    endingLineIndex: store.endingLineIndex,
    endingAllTyped: store.endingAllTyped,
    gameoverReady: store.gameoverReady,
    baseColor: colorSig(store.baseColor),
    headerTitle: store.header.title,
    headerHp: store.header.hp,
    headerMaxHp: store.header.maxHp,
    headerLevel: store.header.level,
    headerGold: store.header.gold,
    headerWeapon: store.header.weapon,
    shake: colorSig([store.effects.shake.x, store.effects.shake.y]),
    flash: colorSig([store.effects.flash.r, store.effects.flash.g, store.effects.flash.b, store.effects.flash.a]),
    tint: colorSig([store.effects.tint.r, store.effects.tint.g, store.effects.tint.b, store.effects.tint.a]),
    glitch: store.effects.glitch,
    jitter: store.effects.jitter,
    autosaveFlashing: store.autosaveFlashTime > 0,
  };
}

export function didVisualSnapshotChange(before: VisualSnapshot, after: VisualSnapshot): boolean {
  return Object.keys(before).some(key => before[key as keyof VisualSnapshot] !== after[key as keyof VisualSnapshot]);
}

export function shouldRunReducerTick(store: GameStore): boolean {
  return (
    store.state === 'boot' ||
    store.state === 'ending' ||
    (store.state === 'gameover' && !store.gameoverReady) ||
    (store.state === 'exploring' && store.currentRegion === 'hidden') ||
    store.effects.active.length > 0 ||
    store.autosaveFlashTime > 0 ||
    store.lines.length > 500
  );
}
