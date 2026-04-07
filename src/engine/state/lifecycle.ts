import * as C from '../constants';
import { generateFloor } from '../dungeon';
import { clearRegionTint } from '../effects';
import { createPlayer } from '../player';
import { loadFromSlot } from '../save';
import { addLine, applyRegionTint, clearTerminal, updateHeader } from '../output';
import { displayRoom } from '../display';
import { createStoryWorld, createWorld, getRoom } from '../world';
import type { GameStore } from '../types';

export function startMenu(store: GameStore): void {
  store.state = 'menu';
  clearTerminal(store);
  store.baseColor = [...C.BASE_COLOR];
  store.menuSelected = 0;
  store.header = { title: 'MYSTICQUEST v1.0', hp: 0, maxHp: 0, level: 0, gold: 0, weapon: '' };
  clearRegionTint(store.effects);
}

export interface LifecycleDeps {
  enterRoom: (roomId: string) => void;
}

export function startNewGame(store: GameStore, deps: LifecycleDeps): void {
  store.world = createStoryWorld();
  store.player = createPlayer('manor_entry');
  store.combat = null;
  store.combatEnemyId = null;
  store.currentRegion = null;
  store.shopState = { activeShopId: null, runtime: {} };

  clearTerminal(store);
  store.baseColor = [...C.BASE_COLOR];
  store.state = 'exploring';

  updateHeader(store);
  addLine(store, 'Welcome to MysticQuest.');
  addLine(store, '');
  deps.enterRoom(store.player.currentRoom);
}

export function startContinue(store: GameStore, slot: number): void {
  store.world = createStoryWorld();
  store.player = createPlayer('manor_entry');
  store.combat = null;
  store.combatEnemyId = null;
  store.shopState = { activeShopId: null, runtime: {} };

  const result = loadFromSlot(slot, store.player, store.world);
  if (!result.success) {
    addLine(store, 'Failed to load save.', C.ERROR_COLOR);
    return;
  }

  store.activeSlot = slot;
  store.shopState.runtime = result.shops || {};
  store.shopState.activeShopId = null;
  if (result.dungeon) {
    store.gameMode = 'dungeon';
    store.dungeon = {
      seed: result.dungeon.seed,
      floor: result.dungeon.floor,
      score: result.dungeon.score,
      floorEnemies: {},
      dungeonPerks: result.dungeon.dungeon_perks || [],
    };
    // Re-generate the current floor enemies
    const floorResult = generateFloor(store.dungeon.floor, store.dungeon.seed);
    store.dungeon.floorEnemies = floorResult.enemies;
    for (const [id, room] of Object.entries(floorResult.rooms)) {
      store.world.rooms[id] = room;
    }
  } else {
    store.gameMode = 'story';
    store.dungeon = null;
  }
  clearTerminal(store);
  store.baseColor = [...C.BASE_COLOR];
  store.state = 'exploring';
  updateHeader(store);
  addLine(store, 'Save loaded.');
  addLine(store, '');
  displayRoom(store, store.player.currentRoom);
  const room = getRoom(store.world, store.player.currentRoom);
  applyRegionTint(store, room?.region);
}

export function startDungeonMode(store: GameStore, deps: LifecycleDeps, seed?: number): void {
  const actualSeed = seed ?? Date.now();
  store.gameMode = 'dungeon';
  store.player = createPlayer('dng_f1_r1');
  store.world = createWorld();
  store.shopState = { activeShopId: null, runtime: {} };
  store.dungeon = {
    seed: actualSeed,
    floor: 1,
    score: { floorsCleared: 0, enemiesKilled: 0, itemsFound: 0, totalXp: 0 },
    floorEnemies: {},
    dungeonPerks: [],
  };
  store.combat = null;
  store.combatEnemyId = null;
  store.activeSlot = null;

  loadDungeonFloor(store, 1);

  clearTerminal(store);
  store.baseColor = [...C.BASE_COLOR];
  store.state = 'exploring';
  updateHeader(store);
  addLine(store, 'You descend into the dungeon...');
  addLine(store, '');
  deps.enterRoom(store.player.currentRoom);
}

export function loadDungeonFloor(store: GameStore, floor: number): void {
  if (!store.dungeon || !store.world || !store.player) return;
  const result = generateFloor(floor, store.dungeon.seed);
  store.dungeon.floorEnemies = result.enemies;
  for (const [id, room] of Object.entries(result.rooms)) {
    store.world.rooms[id] = room;
  }
  store.player.currentRoom = result.entryRoomId;
}
