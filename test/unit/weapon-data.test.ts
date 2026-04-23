import { describe, expect, it } from 'vitest';
import accessoriesRaw from '../../src/data/accessories.json';
import armorRaw from '../../src/data/armor.json';
import weaponsRaw from '../../src/data/weapons.json';
import type { AccessoryDef, ArmorDef, ModifierType, WeaponDef } from '../../src/engine/types';

const weapons = weaponsRaw as Record<string, WeaponDef>;
const armor = armorRaw as Record<string, ArmorDef>;
const accessories = accessoriesRaw as Record<string, AccessoryDef>;

describe('weapons.json data integrity', () => {
  it('every magic-class weapon has a status_effect defined', () => {
    const offenders: string[] = [];
    for (const [id, weapon] of Object.entries(weapons)) {
      if (weapon.weapon_class === 'magic' && !weapon.status_effect) {
        offenders.push(id);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every weapon declares a weapon_class', () => {
    const offenders: string[] = [];
    for (const [id, weapon] of Object.entries(weapons)) {
      if (!weapon.weapon_class) offenders.push(id);
    }
    expect(offenders).toEqual([]);
  });
});

const VALID_MODIFIER_TYPES: ModifierType[] = [
  'attack', 'defense', 'max_hp', 'crit_chance', 'crit_mult',
  'def_ignore', 'cooldown_reduction', 'status_duration',
  'magic_counter_threshold', 'damage_reduction',
];

describe('armor.json data integrity', () => {
  it('every armor has positive defense', () => {
    for (const [id, a] of Object.entries(armor)) {
      expect(a.defense, `${id} defense`).toBeGreaterThan(0);
    }
  });
});

describe('accessories.json data integrity', () => {
  it('every accessory has at least one modifier', () => {
    for (const [id, acc] of Object.entries(accessories)) {
      expect(acc.modifiers.length, `${id} modifiers`).toBeGreaterThan(0);
    }
  });

  it('all modifier types are valid', () => {
    for (const [id, acc] of Object.entries(accessories)) {
      for (const mod of acc.modifiers) {
        expect(VALID_MODIFIER_TYPES, `${id} modifier type ${mod.type}`).toContain(mod.type);
      }
    }
  });
});
