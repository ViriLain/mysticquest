// Runtime integrity checks for the JSON content under src/data/.
//
// JSON modules are loaded via Vite's import-as-JSON support and we cast them
// to typed records at call sites. That means a typo in a region file (e.g.,
// an exit pointing at a room that doesn't exist) only manifests as a confusing
// in-game bug — there's no schema validation between the JSON and the typed
// runtime. This module performs cross-content referential checks and returns
// a flat list of errors that callers (tests, dev startup) can act on.
//
// Adding new JSON content? Extend `validateContent` so editing mistakes get
// caught in CI instead of by a player walking into a broken room.

import type {
  AccessoryDef, ArmorDef, EndingDef, EnemyDef, ItemDef,
  ModifierType, NpcDef, ObjectiveDef, RegionData, RoomDef,
  StatusEffectType, WeaponClass, WeaponDef,
} from './types';
import type { ShopDef } from './economy';

export interface ContentBundle {
  regions: RegionData[];
  items: Record<string, ItemDef>;
  weapons: Record<string, WeaponDef>;
  armor: Record<string, ArmorDef>;
  accessories: Record<string, AccessoryDef>;
  enemies: Record<string, EnemyDef>;
  npcs: Record<string, NpcDef>;
  shops: Record<string, ShopDef>;
  endings: Record<string, EndingDef>;
  objectives: ObjectiveDef[];
  startingRoom: string;
}

const VALID_WEAPON_CLASSES: ReadonlySet<WeaponClass> = new Set(['blade', 'heavy', 'pierce', 'magic']);
const VALID_ITEM_TYPES: ReadonlySet<ItemDef['type']> = new Set(['consumable', 'shield', 'key']);
const VALID_STATUS_EFFECTS: ReadonlySet<StatusEffectType> = new Set(['poison', 'burn', 'bleed', 'stun']);
const VALID_ENEMY_STATUS: ReadonlySet<string> = new Set(['poison', 'burn', 'stun']);
const VALID_MODIFIER_TYPES: ReadonlySet<ModifierType> = new Set([
  'attack', 'defense', 'max_hp',
  'crit_chance', 'crit_mult',
  'def_ignore',
  'cooldown_reduction',
  'status_duration', 'magic_counter_threshold',
  'damage_reduction',
]);
const VALID_ENDING_TRIGGERS: ReadonlySet<EndingDef['trigger_type']> = new Set([
  'boss_defeated', 'choice', 'exploration', 'multi_item_use',
]);
// All event types accepted by `events.ts::fireEvent`. Keep in sync.
const KNOWN_EVENT_PREFIXES = new Set([
  'flicker_lights', 'screen_glitch', 'fade_to_black', 'dialogue', 'require', 'boss',
]);

export function validateContent(bundle: ContentBundle): string[] {
  const errors: string[] = [];

  const rooms: Record<string, RoomDef> = {};
  for (const region of bundle.regions) {
    if (!region?.rooms) continue;
    for (const room of region.rooms) {
      if (rooms[room.id]) {
        errors.push(`room: duplicate id "${room.id}"`);
      }
      rooms[room.id] = room;
    }
  }

  const itemIds = new Set(Object.keys(bundle.items));
  const weaponIds = new Set(Object.keys(bundle.weapons));
  const armorIds = new Set(Object.keys(bundle.armor));
  const accessoryIds = new Set(Object.keys(bundle.accessories));
  const enemyIds = new Set(Object.keys(bundle.enemies));
  const npcIds = new Set(Object.keys(bundle.npcs));
  const shopIds = new Set(Object.keys(bundle.shops));
  const objectiveIds = new Set(bundle.objectives.map(o => o.id));
  const roomIds = new Set(Object.keys(rooms));

  // Things a search_item or loot drop could legitimately resolve to.
  const collectibleIds = new Set<string>([
    ...itemIds, ...weaponIds, ...armorIds, ...accessoryIds,
  ]);

  if (!roomIds.has(bundle.startingRoom)) {
    errors.push(`startingRoom: "${bundle.startingRoom}" does not exist`);
  }

  validateItems(bundle.items, errors);
  validateWeapons(bundle.weapons, errors);
  validateArmor(bundle.armor, errors);
  validateAccessories(bundle.accessories, errors);
  validateEnemies(bundle.enemies, itemIds, weaponIds, armorIds, accessoryIds, errors);
  validateNpcs(bundle.npcs, itemIds, weaponIds, shopIds, errors);
  validateShops(bundle.shops, npcIds, itemIds, weaponIds, armorIds, errors);
  validateRooms(rooms, itemIds, weaponIds, armorIds, enemyIds, npcIds, collectibleIds, errors);
  validateEndings(bundle.endings, roomIds, itemIds, enemyIds, errors);
  validateObjectives(bundle.objectives, objectiveIds, npcIds, roomIds, collectibleIds, enemyIds, errors);

  return errors;
}

