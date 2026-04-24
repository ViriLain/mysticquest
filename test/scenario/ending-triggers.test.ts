import { describe, expect, it } from 'vitest';
import { expectLine } from '../fixtures/assert-output';
import { flushTypewriter, input, newGame, tick } from '../fixtures/mock-input';
import { gameReducer } from '../../src/engine/gameReducer';

function setVisitedPercentReady(s: ReturnType<typeof newGame>): void {
  if (!s.player || !s.world) throw new Error('expected initialized story store');
  const nonHiddenRoomIds = Object.values(s.world.rooms)
    .filter(room => room.region !== 'hidden')
    .map(room => room.id);
  const required = Math.ceil(nonHiddenRoomIds.length * 0.8);
  s.player.visitedRooms = {};
  for (const roomId of nonHiddenRoomIds.slice(0, required)) {
    s.player.visitedRooms[roomId] = true;
  }
}

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

  it('wearing the dark crown at the throne triggers The Usurper ending', () => {
    let s = newGame();
    s.player!.currentRoom = 'darkness_evil_dimension';
    s.player!.keyItems.dark_crown = true;

    s = input(s, 'go east');
    expect(s.state).toBe('dialogue');
    expectLine(s, 'The crown pulses with dark energy.');

    s = input(s, 'use dark crown');

    expect(s.state).toBe('ending');
    expectLine(s, 'The Usurper');
  });

  it('finding the secret ruins exit with enough exploration triggers The Wanderer ending', () => {
    let s = newGame();
    s.player!.currentRoom = 'wastes_wastelands';
    s.player!.keyItems.ancient_map = true;
    setVisitedPercentReady(s);

    s = input(s, 'go east');
    expect(s.state).toBe('exploring');
    expect(s.world!.rooms.wastes_ruins._dynamic_exits?.down).toBe('wanderer_exit');

    s = input(s, 'go down');

    expect(s.state).toBe('ending');
    expectLine(s, 'The Wanderer');
  });

  it('using all four mushrooms in the diner triggers The Enlightened ending', () => {
    let s = newGame();
    s.player!.currentRoom = 'hidden_diner';
    s.player!.keyItems = {
      red_mushroom: true,
      grey_mushroom: true,
      green_mushroom: true,
      orange_mushroom: true,
    };

    s = input(s, 'use mushrooms');

    expect(s.state).toBe('ending');
    expectLine(s, 'The Enlightened');
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
