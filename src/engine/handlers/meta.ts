import * as C from '../constants';
import { addLine } from '../output';
import { applySkillEffects, canLearnSkill, findSkillByName } from '../skills';
import type { GameStore } from '../types';

export function handleLearn(
  store: GameStore,
  target: string,
  refreshHeader: () => void,
  emit: (sound: string) => void,
  checkScholar: () => void,
): void {
  if (!store.player) return;
  if (!target) {
    addLine(store, 'Learn what? Type "skills" to see available skills.', C.ERROR_COLOR);
    return;
  }

  const skill = findSkillByName(target);
  if (!skill) {
    addLine(store, "Unknown skill. Type 'skills' to see available skills.", C.ERROR_COLOR);
    return;
  }

  if (store.player.skills[skill.id]) {
    addLine(store, `You already know ${skill.name}.`, C.ERROR_COLOR);
    return;
  }

  if (!canLearnSkill(store.player.skills, skill.id)) {
    addLine(store, 'You need to learn a skill from the previous tier first.', C.ERROR_COLOR);
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
  emit('levelUp');
  refreshHeader();
  checkScholar();
}
