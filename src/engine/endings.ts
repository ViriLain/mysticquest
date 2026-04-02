import type { EndingDef, PlayerState, WorldState, EndingCheckContext, RGBA } from './types';
import { hasKeyItem } from './player';
import { visitedCount } from './player';
import { nonHiddenRoomCount, addDynamicExit } from './world';

export function checkEndings(
  endings: Record<string, EndingDef>,
  player: PlayerState,
  world: WorldState,
  context: EndingCheckContext = {}
): EndingDef | null {
  for (const [id, ending] of Object.entries(endings)) {
    if (checkTrigger(ending, player, world, context)) {
      return { ...ending, title: ending.title || id };
    }
  }
  return null;
}

function checkTrigger(
  ending: EndingDef,
  player: PlayerState,
  world: WorldState,
  context: EndingCheckContext
): boolean {
  const t = ending.trigger_type;

  if (t === 'boss_defeated') {
    return context.bossJustDefeated === ending.trigger_value;
  }

  if (t === 'choice') {
    return (
      player.currentRoom === ending.trigger_room &&
      !!ending.trigger_item && hasKeyItem(player, ending.trigger_item) &&
      !!ending.choice_options &&
      context.choiceMade === ending.choice_options[ending.choice_trigger ?? 0]
    );
  }

  if (t === 'exploration') {
    if (!ending.trigger_item || !hasKeyItem(player, ending.trigger_item)) return false;
    const pct = (visitedCount(player) / nonHiddenRoomCount(world)) * 100;
    if (pct < (ending.rooms_percent ?? 100)) return false;
    if (ending.trigger_exit_target && ending.trigger_room) {
      addDynamicExit(world, ending.trigger_room, ending.trigger_exit_dir || 'down', ending.trigger_exit_target);
    }
    return player.currentRoom === (ending.trigger_exit_target || ending.trigger_room);
  }

  if (t === 'multi_item_use') {
    if (player.currentRoom !== ending.trigger_room) return false;
    if (!ending.trigger_items) return false;
    const roomUsed = player.usedItemsInRoom[player.currentRoom];
    if (!roomUsed) return false;
    for (const itemId of ending.trigger_items) {
      if (!roomUsed[itemId]) return false;
    }
    return true;
  }

  return false;
}

export function getChoicePrompt(
  endings: Record<string, EndingDef>,
  player: PlayerState,
): EndingDef | null {
  for (const [, ending] of Object.entries(endings)) {
    if (
      ending.trigger_type === 'choice' &&
      player.currentRoom === ending.trigger_room &&
      ending.trigger_item && hasKeyItem(player, ending.trigger_item)
    ) {
      return ending;
    }
  }
  return null;
}

export function getEffectColor(effectName?: string): RGBA | null {
  if (effectName === 'gold_glow') return [1, 0.85, 0.2, 1];
  if (effectName === 'red_corruption') return [0.8, 0.1, 0.1, 1];
  if (effectName === 'warm_amber') return [1, 0.7, 0.3, 1];
  if (effectName === 'psychedelic') return null;
  return [0.2, 1.0, 0.2, 1];
}
