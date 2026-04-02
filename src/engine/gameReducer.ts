import type {
  GameStore, RGBA, PlayerState, WorldState, RoomDef, RegionData,
  WeaponDef, ItemDef, EnemyDef, EndingDef, CombatMessage,
  NpcDef, JournalEntry, DungeonState, SaveManifest,
} from './types';
import * as C from './constants';
import { parseCommand } from './commands';
import { createPlayer, totalAttack, totalDefense, xpToNextLevel, addXp, addItem, removeItem, hasItem, hasKeyItem, addWeapon, equipWeapon, visitRoom, visitedCount, heal as playerHeal, hasSkill } from './player';
import { SKILL_TREE, getSkillsByBranch, getSkill, canLearnSkill, findSkillByName } from './skills';
import { tryUnlock, getAll as getAllAchievements, isUnlocked } from './achievements';
import { createCombat, playerAttack, playerDefend, playerFlee, playerUseItem, enemyDefeated } from './combat';
import { createWorld, loadRegion, getRoom, getExits, getAdjacentRoom, getLivingEnemies, markEnemyDead } from './world';
import { createEffects, pushEffect, setRegionTint, clearRegionTint, updateRainbowTint } from './effects';
import { fireEvent } from './events';
import { checkEndings, getChoicePrompt, getEffectColor } from './endings';
import { loadManifest, saveToSlot, loadFromSlot, anySlotHasData, renameSlot, getRoomDisplayName, saveManifest } from './save';
import { getAsciiLines } from './asciiArt';
import { generateFloor, generateDungeonWeapon } from './dungeon';
import { loadSettings, saveSettings, FONT_SIZE_OPTIONS, COLOR_MODE_OPTIONS, TEXT_SPEED_OPTIONS, fontSizeLabel, colorModeLabel, textSpeedLabel, type GameSettings } from './settings';
import npcsJson from '../data/npcs.json';
const npcData = npcsJson as Record<string, NpcDef>;

// Data imports
import weaponsJson from '../data/weapons.json';
import itemsJson from '../data/items.json';
import enemiesJson from '../data/enemies.json';
import endingsJson from '../data/endings.json';
import manorJson from '../data/regions/manor.json';
import wildsJson from '../data/regions/wilds.json';
import darknessJson from '../data/regions/darkness.json';
import wastesJson from '../data/regions/wastes.json';
import hiddenJson from '../data/regions/hidden.json';

const weaponData = weaponsJson as Record<string, WeaponDef>;
const itemData = itemsJson as Record<string, ItemDef>;
const enemyData = enemiesJson as Record<string, EnemyDef>;
const endingsData = endingsJson as Record<string, EndingDef>;

// ---- Helpers ----

function addLine(store: GameStore, text: string, color?: RGBA): void {
  store.typewriterQueue.push({ text, color: color || store.baseColor });
}

function addLineInstant(store: GameStore, text: string, color?: RGBA): void {
  store.lines.push({ text, color: color || store.baseColor });
}

function emitSound(store: GameStore, name: string): void {
  store.soundQueue.push(name);
}

function clearTerminal(store: GameStore): void {
  store.lines = [];
  store.typewriterQueue = [];
  store.typewriterPos = 0;
}

function displayAscii(store: GameStore, name: string, color?: RGBA): void {
  const lines = getAsciiLines(name);
  if (!lines) return;
  const c = color || C.ASCII_COLOR;
  for (const line of lines) {
    addLine(store, line, c);
  }
}

function updateHeader(store: GameStore): void {
  if (!store.player) return;
  store.header.title = (store.gameMode === 'dungeon' && store.dungeon)
    ? `DUNGEON F${store.dungeon.floor}`
    : 'MYSTICQUEST v1.0';
  store.header.hp = store.player.hp;
  store.header.maxHp = store.player.maxHp;
  store.header.level = store.player.level;
  if (store.player.equippedWeapon && weaponData[store.player.equippedWeapon]) {
    store.header.weapon = weaponData[store.player.equippedWeapon].name;
  } else {
    store.header.weapon = 'Fists';
  }
}

function hideHeader(store: GameStore): void {
  store.header = { title: '', hp: 0, maxHp: 0, level: 0, weapon: '' };
}

function applyRegionTint(store: GameStore, region?: string): void {
  store.currentRegion = region || null;
  if (region === 'manor') setRegionTint(store.effects, 0, 0.15, 0, 0.05);
  else if (region === 'wilds') clearRegionTint(store.effects);
  else if (region === 'darkness') setRegionTint(store.effects, 0.2, 0, 0, 0.1);
  else if (region === 'wastes') setRegionTint(store.effects, 0.15, 0.1, 0, 0.05);
  else if (region === 'hidden') updateRainbowTint(store.effects);
  else clearRegionTint(store.effects);
}

interface Matchable { name: string; match_words?: string[] }

// Returns all matching IDs from a candidate list, using match_words then fallback to name/id matching.
function findAllMatches(name: string, ids: string[], dataTable: Record<string, Matchable>): string[] {
  const lower = name.toLowerCase();

  // 1. Exact match on id or full name — return immediately if found
  for (const id of ids) {
    const info = dataTable[id];
    if (!info) continue;
    if (id.toLowerCase() === lower || info.name.toLowerCase() === lower) return [id];
  }

  // 2. Exact match on a match_word — collect all that match
  const wordMatches: string[] = [];
  for (const id of ids) {
    const info = dataTable[id];
    if (!info?.match_words) continue;
    if (info.match_words.some(w => w.toLowerCase() === lower)) wordMatches.push(id);
  }
  if (wordMatches.length > 0) return wordMatches;

  // 3. Fallback: partial match on id or name
  const partial: string[] = [];
  for (const id of ids) {
    const info = dataTable[id];
    if (!info) continue;
    if (id.toLowerCase().includes(lower) || info.name.toLowerCase().includes(lower)) partial.push(id);
  }
  return partial;
}

// Resolve a match list: if 1 result return it, if multiple print disambiguation, if 0 return null.
function resolveOrDisambiguate(
  store: GameStore,
  matches: string[],
  dataTable: Record<string, Matchable>,
  verb: string,
): string | null {
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    addLine(store, `Which ${verb}?`, C.CHOICE_COLOR);
    for (const id of matches) {
      const info = dataTable[id];
      if (info) addLine(store, `  ${info.name}`, C.HELP_COLOR);
    }
    return null;
  }
  return null;
}

function findEnemyInRoom(name: string, world: WorldState, roomId: string): string | null {
  const lower = name.toLowerCase();
  const living = getLivingEnemies(world, roomId);
  for (const enemyId of living) {
    const edata = enemyData[enemyId];
    if (!edata) continue;
    if (enemyId.toLowerCase() === lower || edata.name.toLowerCase() === lower) return enemyId;
    if (enemyId.toLowerCase().includes(lower) || edata.name.toLowerCase().includes(lower)) return enemyId;
  }
  return null;
}

function removeFromRoom(room: RoomDef, itemId: string): string | null {
  const lists = ['items', 'weapons', '_ground_loot', '_ground_weapons'] as const;
  for (const listName of lists) {
    const list = room[listName] as string[] | undefined;
    if (list) {
      const idx = list.indexOf(itemId);
      if (idx !== -1) {
        list.splice(idx, 1);
        return listName;
      }
    }
  }
  return null;
}

function addJournal(store: GameStore, type: JournalEntry['type'], text: string): void {
  if (!store.player) return;
  store.player.journalEntries.push({ type, text, timestamp: Date.now() });
}

// ---- Achievement helper ----

function checkAchievement(store: GameStore, id: string): void {
  const name = tryUnlock(id);
  if (name) {
    addLine(store, '');
    addLine(store, `[Achievement Unlocked: ${name}]`, C.CHOICE_COLOR);
    emitSound(store, 'achievement');
  }
}

function checkItemAchievements(store: GameStore): void {
  if (!store.player) return;
  // Fully loaded: 10+ items
  const invCount = Object.values(store.player.inventory).reduce((a, b) => a + b, 0);
  const keyCount = Object.keys(store.player.keyItems).length;
  const weaponCount = store.player.weapons.length;
  if (invCount + keyCount + weaponCount >= 10) {
    checkAchievement(store, 'fully_loaded');
  }
  // Collector: all 4 mushrooms
  const mushrooms = ['red_mushroom', 'blue_mushroom', 'green_mushroom', 'gold_mushroom'];
  if (mushrooms.every(m => hasItem(store.player!, m) || hasKeyItem(store.player!, m))) {
    checkAchievement(store, 'collector');
  }
}

// ---- Skill Tree display & learn ----

function showSkills(store: GameStore): void {
  if (!store.player) return;
  addLine(store, '');
  addLine(store, '=== Skill Tree ===', C.STAT_COLOR);
  addLine(store, `Skill Points: ${store.player.skillPoints}`, C.CHOICE_COLOR);
  addLine(store, '');

  const branches: Array<'warrior' | 'rogue' | 'mage'> = ['warrior', 'rogue', 'mage'];
  for (const branch of branches) {
    addLine(store, `--- ${branch.charAt(0).toUpperCase() + branch.slice(1)} ---`, C.COMBAT_COLOR);
    const skills = getSkillsByBranch(branch);
    for (const skill of skills) {
      if (store.player.skills[skill.id]) {
        addLine(store, `  [*] ${skill.name} - ${skill.description}`, C.ITEM_COLOR);
      } else if (canLearnSkill(store.player.skills, skill.id)) {
        addLine(store, `  [>] ${skill.name} - ${skill.description} (available)`, C.CHOICE_COLOR);
      } else {
        addLine(store, `  [ ] ${skill.name} - ${skill.description}`, C.HELP_COLOR);
      }
    }
    addLine(store, '');
  }
  addLine(store, "Type 'learn <skill>' to learn a skill.", C.HELP_COLOR);
}

function handleLearn(store: GameStore, target: string): void {
  if (!store.player) return;
  if (!target) {
    addLine(store, 'Learn what? Type "skills" to see available skills.', C.ERROR_COLOR);
    return;
  }

  const skill = findSkillByName(target);
  if (!skill) {
    addLine(store, "Unknown skill. Type 'skills' to see available skills.", C.ERROR_COLOR);
    return;
  }

  if (store.player.skills[skill.id]) {
    addLine(store, `You already know ${skill.name}.`, C.ERROR_COLOR);
    return;
  }

  if (!canLearnSkill(store.player.skills, skill.id)) {
    addLine(store, `You need to learn earlier skills in the ${skill.branch} branch first.`, C.ERROR_COLOR);
    return;
  }

  if (store.player.skillPoints <= 0) {
    addLine(store, 'You have no skill points. Level up to earn more.', C.ERROR_COLOR);
    return;
  }

  store.player.skills[skill.id] = true;
  store.player.skillPoints--;

  // Apply immediate stat effects
  if (skill.id === 'iron_will') {
    const bonus = 5 * store.player.level;
    store.player.maxHp += bonus;
    store.player.hp += bonus;
  } else if (skill.id === 'heavy_blows') {
    store.player.attack += 2;
  } else if (skill.id === 'thick_skin') {
    store.player.defense += 2;
  } else if (skill.id === 'titan') {
    store.player.maxHp += 15;
    store.player.hp += 15;
    store.player.attack += 1;
    store.player.defense += 1;
  }

  addLine(store, `Learned ${skill.name}! ${skill.description}`, C.ITEM_COLOR);
  emitSound(store, 'levelUp');
  updateHeader(store);

  // Scholar achievement
  const learnedCount = Object.values(store.player.skills).filter(Boolean).length;
  if (learnedCount >= 5) {
    checkAchievement(store, 'scholar');
  }
}

