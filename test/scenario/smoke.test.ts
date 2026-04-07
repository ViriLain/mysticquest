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