function validateItems(items: Record<string, ItemDef>, errors: string[]): void {
  for (const [id, item] of Object.entries(items)) {
    const path = `items.${id}`;
    if (!item.name) errors.push(`${path}: missing name`);
    if (!VALID_ITEM_TYPES.has(item.type)) {
      errors.push(`${path}: invalid type "${item.type}"`);
    }
    if (item.type !== 'key' && item.price !== undefined && item.price < 0) {
      errors.push(`${path}: negative price`);
    }
    if (item.cure_effects) {
      for (const effect of item.cure_effects) {
        if (!VALID_STATUS_EFFECTS.has(effect)) {
          errors.push(`${path}.cure_effects: unknown status "${effect}"`);
        }
      }
    }
  }
}

function validateWeapons(weapons: Record<string, WeaponDef>, errors: string[]): void {
  for (const [id, w] of Object.entries(weapons)) {
    const path = `weapons.${id}`;
    if (!w.name) errors.push(`${path}: missing name`);
    if (!VALID_WEAPON_CLASSES.has(w.weapon_class)) {
      errors.push(`${path}: invalid weapon_class "${w.weapon_class}"`);
    }
    if (typeof w.attack_bonus !== 'number' || w.attack_bonus < 0) {
      errors.push(`${path}: attack_bonus must be a non-negative number`);
    }
    if (w.status_effect && !VALID_STATUS_EFFECTS.has(w.status_effect.type)) {
      errors.push(`${path}.status_effect: unknown type "${w.status_effect.type}"`);
    }
    if (w.status_effect && (w.status_effect.chance < 0 || w.status_effect.chance > 100)) {
      errors.push(`${path}.status_effect.chance: must be 0-100`);
    }
  }
}

function validateArmor(armor: Record<string, ArmorDef>, errors: string[]): void {
  for (const [id, a] of Object.entries(armor)) {
    const path = `armor.${id}`;
    if (!a.name) errors.push(`${path}: missing name`);
    if (typeof a.defense !== 'number' || a.defense < 0) {
      errors.push(`${path}: defense must be a non-negative number`);
    }
  }
}

function validateAccessories(accessories: Record<string, AccessoryDef>, errors: string[]): void {
  for (const [id, a] of Object.entries(accessories)) {
    const path = `accessories.${id}`;
    if (!a.name) errors.push(`${path}: missing name`);
    if (!Array.isArray(a.modifiers) || a.modifiers.length === 0) {
      errors.push(`${path}: must have at least one modifier`);
      continue;
    }
    for (let i = 0; i < a.modifiers.length; i++) {
      const m = a.modifiers[i];
      if (!VALID_MODIFIER_TYPES.has(m.type)) {
        errors.push(`${path}.modifiers[${i}]: unknown type "${m.type}"`);
      }
    }
  }
}

