import { describe, expect, it } from 'vitest';
import { allLines, expectLine } from '../fixtures/assert-output';
import { input, newGame } from '../fixtures/mock-input';

describe('scenario: ASCII art regressions', () => {
  it('shows boss art when combat starts against the Evil King', () => {
    let s = newGame();
    s.player!.currentRoom = 'darkness_stronghold';

    s = input(s, 'attack king');

    expect(s.state).toBe('combat');
    expectLine(s, '/ KING \\');
    expectLine(s, 'A The Evil King attacks!');
  });

  it('shows magic weapon art before the pickup line', () => {
    let s = newGame();
    s.player!.currentRoom = 'wilds_southern_forest';

    s = input(s, 'take hrunting');

    const lines = allLines(s);
    const artIdx = lines.findIndex(line => line.includes('/----\\'));
    const pickupIdx = lines.findIndex(line => line.includes('You pick up the Hrunting.'));

    expect(artIdx).toBeGreaterThan(-1);
    expect(pickupIdx).toBeGreaterThan(-1);
    expect(artIdx).toBeLessThan(pickupIdx);
  });
});