function showAchievements(store: GameStore): void {
  addLine(store, '');
  addLine(store, '=== Achievements ===', C.STAT_COLOR);
  const all = getAllAchievements();
  for (const ach of all) {
    if (ach.unlocked) {
      addLine(store, `  [*] ${ach.name} - ${ach.description}`, C.ITEM_COLOR);
    } else {
      addLine(store, `  [ ] ${ach.name} - ${ach.description}`, C.HELP_COLOR);
    }
  }
  const unlocked = all.filter(a => a.unlocked).length;
  addLine(store, '');
  addLine(store, `${unlocked}/${all.length} unlocked`, C.STAT_COLOR);
}

function displayRoom(store: GameStore, roomId: string): void {
  if (!store.world) return;
  const room = getRoom(store.world, roomId);
  if (!room) {
    addLine(store, 'ERROR: Room not found.', C.ERROR_COLOR);
    return;
  }

  addLine(store, C.SEPARATOR, C.SEPARATOR_COLOR);
  addLine(store, room.name, C.ROOM_NAME_COLOR);
  addLine(store, '');
  addLine(store, room.description);
  addLine(store, '');

  const living = getLivingEnemies(store.world, roomId);
  for (const enemyId of living) {
    const edata = enemyData[enemyId];
    if (edata) addLine(store, `A ${edata.name} lurks here.`, C.ENEMY_COLOR);
  }

  if (room.items) {
    for (const itemId of room.items) {
      const idata = itemData[itemId];
      if (idata) addLine(store, `You see a ${idata.name} here.`, C.ITEM_COLOR);
    }
  }
  if (room.weapons) {
    for (const wid of room.weapons) {
      const wdata = weaponData[wid];
      if (wdata) addLine(store, `You see a ${wdata.name} here.`, C.ITEM_COLOR);
    }
  }
  if (room._ground_loot) {
    for (const itemId of room._ground_loot) {
      const idata = itemData[itemId];
      if (idata) addLine(store, `You see a ${idata.name} on the ground.`, C.LOOT_COLOR);
    }
  }
  if (room._ground_weapons) {
    for (const wid of room._ground_weapons) {
      const wdata = weaponData[wid];
      if (wdata) addLine(store, `You see a ${wdata.name} on the ground.`, C.LOOT_COLOR);
    }
  }

  if (room.npcs) {
    for (const npcId of room.npcs) {
      const npc = npcData[npcId];
      if (npc) addLine(store, `${npc.name} is here.`, C.NPC_COLOR);
    }
  }

  const exits = getExits(store.world, roomId);
  const exitList = Object.keys(exits).sort();
  addLine(store, '');
  if (exitList.length > 0) {
    addLine(store, 'Exits: ' + exitList.join(', '), C.EXITS_COLOR);
  } else {
    addLine(store, 'There are no exits.', C.EXITS_COLOR);
  }
}

function initWorld(): WorldState {
  const world = createWorld();
  loadRegion(world, manorJson as RegionData);
  loadRegion(world, wildsJson as RegionData);
  loadRegion(world, darknessJson as RegionData);
  loadRegion(world, wastesJson as RegionData);
  loadRegion(world, hiddenJson as RegionData);
  return world;
}

function enterRoom(store: GameStore, roomId: string): boolean {
  if (!store.world || !store.player) return false;
  const room = getRoom(store.world, roomId);
  if (!room) return false;

  // Check on_enter event
  if (room.on_enter && !store.player.firedEvents[room.on_enter]) {
    const result = fireEvent(room.on_enter, store.player, store.effects);
    if (!result.success) {
      if (result.message) addLine(store, result.message, C.ERROR_COLOR);
      return false;
    }
    store.player.firedEvents[room.on_enter] = true;
    if (result.message?.startsWith('boss:')) {
      const bossId = result.message.slice(5);
      store.player.currentRoom = roomId;
      visitRoom(store.player, roomId);
      displayRoom(store, roomId);
      applyRegionTint(store, room.region);
      startCombat(store, bossId);
      return true;
    }
  }

  store.player.currentRoom = roomId;
  visitRoom(store.player, roomId);
  store.player.routeHistory.push(roomId);
  addJournal(store, 'room', `Entered ${room.name}`);
  displayRoom(store, roomId);
  applyRegionTint(store, room.region);

  // Handle dungeon special rooms
  if (store.gameMode === 'dungeon' && room.specialType) {
    handleDungeonSpecialRoom(store, room);
  }

  // Dungeon rest area — present choices
  if (store.gameMode === 'dungeon' && roomId.startsWith('dng_rest_')) {
    store.state = 'dialogue';
    store.dialogueOptions = ['Rest (heal 50% HP)', 'Save', 'Continue to next floor'];
    addLine(store, '');
    addLine(store, 'What would you like to do?', C.CHOICE_COLOR);
    store.dialogueOptions.forEach((opt, i) => {
      addLine(store, `[${i + 1}] ${opt}`, C.CHOICE_COLOR);
    });
    return true;
  }

  // Check exploration ending
  checkEndingsContext(store, {});

  // Explorer achievement
  if (store.world && store.gameMode === 'story') {
    const totalRooms = Object.keys(store.world.rooms).filter(id => !id.startsWith('dng_')).length;
    const visited = Object.keys(store.player.visitedRooms).filter(id => !id.startsWith('dng_')).length;
    if (totalRooms > 0 && visited / totalRooms >= 0.8) {
      checkAchievement(store, 'explorer');
    }
  }

  // Check choice prompt
  const choiceEnding = getChoicePrompt(endingsData, store.player);
  if (choiceEnding) {
    startDialogue(store, choiceEnding);
  }

  // Auto-save on room entry
  if (store.player && store.world && store.activeSlot !== null) {
    saveToSlot(store.activeSlot, store.player, store.world, store.dungeon);
  }

  return true;
}

function checkEndingsContext(store: GameStore, context: any): boolean {
  if (!store.player || !store.world) return false;
  const ending = checkEndings(endingsData, store.player, store.world, context);
  if (ending) {
    startEnding(store, ending);
    return true;
  }
  return false;
}

function startDialogue(store: GameStore, ending: EndingDef): void {
  store.state = 'dialogue';
  store.dialogueEnding = ending;
  store.dialogueOptions = ending.choice_options || [];

  addLine(store, '');
  addLine(store, ending.choice_prompt || '', C.CHOICE_COLOR);
  addLine(store, '');
  store.dialogueOptions.forEach((opt, i) => {
    addLine(store, `[${i + 1}] ${opt}`, C.CHOICE_COLOR);
  });
  addLine(store, '');
}

function startEnding(store: GameStore, ending: EndingDef): void {
  addJournal(store, 'story', `Ending: ${ending.title}`);

  // Track which endings have been seen for all_endings achievement
  const endingIds = Object.keys(endingsData);
  const endingKey = endingIds.find(id => endingsData[id].title === ending.title);
  if (endingKey) {
    tryUnlock(`ending_${endingKey}`);
    // Check if all 4 endings have been seen
    if (endingIds.every(id => isUnlocked(`ending_${id}`))) {
      checkAchievement(store, 'all_endings');
    }
  }

  store.state = 'ending';
  store.endingData = ending;
  store.endingLineIndex = 0;
  store.endingTimer = 0;
  store.endingAllTyped = false;
  store.endingPsychedelicTime = 0;

  clearTerminal(store);

  const color = getEffectColor(ending.terminal_effect);
  if (color) {
    store.baseColor = color;
  } else {
    store.baseColor = [1, 0.2, 0.8, 1];
  }

  hideHeader(store);
  addLine(store, `=== ${ending.title || 'ENDING'} ===`, store.baseColor);
  addLine(store, '');
}

function startCombat(store: GameStore, enemyId: string): void {
  if (!store.player) return;
  const combinedEnemies = store.gameMode === 'dungeon' && store.dungeon
    ? { ...enemyData, ...store.dungeon.floorEnemies }
    : enemyData;
  const edata = combinedEnemies[enemyId];
  if (!edata) {
    addLine(store, 'Unknown enemy.', C.ERROR_COLOR);
    return;
  }

  store.combat = createCombat(store.player, enemyId, combinedEnemies);
  store.combatEnemyId = enemyId;
  store.state = 'combat';

  addLine(store, '');
  addLine(store, C.SEPARATOR, C.COMBAT_COLOR);
  addLine(store, '=== COMBAT! ===', C.COMBAT_COLOR);
  addLine(store, '');

  if (edata.is_boss && C.BOSS_ASCII[enemyId]) {
    emitSound(store, 'bossAppear');
    displayAscii(store, C.BOSS_ASCII[enemyId], C.ENEMY_COLOR);
    addLine(store, '');
  }

  addLine(store, `A ${edata.name} attacks!`, C.ENEMY_COLOR);
  if (edata.description) addLine(store, edata.description, C.HELP_COLOR);
  addLine(store, `HP: ${edata.hp}  ATK: ${edata.attack}  DEF: ${edata.defense}`, C.HELP_COLOR);
  addLine(store, '');
  addLine(store, 'Commands: attack, defend, flee, use <item>', C.COMBAT_COLOR);
}

function showInventory(store: GameStore): void {
  if (!store.player) return;
  addLine(store, '');
  addLine(store, '=== Inventory ===', C.STAT_COLOR);

  if (store.player.equippedWeapon && weaponData[store.player.equippedWeapon]) {
    const w = weaponData[store.player.equippedWeapon];
    addLine(store, `Weapon: ${w.name} (+${w.attack_bonus} ATK)`, C.ITEM_COLOR);
  } else {
    addLine(store, 'Weapon: Fists', C.ITEM_COLOR);
  }

  if (store.player.equippedShield && itemData[store.player.equippedShield]) {
    const s = itemData[store.player.equippedShield];
    addLine(store, `Shield: ${s.name} (+${s.value} DEF)`, C.ITEM_COLOR);
  }

  const otherWeapons = store.player.weapons.filter(w => w !== store.player!.equippedWeapon);
  for (const wid of otherWeapons) {
    const w = weaponData[wid];
    if (w) addLine(store, `  ${w.name} (+${w.attack_bonus} ATK)`, C.HELP_COLOR);
  }

  let hasItems = false;
  for (const [itemId, count] of Object.entries(store.player.inventory)) {
    hasItems = true;
    const idata = itemData[itemId];
    const name = idata?.name || itemId;
    addLine(store, count > 1 ? `  ${name} x${count}` : `  ${name}`, C.HELP_COLOR);
  }

  for (const kid of Object.keys(store.player.keyItems)) {
    hasItems = true;
    const idata = itemData[kid];
    const name = idata?.name || kid;
    addLine(store, `  ${name} [key]`, C.LOOT_COLOR);
  }

  if (!hasItems && store.player.weapons.length === 0) {
    addLine(store, '  (empty)', C.HELP_COLOR);
  }
}

