import { describe, expect, it } from 'vitest';
import { expectLine } from '../fixtures/assert-output';
import { input, newGame } from '../fixtures/mock-input';

describe('combat flow', () => {
  it('attacks the shadow rat, wins, and drops loot to the ground', () => {
    let store = newGame();
    store.player!.attack = 100;

    store = input(store, 'attack rat');
    expect(store.state).toBe('combat');

    store = input(store, 'attack');

    expect(store.state).toBe('exploring');
    expect(store.player?.xp).toBe(8);
    expect(store.world?.rooms.manor_entry._dead_enemies).toEqual({ shadow_rat: true });
    expect(store.world?.rooms.manor_entry._ground_loot).toEqual(['small_potion']);
    expectLine(store, 'Shadow Rat is defeated!');
    expectLine(store, 'The enemy drops a Small Potion.');

    store = input(store, 'look');
    expectLine(store, '[$]');
  });
});
