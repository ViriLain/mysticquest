import { describe, expect, it } from 'vitest';
import {
  computeMinimapLayout,
  pickMinimapLabels,
  type MinimapLayout,
} from '../../src/engine/minimap';
import type { PlayerState, RoomDef, WorldState } from '../../src/engine/types';

const layout: MinimapLayout = {
  positions: {
    current: { roomId: 'current', name: 'Current Room', region: 'manor', x: 0, y: 0 },
    east: { roomId: 'east', name: 'Very Long East Room', region: 'manor', x: 1, y: 0 },
    west: { roomId: 'west', name: 'Very Long West Room', region: 'manor', x: -1, y: 0 },
  },
  edges: [],
  unexploredExits: [],
  bounds: { minX: -1, maxX: 1, minY: 0, maxY: 0 },
};

function makeRoom(
  id: string,
  region: string,
  exits: Record<string, string>,
): RoomDef {
  return { id, name: id, region, description: '', exits };
}

function makeWorld(rooms: RoomDef[]): WorldState {
  const world: WorldState = { rooms: {}, regions: {} };
  for (const room of rooms) {
    world.rooms[room.id] = room;
    if (!world.regions[room.region]) world.regions[room.region] = [];
    world.regions[room.region].push(room.id);
  }
  return world;
}

function makePlayer(currentRoom: string, visited: string[]): PlayerState {
  const visitedRooms: Record<string, boolean> = {};
  for (const id of visited) visitedRooms[id] = true;
  return {
    hp: 10, maxHp: 10, attack: 1, defense: 0, level: 1, xp: 0, gold: 0,
    currentRoom,
    inventory: {}, weapons: [], equippedWeapon: null, equippedShield: null,
    keyItems: {}, visitedRooms, searchedRooms: {}, firedEvents: {},
    usedItemsInRoom: {}, defending: false, buffAttack: 0, buffRounds: 0,
    routeHistory: [], journalEntries: [], skillPoints: 0, skills: {},
  };
}

describe('pickMinimapLabels', () => {
  it('always includes the current room label', () => {
    const labels = pickMinimapLabels(layout, 'current', roomName => roomName.length * 6, 7);
    expect(labels.some(label => label.roomId === 'current')).toBe(true);
  });

  it('stagger labels so nearby rooms do not overlap', () => {
    const labels = pickMinimapLabels(layout, 'current', roomName => roomName.length * 6, 7);
    expect(labels.length).toBe(3);

    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i];
        const b = labels[j];
        const overlaps =
          a.x < b.x + b.w &&
          a.x + a.w > b.x &&
          a.y < b.y + b.h &&
          a.y + a.h > b.y;
        expect(overlaps).toBe(false);
      }
    }
  });
});

describe('computeMinimapLayout', () => {
  it('places neighbors using their exit direction offsets', () => {
    const world = makeWorld([
      makeRoom('wilds_mountains', 'wilds', { west: 'darkness_abyss' }),
      makeRoom('darkness_abyss', 'darkness', {
        east: 'wilds_mountains',
        north: 'darkness_shadowlands',
      }),
      makeRoom('darkness_shadowlands', 'darkness', { south: 'darkness_abyss' }),
    ]);
    const player = makePlayer('wilds_mountains', [
      'wilds_mountains',
      'darkness_abyss',
      'darkness_shadowlands',
    ]);

    const result = computeMinimapLayout(world, player);

    const mountains = result.positions.wilds_mountains;
    const abyss = result.positions.darkness_abyss;
    const shadowlands = result.positions.darkness_shadowlands;

    expect(abyss.x).toBe(mountains.x - 1);
    expect(abyss.y).toBe(mountains.y);
    expect(shadowlands.x).toBe(abyss.x);
    expect(shadowlands.y).toBe(abyss.y - 1);
  });

  it('records unexplored exits for visited rooms with unvisited neighbors', () => {
    const world = makeWorld([
      makeRoom('a', 'manor', { north: 'b', east: 'c', west: 'd' }),
      makeRoom('b', 'manor', { south: 'a' }),
      makeRoom('c', 'manor', { west: 'a' }),
      makeRoom('d', 'manor', { east: 'a' }),
    ]);
    const player = makePlayer('a', ['a', 'b']);

    const result = computeMinimapLayout(world, player);

    const stubs = result.unexploredExits.filter(s => s.fromRoomId === 'a');
    const directions = stubs.map(s => s.direction).sort();
    expect(directions).toEqual(['east', 'west']);

    const east = stubs.find(s => s.direction === 'east')!;
    expect(east.dx).toBe(1);
    expect(east.dy).toBe(0);
  });

  it('omits secret exits from unexplored stubs to preserve hidden paths', () => {
    const world = makeWorld([
      makeRoom('clearing', 'wilds', {
        north: 'visible_room',
        secret_south: 'hidden_room',
      }),
      makeRoom('visible_room', 'wilds', { south: 'clearing' }),
      makeRoom('hidden_room', 'hidden', { north: 'clearing' }),
    ]);
    const player = makePlayer('clearing', ['clearing']);

    const result = computeMinimapLayout(world, player);

    expect(result.unexploredExits.some(s => s.direction === 'secret_south')).toBe(false);
    expect(result.unexploredExits.some(s => s.direction === 'north')).toBe(true);
  });

  it('does not record stubs for rooms whose target has already been visited', () => {
    const world = makeWorld([
      makeRoom('a', 'manor', { north: 'b' }),
      makeRoom('b', 'manor', { south: 'a' }),
    ]);
    const player = makePlayer('a', ['a', 'b']);

    const result = computeMinimapLayout(world, player);

    expect(result.unexploredExits).toHaveLength(0);
  });
});
