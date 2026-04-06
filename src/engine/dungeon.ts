/**
 * dungeon.ts - Procedural dungeon floor generator for Dungeon Mode.
 *
 * Each floor is deterministically generated from a seed, producing a zigzag
 * chain of rooms with optional branch rooms, scaled enemies, and loot.
 */

import type { RoomDef, EnemyDef } from './types';
import { createRng, rngPick } from './rng';

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

const ROOM_PREFIXES = [
  'Dark', 'Forgotten', 'Crumbling', 'Twisted', 'Shadow',
  'Blighted', 'Cursed', 'Ancient', 'Hollow', 'Burning',
];

const ROOM_SUFFIXES = [
  'Corridor', 'Chamber', 'Hall', 'Passage', 'Vault',
  'Crypt', 'Gallery', 'Tunnel', 'Cavern', 'Cell',
];

const ROOM_DESCRIPTIONS = [
  'The walls drip with moisture. Something scratches in the dark.',
  'Faint torchlight flickers along cracked stone pillars.',
  'Bones litter the floor. The air smells of iron and dust.',
  'A cold draft pushes through from somewhere deeper below.',
  'Cobwebs blanket every surface. Nothing has passed here in ages.',
  'Strange runes glow faintly on the walls, pulsing like a heartbeat.',
  'The ceiling is barely visible above. Echoes carry far too well.',
  'Rubble and broken furniture suggest this room was once occupied.',
];

const ENEMY_PREFIXES = ['Shadow', 'Dark', 'Cursed', 'Fell', 'Twisted'];
const ENEMY_SUFFIXES = ['Wraith', 'Golem', 'Spider', 'Knight', 'Hound', 'Sentinel'];

const BOSS_PREFIXES = ['Greater', 'Infernal', 'Abyssal', 'Dread', 'Ancient'];
const BOSS_SUFFIXES = ['Lord', 'Guardian', 'Behemoth', 'Colossus', 'Archon'];

const WEAPON_PREFIXES = ['Rusted', 'Dark', 'Shadow', 'Flame', 'Frost'];
const WEAPON_SUFFIXES = ['Blade', 'Axe', 'Mace', 'Spear', 'Staff'];

// ---------------------------------------------------------------------------
// Procedural weapon generator
// ---------------------------------------------------------------------------

/**
 * Generate a procedural weapon dropped by bosses.
 * Attack bonus scales with floor depth.
 */
export function generateDungeonWeapon(
  floor: number,
  rng: () => number,
): { id: string; name: string; attack_bonus: number } {
  const prefix = rngPick(rng, WEAPON_PREFIXES);
  const suffix = rngPick(rng, WEAPON_SUFFIXES);
  const name = `${prefix} ${suffix}`;
  const id = `dng_weapon_f${floor}_${prefix.toLowerCase()}_${suffix.toLowerCase()}`;
  const attack_bonus = 2 + floor * 2;
  return { id, name, attack_bonus };
}

// ---------------------------------------------------------------------------
// Floor generator
// ---------------------------------------------------------------------------

export interface FloorResult {
  rooms: Record<string, RoomDef>;
  enemies: Record<string, EnemyDef>;
  entryRoomId: string;
  exitRoomId: string;
  restRoomId: string;
}

/**
 * Generate all rooms, enemies, and loot for a single dungeon floor.
 *
 * The same (seed, floor) pair always produces identical output.
 */
