import { describe, expect, it } from 'vitest';
import enemiesJson from '../../src/data/enemies.json';
import itemsJson from '../../src/data/items.json';
import manorJson from '../../src/data/regions/manor.json';
import weaponsJson from '../../src/data/weapons.json';
import * as C from '../../src/engine/constants';
import { createInitialStore } from '../../src/engine/gameReducer';
import { handleAttack } from '../../src/engine/handlers/attack';
import { handleDrop } from '../../src/engine/handlers/drop';
import { handleExamine } from '../../src/engine/handlers/examine';
import { handleSearch } from '../../src/engine/handlers/search';
import { handleTake } from '../../src/engine/handlers/take';
import { handleUse } from '../../src/engine/handlers/use';
import { createPlayer } from '../../src/engine/player';
import type { EnemyDef, ItemDef, RegionData, WeaponDef } from '../../src/engine/types';
import { createWorld, loadRegion } from '../../src/engine/world';

const itemData = itemsJson as Record<string, ItemDef>;
const weaponData = weaponsJson as Record<string, WeaponDef>;
const enemyData = enemiesJson as Record<string, EnemyDef>;

function makeStoryStore() {
  const store = createInitialStore();
  const world = createWorld();
  loadRegion(world, manorJson as RegionData);
  store.world = world;
  store.player = createPlayer();
  return store;
}

