import type {
  AccessoryDef, ArmorDef, Modifier, ModifierType, PlayerState, WeaponDef,
} from './types';

export function totalModifier(modifiers: Modifier[], type: ModifierType): number {
  let sum = 0;
  for (const m of modifiers) {
    if (m.type === type) sum += m.value;
  }
  return sum;
}

const SKILL_MODIFIERS: Record<string, Modifier[]> = {
  sharp_eyes: [{ type: 'crit_chance', value: 8, source: 'skill', sourceId: 'sharp_eyes' }],
  arcane_shield: [{ type: 'damage_reduction', value: 1, source: 'skill', sourceId: 'arcane_shield' }],
  precision: [
    { type: 'attack', value: 3, source: 'skill', sourceId: 'precision' },
    { type: 'def_ignore', value: 2, source: 'skill', sourceId: 'precision' },
  ],
  assassin: [{ type: 'crit_mult', value: 1, source: 'skill', sourceId: 'assassin' }],
};

function bridgeSkills(player: PlayerState): Modifier[] {
  const result: Modifier[] = [];
  for (const [skillId, mods] of Object.entries(SKILL_MODIFIERS)) {
    if (player.skills[skillId]) result.push(...mods);
  }
  return result;
}

const WEAPON_CLASS_MODIFIERS: Record<string, Modifier[]> = {
  blade: [{ type: 'crit_chance', value: 10, source: 'weapon_class', sourceId: 'blade' }],
  heavy: [{ type: 'def_ignore', value: 2, source: 'weapon_class', sourceId: 'heavy' }],
};

function bridgeWeaponClass(player: PlayerState, weaponData: Record<string, WeaponDef>): Modifier[] {
  if (!player.equippedWeapon) return [];
  const weapon = weaponData[player.equippedWeapon];
  if (!weapon) return [];
  return WEAPON_CLASS_MODIFIERS[weapon.weapon_class] || [];
}

function bridgeBuffs(player: PlayerState): Modifier[] {
  if (player.buffRounds > 0 && player.buffAttack > 0) {
    return [{ type: 'attack', value: player.buffAttack, source: 'buff', sourceId: 'buff_attack' }];
  }
  return [];
}

function armorModifiers(player: PlayerState, armorData: Record<string, ArmorDef>): Modifier[] {
  if (!player.equippedArmor) return [];
  const armor = armorData[player.equippedArmor];
  if (!armor) return [];
  return [{ type: 'defense', value: armor.defense, source: 'armor', sourceId: player.equippedArmor }];
}

function accessoryModifiers(player: PlayerState, accessoryData: Record<string, AccessoryDef>): Modifier[] {
  if (!player.equippedAccessory) return [];
  const acc = accessoryData[player.equippedAccessory];
  if (!acc) return [];
  return acc.modifiers.map(m => ({
    type: m.type,
    value: m.value,
    source: 'accessory' as const,
    sourceId: player.equippedAccessory!,
  }));
}

export function collectModifiers(
  player: PlayerState,
  weaponData: Record<string, WeaponDef>,
  armorData: Record<string, ArmorDef>,
  accessoryData: Record<string, AccessoryDef>,
): Modifier[] {
  return [
    ...bridgeSkills(player),
    ...bridgeWeaponClass(player, weaponData),
    ...bridgeBuffs(player),
    ...armorModifiers(player, armorData),
    ...accessoryModifiers(player, accessoryData),
  ];
}