function showStats(store: GameStore): void {
  if (!store.player) return;
  addLine(store, '');
  addLine(store, '=== Stats ===', C.STAT_COLOR);
  addLine(store, `HP: ${store.player.hp}/${store.player.maxHp}`, C.STAT_COLOR);

  let totalAtk = totalAttack(store.player);
  if (store.player.equippedWeapon && weaponData[store.player.equippedWeapon]) {
    totalAtk += weaponData[store.player.equippedWeapon].attack_bonus;
  }
  addLine(store, `Attack: ${totalAtk}`, C.STAT_COLOR);
  addLine(store, `Defense: ${totalDefense(store.player, itemData)}`, C.STAT_COLOR);
  addLine(store, `Level: ${store.player.level}`, C.STAT_COLOR);
  addLine(store, `XP: ${store.player.xp}/${xpToNextLevel(store.player)}`, C.STAT_COLOR);
  addLine(store, `Rooms visited: ${visitedCount(store.player)}`, C.STAT_COLOR);
  if (store.player.skillPoints > 0) {
    addLine(store, `Skill Points: ${store.player.skillPoints}`, C.CHOICE_COLOR);
  }
  const learnedSkills = SKILL_TREE.filter(s => store.player!.skills[s.id]);
  if (learnedSkills.length > 0) {
    addLine(store, `Skills: ${learnedSkills.map(s => s.name).join(', ')}`, C.ITEM_COLOR);
  }
}

// ---- Tab autocomplete ----

const ALL_VERBS = [
  'go', 'look', 'take', 'use', 'drop', 'search', 'attack', 'defend', 'flee',
  'inventory', 'stats', 'save', 'load', 'help', 'quit', 'talk', 'journal',
  'map', 'score', 'again', 'examine', 'skills', 'learn', 'achievements', 'settings',
  'north', 'south', 'east', 'west', 'up', 'down',
];

