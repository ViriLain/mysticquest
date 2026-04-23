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

  it('bridges spellweaver skill to magic_counter_threshold modifier', () => {
    const player = createPlayer();
    player.skills.spellweaver = true;
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(totalModifier(mods, 'magic_counter_threshold')).toBe(-1);
  });

  it('bridges lingering_magic skill to status_duration modifier', () => {
    const player = createPlayer();
    player.skills.lingering_magic = true;
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(totalModifier(mods, 'status_duration')).toBe(1);
  });

  it('bridges arcane_mastery to both status_duration and magic_counter_threshold', () => {
    const player = createPlayer();
    player.skills.arcane_mastery = true;
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(totalModifier(mods, 'status_duration')).toBe(1);
    expect(totalModifier(mods, 'magic_counter_threshold')).toBe(-1);
  });

  it('stacks spellweaver + mystic_lens + arcane_mastery for magic threshold -3', () => {
    const player = createPlayer();
    player.skills.spellweaver = true;
    player.skills.arcane_mastery = true;
    player.equippedAccessory = 'keen_eye_ring'; // no threshold mod
    // Use an accessory with threshold -1
    const lensData: Record<string, import('../../src/engine/types').AccessoryDef> = {
      ...accessoryData,
      mystic_lens: {
        name: 'Mystic Lens', description: 't', region: 'hidden',
        modifiers: [{ type: 'magic_counter_threshold', value: -1 }],
      },
    };
    player.equippedAccessory = 'mystic_lens';
    const mods = collectModifiers(player, weaponData, armorData, lensData);
    // spellweaver (-1) + arcane_mastery (-1) + mystic_lens (-1) = -3
    // But magic threshold floors at 2, so max(-3 + 3 = 0... wait, the floor is in combat.ts)
    // The modifier system just sums; combat applies the floor
    expect(totalModifier(mods, 'magic_counter_threshold')).toBe(-3);
  });

  it('stacks lingering_magic + arcane_mastery for +2 status_duration', () => {
    const player = createPlayer();
    player.skills.lingering_magic = true;
    player.skills.arcane_mastery = true;
    const mods = collectModifiers(player, weaponData, armorData, accessoryData);
    expect(totalModifier(mods, 'status_duration')).toBe(2);
  });
});
