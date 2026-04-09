import { describe, expect, it } from 'vitest';
import { notifyObjectiveEvent } from '../../src/engine/objectives';
import { createInitialStore } from '../../src/engine/gameReducer';
import { createPlayer } from '../../src/engine/player';
import { createStoryWorld } from '../../src/engine/world';
import type { GameStore, ObjectiveDef } from '../../src/engine/types';

/**
 * Shared test store. Mirrors the pattern in test/unit/info.test.ts —
 * createInitialStore() gives us a boot-state store; we wire a player and
 * world manually so the unit tests don't care about menu/boot transitions.
 */
function objectivesTestStore(): GameStore {
  const store = createInitialStore();
  store.player = createPlayer();
  store.world = createStoryWorld();
  return store;
}

const whiskersFixture: ObjectiveDef[] = [
  {
    id: 'the_diner_mystery',
    title: 'The Diner Mystery',
    hint: 'Sir Whiskers mentioned something about the diner.',
    trigger: { type: 'talked_to_npc', npc: 'whiskers' },
    completion: { type: 'key_items_collected', items: ['red_mushroom'] },
    completion_text: 'You gathered the mushroom.',
  },
];

describe('notifyObjectiveEvent', () => {
  it('activates an objective when its trigger fires', () => {
    const store = objectivesTestStore();
    expect(store.player!.objectives.the_diner_mystery).toBeUndefined();

    notifyObjectiveEvent(
      store,
      { type: 'talked_to_npc', npc: 'whiskers' },
      whiskersFixture,
    );

    expect(store.player!.objectives.the_diner_mystery).toBe('active');
  });
});
