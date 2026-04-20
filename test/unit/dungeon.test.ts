import { describe, expect, it } from 'vitest';
import { generateFloor, generateDungeonWeapon } from '../../src/engine/dungeon';
import { createRng } from '../../src/engine/rng';
import type { WeaponClass } from '../../src/engine/types';

describe('generateDungeonWeapon', () => {
  it('returns a weapon with class derived from suffix', () => {
    const rng = createRng(42);
    const weapon = generateDungeonWeapon(10, rng);

    expect(weapon.id).toMatch(/^dng_weapon_f10_/);
    expect(weapon.name).toBeTruthy();
    expect(weapon.attack_bonus).toBe(22); // 2 + 10 * 2
    expect(['blade', 'heavy', 'pierce', 'magic']).toContain(weapon.weapon_class);
  });

  it('maps all suffix types to valid weapon classes', () => {
    const seen = new Set<WeaponClass>();
    for (let seed = 0; seed < 100; seed++) {
      const rng = createRng(seed);
      const weapon = generateDungeonWeapon(1, rng);
      seen.add(weapon.weapon_class);
    }
    expect(seen.has('blade')).toBe(true);
    expect(seen.has('heavy')).toBe(true);
    expect(seen.has('pierce')).toBe(true);
  });

  it('Staff-suffix dungeon weapons are magic class with a status_effect', () => {
    // Search many seeds to find one that generates a Staff weapon, then
    // assert its shape. Use a small floor number for stable behavior.
    let foundStaff = false;
    for (let seed = 0; seed < 200 && !foundStaff; seed++) {
      const rng = createRng(seed);
      const weapon = generateDungeonWeapon(3, rng);
      if (weapon.name.endsWith('Staff')) {
        foundStaff = true;
        expect(weapon.weapon_class).toBe('magic');
        expect(weapon.status_effect).toBeDefined();
        expect(weapon.status_effect!.type).not.toBe('stun');
        expect(['burn', 'poison']).toContain(weapon.status_effect!.type);
      }
    }
    expect(foundStaff).toBe(true);
  });
});

describe('generateFloor', () => {
  it('includes weapon definitions for boss loot weapons', () => {
    // Floor 10 guarantees a full boss (floor % 10 === 0)
    const result = generateFloor(10, 42);

    // Find the boss enemy that has a loot_weapon
    const bossEntry = Object.values(result.enemies).find(e => e.loot_weapon);
    if (!bossEntry) {
      // Some seeds may not produce a boss with weapon loot on non-10 floors,
      // but floor 10 always has a full boss with a weapon.
      throw new Error('Floor 10 boss should always drop a weapon');
    }

    const weaponId = bossEntry.loot_weapon!;
    const weaponDef = result.weapons[weaponId];

    expect(weaponDef).toBeDefined();
    expect(weaponDef.name).toBeTruthy();
    expect(weaponDef.attack_bonus).toBe(22); // 2 + 10 * 2
    expect(['blade', 'heavy', 'pierce', 'magic']).toContain(weaponDef.weapon_class);
    expect(weaponDef.region).toBe('dungeon');
  });

  it('returns empty weapons record for non-boss floors', () => {
    // Floor 1 has no full boss (1 % 10 !== 0, 1 % 5 !== 0)
    const result = generateFloor(1, 42);
    expect(Object.keys(result.weapons)).toHaveLength(0);
  });
});
