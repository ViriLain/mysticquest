import { describe, expect, it } from 'vitest';
import { expectLine } from '../fixtures/assert-output';
import { flushTypewriter, input, newGame, tick } from '../fixtures/mock-input';
import { gameReducer } from '../../src/engine/gameReducer';

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

  it('continues exploring after ending text completes', () => {
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
    for (let i = 0; i < 20 && !s.endingAllTyped; i++) {
      flushTypewriter(s);
      s = tick(s, 0.31);
    }
    flushTypewriter(s);
    expectLine(s, 'Press any key to continue exploring.');

    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Enter' });

    expect(s.state).toBe('exploring');
    expect(s.player?.currentRoom).toBe('darkness_stronghold');
    expect(s.header.title).toBe('MYSTICQUEST v1.0');
    expectLine(s, 'Evil Stronghold');
  });
});
