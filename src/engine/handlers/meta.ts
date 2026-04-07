import * as C from '../constants';
import { addLine } from '../output';
import { canLearnSkill, findSkillByName } from '../skills';
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
    addLine(store, `You need to learn earlier skills in the ${skill.branch} branch first.`, C.ERROR_COLOR);
    return;
  }

  if (store.player.skillPoints <= 0) {
    addLine(store, 'You have no skill points. Level up to earn more.', C.ERROR_COLOR);
    return;
  }

  store.player.skills[skill.id] = true;
  store.player.skillPoints--;

  if (skill.id === 'iron_will') {
    const bonus = 5 * store.player.level;
    store.player.maxHp += bonus;
    store.player.hp += bonus;
  } else if (skill.id === 'heavy_blows') {
    store.player.attack += 2;
  } else if (skill.id === 'thick_skin') {
    store.player.defense += 2;
  } else if (skill.id === 'titan') {
    store.player.maxHp += 15;
    store.player.hp += 15;
    store.player.attack += 1;
    store.player.defense += 1;
  }

  addLine(store, `Learned ${skill.name}! ${skill.description}`, C.ITEM_COLOR);
  emit('levelUp');
  refreshHeader();
  checkScholar();
}
