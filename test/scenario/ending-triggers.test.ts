import { describe, expect, it } from 'vitest';
import { expectLine } from '../fixtures/assert-output';
import { input, newGame } from '../fixtures/mock-input';

describe('ending triggers', () => {
  it('defeating evil_king triggers The Hero ending', () => {
    let s = newGame();
    s.player!.currentRoom = 'darkness_stronghold';
    s.player!.attack = 1000;
    s.player!.maxHp = 1000;
    s.player!.hp = 1000;

    s = input(s, 'look');
    s = input(s, 'attack king');
    for (let i = 0; i < 20 && s.state === 'combat'; i++) {
      s = input(s, 'attack');
    }

    expect(s.state).toBe('ending');
    expectLine(s, 'The Hero');
  });
});
