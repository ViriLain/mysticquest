import { describe, expect, it } from 'vitest';
import { SKILL_TREE, getSkillsByTier, canLearnSkill, findSkillByName, applySkillEffects } from '../../src/engine/skills';
import { createPlayer } from '../../src/engine/player';

describe('skill tree structure', () => {
  it('has 18 skills across 5 tiers', () => {
    expect(SKILL_TREE.length).toBe(18);
    // Tiers 1, 2, 4, 5 have 3 skills each; tier 3 has 6 (3 passive + 3 active)
    for (const tier of [1, 2, 4, 5]) {
      expect(getSkillsByTier(tier).length).toBe(3);
    }
    expect(getSkillsByTier(3).length).toBe(6);
  });

  it('has no branch field on skills', () => {
    for (const skill of SKILL_TREE) {
      expect(skill).not.toHaveProperty('branch');
    }
  });
});

describe('canLearnSkill', () => {
  it('tier 1 skills are always available', () => {
    expect(canLearnSkill({}, 'iron_will')).toBe(true);
    expect(canLearnSkill({}, 'sharp_eyes')).toBe(true);
    expect(canLearnSkill({}, 'herbalism')).toBe(true);
  });

  it('tier 2 requires at least one tier 1 skill', () => {
    expect(canLearnSkill({}, 'heavy_blows')).toBe(false);
    expect(canLearnSkill({ iron_will: true }, 'heavy_blows')).toBe(true);
    expect(canLearnSkill({ sharp_eyes: true }, 'heavy_blows')).toBe(true);
  });

  it('tier 3 requires at least one tier 2 skill', () => {
    expect(canLearnSkill({ iron_will: true }, 'thick_skin')).toBe(false);
    expect(canLearnSkill({ iron_will: true, heavy_blows: true }, 'thick_skin')).toBe(true);
  });

  it('rejects already-learned skills', () => {
    expect(canLearnSkill({ iron_will: true }, 'iron_will')).toBe(false);
  });
});

describe('findSkillByName', () => {
  it('finds by exact id', () => {
    expect(findSkillByName('iron_will')?.id).toBe('iron_will');
  });

  it('finds by exact name', () => {
    expect(findSkillByName('Iron Will')?.id).toBe('iron_will');
  });

  it('finds by partial name', () => {
    expect(findSkillByName('iron')?.id).toBe('iron_will');
  });
});

describe('applySkillEffects', () => {
  it('iron_will adds 5 HP per level', () => {
    const player = createPlayer();
    player.level = 3;
    const prevMax = player.maxHp;
    applySkillEffects(player, 'iron_will');
    expect(player.maxHp).toBe(prevMax + 15);
    expect(player.hp).toBe(player.maxHp);
  });

  it('heavy_blows adds 2 attack', () => {
    const player = createPlayer();
    const prev = player.attack;
    applySkillEffects(player, 'heavy_blows');
    expect(player.attack).toBe(prev + 2);
  });

  it('thick_skin adds 2 defense', () => {
    const player = createPlayer();
    const prev = player.defense;
    applySkillEffects(player, 'thick_skin');
    expect(player.defense).toBe(prev + 2);
  });

  it('titan adds 15 HP, 1 ATK, 1 DEF', () => {
    const player = createPlayer();
    const prevHp = player.maxHp;
    const prevAtk = player.attack;
    const prevDef = player.defense;
    applySkillEffects(player, 'titan');
    expect(player.maxHp).toBe(prevHp + 15);
    expect(player.attack).toBe(prevAtk + 1);
    expect(player.defense).toBe(prevDef + 1);
  });

  it('no-op for skills without stat effects', () => {
    const player = createPlayer();
    const before = { hp: player.hp, attack: player.attack, defense: player.defense };
    applySkillEffects(player, 'sharp_eyes');
    expect(player.hp).toBe(before.hp);
    expect(player.attack).toBe(before.attack);
    expect(player.defense).toBe(before.defense);
  });
});
