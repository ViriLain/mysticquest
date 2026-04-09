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

const simpleFixture = (id: string, trigger: ObjectiveDef['trigger']): ObjectiveDef[] => [
  {
    id,
    title: `Test ${id}`,
    hint: '...',
    trigger,
    completion: { type: 'key_items_collected', items: ['never'] },
    completion_text: '...',
  },
];

describe('trigger types', () => {
  it('activates on entered_room', () => {
    const store = objectivesTestStore();
    notifyObjectiveEvent(
      store,
      { type: 'entered_room', room: 'manor_library' },
      simpleFixture('room_objective', { type: 'entered_room', room: 'manor_library' }),
    );
    expect(store.player!.objectives.room_objective).toBe('active');
  });

  it('activates on searched_room', () => {
    const store = objectivesTestStore();
    notifyObjectiveEvent(
      store,
      { type: 'searched_room', room: 'manor_dome' },
      simpleFixture('search_objective', { type: 'searched_room', room: 'manor_dome' }),
    );
    expect(store.player!.objectives.search_objective).toBe('active');
  });

  it('activates on took_item', () => {
    const store = objectivesTestStore();
    notifyObjectiveEvent(
      store,
      { type: 'took_item', item: 'dark_crown' },
      simpleFixture('crown_objective', { type: 'took_item', item: 'dark_crown' }),
    );
    expect(store.player!.objectives.crown_objective).toBe('active');
  });

  it('activates on defeated_enemy', () => {
    const store = objectivesTestStore();
    notifyObjectiveEvent(
      store,
      { type: 'defeated_enemy', enemy: 'cellar_shade' },
      simpleFixture('boss_objective', { type: 'defeated_enemy', enemy: 'cellar_shade' }),
    );
    expect(store.player!.objectives.boss_objective).toBe('active');
  });

  it('is idempotent — firing the same trigger twice is a no-op on the second call', () => {
    const store = objectivesTestStore();
    const fx = simpleFixture('idempotent', { type: 'entered_room', room: 'a' });
    notifyObjectiveEvent(store, { type: 'entered_room', room: 'a' }, fx);
    const firstLines = store.typewriterQueue.length;
    notifyObjectiveEvent(store, { type: 'entered_room', room: 'a' }, fx);
    expect(store.player!.objectives.idempotent).toBe('active');
    expect(store.typewriterQueue.length).toBe(firstLines); // no extra notifications
  });

  it('does not fire when the trigger field does not match', () => {
    const store = objectivesTestStore();
    notifyObjectiveEvent(
      store,
      { type: 'talked_to_npc', npc: 'dusty' },
      simpleFixture('wrong_npc', { type: 'talked_to_npc', npc: 'whiskers' }),
    );
    expect(store.player!.objectives.wrong_npc).toBeUndefined();
  });
});

describe('completion: enemy_defeated', () => {
  it('completes when the enemy is marked dead in any room', () => {
    const store = objectivesTestStore();
    const room = store.world!.rooms.manor_entry;
    room._dead_enemies = { cellar_shade: true };
    const fx: ObjectiveDef[] = [{
      id: 'hero_path',
      title: 'Hero',
      hint: 'Begin the fight.',
      trigger: { type: 'entered_room', room: 'manor_entry' },
      completion: { type: 'enemy_defeated', enemy: 'cellar_shade' },
      completion_text: 'Done.',
    }];
    notifyObjectiveEvent(store, { type: 'entered_room', room: 'manor_entry' }, fx);
    expect(store.player!.objectives.hero_path).toBe('complete');
  });
});

describe('completion: visited_rooms_percent', () => {
  it('completes when visited non-hidden non-dungeon rooms meet the threshold', () => {
    const store = objectivesTestStore();
    const nonHidden = Object.keys(store.world!.rooms).filter(
      id => store.world!.rooms[id].region !== 'hidden' && !id.startsWith('dng_'),
    );
    const threshold = Math.ceil(nonHidden.length * 0.8);
    for (const id of nonHidden.slice(0, threshold)) {
      store.player!.visitedRooms[id] = true;
    }
    const fx: ObjectiveDef[] = [{
      id: 'long_road',
      title: 'Long Road',
      hint: '...',
      trigger: { type: 'entered_room', room: nonHidden[0] },
      completion: { type: 'visited_rooms_percent', percent: 80 },
      completion_text: '...',
    }];
    notifyObjectiveEvent(
      store,
      { type: 'entered_room', room: nonHidden[0] },
      fx,
    );
    expect(store.player!.objectives.long_road).toBe('complete');
  });

  it('does not complete below the threshold', () => {
    const store = objectivesTestStore();
    store.player!.visitedRooms = { manor_entry: true }; // only 1 room
    const fx: ObjectiveDef[] = [{
      id: 'long_road',
      title: 'Long Road',
      hint: '...',
      trigger: { type: 'entered_room', room: 'manor_entry' },
      completion: { type: 'visited_rooms_percent', percent: 80 },
      completion_text: '...',
    }];
    notifyObjectiveEvent(store, { type: 'entered_room', room: 'manor_entry' }, fx);
    expect(store.player!.objectives.long_road).toBe('active');
  });
});

describe('completion: used_items_in_room', () => {
  it('completes when all listed items were used in the given room', () => {
    const store = objectivesTestStore();
    store.player!.usedItemsInRoom = {
      hidden_diner: {
        red_mushroom: true,
        grey_mushroom: true,
        green_mushroom: true,
        orange_mushroom: true,
      },
    };
    const fx: ObjectiveDef[] = [{
      id: 'enlightened',
      title: 'Enlightened',
      hint: '...',
      trigger: { type: 'entered_room', room: 'hidden_diner' },
      completion: {
        type: 'used_items_in_room',
        room: 'hidden_diner',
        items: ['red_mushroom', 'grey_mushroom', 'green_mushroom', 'orange_mushroom'],
      },
      completion_text: '...',
    }];
    notifyObjectiveEvent(store, { type: 'entered_room', room: 'hidden_diner' }, fx);
    expect(store.player!.objectives.enlightened).toBe('complete');
  });
});
