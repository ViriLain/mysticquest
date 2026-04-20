import type { PlayerState } from './types';

// Single source of truth for the skill tree. SkillId is derived from this
// array — adding a skill here is all that's needed.
const _SKILLS = [
  // Tier 1 — General
  { id: 'iron_will', name: 'Iron Will', description: '+5 max HP per level', tier: 1 },
  { id: 'sharp_eyes', name: 'Sharp Eyes', description: 'Crit chance 10% → 18%', tier: 1 },
  { id: 'herbalism', name: 'Herbalism', description: 'Healing items restore 50% more', tier: 1 },
  // Tier 2 — Utility
  { id: 'heavy_blows', name: 'Heavy Blows', description: '+2 base attack', tier: 2 },
  { id: 'quick_feet', name: 'Quick Feet', description: 'Flee success 70% → 90%', tier: 2 },
  { id: 'arcane_shield', name: 'Arcane Shield', description: '-1 damage from all attacks', tier: 2 },
  // Tier 3 — Mid-specialization
  { id: 'thick_skin', name: 'Thick Skin', description: '+2 base defense', tier: 3 },
  { id: 'precision', name: 'Precision', description: '+3 ATK, ignore 2 enemy DEF', tier: 3 },
  { id: 'buff_mastery', name: 'Buff Mastery', description: 'Buffs last 5 rounds (not 3)', tier: 3 },
  { id: 'power_strike', name: 'Power Strike', description: 'Active: 1.5x damage, ignore 3 DEF. 5-round cooldown.', tier: 3 },
  { id: 'ambush', name: 'Ambush', description: 'Active: Guaranteed 3x critical hit. 4-round cooldown.', tier: 3 },
  { id: 'arcane_surge', name: 'Arcane Surge', description: 'Active: Double-duration status proc or magic burst. 5-round cooldown.', tier: 3 },
  // Tier 4 — Specialized
  { id: 'berserker', name: 'Berserker', description: '+15% damage when HP below 30%', tier: 4 },
  { id: 'lucky', name: 'Lucky', description: '15% chance to dodge attacks', tier: 4 },
  { id: 'meditation', name: 'Meditation', description: 'Regenerate 2 HP per combat round', tier: 4 },
  // Tier 5 — Capstone
  { id: 'titan', name: 'Titan', description: '+15 max HP, +1 ATK, +1 DEF', tier: 5 },
  { id: 'assassin', name: 'Assassin', description: 'Crits deal 3x damage (instead of 2x)', tier: 5 },
  { id: 'enlightened', name: 'Enlightened', description: '+50% XP from all sources', tier: 5 },
] as const;

/** All valid skill IDs — derived from the SKILL_TREE array. */
export type SkillId = typeof _SKILLS[number]['id'];

export interface SkillDef {
  id: SkillId;
  name: string;
  description: string;
  tier: number;
}

export const SKILL_TREE: readonly SkillDef[] = _SKILLS;

export const ACTIVE_SKILLS = new Set<string>(['power_strike', 'ambush', 'arcane_surge']);

export function getSkillsByTier(tier: number): SkillDef[] {
  return SKILL_TREE.filter(s => s.tier === tier);
}

export function getSkill(id: string): SkillDef | undefined {
  return SKILL_TREE.find(s => s.id === id);
}

export function canLearnSkill(skills: Record<string, boolean>, skillId: string): boolean {
  const skill = getSkill(skillId);
  if (!skill) return false;
  if (skills[skillId]) return false;
  if (skill.tier === 1) return true;
  // Must have at least one skill from the previous tier
  const prevTierSkills = getSkillsByTier(skill.tier - 1);
  return prevTierSkills.some(s => skills[s.id]);
}

// Match skill by name or id (fuzzy)
export function findSkillByName(name: string): SkillDef | undefined {
  const lower = name.toLowerCase();
  return SKILL_TREE.find(s => s.id === lower || s.name.toLowerCase() === lower)
    || SKILL_TREE.find(s => s.id.includes(lower) || s.name.toLowerCase().includes(lower));
}

/**
 * Apply immediate stat effects when a skill is learned.
 * Called by both the text `learn` command and the skill tree UI.
 */
export function applySkillEffects(player: PlayerState, skillId: string): void {
  if (skillId === 'iron_will') {
    const bonus = 5 * player.level;
    player.maxHp += bonus;
    player.hp += bonus;
  } else if (skillId === 'heavy_blows') {
    player.attack += 2;
  } else if (skillId === 'thick_skin') {
    player.defense += 2;
  } else if (skillId === 'titan') {
    player.maxHp += 15;
    player.hp += 15;
    player.attack += 1;
    player.defense += 1;
  }
}