function getAutocompleteSuggestions(store: GameStore, input: string): string[] {
  const lower = input.toLowerCase();
  if (!lower) return [];

  const parts = lower.split(/\s+/);

  // If only one word, complete the verb/direction
  if (parts.length <= 1) {
    return ALL_VERBS
      .filter(v => v.startsWith(lower) && v !== lower)
      .map(v => v);
  }

  // Two+ words: complete the target (item/weapon/enemy/npc names)
  const verb = parts[0];
  const partial = parts.slice(1).join(' ');
  const candidates: string[] = [];

  if (!store.player || !store.world) return [];
  const room = getRoom(store.world, store.player.currentRoom);

  if (verb === 'take' && room) {
    // Items and weapons in the room
    for (const id of [...(room.items || []), ...(room._ground_loot || [])]) {
      const d = itemData[id]; if (d) candidates.push(d.name);
    }
    for (const id of [...(room.weapons || []), ...(room._ground_weapons || [])]) {
      const d = weaponData[id]; if (d) candidates.push(d.name);
    }
  } else if (verb === 'use' || verb === 'drop' || verb === 'examine') {
    // Player's inventory
    for (const id of Object.keys(store.player.inventory)) {
      const d = itemData[id]; if (d) candidates.push(d.name);
    }
    for (const id of Object.keys(store.player.keyItems)) {
      const d = itemData[id]; if (d) candidates.push(d.name);
    }
    for (const id of store.player.weapons) {
      const d = weaponData[id]; if (d) candidates.push(d.name);
    }
  } else if (verb === 'attack' && room) {
    for (const id of getLivingEnemies(store.world, store.player.currentRoom)) {
      const d = enemyData[id]; if (d) candidates.push(d.name);
    }
  } else if (verb === 'talk' && room?.npcs) {
    for (const id of room.npcs) {
      const d = npcData[id]; if (d) candidates.push(d.name);
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
  }

  if (!partial) return candidates;
  return candidates.filter(c => c.toLowerCase().startsWith(partial));
}

// ---- Examine command ----

function handleExamine(store: GameStore, target: string): void {
  if (!store.player || !store.world) return;
  if (!target) { addLine(store, 'Examine what?', C.ERROR_COLOR); return; }

  const room = getRoom(store.world, store.player.currentRoom);

  // Try enemy in room
  if (room) {
    const living = getLivingEnemies(store.world, store.player.currentRoom);
    for (const eid of living) {
      const e = enemyData[eid];
      if (!e) continue;
      if (e.name.toLowerCase().includes(target.toLowerCase()) || eid.toLowerCase().includes(target.toLowerCase())) {
        addLine(store, '');
        addLine(store, `=== ${e.name} ===`, C.ENEMY_COLOR);
        addLine(store, e.description, C.HELP_COLOR);
        addLine(store, `HP: ${e.hp}  ATK: ${e.attack}  DEF: ${e.defense}  XP: ${e.xp}`, C.STAT_COLOR);
        if (e.is_boss) addLine(store, 'This is a boss enemy. Special attack every 3 rounds.', C.COMBAT_COLOR);
        // Estimate damage
        let playerAtk = totalAttack(store.player);
        if (store.player.equippedWeapon && weaponData[store.player.equippedWeapon]) {
          playerAtk += weaponData[store.player.equippedWeapon].attack_bonus;
        }
        const estDmg = Math.max(1, playerAtk - e.defense);
        const estTaken = Math.max(1, e.attack - totalDefense(store.player, itemData));
        addLine(store, `Est. damage you deal: ~${estDmg}/hit`, [0.8, 1, 0.8, 1]);
        addLine(store, `Est. damage you take: ~${estTaken}/hit`, [1, 0.5, 0.5, 1]);
        return;
      }
    }
  }

  // Try weapon (in inventory)
  for (const wid of store.player.weapons) {
    const w = weaponData[wid];
    if (!w) continue;
    if (w.name.toLowerCase().includes(target.toLowerCase()) || wid.toLowerCase().includes(target.toLowerCase())) {
      addLine(store, '');
      addLine(store, `=== ${w.name} ===`, C.ITEM_COLOR);
      addLine(store, w.description, C.HELP_COLOR);
      addLine(store, `Attack bonus: +${w.attack_bonus}`, C.STAT_COLOR);
      if (store.player.equippedWeapon === wid) {
        addLine(store, '(currently equipped)', C.ITEM_COLOR);
      } else if (store.player.equippedWeapon) {
        const curr = weaponData[store.player.equippedWeapon];
        if (curr) {
          const diff = w.attack_bonus - curr.attack_bonus;
          const sign = diff > 0 ? '+' : '';
          addLine(store, `Compared to ${curr.name}: ${sign}${diff} ATK`, diff > 0 ? C.ITEM_COLOR : C.ERROR_COLOR);
        }
      }
      return;
    }
  }

  // Try item (in inventory)
  for (const iid of [...Object.keys(store.player.inventory), ...Object.keys(store.player.keyItems)]) {
    const item = itemData[iid];
    if (!item) continue;
    if (item.name.toLowerCase().includes(target.toLowerCase()) || iid.toLowerCase().includes(target.toLowerCase())) {
      addLine(store, '');
      addLine(store, `=== ${item.name} ===`, C.ITEM_COLOR);
      addLine(store, item.description, C.HELP_COLOR);
      addLine(store, `Type: ${item.type}`, C.STAT_COLOR);
      if (item.effect === 'heal' && item.value) addLine(store, `Heals ${item.value} HP`, C.STAT_COLOR);
      if (item.effect === 'buff_attack' && item.value) addLine(store, `+${item.value} ATK for 3 rounds`, C.STAT_COLOR);
      if (item.effect === 'defense' && item.value) addLine(store, `+${item.value} DEF when equipped`, C.STAT_COLOR);
      if (item.type === 'key') addLine(store, '(key item — cannot be dropped)', C.CHOICE_COLOR);
      const count = store.player.inventory[iid];
      if (count) addLine(store, `You have: ${count}`, C.HELP_COLOR);
      return;
    }
  }

  // Try examining something in the room
  if (room) {
    for (const id of [...(room.items || []), ...(room._ground_loot || [])]) {
      const item = itemData[id];
      if (item && (item.name.toLowerCase().includes(target.toLowerCase()) || id.toLowerCase().includes(target.toLowerCase()))) {
        addLine(store, '');
        addLine(store, `=== ${item.name} ===`, C.ITEM_COLOR);
        addLine(store, item.description, C.HELP_COLOR);
        return;
      }
    }
    for (const id of [...(room.weapons || []), ...(room._ground_weapons || [])]) {
      const w = weaponData[id];
      if (w && (w.name.toLowerCase().includes(target.toLowerCase()) || id.toLowerCase().includes(target.toLowerCase()))) {
        addLine(store, '');
        addLine(store, `=== ${w.name} ===`, C.ITEM_COLOR);
        addLine(store, w.description, C.HELP_COLOR);
        addLine(store, `Attack bonus: +${w.attack_bonus}`, C.STAT_COLOR);
        return;
      }
    }
  }

  addLine(store, "You don't see anything like that to examine.", C.ERROR_COLOR);
}

// ---- Batch use parsing (e.g. "use potion x3") ----

function parseBatchCount(target: string): [string, number] {
  const match = target.match(/^(.+?)\s*x(\d+)$/i);
  if (match) {
    return [match[1].trim(), Math.min(parseInt(match[2], 10), 10)]; // cap at 10
  }
  return [target, 1];
}

function showHelp(store: GameStore): void {
  addLine(store, '');
  addLine(store, C.SEPARATOR, C.SEPARATOR_COLOR);
  addLine(store, '=== COMMANDS ===', C.STAT_COLOR);
  addLine(store, '');
  addLine(store, ' MOVEMENT', C.EXITS_COLOR);
  addLine(store, '  go <direction>  - Move (north/south/east/west/up/down)', C.HELP_COLOR);
  addLine(store, '  look (l)        - Look around the current room', C.HELP_COLOR);
  addLine(store, '  search          - Search for hidden items', C.HELP_COLOR);
  addLine(store, '');
  addLine(store, ' ITEMS', C.ITEM_COLOR);
  addLine(store, '  take <item>     - Pick up an item or weapon', C.HELP_COLOR);
  addLine(store, '  use <item>      - Use consumable or equip gear', C.HELP_COLOR);
  addLine(store, '  use <item> x3   - Use an item multiple times', C.HELP_COLOR);
  addLine(store, '  drop <item>     - Drop an item', C.HELP_COLOR);
  addLine(store, '  examine <thing> - Inspect an item, weapon, or enemy', C.HELP_COLOR);
  addLine(store, '');
  addLine(store, ' COMBAT', C.COMBAT_COLOR);
  addLine(store, '  attack <enemy>  - Attack an enemy in the room', C.HELP_COLOR);
  addLine(store, '');
  addLine(store, ' INFO', C.STAT_COLOR);
  addLine(store, '  inventory (i)   - Show your inventory', C.HELP_COLOR);
  addLine(store, '  stats           - Show your stats', C.HELP_COLOR);
  addLine(store, '  journal         - View your adventure journal', C.HELP_COLOR);
  addLine(store, '  map             - Open the area map', C.HELP_COLOR);
  addLine(store, '  talk <npc>      - Talk to someone in the room', C.HELP_COLOR);
  addLine(store, '  skills          - View the skill tree', C.HELP_COLOR);
  addLine(store, '  learn <skill>   - Learn a new skill', C.HELP_COLOR);
  addLine(store, '  achievements    - View achievements', C.HELP_COLOR);
  addLine(store, '  save / load     - Save or load your game', C.HELP_COLOR);
  addLine(store, '  again (g)       - Repeat your last command', C.HELP_COLOR);
  addLine(store, '  help (?)        - Show this help', C.HELP_COLOR);
  addLine(store, '');
  addLine(store, 'Shortcuts: n/s/e/w/u/d for directions, Tab to autocomplete', [0.5, 0.5, 0.5, 0.8]);
  addLine(store, C.SEPARATOR, C.SEPARATOR_COLOR);
}

function handleTake(store: GameStore, target: string): void {
  if (!store.player || !store.world) return;
  if (!target) { addLine(store, 'Take what?', C.ERROR_COLOR); return; }

  const room = getRoom(store.world, store.player.currentRoom);
  if (!room) return;

  const roomWeaponIds = [...(room.weapons || []), ...(room._ground_weapons || [])];
  const roomItemIds = [...(room.items || []), ...(room._ground_loot || [])];

  // Try weapons
  const weaponMatches = findAllMatches(target, roomWeaponIds, weaponData);
  if (weaponMatches.length > 1) {
    resolveOrDisambiguate(store, weaponMatches, weaponData, 'weapon do you want to take');
    return;
  }
  if (weaponMatches.length === 1) {
    const wid = weaponMatches[0];
    removeFromRoom(room, wid);
    addWeapon(store.player, wid);
    addLine(store, `You pick up the ${weaponData[wid].name}.`, C.ITEM_COLOR);
    addJournal(store, 'item', `Found ${weaponData[wid].name}`);
    emitSound(store, 'pickup');
    if (!store.player.equippedWeapon) {
      equipWeapon(store.player, wid);
      addLine(store, `You equip the ${weaponData[wid].name}.`, C.ITEM_COLOR);
      emitSound(store, 'equip');
      updateHeader(store);
    }
    return;
  }

  // Try items
  const itemMatches = findAllMatches(target, roomItemIds, itemData);
  if (itemMatches.length > 1) {
    resolveOrDisambiguate(store, itemMatches, itemData, 'item do you want to take');
    return;
  }
  if (itemMatches.length === 1) {
    const iid = itemMatches[0];
    removeFromRoom(room, iid);
    addItem(store.player, iid, itemData);
    addLine(store, `You pick up the ${itemData[iid].name}.`, C.ITEM_COLOR);
    addJournal(store, 'item', `Found ${itemData[iid].name}`);
    emitSound(store, 'pickup');
    if (itemData[iid].type === 'shield' && !store.player.equippedShield) {
      store.player.equippedShield = iid;
      addLine(store, `You equip the ${itemData[iid].name}.`, C.ITEM_COLOR);
      emitSound(store, 'equip');
    }
    checkItemAchievements(store);
    return;
  }

  addLine(store, "You don't see that here.", C.ERROR_COLOR);
  emitSound(store, 'error');
}

function handleUse(store: GameStore, target: string): void {
  if (!store.player || !store.world) return;
  if (!target) { addLine(store, 'Use what?', C.ERROR_COLOR); return; }

  // Build scoped lists from what the player actually has
  const ownedWeaponIds = store.player.weapons;
  const ownedItemIds = [
    ...Object.keys(store.player.inventory),
    ...Object.keys(store.player.keyItems),
  ];

  // Try weapon
  const weaponMatches = findAllMatches(target, ownedWeaponIds, weaponData);
  if (weaponMatches.length > 1) {
    resolveOrDisambiguate(store, weaponMatches, weaponData, 'weapon do you want to equip');
    return;
  }
  if (weaponMatches.length === 1) {
    const wid = weaponMatches[0];
    equipWeapon(store.player, wid);
    addLine(store, `You equip the ${weaponData[wid].name}.`, C.ITEM_COLOR);
    emitSound(store, 'equip');
    updateHeader(store);
    return;
  }

  // Try item
  const itemMatches = findAllMatches(target, ownedItemIds, itemData);
  if (itemMatches.length > 1) {
    resolveOrDisambiguate(store, itemMatches, itemData, 'item do you want to use');
    return;
  }
  if (itemMatches.length === 1) {
    const iid = itemMatches[0];
    const idata = itemData[iid];

    // Shield equip
    if (idata.type === 'shield' && hasItem(store.player, iid)) {
      store.player.equippedShield = iid;
      addLine(store, `You equip the ${idata.name}.`, C.ITEM_COLOR);
      emitSound(store, 'equip');
      return;
    }

    // Key item use — track per room for multi_item_use endings
    if (idata.type === 'key' && hasKeyItem(store.player, iid)) {
      const room_id = store.player.currentRoom;
      if (!store.player.usedItemsInRoom[room_id]) store.player.usedItemsInRoom[room_id] = {};
      store.player.usedItemsInRoom[room_id][iid] = true;
      addLine(store, `You use the ${idata.name}.`, C.ITEM_COLOR);
      checkEndingsContext(store, { itemJustUsed: iid });
      return;
    }

    // Consumable
    if (idata.type === 'consumable' && hasItem(store.player, iid)) {
      removeItem(store.player, iid);
      if (idata.effect === 'heal' && idata.value) {
        const healAmount = hasSkill(store.player, 'herbalism') ? Math.floor(idata.value * 1.5) : idata.value;
        const oldHp = store.player.hp;
        playerHeal(store.player, healAmount);
        const healed = store.player.hp - oldHp;
        addLine(store, `You use ${idata.name} and restore ${healed} HP.`, C.ITEM_COLOR);
      } else if (idata.effect === 'buff_attack' && idata.value) {
        store.player.buffAttack = idata.value;
        store.player.buffRounds = hasSkill(store.player, 'buff_mastery') ? 5 : 3;
        const rounds = store.player.buffRounds;
        addLine(store, `You drink ${idata.name}! +${idata.value} Attack for ${rounds} rounds.`, C.COMBAT_COLOR);
      }
      updateHeader(store);
      return;
    }
  }

  addLine(store, "You don't have that or can't use it.", C.ERROR_COLOR);
}

function handleDrop(store: GameStore, target: string): void {
  if (!store.player || !store.world) return;
  if (!target) { addLine(store, 'Drop what?', C.ERROR_COLOR); return; }

  const room = getRoom(store.world, store.player.currentRoom);
  if (!room) return;

  // Items in inventory
  const ownedItemIds = Object.keys(store.player.inventory);
  const itemMatches = findAllMatches(target, ownedItemIds, itemData);
  if (itemMatches.length > 1) {
    resolveOrDisambiguate(store, itemMatches, itemData, 'item do you want to drop');
    return;
  }
  if (itemMatches.length === 1) {
    const iid = itemMatches[0];
    if (itemData[iid].type === 'key') {
      addLine(store, "You can't drop that.", C.ERROR_COLOR);
      return;
    }
    removeItem(store.player, iid);
    if (!room._ground_loot) room._ground_loot = [];
    room._ground_loot.push(iid);
    if (store.player.equippedShield === iid) store.player.equippedShield = null;
    addLine(store, `You drop the ${itemData[iid]?.name || iid}.`, C.HELP_COLOR);
    return;
  }

  // Weapons
  const weaponMatches = findAllMatches(target, store.player.weapons, weaponData);
  if (weaponMatches.length > 1) {
    resolveOrDisambiguate(store, weaponMatches, weaponData, 'weapon do you want to drop');
    return;
  }
  if (weaponMatches.length === 1) {
    const wid = weaponMatches[0];
    const idx = store.player.weapons.indexOf(wid);
    store.player.weapons.splice(idx, 1);
    if (!room._ground_weapons) room._ground_weapons = [];
    room._ground_weapons.push(wid);
    if (store.player.equippedWeapon === wid) {
      store.player.equippedWeapon = null;
      updateHeader(store);
    }
    addLine(store, `You drop the ${weaponData[wid]?.name || wid}.`, C.HELP_COLOR);
    return;
  }

  addLine(store, "You don't have that.", C.ERROR_COLOR);
}

function handleSearch(store: GameStore): void {
  if (!store.player || !store.world) return;
  const room = getRoom(store.world, store.player.currentRoom);
  if (!room) return;

  if (!room.searchable) {
    addLine(store, "There's nothing interesting to search here.", C.HELP_COLOR);
    return;
  }
  if (store.player.searchedRooms[store.player.currentRoom]) {
    addLine(store, "You've already searched this room.", C.HELP_COLOR);
    return;
  }

  store.player.searchedRooms[store.player.currentRoom] = true;
  addLine(store, 'You search the room carefully...', C.HELP_COLOR);

  let foundSomething = false;
  if (room.search_items) {
    for (const itemId of room.search_items) {
      const idata = itemData[itemId];
      if (idata) {
        addItem(store.player, itemId, itemData);
        addLine(store, `You find a ${idata.name}!`, C.LOOT_COLOR);
        foundSomething = true;
      }
    }
  }

  if (room.dev_note) {
    let note = room.dev_note;
    if (!note.startsWith('//')) note = '// ' + note;
    addLine(store, '');
    addLine(store, note, C.DEV_NOTE_COLOR);
    addLine(store, '');
  }

  if (!foundSomething) {
    addLine(store, "You don't find anything useful.", C.HELP_COLOR);
  }
}

function handleAttack(store: GameStore, target: string): void {
  if (!store.player || !store.world) return;

  if (!target) {
    const living = getLivingEnemies(store.world, store.player.currentRoom);
    if (living.length === 1) {
      target = living[0];
    } else {
      addLine(store, 'Attack what?', C.ERROR_COLOR);
      return;
    }
  }

  const enemyId = findEnemyInRoom(target, store.world, store.player.currentRoom);
  if (!enemyId) {
    addLine(store, "There's nothing like that to fight here.", C.ERROR_COLOR);
    emitSound(store, 'error');
    return;
  }

  startCombat(store, enemyId);
}

function processCombatMessages(store: GameStore, msgs: CombatMessage[]): void {
  for (const msg of msgs) {
    addLine(store, msg.text, msg.color);
    if (msg.text.includes('deals') && msg.text.includes('damage to you')) {
      pushEffect(store.effects, 'shake', 0.3, { intensity: 4 });
      pushEffect(store.effects, 'flash', 0.2, { r: 1, g: 0, b: 0 });
      emitSound(store, 'playerHit');
    }
    if (msg.text.includes('CRITICAL HIT!')) {
      pushEffect(store.effects, 'flash', 0.3, { r: 1, g: 1, b: 1 });
      emitSound(store, 'critical');
    }
    if (msg.text.includes('enemy lands a CRITICAL HIT')) {
      pushEffect(store.effects, 'shake', 0.4, { intensity: 6 });
    }
    if (msg.text.includes('LEVEL UP!')) {
      emitSound(store, 'levelUp');
    }
  }
}

function handleCombatCommand(store: GameStore, verb: string, target: string): void {
  if (!store.combat || !store.player || !store.world) {
    store.state = 'exploring';
    return;
  }

  addLine(store, '');

  let msgs: CombatMessage[] = [];

  if (verb === 'attack') {
    msgs = playerAttack(store.combat, store.player, weaponData, itemData);
  } else if (verb === 'defend') {
    msgs = playerDefend(store.combat, store.player, itemData);
  } else if (verb === 'flee') {
    msgs = playerFlee(store.combat, store.player, itemData);
  } else if (verb === 'use') {
    if (!target) {
      addLine(store, 'Use what?', C.ERROR_COLOR);
      return;
    }
    // Scope to consumables the player actually has
    const consumableIds = Object.keys(store.player.inventory).filter(id => itemData[id]?.type === 'consumable');
    const matches = findAllMatches(target, consumableIds, itemData);
    if (matches.length > 1) {
      resolveOrDisambiguate(store, matches, itemData, 'item do you want to use');
      return;
    }
    if (matches.length === 0) {
      addLine(store, "You don't have that.", C.ERROR_COLOR);
      return;
    }
    msgs = playerUseItem(store.combat, store.player, matches[0], itemData);
  } else if (verb === 'inventory') {
    showInventory(store);
    return;
  } else if (verb === 'stats') {
    showStats(store);
    return;
  } else if (verb === 'skills') {
    showSkills(store);
    return;
  } else {
    addLine(store, 'In combat: attack, defend, flee, use <item>', C.COMBAT_COLOR);
    return;
  }

  processCombatMessages(store, msgs);
  updateHeader(store);

  // Low HP jitter
  if (store.player.hp > 0 && store.player.hp < store.player.maxHp * 0.3) {
    pushEffect(store.effects, 'jitter', 1.0, { intensity: 0.2 });
  }

  if (store.combat.finished) {
    if (store.combat.playerWon) {
      const defeatedEnemyId = store.combatEnemyId!;
      const results = enemyDefeated(store.combat, store.player);
      processCombatMessages(store, results.messages);

      const wasBoss = store.combat.enemy.isBoss;
      markEnemyDead(store.world, store.player.currentRoom, defeatedEnemyId);
      addJournal(store, 'combat', `Defeated ${store.combat.enemy.name}`);
      if (store.gameMode === 'dungeon' && store.dungeon) {
        store.dungeon.score.enemiesKilled++;
      }

      const room = getRoom(store.world, store.player.currentRoom);
      if (room) {
        if (results.loot.length > 0) {
          if (!room._ground_loot) room._ground_loot = [];
          for (const lootItemId of results.loot) {
            room._ground_loot.push(lootItemId);
            const idata = itemData[lootItemId];
            if (idata) addLine(store, `The enemy drops a ${idata.name}.`, C.LOOT_COLOR);
          }
        }
        if (results.weapon) {
          if (!room._ground_weapons) room._ground_weapons = [];
          room._ground_weapons.push(results.weapon);
          const wdata = weaponData[results.weapon];
          if (wdata) addLine(store, `The enemy drops a ${wdata.name}!`, C.LOOT_COLOR);
        }
      }

      addLine(store, '');
      addLine(store, '=== COMBAT END ===', C.COMBAT_COLOR);
      emitSound(store, 'victory');
      store.combat = null;
      store.combatEnemyId = null;
      store.state = 'exploring';

      checkEndingsContext(store, { bossJustDefeated: defeatedEnemyId });

      // Achievement checks after combat victory
      checkAchievement(store, 'first_blood');
      if (wasBoss) {
        checkAchievement(store, 'boss_slayer');
        if (defeatedEnemyId === 'evil_king') {
          checkAchievement(store, 'king_slayer');
        }
      }
      if (results.leveled) {
        if (store.player.level >= 15) {
          checkAchievement(store, 'master');
        }
        addLine(store, 'You gained a skill point! Type "skills" to learn new abilities.', C.CHOICE_COLOR);
      }
      checkItemAchievements(store);
      // Explorer check
      if (store.world && store.gameMode === 'story') {
        const totalRooms = Object.keys(store.world.rooms).filter(id => !id.startsWith('dng_')).length;
        const visited = Object.keys(store.player.visitedRooms).filter(id => !id.startsWith('dng_')).length;
        if (totalRooms > 0 && visited / totalRooms >= 0.8) {
          checkAchievement(store, 'explorer');
        }
      }
      // Dungeon floor achievements
      if (store.gameMode === 'dungeon' && store.dungeon) {
        if (store.dungeon.floor >= 5) checkAchievement(store, 'dungeon_crawler');
        if (store.dungeon.floor >= 20) checkAchievement(store, 'dungeon_master');
      }

    } else if (store.combat.fled) {
      addLine(store, '');
      addLine(store, '=== FLED COMBAT ===', C.COMBAT_COLOR);
      emitSound(store, 'fleeSuccess');
      store.combat = null;
      store.combatEnemyId = null;
      store.state = 'exploring';

    } else {
      // Player died
      store.combat = null;
      store.combatEnemyId = null;
      startGameover(store);
    }

    updateHeader(store);
  }
}

function handleExploringCommand(store: GameStore, verb: string, target: string): void {
  if (!store.player || !store.world) return;

  if (verb === 'go') {
    // Handle dungeon descend direction
    if (target === 'descend' && store.gameMode === 'dungeon' && store.dungeon) {
      const room = getRoom(store.world, store.player.currentRoom);
      if (room && room.id.startsWith('dng_rest_')) {
        store.dungeon.floor++;
        store.dungeon.score.floorsCleared++;
        if (store.dungeon.floor >= 5) checkAchievement(store, 'dungeon_crawler');
        if (store.dungeon.floor >= 20) checkAchievement(store, 'dungeon_master');
        loadDungeonFloor(store, store.dungeon.floor);
        clearTerminal(store);
        addLine(store, `--- Floor ${store.dungeon.floor} ---`, C.COMBAT_COLOR);
        addLine(store, '');
        enterRoom(store, store.player.currentRoom);
        updateHeader(store);
        return;
      }
    }
    const nextRoom = getAdjacentRoom(store.world, store.player.currentRoom, target);
    if (nextRoom && getRoom(store.world, nextRoom)) {
      addLine(store, '');
      const entered = enterRoom(store, nextRoom);
      if (entered) updateHeader(store);
    } else {
      addLine(store, "You can't go that way.", C.ERROR_COLOR);
      emitSound(store, 'error');
    }
  } else if (verb === 'look') {
    addLine(store, '');
    displayRoom(store, store.player.currentRoom);
  } else if (verb === 'inventory') {
    showInventory(store);
  } else if (verb === 'stats') {
    showStats(store);
  } else if (verb === 'take') {
    handleTake(store, target);
  } else if (verb === 'use') {
    const [itemName, count] = parseBatchCount(target);
    for (let i = 0; i < count; i++) {
      handleUse(store, itemName);
    }
  } else if (verb === 'drop') {
    handleDrop(store, target);
  } else if (verb === 'search') {
    handleSearch(store);
  } else if (verb === 'attack') {
    handleAttack(store, target);
  } else if (verb === 'talk') {
    handleTalk(store, target);
  } else if (verb === 'save') {
    if (store.activeSlot !== null) {
      if (store.player && store.world && saveToSlot(store.activeSlot, store.player, store.world, store.dungeon)) {
        addLine(store, 'Game saved.', C.ITEM_COLOR);
        emitSound(store, 'save');
      } else {
        addLine(store, 'Failed to save game.', C.ERROR_COLOR);
      }
    } else {
      openSlotPicker(store, 'save');
    }
  } else if (verb === 'load') {
    openSlotPicker(store, 'load');
  } else if (verb === 'journal') {
    showJournal(store);
  } else if (verb === 'map') {
    store.state = 'minimap';
    store.minimapOpen = true;
  } else if (verb === 'score') {
    if (store.gameMode === 'dungeon' && store.dungeon) {
      addLine(store, '');
      addLine(store, '=== Dungeon Score ===', C.STAT_COLOR);
      addLine(store, `Floor: ${store.dungeon.floor}`, C.STAT_COLOR);
      addLine(store, `Floors cleared: ${store.dungeon.score.floorsCleared}`, C.STAT_COLOR);
      addLine(store, `Enemies killed: ${store.dungeon.score.enemiesKilled}`, C.STAT_COLOR);
      addLine(store, `Items found: ${store.dungeon.score.itemsFound}`, C.STAT_COLOR);
      addLine(store, `Seed: ${store.dungeon.seed}`, C.HELP_COLOR);
    } else {
      addLine(store, "I don't understand that. Type 'help' for commands.", C.ERROR_COLOR);
    }
  } else if (verb === 'examine') {
    handleExamine(store, target);
  } else if (verb === 'skills') {
    showSkills(store);
  } else if (verb === 'learn') {
    handleLearn(store, target);
  } else if (verb === 'achievements') {
    showAchievements(store);
  } else if (verb === 'settings') {
    openSettings(store, 'exploring');
  } else if (verb === 'again') {
    if (store.lastCommand) {
      const [v, t] = parseCommand(store.lastCommand);
      if (v) {
        addLine(store, `(repeating: ${store.lastCommand})`, C.HELP_COLOR);
        handleExploringCommand(store, v, t);
      }
    } else {
      addLine(store, 'No previous command to repeat.', C.ERROR_COLOR);
    }
    return; // don't overwrite lastCommand with 'again'
  } else if (verb === 'help') {
    showHelp(store);
  } else if (verb === 'quit') {
    startMenu(store);
  } else {
    addLine(store, "I don't understand that. Type 'help' for commands.", C.ERROR_COLOR);
  }

  // Track last command for 'again' (but not 'again' itself — handled above with early return)
  if (verb !== 'help' && verb !== 'inventory' && verb !== 'stats' && verb !== 'journal' && verb !== 'score') {
    store.lastCommand = `${verb}${target ? ' ' + target : ''}`;
  }
}

function handleDialogueInput(store: GameStore, input: string): void {
  if (!store.player || !store.world) return;

  // Dungeon special rooms
  if (store.gameMode === 'dungeon' && store.world) {
    const room = getRoom(store.world, store.player.currentRoom);
    if (room?.specialType) {
      handleDungeonSpecialChoice(store, room, input);
      return;
    }
  }

  // Dungeon rest area dialogue
  if (store.gameMode === 'dungeon' && store.player.currentRoom.startsWith('dng_rest_')) {
    handleDungeonRestInput(store, input);
    return;
  }

  // NPC dialogue
  if (store.npcDialogue) {
    handleNpcDialogueInput(store, input);
    return;
  }

  const trimmed = input.trim().toLowerCase();

  let chosen: string | null = null;
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= store.dialogueOptions.length) {
    chosen = store.dialogueOptions[num - 1];
  } else {
    for (const opt of store.dialogueOptions) {
      if (trimmed === opt.toLowerCase()) {
        chosen = opt;
        break;
      }
    }
  }

  if (!chosen) {
    addLine(store, `Choose an option: 1-${store.dialogueOptions.length}`, C.ERROR_COLOR);
    return;
  }

  const ended = checkEndingsContext(store, { choiceMade: chosen });
  if (!ended) {
    store.state = 'exploring';
    addLine(store, `You choose to ${chosen}.`, C.HELP_COLOR);
    if (chosen.toLowerCase() === 'attack') {
      const living = getLivingEnemies(store.world, store.player.currentRoom);
      if (living.length > 0) startCombat(store, living[0]);
    }
  }
  store.dialogueEnding = null;
}

