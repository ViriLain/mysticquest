// ---- Data types (matching JSON structure) ----

/**
 * An objective lives in one of three states:
 *   - untriggered (absent from `player.objectives`)
 *   - 'active'    (trigger fired, completion not yet satisfied)
 *   - 'complete'  (completion satisfied)
 *
 * Completion is a pure function of store state. When any trigger fires,
 * the engine re-checks all active objectives against current state, so an
 * objective whose completion is already satisfied at trigger time goes
 * straight from untriggered → complete in one step.
 */
export type ObjectiveStatus = 'active' | 'complete';

/**
 * What reveals an objective to the player. All triggers fire at most once
 * per objective — re-triggering an already-active or already-complete
 * objective is a no-op.
 *
 * | Type                 | Required field | Fires when                                      |
 * | -------------------- | -------------- | ----------------------------------------------- |
 * | talked_to_npc        | npc            | Player talks to the named NPC for the first time |
 * | entered_room         | room           | Player enters the named room for the first time  |
 * | searched_room        | room           | Player successfully searches the room            |
 * | took_item            | item           | Player picks up the named item or weapon         |
 * | defeated_enemy       | enemy          | Player wins combat against the enemy             |
 * | objective_completed  | objective      | Another objective (by id) becomes complete       |
 */
export interface ObjectiveTrigger {
  type:
    | 'talked_to_npc'
    | 'entered_room'
    | 'searched_room'
    | 'took_item'
    | 'defeated_enemy'
    | 'objective_completed';
  npc?: string;
  room?: string;
  item?: string;
  enemy?: string;
  objective?: string;
}

/**
 * What marks an objective as complete. Re-evaluated after every trigger.
 *
 * | Type                   | Required fields    | Complete when                                                        |
 * | ---------------------- | ------------------ | -------------------------------------------------------------------- |
 * | key_items_collected    | items[]            | All listed ids are present in keyItems OR inventory                  |
 * | enemy_defeated         | enemy              | Any room's `_dead_enemies` contains the enemy id                     |
 * | visited_rooms_percent  | percent            | Visited non-hidden non-dungeon rooms ≥ percent × non-hidden total    |
 * | used_items_in_room     | room, items[]      | All listed items appear in `usedItemsInRoom[room]`                   |
 * | objective_completed    | objective          | Another objective (by id) is in `complete` state                     |
 */
export interface ObjectiveCompletion {
  type:
    | 'key_items_collected'
    | 'enemy_defeated'
    | 'visited_rooms_percent'
    | 'used_items_in_room'
    | 'objective_completed';
  items?: string[];
  enemy?: string;
  percent?: number;
  room?: string;
  objective?: string;
}

export interface ObjectiveDef {
  id: string;
  title: string;
  hint: string;
  trigger: ObjectiveTrigger;
  completion: ObjectiveCompletion;
  completion_text: string;
}

export interface WeaponDef {
  name: string;
  attack_bonus: number;
  region: string;
  description: string;
  match_words?: string[];
  price?: number;
}

export interface ItemDef {
  name: string;
  type: 'consumable' | 'shield' | 'key';
  effect?: string;
  value?: number;
  description: string;
  match_words?: string[];
  price?: number;
}

export interface EnemyDef {
  name: string;
  hp: number;
  attack: number;
  defense: number;
  xp: number;
  gold?: number;
  loot: string[];
  loot_weapon?: string;
  region: string;
  description: string;
  is_boss: boolean;
}

export interface RoomDef {
  id: string;
  name: string;
  region: string;
  description: string;
  description_cleared?: string;
  clear_flag?: string;
  exits: Record<string, string>;
  /**
   * Hidden exits that only become real after the player searches the room.
   * Until search reveals them, they are invisible to display, autocomplete,
   * and the minimap. After reveal they are copied into `_dynamic_exits` and
   * behave like any other exit.
   */
  secret_exits?: Record<string, string>;
  items?: string[];
  weapons?: string[];
  enemies?: string[];
  searchable?: boolean;
  search_items?: string[];
  on_enter?: string;
  dev_note?: string;
  npcs?: string[];
  specialType?: 'fountain' | 'vault' | 'altar' | 'library';
  // Runtime state
  _dead_enemies?: Record<string, boolean>;
  _dynamic_exits?: Record<string, string>;
  _ground_loot?: string[];
  _ground_weapons?: string[];
}

