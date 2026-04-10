import type {
  EndingCheckContext, GameStore, EndingDef,
  WeaponDef, ItemDef, EnemyDef, NpcDef,
} from './types';
import * as C from './constants';
import { parseCommand } from './commands';
import { visitRoom } from './player';
import { checkAchievement, checkItemAchievements, isUnlocked, tryUnlock } from './achievements';
import { createCombat } from './combat';
import { showScore } from './handlers/info';
import { getRoom, getAdjacentRoom } from './world';
import { createEffects, updateRainbowTint } from './effects';
import { displayRoom } from './display';
import { fireEvent } from './events';
import { checkEndings, getChoicePrompt, getEffectColor } from './endings';
import { ICON, iconLine } from './icons';
import { saveToSlot } from './save';
import { notifyObjectiveEvent } from './objectives';
import { addLine, addLineInstant, applyRegionTint, clearTerminal, displayAscii, emitSound, hideHeader, updateHeader } from './output';
import type { ShopDef } from './economy';
import { handleCombatCommand as handleCombatCommandRaw, type CombatDeps } from './state/combat';
import { handleDialogueInput as handleDialogueInputRaw, handleDungeonSpecialRoom, type DialogueDeps } from './state/dialogue';
import { startGameover, handleGameoverInput as handleGameoverInputRaw } from './state/gameover';
import { getAutocompleteSuggestions as getAutocompleteSuggestionsRaw, handleExploringCommand as handleExploringCommandRaw, type ExploringDeps } from './state/exploring';
import { loadDungeonFloor, startContinue as startContinueRaw, startDungeonMode as startDungeonModeRaw, startMenu, startNewGame as startNewGameRaw } from './state/lifecycle';
import { handleMenuKey as handleMenuKeyRaw } from './state/menu';
import { openSettings, handleSettingsKey } from './state/settings';
import { enterShop, getShopAutocompleteSuggestions, handleShopInput, type ShopDeps } from './state/shop';
import { openSlotPicker, handleSlotPickerKey as handleSlotPickerKeyRaw } from './state/slot-picker';
import npcsJson from '../data/npcs.json';
import shopsJson from '../data/shops.json';
const npcData = npcsJson as Record<string, NpcDef>;

// Data imports
import weaponsJson from '../data/weapons.json';
import itemsJson from '../data/items.json';
import enemiesJson from '../data/enemies.json';
import endingsJson from '../data/endings.json';

const weaponData = weaponsJson as Record<string, WeaponDef>;
const itemData = itemsJson as Record<string, ItemDef>;
const enemyData = enemiesJson as Record<string, EnemyDef>;
const endingsData = endingsJson as Record<string, EndingDef>;
const shopData = shopsJson as Record<string, ShopDef>;

// ---- Helpers ----

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
  notifyObjectiveEvent(store, { type: 'entered_room', room: roomId });
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
    store.dialogueSelected = 0;
    addLine(store, '');
    addLine(store, 'What would you like to do?', C.CHOICE_COLOR);
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
    saveToSlot(store.activeSlot, store.player, store.world, store.dungeon, store.shopState.runtime);
  }

  return true;
}

function checkEndingsContext(store: GameStore, context: EndingCheckContext): boolean {
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
  store.dialogueSelected = 0;

  addLine(store, '');
  addLine(store, ending.choice_prompt || '', C.CHOICE_COLOR);
  addLine(store, '');
}

function startEnding(store: GameStore, ending: EndingDef): void {
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

  addLine(store, iconLine(ICON.enemy, `A ${edata.name} attacks!`), C.ENEMY_COLOR);
  if (edata.description) addLine(store, edata.description, C.HELP_COLOR);
  addLine(store, `HP: ${edata.hp}  ATK: ${edata.attack}  DEF: ${edata.defense}`, C.HELP_COLOR);
  addLine(store, '');
  addLine(store, 'Commands: attack, defend, flee, use <item>', C.COMBAT_COLOR);
}