function handleGameoverInput(store: GameStore, input: string): void {
  const trimmed = input.trim();
  if (store.gameMode === 'dungeon' && store.dungeon) {
    if (trimmed === '1' || trimmed.toLowerCase() === 'menu') {
      startMenu(store);
    } else if (trimmed === '2' || trimmed.toLowerCase() === 'retry') {
      const seed = store.dungeon.seed;
      startDungeonMode(store, seed);
    } else {
      addLine(store, 'Choose [1] or [2].', C.ERROR_COLOR);
    }
    return;
  }
  if (trimmed === '1' || trimmed.toLowerCase() === 'load') {
    if (anySlotHasData()) {
      openSlotPicker(store, 'load');
    } else {
      addLine(store, 'No save file found.', C.ERROR_COLOR);
    }
  } else if (trimmed === '2' || trimmed.toLowerCase() === 'quit' || trimmed.toLowerCase() === 'menu') {
    startMenu(store);
  } else {
    addLine(store, 'Choose [1] or [2].', C.ERROR_COLOR);
  }
}

function startMenu(store: GameStore): void {
  store.state = 'menu';
  clearTerminal(store);
  store.baseColor = [...C.BASE_COLOR];
  store.menuSelected = 0;
  store.header = { title: 'MYSTICQUEST v1.0', hp: 0, maxHp: 0, level: 0, weapon: '' };
  clearRegionTint(store.effects);
}

