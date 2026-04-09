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

    const result = notifyObjectiveEvent(
      store,
      { type: 'talked_to_npc', npc: 'whiskers' },
      whiskersFixture,
    );

    // State mutation
    expect(store.player!.objectives.the_diner_mystery).toBe('active');

    // Notification line written to typewriterQueue
    const lines = store.typewriterQueue.map(l => l.text);
    expect(lines).toContain('* New journal entry: The Diner Mystery');

    // Return value
    expect(result.activated).toEqual([whiskersFixture[0]]);
    expect(result.completed).toEqual([]);
  });
});

const mushroomFixture: ObjectiveDef[] = [
  {
    id: 'the_diner_mystery',
    title: 'The Diner Mystery',
    hint: 'Sir Whiskers mentioned something about the diner.',
    trigger: { type: 'talked_to_npc', npc: 'whiskers' },
    completion: {
      type: 'key_items_collected',
      items: ['red_mushroom', 'grey_mushroom', 'green_mushroom', 'orange_mushroom'],
    },
    completion_text: 'You gathered all four strange mushrooms.',
  },
];

describe('completion: key_items_collected', () => {
  it('does not complete if items are missing', () => {
    const store = objectivesTestStore();
    notifyObjectiveEvent(
      store,
      { type: 'talked_to_npc', npc: 'whiskers' },
      mushroomFixture,
    );
    expect(store.player!.objectives.the_diner_mystery).toBe('active');
  });

  it('completes when all items are in inventory', () => {
    const store = objectivesTestStore();
    store.player!.inventory = {
      red_mushroom: 1,
      grey_mushroom: 1,
      green_mushroom: 1,
      orange_mushroom: 1,
    };
    notifyObjectiveEvent(
      store,
      { type: 'talked_to_npc', npc: 'whiskers' },
      mushroomFixture,
    );
    expect(store.player!.objectives.the_diner_mystery).toBe('complete');
  });

  it('completes when items are in keyItems instead of inventory', () => {
    const store = objectivesTestStore();
    store.player!.keyItems = {
      red_mushroom: true,
      grey_mushroom: true,
      green_mushroom: true,
      orange_mushroom: true,
    };
    notifyObjectiveEvent(
      store,
      { type: 'talked_to_npc', npc: 'whiskers' },
      mushroomFixture,
    );
    expect(store.player!.objectives.the_diner_mystery).toBe('complete');
  });

  it('writes activation and completion notification lines in order', () => {
    const store = objectivesTestStore();
    store.player!.inventory = {
      red_mushroom: 1,
      grey_mushroom: 1,
      green_mushroom: 1,
      orange_mushroom: 1,
    };
    const linesBefore = store.typewriterQueue.length;
    const result = notifyObjectiveEvent(
      store,
      { type: 'talked_to_npc', npc: 'whiskers' },
      mushroomFixture,
    );
    const newLines = store.typewriterQueue.slice(linesBefore).map(l => l.text);
    expect(newLines).toEqual([
      '* New journal entry: The Diner Mystery',
      '* Journal complete: The Diner Mystery',
    ]);
    // Return value also reflects the transitions
    expect(result.activated).toEqual([mushroomFixture[0]]);
    expect(result.completed).toEqual([mushroomFixture[0]]);
  });
});