export function generateFloor(floor: number, seed: number): FloorResult {
  const rng = createRng(seed + floor * 1000);

  const rooms: Record<string, RoomDef> = {};
  const enemies: Record<string, EnemyDef> = {};

  // --- 1. Determine room count (5-8) ---
  const roomCount = 5 + (floor % 4);

  // --- 2. Build the linear chain of rooms ---
  const chainIds: string[] = [];
  for (let i = 1; i <= roomCount; i++) {
    const id = `dng_f${floor}_r${i}`;
    chainIds.push(id);

    const prefix = rngPick(rng, ROOM_PREFIXES);
    const suffix = rngPick(rng, ROOM_SUFFIXES);

    rooms[id] = {
      id,
      name: `${prefix} ${suffix}`,
      region: 'dungeon',
      description: rngPick(rng, ROOM_DESCRIPTIONS),
      exits: {},
    };
  }

  // --- 3. Connect rooms in a zigzag pattern ---
  // Odd-indexed connections go south->north, even go east->west.
  for (let i = 0; i < chainIds.length - 1; i++) {
    const curr = chainIds[i];
    const next = chainIds[i + 1];

    if (i % 2 === 0) {
      // Connect south <-> north
      rooms[curr].exits['south'] = next;
      rooms[next].exits['north'] = curr;
    } else {
      // Connect east <-> west
      rooms[curr].exits['east'] = next;
      rooms[next].exits['west'] = curr;
    }
  }

  // --- 4. Branch rooms (dead-end side rooms for extra loot) ---
  let branchIndex = 0;
  for (let i = 1; i < chainIds.length - 1; i++) {
    if (rng() < 0.3) {
      branchIndex++;
      const branchId = `dng_f${floor}_b${branchIndex}`;
      const parentId = chainIds[i];

      // Pick a side direction not already used by the main chain
      const parentExits = rooms[parentId].exits;
      const branchDir = !parentExits['west'] ? 'west' : 'east';
      const returnDir = branchDir === 'west' ? 'east' : 'west';

      rooms[branchId] = {
        id: branchId,
        name: `${rngPick(rng, ROOM_PREFIXES)} ${rngPick(rng, ROOM_SUFFIXES)}`,
        region: 'dungeon',
        description: rngPick(rng, ROOM_DESCRIPTIONS),
        exits: { [returnDir]: parentId },
      };

      rooms[parentId].exits[branchDir] = branchId;
    }
  }

  // --- 5. Place enemies (~60% of rooms, never room 1) ---
  // Base stats that scale with floor depth.
  const baseHp = 10 + floor * 5;
  const baseAttack = 3 + floor * 2;
  const baseDefense = 1 + Math.floor(floor * 0.8);
  const baseXp = 8 + floor * 3;

  // Collect all room IDs (chain + branches) for item placement later.
  const allRoomIds = Object.keys(rooms);
  const roomsWithEnemies = new Set<string>();

  for (let i = 1; i < chainIds.length; i++) {
    const roomId = chainIds[i];
    const isLastRoom = i === chainIds.length - 1;
    const shouldSpawn = isLastRoom || rng() < 0.6;

    if (!shouldSpawn) continue;

    const enemyId = `dng_enemy_f${floor}_r${i + 1}`;

    // Determine boss tier for the last room
    const isFullBoss = isLastRoom && floor % 10 === 0 && floor > 0;
    const isMiniBoss = isLastRoom && !isFullBoss && floor % 5 === 0 && floor > 0;
    const isBoss = isFullBoss || isMiniBoss;

    // Compute multiplier
    let hpMult = 1;
    let atkMult = 1;
    if (isFullBoss) {
      hpMult = 2.5;
      atkMult = 2.5;
    } else if (isMiniBoss) {
      hpMult = 1.5;
      atkMult = 1.5;
    }

    // Pick name from appropriate pool
    const namePrefixes = isBoss ? BOSS_PREFIXES : ENEMY_PREFIXES;
    const nameSuffixes = isBoss ? BOSS_SUFFIXES : ENEMY_SUFFIXES;
    const eName = `${rngPick(rng, namePrefixes)} ${rngPick(rng, nameSuffixes)}`;

    // Determine loot
    let loot: string[] = [];
    let lootWeapon: string | undefined;

    if (isFullBoss) {
      loot = ['large_potion'];
      const weapon = generateDungeonWeapon(floor, rng);
      lootWeapon = weapon.id;
    } else if (isMiniBoss) {
      loot = ['potion'];
    } else {
      // Regular enemy: 30% chance to drop a small_potion
      if (rng() < 0.3) {
        loot = ['small_potion'];
      }
    }

    enemies[enemyId] = {
      name: eName,
      hp: Math.round(baseHp * hpMult),
      attack: Math.round(baseAttack * atkMult),
      defense: baseDefense,
      xp: baseXp,
      loot,
      loot_weapon: lootWeapon,
      region: 'dungeon',
      description: `A creature of the deep dungeon, floor ${floor}.`,
      is_boss: isBoss,
    };

    // Attach enemy to room
    if (!rooms[roomId].enemies) {
      rooms[roomId].enemies = [];
    }
    rooms[roomId].enemies!.push(enemyId);
    roomsWithEnemies.add(roomId);
  }

  // --- 6. Place items in empty rooms ---
  for (const roomId of allRoomIds) {
    // Skip rooms that already have enemies or are the first room
    if (roomsWithEnemies.has(roomId) || roomId === chainIds[0]) continue;

    const roll = rng();
    if (roll < 0.4) {
      // 40% chance: small_potion
      if (!rooms[roomId].items) rooms[roomId].items = [];
      rooms[roomId].items!.push('small_potion');
    } else if (roll < 0.6 && floor >= 5) {
      // 20% chance at floor 5+: strength_tonic
      if (!rooms[roomId].items) rooms[roomId].items = [];
      rooms[roomId].items!.push('strength_tonic');
    }
  }

  // --- 6b. Assign special room types ---
  let libraryPlaced = false;
  for (const roomId of allRoomIds) {
    // Skip entry room, exit room, rest area, and rooms with enemies
    if (roomId === chainIds[0] || roomId === chainIds[chainIds.length - 1]) continue;
    if (roomsWithEnemies.has(roomId)) continue;
    if (roomId.startsWith('dng_rest_')) continue;

    const roll = rng();
    if (roll < 0.15) {
      rooms[roomId].specialType = 'fountain';
      rooms[roomId].name = 'Mystic Fountain';
      rooms[roomId].description = 'A stone fountain stands in the center of the room, glowing with faint arcane energy. The water shimmers with an otherworldly light.';
    } else if (roll < 0.25) {
      rooms[roomId].specialType = 'altar';
      rooms[roomId].name = 'Cursed Altar';
      rooms[roomId].description = 'A dark altar pulses with forbidden power. Strange symbols are carved into its surface, promising strength at a cost.';
    } else if (roll < 0.33 && !libraryPlaced) {
      rooms[roomId].specialType = 'library';
      rooms[roomId].name = 'Ancient Library';
      rooms[roomId].description = 'Towering bookshelves line every wall, filled with ancient tomes. The knowledge here could be valuable.';
      libraryPlaced = true;
    }
  }

  // Treasure vault replaces a branch room if one exists
  const branchRoomIds = allRoomIds.filter(id => id.includes('_b'));
  if (branchRoomIds.length > 0 && rng() < 0.4) {
    const vaultId = rngPick(rng, branchRoomIds);
    if (!rooms[vaultId].specialType) {
      rooms[vaultId].specialType = 'vault';
      rooms[vaultId].name = 'Treasure Vault';
      rooms[vaultId].description = 'A locked vault with ancient mechanisms. The air smells of old gold and dust.';
      if (!rooms[vaultId].items) rooms[vaultId].items = [];
      rooms[vaultId].items!.push('large_potion');
      if (floor >= 5) rooms[vaultId].items!.push('strength_tonic');
      // 20% chance of vault guardian
      if (rng() < 0.2) {
        const guardianId = `dng_vault_guard_f${floor}`;
        enemies[guardianId] = {
          name: 'Vault Guardian',
          hp: Math.round(baseHp * 1.3),
          attack: Math.round(baseAttack * 1.2),
          defense: baseDefense + 2,
          xp: baseXp + 10,
          loot: ['potion'],
          region: 'dungeon',
          description: 'An ancient construct that guards the vault\'s treasures.',
          is_boss: false,
        };
        rooms[vaultId].enemies = [guardianId];
      }
    }
  }

  // --- 7. Create the rest area room ---
  const restRoomId = `dng_rest_${floor}`;
  rooms[restRoomId] = {
    id: restRoomId,
    name: 'Rest Area',
    region: 'dungeon',
    description: 'A quiet space between the dungeon floors. The air is still.',
    exits: { descend: `dng_f${floor + 1}_r1` },
  };

  // --- 8. Last chain room gets a "descend" exit to the rest room ---
  const lastChainId = chainIds[chainIds.length - 1];
  rooms[lastChainId].exits['descend'] = restRoomId;

  // --- 9. Return the complete floor data ---
  const entryRoomId = chainIds[0];
  const exitRoomId = lastChainId;

  return {
    rooms,
    enemies,
    entryRoomId,
    exitRoomId,
    restRoomId,
  };
}