function buildCombatDeps(store: GameStore): CombatDeps {
  return {
    itemData,
    weaponData,
    enemyData,
    refreshHeader: () => updateHeader(store),
    checkEndingsForBoss: enemyId => {
      checkEndingsContext(store, { bossJustDefeated: enemyId });
    },
    checkAchievement: id => checkAchievement(store, id),
    startGameover: () => startGameover(store),
    getRoom: id => getRoom(store.world!, id),
  };
}

function handleCombatCommand(store: GameStore, verb: string, target: string): void {
  handleCombatCommandRaw(store, verb, target, buildCombatDeps(store));

  if (store.state === 'exploring' && store.player && store.world) {
    checkItemAchievements(store);
    if (store.gameMode === 'story') {
      const totalRooms = Object.keys(store.world.rooms).filter(id => !id.startsWith('dng_')).length;
      const visited = Object.keys(store.player.visitedRooms).filter(id => !id.startsWith('dng_')).length;
      if (totalRooms > 0 && visited / totalRooms >= 0.8) {
        checkAchievement(store, 'explorer');
      }
    }
    if (store.gameMode === 'dungeon' && store.dungeon) {
      if (store.dungeon.floor >= 5) checkAchievement(store, 'dungeon_crawler');
      if (store.dungeon.floor >= 20) checkAchievement(store, 'dungeon_master');
    }
  }
}

function buildExploringDeps(store: GameStore): ExploringDeps {
  return {
    enemyData,
    itemData,
    weaponData,
    npcData,
    refreshHeader: () => updateHeader(store),
    emit: sound => emitSound(store, sound),
    startCombat: enemyId => startCombat(store, enemyId),
    checkEndingsForItem: itemId => {
      checkEndingsContext(store, { itemJustUsed: itemId });
    },
    checkChatterbox: () => {
      const allNpcIds = Object.keys(npcData);
      if (allNpcIds.length > 0 && allNpcIds.every(id => store.player!.firedEvents[`talked_${id}`])) {
        checkAchievement(store, 'chatterbox');
      }
    },
    checkScholar: () => {
      const learnedCount = Object.values(store.player!.skills).filter(Boolean).length;
      if (learnedCount >= 5) {
        checkAchievement(store, 'scholar');
      }
    },
    checkItemAchievements: () => checkItemAchievements(store),
    goDirection: target => {
      if (target === 'descend' && store.gameMode === 'dungeon' && store.dungeon) {
        const room = getRoom(store.world!, store.player!.currentRoom);
        if (room && room.id.startsWith('dng_rest_')) {
          store.dungeon.floor++;
          store.dungeon.score.floorsCleared++;
          if (store.dungeon.floor >= 5) checkAchievement(store, 'dungeon_crawler');
          if (store.dungeon.floor >= 20) checkAchievement(store, 'dungeon_master');
          loadDungeonFloor(store, store.dungeon.floor);
          clearTerminal(store);
          addLine(store, `--- Floor ${store.dungeon.floor} ---`, C.COMBAT_COLOR);
          addLine(store, '');
          enterRoom(store, store.player!.currentRoom);
          updateHeader(store);
          return;
        }
      }

      const nextRoom = getAdjacentRoom(store.world!, store.player!.currentRoom, target);
      if (nextRoom && getRoom(store.world!, nextRoom)) {
        addLine(store, '');
        const entered = enterRoom(store, nextRoom);
        if (entered) updateHeader(store);
      } else {
        addLine(store, "You can't go that way.", C.ERROR_COLOR);
        emitSound(store, 'error');
      }
    },
    doSave: () => {
      if (store.activeSlot !== null) {
        if (store.player && store.world && saveToSlot(store.activeSlot, store.player, store.world, store.dungeon, store.shopState.runtime)) {
          addLine(store, 'Game saved.', C.ITEM_COLOR);
          emitSound(store, 'save');
        } else {
          addLine(store, 'Failed to save game.', C.ERROR_COLOR);
        }
      } else {
        openSlotPicker(store, 'save');
      }
    },
    doLoadPicker: () => openSlotPicker(store, 'load'),
    doMap: () => {
      store.state = 'minimap';
      store.minimapOpen = true;
    },
    doScore: () => showScore(store),
    doSettings: () => openSettings(store, 'exploring'),
    doQuit: () => startMenu(store),
    doAgain: () => {
      if (store.lastCommand) {
        const [verb, target] = parseCommand(store.lastCommand);
        if (verb) {
          addLine(store, `(repeating: ${store.lastCommand})`, C.HELP_COLOR);
          handleExploringCommandRaw(store, verb, target, buildExploringDeps(store));
        }
      } else {
        addLine(store, 'No previous command to repeat.', C.ERROR_COLOR);
      }
    },
    printError: msg => addLine(store, msg, C.ERROR_COLOR),
  };
}

