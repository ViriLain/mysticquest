import { describe, expect, it } from 'vitest';
import manorJson from '../../src/data/regions/manor.json';
import { createPlayer } from '../../src/engine/player';
import { anySlotHasData, loadFromSlot, loadManifest, saveToSlot } from '../../src/engine/save';
import { generateFloor } from '../../src/engine/dungeon';
import type { RegionData } from '../../src/engine/types';
import { createStoryWorld, createWorld, loadRegion } from '../../src/engine/world';

describe('save round-trip', () => {
  it('falls back to a default manifest when persisted manifest shape is invalid', () => {
    localStorage.setItem('mysticquest_saves_manifest', JSON.stringify({ version: 1, slots: null }));

    const manifest = loadManifest();

    expect(manifest.slots).toHaveLength(3);
    expect(manifest.slots.every(slot => slot.isEmpty)).toBe(true);
    expect(anySlotHasData()).toBe(false);
  });

  it('rejects saves whose essential player fields are invalid', () => {
    const invalidSave = {
      version: 3,
      player: {
        hp: Number.NaN,
        max_hp: 30,
        attack: 5,
        defense: 2,
        level: 1,
        xp: 0,
        gold: 0,
        current_room: 'not_a_room',
        inventory: {},
        weapons: 'not-an-array',
        equipped_weapon: null,
        equipped_shield: null,
        equipped_armor: null,
        equipped_accessory: null,
        key_items: {},
        visited_rooms: {},
        searched_rooms: {},
        fired_events: {},
        used_items_in_room: {},
        buff_attack: 0,
        buff_rounds: 0,
        route_history: [],
        objectives: {},
        skill_points: 0,
        skills: {},
      },
      world_state: { rooms: {} },
    };
    localStorage.setItem('mysticquest_save_1', JSON.stringify(invalidSave));

    const player = createPlayer();
    const world = createWorld();
    loadRegion(world, manorJson as RegionData);
    const result = loadFromSlot(1, player, world);

    expect(result.success).toBe(false);
    expect(player.currentRoom).toBe('manor_entry');
  });

  it('loads dungeon saves before generated dungeon rooms are rebuilt', () => {
    const seed = 42;
    const floor = generateFloor(1, seed);
    const dungeonWorld = createWorld();
    for (const [roomId, room] of Object.entries(floor.rooms)) {
      dungeonWorld.rooms[roomId] = room;
    }
    const player = createPlayer('dng_f1_r1');
    const dungeon = {
      seed,
      floor: 1,
      score: { floorsCleared: 0, enemiesKilled: 0, itemsFound: 0, totalXp: 0 },
      floorEnemies: floor.enemies,
      floorWeapons: floor.weapons,
      floorArmor: floor.armor,
      dungeonPerks: [],
    };

    expect(saveToSlot(1, player, dungeonWorld, dungeon)).toBe(true);

    const loadedPlayer = createPlayer();
    const storyWorld = createStoryWorld();
    const result = loadFromSlot(1, loadedPlayer, storyWorld);

    expect(result.success).toBe(true);
    expect(result.dungeon?.floor).toBe(1);
    expect(loadedPlayer.currentRoom).toBe('dng_f1_r1');
  });

  it('migrates v1 save to v2 with gold defaulted to 0', () => {
    const v1Data = {
      version: 1,
      player: {
        hp: 20, max_hp: 30,
        attack: 5, defense: 2,
        level: 2, xp: 5,
        current_room: 'manor_entry',
        inventory: { potion: 1 },
        weapons: [],
        equipped_weapon: null,
        equipped_shield: null,
        key_items: {},
        visited_rooms: { manor_entry: true },
        searched_rooms: {},
        fired_events: {},
        used_items_in_room: {},
        buff_attack: 0,
        buff_rounds: 0,
        route_history: [],
        journal_entries: [],
        skill_points: 0,
        skills: {},
      },
      world_state: { rooms: {} },
    };
    localStorage.setItem('mysticquest_save_1', JSON.stringify(v1Data));

    const player = createPlayer();
    const world = createWorld();
    loadRegion(world, manorJson as RegionData);
    const result = loadFromSlot(1, player, world);

    expect(result.success).toBe(true);
    expect(player.gold).toBe(0);
    expect(player.level).toBe(2);
    expect(player.inventory.potion).toBe(1);
  });

  it('persists player state, room runtime state, and manifest metadata through a slot save/load cycle', () => {
    const world = createWorld();
    loadRegion(world, manorJson as RegionData);

    const player = createPlayer();
    player.hp = 22;
    player.maxHp = 38;
    player.attack = 7;
    player.defense = 3;
    player.level = 2;
    player.xp = 11;
    player.currentRoom = 'manor_main_hall';
    player.inventory = { potion: 2 };
    player.weapons = ['rusty_dagger'];
    player.equippedWeapon = 'rusty_dagger';
    player.equippedShield = 'iron_shield';
    player.keyItems = { rusty_key: true };
    player.visitedRooms = { manor_entry: true, manor_main_hall: true };
    player.searchedRooms = { manor_entry: true };
    player.firedEvents = { cellar_opened: true };
    player.usedItemsInRoom = { manor_entry: { potion: true } };
    player.buffAttack = 3;
    player.buffRounds = 2;
    player.routeHistory = ['manor_entry', 'manor_main_hall'];
    player.skillPoints = 1;
    player.skills = { iron_will: true };

    world.rooms.manor_entry._dead_enemies = { shadow_rat: true };
    world.rooms.manor_entry._dynamic_exits = { east: 'secret_room' };
    world.rooms.manor_entry._ground_loot = ['potion'];
    world.rooms.manor_entry._ground_weapons = ['iron_sword'];

    expect(anySlotHasData()).toBe(false);
    expect(saveToSlot(1, player, world)).toBe(true);
    expect(anySlotHasData()).toBe(true);

    const manifest = loadManifest();
    expect(manifest.slots[0]?.isEmpty).toBe(false);
    expect(manifest.slots[0]?.level).toBe(2);
    expect(manifest.slots[0]?.currentRoom).toBe('manor_main_hall');
    expect(manifest.slots[0]?.roomName).toBe('Main Hall');

    const loadedWorld = createWorld();
    loadRegion(loadedWorld, manorJson as RegionData);
    const loadedPlayer = createPlayer();

    const result = loadFromSlot(1, loadedPlayer, loadedWorld);

    expect(result.success).toBe(true);
    expect(loadedPlayer.hp).toBe(22);
    expect(loadedPlayer.maxHp).toBe(38);
    expect(loadedPlayer.attack).toBe(7);
    expect(loadedPlayer.defense).toBe(3);
    expect(loadedPlayer.level).toBe(2);
    expect(loadedPlayer.xp).toBe(11);
    expect(loadedPlayer.currentRoom).toBe('manor_main_hall');
    expect(loadedPlayer.inventory).toEqual({ potion: 2 });
    expect(loadedPlayer.weapons).toEqual(['rusty_dagger']);
    expect(loadedPlayer.equippedWeapon).toBe('rusty_dagger');
    expect(loadedPlayer.equippedShield).toBe('iron_shield');
    expect(loadedPlayer.keyItems).toEqual({ rusty_key: true });
    expect(loadedPlayer.visitedRooms).toEqual({ manor_entry: true, manor_main_hall: true });
    expect(loadedPlayer.searchedRooms).toEqual({ manor_entry: true });
    expect(loadedPlayer.firedEvents).toEqual({ cellar_opened: true });
    expect(loadedPlayer.usedItemsInRoom).toEqual({ manor_entry: { potion: true } });
    expect(loadedPlayer.buffAttack).toBe(3);
    expect(loadedPlayer.buffRounds).toBe(2);
    expect(loadedPlayer.routeHistory).toEqual(['manor_entry', 'manor_main_hall']);
    expect(loadedPlayer.skillPoints).toBe(1);
    expect(loadedPlayer.skills).toEqual({ iron_will: true });

    expect(loadedWorld.rooms.manor_entry._dead_enemies).toEqual({ shadow_rat: true });
    expect(loadedWorld.rooms.manor_entry._dynamic_exits).toEqual({ east: 'secret_room' });
    expect(loadedWorld.rooms.manor_entry._ground_loot).toEqual(['potion']);
    expect(loadedWorld.rooms.manor_entry._ground_weapons).toEqual(['iron_sword']);
  });

  it('persists removed room loot through a slot save/load cycle', () => {
    const world = createWorld();
    loadRegion(world, manorJson as RegionData);
    const player = createPlayer();

    world.rooms.manor_entry.weapons = [];

    expect(saveToSlot(1, player, world)).toBe(true);

    const loadedWorld = createWorld();
    loadRegion(loadedWorld, manorJson as RegionData);
    const loadedPlayer = createPlayer();

    const result = loadFromSlot(1, loadedPlayer, loadedWorld);

    expect(result.success).toBe(true);
    expect(loadedWorld.rooms.manor_entry.weapons).toEqual([]);
  });

  it('persists room.armor through save/load cycle', () => {
    const world = createWorld();
    loadRegion(world, manorJson as RegionData);
    const player = createPlayer();

    world.rooms.manor_entry.armor = ['leather_vest'];

    expect(saveToSlot(1, player, world)).toBe(true);

    const loadedWorld = createWorld();
    loadRegion(loadedWorld, manorJson as RegionData);
    const loadedPlayer = createPlayer();

    const result = loadFromSlot(1, loadedPlayer, loadedWorld);

    expect(result.success).toBe(true);
    expect(loadedWorld.rooms.manor_entry.armor).toEqual(['leather_vest']);
  });

  it('saves and reloads gold value', () => {
    const player = createPlayer();
    player.gold = 42;
    const world = createWorld();
    loadRegion(world, manorJson as RegionData);
    saveToSlot(1, player, world);

    const newPlayer = createPlayer();
    const newWorld = createWorld();
    loadRegion(newWorld, manorJson as RegionData);
    loadFromSlot(1, newPlayer, newWorld);

    expect(newPlayer.gold).toBe(42);
  });

  it('persists and reloads shop runtime state', () => {
    const player = createPlayer();
    const world = createWorld();
    loadRegion(world, manorJson as RegionData);
    const shopRuntime = {
      manor_dusty: {
        shopId: 'manor_dusty',
        remainingStock: { '0': 2, '1': 0 },
      },
    };
    saveToSlot(1, player, world, null, shopRuntime);

    const newPlayer = createPlayer();
    const newWorld = createWorld();
    loadRegion(newWorld, manorJson as RegionData);
    const result = loadFromSlot(1, newPlayer, newWorld);

    expect(result.shops).toBeDefined();
    expect(result.shops?.manor_dusty.remainingStock['0']).toBe(2);
    expect(result.shops?.manor_dusty.remainingStock['1']).toBe(0);
  });
});

