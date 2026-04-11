import * as C from '../constants';
import { addLine, clearTerminal } from '../output';
import { applySkillEffects, canLearnSkill, getSkillsByTier } from '../skills';
import type { GameStore } from '../types';

export interface SkillTreeDeps {
  refreshHeader: () => void;
  emit: (sound: string) => void;
  checkScholar: () => void;
}

const MAX_TIER = 5;
const SKILLS_PER_TIER = 3;

export function displaySkillTree(store: GameStore): void {
  if (!store.player) return;
  clearTerminal(store);

  addLine(store, '=== Skill Tree ===', C.STAT_COLOR);
  addLine(store, `Skill Points: ${store.player.skillPoints}`, C.CHOICE_COLOR);
  addLine(store, '');

  const sel = store.skillTreeSelected;

  for (let tier = 1; tier <= MAX_TIER; tier++) {
    addLine(store, `--- Tier ${tier} ---`, C.COMBAT_COLOR);
    const skills = getSkillsByTier(tier);
    for (let i = 0; i < skills.length; i++) {
      const skill = skills[i];
      const isSelected = sel.tier === tier && sel.index === i;
      const learned = store.player.skills[skill.id];
      const available = canLearnSkill(store.player.skills, skill.id);

      let marker: string;
      let color: typeof C.ITEM_COLOR;
      if (isSelected) {
        marker = '>>';
        color = learned ? C.ITEM_COLOR : available ? C.CHOICE_COLOR : C.HELP_COLOR;
      } else if (learned) {
        marker = '[*]';
        color = C.ITEM_COLOR;
      } else if (available) {
        marker = '[>]';
        color = C.CHOICE_COLOR;
      } else {
        marker = '[ ]';
        color = C.HELP_COLOR;
      }

      addLine(store, `  ${marker} ${skill.name} - ${skill.description}`, color);
    }
    addLine(store, '');
  }

  // Detail line for selected skill
  const selectedSkills = getSkillsByTier(sel.tier);
  const selectedSkill = selectedSkills[sel.index];
  if (selectedSkill) {
    const learned = store.player.skills[selectedSkill.id];
    const available = canLearnSkill(store.player.skills, selectedSkill.id);
    if (learned) {
      addLine(store, `> ${selectedSkill.name} — LEARNED`, C.ITEM_COLOR);
    } else if (available && store.player.skillPoints > 0) {
      addLine(store, `> ${selectedSkill.name} — ${selectedSkill.description}  [press Enter to learn]`, C.CHOICE_COLOR);
    } else if (available) {
      addLine(store, `> ${selectedSkill.name} — ${selectedSkill.description}  [no skill points]`, C.HELP_COLOR);
    } else {
      addLine(store, `> ${selectedSkill.name} — ${selectedSkill.description}  [requires a skill from previous tier]`, C.HELP_COLOR);
    }
  }

  addLine(store, '');
  addLine(store, 'Arrow keys to navigate, Enter to learn, Escape to close', [0.5, 0.5, 0.5, 0.8]);
}

export function handleSkillTreeKey(
  store: GameStore,
  key: string,
  deps: SkillTreeDeps,
): void {
  if (!store.player) return;

  const sel = store.skillTreeSelected;

  if (key === 'ArrowUp') {
    sel.tier = Math.max(1, sel.tier - 1);
    displaySkillTree(store);
  } else if (key === 'ArrowDown') {
    sel.tier = Math.min(MAX_TIER, sel.tier + 1);
    displaySkillTree(store);
  } else if (key === 'ArrowLeft') {
    sel.index = Math.max(0, sel.index - 1);
    displaySkillTree(store);
  } else if (key === 'ArrowRight') {
    sel.index = Math.min(SKILLS_PER_TIER - 1, sel.index + 1);
    displaySkillTree(store);
  } else if (key === 'Enter') {
    const skills = getSkillsByTier(sel.tier);
    const skill = skills[sel.index];
    if (!skill) return;

    if (store.player.skills[skill.id]) {
      addLine(store, `You already know ${skill.name}.`, C.ERROR_COLOR);
      return;
    }

    if (!canLearnSkill(store.player.skills, skill.id)) {
      addLine(store, 'Learn a skill from the previous tier first.', C.ERROR_COLOR);
      return;
    }

    if (store.player.skillPoints <= 0) {
      addLine(store, 'You have no skill points. Level up to earn more.', C.ERROR_COLOR);
      return;
    }

    store.player.skills[skill.id] = true;
    store.player.skillPoints--;
    applySkillEffects(store.player, skill.id);

    addLine(store, `Learned ${skill.name}! ${skill.description}`, C.ITEM_COLOR);
    deps.emit('levelUp');
    deps.refreshHeader();
    deps.checkScholar();

    // Re-render the tree to show updated state
    displaySkillTree(store);
  } else if (key === 'Escape') {
    store.state = store.skillTreePrevState;
  }
}
