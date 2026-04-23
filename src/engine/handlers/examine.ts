import * as C from '../constants';
import { ICON, iconLine } from '../icons';
import { collectModifiers, totalModifier } from '../modifiers';
import { addLine } from '../output';
import type { AccessoryDef, ArmorDef, EnemyDef, GameStore, ItemDef, WeaponClass, WeaponDef } from '../types';
import { getLivingEnemies, getRoom } from '../world';

function classTag(weapon: WeaponDef): string {
  return `[${weapon.weapon_class.charAt(0).toUpperCase() + weapon.weapon_class.slice(1)}] `;
}

function weaponColor(weapon: WeaponDef) {
  return weapon.weapon_class === 'magic' ? C.MAGIC_COLOR : C.ITEM_COLOR;
}

function classBlurbColor(weapon: WeaponDef) {
  return weapon.weapon_class === 'magic' ? C.MAGIC_COLOR : C.CHOICE_COLOR;
}

function equippedShieldDefense(store: GameStore, itemData: Record<string, ItemDef>): number {
  const shieldId = store.player?.equippedShield;
  if (!shieldId) return 0;
  return itemData[shieldId]?.value ?? 0;
}

const CLASS_BLURB: Record<WeaponClass, string> = {
  blade: 'Blade: +10% critical hit chance',
  heavy: 'Heavy: Ignores 2 points of enemy armor',
  pierce: 'Pierce: Strike first on round 1',
  magic: 'Magic: every third strike weaves its element into the target, guaranteed',
};

