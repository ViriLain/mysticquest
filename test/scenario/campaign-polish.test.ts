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

  it('Whiskers gives a useful diner mushroom hint', () => {
    let s = newGame();
    s.player!.currentRoom = 'hidden_shroomy_forest';

    s = input(s, 'ask whiskers about diner');

    expectLine(s, 'diner');
    expectLine(s, 'mushrooms');
  });

  it('the diner suggests using the mushrooms there', () => {
    let s = newGame();
    s.player!.currentRoom = 'hidden_diner';

    s = input(s, 'look');

    expectLine(s, 'use');
    expectLine(s, 'mushrooms');
  });

  it('a prepared story player can defeat the Evil King without debug stats', () => {
    let s = newGame();
    s.player!.currentRoom = 'darkness_stronghold';
    s.player!.level = 8;
    s.player!.maxHp = 85;
    s.player!.hp = 85;
    s.player!.attack = 12;
    s.player!.defense = 7;
    s.player!.weapons = ['ragnarok'];
    s.player!.equippedWeapon = 'ragnarok';
    s.player!.inventory.large_potion = 3;
    s.player!.inventory.panacea = 1;
    s.player!.equippedArmor = 'shadow_plate';
    s.player!.skills.iron_will = true;
    s.player!.skills.sharp_eyes = true;
    s.player!.skills.thick_skin = true;

    s = input(s, 'attack king');

    for (let i = 0; i < 40 && s.state === 'combat'; i++) {
      if (s.player!.hp <= 35 && s.player!.inventory.large_potion) {
        s = input(s, 'use large potion');
      } else {
        s = input(s, 'attack');
      }
    }

    expect(s.state).toBe('ending');
    expectLine(s, 'The Hero');
  });
});