function handleExploringCommand(store: GameStore, verb: string, target: string): void {
  handleExploringCommandRaw(store, verb, target, buildExploringDeps(store));
}

function getAutocompleteSuggestions(store: GameStore, input: string): string[] {
  if (store.state === 'shop') {
    return getShopAutocompleteSuggestions(store, input, buildShopDeps(store));
  }
  return getAutocompleteSuggestionsRaw(store, input, enemyData, itemData, weaponData, npcData);
}

function buildShopDeps(store: GameStore): ShopDeps {
  return {
    shops: shopData,
    itemData,
    weaponData,
    npcData,
    refreshHeader: () => updateHeader(store),
  };
}

function buildDialogueDeps(store: GameStore): DialogueDeps {
  return {
    itemData,
    weaponData,
    npcData,
    refreshHeader: () => updateHeader(store),
    startCombat: enemyId => startCombat(store, enemyId),
    checkEndingsForChoice: choice => checkEndingsContext(store, { choiceMade: choice }),
    openSlotPicker: mode => openSlotPicker(store, mode),
    loadDungeonFloor: floor => loadDungeonFloor(store, floor),
    enterRoom: roomId => enterRoom(store, roomId),
    checkAchievement: id => checkAchievement(store, id),
    openShop: shopId => enterShop(store, shopId, buildShopDeps(store)),
  };
}

function handleDialogueInput(store: GameStore, input: string): void {
  handleDialogueInputRaw(store, input, buildDialogueDeps(store));
}

function handleGameoverInput(store: GameStore, input: string): void {
  handleGameoverInputRaw(store, input, {
    startMenu: () => startMenu(store),
    openSlotPicker: mode => openSlotPicker(store, mode),
    startDungeonMode: seed => startDungeonMode(store, seed),
  });
}

function startNewGame(store: GameStore): void {
  startNewGameRaw(store, { enterRoom: roomId => enterRoom(store, roomId) });
}

function startContinue(store: GameStore, slot: number): void {
  startContinueRaw(store, slot);
}

function startDungeonMode(store: GameStore, seed?: number): void {
  startDungeonModeRaw(store, { enterRoom: roomId => enterRoom(store, roomId) }, seed);
}

