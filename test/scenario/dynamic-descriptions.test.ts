import { describe, expect, it } from 'vitest';
import { expectLine } from '../fixtures/assert-output';
import { input, newGame } from '../fixtures/mock-input';

describe('dynamic room descriptions', () => {
  it('manor entry shows default description on first visit', () => {
    const store = newGame();
    expectLine(store, 'old manor');
    expectLine(store, 'Shadow Rat');
  });

  it('manor entry shows cleared description after killing the rat', () => {
    let store = newGame();
    store.player!.attack = 100;
    store = input(store, 'attack rat');
    for (let i = 0; i < 10 && store.state === 'combat'; i++) {
      store = input(store, 'attack');
    }

    expect(store.state).toBe('exploring');
    store = input(store, 'look');
    expectLine(store, 'Shadow Rat is gone');
  });

  it('library dome cleared description fires after finding the ancient map', () => {
    let store = newGame();
    store.player!.attack = 100;
    store = input(store, 'attack rat');
    for (let i = 0; i < 10 && store.state === 'combat'; i++) {
      store = input(store, 'attack');
    }

    store = input(store, 'go north');
    store = input(store, 'go north');
    store = input(store, 'go north');
    store = input(store, 'go west');
    store = input(store, 'go up');

    expect(store.player!.currentRoom).toBe('manor_library_dome');
    expectLine(store, 'glass dome');

    store = input(store, 'search');
    expect(store.player!.keyItems.ancient_map).toBe(true);
    expect(store.player!.firedEvents.took_ancient_map).toBe(true);

    store = input(store, 'look');
    expectLine(store, 'with the Ancient Map in your bag');
  });
});
