import { describe, expect, it } from 'vitest';
import { gameReducer } from '../../src/engine/gameReducer';
import { input, newGame } from '../fixtures/mock-input';

describe('save and load flow', () => {
  it('saves through the slot picker and restores state through the load flow', () => {
    let store = newGame();

    store = input(store, 'take dagger');
    store = input(store, 'go north');
    expect(store.player?.currentRoom).toBe('manor_entrance_hall');
    expect(store.player?.weapons).toContain('rusty_dagger');

    store = input(store, 'save');
    expect(store.state).toBe('slot_picker');

    store = gameReducer(store, { type: 'KEY_PRESSED', key: 'Enter' });
    expect(store.state).toBe('exploring');
    expect(store.activeSlot).toBe(1);

    store = input(store, 'drop dagger');
    expect(store.player?.weapons).not.toContain('rusty_dagger');
    expect(store.world?.rooms.manor_entrance_hall._ground_weapons).toEqual(['rusty_dagger']);

    store = input(store, 'load');
    expect(store.state).toBe('slot_picker');

    store = gameReducer(store, { type: 'KEY_PRESSED', key: 'Enter' });

    expect(store.state).toBe('exploring');
    expect(store.player?.currentRoom).toBe('manor_entrance_hall');
    expect(store.player?.weapons).toContain('rusty_dagger');
    expect(store.world?.rooms.manor_entrance_hall._ground_weapons).toBeUndefined();
  });
});
