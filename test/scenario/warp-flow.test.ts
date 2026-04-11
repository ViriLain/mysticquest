import { describe, expect, it } from 'vitest';
import { newGame, input } from '../fixtures/mock-input';
import { expectLine, expectNoLine } from '../fixtures/assert-output';

describe('warp flow', () => {
  it('lists visited rooms when warp has no target', () => {
    let s = newGame();
    s = input(s, 'warp');
    expectLine(s, 'Warp Destinations');
    expectLine(s, 'Entry');
  });

  it('warps to a visited room and deducts HP', () => {
    let s = newGame();
    s = input(s, 'north');
    s = input(s, 'north');
    expect(s.player!.currentRoom).toBe('manor_main_hall');
    s = input(s, 'south');
    s = input(s, 'south');
    expect(s.player!.currentRoom).toBe('manor_entry');

    const hpBefore = s.player!.hp;
    s = input(s, 'warp entrance hall');
    expect(s.player!.currentRoom).toBe('manor_entrance_hall');
    expect(s.player!.hp).toBe(hpBefore - 2);
    expectLine(s, 'costs 2 HP');
  });

  it('warps to hub rooms for free', () => {
    let s = newGame();
    s = input(s, 'north');
    s = input(s, 'north');
    expect(s.player!.currentRoom).toBe('manor_main_hall');
    s = input(s, 'south');

    const hpBefore = s.player!.hp;
    s = input(s, 'warp main hall');
    expect(s.player!.currentRoom).toBe('manor_main_hall');
    expect(s.player!.hp).toBe(hpBefore);
    expectNoLine(s, 'costs');
  });

  it('blocks warp when HP too low', () => {
    let s = newGame();
    s = input(s, 'north');
    s = input(s, 'south');
    s.player!.hp = 1;
    s = input(s, 'warp entrance hall');
    expect(s.player!.currentRoom).toBe('manor_entry');
    expectLine(s, 'Not enough HP');
  });

  it('shows error for unknown room', () => {
    let s = newGame();
    s = input(s, 'warp nonexistent place');
    expectLine(s, 'Unknown location');
  });

  it('blocks warp in dungeon mode', () => {
    let s = newGame();
    s.gameMode = 'dungeon';
    s = input(s, 'warp main hall');
    expectLine(s, 'not available in the dungeon');
  });
});