function handleSlotPickerKey(s: GameStore, key: string): void {
  handleSlotPickerKeyRaw(s, key, {
    startContinue: slot => startContinue(s, slot),
  });
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
    header: { title: '', hp: 0, maxHp: 0, level: 0, gold: 0, weapon: '' },
    shopState: { activeShopId: null, runtime: {} },
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
    dialogueSelected: 0,
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
    shopMenuMode: null,
    shopMenuItems: [],
    shopMenuSelected: 0,
    shopSellConfirm: null,
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

  if (s.state === 'quit') {
    // Game is over — ignore all input.
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

  // Escape exits shop menu mode back to regular shop input
  if (s.state === 'shop' && s.shopMenuMode && key === 'Escape') {
    s.shopMenuMode = null;
    s.shopMenuItems = [];
    s.shopMenuSelected = 0;
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
    // Dialogue/shop menu: navigate selection
    if (s.state === 'dialogue' && s.dialogueOptions.length > 0) {
      s.dialogueSelected = (s.dialogueSelected - 1 + s.dialogueOptions.length) % s.dialogueOptions.length;
      emitSound(s, 'menuMove');
      return;
    }
    if (s.state === 'shop' && s.shopMenuMode) {
      s.shopMenuSelected = (s.shopMenuSelected - 1 + s.shopMenuItems.length) % s.shopMenuItems.length;
      emitSound(s, 'menuMove');
      return;
    }
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
    // Dialogue/shop menu: navigate selection
    if (s.state === 'dialogue' && s.dialogueOptions.length > 0) {
      s.dialogueSelected = (s.dialogueSelected + 1) % s.dialogueOptions.length;
      emitSound(s, 'menuMove');
      return;
    }
    if (s.state === 'shop' && s.shopMenuMode) {
      s.shopMenuSelected = (s.shopMenuSelected + 1) % s.shopMenuItems.length;
      emitSound(s, 'menuMove');
      return;
    }
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
      // Push to command history — but skip dialogue/shop inputs (numbered
      // choices and buy/sell commands) so that "talk dusty" stays as the
      // last real command the player typed.
      const skipHistory = s.state === 'dialogue' || s.state === 'shop';
      if (!skipHistory && (s.commandHistory.length === 0 || s.commandHistory[s.commandHistory.length - 1] !== input)) {
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
          } else if (s.state === 'shop') {
            handleShopInput(s, verb, target, buildShopDeps(s));
          } else {
            handleExploringCommand(s, verb, target);
          }
        }
      }
    } else if (s.state === 'dialogue' && s.dialogueOptions.length > 0) {
      // Enter with empty input in dialogue: submit the selected option
      emitSound(s, 'menuSelect');
      const selected = String(s.dialogueSelected + 1);
      handleDialogueInput(s, selected);
    } else if (s.state === 'shop' && s.shopMenuMode) {
      // Enter with empty input in shop menu: submit the selected item
      emitSound(s, 'menuSelect');
      if (s.shopMenuMode === 'sell_confirm' && s.shopSellConfirm) {
        // Confirmation menu: Yes (0) or No (1)
        const confirmed = s.shopMenuSelected === 0;
        const { id, type } = s.shopSellConfirm;
        s.shopMenuMode = null;
        s.shopMenuItems = [];
        s.shopMenuSelected = 0;
        s.shopSellConfirm = null;
        if (confirmed) {
          handleShopInput(s, 'sell', id, buildShopDeps(s));
        } else {
          addLineInstant(s, 'Sale cancelled.', C.HELP_COLOR);
        }
        void type; // used by the sell handler via the id match
      } else {
        const item = s.shopMenuItems[s.shopMenuSelected];
        if (item) {
          const mode = s.shopMenuMode;
          s.shopMenuMode = null;
          s.shopMenuItems = [];
          s.shopMenuSelected = 0;
          if (mode === 'buy') {
            handleShopInput(s, 'buy', item.label, buildShopDeps(s));
          } else {
            handleShopInput(s, 'sell', item.label, buildShopDeps(s));
          }
        }
      }
    } else if (isTyping(s)) {
      // Enter with empty input just skips typewriter
    }
  }
}

function handleMenuKey(s: GameStore, key: string): void {
  handleMenuKeyRaw(s, key, {
    startNewGame: () => startNewGame(s),
    openSlotPicker: mode => openSlotPicker(s, mode),
    startDungeonMode: () => startDungeonMode(s),
    openSettings: () => openSettings(s, 'menu'),
  });
}

function handleTextInput(s: GameStore, text: string): void {
  if (s.state === 'boot' || s.state === 'menu' || s.state === 'ending' || s.state === 'minimap' || s.state === 'settings' || s.state === 'quit') return;
  if (s.state === 'slot_picker' && s.renamingSlot) {
    s.renameBuffer += text;
    return;
  }
  if (s.state === 'slot_picker') return;
  // Allow typing at any time, even while typewriter is running
  s.input += text;
}
