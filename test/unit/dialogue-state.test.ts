import { describe, expect, it } from 'vitest';
import itemsJson from '../../src/data/items.json';
import npcsJson from '../../src/data/npcs.json';
import weaponsJson from '../../src/data/weapons.json';
import { createInitialStore } from '../../src/engine/gameReducer';
import { handleDialogueInput, handleDungeonSpecialRoom } from '../../src/engine/state/dialogue';
import { createPlayer } from '../../src/engine/player';
import type { ItemDef, NpcDef, RoomDef, WeaponDef } from '../../src/engine/types';
import { createWorld } from '../../src/engine/world';

const itemData = itemsJson as Record<string, ItemDef>;
const weaponData = weaponsJson as Record<string, WeaponDef>;
const npcData = npcsJson as Record<string, NpcDef>;

function makeDungeonStore() {
  const store = createInitialStore();
  store.player = createPlayer('dng_test');
  store.world = createWorld();
  store.gameMode = 'dungeon';
  store.dungeon = {
    seed: 1,
    floor: 1,
    score: { floorsCleared: 0, enemiesKilled: 0, itemsFound: 0, totalXp: 0 },
    floorEnemies: {},
    dungeonPerks: [],
  };
  return store;
}

describe('dialogue state', () => {
  it('opens dungeon special room dialogue for a fountain', () => {
    const store = makeDungeonStore();
    const room: RoomDef = {
      id: 'dng_fountain',
      name: 'Fountain',
      region: 'dungeon',
      description: 'A fountain.',
      exits: {},
      specialType: 'fountain',
    };

    handleDungeonSpecialRoom(store, room);

    expect(store.state).toBe('dialogue');
    expect(store.dialogueOptions).toEqual(['Drink from the fountain', 'Leave it alone']);
  });

  it('resolves ending-choice dialogue and starts combat for attack choices', () => {
    const store = createInitialStore();
    store.player = createPlayer();
    store.world = createWorld();
    store.state = 'dialogue';
    store.dialogueOptions = ['Attack', 'Leave'];

    const started: string[] = [];

    handleDialogueInput(store, '1', {
      itemData,
      weaponData,
      npcData,
      refreshHeader: () => {},
      startCombat: enemyId => started.push(enemyId),
      checkEndingsForChoice: () => false,
      openSlotPicker: () => {},
      loadDungeonFloor: () => {},
      enterRoom: () => {},
      checkAchievement: () => {},
      openShop: () => {},
    });

    expect(store.state).toBe('exploring');
    expect(started).toEqual([]);
  });

  // ---- Dungeon special-room outcomes ----------------------------------

  function dungeonDeps() {
    return {
      itemData,
      weaponData,
      npcData,
      refreshHeader: () => {},
      startCombat: () => {},
      checkEndingsForChoice: () => false,
      openSlotPicker: () => {},
      loadDungeonFloor: () => {},
      enterRoom: () => {},
      checkAchievement: () => {},
      openShop: () => {},
    };
  }

  // Build a fountain/altar room AND wire it into world.rooms +
  // player.currentRoom so handleDialogueInput can resolve the special-room
  // path (it looks the room up via getRoom(world, currentRoom)).
  function placeFountain(store: ReturnType<typeof makeDungeonStore>): RoomDef {
    const room: RoomDef = {
      id: 'dng_fountain_1',
      name: 'Fountain',
      region: 'dungeon',
      description: 'x',
      exits: {},
      specialType: 'fountain',
    };
    store.world!.rooms[room.id] = room;
    store.player!.currentRoom = room.id;
    return room;
  }

  function placeAltar(store: ReturnType<typeof makeDungeonStore>): RoomDef {
    const room: RoomDef = {
      id: 'dng_altar_1',
      name: 'Altar',
      region: 'dungeon',
      description: 'x',
      exits: {},
      specialType: 'altar',
    };
    store.world!.rooms[room.id] = room;
    store.player!.currentRoom = room.id;
    return room;
  }

  it('fountain: Drink heals when the random roll lands in the heal range', () => {
    const store = makeDungeonStore();
    const room = placeFountain(store);
    store.player!.maxHp = 100;
    store.player!.hp = 50;
    handleDungeonSpecialRoom(store, room);
    expect(store.state).toBe('dialogue');

    // Force the heal branch (Math.random() < 0.7).
    const original = Math.random;
    Math.random = () => 0.1;
    try {
      handleDialogueInput(store, '1', dungeonDeps());
    } finally {
      Math.random = original;
    }

    expect(store.player!.hp).toBeGreaterThan(50);
    expect(store.state).toBe('exploring');
    expect(store.player!.firedEvents['used_fountain_dng_fountain_1']).toBe(true);
  });

  it('fountain: Drink poisons when the random roll lands in the poison range', () => {
    const store = makeDungeonStore();
    const room = placeFountain(store);
    store.player!.maxHp = 100;
    store.player!.hp = 100;
    handleDungeonSpecialRoom(store, room);

    const original = Math.random;
    Math.random = () => 0.95; // > 0.7 → poison branch
    try {
      handleDialogueInput(store, '1', dungeonDeps());
    } finally {
      Math.random = original;
    }

    expect(store.player!.hp).toBeLessThan(100);
    expect(store.state).toBe('exploring');
  });

  it('fountain: Leave does nothing to HP and still marks the room used', () => {
    const store = makeDungeonStore();
    const room = placeFountain(store);
    store.player!.maxHp = 100;
    store.player!.hp = 75;
    handleDungeonSpecialRoom(store, room);

    handleDialogueInput(store, '2', dungeonDeps());

    expect(store.player!.hp).toBe(75);
    expect(store.state).toBe('exploring');
    expect(store.player!.firedEvents['used_fountain_dng_fountain_1']).toBe(true);
  });

  it('altar: Embrace darkness applies +5 ATK / -3 DEF permanently', () => {
    const store = makeDungeonStore();
    const room = placeAltar(store);
    store.player!.attack = 10;
    store.player!.defense = 5;
    store.player!.buffAttack = 0;
    handleDungeonSpecialRoom(store, room);

    handleDialogueInput(store, '1', dungeonDeps());

    expect(store.player!.buffAttack).toBe(5);
    expect(store.player!.defense).toBe(2); // 5 - 3
    expect(store.state).toBe('exploring');
  });

  it('altar: Resist heals 10 HP without modifying attack/defense', () => {
    const store = makeDungeonStore();
    const room = placeAltar(store);
    store.player!.maxHp = 100;
    store.player!.hp = 50;
    store.player!.attack = 10;
    store.player!.defense = 5;
    handleDungeonSpecialRoom(store, room);

    handleDialogueInput(store, '2', dungeonDeps());

    expect(store.player!.hp).toBe(60);
    expect(store.player!.attack).toBe(10);
    expect(store.player!.defense).toBe(5);
    expect(store.state).toBe('exploring');
  });

  it('special rooms only trigger once: re-entering after use is a no-op', () => {
    const store = makeDungeonStore();
    const room = placeFountain(store);
    store.player!.firedEvents['used_fountain_dng_fountain_1'] = true;

    handleDungeonSpecialRoom(store, room);

    // Already used — no dialogue should open.
    expect(store.state).not.toBe('dialogue');
  });
});
