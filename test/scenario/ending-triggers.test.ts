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

  it('choosing the dark crown at the throne triggers The Usurper ending', () => {
    let s = newGame();
    s.player!.currentRoom = 'darkness_evil_dimension';
    s.player!.keyItems.dark_crown = true;

    s = input(s, 'go east');

    expect(s.state).toBe('dialogue');
    expectLine(s, 'The crown pulses with dark energy.');

    s = input(s, '2');

    expect(s.state).toBe('ending');
    expectLine(s, 'The Usurper');
  });

  it('taking the Ancient Map exit at 80 percent exploration triggers The Wanderer ending', () => {
    let s = newGame();
    const nonHiddenRooms = Object.values(s.world!.rooms)
      .filter(room => room.region !== 'hidden')
      .map(room => room.id);
    const needed = Math.ceil(nonHiddenRooms.length * 0.8);

    for (const roomId of nonHiddenRooms.slice(0, needed)) {
      s.player!.visitedRooms[roomId] = true;
    }
    s.player!.keyItems.ancient_map = true;
    s.player!.currentRoom = 'wastes_wastelands';

    s = input(s, 'go east');

    expect(s.player!.currentRoom).toBe('wastes_ruins');
    expect(s.world!.rooms.wastes_ruins._dynamic_exits?.down).toBe('wanderer_exit');

    s = input(s, 'go down');

    expect(s.state).toBe('ending');
    expectLine(s, 'The Wanderer');
  });

  it('using all four mushrooms in the diner triggers The Enlightened ending', () => {
    let s = newGame();
    s.player!.currentRoom = 'hidden_diner';
    s.player!.keyItems.red_mushroom = true;
    s.player!.keyItems.grey_mushroom = true;
    s.player!.keyItems.green_mushroom = true;
    s.player!.keyItems.orange_mushroom = true;

    s = input(s, 'use mushrooms');

    expect(s.state).toBe('ending');
    expectLine(s, 'The Enlightened');
  });
});
