import { describe, expect, it } from 'vitest';
import weaponsRaw from '../../src/data/weapons.json';
import type { WeaponDef } from '../../src/engine/types';

const weapons = weaponsRaw as Record<string, WeaponDef>;

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