function startNewGame(store: GameStore): void {
  store.world = initWorld();
  store.player = createPlayer('manor_entry');
  store.combat = null;
  store.combatEnemyId = null;
  store.currentRegion = null;

  clearTerminal(store);
  store.baseColor = [...C.BASE_COLOR];
  store.state = 'exploring';

  updateHeader(store);
  addLine(store, 'Welcome to MysticQuest.');
  addLine(store, '');
  enterRoom(store, store.player.currentRoom);
}

function startContinue(store: GameStore, slot: number): void {
  store.world = initWorld();
  store.player = createPlayer('manor_entry');
  store.combat = null;
  store.combatEnemyId = null;

  const result = loadFromSlot(slot, store.player, store.world);
  if (result.success) {
    store.activeSlot = slot;
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
  } else {
    addLine(store, 'Failed to load save.', C.ERROR_COLOR);
  }
}

function startGameover(store: GameStore): void {
  store.state = 'gameover';
  store.gameoverReady = false;
  emitSound(store, 'death');

  pushEffect(store.effects, 'shake', 0.5, { intensity: 8 });
  pushEffect(store.effects, 'flash', 0.5, { r: 1, g: 0, b: 0 });
  pushEffect(store.effects, 'glitch', 2.0, { intensity: 0.7 });

  clearTerminal(store);
  store.baseColor = [1.0, 0.2, 0.2, 1];

  if (store.gameMode === 'dungeon' && store.dungeon) {
    addLine(store, '');
    addLine(store, '=== DUNGEON RUN ENDED ===', C.ERROR_COLOR);
    addLine(store, `Floor reached: ${store.dungeon.floor}`, C.STAT_COLOR);
    addLine(store, `Floors cleared: ${store.dungeon.score.floorsCleared}`, C.STAT_COLOR);
    addLine(store, `Enemies killed: ${store.dungeon.score.enemiesKilled}`, C.STAT_COLOR);
    addLine(store, `Seed: ${store.dungeon.seed}`, C.HELP_COLOR);
    addLine(store, '');
    addLine(store, '[1] Return to Menu', C.HELP_COLOR);
    addLine(store, '[2] Retry (same seed)', C.HELP_COLOR);
    addLine(store, '');
  } else {
    addLine(store, '');
    displayAscii(store, 'death', C.ERROR_COLOR);
    addLine(store, '');
    addLine(store, 'YOU HAVE FALLEN', C.ERROR_COLOR);
    addLine(store, '');
    addLine(store, '[1] Load Save', C.HELP_COLOR);
    addLine(store, '[2] Quit to Menu', C.HELP_COLOR);
    addLine(store, '');
  }
}

// ---- Journal ----

function showJournal(store: GameStore): void {
  if (!store.player) return;
  addLine(store, '');
  addLine(store, '=== Journal ===', C.STAT_COLOR);
  if (store.player.journalEntries.length === 0) {
    addLine(store, '  (no entries)', C.HELP_COLOR);
    return;
  }
  const entries = store.player.journalEntries.slice(-20);
  for (const entry of entries) {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    let color = C.HELP_COLOR;
    if (entry.type === 'combat') color = C.COMBAT_COLOR;
    else if (entry.type === 'item') color = C.ITEM_COLOR;
    else if (entry.type === 'story') color = C.CHOICE_COLOR;
    addLine(store, `  [${time}] ${entry.text}`, color);
  }
}

// ---- NPC Dialogue ----

function checkDialogueCondition(cond: import('./types').DialogueCondition, player: PlayerState): boolean {
  switch (cond.type) {
    case 'has_key_item': return hasKeyItem(player, String(cond.value));
    case 'has_item': return hasItem(player, String(cond.value));
    case 'level_gte': return player.level >= Number(cond.value);
    case 'flag_set': return !!player.firedEvents[String(cond.value)];
    case 'flag_not_set': return !player.firedEvents[String(cond.value)];
    default: return true;
  }
}

function handleTalk(store: GameStore, target: string): void {
  if (!store.player || !store.world) return;
  const room = getRoom(store.world, store.player.currentRoom);
  if (!room || !room.npcs || room.npcs.length === 0) {
    addLine(store, "There's no one to talk to here.", C.ERROR_COLOR);
    return;
  }

  let npcId: string | null = null;

  if (!target && room.npcs.length === 1) {
    npcId = room.npcs[0];
  } else if (!target && room.npcs.length > 1) {
    addLine(store, 'Who do you want to talk to?', C.CHOICE_COLOR);
    for (const id of room.npcs) {
      const npc = npcData[id];
      if (npc) addLine(store, `  ${npc.name}`, C.HELP_COLOR);
    }
    return;
  } else {
    const matches = findAllMatches(target, room.npcs, npcData);
    npcId = resolveOrDisambiguate(store, matches, npcData, 'person do you want to talk to');
    if (!npcId) {
      if (matches.length === 0) addLine(store, "You don't see anyone like that here.", C.ERROR_COLOR);
      return;
    }
  }

  const npc = npcData[npcId];
  if (!npc) {
    addLine(store, "There's no one to talk to here.", C.ERROR_COLOR);
    return;
  }

  store.npcDialogue = { npcId, currentNode: 'start' };
  store.player.firedEvents[`talked_${npcId}`] = true;
  displayDialogueNode(store);
  store.state = 'dialogue';

  // Chatterbox achievement: check if all NPCs have been talked to
  const allNpcIds = Object.keys(npcData);
  if (allNpcIds.length > 0 && allNpcIds.every(id => store.player!.firedEvents[`talked_${id}`])) {
    checkAchievement(store, 'chatterbox');
  }
}

function displayDialogueNode(store: GameStore): void {
  if (!store.npcDialogue || !store.player) return;
  const npc = npcData[store.npcDialogue.npcId];
  if (!npc) return;
  const node = npc.dialogue[store.npcDialogue.currentNode];
  if (!node) return;

  addLine(store, '');
  for (const line of node.text) {
    addLine(store, line, C.NPC_COLOR);
  }

  const visibleChoices = node.choices.filter(c =>
    !c.condition || checkDialogueCondition(c.condition, store.player!)
  );

  store.dialogueOptions = visibleChoices.map(c => c.label);
  addLine(store, '');
  visibleChoices.forEach((choice, i) => {
    addLine(store, `[${i + 1}] ${choice.label}`, C.CHOICE_COLOR);
  });
}

function handleNpcDialogueInput(store: GameStore, input: string): void {
  if (!store.npcDialogue || !store.player || !store.world) return;

  const npc = npcData[store.npcDialogue.npcId];
  if (!npc) return;
  const node = npc.dialogue[store.npcDialogue.currentNode];
  if (!node) return;

  const visibleChoices = node.choices.filter(c =>
    !c.condition || checkDialogueCondition(c.condition, store.player!)
  );

  const trimmed = input.trim();
  const num = parseInt(trimmed, 10);
  let choiceIdx = -1;

  if (!isNaN(num) && num >= 1 && num <= visibleChoices.length) {
    choiceIdx = num - 1;
  } else {
    for (let i = 0; i < visibleChoices.length; i++) {
      if (trimmed.toLowerCase() === visibleChoices[i].label.toLowerCase()) {
        choiceIdx = i;
        break;
      }
    }
  }

  if (choiceIdx < 0) {
    addLine(store, `Choose an option: 1-${visibleChoices.length}`, C.ERROR_COLOR);
    return;
  }

  const choice = visibleChoices[choiceIdx];

  // Apply effects
  if (choice.effect) {
    const eff = choice.effect;
    if (eff.give_item) {
      addItem(store.player, eff.give_item, itemData);
      const idata = itemData[eff.give_item];
      if (idata) addLine(store, `Received: ${idata.name}`, C.ITEM_COLOR);
    }
    if (eff.give_weapon) {
      addWeapon(store.player, eff.give_weapon);
      const wdata = weaponData[eff.give_weapon];
      if (wdata) addLine(store, `Received: ${wdata.name}`, C.ITEM_COLOR);
    }
    if (eff.heal && eff.heal > 0) {
      playerHeal(store.player, eff.heal);
      addLine(store, `Healed ${eff.heal} HP.`, C.ITEM_COLOR);
      updateHeader(store);
    }
    if (eff.set_flag) {
      store.player.firedEvents[eff.set_flag] = true;
    }
    if (eff.remove_item) {
      removeItem(store.player, eff.remove_item);
    }
  }

  if (choice.next === null) {
    addLine(store, '');
    addLine(store, `${npc.name} nods farewell.`, C.NPC_COLOR);
    store.npcDialogue = null;
    store.state = 'exploring';
  } else {
    store.npcDialogue.currentNode = choice.next;
    displayDialogueNode(store);
  }
}

// ---- Save Slot Picker ----

function openSlotPicker(store: GameStore, mode: 'save' | 'load'): void {
  store.slotPickerMode = mode;
  store.slotPickerSelected = 0;
  store.slotManifest = loadManifest();
  store.renamingSlot = false;
  store.renameBuffer = '';
  store.state = 'slot_picker';
}