export interface RegionData {
  rooms: RoomDef[];
}

export interface EndingDef {
  title: string;
  trigger_type: 'boss_defeated' | 'choice' | 'exploration' | 'multi_item_use';
  trigger_value?: string;
  trigger_room?: string;
  trigger_item?: string;
  trigger_items?: string[];
  trigger_exit_target?: string;
  trigger_exit_dir?: string;
  rooms_percent?: number;
  choice_prompt?: string;
  choice_options?: string[];
  choice_trigger?: number;
  terminal_effect?: string;
  text: string[];
}

// ---- Game state types ----

export interface DialogueCondition {
  type: 'has_key_item' | 'has_item' | 'level_gte' | 'flag_set' | 'flag_not_set';
  value: string | number;
}

export interface DialogueEffect {
  give_item?: string;
  give_weapon?: string;
  heal?: number;
  set_flag?: string;
  remove_item?: string;
  open_shop?: string;
}

export interface DialogueChoice {
  label: string;
  next: string | null;
  condition?: DialogueCondition;
  effect?: DialogueEffect;
}

export interface DialogueNode {
  text: string[];
  choices: DialogueChoice[];
}

export interface NpcDef {
  name: string;
  description: string;
  match_words: string[];
  dialogue: Record<string, DialogueNode>;
}

export interface SaveSlotMeta {
  name: string;
  level: number;
  currentRoom: string;
  roomName: string;
  timestamp: number;
  isEmpty: boolean;
}

export interface SaveManifest {
  version: number;
  slots: SaveSlotMeta[];
}

export type SkillId =
  | 'iron_will' | 'heavy_blows' | 'thick_skin' | 'berserker' | 'titan'
  | 'sharp_eyes' | 'quick_feet' | 'precision' | 'lucky' | 'assassin'
  | 'herbalism' | 'arcane_shield' | 'buff_mastery' | 'meditation' | 'enlightened';

export type SkillBranch = 'warrior' | 'rogue' | 'mage';

export interface SkillDef {
  id: SkillId;
  name: string;
  branch: SkillBranch;
  description: string;
  tier: number;
}

export type GameStateKind = 'boot' | 'menu' | 'exploring' | 'combat' | 'dialogue' | 'ending' | 'gameover' | 'slot_picker' | 'minimap' | 'settings' | 'shop' | 'quit';

export type RGBA = [number, number, number, number];

export interface TerminalLine {
  text: string;
  color: RGBA;
}

export interface PlayerState {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  level: number;
  xp: number;
  gold: number;
  currentRoom: string;
  inventory: Record<string, number>;
  weapons: string[];
  equippedWeapon: string | null;
  equippedShield: string | null;
  keyItems: Record<string, boolean>;
  visitedRooms: Record<string, boolean>;
  searchedRooms: Record<string, boolean>;
  firedEvents: Record<string, boolean>;
  usedItemsInRoom: Record<string, Record<string, boolean>>; // roomId -> { itemId -> true }
  defending: boolean;
  buffAttack: number;
  buffRounds: number;
  routeHistory: string[];
  objectives: Record<string, ObjectiveStatus>;
  skillPoints: number;
  skills: Record<string, boolean>;
}

export interface EnemyInstance {
  name: string;
  hp: number;
  attack: number;
  defense: number;
  xp: number;
  gold: number;
  loot: string[];
  lootWeapon?: string;
  isBoss: boolean;
  description: string;
}

export interface CombatState {
  enemy: EnemyInstance;
  round: number;
  finished: boolean;
  fled: boolean;
  playerWon: boolean;
}

