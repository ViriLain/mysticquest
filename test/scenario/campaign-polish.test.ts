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

  it('the Hermit gives a concrete Ruins Guardian hint', () => {
    let s = newGame();
    s.player!.currentRoom = 'wastes_village';

    s = input(s, 'ask hermit about ruins guardian');

    expectLine(s, 'cracks');
  });

  it('the Last Keeper connects the Evil King to the crown cycle', () => {
    let s = newGame();
    s.player!.currentRoom = 'wastes_buried_sanctum';

    s = input(s, 'ask keeper about evil king');

    expectLine(s, 'throne');
    expectLine(s, 'crown');
  });

  it('the Last Keeper clearly warns about the dark crown', () => {
    let s = newGame();
    s.player!.currentRoom = 'wastes_buried_sanctum';
    s.player!.keyItems.dark_crown = true;

    s = input(s, 'talk keeper');
    s = input(s, '1');
    s = input(s, '1');

    expectLine(s, 'crown');
    expectLine(s, 'corruption');
  });

  it('the stronghold presents the crown choice when the crown is carried', () => {
    let s = newGame();
    s.player!.currentRoom = 'darkness_evil_dimension';
    s.player!.keyItems.dark_crown = true;

    s = input(s, 'go east');

    expect(s.state).toBe('dialogue');
    expectLine(s, 'The crown pulses with dark energy.');
  });
});
