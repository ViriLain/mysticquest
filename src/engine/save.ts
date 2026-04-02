import type { PlayerState, WorldState, SaveSlotMeta, SaveManifest, JournalEntry, DungeonState } from './types';

const MANIFEST_KEY = 'mysticquest_saves_manifest';
const SLOT_KEY_PREFIX = 'mysticquest_save_';
const OLD_SAVE_KEY = 'mysticquest_save';
const NUM_SLOTS = 3;

interface RoomState {
  dead_enemies?: Record<string, boolean>;
  dynamic_exits?: Record<string, string>;
  ground_loot?: string[];
  ground_weapons?: string[];
}

interface SaveData {
  version: number;
  player: {
    hp: number; max_hp: number;
    attack: number; defense: number;
    level: number; xp: number;
    current_room: string;
    inventory: Record<string, number>;
    weapons: string[];
    equipped_weapon: string | null;
    equipped_shield: string | null;
    key_items: Record<string, boolean>;
    visited_rooms: Record<string, boolean>;
    searched_rooms: Record<string, boolean>;
    fired_events: Record<string, boolean>;
    used_items_in_room: Record<string, Record<string, boolean>>;
    buff_attack: number;
    buff_rounds: number;
    route_history: string[];
    journal_entries: JournalEntry[];
    skill_points: number;
    skills: Record<string, boolean>;
  };
  world_state: { rooms: Record<string, RoomState> };
  dungeon?: {
    seed: number;
    floor: number;
    score: { floorsCleared: number; enemiesKilled: number; itemsFound: number; totalXp: number };
    dungeon_perks: string[];
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function slotKey(slot: number): string {
  return `${SLOT_KEY_PREFIX}${slot}`;
}

function serialize(player: PlayerState, world: WorldState, dungeon?: DungeonState | null): string {
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
    version: 1,
    player: {
      hp: player.hp, max_hp: player.maxHp,
      attack: player.attack, defense: player.defense,
      level: player.level, xp: player.xp,
      current_room: player.currentRoom,
      inventory: player.inventory,
      weapons: player.weapons,
      equipped_weapon: player.equippedWeapon,
      equipped_shield: player.equippedShield,
      key_items: player.keyItems,
      visited_rooms: player.visitedRooms,
      searched_rooms: player.searchedRooms,
      fired_events: player.firedEvents,
      used_items_in_room: player.usedItemsInRoom,
      buff_attack: player.buffAttack,
      buff_rounds: player.buffRounds,
      route_history: player.routeHistory || [],
      journal_entries: player.journalEntries || [],
      skill_points: player.skillPoints,
      skills: player.skills,
    },
    world_state: { rooms },
  };

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

function deserialize(jsonString: string, player: PlayerState, world: WorldState): { success: boolean; dungeon?: any } {
  try {
    const data: SaveData = JSON.parse(jsonString);
    if (!data || data.version !== 1) return { success: false };
    const p = data.player;
    player.hp = p.hp;
    player.maxHp = p.max_hp;
    player.attack = p.attack;
    player.defense = p.defense;
    player.level = p.level;
    player.xp = p.xp;
    player.currentRoom = p.current_room;
    player.inventory = p.inventory || {};
    player.weapons = p.weapons || [];
    player.equippedWeapon = p.equipped_weapon;
    player.equippedShield = p.equipped_shield;
    player.keyItems = p.key_items || {};
    player.visitedRooms = p.visited_rooms || {};
    player.searchedRooms = p.searched_rooms || {};
    player.firedEvents = p.fired_events || {};
    player.usedItemsInRoom = p.used_items_in_room || {};
    player.buffAttack = p.buff_attack || 0;
    player.buffRounds = p.buff_rounds || 0;
    player.routeHistory = p.route_history || [];
    player.journalEntries = p.journal_entries || [];
    player.skillPoints = p.skill_points || 0;
    player.skills = p.skills || {};

    // Restore room runtime state
    if (data.world_state?.rooms) {
      for (const [roomId, rs] of Object.entries(data.world_state.rooms)) {
        const room = world.rooms[roomId];
        if (!room) continue;
        if (rs.dead_enemies) room._dead_enemies = rs.dead_enemies;
        if (rs.dynamic_exits) room._dynamic_exits = rs.dynamic_exits;
        if (rs.ground_loot) room._ground_loot = rs.ground_loot;
        if (rs.ground_weapons) room._ground_weapons = rs.ground_weapons;
      }
    }
    // Backwards compat: old saves with world_state.dead_enemies
    const ws = data.world_state as any;
    if (ws?.dead_enemies && !ws.rooms) {
      for (const [roomId, enemies] of Object.entries(ws.dead_enemies as Record<string, Record<string, boolean>>)) {
        if (world.rooms[roomId]) {
          world.rooms[roomId]._dead_enemies = enemies;
        }
      }
    }

    return { success: true, dungeon: data.dungeon };
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
      return JSON.parse(raw) as SaveManifest;
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

export function saveToSlot(slot: number, player: PlayerState, world: WorldState, dungeon?: DungeonState | null): boolean {
  try {
    const json = serialize(player, world, dungeon);
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

export function loadFromSlot(slot: number, player: PlayerState, world: WorldState): { success: boolean; dungeon?: any } {
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