function validateEnemies(
  enemies: Record<string, EnemyDef>,
  itemIds: Set<string>,
  weaponIds: Set<string>,
  armorIds: Set<string>,
  accessoryIds: Set<string>,
  errors: string[],
): void {
  for (const [id, e] of Object.entries(enemies)) {
    const path = `enemies.${id}`;
    if (!e.name) errors.push(`${path}: missing name`);
    if (typeof e.hp !== 'number' || e.hp <= 0) errors.push(`${path}: hp must be > 0`);
    if (typeof e.attack !== 'number' || e.attack < 0) errors.push(`${path}: attack must be >= 0`);
    if (typeof e.defense !== 'number' || e.defense < 0) errors.push(`${path}: defense must be >= 0`);
    if (typeof e.xp !== 'number' || e.xp < 0) errors.push(`${path}: xp must be >= 0`);

    for (const lootId of e.loot ?? []) {
      if (!itemIds.has(lootId) && !weaponIds.has(lootId) && !armorIds.has(lootId) && !accessoryIds.has(lootId)) {
        errors.push(`${path}.loot: "${lootId}" is not a known item/weapon/armor/accessory`);
      }
    }
    if (e.loot_weapon && !weaponIds.has(e.loot_weapon)) {
      errors.push(`${path}.loot_weapon: "${e.loot_weapon}" is not a known weapon`);
    }
    if (e.loot_armor && !armorIds.has(e.loot_armor)) {
      errors.push(`${path}.loot_armor: "${e.loot_armor}" is not a known armor`);
    }
    if (e.loot_accessory && !accessoryIds.has(e.loot_accessory)) {
      errors.push(`${path}.loot_accessory: "${e.loot_accessory}" is not a known accessory`);
    }
    if (e.status_effect && !VALID_ENEMY_STATUS.has(e.status_effect.type)) {
      errors.push(`${path}.status_effect: unknown type "${e.status_effect.type}"`);
    }
    if (e.status_effect && (e.status_effect.chance < 0 || e.status_effect.chance > 100)) {
      errors.push(`${path}.status_effect.chance: must be 0-100`);
    }
  }
}

function validateNpcs(
  npcs: Record<string, NpcDef>,
  itemIds: Set<string>,
  weaponIds: Set<string>,
  shopIds: Set<string>,
  errors: string[],
): void {
  for (const [id, npc] of Object.entries(npcs)) {
    const path = `npcs.${id}`;
    if (!npc.name) errors.push(`${path}: missing name`);
    if (!Array.isArray(npc.match_words) || npc.match_words.length === 0) {
      errors.push(`${path}: match_words must be non-empty`);
    }
    if (!npc.dialogue || !npc.dialogue.start) {
      errors.push(`${path}: dialogue.start is required`);
      continue;
    }
    const nodeIds = new Set(Object.keys(npc.dialogue));
    for (const [nodeId, node] of Object.entries(npc.dialogue)) {
      const np = `${path}.dialogue.${nodeId}`;
      if (!Array.isArray(node.choices)) {
        errors.push(`${np}: choices must be an array`);
        continue;
      }
      for (let i = 0; i < node.choices.length; i++) {
        const c = node.choices[i];
        const cp = `${np}.choices[${i}]`;
        if (c.next !== null && !nodeIds.has(c.next)) {
          errors.push(`${cp}.next: "${c.next}" is not a known dialogue node`);
        }
        const fx = c.effect;
        if (fx?.give_item && !itemIds.has(fx.give_item)) {
          errors.push(`${cp}.effect.give_item: "${fx.give_item}" is not a known item`);
        }
        if (fx?.give_weapon && !weaponIds.has(fx.give_weapon)) {
          errors.push(`${cp}.effect.give_weapon: "${fx.give_weapon}" is not a known weapon`);
        }
        if (fx?.remove_item && !itemIds.has(fx.remove_item)) {
          errors.push(`${cp}.effect.remove_item: "${fx.remove_item}" is not a known item`);
        }
        if (fx?.open_shop && !shopIds.has(fx.open_shop)) {
          errors.push(`${cp}.effect.open_shop: "${fx.open_shop}" is not a known shop`);
        }
      }
    }
  }
}