describe('save migration v2 → v3', () => {
  it('loads a v2 blob into an empty objectives map', () => {
    const v2Blob = JSON.stringify({
      version: 2,
      player: {
        hp: 30, max_hp: 30,
        attack: 5, defense: 2,
        level: 1, xp: 0,
        gold: 0,
        current_room: 'manor_entry',
        inventory: {},
        weapons: [],
        equipped_weapon: null,
        equipped_shield: null,
        key_items: {},
        visited_rooms: { manor_entry: true },
        searched_rooms: {},
        fired_events: {},
        used_items_in_room: {},
        buff_attack: 0,
        buff_rounds: 0,
        route_history: ['manor_entry'],
        journal_entries: [{ type: 'room', text: 'Entered Manor Entry', timestamp: 123 }],
        skill_points: 0,
        skills: {},
      },
      world_state: { rooms: {} },
    });

    // Store the blob where save.ts expects it, then load via the slot API.
    localStorage.setItem('mysticquest_save_1', v2Blob);

    const player = createPlayer();
    const world = createStoryWorld();
    const result = loadFromSlot(1, player, world);

    expect(result.success).toBe(true);
    expect(player.objectives).toEqual({});
    // The old journal_entries are discarded on migration — the field is
    // deleted in Task 12, so don't assert on it here.
  });

  it('round-trips v3 player state with objectives', () => {
    const player = createPlayer();
    player.objectives = { the_diner_mystery: 'active', defeat_evil_king: 'complete' };
    const world = createStoryWorld();
    saveToSlot(1, player, world);

    const loaded = createPlayer();
    const result = loadFromSlot(1, loaded, world);
    expect(result.success).toBe(true);
    expect(loaded.objectives).toEqual({
      the_diner_mystery: 'active',
      defeat_evil_king: 'complete',
    });
  });

  it('loads a save without equipped_armor and equipped_accessory as null', () => {
    const v2Blob = JSON.stringify({
      version: 2,
      player: {
        hp: 30, max_hp: 30,
        attack: 5, defense: 2,
        level: 1, xp: 0,
        gold: 0,
        current_room: 'manor_entry',
        inventory: {},
        weapons: [],
        equipped_weapon: null,
        equipped_shield: null,
        key_items: {},
        visited_rooms: {},
        searched_rooms: {},
        fired_events: {},
        used_items_in_room: {},
        buff_attack: 0,
        buff_rounds: 0,
        route_history: [],
        skill_points: 0,
        skills: {},
      },
      world_state: { rooms: {} },
    });

    localStorage.setItem('mysticquest_save_1', v2Blob);

    const player = createPlayer();
    const world = createStoryWorld();
    const result = loadFromSlot(1, player, world);

    expect(result.success).toBe(true);
    expect(player.equippedArmor).toBeNull();
    expect(player.equippedAccessory).toBeNull();
  });

  it('round-trips equipped armor and accessory', () => {
    const player = createPlayer();
    player.equippedArmor = 'leather_vest';
    player.equippedAccessory = 'keen_eye_ring';
    player.inventory.leather_vest = 1;
    player.inventory.keen_eye_ring = 1;
    const world = createStoryWorld();
    saveToSlot(1, player, world);

    const loaded = createPlayer();
    const result = loadFromSlot(1, loaded, world);
    expect(result.success).toBe(true);
    expect(loaded.equippedArmor).toBe('leather_vest');
    expect(loaded.equippedAccessory).toBe('keen_eye_ring');
  });
});
