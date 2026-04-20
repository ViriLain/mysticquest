import { describe, expect, it } from 'vitest';
import { collectModifiers, totalModifier } from '../../src/engine/modifiers';
import { createPlayer } from '../../src/engine/player';
import type { AccessoryDef, ArmorDef, Modifier, WeaponDef } from '../../src/engine/types';

const weaponData: Record<string, WeaponDef> = {
  test_blade: { name: 'Test Blade', attack_bonus: 5, region: 'manor', weapon_class: 'blade', description: 'test' },
  test_heavy: { name: 'Test Heavy', attack_bonus: 5, region: 'manor', weapon_class: 'heavy', description: 'test' },
};

const armorData: Record<string, ArmorDef> = {
  leather_vest: { name: 'Leather Vest', defense: 2, region: 'manor', description: 'basic' },
};

const accessoryData: Record<string, AccessoryDef> = {
  keen_eye_ring: {
    name: 'Keen Eye Ring', description: 'sharp', region: 'manor',
    modifiers: [{ type: 'crit_chance', value: 8 }],
  },
  berserker_tooth: {
    name: 'Berserker Tooth', description: 'fierce', region: 'darkness',
    modifiers: [{ type: 'attack', value: 3 }, { type: 'defense', value: -1 }],
  },
};

describe('totalModifier', () => {
  it('sums values for a given type', () => {
    const mods: Modifier[] = [
      { type: 'attack', value: 3, source: 'accessory', sourceId: 'x' },
      { type: 'defense', value: 2, source: 'armor', sourceId: 'y' },
      { type: 'attack', value: 5, source: 'buff', sourceId: 'z' },
    ];
    expect(totalModifier(mods, 'attack')).toBe(8);
    expect(totalModifier(mods, 'defense')).toBe(2);
  });

  it('returns 0 for absent modifier types', () => {
    const mods: Modifier[] = [
      { type: 'attack', value: 3, source: 'skill', sourceId: 'x' },
    ];
    expect(totalModifier(mods, 'crit_chance')).toBe(0);
  });
});

describe('collectModifiers', () => {
  it('collects modifiers from equipped accessory', () => {
    const player = createPlayer();
    player.equippedAccessory = 'keen_eye_ring';
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(mods.some(m => m.type === 'crit_chance' && m.value === 8 && m.source === 'accessory')).toBe(true);
  });

  it('collects defense modifier from equipped armor', () => {
    const player = createPlayer();
    player.equippedArmor = 'leather_vest';
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(mods.some(m => m.type === 'defense' && m.value === 2 && m.source === 'armor')).toBe(true);
  });

  it('bridges sharp_eyes skill to crit_chance modifier', () => {
    const player = createPlayer();
    player.skills.sharp_eyes = true;
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(mods.some(m => m.type === 'crit_chance' && m.value === 8 && m.sourceId === 'sharp_eyes')).toBe(true);
  });

  it('bridges blade weapon class to crit_chance modifier', () => {
    const player = createPlayer();
    player.weapons = ['test_blade'];
    player.equippedWeapon = 'test_blade';
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(mods.some(m => m.type === 'crit_chance' && m.value === 10 && m.sourceId === 'blade')).toBe(true);
  });

  it('bridges heavy weapon class to def_ignore modifier', () => {
    const player = createPlayer();
    player.weapons = ['test_heavy'];
    player.equippedWeapon = 'test_heavy';
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(mods.some(m => m.type === 'def_ignore' && m.value === 2 && m.sourceId === 'heavy')).toBe(true);
  });

  it('bridges active buff to attack modifier', () => {
    const player = createPlayer();
    player.buffAttack = 3;
    player.buffRounds = 2;
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(mods.some(m => m.type === 'attack' && m.value === 3 && m.source === 'buff')).toBe(true);
  });

  it('does not emit buff modifier when buffRounds is 0', () => {
    const player = createPlayer();
    player.buffAttack = 3;
    player.buffRounds = 0;
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(mods.some(m => m.source === 'buff')).toBe(false);
  });

  it('collects multiple modifiers from a multi-modifier accessory', () => {
    const player = createPlayer();
    player.equippedAccessory = 'berserker_tooth';
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(mods.some(m => m.type === 'attack' && m.value === 3)).toBe(true);
    expect(mods.some(m => m.type === 'defense' && m.value === -1)).toBe(true);
  });
});
