import objectivesData from '../data/objectives.json';
import * as C from './constants';
import { addLine } from './output';
import type {
  GameStore,
  ObjectiveCompletion,
  ObjectiveDef,
  ObjectiveTrigger,
} from './types';

/** The full list of hand-authored objectives, loaded from JSON at import time. */
export const OBJECTIVES: readonly ObjectiveDef[] = objectivesData as ObjectiveDef[];

/**
 * Events emitted by handlers. Exactly mirrors the external trigger types.
 * Chained objectives (trigger type `objective_completed`) are handled
 * internally — callers never construct those events.
 */
export type ObjectiveEvent =
  | { type: 'talked_to_npc'; npc: string }
  | { type: 'entered_room'; room: string }
  | { type: 'searched_room'; room: string }
  | { type: 'took_item'; item: string }
  | { type: 'defeated_enemy'; enemy: string };

/** Internal superset — adds the chain event. Used in Task 6 chaining; not yet consumed. */
type AnyObjectiveEvent =
  | ObjectiveEvent
  | { type: 'objective_completed'; objective: string };

function triggerMatches(trigger: ObjectiveTrigger, event: AnyObjectiveEvent): boolean {
  if (trigger.type !== event.type) return false;
  switch (event.type) {
    case 'talked_to_npc': return trigger.npc === event.npc;
    case 'entered_room': return trigger.room === event.room;
    case 'searched_room': return trigger.room === event.room;
    case 'took_item': return trigger.item === event.item;
    case 'defeated_enemy': return trigger.enemy === event.enemy;
    case 'objective_completed': return trigger.objective === event.objective;
  }
}

/** Pure check: does the current store state satisfy this objective's completion? */
export function isCompletionSatisfied(
  store: GameStore,
  completion: ObjectiveCompletion,
): boolean {
  if (!store.player) return false;
  const player = store.player;

  switch (completion.type) {
    case 'key_items_collected': {
      const items = completion.items ?? [];
      if (items.length === 0) return false;
      return items.every(
        id => player.keyItems[id] === true || (player.inventory[id] ?? 0) > 0,
      );
    }

    case 'enemy_defeated': {
      if (!completion.enemy || !store.world) return false;
      return Object.values(store.world.rooms).some(
        room => room._dead_enemies?.[completion.enemy!] === true,
      );
    }

    case 'visited_rooms_percent': {
      if (completion.percent === undefined || !store.world) return false;
      const nonHidden = Object.keys(store.world.rooms).filter(id => {
        const room = store.world!.rooms[id];
        return room.region !== 'hidden' && !id.startsWith('dng_');
      });
      if (nonHidden.length === 0) return false;
      const visitedNonHidden = nonHidden.filter(id => player.visitedRooms[id]);
      return visitedNonHidden.length / nonHidden.length >= completion.percent / 100;
    }

    case 'used_items_in_room': {
      if (!completion.room || !completion.items) return false;
      const used = player.usedItemsInRoom[completion.room];
      if (!used) return false;
      return completion.items.every(id => used[id] === true);
    }

    case 'objective_completed': {
      if (!completion.objective) return false;
      return player.objectives[completion.objective] === 'complete';
    }
  }
}

/**
 * Called from handlers whenever an objective-relevant event occurs. Mutates
 * `store.player.objectives` and queues notification lines via `addLine`
 * (which lands in `store.typewriterQueue`). Returns the sets of newly
 * activated and completed objectives for callers that need to inspect them
 * (e.g. tests, Task 6 chaining). Production callers can ignore the return.
 */
export function notifyObjectiveEvent(
  store: GameStore,
  event: ObjectiveEvent,
  objectives: readonly ObjectiveDef[] = OBJECTIVES,
): { activated: ObjectiveDef[]; completed: ObjectiveDef[] } {
  if (!store.player) return { activated: [], completed: [] };
  const player = store.player;

  const newlyActivated: ObjectiveDef[] = [];
  const newlyCompleted: ObjectiveDef[] = [];

  // Step 1: activate any untriggered objectives whose trigger matches.
  for (const obj of objectives) {
    if (player.objectives[obj.id] !== undefined) continue;
    if (triggerMatches(obj.trigger, event)) {
      player.objectives[obj.id] = 'active';
      newlyActivated.push(obj);
    }
  }

  // Step 2: re-check completion for every active objective. Freshly-activated
  // objectives are checked here too, which handles the "collected items before
  // the trigger fired" case — they flip untriggered → active → complete in
  // a single call and both notifications fire in order.
  for (const obj of objectives) {
    if (player.objectives[obj.id] !== 'active') continue;
    if (isCompletionSatisfied(store, obj.completion)) {
      player.objectives[obj.id] = 'complete';
      newlyCompleted.push(obj);
    }
  }

  // Step 3: write notification lines (activations first, then completions).
  for (const obj of newlyActivated) {
    addLine(store, `* New journal entry: ${obj.title}`, C.STAT_COLOR);
  }
  for (const obj of newlyCompleted) {
    addLine(store, `* Journal complete: ${obj.title}`, C.STAT_COLOR);
  }

  return { activated: newlyActivated, completed: newlyCompleted };
}