function handleSlotPickerKey(s: GameStore, key: string): void {
  if (!s.slotManifest) return;

  if (s.renamingSlot) {
    if (key === 'Enter') {
      const slot = s.slotPickerSelected + 1;
      renameSlot(slot, s.renameBuffer);
      s.slotManifest = loadManifest();
      s.renamingSlot = false;
      s.renameBuffer = '';
    } else if (key === 'Escape') {
      s.renamingSlot = false;
      s.renameBuffer = '';
    } else if (key === 'Backspace') {
      s.renameBuffer = s.renameBuffer.slice(0, -1);
    }
    // Text input handled by handleTextInput
    return;
  }

  if (key === 'ArrowUp') {
    s.slotPickerSelected--;
    if (s.slotPickerSelected < 0) s.slotPickerSelected = s.slotManifest.slots.length - 1;
    emitSound(s, 'menuMove');
  } else if (key === 'ArrowDown') {
    s.slotPickerSelected++;
    if (s.slotPickerSelected >= s.slotManifest.slots.length) s.slotPickerSelected = 0;
    emitSound(s, 'menuMove');
  } else if (key === 'Enter') {
    const slot = s.slotPickerSelected + 1;
    if (s.slotPickerMode === 'save') {
      if (s.player && s.world && saveToSlot(slot, s.player, s.world, s.dungeon)) {
        s.activeSlot = slot;
        emitSound(s, 'save');
        s.state = 'exploring';
        s.slotPickerMode = null;
        addLine(s, 'Game saved.', C.ITEM_COLOR);
      }
    } else if (s.slotPickerMode === 'load') {
      const meta = s.slotManifest.slots[s.slotPickerSelected];
      if (meta.isEmpty) {
        addLine(s, 'That slot is empty.', C.ERROR_COLOR);
        return;
      }
      s.slotPickerMode = null;
      startContinue(s, slot);
    }
  } else if (key === 'r' || key === 'R') {
    s.renamingSlot = true;
    s.renameBuffer = s.slotManifest.slots[s.slotPickerSelected].name;
  } else if (key === 'Escape') {
    s.state = s.player ? 'exploring' : 'menu';
    s.slotPickerMode = null;
  }
}

// ---- Dungeon Mode ----

function startDungeonMode(store: GameStore, seed?: number): void {
  const actualSeed = seed ?? Date.now();
  store.gameMode = 'dungeon';
  store.player = createPlayer('dng_f1_r1');
  store.world = createWorld();
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
  enterRoom(store, store.player.currentRoom);
}

function loadDungeonFloor(store: GameStore, floor: number): void {
  if (!store.dungeon || !store.world || !store.player) return;
  const result = generateFloor(floor, store.dungeon.seed);
  store.dungeon.floorEnemies = result.enemies;
  for (const [id, room] of Object.entries(result.rooms)) {
    store.world.rooms[id] = room;
  }
  store.player.currentRoom = result.entryRoomId;
}

function handleDungeonSpecialRoom(store: GameStore, room: RoomDef): void {
  if (!store.player || !store.dungeon) return;

  if (room.specialType === 'fountain' && !store.player.firedEvents[`used_fountain_${room.id}`]) {
    store.state = 'dialogue';
    store.dialogueOptions = ['Drink from the fountain', 'Leave it alone'];
    addLine(store, '');
    addLine(store, 'The fountain beckons...', C.CHOICE_COLOR);
    store.dialogueOptions.forEach((opt, i) => {
      addLine(store, `[${i + 1}] ${opt}`, C.CHOICE_COLOR);
    });
  } else if (room.specialType === 'altar' && !store.player.firedEvents[`used_altar_${room.id}`]) {
    store.state = 'dialogue';
    store.dialogueOptions = ['Embrace the darkness (+5 ATK, -3 DEF)', 'Resist (heal 10 HP)', 'Ignore'];
    addLine(store, '');
    addLine(store, 'The altar pulses with dark energy...', C.CHOICE_COLOR);
    store.dialogueOptions.forEach((opt, i) => {
      addLine(store, `[${i + 1}] ${opt}`, C.CHOICE_COLOR);
    });
  } else if (room.specialType === 'library' && !store.player.firedEvents[`used_library_${room.id}`]) {
    const perks = [
      { label: 'Tome of Strength (+2 ATK)' },
      { label: 'Tome of Resilience (+2 DEF)' },
      { label: 'Tome of Vitality (+10 max HP)' },
      { label: 'Tome of Healing (full HP)' },
      { label: 'Tome of Experience (+30 XP)' },
    ];
    // Pick 2 random perks
    const shuffled = perks.slice().sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, 2);

    store.state = 'dialogue';
    store.dialogueOptions = [chosen[0].label, chosen[1].label, 'Leave'];
    addLine(store, '');
    addLine(store, 'Ancient tomes offer forbidden knowledge. Choose wisely...', C.CHOICE_COLOR);
    store.dialogueOptions.forEach((opt, i) => {
      addLine(store, `[${i + 1}] ${opt}`, C.CHOICE_COLOR);
    });
  }
}

function handleDungeonSpecialChoice(store: GameStore, room: RoomDef, input: string): void {
  if (!store.player || !store.dungeon) return;
  const choice = parseInt(input.trim(), 10);

  if (room.specialType === 'fountain') {
    store.player.firedEvents[`used_fountain_${room.id}`] = true;
    if (choice === 1) {
      if (Math.random() < 0.7) {
        const healAmt = Math.floor(store.player.maxHp * 0.3);
        const old = store.player.hp;
        playerHeal(store.player, healAmt);
        addLine(store, `The water restores you! +${store.player.hp - old} HP.`, C.ITEM_COLOR);
        emitSound(store, 'pickup');
      } else {
        const dmg = Math.floor(store.player.maxHp * 0.1);
        store.player.hp = Math.max(1, store.player.hp - dmg);
        addLine(store, `The water is poisoned! -${dmg} HP.`, C.ERROR_COLOR);
        emitSound(store, 'playerHit');
      }
    } else {
      addLine(store, 'You leave the fountain alone.', C.HELP_COLOR);
    }
    store.state = 'exploring';
    updateHeader(store);
  } else if (room.specialType === 'altar') {
    store.player.firedEvents[`used_altar_${room.id}`] = true;
    if (choice === 1) {
      store.player.buffAttack += 5;
      store.player.defense = Math.max(0, store.player.defense - 3);
      addLine(store, 'Dark power surges through you! +5 ATK, -3 DEF for this floor.', C.COMBAT_COLOR);
      emitSound(store, 'equip');
    } else if (choice === 2) {
      playerHeal(store.player, 10);
      addLine(store, 'You resist the darkness and feel renewed. +10 HP.', C.ITEM_COLOR);
    } else {
      addLine(store, 'You step away from the altar.', C.HELP_COLOR);
    }
    store.state = 'exploring';
    updateHeader(store);
  } else if (room.specialType === 'library') {
    store.player.firedEvents[`used_library_${room.id}`] = true;
    const opt = store.dialogueOptions[choice - 1];
    if (opt && opt !== 'Leave') {
      if (!store.dungeon.dungeonPerks) store.dungeon.dungeonPerks = [];
      store.dungeon.dungeonPerks.push(opt);

      // Apply immediate effects
      if (opt.includes('+2 ATK')) {
        store.player.attack += 2;
        addLine(store, `You absorb the knowledge: +2 ATK!`, C.CHOICE_COLOR);
      } else if (opt.includes('+2 DEF')) {
        store.player.defense += 2;
        addLine(store, `You absorb the knowledge: +2 DEF!`, C.CHOICE_COLOR);
      } else if (opt.includes('+10 max HP')) {
        store.player.maxHp += 10;
        store.player.hp += 10;
        addLine(store, `You absorb the knowledge: +10 max HP!`, C.CHOICE_COLOR);
      } else if (opt.includes('full HP')) {
        store.player.hp = store.player.maxHp;
        addLine(store, `You absorb the knowledge: fully healed!`, C.CHOICE_COLOR);
      } else if (opt.includes('+30 XP')) {
        addXp(store.player, 30);
        addLine(store, `You absorb the knowledge: +30 XP!`, C.CHOICE_COLOR);
      }
      emitSound(store, 'levelUp');
    } else {
      addLine(store, 'You leave the library undisturbed.', C.HELP_COLOR);
    }
    store.state = 'exploring';
    updateHeader(store);
  }
}

function handleDungeonRestInput(store: GameStore, input: string): void {
  if (!store.player || !store.world || !store.dungeon) return;
  const trimmed = input.trim().toLowerCase();

  if (trimmed === '1' || trimmed === 'rest') {
    const healAmount = Math.floor(store.player.maxHp * 0.5);
    playerHeal(store.player, healAmount);
    updateHeader(store);
    addLine(store, `You rest and recover ${healAmount} HP.`, C.ITEM_COLOR);
    addLine(store, '');
    // Re-display rest choices
    addLine(store, 'What would you like to do?', C.CHOICE_COLOR);
    store.dialogueOptions = ['Rest (heal 50% HP)', 'Save', 'Continue to next floor'];
    store.dialogueOptions.forEach((opt, i) => {
      addLine(store, `[${i + 1}] ${opt}`, C.CHOICE_COLOR);
    });
  } else if (trimmed === '2' || trimmed === 'save') {
    openSlotPicker(store, 'save');
  } else if (trimmed === '3' || trimmed === 'continue' || trimmed === 'descend') {
    store.dungeon.floor++;
    store.dungeon.score.floorsCleared++;
    if (store.dungeon.floor >= 5) checkAchievement(store, 'dungeon_crawler');
    if (store.dungeon.floor >= 20) checkAchievement(store, 'dungeon_master');
    loadDungeonFloor(store, store.dungeon.floor);
    clearTerminal(store);
    addLine(store, `--- Floor ${store.dungeon.floor} ---`, C.COMBAT_COLOR);
    addLine(store, '');
    store.state = 'exploring';
    enterRoom(store, store.player.currentRoom);
    updateHeader(store);
  } else {
    addLine(store, 'Choose [1], [2], or [3].', C.ERROR_COLOR);
  }
}

// ---- Public API ----

export function createInitialStore(): GameStore {
  const store: GameStore = {
    state: 'boot',
    lines: [],
    typewriterQueue: [],
    typewriterPos: 0,
    input: '',
    baseColor: [...C.BASE_COLOR],
    header: { title: '', hp: 0, maxHp: 0, level: 0, weapon: '' },
    player: null,
    world: null,
    combat: null,
    combatEnemyId: null,
    effects: createEffects(),
    bootIndex: 0,
    bootTimer: 0,
    bootLineDelay: 0.3,
    bootDoneTimer: 0,
    bootTitleShown: false,
    menuSelected: 0,
    dialogueEnding: null,
    dialogueOptions: [],
    endingData: null,
    endingLineIndex: 0,
    endingTimer: 0,
    endingAllTyped: false,
    endingPsychedelicTime: 0,
    gameoverReady: false,
    currentRegion: null,
    commandHistory: [],
    historyIndex: -1,
    savedInput: '',
    soundQueue: [],
    slotPickerMode: null,
    slotPickerSelected: 0,
    slotManifest: null,
    activeSlot: null,
    renamingSlot: false,
    renameBuffer: '',
    npcDialogue: null,
    minimapOpen: false,
    minimapPan: { x: 0, y: 0 },
    gameMode: 'story',
    dungeon: null,
    lastCommand: null,
    tabSuggestions: [],
    tabIndex: -1,
    tabPrefix: '',
    settingsSelected: 0,
    settingsPrevState: 'menu',
  };
  return store;
}

export type GameAction =
  | { type: 'TICK'; dt: number }
  | { type: 'KEY_PRESSED'; key: string }
  | { type: 'TEXT_INPUT'; text: string };

export function gameReducer(store: GameStore, action: GameAction): GameStore {
  // Clone for immutability at top level
  const s = { ...store };

  switch (action.type) {
    case 'TICK':
      return handleTick(s, action.dt);
    case 'KEY_PRESSED':
      handleKeyPressed(s, action.key);
      return s;
    case 'TEXT_INPUT':
      handleTextInput(s, action.text);
      return s;
    default:
      return s;
  }
}

function isTyping(s: GameStore): boolean {
  return s.typewriterQueue.length > 0;
}

