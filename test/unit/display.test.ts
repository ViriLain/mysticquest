import { describe, expect, it } from 'vitest';
import { createInitialStore } from '../../src/engine/gameReducer';
import { createWorld, loadRegion } from '../../src/engine/world';
import manorJson from '../../src/data/regions/manor.json';
import * as C from '../../src/engine/constants';
import { displayRoom } from '../../src/engine/display';
import type { RegionData } from '../../src/engine/types';

describe('displayRoom', () => {
  it('renders room description, contents, and exits', () => {
    const store = createInitialStore();
    const world = createWorld();
    loadRegion(world, manorJson as RegionData);
    world.rooms.manor_entry._ground_loot = ['potion'];
    world.rooms.manor_entry._ground_weapons = ['iron_sword'];
    store.world = world;

    displayRoom(store, 'manor_entry');

    expect(store.typewriterQueue.map(line => line.text)).toEqual([
      '----------------------------------------',
      'Entry',
      '',
      'You are inside the entry room of an old manor. It is reasonably large, with old chairs and a coat rack on the west wall. The walls are upholstered, and an ornate chandelier hangs from the ceiling. A window to the south is the room\'s only source of light.',
      '',
      '[!] A Shadow Rat lurks here.',
      '[*] You see a Small Potion here.',
      '[+] You see a Rusty Dagger here.',
      '[$] You see a Potion on the ground.',
      '[$] You see a Iron Sword on the ground.',
      '',
      '> Exits: north, south',
    ]);
  });

  it('renders an error line for a missing room id', () => {
    const store = createInitialStore();
    store.world = createWorld();

    displayRoom(store, 'missing_room');

    expect(store.typewriterQueue.map(line => line.text)).toEqual(['ERROR: Room not found.']);
  });

  it('uses magic color for magic weapons in a room or on the ground', () => {
    const store = createInitialStore();
    const world = createWorld();
    loadRegion(world, {
      rooms: [
        {
          id: 'grove',
          name: 'Grove',
          region: 'test',
          description: '',
          exits: {},
          weapons: ['hrunting'],
          _ground_weapons: ['tyrfing'],
        },
      ],
    } as RegionData);
    store.world = world;

    displayRoom(store, 'grove');

    const magicLines = store.typewriterQueue.filter(line =>
      line.text.includes('Hrunting') || line.text.includes('Tyrfing'),
    );
    expect(magicLines).toHaveLength(2);
    expect(magicLines.every(line => line.color === C.MAGIC_COLOR)).toBe(true);
  });
});