export function handleExamine(
  store: GameStore,
  target: string,
  enemyData: Record<string, EnemyDef>,
  itemData: Record<string, ItemDef>,
  weaponData: Record<string, WeaponDef>,
  armorData?: Record<string, ArmorDef>,
  accessoryData?: Record<string, AccessoryDef>,
): void {
  if (!store.player || !store.world) return;
  if (!target) { addLine(store, 'Examine what?', C.ERROR_COLOR); return; }

  const room = getRoom(store.world, store.player.currentRoom);

  if (room) {
    const living = getLivingEnemies(store.world, store.player.currentRoom);
    for (const enemyId of living) {
      const enemy = enemyData[enemyId];
      if (!enemy) continue;
      if (enemy.name.toLowerCase().includes(target.toLowerCase()) || enemyId.toLowerCase().includes(target.toLowerCase())) {
        addLine(store, '');
        addLine(store, iconLine(ICON.enemy, `=== ${enemy.name} ===`), C.ENEMY_COLOR);
        addLine(store, enemy.description, C.HELP_COLOR);
        addLine(store, `HP: ${enemy.hp}  ATK: ${enemy.attack}  DEF: ${enemy.defense}  XP: ${enemy.xp}`, C.STAT_COLOR);
        if (enemy.is_boss) addLine(store, 'This is a boss enemy. Special attack every 3 rounds.', C.COMBAT_COLOR);
        const mods = collectModifiers(store.player, weaponData, armorData ?? {}, accessoryData ?? {});
        let playerAtk = store.player.attack + totalModifier(mods, 'attack');
        if (store.player.equippedWeapon && weaponData[store.player.equippedWeapon]) {
          playerAtk += weaponData[store.player.equippedWeapon].attack_bonus;
        }
        const enemyDefense = Math.max(0, enemy.defense - totalModifier(mods, 'def_ignore'));
        const playerDefense = store.player.defense
          + equippedShieldDefense(store, itemData)
          + totalModifier(mods, 'defense');
        const estDmg = Math.max(1, playerAtk - enemyDefense);
        const estTaken = Math.max(1, enemy.attack - playerDefense - totalModifier(mods, 'damage_reduction'));
        addLine(store, `Est. damage you deal: ~${estDmg}/hit`, [0.8, 1, 0.8, 1]);
        addLine(store, `Est. damage you take: ~${estTaken}/hit`, [1, 0.5, 0.5, 1]);
        return;
      }
    }
  }

  for (const weaponId of store.player.weapons) {
    const weapon = weaponData[weaponId];
    if (!weapon) continue;
    if (weapon.name.toLowerCase().includes(target.toLowerCase()) || weaponId.toLowerCase().includes(target.toLowerCase())) {
      addLine(store, '');
      addLine(store, iconLine(ICON.weapon, `=== ${classTag(weapon)}${weapon.name} ===`), weaponColor(weapon));
      addLine(store, weapon.description, C.HELP_COLOR);
      addLine(store, `Attack bonus: +${weapon.attack_bonus}`, C.STAT_COLOR);
      addLine(store, CLASS_BLURB[weapon.weapon_class], classBlurbColor(weapon));
      if (store.player.equippedWeapon === weaponId) {
        addLine(store, '(currently equipped)', C.ITEM_COLOR);
      } else if (store.player.equippedWeapon) {
        const current = weaponData[store.player.equippedWeapon];
        if (current) {
          const diff = weapon.attack_bonus - current.attack_bonus;
          const sign = diff > 0 ? '+' : '';
          addLine(store, `Compared to ${current.name}: ${sign}${diff} ATK`, diff > 0 ? C.ITEM_COLOR : C.ERROR_COLOR);
        }
      }
      return;
    }
  }

  for (const itemId of [...Object.keys(store.player.inventory), ...Object.keys(store.player.keyItems)]) {
    const item = itemData[itemId];
    if (!item) continue;
    if (item.name.toLowerCase().includes(target.toLowerCase()) || itemId.toLowerCase().includes(target.toLowerCase())) {
      addLine(store, '');
      const headerIcon = item.type === 'key' ? ICON.key : item.type === 'shield' ? ICON.shield : ICON.item;
      addLine(store, iconLine(headerIcon, `=== ${item.name} ===`), C.ITEM_COLOR);
      addLine(store, item.description, C.HELP_COLOR);
      addLine(store, `Type: ${item.type}`, C.STAT_COLOR);
      if (item.effect === 'heal' && item.value) addLine(store, `Heals ${item.value} HP`, C.STAT_COLOR);
      if (item.effect === 'buff_attack' && item.value) addLine(store, `+${item.value} ATK for 3 rounds`, C.STAT_COLOR);
      if (item.effect === 'defense' && item.value) addLine(store, `+${item.value} DEF when equipped`, C.STAT_COLOR);
      if (item.type === 'key') addLine(store, '(key item — cannot be dropped)', C.CHOICE_COLOR);
      const count = store.player.inventory[itemId];
      if (count) addLine(store, `You have: ${count}`, C.HELP_COLOR);
      return;
    }
  }

  // Check armor in inventory and on the ground
  if (armorData) {
    const armorSources = [
      ...Object.keys(store.player.inventory).filter(id => armorData[id]),
      ...(room ? [...(room.armor || []), ...(room._ground_loot || [])].filter(id => armorData[id]) : []),
    ];
    for (const armorId of armorSources) {
      const armor = armorData[armorId];
      if (!armor) continue;
      if (armor.name.toLowerCase().includes(target.toLowerCase()) || armorId.toLowerCase().includes(target.toLowerCase())) {
        addLine(store, '');
        addLine(store, iconLine(ICON.shield, `=== ${armor.name} ===`), C.ITEM_COLOR);
        addLine(store, armor.description, C.HELP_COLOR);
        addLine(store, `Defense: +${armor.defense}`, C.STAT_COLOR);
        if (store.player.equippedArmor === armorId) {
          addLine(store, '(currently equipped)', C.ITEM_COLOR);
        }
        return;
      }
    }
  }

  // Check accessories in inventory and on the ground
  if (accessoryData) {
    const accSources = [
      ...Object.keys(store.player.inventory).filter(id => accessoryData[id]),
      ...(room ? (room._ground_loot || []).filter(id => accessoryData[id]) : []),
    ];
    for (const accId of accSources) {
      const acc = accessoryData[accId];
      if (!acc) continue;
      if (acc.name.toLowerCase().includes(target.toLowerCase()) || accId.toLowerCase().includes(target.toLowerCase())) {
        addLine(store, '');
        addLine(store, iconLine(ICON.item, `=== ${acc.name} ===`), C.ITEM_COLOR);
        addLine(store, acc.description, C.HELP_COLOR);
        for (const mod of acc.modifiers) {
          const sign = mod.value > 0 ? '+' : '';
          addLine(store, `${sign}${mod.value} ${mod.type}`, C.STAT_COLOR);
        }
        if (store.player.equippedAccessory === accId) {
          addLine(store, '(currently equipped)', C.ITEM_COLOR);
        }
        return;
      }
    }
  }

  if (room) {
    for (const id of [...(room.items || []), ...(room._ground_loot || [])]) {
      const item = itemData[id];
      if (item && (item.name.toLowerCase().includes(target.toLowerCase()) || id.toLowerCase().includes(target.toLowerCase()))) {
        addLine(store, '');
        addLine(store, iconLine(ICON.item, `=== ${item.name} ===`), C.ITEM_COLOR);
        addLine(store, item.description, C.HELP_COLOR);
        return;
      }
    }
    for (const id of [...(room.weapons || []), ...(room._ground_weapons || [])]) {
      const weapon = weaponData[id];
      if (weapon && (weapon.name.toLowerCase().includes(target.toLowerCase()) || id.toLowerCase().includes(target.toLowerCase()))) {
        addLine(store, '');
        addLine(store, iconLine(ICON.weapon, `=== ${classTag(weapon)}${weapon.name} ===`), weaponColor(weapon));
        addLine(store, weapon.description, C.HELP_COLOR);
        addLine(store, `Attack bonus: +${weapon.attack_bonus}`, C.STAT_COLOR);
        addLine(store, CLASS_BLURB[weapon.weapon_class], classBlurbColor(weapon));
        return;
      }
    }
  }

  addLine(store, "You don't see anything like that to examine.", C.ERROR_COLOR);
}