function skipTypewriter(s: GameStore): void {
  for (const line of s.typewriterQueue) {
    s.lines.push(line);
  }
  s.typewriterQueue = [];
  s.typewriterPos = 0;
}

function handleTick(s: GameStore, dt: number): GameStore {
  // Typewriter is handled by the component's animation loop (not here)

  // Boot sequence
  if (s.state === 'boot') {
    updateBoot(s, dt);
  }

  // Ending sequence
  if (s.state === 'ending') {
    updateEnding(s, dt);
  }

  // Rainbow tint for hidden region
  if (s.state === 'exploring' && s.currentRegion === 'hidden') {
    updateRainbowTint(s.effects);
  }

  // Gameover ready
  if (s.state === 'gameover' && !isTyping(s)) {
    s.gameoverReady = true;
  }

  // Trim line buffer
  if (s.lines.length > 500) {
    s.lines = s.lines.slice(s.lines.length - 500);
  }

  return s;
}

function updateBoot(s: GameStore, dt: number): void {
  if (s.bootIndex <= C.BOOT_LINES.length) {
    s.bootTimer += dt;
    if (s.bootTimer >= s.bootLineDelay) {
      s.bootTimer = 0;
      s.bootIndex++;
      if (s.bootIndex <= C.BOOT_LINES.length) {
        const line = C.BOOT_LINES[s.bootIndex - 1];
        const color = line.includes('WARNING') ? C.ERROR_COLOR : C.MENU_COLOR;
        addLine(s, line, color);
        s.bootLineDelay = 0.4;
      }
    }
  } else {
    if (!isTyping(s)) {
      if (!s.bootTitleShown) {
        addLine(s, '');
        displayAscii(s, 'title', C.MENU_COLOR);
        addLine(s, '');
        s.bootTitleShown = true;
      } else if (!isTyping(s)) {
        s.bootDoneTimer += dt;
        if (s.bootDoneTimer >= 1.5) {
          startMenu(s);
        }
      }
    }
  }
}

function updateEnding(s: GameStore, dt: number): void {
  if (s.endingData && !s.endingAllTyped) {
    if (!isTyping(s)) {
      s.endingTimer += dt;
      if (s.endingTimer >= 0.3) {
        s.endingTimer = 0;
        s.endingLineIndex++;
        if (s.endingLineIndex <= s.endingData.text.length) {
          addLine(s, s.endingData.text[s.endingLineIndex - 1], s.baseColor);
        } else {
          s.endingAllTyped = true;
          addLine(s, '');
          addLine(s, 'Press any key to return to menu.', C.HELP_COLOR);
        }
      }
    }
  }

  // Psychedelic rainbow
  if (s.endingData?.terminal_effect === 'psychedelic') {
    s.endingPsychedelicTime += dt;
    const t = s.endingPsychedelicTime * 2;
    const r = Math.sin(t) * 0.5 + 0.5;
    const g = Math.sin(t + 2.094) * 0.5 + 0.5;
    const b = Math.sin(t + 4.189) * 0.5 + 0.5;
    s.baseColor = [r, g, b, 1];
  }
}

function handleKeyPressed(s: GameStore, key: string): void {
  if (s.state === 'boot') {
    if (isTyping(s)) skipTypewriter(s);
    return;
  }

  if (s.state === 'menu') {
    handleMenuKey(s, key);
    return;
  }

  if (s.state === 'ending') {
    if (isTyping(s)) {
      skipTypewriter(s);
      return;
    }
    if (s.endingAllTyped) {
      s.endingData = null;
      s.baseColor = [...C.BASE_COLOR];
      startMenu(s);
    }
    return;
  }

  if (s.state === 'slot_picker') {
    handleSlotPickerKey(s, key);
    return;
  }

  if (s.state === 'minimap') {
    if (key === 'Escape') {
      s.state = 'exploring';
      s.minimapOpen = false;
    }
    return;
  }

  if (s.state === 'settings') {
    handleSettingsKey(s, key);
    return;
  }

  // States with text input — allow typing while typewriter runs
  if (key === 'Tab') {
    // Autocomplete
    if (s.tabSuggestions.length > 0 && s.tabIndex >= 0) {
      // Cycle to next suggestion
      s.tabIndex = (s.tabIndex + 1) % s.tabSuggestions.length;
    } else {
      // Start new autocomplete
      const suggestions = getAutocompleteSuggestions(s, s.input);
      if (suggestions.length === 0) return;
      s.tabPrefix = s.input;
      s.tabSuggestions = suggestions;
      s.tabIndex = 0;
    }
    // Apply the current suggestion
    const parts = s.tabPrefix.split(/\s+/);
    if (parts.length <= 1) {
      s.input = s.tabSuggestions[s.tabIndex];
    } else {
      s.input = parts[0] + ' ' + s.tabSuggestions[s.tabIndex];
    }
    return;
  }

  // Any non-Tab key resets autocomplete state
  if (s.tabSuggestions.length > 0) {
    s.tabSuggestions = [];
    s.tabIndex = -1;
    s.tabPrefix = '';
  }

  if (key === 'Backspace') {
    s.input = s.input.slice(0, -1);
    s.historyIndex = -1; // reset history browsing on edit
  } else if (key === 'ArrowUp') {
    // Browse command history (older)
    if (s.commandHistory.length === 0) return;
    if (s.historyIndex === -1) {
      s.savedInput = s.input;
      s.historyIndex = s.commandHistory.length - 1;
    } else if (s.historyIndex > 0) {
      s.historyIndex--;
    }
    s.input = s.commandHistory[s.historyIndex];
  } else if (key === 'ArrowDown') {
    // Browse command history (newer)
    if (s.historyIndex === -1) return;
    if (s.historyIndex < s.commandHistory.length - 1) {
      s.historyIndex++;
      s.input = s.commandHistory[s.historyIndex];
    } else {
      s.historyIndex = -1;
      s.input = s.savedInput;
    }
  } else if (key === 'Enter') {
    // Skip any remaining typewriter text first
    if (isTyping(s)) skipTypewriter(s);

    const input = s.input;
    if (input.length > 0) {
      // Push to command history (skip duplicates of last entry)
      if (s.commandHistory.length === 0 || s.commandHistory[s.commandHistory.length - 1] !== input) {
        s.commandHistory.push(input);
        if (s.commandHistory.length > 50) s.commandHistory.shift(); // cap at 50
      }
      s.historyIndex = -1;
      s.savedInput = '';

      addLineInstant(s, `> ${input}`, C.INPUT_ECHO_COLOR);
      emitSound(s, 'submit');
      s.input = '';

      if (s.state === 'dialogue') {
        handleDialogueInput(s, input);
      } else if (s.state === 'gameover') {
        handleGameoverInput(s, input);
      } else {
        const [verb, target] = parseCommand(input);
        if (verb) {
          if (s.state === 'combat') {
            handleCombatCommand(s, verb, target);
          } else {
            handleExploringCommand(s, verb, target);
          }
        }
      }
    } else if (isTyping(s)) {
      // Enter with empty input just skips typewriter
    }
  }
}

// Settings rows: [fontSize, colorMode, textSpeed, masterVolume, sfx, ambient, typewriterSound]
const SETTINGS_ROWS = ['Font Size', 'Color Mode', 'Text Speed', 'Master Volume', 'Sound Effects', 'Ambient Music', 'Typewriter Clicks'] as const;

function openSettings(s: GameStore, fromState: GameStateKind): void {
  s.settingsPrevState = fromState;
  s.settingsSelected = 0;
  s.state = 'settings';
}

function handleSettingsKey(s: GameStore, key: string): void {
  const settings = loadSettings();

  if (key === 'ArrowUp') {
    s.settingsSelected = (s.settingsSelected - 1 + SETTINGS_ROWS.length) % SETTINGS_ROWS.length;
    emitSound(s, 'menuMove');
  } else if (key === 'ArrowDown') {
    s.settingsSelected = (s.settingsSelected + 1) % SETTINGS_ROWS.length;
    emitSound(s, 'menuMove');
  } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const dir = key === 'ArrowRight' ? 1 : -1;
    const row = s.settingsSelected;

    if (row === 0) { // Font Size
      const idx = FONT_SIZE_OPTIONS.indexOf(settings.fontSize);
      settings.fontSize = FONT_SIZE_OPTIONS[(idx + dir + FONT_SIZE_OPTIONS.length) % FONT_SIZE_OPTIONS.length];
    } else if (row === 1) { // Color Mode
      const idx = COLOR_MODE_OPTIONS.indexOf(settings.colorMode);
      settings.colorMode = COLOR_MODE_OPTIONS[(idx + dir + COLOR_MODE_OPTIONS.length) % COLOR_MODE_OPTIONS.length];
    } else if (row === 2) { // Text Speed
      const idx = TEXT_SPEED_OPTIONS.indexOf(settings.textSpeed);
      settings.textSpeed = TEXT_SPEED_OPTIONS[(idx + dir + TEXT_SPEED_OPTIONS.length) % TEXT_SPEED_OPTIONS.length];
    } else if (row === 3) { // Master Volume
      settings.masterVolume = Math.max(0, Math.min(100, settings.masterVolume + dir * 10));
    } else if (row === 4) { // SFX
      settings.sfxEnabled = !settings.sfxEnabled;
    } else if (row === 5) { // Ambient
      settings.ambientEnabled = !settings.ambientEnabled;
    } else if (row === 6) { // Typewriter clicks
      settings.typewriterSound = !settings.typewriterSound;
    }

    saveSettings(settings);
    emitSound(s, 'menuMove');
  } else if (key === 'Escape' || key === 'Enter') {
    s.state = s.settingsPrevState;
    emitSound(s, 'menuSelect');
  }
}

function handleMenuKey(s: GameStore, key: string): void {
  if (key === 'ArrowUp' || key === 'w') {
    s.menuSelected--;
    if (s.menuSelected < 0) s.menuSelected = C.MENU_OPTIONS.length - 1;
    emitSound(s, 'menuMove');
  } else if (key === 'ArrowDown' || key === 's') {
    s.menuSelected++;
    if (s.menuSelected >= C.MENU_OPTIONS.length) s.menuSelected = 0;
    emitSound(s, 'menuMove');
  } else if (key === 'Enter') {
    const option = C.MENU_OPTIONS[s.menuSelected];
    if (option === 'NEW GAME') {
      emitSound(s, 'menuSelect');
      startNewGame(s);
    } else if (option === 'CONTINUE') {
      emitSound(s, 'menuSelect');
      if (anySlotHasData()) openSlotPicker(s, 'load');
    } else if (option === 'DUNGEON MODE') {
      emitSound(s, 'menuSelect');
      startDungeonMode(s);
    } else if (option === 'SETTINGS') {
      emitSound(s, 'menuSelect');
      openSettings(s, 'menu');
    } else if (option === 'QUIT') {
      // In web, "quit" goes back to menu title
      startMenu(s);
    }
  }
}

function handleTextInput(s: GameStore, text: string): void {
  if (s.state === 'boot' || s.state === 'menu' || s.state === 'ending' || s.state === 'minimap' || s.state === 'settings') return;
  if (s.state === 'slot_picker' && s.renamingSlot) {
    s.renameBuffer += text;
    return;
  }
  if (s.state === 'slot_picker') return;
  // Allow typing at any time, even while typewriter is running
  s.input += text;
}
