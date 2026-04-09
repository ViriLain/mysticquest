import objectivesData from '../data/objectives.json';
import * as C from './constants';
import { addLine } from './output';
import type {
  GameStore,
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

  // Track which objectives transitioned in this call so we can write
  // notification lines in order (activations, then completions).
  const newlyActivated: ObjectiveDef[] = [];

  // Step 1: activate any untriggered objectives whose trigger matches.
  for (const obj of objectives) {
    if (player.objectives[obj.id] !== undefined) continue;
    if (triggerMatches(obj.trigger, event)) {
      player.objectives[obj.id] = 'active';
      newlyActivated.push(obj);
    }
  }

  // Notification lines. (Completion logic and chaining come in later tasks.)
  for (const obj of newlyActivated) {
    addLine(store, `* New journal entry: ${obj.title}`, C.STAT_COLOR);
  }

  return { activated: newlyActivated, completed: [] };
}
