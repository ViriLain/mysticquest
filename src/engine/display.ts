import enemiesJson from '../data/enemies.json';
import itemsJson from '../data/items.json';
import npcsJson from '../data/npcs.json';
import weaponsJson from '../data/weapons.json';
import * as C from './constants';
import { pickDescription } from './descriptions';
import { ICON, iconLine } from './icons';
import { addLine } from './output';
import type { EnemyDef, GameStore, ItemDef, NpcDef, RGBA, WeaponDef } from './types';
import { getExits, getLivingEnemies, getRoom } from './world';

const weaponData = weaponsJson as Record<string, WeaponDef>;
const itemData = itemsJson as Record<string, ItemDef>;
const enemyData = enemiesJson as Record<string, EnemyDef>;
const npcData = npcsJson as Record<string, NpcDef>;

function weaponColor(weapon: WeaponDef, fallback: RGBA = C.ITEM_COLOR): RGBA {
  return weapon.weapon_class === 'magic' ? C.MAGIC_COLOR : fallback;
}

export function displayRoom(store: GameStore, roomId: string): void {
  if (!store.world) return;
  const room = getRoom(store.world, roomId);
  if (!room) {
    addLine(store, 'ERROR: Room not found.', C.ERROR_COLOR);
    return;
  }

  addLine(store, C.SEPARATOR, C.SEPARATOR_COLOR);
  addLine(store, room.name, C.ROOM_NAME_COLOR);
  addLine(store, '');
  addLine(store, store.player ? pickDescription(room, store.player) : room.description);
  addLine(store, '');

  const living = getLivingEnemies(store.world, roomId);
  for (const enemyId of living) {
    const enemy = enemyData[enemyId];
    if (enemy) addLine(store, iconLine(ICON.enemy, `A ${enemy.name} lurks here.`), C.ENEMY_COLOR);
  }

  if (room.items) {
    for (const itemId of room.items) {
      const item = itemData[itemId];
      if (item) addLine(store, iconLine(ICON.item, `You see a ${item.name} here.`), C.ITEM_COLOR);
    }
  }
  if (room.weapons) {
    for (const weaponId of room.weapons) {
      const weapon = weaponData[weaponId];
      if (weapon) addLine(store, iconLine(ICON.weapon, `You see a ${weapon.name} here.`), weaponColor(weapon));
    }
  }
  if (room._ground_loot) {
    for (const itemId of room._ground_loot) {
      const item = itemData[itemId];
      if (item) addLine(store, iconLine(ICON.loot, `You see a ${item.name} on the ground.`), C.LOOT_COLOR);
    }
  }
  if (room._ground_weapons) {
    for (const weaponId of room._ground_weapons) {
      const weapon = weaponData[weaponId];
      if (weapon) addLine(store, iconLine(ICON.loot, `You see a ${weapon.name} on the ground.`), weaponColor(weapon, C.LOOT_COLOR));
    }
  }

  if (room.npcs) {
    for (const npcId of room.npcs) {
      const npc = npcData[npcId];
      if (npc) addLine(store, iconLine(ICON.npc, `${npc.name} is here.`), C.NPC_COLOR);
    }
  }

  const exits = getExits(store.world, roomId);
  const exitList = Object.keys(exits).sort();
  addLine(store, '');
  if (exitList.length > 0) {
    addLine(store, iconLine(ICON.exit, 'Exits: ' + exitList.join(', ')), C.EXITS_COLOR);
  } else {
    addLine(store, 'There are no exits.', C.EXITS_COLOR);
  }
}
