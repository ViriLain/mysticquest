import { describe, expect, it } from 'vitest';
import { expectLine } from '../fixtures/assert-output';
import { input, newGame } from '../fixtures/mock-input';

describe('take and use flow', () => {
  it('takes a potion and uses it to restore hp', () => {
    let store = newGame();

    store = input(store, 'take small potion');
    expect(store.player?.inventory.small_potion).toBe(1);
    expectLine(store, 'You pick up the Small Potion.');

    store.player!.hp = 10;
    store = input(store, 'use small potion');

    expect(store.player?.hp).toBe(20);
    expect(store.player?.inventory.small_potion).toBeUndefined();
    expectLine(store, 'You use Small Potion and restore 10 HP.');
  });
});
