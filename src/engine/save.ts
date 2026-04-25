import type { DungeonState, PlayerState, SaveManifest, SaveSlotMeta, ShopRuntimeState, WorldState } from './types';

const MANIFEST_KEY = 'mysticquest_saves_manifest';
const SLOT_KEY_PREFIX = 'mysticquest_save_';
const OLD_SAVE_KEY = 'mysticquest_save';
const NUM_SLOTS = 3;
const MAX_RECORD_KEYS = 1000;
const MAX_LIST_ITEMS = 500;
const MAX_SLOT_NAME_LENGTH = 32;

interface RoomState {
  dead_enemies?: Record<string, boolean>;
  dynamic_exits?: Record<string, string>;
  items?: string[];
  weapons?: string[];
  armor?: string[];
  ground_loot?: string[];
  ground_weapons?: string[];
}

interface SaveData {
  version: number;
  player: {
    hp: number; max_hp: number;
    attack: number; defense: number;
    level: number; xp: number;
    gold?: number;
    current_room: string;
    inventory: Record<string, number>;
    weapons: string[];
    equipped_weapon: string | null;
    equipped_shield: string | null;
    equipped_armor?: string | null;
    equipped_accessory?: string | null;
    key_items: Record<string, boolean>;
    visited_rooms: Record<string, boolean>;
    searched_rooms: Record<string, boolean>;
    fired_events: Record<string, boolean>;
    used_items_in_room: Record<string, Record<string, boolean>>;
    buff_attack: number;
    buff_rounds: number;
    route_history: string[];
    objectives?: Record<string, 'active' | 'complete'>;
    skill_points: number;
    skills: Record<string, boolean>;
  };
  world_state: {
    rooms?: Record<string, RoomState>;
    dead_enemies?: Record<string, Record<string, boolean>>;
  };
  shops?: Record<string, { remainingStock: Record<string, number> }>;
  dungeon?: {
    seed: number;
    floor: number;
    score: { floorsCleared: number; enemiesKilled: number; itemsFound: number; totalXp: number };
    dungeon_perks: string[];
  };
}