function validateShops(
  shops: Record<string, ShopDef>,
  npcIds: Set<string>,
  itemIds: Set<string>,
  weaponIds: Set<string>,
  armorIds: Set<string>,
  errors: string[],
): void {
  for (const [id, shop] of Object.entries(shops)) {
    const path = `shops.${id}`;
    if (!shop.name) errors.push(`${path}: missing name`);
    if (shop.owner_npc && !npcIds.has(shop.owner_npc)) {
      errors.push(`${path}.owner_npc: "${shop.owner_npc}" is not a known NPC`);
    }
    if (!Array.isArray(shop.stock)) {
      errors.push(`${path}: stock must be an array`);
      continue;
    }
    for (let i = 0; i < shop.stock.length; i++) {
      const entry = shop.stock[i];
      const ep = `${path}.stock[${i}]`;
      if (entry.qty == null || entry.qty <= 0) errors.push(`${ep}: qty must be > 0`);
      const type = entry.type ?? 'item';
      if (type === 'item' && !itemIds.has(entry.id)) {
        errors.push(`${ep}: "${entry.id}" is not a known item`);
      } else if (type === 'weapon' && !weaponIds.has(entry.id)) {
        errors.push(`${ep}: "${entry.id}" is not a known weapon`);
      } else if (type === 'armor' && !armorIds.has(entry.id)) {
        errors.push(`${ep}: "${entry.id}" is not a known armor`);
      }
    }
  }
}

function validateRooms(
  rooms: Record<string, RoomDef>,
  itemIds: Set<string>,
  weaponIds: Set<string>,
  armorIds: Set<string>,
  enemyIds: Set<string>,
  npcIds: Set<string>,
  collectibleIds: Set<string>,
  errors: string[],
): void {
  const roomIds = new Set(Object.keys(rooms));

  for (const [id, room] of Object.entries(rooms)) {
    const path = `rooms.${id}`;
    if (!room.name) errors.push(`${path}: missing name`);
    if (!room.region) errors.push(`${path}: missing region`);

    for (const [dir, target] of Object.entries(room.exits ?? {})) {
      if (!roomIds.has(target)) {
        errors.push(`${path}.exits.${dir}: target "${target}" is not a known room`);
      }
    }
    for (const [dir, target] of Object.entries(room.secret_exits ?? {})) {
      if (!roomIds.has(target)) {
        errors.push(`${path}.secret_exits.${dir}: target "${target}" is not a known room`);
      }
    }
    for (const itemId of room.items ?? []) {
      if (!itemIds.has(itemId)) {
        errors.push(`${path}.items: "${itemId}" is not a known item`);
      }
    }
    for (const weaponId of room.weapons ?? []) {
      if (!weaponIds.has(weaponId)) {
        errors.push(`${path}.weapons: "${weaponId}" is not a known weapon`);
      }
    }
    for (const armorId of room.armor ?? []) {
      if (!armorIds.has(armorId)) {
        errors.push(`${path}.armor: "${armorId}" is not a known armor`);
      }
    }
    for (const enemyId of room.enemies ?? []) {
      if (!enemyIds.has(enemyId)) {
        errors.push(`${path}.enemies: "${enemyId}" is not a known enemy`);
      }
    }
    for (const itemId of room.search_items ?? []) {
      if (!collectibleIds.has(itemId)) {
        errors.push(`${path}.search_items: "${itemId}" is not a known item/weapon/armor/accessory`);
      }
    }
    for (const npcId of room.npcs ?? []) {
      if (!npcIds.has(npcId)) {
        errors.push(`${path}.npcs: "${npcId}" is not a known NPC`);
      }
    }
    if (room.on_enter) {
      const prefix = room.on_enter.split(':')[0];
      if (!KNOWN_EVENT_PREFIXES.has(prefix)) {
        errors.push(`${path}.on_enter: unknown event "${room.on_enter}"`);
      } else if (prefix === 'require') {
        const param = room.on_enter.slice('require:'.length);
        if (!param || !itemIds.has(param)) {
          errors.push(`${path}.on_enter: require:"${param}" is not a known item`);
        }
      }
    }
  }
}

