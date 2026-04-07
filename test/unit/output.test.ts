import { describe, expect, it } from 'vitest';
import { createInitialStore } from '../../src/engine/gameReducer';
import { createPlayer } from '../../src/engine/player';
import { addLine, addLineInstant, applyRegionTint, clearTerminal, emitSound, hideHeader, updateHeader } from '../../src/engine/output';

describe('output helpers', () => {
  it('queues and commits terminal lines', () => {
    const store = createInitialStore();

    addLine(store, 'queued');
    addLineInstant(store, 'instant');

    expect(store.typewriterQueue.map(line => line.text)).toEqual(['queued']);
    expect(store.lines.map(line => line.text)).toEqual(['instant']);
  });

  it('clears terminal buffers and queues sounds', () => {
    const store = createInitialStore();
    addLine(store, 'queued');
    addLineInstant(store, 'instant');
    emitSound(store, 'save');

    clearTerminal(store);

    expect(store.lines).toEqual([]);
    expect(store.typewriterQueue).toEqual([]);
    expect(store.typewriterPos).toBe(0);
    expect(store.soundQueue).toEqual(['save']);
  });

  it('updates and hides the header based on player state', () => {
    const store = createInitialStore();
    const player = createPlayer();
    player.hp = 22;
    player.maxHp = 38;
    player.level = 3;
    player.equippedWeapon = 'rusty_dagger';
    store.player = player;

    updateHeader(store);

    expect(store.header.title).toBe('MYSTICQUEST v1.0');
    expect(store.header.hp).toBe(22);
    expect(store.header.maxHp).toBe(38);
    expect(store.header.level).toBe(3);
    expect(store.header.gold).toBe(0);
    expect(store.header.weapon).toBe('Rusty Dagger');

    hideHeader(store);
    expect(store.header).toEqual({ title: '', hp: 0, maxHp: 0, level: 0, gold: 0, weapon: '' });
  });

  it('applies region tint and tracks the active region', () => {
    const store = createInitialStore();

    applyRegionTint(store, 'manor');
    expect(store.currentRegion).toBe('manor');
    expect(store.effects.tint).toEqual({ r: 0, g: 0.15, b: 0, a: 0.05 });

    applyRegionTint(store);
    expect(store.currentRegion).toBeNull();
    expect(store.effects.tint).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });
});