type SaveLoadResult = {
  success: boolean;
  dungeon?: SaveData['dungeon'];
  shops?: Record<string, ShopRuntimeState>;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function slotKey(slot: number): string {
  return `${SLOT_KEY_PREFIX}${slot}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function boundedString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.slice(0, 120) : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value.slice(0, 120) : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === 'string').slice(0, MAX_LIST_ITEMS);
}

function booleanRecord(value: unknown): Record<string, boolean> | null {
  if (!isRecord(value)) return null;
  const result: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value).slice(0, MAX_RECORD_KEYS)) {
    if (typeof entry === 'boolean') result[key] = entry;
  }
  return result;
}

function numberRecord(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const result: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value).slice(0, MAX_RECORD_KEYS)) {
    const parsed = finiteNumber(entry);
    if (parsed !== null) result[key] = clamp(Math.floor(parsed), 0, 999);
  }
  return result;
}

function nestedBooleanRecord(value: unknown): Record<string, Record<string, boolean>> | null {
  if (!isRecord(value)) return null;
  const result: Record<string, Record<string, boolean>> = {};
  for (const [key, entry] of Object.entries(value).slice(0, MAX_RECORD_KEYS)) {
    const parsed = booleanRecord(entry);
    if (parsed) result[key] = parsed;
  }
  return result;
}

function objectiveRecord(value: unknown): Record<string, 'active' | 'complete'> | null {
  if (!isRecord(value)) return null;
  const result: Record<string, 'active' | 'complete'> = {};
  for (const [key, entry] of Object.entries(value).slice(0, MAX_RECORD_KEYS)) {
    if (entry === 'active' || entry === 'complete') result[key] = entry;
  }
  return result;
}

function roomStateRecord(value: unknown, world: WorldState): Record<string, RoomState> | null {
  if (!isRecord(value)) return null;
  const result: Record<string, RoomState> = {};
  for (const [roomId, rawRoom] of Object.entries(value).slice(0, MAX_RECORD_KEYS)) {
    if (!world.rooms[roomId] || !isRecord(rawRoom)) continue;
    const roomState: RoomState = {};

    const deadEnemies = booleanRecord(rawRoom.dead_enemies);
    if (deadEnemies && Object.keys(deadEnemies).length > 0) roomState.dead_enemies = deadEnemies;

    if (isRecord(rawRoom.dynamic_exits)) {
      const dynamicExits: Record<string, string> = {};
      for (const [direction, targetRoom] of Object.entries(rawRoom.dynamic_exits).slice(0, MAX_RECORD_KEYS)) {
        if (typeof targetRoom === 'string') dynamicExits[direction] = targetRoom.slice(0, 120);
      }
      if (Object.keys(dynamicExits).length > 0) roomState.dynamic_exits = dynamicExits;
    }

    const items = stringArray(rawRoom.items);
    if (items) roomState.items = items;
    const weapons = stringArray(rawRoom.weapons);
    if (weapons) roomState.weapons = weapons;
    const armor = stringArray(rawRoom.armor);
    if (armor) roomState.armor = armor;
    const groundLoot = stringArray(rawRoom.ground_loot);
    if (groundLoot) roomState.ground_loot = groundLoot;
    const groundWeapons = stringArray(rawRoom.ground_weapons);
    if (groundWeapons) roomState.ground_weapons = groundWeapons;

    result[roomId] = roomState;
  }
  return result;
}

function isDungeonRoomForFloor(roomId: string, floor: number): boolean {
  return roomId.startsWith(`dng_f${floor}_r`) ||
    roomId.startsWith(`dng_f${floor}_b`) ||
    roomId === `dng_rest_${floor}`;
}

function normalizeDungeon(value: unknown): SaveData['dungeon'] | undefined {
  if (!isRecord(value) || !isRecord(value.score)) return undefined;
  const seed = finiteNumber(value.seed);
  const floor = finiteNumber(value.floor);
  const floorsCleared = finiteNumber(value.score.floorsCleared);
  const enemiesKilled = finiteNumber(value.score.enemiesKilled);
  const itemsFound = finiteNumber(value.score.itemsFound);
  const totalXp = finiteNumber(value.score.totalXp);
  const dungeonPerks = stringArray(value.dungeon_perks);
  if (seed === null || floor === null || floorsCleared === null || enemiesKilled === null || itemsFound === null || totalXp === null || !dungeonPerks) {
    return undefined;
  }

  return {
    seed,
    floor: clamp(Math.floor(floor), 1, 999),
    score: {
      floorsCleared: clamp(Math.floor(floorsCleared), 0, 9999),
      enemiesKilled: clamp(Math.floor(enemiesKilled), 0, 999999),
      itemsFound: clamp(Math.floor(itemsFound), 0, 999999),
      totalXp: clamp(Math.floor(totalXp), 0, 9999999),
    },
    dungeon_perks: dungeonPerks,
  };
}

function normalizeSaveData(value: unknown, world: WorldState): SaveData | null {
  if (!isRecord(value)) return null;
  const version = finiteNumber(value.version);
  if (version !== 1 && version !== 2 && version !== 3) return null;
  if (!isRecord(value.player)) return null;
  const dungeon = normalizeDungeon(value.dungeon);

  const p = value.player;
  const hp = finiteNumber(p.hp);
  const maxHp = finiteNumber(p.max_hp);
  const attack = finiteNumber(p.attack);
  const defense = finiteNumber(p.defense);
  const level = finiteNumber(p.level);
  const xp = finiteNumber(p.xp);
  const currentRoom = typeof p.current_room === 'string' ? p.current_room : null;
  const inventory = numberRecord(p.inventory);
  const weapons = stringArray(p.weapons);
  const keyItems = booleanRecord(p.key_items);
  const visitedRooms = booleanRecord(p.visited_rooms);
  const searchedRooms = booleanRecord(p.searched_rooms);
  const firedEvents = booleanRecord(p.fired_events);
  const usedItemsInRoom = nestedBooleanRecord(p.used_items_in_room);
  const buffAttack = finiteNumber(p.buff_attack);
  const buffRounds = finiteNumber(p.buff_rounds);
  const routeHistory = stringArray(p.route_history);
  const skillPoints = finiteNumber(p.skill_points);
  const skills = booleanRecord(p.skills);
  const hasValidCurrentRoom = !!currentRoom && (
    !!world.rooms[currentRoom] ||
    (dungeon !== undefined && isDungeonRoomForFloor(currentRoom, dungeon.floor))
  );

  if (
    hp === null || maxHp === null || attack === null || defense === null || level === null || xp === null ||
    !hasValidCurrentRoom || !inventory || !weapons || !keyItems || !visitedRooms ||
    !searchedRooms || !firedEvents || !usedItemsInRoom || buffAttack === null || buffRounds === null ||
    !routeHistory || skillPoints === null || !skills
  ) {
    return null;
  }

  const worldState = isRecord(value.world_state) ? value.world_state : {};
  let rooms: Record<string, RoomState> | undefined;
  if (worldState.rooms !== undefined) {
    const parsedRooms = roomStateRecord(worldState.rooms, world);
    if (!parsedRooms) return null;
    rooms = parsedRooms;
  }
  let deadEnemies: Record<string, Record<string, boolean>> | undefined;
  if (worldState.dead_enemies !== undefined) {
    const parsedDeadEnemies = nestedBooleanRecord(worldState.dead_enemies);
    if (!parsedDeadEnemies) return null;
    deadEnemies = parsedDeadEnemies;
  }

  let shops: SaveData['shops'];
  if (isRecord(value.shops)) {
    shops = {};
    for (const [shopId, rawShop] of Object.entries(value.shops).slice(0, MAX_RECORD_KEYS)) {
      if (!isRecord(rawShop)) continue;
      const remainingStock = numberRecord(rawShop.remainingStock);
      if (remainingStock) shops[shopId] = { remainingStock };
    }
  }

  return {
    version,
    player: {
      hp: clamp(Math.floor(hp), 0, 9999),
      max_hp: clamp(Math.floor(maxHp), 1, 9999),
      attack: clamp(Math.floor(attack), 0, 999),
      defense: clamp(Math.floor(defense), 0, 999),
      level: clamp(Math.floor(level), 1, 99),
      xp: clamp(Math.floor(xp), 0, 9999999),
      gold: clamp(Math.floor(finiteNumber(p.gold) ?? 0), 0, 9999999),
      current_room: currentRoom,
      inventory,
      weapons,
      equipped_weapon: nullableString(p.equipped_weapon),
      equipped_shield: nullableString(p.equipped_shield),
      equipped_armor: nullableString(p.equipped_armor),
      equipped_accessory: nullableString(p.equipped_accessory),
      key_items: keyItems,
      visited_rooms: visitedRooms,
      searched_rooms: searchedRooms,
      fired_events: firedEvents,
      used_items_in_room: usedItemsInRoom,
      buff_attack: clamp(Math.floor(buffAttack), 0, 999),
      buff_rounds: clamp(Math.floor(buffRounds), 0, 999),
      route_history: routeHistory.filter(roomId => world.rooms[roomId]),
      objectives: objectiveRecord(p.objectives) ?? {},
      skill_points: clamp(Math.floor(skillPoints), 0, 999),
      skills,
    },
    world_state: {
      rooms,
      dead_enemies: deadEnemies,
    },
    shops,
    dungeon,
  };
}

function normalizeManifest(value: unknown): SaveManifest | null {
  if (!isRecord(value) || finiteNumber(value.version) !== 1 || !Array.isArray(value.slots)) return null;
  if (value.slots.length !== NUM_SLOTS) return null;

  const slots: SaveSlotMeta[] = [];
  for (let i = 0; i < NUM_SLOTS; i++) {
    const rawSlot = value.slots[i];
    if (!isRecord(rawSlot)) return null;
    slots.push({
      name: boundedString(rawSlot.name, `Slot ${i + 1}`).slice(0, MAX_SLOT_NAME_LENGTH) || `Slot ${i + 1}`,
      level: clamp(Math.floor(finiteNumber(rawSlot.level) ?? 0), 0, 99),
      currentRoom: boundedString(rawSlot.currentRoom),
      roomName: boundedString(rawSlot.roomName),
      timestamp: clamp(Math.floor(finiteNumber(rawSlot.timestamp) ?? 0), 0, Number.MAX_SAFE_INTEGER),
      isEmpty: typeof rawSlot.isEmpty === 'boolean' ? rawSlot.isEmpty : true,
    });
  }

  return { version: 1, slots };
}

function serialize(
  player: PlayerState,
  world: WorldState,
  shopRuntime: Record<string, ShopRuntimeState>,
  dungeon?: DungeonState | null,
): string {
  const rooms: Record<string, RoomState> = {};
  for (const [roomId, room] of Object.entries(world.rooms)) {
    const rs: RoomState = {};
    let hasData = false;
    if (room._dead_enemies && Object.keys(room._dead_enemies).length > 0) {
      rs.dead_enemies = room._dead_enemies;
      hasData = true;
    }
    if (room._dynamic_exits && Object.keys(room._dynamic_exits).length > 0) {
      rs.dynamic_exits = room._dynamic_exits;
      hasData = true;
    }
    if (room.items) {
      rs.items = [...room.items];
      hasData = true;
    }
    if (room.weapons) {
      rs.weapons = [...room.weapons];
      hasData = true;
    }
    if (room.armor && room.armor.length > 0) {
      rs.armor = [...room.armor];
      hasData = true;
    }
    if (room._ground_loot && room._ground_loot.length > 0) {
      rs.ground_loot = room._ground_loot;
      hasData = true;
    }
    if (room._ground_weapons && room._ground_weapons.length > 0) {
      rs.ground_weapons = room._ground_weapons;
      hasData = true;
    }
    if (hasData) rooms[roomId] = rs;
  }

  const data: SaveData = {
    version: 3,
    player: {
      hp: player.hp, max_hp: player.maxHp,
      attack: player.attack, defense: player.defense,
      level: player.level, xp: player.xp,
      gold: player.gold,
      current_room: player.currentRoom,
      inventory: player.inventory,
      weapons: player.weapons,
      equipped_weapon: player.equippedWeapon,
      equipped_shield: player.equippedShield,
      equipped_armor: player.equippedArmor,
      equipped_accessory: player.equippedAccessory,
      key_items: player.keyItems,
      visited_rooms: player.visitedRooms,
      searched_rooms: player.searchedRooms,
      fired_events: player.firedEvents,
      used_items_in_room: player.usedItemsInRoom,
      buff_attack: player.buffAttack,
      buff_rounds: player.buffRounds,
      route_history: player.routeHistory || [],
      objectives: player.objectives || {},
      skill_points: player.skillPoints,
      skills: player.skills,
    },
    world_state: { rooms },
  };

  if (shopRuntime && Object.keys(shopRuntime).length > 0) {
    data.shops = {};
    for (const [id, runtime] of Object.entries(shopRuntime)) {
      data.shops[id] = { remainingStock: { ...runtime.remainingStock } };
    }
  }

  if (dungeon) {
    data.dungeon = {
      seed: dungeon.seed,
      floor: dungeon.floor,
      score: { ...dungeon.score },
      dungeon_perks: dungeon.dungeonPerks || [],
    };
  }

  return JSON.stringify(data);
}

function deserialize(
  jsonString: string,
  player: PlayerState,
  world: WorldState,
): SaveLoadResult {
  try {
    const data = normalizeSaveData(JSON.parse(jsonString), world);
    if (!data) return { success: false };
    const p = data.player;
    player.hp = p.hp;
    player.maxHp = p.max_hp;
    player.attack = p.attack;
    player.defense = p.defense;
    player.level = p.level;
    player.xp = p.xp;
    player.gold = p.gold ?? 0;
    player.currentRoom = p.current_room;
    player.inventory = p.inventory || {};
    player.weapons = p.weapons || [];
    player.equippedWeapon = p.equipped_weapon;
    player.equippedShield = p.equipped_shield;
    player.equippedArmor = p.equipped_armor ?? null;
    player.equippedAccessory = p.equipped_accessory ?? null;
    player.keyItems = p.key_items || {};
    player.visitedRooms = p.visited_rooms || {};
    player.searchedRooms = p.searched_rooms || {};
    player.firedEvents = p.fired_events || {};
    player.usedItemsInRoom = p.used_items_in_room || {};
    player.buffAttack = p.buff_attack || 0;
    player.buffRounds = p.buff_rounds || 0;
    player.routeHistory = p.route_history || [];
    // v1/v2 saves may have had journal_entries in the blob; ignored on load.
    // v3 has p.objectives.
    player.objectives = (p.objectives as Record<string, 'active' | 'complete'>) || {};
    player.skillPoints = p.skill_points || 0;
    player.skills = p.skills || {};

    // Restore room runtime state
    if (data.world_state?.rooms) {
      for (const [roomId, rs] of Object.entries(data.world_state.rooms)) {
        const room = world.rooms[roomId];
        if (!room) continue;
        if (rs.dead_enemies) room._dead_enemies = rs.dead_enemies;
        if (rs.dynamic_exits) room._dynamic_exits = rs.dynamic_exits;
        if (rs.items) room.items = rs.items;
        if (rs.weapons) room.weapons = rs.weapons;
        if (rs.armor) room.armor = rs.armor;
        if (rs.ground_loot) room._ground_loot = rs.ground_loot;
        if (rs.ground_weapons) room._ground_weapons = rs.ground_weapons;
      }
    }
    // Backwards compat: old saves with world_state.dead_enemies
    if (data.world_state.dead_enemies && !data.world_state.rooms) {
      for (const [roomId, enemies] of Object.entries(data.world_state.dead_enemies)) {
        if (world.rooms[roomId]) {
          world.rooms[roomId]._dead_enemies = enemies;
        }
      }
    }

    let shops: Record<string, ShopRuntimeState> | undefined;
    if (data.shops) {
      shops = {};
      for (const [id, shop] of Object.entries(data.shops)) {
        shops[id] = { shopId: id, remainingStock: { ...shop.remainingStock } };
      }
    }

    return { success: true, dungeon: data.dungeon, shops };
  } catch {
    return { success: false };
  }
}

// ---------------------------------------------------------------------------
// Manifest helpers
// ---------------------------------------------------------------------------

export function createDefaultManifest(): SaveManifest {
  const slots: SaveSlotMeta[] = [];
  for (let i = 0; i < NUM_SLOTS; i++) {
    slots.push({
      name: `Slot ${i + 1}`,
      level: 0,
      currentRoom: '',
      roomName: '',
      timestamp: 0,
      isEmpty: true,
    });
  }
  return { version: 1, slots };
}

export function loadManifest(): SaveManifest {
  const raw = localStorage.getItem(MANIFEST_KEY);
  if (raw) {
    try {
      const manifest = normalizeManifest(JSON.parse(raw));
      if (manifest) return manifest;
    } catch {
      // Corrupt manifest — fall through
    }
  }

  // Migration: check for old single-save key
  const oldSave = localStorage.getItem(OLD_SAVE_KEY);
  if (oldSave) {
    const manifest = createDefaultManifest();
    // Write old save data into slot 1
    localStorage.setItem(slotKey(1), oldSave);

    // Try to extract metadata from the old save
    try {
      const data: SaveData = JSON.parse(oldSave);
      manifest.slots[0].level = data.player.level;
      manifest.slots[0].currentRoom = data.player.current_room;
      manifest.slots[0].roomName = data.player.current_room;
      manifest.slots[0].timestamp = Date.now();
      manifest.slots[0].isEmpty = false;
    } catch {
      // Couldn't parse — mark slot as populated anyway
      manifest.slots[0].isEmpty = false;
      manifest.slots[0].timestamp = Date.now();
    }

    saveManifest(manifest);
    localStorage.removeItem(OLD_SAVE_KEY);
    return manifest;
  }

  // Nothing exists — return default
  return createDefaultManifest();
}

export function saveManifest(manifest: SaveManifest): void {
  localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
}

// ---------------------------------------------------------------------------
// Slot operations
// ---------------------------------------------------------------------------

export function saveToSlot(
  slot: number,
  player: PlayerState,
  world: WorldState,
  dungeon?: DungeonState | null,
  shopRuntime: Record<string, ShopRuntimeState> = {},
): boolean {
  try {
    const json = serialize(player, world, shopRuntime, dungeon);
    localStorage.setItem(slotKey(slot), json);

    // Update manifest metadata
    const manifest = loadManifest();
    const idx = slot - 1;
    if (idx >= 0 && idx < manifest.slots.length) {
      manifest.slots[idx].level = player.level;
      manifest.slots[idx].currentRoom = player.currentRoom;
      manifest.slots[idx].roomName = getRoomDisplayName(player.currentRoom, world);
      manifest.slots[idx].timestamp = Date.now();
      manifest.slots[idx].isEmpty = false;
      // name stays unchanged
    }
    saveManifest(manifest);
    return true;
  } catch {
    return false;
  }
}

export function loadFromSlot(
  slot: number,
  player: PlayerState,
  world: WorldState,
): SaveLoadResult {
  const content = localStorage.getItem(slotKey(slot));
  if (!content) return { success: false };
  return deserialize(content, player, world);
}

export function slotHasData(slot: number): boolean {
  const manifest = loadManifest();
  const idx = slot - 1;
  if (idx < 0 || idx >= manifest.slots.length) return false;
  return !manifest.slots[idx].isEmpty;
}

export function renameSlot(slot: number, name: string): void {
  const manifest = loadManifest();
  const idx = slot - 1;
  if (idx >= 0 && idx < manifest.slots.length) {
    manifest.slots[idx].name = name;
    saveManifest(manifest);
  }
}

export function anySlotHasData(): boolean {
  const manifest = loadManifest();
  return manifest.slots.some(s => !s.isEmpty);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

export function getRoomDisplayName(roomId: string, world: WorldState): string {
  const room = world.rooms[roomId];
  return room?.name || roomId;
}
