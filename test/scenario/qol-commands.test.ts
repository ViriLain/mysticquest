import { describe, expect, it } from 'vitest';
import * as C from '../../src/engine/constants';
import { expectLine } from '../fixtures/assert-output';
import { input, newGame, flushTypewriter } from '../fixtures/mock-input';

describe('quality-of-life commands', () => {
  it('lets the player ask a nearby NPC about a unique item', () => {
    let s = newGame();
    s.player!.currentRoom = 'wilds_clearing';

    s = input(s, 'ask about ancient map');

    expectLine(s, 'Wren taps the Ancient Map.');
  });

  it('lists weapons by damage with magic weapons highlighted', () => {
    let s = newGame();
    s.player!.weapons = ['rusty_dagger', 'hrunting', 'hammer'];
    s.player!.equippedWeapon = 'rusty_dagger';

    s = input(s, 'weapons');
    flushTypewriter(s);

    expectLine(s, '=== Weapons ===');
    const hrunting = s.lines.find(line => line.text.includes('Hrunting'));
    const hammerIndex = s.lines.findIndex(line => line.text.includes('Hammer'));
    const hruntingIndex = s.lines.findIndex(line => line.text.includes('Hrunting'));
    expect(hrunting?.color).toBe(C.MAGIC_COLOR);
    expect(hruntingIndex).toBeLessThan(hammerIndex);
  });
});