function validateEndings(
  endings: Record<string, EndingDef>,
  roomIds: Set<string>,
  itemIds: Set<string>,
  enemyIds: Set<string>,
  errors: string[],
): void {
  for (const [id, ending] of Object.entries(endings)) {
    const path = `endings.${id}`;
    if (!ending.title) errors.push(`${path}: missing title`);
    if (!VALID_ENDING_TRIGGERS.has(ending.trigger_type)) {
      errors.push(`${path}: invalid trigger_type "${ending.trigger_type}"`);
    }
    if (ending.trigger_type === 'boss_defeated' && ending.trigger_value && !enemyIds.has(ending.trigger_value)) {
      errors.push(`${path}.trigger_value: "${ending.trigger_value}" is not a known enemy`);
    }
    if (ending.trigger_room && !roomIds.has(ending.trigger_room)) {
      errors.push(`${path}.trigger_room: "${ending.trigger_room}" is not a known room`);
    }
    if (ending.trigger_item && !itemIds.has(ending.trigger_item)) {
      errors.push(`${path}.trigger_item: "${ending.trigger_item}" is not a known item`);
    }
    for (const itemId of ending.trigger_items ?? []) {
      if (!itemIds.has(itemId)) {
        errors.push(`${path}.trigger_items: "${itemId}" is not a known item`);
      }
    }
    if (ending.trigger_type === 'choice' && ending.choice_options) {
      const trigger = ending.choice_trigger;
      if (trigger != null && (trigger < 0 || trigger >= ending.choice_options.length)) {
        errors.push(`${path}.choice_trigger: index ${trigger} out of range for choice_options`);
      }
    }
  }
}

function validateObjectives(
  objectives: ObjectiveDef[],
  objectiveIds: Set<string>,
  npcIds: Set<string>,
  roomIds: Set<string>,
  collectibleIds: Set<string>,
  enemyIds: Set<string>,
  errors: string[],
): void {
  const seen = new Set<string>();
  for (const obj of objectives) {
    const path = `objectives.${obj.id}`;
    if (seen.has(obj.id)) errors.push(`${path}: duplicate id`);
    seen.add(obj.id);
    if (!obj.title) errors.push(`${path}: missing title`);

    const t = obj.trigger;
    if (t.type === 'talked_to_npc' && t.npc && !npcIds.has(t.npc)) {
      errors.push(`${path}.trigger.npc: "${t.npc}" is not a known NPC`);
    }
    if ((t.type === 'entered_room' || t.type === 'searched_room') && t.room && !roomIds.has(t.room)) {
      errors.push(`${path}.trigger.room: "${t.room}" is not a known room`);
    }
    if (t.type === 'took_item' && t.item && !collectibleIds.has(t.item)) {
      errors.push(`${path}.trigger.item: "${t.item}" is not a known item/weapon/armor/accessory`);
    }
    if (t.type === 'defeated_enemy' && t.enemy && !enemyIds.has(t.enemy)) {
      errors.push(`${path}.trigger.enemy: "${t.enemy}" is not a known enemy`);
    }
    if (t.type === 'objective_completed' && t.objective && !objectiveIds.has(t.objective)) {
      errors.push(`${path}.trigger.objective: "${t.objective}" is not a known objective`);
    }

    const c = obj.completion;
    for (const itemId of c.items ?? []) {
      if (!collectibleIds.has(itemId)) {
        errors.push(`${path}.completion.items: "${itemId}" is not a known item/weapon/armor/accessory`);
      }
    }
    if (c.enemy && !enemyIds.has(c.enemy)) {
      errors.push(`${path}.completion.enemy: "${c.enemy}" is not a known enemy`);
    }
    if (c.room && !roomIds.has(c.room)) {
      errors.push(`${path}.completion.room: "${c.room}" is not a known room`);
    }
    if (c.objective && !objectiveIds.has(c.objective)) {
      errors.push(`${path}.completion.objective: "${c.objective}" is not a known objective`);
    }
    if (c.type === 'visited_rooms_percent') {
      if (c.percent == null || c.percent < 0 || c.percent > 100) {
        errors.push(`${path}.completion.percent: must be 0-100`);
      }
    }
  }
}