describe('action handlers', () => {
  it('take moves a room weapon into inventory and equips it', () => {
    const store = makeStoryStore();

    handleTake(
      store,
      'dagger',
      itemData,
      weaponData,
      () => {},
      () => {
        store.header.weapon = store.player?.equippedWeapon ? weaponData[store.player.equippedWeapon].name : 'Fists';
      },
    );

    expect(store.player?.weapons).toContain('rusty_dagger');
    expect(store.player?.equippedWeapon).toBe('rusty_dagger');
    expect(store.world?.rooms.manor_entry.weapons).toEqual([]);
  });

  it('take with a plural target picks up every matching item', () => {
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
          items: ['red_mushroom', 'grey_mushroom'],
        },
      ],
    } as RegionData);
    store.world = world;
    store.player = createPlayer('grove');

    handleTake(store, 'mushrooms', itemData, weaponData, () => {}, () => {});

    expect(store.player?.keyItems.red_mushroom).toBe(true);
    expect(store.player?.keyItems.grey_mushroom).toBe(true);
    expect(world.rooms.grove.items).toEqual([]);
  });

  it('take with a singular target still disambiguates when there are multiple matches', () => {
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
          items: ['red_mushroom', 'grey_mushroom'],
        },
      ],
    } as RegionData);
    store.world = world;
    store.player = createPlayer('grove');

    handleTake(store, 'mushroom', itemData, weaponData, () => {}, () => {});

    // Neither mushroom picked up — the player was asked to choose.
    expect(store.player?.keyItems.red_mushroom).toBeUndefined();
    expect(store.player?.keyItems.grey_mushroom).toBeUndefined();
    expect(world.rooms.grove.items).toEqual(['red_mushroom', 'grey_mushroom']);
    expect(store.typewriterQueue.map(line => line.text)).toContain('Which item do you want to take?');
  });

  it('drop removes an equipped weapon and clears the header through refreshHeader', () => {
    const store = makeStoryStore();
    store.player!.weapons = ['rusty_dagger'];
    store.player!.equippedWeapon = 'rusty_dagger';
    store.header.weapon = 'Rusty Dagger';

    handleDrop(store, 'dagger', itemData, weaponData, () => {
      store.header.weapon = store.player?.equippedWeapon ? weaponData[store.player.equippedWeapon].name : 'Fists';
    });

    expect(store.player?.weapons).toEqual([]);
    expect(store.player?.equippedWeapon).toBeNull();
    expect(store.header.weapon).toBe('Fists');
    expect(store.world?.rooms.manor_entry._ground_weapons).toEqual(['rusty_dagger']);
  });

  it('examine describes an enemy in the current room', () => {
    const store = makeStoryStore();

    handleExamine(store, 'rat', enemyData, itemData, weaponData);

    const lines = store.typewriterQueue.map(line => line.text);
    expect(lines).toContain('[!] === Shadow Rat ===');
    expect(lines).toContain('HP: 10  ATK: 3  DEF: 1  XP: 8');
  });

  it('examine uses magic color for magic weapons', () => {
    const store = makeStoryStore();
    store.player!.weapons = ['hrunting'];

    handleExamine(store, 'hrunting', enemyData, itemData, weaponData);

    const header = store.typewriterQueue.find(line => line.text.includes('[Magic] Hrunting'));
    const blurb = store.typewriterQueue.find(line => line.text.includes('Magic:'));
    expect(header?.color).toBe(C.MAGIC_COLOR);
    expect(blurb?.color).toBe(C.MAGIC_COLOR);
  });

  it('use equips a weapon and consumes a potion', () => {
    const store = makeStoryStore();
    store.player!.weapons = ['rusty_dagger'];
    store.player!.inventory = { potion: 1 };
    store.player!.hp = 10;

    handleUse(store, 'dagger', itemData, weaponData, () => {
      store.header.weapon = store.player?.equippedWeapon ? weaponData[store.player.equippedWeapon].name : 'Fists';
    }, () => {});
    handleUse(store, 'potion', itemData, weaponData, () => {}, () => {});

    expect(store.player?.equippedWeapon).toBe('rusty_dagger');
    expect(store.header.weapon).toBe('Rusty Dagger');
    expect(store.player?.hp).toBe(30);
    expect(store.player?.inventory.potion).toBeUndefined();
  });

  it('use uses magic color when equipping a magic weapon', () => {
    const store = makeStoryStore();
    store.player!.weapons = ['hrunting'];

    handleUse(store, 'hrunting', itemData, weaponData, () => {}, () => {});

    const line = store.typewriterQueue.find(entry => entry.text === 'You equip the Hrunting.');
    expect(line?.color).toBe(C.MAGIC_COLOR);
  });

  it('use with a plural target uses every matching key item in the room', () => {
    const store = makeStoryStore();
    store.state = 'exploring';
    store.player!.keyItems = {
      red_mushroom: true,
      grey_mushroom: true,
      green_mushroom: true,
      orange_mushroom: true,
    };
    const checked: string[] = [];

    handleUse(store, 'mushrooms', itemData, weaponData, () => {}, itemId => {
      checked.push(itemId);
    });

    const used = store.player!.usedItemsInRoom.manor_entry ?? {};
    expect(used.red_mushroom).toBe(true);
    expect(used.grey_mushroom).toBe(true);
    expect(used.green_mushroom).toBe(true);
    expect(used.orange_mushroom).toBe(true);
    expect(checked).toEqual(['red_mushroom', 'grey_mushroom', 'green_mushroom', 'orange_mushroom']);
  });

  it('use bails out of the plural loop once an ending starts', () => {
    const store = makeStoryStore();
    store.state = 'exploring';
    store.player!.keyItems = { red_mushroom: true, grey_mushroom: true };
    const checked: string[] = [];

    handleUse(store, 'mushrooms', itemData, weaponData, () => {}, itemId => {
      checked.push(itemId);
      // Pretend the first item triggered an ending — state flips away.
      store.state = 'ending';
    });

    // Only the first match should have been processed before the bail.
    expect(checked).toEqual(['red_mushroom']);
    expect(store.player!.usedItemsInRoom.manor_entry?.grey_mushroom).toBeUndefined();
  });

  it('use with a singular target still disambiguates when there are multiple matches', () => {
    const store = makeStoryStore();
    store.player!.keyItems = { red_mushroom: true, grey_mushroom: true };

    handleUse(store, 'mushroom', itemData, weaponData, () => {}, () => {});

    expect(store.player!.usedItemsInRoom.manor_entry).toBeUndefined();
    expect(store.typewriterQueue.map(line => line.text)).toContain('Which item do you want to use?');
  });

  it('search marks the room searched and drops hidden items as ground loot', () => {
    const store = makeStoryStore();

    handleSearch(store, itemData, weaponData);

    expect(store.player?.searchedRooms.manor_entry).toBe(true);
    // The key is revealed, not auto-taken — the player must still `take` it.
    expect(store.player?.keyItems.rusty_key).toBeUndefined();
    expect(store.world?.rooms.manor_entry._ground_loot).toContain('rusty_key');
    expect(store.typewriterQueue.map(line => line.text)).toContain('You find a Rusty Key.');
  });

  it('search drops weapons as ground weapons, not inventory items', () => {
    const store = createInitialStore();
    const world = createWorld();
    loadRegion(world, {
      rooms: [
        {
          id: 'peak',
          name: 'Peak',
          region: 'test',
          description: '',
          exits: {},
          searchable: true,
          search_items: ['tyrfing'],
        },
      ],
    } as RegionData);
    store.world = world;
    store.player = createPlayer('peak');

    handleSearch(store, itemData, weaponData);

    expect(world.rooms.peak._ground_weapons).toContain('tyrfing');
    expect(store.player?.inventory.tyrfing).toBeUndefined();
    expect(store.player?.weapons).not.toContain('tyrfing');
    expect(store.typewriterQueue.map(line => line.text)).toContain('You find a Tyrfing.');
  });

  it('search uses magic color when it finds a magic weapon', () => {
    const store = createInitialStore();
    const world = createWorld();
    loadRegion(world, {
      rooms: [
        {
          id: 'peak',
          name: 'Peak',
          region: 'test',
          description: '',
          exits: {},
          searchable: true,
          search_items: ['tyrfing'],
        },
      ],
    } as RegionData);
    store.world = world;
    store.player = createPlayer('peak');

    handleSearch(store, itemData, weaponData);

    const line = store.typewriterQueue.find(entry => entry.text === 'You find a Tyrfing.');
    expect(line?.color).toBe(C.MAGIC_COLOR);
  });

  it('a searched weapon can be picked up afterwards with take', () => {
    const store = createInitialStore();
    const world = createWorld();
    loadRegion(world, {
      rooms: [
        {
          id: 'peak',
          name: 'Peak',
          region: 'test',
          description: '',
          exits: {},
          searchable: true,
          search_items: ['tyrfing'],
        },
      ],
    } as RegionData);
    store.world = world;
    store.player = createPlayer('peak');

    handleSearch(store, itemData, weaponData);
    handleTake(store, 'tyrfing', itemData, weaponData, () => {}, () => {});

    expect(store.player?.weapons).toContain('tyrfing');
    expect(world.rooms.peak._ground_weapons).not.toContain('tyrfing');
  });

  it('take uses magic color for magic weapon pickup and auto-equip lines', () => {
    const store = createInitialStore();
    const world = createWorld();
    loadRegion(world, {
      rooms: [
        {
          id: 'peak',
          name: 'Peak',
          region: 'test',
          description: '',
          exits: {},
          weapons: ['hrunting'],
        },
      ],
    } as RegionData);
    store.world = world;
    store.player = createPlayer('peak');

    handleTake(store, 'hrunting', itemData, weaponData, () => {}, () => {});

    const lines = store.typewriterQueue.filter(line => line.text.includes('Hrunting'));
    expect(lines).toHaveLength(2);
    expect(lines.every(line => line.color === C.MAGIC_COLOR)).toBe(true);
  });

  it('search reveals secret_exits as dynamic exits and announces them', () => {
    const store = createInitialStore();
    const world = createWorld();
    loadRegion(world, {
      rooms: [
        {
          id: 'test_room',
          name: 'Test Room',
          region: 'test',
          description: '',
          exits: { north: 'other' },
          secret_exits: { down: 'hidden_target' },
          searchable: true,
        },
      ],
    } as RegionData);
    store.world = world;
    store.player = createPlayer('test_room');

    handleSearch(store, itemData, weaponData);

    expect(world.rooms.test_room._dynamic_exits).toEqual({ down: 'hidden_target' });
    expect(store.typewriterQueue.map(line => line.text)).toContain(
      'You find a hidden passage leading down.',
    );
  });

  it('attack resolves an enemy and forwards it to startCombat', () => {
    const store = makeStoryStore();
    const started: string[] = [];

    handleAttack(store, 'rat', enemyData, enemyId => started.push(enemyId));

    expect(started).toEqual(['shadow_rat']);
  });

  it('examine weapon shows class tag', () => {
    const store = makeStoryStore();
    store.player!.weapons = ['iron_sword'];

    handleExamine(store, 'iron sword', enemyData, itemData, weaponData);
    const lines = store.typewriterQueue.map(line => line.text);

    expect(lines.some(l => l.includes('[Blade]'))).toBe(true);
  });

  it('examine weapon shows [Magic] tag and magic class blurb', () => {
    const store = makeStoryStore();
    store.player!.weapons = ['hrunting'];

    handleExamine(store, 'hrunting', enemyData, itemData, weaponData);
    const lines = store.typewriterQueue.map(line => line.text);

    expect(lines.some(l => l.includes('[Magic]'))).toBe(true);
    expect(lines.some(l => l.includes('Magic:') && l.includes('every third strike'))).toBe(true);
  });
});
