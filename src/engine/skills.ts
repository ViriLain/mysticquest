import type { SkillDef, SkillBranch } from './types';

export const SKILL_TREE: SkillDef[] = [
  // Warrior
  { id: 'iron_will', name: 'Iron Will', branch: 'warrior', description: '+5 max HP per level', tier: 1 },
  { id: 'heavy_blows', name: 'Heavy Blows', branch: 'warrior', description: '+2 base attack', tier: 2 },
  { id: 'thick_skin', name: 'Thick Skin', branch: 'warrior', description: '+2 base defense', tier: 3 },
  { id: 'berserker', name: 'Berserker', branch: 'warrior', description: '+15% damage when HP below 30%', tier: 4 },
  { id: 'titan', name: 'Titan', branch: 'warrior', description: '+15 max HP, +1 ATK, +1 DEF', tier: 5 },
  // Rogue
  { id: 'sharp_eyes', name: 'Sharp Eyes', branch: 'rogue', description: 'Crit chance 10% → 18%', tier: 1 },
  { id: 'quick_feet', name: 'Quick Feet', branch: 'rogue', description: 'Flee success 70% → 90%', tier: 2 },
  { id: 'precision', name: 'Precision', branch: 'rogue', description: '+3 ATK, ignore 2 enemy DEF', tier: 3 },
  { id: 'lucky', name: 'Lucky', branch: 'rogue', description: '15% chance to dodge attacks', tier: 4 },
  { id: 'assassin', name: 'Assassin', branch: 'rogue', description: 'Crits deal 3x damage (instead of 2x)', tier: 5 },
  // Mage
  { id: 'herbalism', name: 'Herbalism', branch: 'mage', description: 'Healing items restore 50% more', tier: 1 },
  { id: 'arcane_shield', name: 'Arcane Shield', branch: 'mage', description: '-1 damage from all attacks', tier: 2 },
  { id: 'buff_mastery', name: 'Buff Mastery', branch: 'mage', description: 'Buffs last 5 rounds (not 3)', tier: 3 },
  { id: 'meditation', name: 'Meditation', branch: 'mage', description: 'Regenerate 2 HP per combat round', tier: 4 },
  { id: 'enlightened', name: 'Enlightened', branch: 'mage', description: '+50% XP from all sources', tier: 5 },
];

export function getSkillsByBranch(branch: SkillBranch): SkillDef[] {
  return SKILL_TREE.filter(s => s.branch === branch).sort((a, b) => a.tier - b.tier);
}

export function getSkill(id: string): SkillDef | undefined {
  return SKILL_TREE.find(s => s.id === id);
}

export function canLearnSkill(skills: Record<string, boolean>, skillId: string): boolean {
  const skill = getSkill(skillId);
  if (!skill) return false;
  if (skills[skillId]) return false; // already learned
  // Must have all lower tiers in same branch
  const branchSkills = getSkillsByBranch(skill.branch);
  for (const bs of branchSkills) {
    if (bs.tier < skill.tier && !skills[bs.id]) return false;
  }
  return true;
}

// Match skill by name or id (fuzzy)
export function findSkillByName(name: string): SkillDef | undefined {
  const lower = name.toLowerCase();
  return SKILL_TREE.find(s => s.id === lower || s.name.toLowerCase() === lower)
    || SKILL_TREE.find(s => s.id.includes(lower) || s.name.toLowerCase().includes(lower));
}
