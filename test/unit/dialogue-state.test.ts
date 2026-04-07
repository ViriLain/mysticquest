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
    });

    expect(store.state).toBe('exploring');
    expect(started).toEqual([]);
  });
});
