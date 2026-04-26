import { getAll as getAllAchievements } from '../achievements';
import * as C from '../constants';
import {
  ACCESSORIES as staticAccessoryData,
  ARMOR as staticArmorData,
  ITEMS as itemData,
  WEAPONS as staticWeaponData,
} from '../data';
import { ICON, iconLine } from '../icons';
import { OBJECTIVES } from '../objectives';
import { collectModifiers, totalModifier } from '../modifiers';
import { addLine } from '../output';
import { visitedCount, xpToNextLevel } from '../player';
import { SKILL_TREE, canLearnSkill, getSkillsByTier } from '../skills';
import { loadStats } from '../statistics';
import type { AccessoryDef, ArmorDef, GameStore, ObjectiveDef, ReadyStore, RGBA, WeaponDef } from '../types';

function weaponLookup(store: GameStore, id: string): WeaponDef | undefined {
  return staticWeaponData[id] ?? store.dungeon?.floorWeapons[id];
}

function armorLookup(store: GameStore, id: string): ArmorDef | undefined {
  return staticArmorData[id] ?? store.dungeon?.floorArmor[id];
}

function allWeaponData(store: GameStore): Record<string, WeaponDef> {
  return store.dungeon?.floorWeapons ? { ...staticWeaponData, ...store.dungeon.floorWeapons } : staticWeaponData;
}

function allArmorData(store: GameStore): Record<string, ArmorDef> {
  return store.dungeon?.floorArmor ? { ...staticArmorData, ...store.dungeon.floorArmor } : staticArmorData;
}

function accessoryLookup(_store: GameStore, id: string): AccessoryDef | undefined {
  return staticAccessoryData[id];
}

function weaponClassTag(weapon: WeaponDef): string {
  return `[${weapon.weapon_class.charAt(0).toUpperCase() + weapon.weapon_class.slice(1)}]`;
}

function weaponColor(weapon: WeaponDef): RGBA {
  return weapon.weapon_class === 'magic' ? C.MAGIC_COLOR : C.HELP_COLOR;
}

function sortedWeaponIds(store: ReadyStore): string[] {
  const equipped = store.player.equippedWeapon;
  const others = store.player.weapons
    .filter(weaponId => weaponId !== equipped)
    .sort((a, b) => {
      const aw = weaponLookup(store, a);
      const bw = weaponLookup(store, b);
      return (bw?.attack_bonus ?? 0) - (aw?.attack_bonus ?? 0);
    });
  return equipped ? [equipped, ...others] : others;
}

function weaponLine(store: GameStore, weaponId: string, options: { equippedPrefix: boolean; inShop: boolean }): { text: string; color: RGBA } | null {
  const weapon = weaponLookup(store, weaponId);
  if (!weapon) return null;
  let sell = '';
  if (options.inShop && weapon.price) sell = ` (sells for ${Math.floor(weapon.price / 2)}g)`;
  const prefix = options.equippedPrefix ? 'Weapon: ' : '';
  return {
    text: iconLine(ICON.weapon, `${prefix}${weaponClassTag(weapon)} ${weapon.name} (+${weapon.attack_bonus} ATK)${sell}`),
    color: options.equippedPrefix && weapon.weapon_class !== 'magic' ? C.ITEM_COLOR : weaponColor(weapon),
  };
}

