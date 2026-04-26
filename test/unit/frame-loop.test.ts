import { describe, expect, it } from 'vitest';
import { createInitialStore } from '../../src/engine/gameReducer';
import { captureVisualSnapshot, didVisualSnapshotChange, shouldRunReducerTick } from '../../src/engine/frame-loop';

describe('frame-loop helpers', () => {
  it('skips reducer ticks for idle exploring state', () => {
    const store = createInitialStore();
    store.state = 'exploring';
    expect(shouldRunReducerTick(store)).toBe(false);
  });

  it('runs reducer ticks for animated or ticking states', () => {
    const boot = createInitialStore();
    expect(shouldRunReducerTick(boot)).toBe(true);

    const hidden = createInitialStore();
    hidden.state = 'exploring';
    hidden.currentRegion = 'hidden';
    expect(shouldRunReducerTick(hidden)).toBe(true);

    const effectful = createInitialStore();
    effectful.state = 'exploring';
    effectful.effects.active.push({ type: 'flash', duration: 1, elapsed: 0, params: {} });
    expect(shouldRunReducerTick(effectful)).toBe(true);
  });

  it('detects visual changes from snapshots', () => {
    const store = createInitialStore();
    const before = captureVisualSnapshot(store);
    store.lines.push({ text: 'x', color: [1, 1, 1, 1] });
    const after = captureVisualSnapshot(store);
    expect(didVisualSnapshotChange(before, after)).toBe(true);
  });

  // Guard test: every field the snapshot promises to track must actually
  // propagate when the underlying store changes. If you add tick-driven
  // state to GameStore and forget to wire it here, this test fails before
  // the bug makes it into the UI.
  it('covers every snapshot field with a mutation test', () => {
    const baseline = captureVisualSnapshot(createInitialStore());
    const expected: Array<[keyof typeof baseline, (store: ReturnType<typeof createInitialStore>) => void]> = [
      ['state',          s => { s.state = 'menu'; }],
      ['linesLength',    s => { s.lines.push({ text: 'x', color: [1, 1, 1, 1] }); }],
      ['queueLength',    s => { s.typewriterQueue.push({ text: 'x', color: [1, 1, 1, 1] }); }],
      ['input',          s => { s.input = 'hello'; }],
      ['bootIndex',      s => { s.bootIndex = 5; }],
      ['endingLineIndex',s => { s.endingLineIndex = 2; }],
      ['endingAllTyped', s => { s.endingAllTyped = true; }],
      ['gameoverReady',  s => { s.gameoverReady = true; }],
      ['baseColor',      s => { s.baseColor = [0.5, 0.5, 0.5, 1]; }],
      ['headerTitle',    s => { s.header.title = 'X'; }],
      ['headerHp',       s => { s.header.hp = 10; }],
      ['headerMaxHp',    s => { s.header.maxHp = 20; }],
      ['headerLevel',    s => { s.header.level = 3; }],
      ['headerGold',     s => { s.header.gold = 42; }],
      ['headerWeapon',   s => { s.header.weapon = 'Sword'; }],
      ['shake',          s => { s.effects.shake.x = 3; }],
      ['flash',          s => { s.effects.flash.a = 0.5; }],
      ['tint',            s => { s.effects.tint.a = 0.5; }],
      ['glitch',         s => { s.effects.glitch = 0.2; }],
      ['jitter',         s => { s.effects.jitter = 0.2; }],
      ['autosaveFlashing', s => { s.autosaveFlashTime = 1.0; }],
    ];

    // Every key in VisualSnapshot must have a corresponding mutation case.
    // If a new field is added and nobody updates this test, the assertion
    // below fails with a clear message.
    const keys = Object.keys(baseline).sort();
    const covered = expected.map(([k]) => k as string).sort();
    expect(
      covered,
      `frame-loop snapshot fields changed. Covered=${covered.join(',')} Actual=${keys.join(',')}`,
    ).toEqual(keys);

    for (const [field, mutate] of expected) {
      const store = createInitialStore();
      const before = captureVisualSnapshot(store);
      mutate(store);
      const after = captureVisualSnapshot(store);
      expect(
        didVisualSnapshotChange(before, after),
        `mutating ${String(field)} must change the snapshot`,
      ).toBe(true);
    }
  });
});
