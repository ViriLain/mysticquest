import { getAll as getAllAchievements } from '../achievements';
import * as C from '../constants';
import { ICON, iconLine } from '../icons';
import { OBJECTIVES } from '../objectives';
import { addLine } from '../output';
import { totalAttack, totalDefense, visitedCount, xpToNextLevel } from '../player';
import { SKILL_TREE, canLearnSkill, getSkillsByBranch } from '../skills';
import type { GameStore, ItemDef, ObjectiveDef, WeaponDef } from '../types';

import itemsJson from '../../data/items.json';
import weaponsJson from '../../data/weapons.json';

const weaponData = weaponsJson as Record<string, WeaponDef>;
const itemData = itemsJson as Record<string, ItemDef>;

export function showSkills(store: GameStore): void {
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

export function showAchievements(store: GameStore): void {
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

export function showInventory(store: GameStore): void {
  if (!store.player) return;
  addLine(store, '');
  addLine(store, '=== Inventory ===', C.STAT_COLOR);

  if (store.player.equippedWeapon && weaponData[store.player.equippedWeapon]) {
    const weapon = weaponData[store.player.equippedWeapon];
    addLine(store, iconLine(ICON.weapon, `Weapon: ${weapon.name} (+${weapon.attack_bonus} ATK)`), C.ITEM_COLOR);
  } else {
    addLine(store, iconLine(ICON.weapon, 'Weapon: Fists'), C.ITEM_COLOR);
  }

  if (store.player.equippedShield && itemData[store.player.equippedShield]) {
    const shield = itemData[store.player.equippedShield];
    addLine(store, iconLine(ICON.shield, `Shield: ${shield.name} (+${shield.value} DEF)`), C.ITEM_COLOR);
  }

  const otherWeapons = store.player.weapons.filter(weaponId => weaponId !== store.player!.equippedWeapon);
  for (const weaponId of otherWeapons) {
    const weapon = weaponData[weaponId];
    if (weapon) addLine(store, iconLine(ICON.weapon, `${weapon.name} (+${weapon.attack_bonus} ATK)`), C.HELP_COLOR);
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
    const text = (count > 1 ? `${name} x${count}` : name) + stat;
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

export function showStats(store: GameStore): void {
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
  addLine(store, `Gold: ${store.player.gold}`, C.STAT_COLOR);
  addLine(store, `XP: ${store.player.xp}/${xpToNextLevel(store.player)}`, C.STAT_COLOR);
  addLine(store, `Rooms visited: ${visitedCount(store.player)}`, C.STAT_COLOR);
  if (store.player.skillPoints > 0) {
    addLine(store, `Skill Points: ${store.player.skillPoints}`, C.CHOICE_COLOR);
  }
  const learnedSkills = SKILL_TREE.filter(skill => store.player!.skills[skill.id]);
  if (learnedSkills.length > 0) {
    addLine(store, `Skills: ${learnedSkills.map(skill => skill.name).join(', ')}`, C.ITEM_COLOR);
  }
}

export function showJournal(store: GameStore): void {
  if (!store.player) return;
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

export function showScore(store: GameStore): void {
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
}
