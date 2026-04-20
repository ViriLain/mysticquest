import type { AccessoryDef, ArmorDef, EnemyDef, GameStore, ItemDef, NpcDef, WeaponDef } from '../types';
import { handleAttack } from '../handlers/attack';
import { handleAsk } from '../handlers/ask';
import { handleDrop } from '../handlers/drop';
import { handleExamine } from '../handlers/examine';
import { handleHelp } from '../handlers/help';
import { handleLook } from '../handlers/look';
import { showAchievements, showInventory, showJournal, showStats, showWeapons } from '../handlers/info';
import { displaySkillTree } from './skill-tree';
import { handleLearn } from '../handlers/meta';
import { handleSearch } from '../handlers/search';
import { handleWarp } from '../handlers/warp';
import { handleTake } from '../handlers/take';
import { handleTalk } from '../handlers/talk';
import { handleUse } from '../handlers/use';
import { SKILL_TREE, canLearnSkill } from '../skills';
import { getExits, getLivingEnemies, getRoom } from '../world';

export interface ExploringDeps {
  enemyData: Record<string, EnemyDef>;
  itemData: Record<string, ItemDef>;
  weaponData: Record<string, WeaponDef>;
  npcData: Record<string, NpcDef>;
  armorData?: Record<string, ArmorDef>;
  accessoryData?: Record<string, AccessoryDef>;
  refreshHeader: () => void;
  emit: (sound: string) => void;
  startCombat: (enemyId: string) => void;
  checkEndingsForItem: (itemId: string) => void;
  checkChatterbox: () => void;
  checkScholar: () => void;
  checkItemAchievements: () => void;
  enterRoom: (roomId: string) => boolean;
  goDirection: (direction: string) => void;
  doSave: () => void;
  doLoadPicker: () => void;
  doMap: () => void;
  doScore: () => void;
  doSettings: () => void;
  doQuit: () => void;
  doAgain: () => void;
  printError: (msg: string) => void;
}

const HANDLED_BY_INFO_VERBS = new Set(['help', 'inventory', 'weapons', 'stats', 'journal', 'score']);
const ALL_VERBS = [
  'go', 'look', 'take', 'use', 'drop', 'search', 'attack', 'defend', 'flee',
  'inventory', 'weapons', 'stats', 'save', 'load', 'help', 'quit', 'talk', 'ask', 'journal',
  'map', 'score', 'again', 'examine', 'skill', 'skills', 'learn', 'achievements', 'settings', 'warp',
  'north', 'south', 'east', 'west', 'up', 'down',
];

export function handleExploringCommand(
  store: GameStore,
  verb: string,
  target: string,
  deps: ExploringDeps,
): void {
  if (!store.player || !store.world) return;

  if (verb === 'go') {
    deps.goDirection(target);
  } else if (verb === 'look') {
    handleLook(store, target, deps.itemData, deps.weaponData);
  } else if (verb === 'inventory') {
    showInventory(store);
  } else if (verb === 'weapons') {
    showWeapons(store);
  } else if (verb === 'stats') {
    showStats(store);
  } else if (verb === 'take') {
    handleTake(
      store,
      target,
      deps.itemData,
      deps.weaponData,
      deps.checkItemAchievements,
      deps.refreshHeader,
      deps.armorData,
      deps.accessoryData,
    );
  } else if (verb === 'use') {
    const [itemName, count] = parseBatchCount(target);
    for (let i = 0; i < count; i++) {
      handleUse(
        store,
        itemName,
        deps.itemData,
        deps.weaponData,
        deps.refreshHeader,
        deps.checkEndingsForItem,
        deps.armorData,
        deps.accessoryData,
      );
    }
  } else if (verb === 'drop') {
    handleDrop(store, target, deps.itemData, deps.weaponData, deps.refreshHeader, deps.armorData, deps.accessoryData);
  } else if (verb === 'search') {
    handleSearch(store, deps.itemData, deps.weaponData, deps.armorData, deps.accessoryData);
  } else if (verb === 'attack') {
    handleAttack(store, target, deps.enemyData, deps.startCombat);
  } else if (verb === 'talk') {
    handleTalk(store, target, deps.npcData, deps.checkChatterbox);
  } else if (verb === 'ask') {
    handleAsk(store, target, deps.itemData, deps.weaponData, deps.npcData);
  } else if (verb === 'save') {
    deps.doSave();
  } else if (verb === 'load') {
    deps.doLoadPicker();
  } else if (verb === 'journal') {
    showJournal(store);
  } else if (verb === 'map') {
    deps.doMap();
  } else if (verb === 'score') {
    deps.doScore();
  } else if (verb === 'examine') {
    handleExamine(store, target, deps.enemyData, deps.itemData, deps.weaponData, deps.armorData, deps.accessoryData);
  } else if (verb === 'skills') {
    store.state = 'skill_tree';
    store.skillTreePrevState = 'exploring';
    store.skillTreeSelected = { tier: 1, index: 0 };
    displaySkillTree(store);
  } else if (verb === 'learn') {
    handleLearn(store, target, deps.refreshHeader, deps.emit, deps.checkScholar);
  } else if (verb === 'warp') {
    handleWarp(store, target, {
      enterRoom: deps.enterRoom,
      refreshHeader: deps.refreshHeader,
      emit: deps.emit,
    });
  } else if (verb === 'achievements') {
    showAchievements(store);
  } else if (verb === 'settings') {
    deps.doSettings();
  } else if (verb === 'again') {
    deps.doAgain();
    return;
  } else if (verb === 'help') {
    handleHelp(store);
  } else if (verb === 'quit') {
    deps.doQuit();
  } else {
    deps.printError("I don't understand that. Type 'help' for commands.");
  }

  if (!HANDLED_BY_INFO_VERBS.has(verb) && verb !== 'again') {
    store.lastCommand = `${verb}${target ? ' ' + target : ''}`;
  }
}

