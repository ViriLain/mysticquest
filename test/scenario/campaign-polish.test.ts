import { describe, expect, it } from 'vitest';
import { expectLine } from '../fixtures/assert-output';
import { input, newGame } from '../fixtures/mock-input';

describe('campaign polish', () => {
  it('Dusty gives readable cellar preparation guidance', () => {
    let s = newGame();
    s.player!.currentRoom = 'manor_main_hall';

    s = input(s, 'talk dusty');
    expect(s.state).toBe('dialogue');

    s = input(s, '4');

    expectLine(s, 'Shade');
    expectLine(s, 'potions');
  });

  it('Wren hints the hidden mushroom path without spoiling the ending', () => {
    let s = newGame();
    s.player!.currentRoom = 'wilds_clearing';

    s = input(s, 'talk wren');
    expect(s.state).toBe('dialogue');

    s = input(s, '3');

    expectLine(s, 'mushrooms');
  });
});
