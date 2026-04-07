import * as C from '../constants';
import { addLine, emitSound } from '../output';
import type { EnemyDef, GameStore } from '../types';
import { getLivingEnemies } from '../world';

function findEnemyInRoom(
  name: string,
  store: GameStore,
  enemyData: Record<string, EnemyDef>,
): string | null {
  if (!store.world || !store.player) return null;
  const lower = name.toLowerCase();
  const living = getLivingEnemies(store.world, store.player.currentRoom);
  for (const enemyId of living) {
    const enemy = enemyData[enemyId];
    if (!enemy) continue;
    if (enemyId.toLowerCase() === lower || enemy.name.toLowerCase() === lower) return enemyId;
    if (enemyId.toLowerCase().includes(lower) || enemy.name.toLowerCase().includes(lower)) return enemyId;
  }
  return null;
}

export function handleAttack(
  store: GameStore,
  target: string,
  enemyData: Record<string, EnemyDef>,
  startCombat: (enemyId: string) => void,
): void {
  if (!store.player || !store.world) return;

  if (!target) {
    const living = getLivingEnemies(store.world, store.player.currentRoom);
    if (living.length === 1) {
      target = living[0];
    } else {
      addLine(store, 'Attack what?', C.ERROR_COLOR);
      return;
    }
  }

  const enemyId = findEnemyInRoom(target, store, enemyData);
  if (!enemyId) {
    addLine(store, "There's nothing like that to fight here.", C.ERROR_COLOR);
    emitSound(store, 'error');
    return;
  }

  startCombat(enemyId);
}