export function parseBatchCount(target: string): [string, number] {
  // "potion x3" or "potion X3"
  const suffixMatch = target.match(/^(.+?)\s*x(\d+)$/i);
  if (suffixMatch) {
    return [suffixMatch[1].trim(), Math.min(parseInt(suffixMatch[2], 10), 10)];
  }
  // "3 potions" or "3 potion"
  const prefixMatch = target.match(/^(\d+)\s+(.+)$/);
  if (prefixMatch) {
    return [prefixMatch[2].trim(), Math.min(parseInt(prefixMatch[1], 10), 10)];
  }
  return [target, 1];
}

export function getAutocompleteSuggestions(
  store: GameStore,
  input: string,
  enemyData: Record<string, EnemyDef>,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  npcData: Record<string, NpcDef>,
): string[] {
  const lower = input.toLowerCase();
  if (!lower) return [];

  const parts = lower.split(/\s+/);

  if (parts.length <= 1) {
    return ALL_VERBS
      .filter(verb => verb.startsWith(lower) && verb !== lower)
      .map(verb => verb);
  }

  const verb = parts[0];
  const partial = parts.slice(1).join(' ');
  const candidates: string[] = [];

  if (!store.player || !store.world) return [];
  const room = getRoom(store.world, store.player.currentRoom);

  if (verb === 'take' && room) {
    for (const id of [...(room.items || []), ...(room._ground_loot || [])]) {
      const item = itemData[id];
      if (item) candidates.push(item.name);
    }
    for (const id of [...(room.weapons || []), ...(room._ground_weapons || [])]) {
      const weapon = weaponData[id];
      if (weapon) candidates.push(weapon.name);
    }
  } else if (verb === 'use' || verb === 'drop' || verb === 'examine') {
    for (const id of Object.keys(store.player.inventory)) {
      const item = itemData[id];
      if (item) candidates.push(item.name);
    }
    for (const id of Object.keys(store.player.keyItems)) {
      const item = itemData[id];
      if (item) candidates.push(item.name);
    }
    for (const id of store.player.weapons) {
      const weapon = weaponData[id];
      if (weapon) candidates.push(weapon.name);
    }
  } else if (verb === 'attack' && room) {
    for (const id of getLivingEnemies(store.world, store.player.currentRoom)) {
      const enemy = enemyData[id];
      if (enemy) candidates.push(enemy.name);
    }
  } else if ((verb === 'talk' || verb === 'ask') && room?.npcs) {
    for (const id of room.npcs) {
      const npc = npcData[id];
      if (npc) candidates.push(npc.name);
    }
  } else if (verb === 'go') {
    const exits = getExits(store.world, store.player.currentRoom);
    candidates.push(...Object.keys(exits));
  } else if (verb === 'learn') {
    for (const skill of SKILL_TREE) {
      if (canLearnSkill(store.player.skills, skill.id)) {
        candidates.push(skill.name);
      }
    }
  } else if (verb === 'warp') {
    if (store.world) {
      for (const roomId of Object.keys(store.player.visitedRooms)) {
        const room = store.world.rooms[roomId];
        if (room) candidates.push(room.name);
      }
    }
  }

  if (!partial) return candidates;
  return candidates.filter(candidate => candidate.toLowerCase().startsWith(partial));
}
