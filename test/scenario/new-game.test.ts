import { describe, expect, it } from 'vitest';
import { expectLine } from '../fixtures/assert-output';
import { newGame } from '../fixtures/mock-input';

describe('new game flow', () => {
  it('starts in the manor entry and initializes the header', () => {
    const store = newGame();

    expect(store.state).toBe('exploring');
    expect(store.player?.currentRoom).toBe('manor_entry');
    expect(store.header.title).toBe('MYSTICQUEST v1.0');
    expect(store.header.hp).toBe(30);
    expect(store.header.maxHp).toBe(30);
    expect(store.header.level).toBe(1);
    expect(store.header.weapon).toBe('Fists');
    expectLine(store, 'Welcome to MysticQuest');
    expectLine(store, 'Entry');
    expectLine(store, 'Shadow Rat');
    expectLine(store, 'Small Potion');
    expectLine(store, 'Rusty Dagger');
    expectLine(store, 'Exits:');
    expectLine(store, '[!]');
    expectLine(store, '[*]');
    expectLine(store, '[+]');
    expectLine(store, '> Exits:');
  });
});