export function showSkills(store: ReadyStore): void {
  addLine(store, '');
  addLine(store, '=== Skill Tree ===', C.STAT_COLOR);
  addLine(store, `Skill Points: ${store.player.skillPoints}`, C.CHOICE_COLOR);
  addLine(store, '');

  for (let tier = 1; tier <= 5; tier++) {
    addLine(store, `--- Tier ${tier} ---`, C.COMBAT_COLOR);
    const skills = getSkillsByTier(tier);
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

export function showAchievements(store: ReadyStore): void {
  addLine(store, '');
  addLine(store, '=== Achievements ===', C.STAT_COLOR);
  const all = getAllAchievements();
  for (const achievement of all) {
    if (achievement.unlocked) {
      addLine(store, `  [*] ${achievement.name} - ${achievement.description}`, C.ITEM_COLOR);
    } else {
      addLine(store, `  [ ] ${achievement.name} - ${achievement.description}`, C.HELP_COLOR);
    }
  }
  const unlocked = all.filter(achievement => achievement.unlocked).length;
  addLine(store, '');
  addLine(store, `${unlocked}/${all.length} unlocked`, C.STAT_COLOR);
}

export function showInventory(store: ReadyStore): void {
  const inShop = !!store.shopState.activeShopId;
  addLine(store, '');
  addLine(store, '=== Inventory ===', C.STAT_COLOR);

  if (store.player.equippedWeapon) {
    const equipped = weaponLine(store, store.player.equippedWeapon, { equippedPrefix: true, inShop });
    if (equipped) addLine(store, equipped.text, equipped.color);
  } else {
    addLine(store, iconLine(ICON.weapon, 'Weapon: Fists'), C.ITEM_COLOR);
  }

  if (store.player.equippedShield && itemData[store.player.equippedShield]) {
    const shield = itemData[store.player.equippedShield];
    let sell = '';
    if (inShop && shield.price) sell = ` (sells for ${Math.floor(shield.price / 2)}g)`;
    addLine(store, iconLine(ICON.shield, `Shield: ${shield.name} (+${shield.value} DEF)${sell}`), C.ITEM_COLOR);
  }

  if (store.player.equippedArmor) {
    const armor = armorLookup(store, store.player.equippedArmor);
    if (armor) {
      addLine(store, iconLine(ICON.shield, `Armor: ${armor.name} (+${armor.defense} DEF)`), C.ITEM_COLOR);
    }
  }

  if (store.player.equippedAccessory) {
    const acc = accessoryLookup(store, store.player.equippedAccessory);
    if (acc) {
      const effectText = acc.modifiers.map(m => `${m.type} ${m.value > 0 ? '+' : ''}${m.value}`).join(', ');
      addLine(store, iconLine(ICON.item, `Accessory: ${acc.name} (${effectText})`), C.ITEM_COLOR);
    }
  }

  for (const weaponId of sortedWeaponIds(store).filter(weaponId => weaponId !== store.player.equippedWeapon)) {
    const line = weaponLine(store, weaponId, { equippedPrefix: false, inShop });
    if (line) addLine(store, line.text, line.color);
  }

  let hasItems = false;
  for (const [itemId, count] of Object.entries(store.player.inventory)) {
    hasItems = true;
    const item = itemData[itemId];
    const name = item?.name || itemId;
    let stat = '';
    if (item?.effect === 'heal' && item.value) stat = ` (+${item.value} HP)`;
    else if (item?.effect === 'buff_attack' && item.value) stat = ` (+${item.value} ATK, 3 rnd)`;
    else if (item?.type === 'shield' && item.value) stat = ` (+${item.value} DEF)`;
    let sell = '';
    if (inShop && item?.price && item.type !== 'key') sell = ` (sells for ${Math.floor(item.price / 2)}g)`;
    const text = (count > 1 ? `${name} x${count}` : name) + stat + sell;
    const icon = item?.type === 'shield' ? ICON.shield : ICON.item;
    addLine(store, iconLine(icon, text), C.HELP_COLOR);
  }

  for (const keyItemId of Object.keys(store.player.keyItems)) {
    hasItems = true;
    const item = itemData[keyItemId];
    const name = item?.name || keyItemId;
    addLine(store, iconLine(ICON.key, `${name} [key]`), C.LOOT_COLOR);
  }

  if (!hasItems && store.player.weapons.length === 0) {
    addLine(store, '  (empty)', C.HELP_COLOR);
  }
}

export function showWeapons(store: ReadyStore): void {
  addLine(store, '');
  addLine(store, '=== Weapons ===', C.STAT_COLOR);
  const weaponIds = sortedWeaponIds(store);
  if (weaponIds.length === 0) {
    addLine(store, '  (none)', C.HELP_COLOR);
    return;
  }
  for (const weaponId of weaponIds) {
    const line = weaponLine(store, weaponId, {
      equippedPrefix: weaponId === store.player.equippedWeapon,
      inShop: false,
    });
    if (!line) continue;
    const suffix = weaponId === store.player.equippedWeapon ? ' (equipped)' : '';
    addLine(store, line.text + suffix, line.color);
  }
}

export function showStats(store: ReadyStore): void {
  const player = store.player;
  if (!player) return;
  addLine(store, '');
  addLine(store, '=== Stats ===', C.STAT_COLOR);
  addLine(store, `HP: ${player.hp}/${player.maxHp}`, C.STAT_COLOR);

  const mods = collectModifiers(player, allWeaponData(store), allArmorData(store), staticAccessoryData);
  let totalAtk = player.attack + totalModifier(mods, 'attack');
  const statWeapon = player.equippedWeapon ? weaponLookup(store, player.equippedWeapon) : undefined;
  if (statWeapon) {
    totalAtk += statWeapon.attack_bonus;
  }
  addLine(store, `Attack: ${totalAtk}`, C.STAT_COLOR);
  const shieldDef = player.equippedShield ? itemData[player.equippedShield]?.value ?? 0 : 0;
  addLine(store, `Defense: ${player.defense + shieldDef + totalModifier(mods, 'defense')}`, C.STAT_COLOR);
  addLine(store, `Level: ${player.level}`, C.STAT_COLOR);
  addLine(store, `Gold: ${player.gold}`, C.STAT_COLOR);
  addLine(store, `XP: ${player.xp}/${xpToNextLevel(player)}`, C.STAT_COLOR);
  addLine(store, `Rooms visited: ${visitedCount(player)}`, C.STAT_COLOR);
  if (player.skillPoints > 0) {
    addLine(store, `Skill Points: ${player.skillPoints}`, C.CHOICE_COLOR);
  }
  const learnedSkills = SKILL_TREE.filter(skill => player.skills[skill.id]);
  if (learnedSkills.length > 0) {
    addLine(store, `Skills: ${learnedSkills.map(skill => skill.name).join(', ')}`, C.ITEM_COLOR);
  }
}

export function showJournal(store: ReadyStore): void {
  addLine(store, '');
  addLine(store, '=== Journal ===', C.STAT_COLOR);

  // Build a fast lookup from the static OBJECTIVES list so we can resolve
  // each id in the player's objectives map to its full definition.
  const byId = new Map<string, ObjectiveDef>();
  for (const obj of OBJECTIVES) byId.set(obj.id, obj);

  const active: ObjectiveDef[] = [];
  const complete: ObjectiveDef[] = [];
  // Iterate player.objectives in insertion order — this is the order the
  // player discovered them, which is what the spec requires.
  for (const id of Object.keys(store.player.objectives)) {
    const obj = byId.get(id);
    if (!obj) continue; // stale id from an older content version, skip
    const status = store.player.objectives[id];
    if (status === 'active') active.push(obj);
    else if (status === 'complete') complete.push(obj);
  }

  if (active.length === 0 && complete.length === 0) {
    addLine(store, '  (no entries yet — explore the world)', C.HELP_COLOR);
    return;
  }

  for (const obj of active) {
    addLine(store, '');
    addLine(store, `[ ] ${obj.title}`, C.CHOICE_COLOR);
    addLine(store, `    ${obj.hint}`, C.CHOICE_COLOR);
  }

  for (const obj of complete) {
    addLine(store, '');
    addLine(store, `[X] ${obj.title}`, C.HELP_COLOR);
    addLine(store, `    ${obj.completion_text}`, C.HELP_COLOR);
  }
}

export function showScore(store: ReadyStore): void {
  if (store.gameMode === 'dungeon' && store.dungeon) {
    addLine(store, '');
    addLine(store, '=== Dungeon Score ===', C.STAT_COLOR);
    addLine(store, `Floor: ${store.dungeon.floor}`, C.STAT_COLOR);
    addLine(store, `Floors cleared: ${store.dungeon.score.floorsCleared}`, C.STAT_COLOR);
    addLine(store, `Enemies killed: ${store.dungeon.score.enemiesKilled}`, C.STAT_COLOR);
    addLine(store, `Items found: ${store.dungeon.score.itemsFound}`, C.STAT_COLOR);
    addLine(store, `Seed: ${store.dungeon.seed}`, C.HELP_COLOR);
    return;
  }

  // Story mode: surface lifetime stats since there's no per-run score to
  // show. These persist across saves and resets — a simple track record.
  const lifetime = loadStats();
  addLine(store, '');
  addLine(store, '=== Lifetime Record ===', C.STAT_COLOR);
  addLine(store, `Endings reached: ${lifetime.endingsReached}`, C.STAT_COLOR);
  addLine(store, `Bosses defeated: ${lifetime.bossesDefeated}`, C.STAT_COLOR);
  addLine(store, `Deaths: ${lifetime.deaths}`, C.STAT_COLOR);
}
