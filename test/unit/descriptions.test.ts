import { describe, expect, it } from 'vitest';
import { isRoomCleared, pickDescription } from '../../src/engine/descriptions';
import { createPlayer } from '../../src/engine/player';
import type { RoomDef } from '../../src/engine/types';

function makeRoom(overrides: Partial<RoomDef> = {}): RoomDef {
  return {
    id: 'r',
    name: 'Test',
    region: 'manor',
    description: 'default text',
    exits: {},
    ...overrides,
  };
}

describe('isRoomCleared', () => {
  it('false when no enemies and no flag', () => {
    const player = createPlayer();
    expect(isRoomCleared(makeRoom(), player)).toBe(false);
  });

  it('true when all enemies dead', () => {
    const player = createPlayer();
    const room = makeRoom({ enemies: ['rat', 'ghost'], _dead_enemies: { rat: true, ghost: true } });
    expect(isRoomCleared(room, player)).toBe(true);
  });

  it('false when some enemies still alive', () => {
    const player = createPlayer();
    const room = makeRoom({ enemies: ['rat', 'ghost'], _dead_enemies: { rat: true } });
    expect(isRoomCleared(room, player)).toBe(false);
  });

  it('false when no enemies dead yet', () => {
    const player = createPlayer();
    const room = makeRoom({ enemies: ['rat'] });
    expect(isRoomCleared(room, player)).toBe(false);
  });

  it('true when clear_flag override is set', () => {
    const player = createPlayer();
    player.firedEvents.took_map = true;
    const room = makeRoom({ clear_flag: 'took_map' });
    expect(isRoomCleared(room, player)).toBe(true);
  });

  it('false when clear_flag override not set', () => {
    const player = createPlayer();
    const room = makeRoom({ clear_flag: 'took_map' });
    expect(isRoomCleared(room, player)).toBe(false);
  });

  it('clear_flag override beats enemy state', () => {
    const player = createPlayer();
    const room = makeRoom({
      clear_flag: 'magic',
      enemies: ['rat'],
      _dead_enemies: { rat: true },
    });
    expect(isRoomCleared(room, player)).toBe(false);
  });
});

describe('pickDescription', () => {
  it('returns default when no description_cleared', () => {
    const player = createPlayer();
    const room = makeRoom({ enemies: ['rat'], _dead_enemies: { rat: true } });
    expect(pickDescription(room, player)).toBe('default text');
  });

  it('returns default when not cleared', () => {
    const player = createPlayer();
    const room = makeRoom({
      description_cleared: 'cleared text',
      enemies: ['rat'],
    });
    expect(pickDescription(room, player)).toBe('default text');
  });

  it('returns cleared text when cleared', () => {
    const player = createPlayer();
    const room = makeRoom({
      description_cleared: 'cleared text',
      enemies: ['rat'],
      _dead_enemies: { rat: true },
    });
    expect(pickDescription(room, player)).toBe('cleared text');
  });
});