export interface EffectsState {
  shake: { x: number; y: number };
  flash: { r: number; g: number; b: number; a: number };
  tint: { r: number; g: number; b: number; a: number };
  glitch: number;
  jitter: number;
  rainbowTime: number;
  active: ActiveEffect[];
}

export interface ActiveEffect {
  type: 'shake' | 'flash' | 'glitch' | 'jitter';
  duration: number;
  elapsed: number;
  params: Record<string, number>;
}

export interface WorldState {
  rooms: Record<string, RoomDef>;
  regions: Record<string, string[]>;
}

export interface HeaderState {
  title: string;
  hp: number;
  maxHp: number;
  level: number;
  gold: number;
  weapon: string;
}

export interface ShopRuntimeState {
  shopId: string;
  remainingStock: Record<string, number>;
}

export interface ShopStateContainer {
  activeShopId: string | null;
  runtime: Record<string, ShopRuntimeState>;
}

export interface GameStore {
  state: GameStateKind;
  lines: TerminalLine[];
  typewriterQueue: TerminalLine[];
  typewriterPos: number;
  input: string;
  baseColor: RGBA;
  header: HeaderState;
  shopState: ShopStateContainer;
  player: PlayerState | null;
  world: WorldState | null;
  combat: CombatState | null;
  combatEnemyId: string | null;
  effects: EffectsState;
  bootIndex: number;
  bootTimer: number;
  bootLineDelay: number;
  bootDoneTimer: number;
  bootTitleShown: boolean;
  menuSelected: number;
  dialogueEnding: EndingDef | null;
  dialogueOptions: string[];
  dialogueSelected: number;
  endingData: EndingDef | null;
  endingLineIndex: number;
  endingTimer: number;
  endingAllTyped: boolean;
  endingPsychedelicTime: number;
  gameoverReady: boolean;
  currentRegion: string | null;
  commandHistory: string[];
  historyIndex: number; // -1 = not browsing, 0..n = browsing
  savedInput: string;   // input before user started browsing history
  soundQueue: string[]; // sfx names to play this frame

  // Journal & route
  // (stored in PlayerState)

  // Save slots
  slotPickerMode: 'save' | 'load' | null;
  slotPickerSelected: number;
  slotManifest: SaveManifest | null;
  activeSlot: number | null;
  renamingSlot: boolean;
  renameBuffer: string;

  // NPC dialogue
  npcDialogue: { npcId: string; currentNode: string } | null;

  // Shop menu (buy/sell without target)
  shopMenuMode: 'buy' | 'sell' | null;
  shopMenuItems: Array<{ label: string; id: string; index: number }>;
  shopMenuSelected: number;

  // Minimap
  minimapOpen: boolean;
  minimapPan: { x: number; y: number };

  // Dungeon mode
  gameMode: 'story' | 'dungeon';
  dungeon: DungeonState | null;

  // QoL
  lastCommand: string | null;     // for 'again' command
  tabSuggestions: string[];       // current autocomplete matches
  tabIndex: number;               // cycling index through suggestions
  tabPrefix: string;              // original text before tab was pressed

  // Settings
  settingsSelected: number;       // which setting row is focused
  settingsPrevState: GameStateKind; // state to return to on Escape
}

export interface DungeonScore {
  floorsCleared: number;
  enemiesKilled: number;
  itemsFound: number;
  totalXp: number;
}

export interface DungeonState {
  seed: number;
  floor: number;
  score: DungeonScore;
  floorEnemies: Record<string, EnemyDef>;
  dungeonPerks: string[];
}

export interface CombatMessage {
  text: string;
  color: RGBA;
}

export interface EndingCheckContext {
  bossJustDefeated?: string;
  choiceMade?: string;
  itemJustUsed?: string;
}

export interface CombatResults {
  leveled: boolean;
  loot: string[];
  weapon: string | null;
  messages: CombatMessage[];
}
